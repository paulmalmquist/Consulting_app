#!/usr/bin/env python3
"""Backfill historical authoritative snapshots through the real builder.

Drives `verification/runners/meridian_authoritative_snapshot.py` per missing
quarter, then validates and promotes each fund/quarter to `released` only
when the gates pass. Quarters that cannot validate are left at their built
state (draft_audit or verified) and the chart fails closed for that point.

Pipeline per (fund_id, quarter):
  1. Detect: is a released row already present? If yes, skip.
  2. Build: invoke the meridian runner with --quarters <Q>. The runner:
       - Computes asset / investment / fund authoritative states
       - Persists them to re_authoritative_*_state_qtr as draft_audit
       - Auto-promotes the run to `verified` IF its internal reconciliation
         matrix passes (reconciliation_failures == 0).
  3. Validate: read back canonical_metrics for each (fund, quarter) and
     confirm scope, trust, NAV, IRR, TVPI, DPI are all populated and
     internally consistent.
  4. Promote: call promote_fund_snapshot(target_state="released",
     skip_gate=False). The system's own scope/trust/IRR gates run again.
  5. Receipt: write {status, reason, snapshot_version, audit_run_id,
     metrics summary} to audit/backfill/<run_ts>/receipts.json.

Skips a quarter (leaves it unavailable) on:
  - builder failure / non-zero exit
  - reconciliation_failures > 0 (no auto-verify by builder)
  - missing canonical metric (gross_irr, ending_nav, tvpi, dpi)
  - scope_completeness != "complete"
  - irr_trust_state != "trusted"
  - ScopedPromotionError from promote_fund_snapshot

Usage:
  python verification/runners/backfill_authoritative_snapshots.py \
      --start 2024Q1 --end 2026Q4

  python verification/runners/backfill_authoritative_snapshots.py \
      --start 2024Q1 --end 2026Q4 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

# DB-touching imports are deferred to runtime so --dry-run works without
# DATABASE_URL (planning needs no DB).
def _import_db():
    from app.db import get_cursor as _get_cursor
    from app.services import re_authoritative_snapshots as _ras
    from app.services.re_authoritative_snapshots import ScopedPromotionError as _SPE
    return _get_cursor, _ras, _SPE

# Same scope as the meridian runner. If those constants change there, change
# them here too — the builder will refuse a quarter for a fund not in its
# SELECTED_FUND_IDS, so this list must agree.
BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
SELECTED_FUND_IDS = [
    "a1b2c3d4-0003-0030-0001-000000000001",  # Institutional Growth Fund VII
    "a1b2c3d4-0001-0010-0001-000000000001",  # Meridian Real Estate Fund III
    "a1b2c3d4-0002-0020-0001-000000000001",  # Meridian Credit Opportunities Fund I
]

BUILDER_PATH = ROOT / "verification" / "runners" / "meridian_authoritative_snapshot.py"
ACTOR = "historical_backfill_runner"

REQUIRED_METRICS = ("gross_irr", "ending_nav", "tvpi", "dpi")


# ── Quarter math ────────────────────────────────────────────────────────────

def parse_quarter(q: str) -> tuple[int, int]:
    if len(q) != 6 or q[4] != "Q":
        raise ValueError(f"invalid quarter format: {q!r} (expected '2024Q1')")
    return int(q[:4]), int(q[5])


def format_quarter(year: int, qnum: int) -> str:
    return f"{year}Q{qnum}"


def quarter_range(start: str, end: str) -> list[str]:
    sy, sq = parse_quarter(start)
    ey, eq = parse_quarter(end)
    out: list[str] = []
    y, q = sy, sq
    while (y, q) <= (ey, eq):
        out.append(format_quarter(y, q))
        if q == 4:
            y, q = y + 1, 1
        else:
            q += 1
    return out


# ── DB helpers ──────────────────────────────────────────────────────────────

def list_released_fund_quarters() -> set[tuple[str, str]]:
    get_cursor, _, _ = _import_db()
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT fund_id::text AS fund_id, quarter
            FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'released'
              AND fund_id::text = ANY(%s)
            """,
            (SELECTED_FUND_IDS,),
        )
        return {(row["fund_id"], row["quarter"]) for row in cur.fetchall()}


