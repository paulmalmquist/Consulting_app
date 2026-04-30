"""Phase 4-5 end-to-end runner.

Drives one or more (fund, quarter) tuples through the full pipeline:

   scope discovery
   → asset CF refresh
   → investment + fund rollup
   → fund expense schedule
   → compose pre_waterfall_cf
   → waterfall layer (per-event allocation, LP/GP cash streams)
   → gross-to-net bridge
   → write draft snapshot + bridge row
   → assert promotion gate
   → write receipts

Always writes as ``promotion_state='draft_audit'``. Promotion to released
is a separate, gated step (the existing ``promote_fund_snapshot`` runtime
+ the partial UQ index from Remediation 1 prevents duplicates).

Receipts produced (under ``audit/fund_gross_to_net/<run_id>/``):
  - phase4_expense_layer/<fund>_<qtr>_expense_lines.csv
  - phase4_expense_layer/<fund>_<qtr>_expense_summary.json
  - phase5_waterfall_integration/<fund>_<qtr>_waterfall_events.csv
  - phase5_waterfall_integration/<fund>_<qtr>_waterfall_summary.json
  - gross_to_net_bridge.csv (one bridge row per fund/quarter)
  - snapshot_promotion_gate.json (one entry per fund/quarter)
  - test_results.txt (output of `pytest -q` for the new test files)

Run:
  python -m verification.runners.asset_operating_cf_run [--fund-id <uuid>]
                                                        [--quarter 2026Q2]
                                                        [--dry-run]
                                                        [--default-cap-rate 0.065]

Default: runs against IGF VII, MCOF I, MREF III at 2026Q2.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg
import psycopg.rows
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from app.services.bottom_up_fund_scope import discover_fund_scope  # noqa: E402
from app.services.bottom_up_refresh import refresh_all_asset_cf_series  # noqa: E402
from app.services.bottom_up_rollup import compute_fund_rollup  # noqa: E402
from app.services.fund_expense_layer import (  # noqa: E402
    compose_pre_waterfall_cf,
    compute_fund_expense_schedule,
)
from app.services.fund_gross_to_net import build_gross_to_net_bridge  # noqa: E402
from app.services.fund_snapshot_v2 import (  # noqa: E402
    write_fund_authoritative_snapshot_v2,
)
from app.services.fund_waterfall_layer import compute_fund_waterfall_layer  # noqa: E402

DSN = os.environ["DATABASE_URL"]

DEFAULT_FUNDS: list[tuple[str, UUID]] = [
    ("Institutional Growth Fund VII", UUID("a1b2c3d4-0003-0030-0001-000000000001")),
    ("Meridian Credit Opportunities Fund I", UUID("a1b2c3d4-0002-0020-0001-000000000001")),
    ("Meridian Real Estate Fund III", UUID("a1b2c3d4-0001-0010-0001-000000000001")),
]
DEFAULT_QUARTER = "2026Q2"
DEFAULT_CAP_RATE = Decimal("0.065")


def _load_env_business(cur, fund_id: UUID) -> tuple[str | None, UUID | None]:
    cur.execute(
        "SELECT business_id FROM repe_fund WHERE fund_id = %s",
        (str(fund_id),),
    )
    row = cur.fetchone()
    if not row:
        return None, None
    business_id = row["business_id"]
    cur.execute(
        "SELECT env_id FROM app.env_business_bindings WHERE business_id = %s LIMIT 1",
        (str(business_id),),
    )
    row = cur.fetchone()
    return (row["env_id"] if row else None), business_id


def _ending_nav_for(cur, fund_id: UUID, quarter: str) -> Decimal | None:
    cur.execute(
        """
        SELECT portfolio_nav FROM re_fund_quarter_state
        WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
        ORDER BY created_at DESC LIMIT 1
        """,
        (str(fund_id), quarter),
    )
    row = cur.fetchone()
    if row and row.get("portfolio_nav") is not None:
        return Decimal(str(row["portfolio_nav"]))
    return None


def _write_phase4_receipts(
    out_dir: Path,
    fund_label: str,
    quarter: str,
    expense_schedule,
    pre_wf_summary: dict,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    base = f"{fund_label}_{quarter}"

    # Expense lines CSV
    csv_path = out_dir / f"{base}_expense_lines.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "quarter",
                "kind",
                "amount",
                "currency",
                "basis",
                "basis_amount",
                "rate",
                "source_table",
                "source_id",
                "formula_key",
                "null_reason",
                "warnings",
            ],
        )
        writer.writeheader()
        for ln in expense_schedule.lines:
            writer.writerow(
                {
                    "quarter": ln.quarter,
                    "kind": ln.kind,
                    "amount": float(ln.amount) if ln.amount is not None else "",
                    "currency": ln.currency,
                    "basis": ln.basis or "",
                    "basis_amount": (
                        float(ln.basis_amount) if ln.basis_amount is not None else ""
                    ),
                    "rate": ln.rate if ln.rate is not None else "",
                    "source_table": ln.source_table,
                    "source_id": ln.source_id or "",
                    "formula_key": ln.formula_key,
                    "null_reason": ln.null_reason or "",
                    "warnings": "|".join(ln.warnings),
                }
            )

    # Schedule + pre-waterfall summary JSON
    summary_path = out_dir / f"{base}_expense_summary.json"
    summary = expense_schedule.to_dict()
    summary["compose_pre_waterfall_cf"] = pre_wf_summary
    summary_path.write_text(json.dumps(summary, indent=2, default=str))


def _write_phase5_receipts(
    out_dir: Path,
    fund_label: str,
    quarter: str,
    waterfall,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    base = f"{fund_label}_{quarter}"

    # Waterfall events CSV
    csv_path = out_dir / f"{base}_waterfall_events.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "event_date",
                "quarter",
                "distribution_amount",
                "lp_share",
                "gp_share",
                "carry_share",
                "pref_share",
                "return_of_capital",
                "catch_up",
                "conservation_diff",
            ],
        )
        writer.writeheader()
        for ev in waterfall.event_logs:
            writer.writerow(
                {
                    "event_date": ev.event_date.isoformat(),
                    "quarter": ev.quarter,
                    "distribution_amount": float(ev.distribution_amount),
                    "lp_share": float(ev.lp_share),
                    "gp_share": float(ev.gp_share),
                    "carry_share": float(ev.carry_share),
                    "pref_share": float(ev.pref_share),
                    "return_of_capital": float(ev.return_of_capital),
                    "catch_up": float(ev.catch_up),
                    "conservation_diff": float(ev.conservation_diff),
                }
            )

    summary_path = out_dir / f"{base}_waterfall_summary.json"
    summary_path.write_text(json.dumps(waterfall.to_dict(), indent=2, default=str))


def _append_bridge_csv(path: Path, fund_label: str, quarter: str, bridge) -> None:
    new_file = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(
                [
                    "fund",
                    "quarter",
                    "row_index",
                    "label",
                    "item_type",
                    "amount",
                    "null_reason",
                    "formula_key",
                    "source_table",
                ]
            )
        for i, r in enumerate(bridge.rows):
            writer.writerow(
                [
                    fund_label,
                    quarter,
                    i,
                    r.label,
                    r.item_type,
                    float(r.amount) if r.amount is not None else "",
                    r.null_reason or "",
                    r.formula_key,
                    r.source_table or "",
                ]
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fund-id", action="append", default=None)
    parser.add_argument("--quarter", default=DEFAULT_QUARTER)
    parser.add_argument("--default-cap-rate", default=str(DEFAULT_CAP_RATE))
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute everything but skip the snapshot writes.")
    parser.add_argument("--skip-tests", action="store_true",
                        help="Skip running pytest at the end.")
    args = parser.parse_args()

    cap = Decimal(args.default_cap_rate)
    quarter = args.quarter
    funds: list[tuple[str, UUID]]
    if args.fund_id:
        funds = []
        for fid_str in args.fund_id:
            funds.append((f"fund_{fid_str[:8]}", UUID(fid_str)))
    else:
        funds = list(DEFAULT_FUNDS)

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_root = ROOT / "audit" / "fund_gross_to_net" / run_id
    out_root.mkdir(parents=True, exist_ok=True)
    phase4_dir = out_root / "phase4_expense_layer"
    phase5_dir = out_root / "phase5_waterfall_integration"
    bridge_csv = out_root / "gross_to_net_bridge.csv"
    promotion_gate_json = out_root / "snapshot_promotion_gate.json"
    test_results_txt = out_root / "test_results.txt"

    print(f"[run] mode={'DRY-RUN' if args.dry_run else 'WRITE'} run_id={run_id}")
    print(f"[run] env_default_cap_rate={cap}  quarter={quarter}  funds={len(funds)}")

    promotion_gate_records: list[dict[str, Any]] = []

    with psycopg.connect(DSN, row_factory=psycopg.rows.dict_row) as conn:
        for label, fid in funds:
            slug = label.lower().replace(" ", "_").replace(",", "")
            print(f"\n[run] === {label} ({fid}) ===")
            with conn.cursor() as cur:
                env_id, business_id = _load_env_business(cur, fid)
                ending_nav = _ending_nav_for(cur, fid, quarter)
            if env_id is None or business_id is None:
                print(f"  skipped: missing env/business binding")
                continue

            scope = discover_fund_scope(fid, quarter)
            print(f"  scope: {scope.expected_investment_count} inv, {scope.expected_asset_count} assets")

            refresh = refresh_all_asset_cf_series(
                scope.expected_asset_ids, quarter,
                env_default_cap_rate=cap, force=False,
            )
            print(f"  refresh: {len(refresh.refreshed)}/{refresh.total_assets} OK; null_share={refresh.null_value_share}")

            rollup = compute_fund_rollup(
                fid, quarter,
                included_investment_ids=scope.expected_investment_ids,
                included_asset_ids=scope.expected_asset_ids,
                env_default_cap_rate=cap,
                compute_contributions=False,
            )
            print(f"  rollup: irr={rollup.irr}  null_reason={rollup.null_reason}")

            expense = compute_fund_expense_schedule(
                fid, quarter, env_id=env_id, business_id=business_id
            )
            print(f"  expense: total={expense.total_expenses}  null_reasons={list(expense.null_reasons.keys())}")

            pre_wf, pre_summary = compose_pre_waterfall_cf(
                fund_gross_cf=rollup.series, expense_schedule=expense
            )
            print(f"  pre_wf: {len(pre_wf)} pts  identity_ok={pre_summary['identity_ok']}")

            waterfall = compute_fund_waterfall_layer(
                fid, quarter,
                pre_waterfall_cf=pre_wf,
                fund_gross_irr=rollup.irr,
                ending_nav=ending_nav,
                expense_null_reasons=expense.null_reasons,
            )
            print(f"  waterfall: status={waterfall.waterfall_status}  net_irr={waterfall.net_irr}  events={len(waterfall.event_logs)}")

            bridge = build_gross_to_net_bridge(
                fund_id=fid, as_of_quarter=quarter,
                fund_gross_cf=rollup.series,
                ending_nav=ending_nav,
                expense_schedule=expense,
                waterfall=waterfall,
            )
            print(f"  bridge: identity_holds={bridge.identity_holds}  diff={bridge.identity_diff}")

            _write_phase4_receipts(phase4_dir, slug, quarter, expense, pre_summary)
            _write_phase5_receipts(phase5_dir, slug, quarter, waterfall)
            _append_bridge_csv(bridge_csv, slug, quarter, bridge)

            if not args.dry_run:
                try:
                    write_result = write_fund_authoritative_snapshot_v2(
                        env_id=env_id,
                        business_id=business_id,
                        fund_id=fid,
                        quarter=quarter,
                        scope=scope,
                        rollup=rollup,
                        expense_schedule=expense,
                        waterfall=waterfall,
                        bridge=bridge,
                        asset_refresh_null_share=refresh.null_value_share,
                        artifact_root=str(out_root.relative_to(ROOT)),
                    )
                    print(f"  wrote: snapshot={write_result['snapshot_id'][:8]} bridge={write_result['bridge_id'][:8]} trust={write_result['trust_status']} releasable={write_result['promotion_releasable']}")
                    promotion_gate_records.append(
                        {
                            "fund_label": label,
                            "fund_id": str(fid),
                            "quarter": quarter,
                            "snapshot_version": write_result["snapshot_version"],
                            "audit_run_id": write_result["audit_run_id"],
                            "snapshot_id": write_result["snapshot_id"],
                            "bridge_id": write_result["bridge_id"],
                            "trust_status": write_result["trust_status"],
                            "breakpoint_layer": write_result["breakpoint_layer"],
                            "promotion_releasable": write_result["promotion_releasable"],
                            "promotion_gate": write_result["promotion_gate"],
                        }
                    )
                except Exception as exc:
                    print(f"  WRITE FAILED: {type(exc).__name__}: {exc}")
                    promotion_gate_records.append(
                        {
                            "fund_label": label,
                            "fund_id": str(fid),
                            "quarter": quarter,
                            "write_error": f"{type(exc).__name__}: {exc}",
                        }
                    )
            else:
                from app.services.fund_snapshot_v2 import (
                    assert_promotion_preconditions,
                )

                gate = assert_promotion_preconditions(
                    fund_id=fid,
                    quarter=quarter,
                    scope=scope,
                    rollup=rollup,
                    expense_schedule=expense,
                    waterfall=waterfall,
                    bridge=bridge,
                    asset_refresh_null_share=refresh.null_value_share,
                )
                print(f"  gate (dry-run): ok={gate.ok}  failures={len(gate.failures)}")
                promotion_gate_records.append(
                    {
                        "fund_label": label,
                        "fund_id": str(fid),
                        "quarter": quarter,
                        "promotion_releasable": gate.ok,
                        "promotion_gate": gate.to_dict(),
                        "note": "dry-run: snapshot not persisted",
                    }
                )

    promotion_gate_json.write_text(
        json.dumps(promotion_gate_records, indent=2, default=str)
    )
    print(f"\n[run] receipts: {out_root}")
    print(f"  bridge:   {bridge_csv.relative_to(ROOT)}")
    print(f"  gate:     {promotion_gate_json.relative_to(ROOT)}")

    if not args.skip_tests:
        try:
            cmd = [
                sys.executable,
                "-m",
                "pytest",
                "tests/test_fund_expense_layer.py",
                "tests/test_fund_waterfall_layer.py",
                "tests/test_fund_gross_to_net.py",
                "tests/test_fund_snapshot_v2_promotion_gate.py",
                "--no-header",
                "--noconftest",
                "-q",
            ]
            print(f"\n[run] running tests: {' '.join(cmd[3:])}")
            p = subprocess.run(
                cmd,
                cwd=str(ROOT / "backend"),
                capture_output=True,
                text=True,
            )
            test_results_txt.write_text(
                f"$ {' '.join(cmd)}\n\n=== STDOUT ===\n{p.stdout}\n=== STDERR ===\n{p.stderr}\n=== rc={p.returncode} ==="
            )
            print(f"  test results written: {test_results_txt.relative_to(ROOT)}  rc={p.returncode}")
        except Exception as exc:
            test_results_txt.write_text(
                f"failed to run tests: {type(exc).__name__}: {exc}"
            )
            print(f"  test runner failed: {exc}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
