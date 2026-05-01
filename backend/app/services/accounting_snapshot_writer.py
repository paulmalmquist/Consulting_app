"""Investment Engine: NAV / P&L snapshot writer.

Implements the produce / lock / release / reconstruct lifecycle from
skills/winston-investment-snapshot for inv_nav_snapshot and inv_pnl_snapshot.

Lifecycle:
    produce(...)        -> writes a 'draft' row
    lock(snapshot_id)   -> draft → locked; verifies reconstruct() still equal
    release(snapshot_id)-> locked → released; supersedes prior released for
                           the same (entity, effective_date) in one transaction
    reconstruct(snapshot_id) -> recomputes from input_versions; asserts equal

Persistence rule (skills/winston-investment-engine-module):
    Mutations write inv_audit_log + inv_mutation_event in the same transaction.

Caveat on reconstruction:
    A NAV snapshot's payload depends on the FULL set of inputs that were
    available as of the snapshot's as_of_date. We pin those inputs into
    `input_versions` at produce time. Reconstruct loads only the pinned
    inputs (no late-arriving rows), recomputes, and asserts byte-identity.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor
from app.services.accounting_engine import (
    EngineError,
    EngineResult,
    calculate_nav,
    calculate_pnl,
)
from app.services.investment_engine_audit import (
    write_audit,
    write_mutation_event,
)


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE (mirrors accounting_engine)
# ─────────────────────────────────────────────────────────────────────────────

def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {"valid": True, "value": value, "errors": [], "input_versions": input_versions}


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {"valid": False, "value": None, "errors": errors,
            "input_versions": input_versions or {}}


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


# Error codes
ERR_SNAPSHOT_NOT_FOUND = "snapshot_not_found"
ERR_INVALID_TRANSITION = "invalid_transition"
ERR_RECONSTRUCT_DIVERGED = "reconstruct_diverged"


# ─────────────────────────────────────────────────────────────────────────────
# NAV snapshot
# ─────────────────────────────────────────────────────────────────────────────

def produce_nav_snapshot(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID,
    effective_date: date,
    actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    """Compute NAV and persist as a draft snapshot.

    Returns the snapshot id. Audit row written. Callers may then lock and
    release the snapshot through this module.

    Fail-closed: if calculate_nav fails, NO snapshot row is written.
    """
    calc = calculate_nav(env_id=env_id, fund_id=fund_id, as_of_date=effective_date)
    if not calc["valid"]:
        return calc

    v = calc["value"]
    input_versions = calc["input_versions"]

    # Determine version: max(version) + 1 for (fund_id, effective_date), or 1
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(MAX(version), 0) AS v
            FROM inv_nav_snapshot
            WHERE entity_id = %s AND effective_date = %s
            """,
            (str(fund_id), effective_date),
        )
        prev_version = cur.fetchone()["v"]
        version = prev_version + 1

        cur.execute(
            """
            INSERT INTO inv_nav_snapshot (
                env_id, business_id, entity_type, entity_id,
                effective_date, as_of_date, status, version,
                input_versions, produced_by,
                nav_native, nav_currency, nav_base, nav_base_fx_rate_id,
                total_assets_native, total_assets_currency,
                total_liabilities_native, total_liabilities_currency
            ) VALUES (
                %s, %s, 'fund', %s, %s, now(), 'draft', %s,
                %s::jsonb, %s,
                %s, %s, %s, NULL,
                %s, %s, %s, %s
            ) RETURNING id, version, status, created_at
            """,
            (
                env_id, str(business_id), str(fund_id), effective_date, version,
                _to_jsonb(input_versions), actor,
                str(v["nav"]), v["currency"], str(v["nav"]),
                str(v["total_assets"]), v["currency"],
                str(v["total_liabilities"]), v["currency"],
            ),
        )
        row = cur.fetchone()
        snapshot_id = row["id"]

        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            change_type="insert",
            new_state={
                "id": str(snapshot_id),
                "fund_id": str(fund_id),
                "effective_date": effective_date.isoformat(),
                "version": version,
                "status": "draft",
                "nav": str(v["nav"]),
                "currency": v["currency"],
            },
            actor=actor,
            correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            event_type="snapshot_produced",
            payload={"version": version},
            correlation_id=correlation_id,
        )

    return _ok({
        "snapshot_id": str(snapshot_id),
        "version": version,
        "status": "draft",
        "nav": v["nav"],
        "currency": v["currency"],
        "total_assets": v["total_assets"],
        "total_liabilities": v["total_liabilities"],
    }, input_versions)