def latest_snapshot_for(fund_id: str, quarter: str) -> dict[str, Any] | None:
    """Return the most-recent (verified or draft_audit) row written for this
    (fund, quarter) by the most-recent successful audit_run."""
    get_cursor, _, _ = _import_db()
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id::text AS id,
              s.snapshot_version,
              s.audit_run_id::text AS audit_run_id,
              s.promotion_state,
              s.trust_status,
              s.canonical_metrics,
              s.null_reasons,
              r.run_status,
              r.created_at
            FROM re_authoritative_fund_state_qtr s
            JOIN re_authoritative_snapshot_run r ON r.snapshot_version = s.snapshot_version
            WHERE s.fund_id = %s::uuid
              AND s.quarter = %s
            ORDER BY r.created_at DESC
            LIMIT 1
            """,
            (fund_id, quarter),
        )
        return cur.fetchone()


def fund_name(fund_id: str) -> str:
    get_cursor, _, _ = _import_db()
    with get_cursor() as cur:
        cur.execute("SELECT name FROM repe_fund WHERE fund_id = %s::uuid", (fund_id,))
        row = cur.fetchone()
        return row["name"] if row else fund_id


# ── Validation ──────────────────────────────────────────────────────────────

@dataclass
class GateResult:
    ok: bool
    failures: list[str] = field(default_factory=list)
    metric_summary: dict[str, Any] = field(default_factory=dict)


def to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        if isinstance(v, Decimal):
            return float(v)
        return float(v)
    except (TypeError, ValueError):
        return None


def validate_gates(canonical: dict[str, Any], null_reasons: dict[str, Any]) -> GateResult:
    """Validate scope, trust, NAV, IRR, TVPI, DPI before promoting to released."""
    failures: list[str] = []
    summary: dict[str, Any] = {}

    # Scope
    scope = canonical.get("scope") or {}
    completeness = scope.get("scope_completeness")
    in_count = scope.get("investment_count")
    expected = scope.get("expected_investment_count")
    summary["scope"] = {
        "scope_completeness": completeness,
        "investment_count": in_count,
        "expected_investment_count": expected,
    }
    if completeness != "complete":
        failures.append(f"scope_not_complete:{completeness}={in_count}/{expected}")

    # Trust (IRR specifically — net_irr_trust_state may be unavailable due to
    # missing waterfall, which is allowed)
    irr_trust = canonical.get("irr_trust_state")
    summary["irr_trust_state"] = irr_trust
    if irr_trust is not None and irr_trust != "trusted":
        irr_reason = canonical.get("irr_reason")
        failures.append(f"irr_untrusted:{irr_reason or irr_trust}")

    # Required canonical metrics — non-null
    for key in REQUIRED_METRICS:
        v = to_float(canonical.get(key))
        summary[key] = v
        if v is None:
            reason = null_reasons.get(key)
            failures.append(f"missing:{key}" + (f" ({reason})" if reason else ""))

    # NAV must be non-negative for the gates to make sense
    nav = summary.get("ending_nav")
    if nav is not None and nav < 0:
        failures.append(f"negative_nav:{nav}")

    # TVPI must equal DPI + RVPI within tolerance when all three are present
    rvpi = to_float(canonical.get("rvpi"))
    dpi = summary.get("dpi")
    tvpi = summary.get("tvpi")
    if rvpi is not None and dpi is not None and tvpi is not None:
        diff = abs(tvpi - (dpi + rvpi))
        summary["tvpi_dpi_plus_rvpi_diff"] = diff
        if diff > 0.02:
            failures.append(f"tvpi_dpi_rvpi_inconsistent:diff={diff:.4f}")

    return GateResult(ok=not failures, failures=failures, metric_summary=summary)


# ── Builder invocation ──────────────────────────────────────────────────────

def run_builder(quarter: str, *, dry_run: bool) -> tuple[bool, str]:
    """Invoke the meridian runner for a single quarter via subprocess.
    Returns (ok, log_tail)."""
    cmd = [
        sys.executable,
        str(BUILDER_PATH),
        "--quarters", quarter,
    ]
    if dry_run:
        return True, f"[dry-run] would run: {' '.join(cmd)}"
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        env={**os.environ},
    )
    log_tail = (proc.stdout[-1500:] + "\n---STDERR---\n" + proc.stderr[-1500:]).strip()
    return proc.returncode == 0, log_tail


# ── Receipt model ───────────────────────────────────────────────────────────

@dataclass
class Receipt:
    fund_id: str
    fund_name: str
    quarter: str
    status: str  # "released" | "verified_only" | "skipped" | "already_released" | "build_failed"
    reason: str | None
    snapshot_version: str | None
    audit_run_id: str | None
    promotion_state_after: str | None
    metric_summary: dict[str, Any] = field(default_factory=dict)
    gate_failures: list[str] = field(default_factory=list)
    builder_log_tail: str | None = None


# ── Driver ──────────────────────────────────────────────────────────────────

def run_backfill(*, start: str, end: str, dry_run: bool) -> list[Receipt]:
    quarters = quarter_range(start, end)
    print(f"[backfill] target quarter window: {quarters[0]} -> {quarters[-1]} ({len(quarters)} quarters)")
    print(f"[backfill] funds in scope: {len(SELECTED_FUND_IDS)}")

    if not BUILDER_PATH.exists():
        raise FileNotFoundError(f"meridian builder not found at {BUILDER_PATH}")

    if not dry_run:
        _, ras_module, ScopedPromotionError = _import_db()
    else:
        ras_module = None
        ScopedPromotionError = Exception  # placeholder; never raised in dry-run path

    already = list_released_fund_quarters() if not dry_run else set()
    print(f"[backfill] already-released combinations: {len(already)}")

    fund_names = {fid: fund_name(fid) for fid in SELECTED_FUND_IDS} if not dry_run else {fid: fid for fid in SELECTED_FUND_IDS}

    # Determine which quarters need a builder run (any fund missing).
    quarters_needing_build: list[str] = []
    for q in quarters:
        for fid in SELECTED_FUND_IDS:
            if (fid, q) not in already:
                quarters_needing_build.append(q)
                break
    print(f"[backfill] quarters needing builder run: {len(quarters_needing_build)}")
    print(f"[backfill] quarters: {quarters_needing_build}")

    receipts: list[Receipt] = []

    for q in quarters_needing_build:
        print(f"\n[backfill] === quarter {q} ===")
        ok, log_tail = run_builder(q, dry_run=dry_run)
        if not ok:
            for fid in SELECTED_FUND_IDS:
                if (fid, q) in already:
                    continue
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="build_failed",
                    reason="meridian_runner_returned_nonzero",
                    snapshot_version=None,
                    audit_run_id=None,
                    promotion_state_after=None,
                    builder_log_tail=log_tail,
                ))
            print(f"[backfill]   builder FAILED for {q}: {log_tail.splitlines()[-1] if log_tail else '(no output)'}")
            continue

        if dry_run:
            for fid in SELECTED_FUND_IDS:
                if (fid, q) in already:
                    continue
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="skipped",
                    reason="dry_run",
                    snapshot_version=None,
                    audit_run_id=None,
                    promotion_state_after=None,
                ))
            print(f"[backfill]   [dry-run] would attempt validate+release for {len(SELECTED_FUND_IDS)} funds")
            continue

        print(f"[backfill]   builder OK")

        # Per fund: read back, validate, promote
        for fid in SELECTED_FUND_IDS:
            if (fid, q) in already:
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="already_released",
                    reason=None,
                    snapshot_version=None,
                    audit_run_id=None,
                    promotion_state_after="released",
                ))
                continue

            row = latest_snapshot_for(fid, q)
            if not row:
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="skipped",
                    reason="no_row_after_build",
                    snapshot_version=None,
                    audit_run_id=None,
                    promotion_state_after=None,
                    builder_log_tail=log_tail,
                ))
                print(f"[backfill]   {fund_names[fid]:42s} {q}  SKIPPED  (no row after build — fund out of builder scope?)")
                continue

            canonical = row["canonical_metrics"] or {}
            null_reasons = row["null_reasons"] or {}
            gate = validate_gates(canonical, null_reasons)

            if not gate.ok:
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="verified_only" if row["promotion_state"] == "verified" else "skipped",
                    reason="; ".join(gate.failures),
                    snapshot_version=row["snapshot_version"],
                    audit_run_id=row["audit_run_id"],
                    promotion_state_after=row["promotion_state"],
                    metric_summary=gate.metric_summary,
                    gate_failures=gate.failures,
                ))
                print(f"[backfill]   {fund_names[fid]:42s} {q}  GATES FAILED  state={row['promotion_state']} reasons={gate.failures}")
                continue

            try:
                ras_module.promote_fund_snapshot(
                    snapshot_version=row["snapshot_version"],
                    fund_id=UUID(fid),
                    quarter=q,
                    target_state="released",
                    actor=ACTOR,
                    findings_summary={
                        "source": "historical_backfill_runner",
                        "gates_validated": list(REQUIRED_METRICS) + ["scope", "irr_trust"],
                        "metric_summary": gate.metric_summary,
                    },
                    skip_gate=False,
                )
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="released",
                    reason=None,
                    snapshot_version=row["snapshot_version"],
                    audit_run_id=row["audit_run_id"],
                    promotion_state_after="released",
                    metric_summary=gate.metric_summary,
                ))
                print(f"[backfill]   {fund_names[fid]:42s} {q}  RELEASED  gross_irr={gate.metric_summary.get('gross_irr')} tvpi={gate.metric_summary.get('tvpi')} dpi={gate.metric_summary.get('dpi')}")
            except ScopedPromotionError as exc:
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="skipped",
                    reason=f"system_gate_failed:{exc}",
                    snapshot_version=row["snapshot_version"],
                    audit_run_id=row["audit_run_id"],
                    promotion_state_after=row["promotion_state"],
                    metric_summary=gate.metric_summary,
                    gate_failures=[str(exc)],
                ))
                print(f"[backfill]   {fund_names[fid]:42s} {q}  SYSTEM GATE FAILED  {exc}")
            except Exception as exc:  # pragma: no cover
                receipts.append(Receipt(
                    fund_id=fid,
                    fund_name=fund_names[fid],
                    quarter=q,
                    status="skipped",
                    reason=f"promote_error:{exc}",
                    snapshot_version=row["snapshot_version"],
                    audit_run_id=row["audit_run_id"],
                    promotion_state_after=row["promotion_state"],
                    metric_summary=gate.metric_summary,
                ))
                print(f"[backfill]   {fund_names[fid]:42s} {q}  PROMOTE ERROR  {exc}")

    return receipts


def write_receipts(receipts: list[Receipt], output_root: Path) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = output_root / ts
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "receipts.json"
    payload = {
        "generated_at": ts,
        "actor": ACTOR,
        "business_id": BUSINESS_ID,
        "env_id": ENV_ID,
        "fund_ids": SELECTED_FUND_IDS,
        "receipt_count": len(receipts),
        "summary": _summarize(receipts),
        "receipts": [asdict(r) for r in receipts],
    }
    out_path.write_text(json.dumps(payload, indent=2, default=str))
    return out_path


def _summarize(receipts: list[Receipt]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in receipts:
        counts[r.status] = counts.get(r.status, 0) + 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, help="Earliest quarter to backfill, e.g. 2024Q1")
    parser.add_argument("--end", required=True, help="Latest quarter to backfill, e.g. 2026Q4")
    parser.add_argument("--dry-run", action="store_true", help="Plan only — do not invoke builder, do not write")
    parser.add_argument(
        "--output-root",
        default=str(ROOT / "audit" / "backfill"),
        help="Where to write receipts.json. Default: audit/backfill/<timestamp>/receipts.json",
    )
    args = parser.parse_args()

    receipts = run_backfill(start=args.start, end=args.end, dry_run=args.dry_run)
    out = write_receipts(receipts, Path(args.output_root))
    print(f"\n[backfill] receipts: {out}")
    print(f"[backfill] summary: {_summarize(receipts)}")


if __name__ == "__main__":
    main()
