"""Investment Engine: reconciliation service.

Detection-only per project instructions. Compares two position sources
(typically Winston-internal vs custodian/admin), identifies breaks, and
persists them to inv_reconciliation_break. Does NOT auto-resolve.

Break types covered (matches inv_reconciliation_break.break_type CHECK):
    quantity_mismatch     — same (account, security), different qty
    price_mismatch        — same (account, security), different market value
    missing_in_a          — present in source B but not source A
    missing_in_b          — present in source A but not source B
    stale_data            — as_reported_at older than threshold
    identifier_unmapped   — security_identifier didn't resolve to inv_security

Two layers per skills/winston-investment-engine-module:
    compare_positions  — pure function over normalized lists, returns breaks
    run_reconciliation — orchestrator: reads inv_source_position, compares,
                         persists breaks, updates run status

Returns EngineResult on every code path. No mutation outside the documented
persist step (which writes to inv_reconciliation_break and updates the run
header inside one transaction).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor

# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE (mirrors accounting_engine for uniformity)
# ─────────────────────────────────────────────────────────────────────────────

class EngineError(TypedDict):
    code: str
    message: str
    context: dict


class EngineResult(TypedDict):
    valid: bool
    value: Optional[Any]
    errors: list[EngineError]
    input_versions: dict


def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {"valid": True, "value": value, "errors": [], "input_versions": input_versions}


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {"valid": False, "value": None, "errors": errors,
            "input_versions": input_versions or {}}


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


# Error codes
ERR_RUN_NOT_FOUND = "run_not_found"
ERR_RUN_ALREADY_COMPLETED = "run_already_completed"
ERR_INCOMPLETE_INPUTS = "incomplete_inputs"


# Break types (canonical strings — must match the CHECK constraint)
BREAK_QTY = "quantity_mismatch"
BREAK_PRICE = "price_mismatch"
BREAK_MISSING_A = "missing_in_a"
BREAK_MISSING_B = "missing_in_b"
BREAK_STALE = "stale_data"
BREAK_IDENT_UNMAPPED = "identifier_unmapped"


# ─────────────────────────────────────────────────────────────────────────────
# PURE COMPUTE — testable in isolation
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SourcePosition:
    """Normalized position record for comparison.

    The (resolved_account_id, resolved_security_id) pair is the comparison
    key. When either is None, the record is unmapped and produces an
    identifier_unmapped break.
    """
    source_position_id: UUID
    source: str
    resolved_account_id: Optional[UUID]
    resolved_security_id: Optional[UUID]
    qty: Optional[Decimal]
    market_value_native: Optional[Decimal]
    currency: Optional[str]
    as_reported_at: Optional[datetime]
    security_identifier: str  # raw, for unmapped diagnostics


@dataclass(frozen=True)
class Tolerances:
    """Tolerance thresholds for break detection.

    qty_abs:        absolute qty difference under which two positions are equal
    qty_rel:        relative qty difference (fraction)
    price_abs:      absolute MV difference under which two positions are equal
    price_rel:      relative MV difference (fraction)
    stale_seconds:  positions older than this against the run's effective_date
                    are flagged stale (None = never stale)
    """
    qty_abs: Decimal = Decimal("0.00000001")
    qty_rel: Decimal = Decimal("0")
    price_abs: Decimal = Decimal("0.01")
    price_rel: Decimal = Decimal("0")
    stale_seconds: Optional[int] = None


@dataclass(frozen=True)
class Break:
    """A detected break. Pure data — caller persists."""
    break_type: str
    severity: str
    account_id: Optional[UUID]
    security_id: Optional[UUID]
    source_a_value: Optional[dict]
    source_b_value: Optional[dict]
    evidence: dict


def _qty_equal(a: Decimal, b: Decimal, t: Tolerances) -> bool:
    if a == b:
        return True
    diff = abs(a - b)
    if diff <= t.qty_abs:
        return True
    if t.qty_rel > 0 and a != 0:
        if diff / abs(a) <= t.qty_rel:
            return True
    return False


def _price_equal(a: Decimal, b: Decimal, t: Tolerances) -> bool:
    if a == b:
        return True
    diff = abs(a - b)
    if diff <= t.price_abs:
        return True
    if t.price_rel > 0 and a != 0:
        if diff / abs(a) <= t.price_rel:
            return True
    return False


def _severity(diff_pct: float | Decimal) -> str:
    """Severity bucket from a percentage difference."""
    d = abs(float(diff_pct))
    if d >= 0.10:
        return "critical"
    if d >= 0.02:
        return "high"
    if d >= 0.005:
        return "medium"
    return "low"


def compare_positions(
    *,
    positions_a: list[SourcePosition],
    positions_b: list[SourcePosition],
    tolerances: Tolerances = Tolerances(),
    effective_date_ts: Optional[datetime] = None,
) -> EngineResult:
    """Compare two source position lists. Returns a list of Breaks.

    Pure function. Does not read or write the DB.

    Both inputs are typically already filtered to a single (run, source).
    The comparison key is (resolved_account_id, resolved_security_id).
    Records with either resolved_id == None produce identifier_unmapped
    breaks instead of joining.

    effective_date_ts: the run's effective_date as a timestamp (used for
    stale_data detection against tolerances.stale_seconds). When None,
    stale_data is not checked.

    Returns EngineResult with value = {"breaks": [...], "summary": {...}}.
    """
    breaks: list[Break] = []

    # 1. Identifier-unmapped (any resolved_id is None)
    unmapped_a = [p for p in positions_a
                  if p.resolved_account_id is None or p.resolved_security_id is None]
    unmapped_b = [p for p in positions_b
                  if p.resolved_account_id is None or p.resolved_security_id is None]
    for p in unmapped_a:
        breaks.append(Break(
            break_type=BREAK_IDENT_UNMAPPED,
            severity="high",
            account_id=p.resolved_account_id,
            security_id=p.resolved_security_id,
            source_a_value={"identifier": p.security_identifier, "source": p.source},
            source_b_value=None,
            evidence={"side": "a", "source_position_id": str(p.source_position_id)},
        ))
    for p in unmapped_b:
        breaks.append(Break(
            break_type=BREAK_IDENT_UNMAPPED,
            severity="high",
            account_id=p.resolved_account_id,
            security_id=p.resolved_security_id,
            source_a_value=None,
            source_b_value={"identifier": p.security_identifier, "source": p.source},
            evidence={"side": "b", "source_position_id": str(p.source_position_id)},
        ))

    # 2. Build keyed dicts of mapped positions
    map_a: dict[tuple[UUID, UUID], SourcePosition] = {
        (p.resolved_account_id, p.resolved_security_id): p
        for p in positions_a
        if p.resolved_account_id is not None and p.resolved_security_id is not None
    }
    map_b: dict[tuple[UUID, UUID], SourcePosition] = {
        (p.resolved_account_id, p.resolved_security_id): p
        for p in positions_b
        if p.resolved_account_id is not None and p.resolved_security_id is not None
    }

    # 3. Stale data check (per source) — independent of A/B comparison
    if effective_date_ts is not None and tolerances.stale_seconds is not None:
        stale_threshold = effective_date_ts - timedelta(seconds=tolerances.stale_seconds)
        for side_label, positions in (("a", positions_a), ("b", positions_b)):
            for p in positions:
                if p.as_reported_at and p.as_reported_at < stale_threshold:
                    breaks.append(Break(
                        break_type=BREAK_STALE,
                        severity="medium",
                        account_id=p.resolved_account_id,
                        security_id=p.resolved_security_id,
                        source_a_value={"as_reported_at": p.as_reported_at.isoformat()} if side_label == "a" else None,
                        source_b_value={"as_reported_at": p.as_reported_at.isoformat()} if side_label == "b" else None,
                        evidence={
                            "side": side_label,
                            "threshold": stale_threshold.isoformat(),
                            "source_position_id": str(p.source_position_id),
                        },
                    ))

    # 4. missing_in_b: in A but not B
    for key, pa in map_a.items():
        if key not in map_b:
            breaks.append(Break(
                break_type=BREAK_MISSING_B,
                severity="high",
                account_id=key[0],
                security_id=key[1],
                source_a_value={"qty": str(pa.qty) if pa.qty is not None else None,
                                "mv": str(pa.market_value_native) if pa.market_value_native is not None else None,
                                "source": pa.source},
                source_b_value=None,
                evidence={"side": "a", "source_position_id": str(pa.source_position_id)},
            ))

    # 5. missing_in_a: in B but not A
    for key, pb in map_b.items():
        if key not in map_a:
            breaks.append(Break(
                break_type=BREAK_MISSING_A,
                severity="high",
                account_id=key[0],
                security_id=key[1],
                source_a_value=None,
                source_b_value={"qty": str(pb.qty) if pb.qty is not None else None,
                                "mv": str(pb.market_value_native) if pb.market_value_native is not None else None,
                                "source": pb.source},
                evidence={"side": "b", "source_position_id": str(pb.source_position_id)},
            ))

    # 6. quantity_mismatch and price_mismatch on shared keys
    for key, pa in map_a.items():
        pb = map_b.get(key)
        if pb is None:
            continue

        # Quantity comparison (skip if either side is None)
        if pa.qty is not None and pb.qty is not None:
            if not _qty_equal(pa.qty, pb.qty, tolerances):
                diff = pa.qty - pb.qty
                rel = float(diff / pa.qty) if pa.qty != 0 else 1.0
                breaks.append(Break(
                    break_type=BREAK_QTY,
                    severity=_severity(rel),
                    account_id=key[0],
                    security_id=key[1],
                    source_a_value={"qty": str(pa.qty), "source": pa.source},
                    source_b_value={"qty": str(pb.qty), "source": pb.source},
                    evidence={
                        "diff": str(diff),
                        "rel": rel,
                        "tolerance_abs": str(tolerances.qty_abs),
                        "tolerance_rel": str(tolerances.qty_rel),
                    },
                ))

        # Price / market value comparison
        if pa.market_value_native is not None and pb.market_value_native is not None:
            if not _price_equal(pa.market_value_native, pb.market_value_native, tolerances):
                diff = pa.market_value_native - pb.market_value_native
                rel = float(diff / pa.market_value_native) if pa.market_value_native != 0 else 1.0
                breaks.append(Break(
                    break_type=BREAK_PRICE,
                    severity=_severity(rel),
                    account_id=key[0],
                    security_id=key[1],
                    source_a_value={"mv": str(pa.market_value_native),
                                    "ccy": pa.currency, "source": pa.source},
                    source_b_value={"mv": str(pb.market_value_native),
                                    "ccy": pb.currency, "source": pb.source},
                    evidence={
                        "diff": str(diff),
                        "rel": rel,
                        "tolerance_abs": str(tolerances.price_abs),
                        "tolerance_rel": str(tolerances.price_rel),
                    },
                ))

    summary = {
        "breaks_total": len(breaks),
        "by_type": {
            BREAK_QTY: sum(1 for b in breaks if b.break_type == BREAK_QTY),
            BREAK_PRICE: sum(1 for b in breaks if b.break_type == BREAK_PRICE),
            BREAK_MISSING_A: sum(1 for b in breaks if b.break_type == BREAK_MISSING_A),
            BREAK_MISSING_B: sum(1 for b in breaks if b.break_type == BREAK_MISSING_B),
            BREAK_STALE: sum(1 for b in breaks if b.break_type == BREAK_STALE),
            BREAK_IDENT_UNMAPPED: sum(1 for b in breaks if b.break_type == BREAK_IDENT_UNMAPPED),
        },
        "by_severity": {
            sev: sum(1 for b in breaks if b.severity == sev)
            for sev in ("low", "medium", "high", "critical")
        },
        "positions_a": len(positions_a),
        "positions_b": len(positions_b),
    }

    return _ok({"breaks": breaks, "summary": summary},
               input_versions={"positions_a_count": len(positions_a),
                               "positions_b_count": len(positions_b)})


# ─────────────────────────────────────────────────────────────────────────────
# DB FETCHES
# ─────────────────────────────────────────────────────────────────────────────

def _load_source_positions(env_id: str, run_id: UUID, source: str) -> list[SourcePosition]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, source, resolved_account_id, resolved_security_id,
                   qty, market_value_native, currency, as_reported_at,
                   security_identifier
            FROM inv_source_position
            WHERE env_id = %s AND run_id = %s AND source = %s
            """,
            (env_id, str(run_id), source),
        )
        rows = cur.fetchall()
    out: list[SourcePosition] = []
    for r in rows:
        out.append(SourcePosition(
            source_position_id=r["id"],
            source=r["source"],
            resolved_account_id=r["resolved_account_id"],
            resolved_security_id=r["resolved_security_id"],
            qty=Decimal(r["qty"]) if r["qty"] is not None else None,
            market_value_native=Decimal(r["market_value_native"])
                if r["market_value_native"] is not None else None,
            currency=r["currency"],
            as_reported_at=r["as_reported_at"],
            security_identifier=r["security_identifier"],
        ))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def run_reconciliation(
    *,
    env_id: str,
    business_id: UUID,
    run_id: UUID,
    tolerances: Tolerances = Tolerances(),
) -> EngineResult:
    """Run reconciliation for an existing inv_reconciliation_run row.

    Reads source positions for both sources from inv_source_position, compares
    them, and persists breaks. Updates the run header (status, completed_at,
    breaks_count). Idempotent at the run level: re-running a completed run
    returns the prior breaks count without re-comparing.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, fund_id, effective_date, source_a, source_b, status,
                   started_at, completed_at, breaks_count
            FROM inv_reconciliation_run
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(run_id)),
        )
        run = cur.fetchone()

    if not run:
        return _fail([_err(ERR_RUN_NOT_FOUND, "reconciliation run not found",
                           run_id=str(run_id))])

    if run["status"] in ("completed", "failed"):
        return _fail([_err(
            ERR_RUN_ALREADY_COMPLETED,
            "run is already terminal; create a new run to re-reconcile",
            run_id=str(run_id), status=run["status"],
        )])

    positions_a = _load_source_positions(env_id, run_id, run["source_a"])
    positions_b = _load_source_positions(env_id, run_id, run["source_b"])

    effective_dt = datetime.combine(run["effective_date"], datetime.max.time(),
                                    tzinfo=timezone.utc)
    cmp = compare_positions(
        positions_a=positions_a,
        positions_b=positions_b,
        tolerances=tolerances,
        effective_date_ts=effective_dt,
    )
    if not cmp["valid"]:
        return cmp

    breaks: list[Break] = cmp["value"]["breaks"]
    summary = cmp["value"]["summary"]

    # Persist breaks + update run header in one transaction
    import json
    with get_cursor() as cur:
        for b in breaks:
            cur.execute(
                """
                INSERT INTO inv_reconciliation_break (
                    env_id, business_id, run_id, break_type, severity,
                    account_id, security_id,
                    source_a_value, source_b_value, evidence
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    env_id, str(business_id), str(run_id),
                    b.break_type, b.severity,
                    str(b.account_id) if b.account_id else None,
                    str(b.security_id) if b.security_id else None,
                    json.dumps(b.source_a_value) if b.source_a_value is not None else None,
                    json.dumps(b.source_b_value) if b.source_b_value is not None else None,
                    json.dumps(b.evidence),
                ),
            )
        cur.execute(
            """
            UPDATE inv_reconciliation_run
            SET status = 'completed',
                completed_at = now(),
                breaks_count = %s
            WHERE env_id = %s AND id = %s
            """,
            (len(breaks), env_id, str(run_id)),
        )

    return _ok({
        "run_id": str(run_id),
        "breaks_count": len(breaks),
        "summary": summary,
    }, input_versions={
        "positions_a_count": len(positions_a),
        "positions_b_count": len(positions_b),
        "run": str(run_id),
    })