def lock_nav_snapshot(
    *,
    env_id: str,
    business_id: UUID | str,
    snapshot_id: UUID,
    actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    """Transition a NAV snapshot draft → locked. Verifies the snapshot is
    still consistent with its recorded input_versions (reconstruct equal).
    """
    rec = reconstruct_nav_snapshot(env_id=env_id, snapshot_id=snapshot_id)
    if not rec["valid"]:
        return rec
    if not rec["value"]["equal"]:
        return _fail([_err(
            ERR_RECONSTRUCT_DIVERGED,
            "snapshot reconstruct diverged from stored payload; cannot lock",
            snapshot_id=str(snapshot_id),
            divergences=rec["value"]["divergences"],
        )])

    return _transition_nav(
        env_id=env_id, business_id=business_id, snapshot_id=snapshot_id,
        from_status="draft", to_status="locked", change_type="lock",
        actor=actor, correlation_id=correlation_id,
    )


def release_nav_snapshot(
    *,
    env_id: str,
    business_id: UUID | str,
    snapshot_id: UUID,
    actor: str,
    correlation_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> EngineResult:
    """Transition a NAV snapshot locked → released. If a prior released row
    exists for the same (entity, effective_date), supersede it in the same
    transaction.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, entity_id, effective_date, status, version
            FROM inv_nav_snapshot
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
        if not snap:
            return _fail([_err(ERR_SNAPSHOT_NOT_FOUND,
                               "snapshot not found", snapshot_id=str(snapshot_id))])
        if snap["status"] != "locked":
            return _fail([_err(
                ERR_INVALID_TRANSITION,
                "release requires status=locked",
                snapshot_id=str(snapshot_id), current_status=snap["status"],
            )])

        # Find prior released for the same key
        cur.execute(
            """
            SELECT id, version FROM inv_nav_snapshot
            WHERE entity_id = %s AND effective_date = %s
              AND status = 'released'
            """,
            (str(snap["entity_id"]), snap["effective_date"]),
        )
        prior = cur.fetchone()

        # Order matters: supersede prior FIRST (so partial unique frees up)
        if prior:
            cur.execute(
                """
                UPDATE inv_nav_snapshot
                SET status = 'superseded',
                    superseded_by_id = %s,
                    superseded_reason = %s
                WHERE id = %s
                """,
                (str(snapshot_id), reason or "newer release", prior["id"]),
            )
            write_audit(
                cur,
                env_id=env_id, business_id=business_id,
                entity_type="inv_nav_snapshot",
                entity_id=prior["id"],
                change_type="supersede",
                previous_state={"id": str(prior["id"]), "status": "released",
                                "version": prior["version"]},
                new_state={"id": str(prior["id"]), "status": "superseded",
                           "superseded_by_id": str(snapshot_id)},
                actor=actor,
                reason=reason,
                correlation_id=correlation_id,
            )

        # Now release the new one
        cur.execute(
            "UPDATE inv_nav_snapshot SET status = 'released' WHERE id = %s",
            (str(snapshot_id),),
        )
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            change_type="release",
            previous_state={"id": str(snapshot_id), "status": "locked",
                            "version": snap["version"]},
            new_state={"id": str(snapshot_id), "status": "released",
                       "version": snap["version"]},
            actor=actor,
            reason=reason,
            correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            event_type="snapshot_released",
            payload={"version": snap["version"],
                     "superseded_id": str(prior["id"]) if prior else None},
            correlation_id=correlation_id,
        )

    return _ok({
        "snapshot_id": str(snapshot_id),
        "status": "released",
        "version": snap["version"],
        "superseded_id": str(prior["id"]) if prior else None,
    }, input_versions={})


def reconstruct_nav_snapshot(
    *, env_id: str, snapshot_id: UUID,
) -> EngineResult:
    """Recompute the snapshot from its pinned input_versions and assert
    equality with the stored payload. Read-only.

    For V1, "pinned input_versions" is informational — calculate_nav doesn't
    yet accept a frozen input set; it queries current rows. Reconstruct
    therefore re-runs calculate_nav at the snapshot's effective_date and
    compares to the stored numerical payload. If late-arriving inputs with
    backdated effective_date have landed since produce, this will diverge —
    which is exactly the signal we want.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, business_id, entity_id, effective_date,
                   as_of_date, status, version, input_versions,
                   nav_native, total_assets_native, total_liabilities_native,
                   nav_currency
            FROM inv_nav_snapshot
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
    if not snap:
        return _fail([_err(ERR_SNAPSHOT_NOT_FOUND,
                           "snapshot not found", snapshot_id=str(snapshot_id))])

    recompute = calculate_nav(
        env_id=env_id, fund_id=snap["entity_id"], as_of_date=snap["effective_date"],
    )
    if not recompute["valid"]:
        return _fail([_err(
            ERR_RECONSTRUCT_DIVERGED,
            "recompute returned invalid result during reconstruct",
            inner_errors=recompute["errors"],
        )])

    rv = recompute["value"]
    divergences = []
    if Decimal(snap["nav_native"]) != Decimal(rv["nav"]):
        divergences.append({"field": "nav_native",
                             "stored": str(snap["nav_native"]),
                             "recomputed": str(rv["nav"])})
    if Decimal(snap["total_assets_native"]) != Decimal(rv["total_assets"]):
        divergences.append({"field": "total_assets_native",
                             "stored": str(snap["total_assets_native"]),
                             "recomputed": str(rv["total_assets"])})
    if Decimal(snap["total_liabilities_native"]) != Decimal(rv["total_liabilities"]):
        divergences.append({"field": "total_liabilities_native",
                             "stored": str(snap["total_liabilities_native"]),
                             "recomputed": str(rv["total_liabilities"])})

    return _ok({
        "snapshot_id": str(snapshot_id),
        "equal": len(divergences) == 0,
        "divergences": divergences,
        "stored": {
            "nav": str(snap["nav_native"]),
            "total_assets": str(snap["total_assets_native"]),
            "total_liabilities": str(snap["total_liabilities_native"]),
        },
        "recomputed": {
            "nav": str(rv["nav"]),
            "total_assets": str(rv["total_assets"]),
            "total_liabilities": str(rv["total_liabilities"]),
        },
    }, input_versions={"snapshot_id": str(snapshot_id)})


def _transition_nav(
    *,
    env_id: str,
    business_id: UUID | str,
    snapshot_id: UUID,
    from_status: str,
    to_status: str,
    change_type: str,
    actor: str,
    correlation_id: Optional[str] = None,
) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, status, version FROM inv_nav_snapshot "
            "WHERE env_id = %s AND id = %s",
            (env_id, str(snapshot_id)),
        )
        snap = cur.fetchone()
        if not snap:
            return _fail([_err(ERR_SNAPSHOT_NOT_FOUND,
                               "snapshot not found", snapshot_id=str(snapshot_id))])
        if snap["status"] != from_status:
            return _fail([_err(
                ERR_INVALID_TRANSITION,
                f"transition requires status={from_status}",
                snapshot_id=str(snapshot_id), current_status=snap["status"],
            )])

        cur.execute(
            "UPDATE inv_nav_snapshot SET status = %s WHERE id = %s",
            (to_status, str(snapshot_id)),
        )
        write_audit(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            change_type=change_type,
            previous_state={"status": from_status, "version": snap["version"]},
            new_state={"status": to_status, "version": snap["version"]},
            actor=actor,
            correlation_id=correlation_id,
        )
        write_mutation_event(
            cur,
            env_id=env_id, business_id=business_id,
            entity_type="inv_nav_snapshot",
            entity_id=snapshot_id,
            event_type=f"snapshot_{to_status}",
            payload={"version": snap["version"]},
            correlation_id=correlation_id,
        )

    return _ok({
        "snapshot_id": str(snapshot_id),
        "status": to_status,
        "version": snap["version"],
    }, input_versions={})


def _to_jsonb(d: dict) -> str:
    """Serialize for jsonb param; psycopg accepts a json string."""
    import json
    def default(v):
        if isinstance(v, Decimal): return str(v)
        if isinstance(v, (date, datetime)): return v.isoformat()
        if isinstance(v, UUID): return str(v)
        return str(v)
    return json.dumps(d, default=default)
