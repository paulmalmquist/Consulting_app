"""Trace each MCOF I asset through build_asset_cf_series and report why
each one fails or succeeds.

For every asset under MCOF I:
  * Inspect repe_asset, re_asset_operating_qtr, re_asset_exit_event,
    re_asset_quarter_state contents.
  * Run build_asset_cf_series and capture the result series.
  * Run compute_asset_irr and capture null_reason.
  * Cross-check what the seed migration (511 / 451) wrote vs what runtime
    expects.

Output: a Markdown table written to
audit/asset_operating_cf_run/mcof1_trace/<run_id>/trace.md plus a CSV
companion.
"""

from __future__ import annotations

import csv
import os
import sys
import traceback
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from app.services.bottom_up_cashflow import (  # noqa: E402
    build_asset_cf_series,
    compute_asset_irr,
)

DSN = os.environ["DATABASE_URL"]
MCOF1_FUND_ID = UUID("a1b2c3d4-0002-0020-0001-000000000001")
AS_OF_QUARTER = "2026Q2"


def main() -> int:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_root = ROOT / "audit" / "asset_operating_cf_run" / "mcof1_trace" / run_id
    out_root.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []

    with psycopg.connect(DSN, row_factory=psycopg.rows.dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.asset_id, a.name AS asset_name, a.asset_type,
                       a.acquisition_date, a.cost_basis,
                       d.deal_id::text AS investment_id,
                       d.name AS investment_name, d.stage,
                       d.deal_type AS investment_type
                FROM repe_deal d
                JOIN repe_asset a ON a.deal_id = d.deal_id
                WHERE d.fund_id = %s
                ORDER BY d.name, a.name
                """,
                (MCOF1_FUND_ID,),
            )
            assets = cur.fetchall()

        print(f"[mcof1] {len(assets)} assets under MCOF I")

        for a in assets:
            asset_id = a["asset_id"]
            row = {
                "asset_id": str(asset_id),
                "asset_name": a["asset_name"],
                "asset_type": a["asset_type"],
                "investment": a["investment_name"],
                "investment_type": a.get("investment_type"),
                "stage": a["stage"],
                "acquisition_date": str(a["acquisition_date"]) if a["acquisition_date"] else None,
                "cost_basis": float(a["cost_basis"]) if a["cost_basis"] else None,
            }

            # Counts of each input table
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS n, MIN(quarter) AS first_q, MAX(quarter) AS last_q "
                    "FROM re_asset_operating_qtr WHERE asset_id = %s",
                    (asset_id,),
                )
                op = cur.fetchone()
                row["operating_qtr_rows"] = op["n"]
                row["operating_first_q"] = op["first_q"]
                row["operating_last_q"] = op["last_q"]

                cur.execute(
                    "SELECT COUNT(*) AS n FROM re_asset_exit_event WHERE asset_id = %s",
                    (asset_id,),
                )
                row["exit_events"] = cur.fetchone()["n"]

                cur.execute(
                    "SELECT COUNT(*) AS n FROM re_asset_cf_projection WHERE asset_id = %s",
                    (asset_id,),
                )
                row["projection_rows"] = cur.fetchone()["n"]

                cur.execute(
                    "SELECT COUNT(*) AS n FROM re_asset_quarter_state "
                    "WHERE asset_id = %s AND scenario_id IS NULL",
                    (asset_id,),
                )
                row["quarter_state_rows"] = cur.fetchone()["n"]

                # Sample one operating row to see field population
                cur.execute(
                    "SELECT quarter, revenue, other_income, opex, capex, debt_service "
                    "FROM re_asset_operating_qtr WHERE asset_id = %s "
                    "ORDER BY quarter LIMIT 1",
                    (asset_id,),
                )
                sample_op = cur.fetchone()
                row["sample_operating"] = (
                    f"q={sample_op['quarter']} rev={sample_op['revenue']} "
                    f"oi={sample_op['other_income']} opex={sample_op['opex']} "
                    f"capex={sample_op['capex']} dbt={sample_op['debt_service']}"
                    if sample_op
                    else "(no rows)"
                )

            # Run the builder
            try:
                series = build_asset_cf_series(asset_id, AS_OF_QUARTER)
                row["builder_status"] = "ok"
                row["cf_points"] = len(series)
                neg = [p for p in series if p.amount < 0]
                pos = [p for p in series if p.amount > 0]
                row["has_acquisition"] = bool(
                    any("acquisition" in (p.component_breakdown or {}) for p in series)
                )
                row["has_inflow"] = len(pos) > 0
                row["total_neg"] = float(sum(p.amount for p in neg)) if neg else 0.0
                row["total_pos"] = float(sum(p.amount for p in pos)) if pos else 0.0
                row["has_exit"] = any(p.has_exit for p in series)
                row["has_terminal_value"] = any(p.has_terminal_value for p in series)
                row["builder_warnings"] = "|".join(
                    sorted({w for p in series for w in p.warnings})
                )
            except Exception as exc:
                row["builder_status"] = f"raised: {type(exc).__name__}: {exc}"
                row["cf_points"] = 0
                row["has_acquisition"] = False
                row["has_inflow"] = False
                row["builder_warnings"] = traceback.format_exc()[:200]

            # Run the IRR computer
            try:
                irr_result = compute_asset_irr(asset_id, AS_OF_QUARTER)
                row["irr_value"] = (
                    float(irr_result.value) if irr_result.value is not None else None
                )
                row["irr_null_reason"] = irr_result.null_reason
                row["irr_warnings"] = "|".join(irr_result.warnings) if irr_result.warnings else ""
            except Exception as exc:
                row["irr_value"] = None
                row["irr_null_reason"] = f"raised: {type(exc).__name__}: {exc}"
                row["irr_warnings"] = ""

            # Diagnose
            reasons: list[str] = []
            fixes: list[str] = []
            if row["irr_null_reason"]:
                reasons.append(row["irr_null_reason"])
            if not row.get("has_acquisition"):
                if not row["acquisition_date"] or not row["cost_basis"]:
                    fixes.append("seed: populate repe_asset.acquisition_date + cost_basis")
                else:
                    fixes.append("builder: acquisition_date / cost_basis present but builder didn't book it")
            if not row.get("has_inflow"):
                if row["operating_qtr_rows"] == 0 and row["projection_rows"] == 0:
                    fixes.append("seed: no operating or projection rows; fund may need 451/511 seed reapplied")
                elif row["operating_qtr_rows"] > 0:
                    fixes.append("builder: operating rows exist but produced no positive CF (check revenue/opex sign or terminal value)")
            if row.get("has_inflow") and row["irr_null_reason"] == "no_inflow":
                fixes.append("builder: positive CF observed but irr engine reports no_inflow (sign or zero check)")
            row["proposed_fix"] = " ; ".join(fixes) if fixes else "none required"
            row["failure_reasons"] = " ; ".join(reasons)

            rows.append(row)

    # CSV
    csv_path = out_root / "trace.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    # Markdown
    md = ["# MCOF I asset CF builder trace", "", f"Run: {run_id}", f"As-of: {AS_OF_QUARTER}", ""]
    md.append("## Summary")
    n_ok = sum(1 for r in rows if r.get("irr_value") is not None)
    n_acq = sum(1 for r in rows if r.get("has_acquisition"))
    n_inflow = sum(1 for r in rows if r.get("has_inflow"))
    md.append(f"- Total assets: {len(rows)}")
    md.append(f"- Builder produced acquisition CF: {n_acq}")
    md.append(f"- Builder produced any inflow: {n_inflow}")
    md.append(f"- IRR computed cleanly: {n_ok}")
    md.append("")
    md.append("## Per-asset trace")
    md.append("")
    md.append(
        "| asset_name | type | inv_type | stage | op_rows | exits | proj | qs_rows | "
        "has_acq | has_inflow | cf_pts | irr | null_reason | proposed_fix |"
    )
    md.append(
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    )
    for r in rows:
        irr = (
            f"{r['irr_value']:.3f}"
            if r.get("irr_value") is not None
            else "—"
        )
        md.append(
            f"| {r['asset_name'][:30]} | {r['asset_type'] or '—'} | "
            f"{r.get('investment_type') or '—'} | {r['stage']} | "
            f"{r['operating_qtr_rows']} | {r['exit_events']} | "
            f"{r['projection_rows']} | {r['quarter_state_rows']} | "
            f"{'✓' if r.get('has_acquisition') else '✗'} | "
            f"{'✓' if r.get('has_inflow') else '✗'} | "
            f"{r.get('cf_points', 0)} | {irr} | "
            f"{r.get('irr_null_reason') or '—'} | "
            f"{r.get('proposed_fix', '')} |"
        )

    md.append("")
    md.append("## Sample operating rows")
    md.append("")
    for r in rows:
        md.append(f"- **{r['asset_name']}**: {r.get('sample_operating', '—')}")

    md_path = out_root / "trace.md"
    md_path.write_text("\n".join(md), encoding="utf-8")
    print(f"[mcof1] receipts: {out_root}")

    # Console summary
    print()
    print(f"{'asset':<30} {'inv_type':<12} {'op':>3} {'exits':>5} {'proj':>4} "
          f"{'qs':>3} {'acq':>3} {'inflow':>6} {'irr':>8} {'null_reason':<35}")
    for r in rows:
        irr = f"{r['irr_value']:.3f}" if r.get("irr_value") is not None else "—"
        print(
            f"{r['asset_name'][:28]:<30} "
            f"{(r.get('investment_type') or '-'):<12} "
            f"{r['operating_qtr_rows']:>3} "
            f"{r['exit_events']:>5} "
            f"{r['projection_rows']:>4} "
            f"{r['quarter_state_rows']:>3} "
            f"{('Y' if r.get('has_acquisition') else 'N'):>3} "
            f"{('Y' if r.get('has_inflow') else 'N'):>6} "
            f"{irr:>8} "
            f"{(r.get('irr_null_reason') or '—')[:34]:<35}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