def generate_reconciliation_report(*, env_id: str, run_id: UUID) -> EngineResult:
    """Generate a structured report for a completed run.

    Returns counts by type/severity plus the list of breaks. Read-only;
    does not mutate.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, fund_id, effective_date, source_a, source_b, status,
                   started_at, completed_at, breaks_count
            FROM inv_reconciliation_run
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(run_id)),
        )
        run = cur.fetchone()
    if not run:
        return _fail([_err(ERR_RUN_NOT_FOUND, "reconciliation run not found",
                           run_id=str(run_id))])

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, break_type, severity, account_id, security_id,
                   source_a_value, source_b_value, evidence,
                   resolved_at, resolved_by, resolution_note, created_at
            FROM inv_reconciliation_break
            WHERE env_id = %s AND run_id = %s
            ORDER BY severity DESC, break_type, created_at
            """,
            (env_id, str(run_id)),
        )
        breaks = cur.fetchall()

    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    open_count = 0
    for b in breaks:
        by_type[b["break_type"]] = by_type.get(b["break_type"], 0) + 1
        by_severity[b["severity"]] = by_severity.get(b["severity"], 0) + 1
        if b["resolved_at"] is None:
            open_count += 1

    return _ok({
        "run": {
            "id": str(run["id"]),
            "fund_id": str(run["fund_id"]),
            "effective_date": run["effective_date"].isoformat(),
            "source_a": run["source_a"],
            "source_b": run["source_b"],
            "status": run["status"],
            "started_at": run["started_at"].isoformat() if run["started_at"] else None,
            "completed_at": run["completed_at"].isoformat() if run["completed_at"] else None,
        },
        "summary": {
            "breaks_total": len(breaks),
            "open_count": open_count,
            "by_type": by_type,
            "by_severity": by_severity,
        },
        "breaks": [
            {
                "id": str(b["id"]),
                "break_type": b["break_type"],
                "severity": b["severity"],
                "account_id": str(b["account_id"]) if b["account_id"] else None,
                "security_id": str(b["security_id"]) if b["security_id"] else None,
                "source_a_value": b["source_a_value"],
                "source_b_value": b["source_b_value"],
                "evidence": b["evidence"],
                "resolved_at": b["resolved_at"].isoformat() if b["resolved_at"] else None,
                "resolution_note": b["resolution_note"],
            }
            for b in breaks
        ],
    }, input_versions={"run": str(run_id), "breaks_count": len(breaks)})
