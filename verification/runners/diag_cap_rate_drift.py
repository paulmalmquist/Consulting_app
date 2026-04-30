"""Diagnostic: enumerate cap-rate sources per equity asset and the implied
cap rate from each.

For every equity (non-debt) asset in IGF VII, MCOF I, MREF III, report:

  asset_name, cost_basis, ttm_noi,
  exit_event_projected_cap_rate,
  quarter_state_nav_at_2026Q2, implied_cap_at_qs_nav,
  authoritative_nav_at_2026Q2, implied_cap_at_auth_nav,
  decision (which source the runtime uses, with provenance fields)

Output: audit/asset_operating_cf_run/cap_rate_drift/<run_id>/cap_rate_drift.md

Run: python -m verification.runners.diag_cap_rate_drift
"""

from __future__ import annotations

import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import psycopg
import psycopg.rows
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT / "backend"))

from app.services.bottom_up_cashflow import (  # noqa: E402
    _is_debt_asset,
    _last_ttm_noi,
    _resolve_terminal_value,
    _load_asset_context,
)

DSN = os.environ["DATABASE_URL"]
DEFAULT_CAP = "0.065"
AS_OF = "2026Q2"

FUNDS = [
    ("Institutional Growth Fund VII", UUID("a1b2c3d4-0003-0030-0001-000000000001")),
    ("Meridian Credit Opportunities Fund I", UUID("a1b2c3d4-0002-0020-0001-000000000001")),
    ("Meridian Real Estate Fund III", UUID("a1b2c3d4-0001-0010-0001-000000000001")),
]


def main() -> int:
    from decimal import Decimal

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_root = ROOT / "audit" / "asset_operating_cf_run" / "cap_rate_drift" / run_id
    out_root.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    with psycopg.connect(DSN, row_factory=psycopg.rows.dict_row) as conn:
        for fund_name, fid in FUNDS:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT a.asset_id, a.name, a.cost_basis, d.deal_type, a.asset_type
                    FROM repe_asset a
                    JOIN repe_deal d ON d.deal_id = a.deal_id
                    WHERE d.fund_id = %s
                    ORDER BY a.name
                    """,
                    (fid,),
                )
                assets = cur.fetchall()

            for a in assets:
                with conn.cursor() as cur:
                    asset_id = a["asset_id"]
                    ctx = _load_asset_context(cur, asset_id)
                    cur.execute(
                        "SELECT quarter, revenue, other_income, opex FROM re_asset_operating_qtr "
                        "WHERE asset_id = %s ORDER BY quarter",
                        (asset_id,),
                    )
                    op_rows = cur.fetchall()
                    ttm_noi = _last_ttm_noi(op_rows)

                    cur.execute(
                        "SELECT projected_cap_rate, exit_quarter FROM re_asset_exit_event "
                        "WHERE asset_id = %s ORDER BY revision_at DESC LIMIT 1",
                        (asset_id,),
                    )
                    ee = cur.fetchone()

                    cur.execute(
                        "SELECT nav FROM re_asset_quarter_state WHERE asset_id = %s "
                        "AND quarter = %s AND scenario_id IS NULL "
                        "ORDER BY created_at DESC LIMIT 1",
                        (asset_id, AS_OF),
                    )
                    qs = cur.fetchone()
                    qs_nav = qs["nav"] if qs else None

                    cur.execute(
                        "SELECT canonical_metrics->>'nav' AS nav FROM re_authoritative_asset_state_qtr "
                        "WHERE asset_id = %s AND quarter = %s "
                        "AND promotion_state = 'released' LIMIT 1",
                        (asset_id, AS_OF),
                    )
                    anav_row = cur.fetchone()
                    anav = (
                        Decimal(anav_row["nav"])
                        if anav_row and anav_row.get("nav")
                        else None
                    )

                    tv = _resolve_terminal_value(
                        cur=cur,
                        asset_id=asset_id,
                        as_of_quarter=AS_OF,
                        operating_rows=op_rows,
                        exit_event=ee,
                        env_default_cap_rate=Decimal(DEFAULT_CAP),
                        asset_ctx=ctx,
                    )

                    impl_qs = (
                        float(ttm_noi / qs_nav)
                        if (ttm_noi and qs_nav and qs_nav > 0)
                        else None
                    )
                    impl_auth = (
                        float(ttm_noi / anav)
                        if (ttm_noi and anav and anav > 0)
                        else None
                    )

                    rows.append(
                        {
                            "fund": fund_name,
                            "asset_name": a["name"],
                            "asset_type": a["asset_type"],
                            "deal_type": a["deal_type"],
                            "is_debt": _is_debt_asset({"deal_type": a["deal_type"], "asset_type": a["asset_type"]}),
                            "cost_basis": float(a["cost_basis"]) if a["cost_basis"] else None,
                            "ttm_noi": float(ttm_noi) if ttm_noi else None,
                            "exit_event_cap_rate": float(ee["projected_cap_rate"]) if ee and ee.get("projected_cap_rate") is not None else None,
                            "exit_event_quarter": ee["exit_quarter"] if ee else None,
                            "qs_nav_at_asof": float(qs_nav) if qs_nav else None,
                            "implied_cap_at_qs_nav": impl_qs,
                            "auth_nav_at_asof": float(anav) if anav else None,
                            "implied_cap_at_auth_nav": impl_auth,
                            "runtime_tv_amount": float(tv["amount"]) if tv.get("amount") is not None else None,
                            "runtime_tv_source": tv.get("source"),
                            "runtime_tv_cap_rate": tv.get("cap_rate"),
                            "runtime_tv_cap_rate_source": tv.get("cap_rate_source"),
                            "runtime_tv_implied_cap": tv.get("implied_cap_rate"),
                            "rejected_qs_nav": tv.get("rejected_quarter_state_nav"),
                            "rejected_implied_cap": tv.get("rejected_implied_cap_rate"),
                            "tv_failure_reason": tv.get("reason"),
                        }
                    )

    csv_path = out_root / "cap_rate_drift.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    md = [
        "# Cap-Rate Drift & Runtime Valuation Provenance",
        "",
        f"Run: {run_id}  As-of: {AS_OF}  env_default_cap_rate: {DEFAULT_CAP}",
        "",
        "## Summary",
    ]
    n = len(rows)
    n_debt = sum(1 for r in rows if r["is_debt"])
    n_auth = sum(1 for r in rows if r["auth_nav_at_asof"])
    n_qs_used = sum(1 for r in rows if r["runtime_tv_source"] == "quarter_state_nav")
    n_qs_rejected = sum(1 for r in rows if r["rejected_qs_nav"] is not None)
    n_noi_cap = sum(1 for r in rows if r["runtime_tv_source"] == "noi_cap_rate")
    n_debt_default = sum(1 for r in rows if r["runtime_tv_source"] == "debt_outstanding_principal_default")
    n_failed = sum(1 for r in rows if r["tv_failure_reason"])

    md.append(f"- Total assets across IGF VII / MCOF I / MREF III: **{n}**")
    md.append(f"- Debt assets: {n_debt}")
    md.append(f"- Equity assets: {n - n_debt}")
    md.append(f"- Authoritative NAV available: {n_auth}")
    md.append(f"- Runtime used quarter_state_nav: {n_qs_used}")
    md.append(f"- Runtime REJECTED quarter_state_nav (implied cap out of band): {n_qs_rejected}")
    md.append(f"- Runtime used noi_cap_rate: {n_noi_cap}")
    md.append(f"- Runtime used debt_outstanding_principal_default: {n_debt_default}")
    md.append(f"- Terminal value FAILED (no source): {n_failed}")
    md.append("")
    md.append("## Per-asset cap-rate decisions")
    md.append("")
    md.append(
        "| fund | asset | cost | TTM NOI | qs_nav | impl_cap_qs | runtime TV | source | cap_used | cap_src | rejected_qs_nav | rejected_implied | failure |"
    )
    md.append(
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|"
    )
    for r in rows:
        cb = f"${r['cost_basis']/1e6:.1f}M" if r['cost_basis'] else "—"
        noi = f"${r['ttm_noi']/1e6:.2f}M" if r['ttm_noi'] else "—"
        qsn = f"${r['qs_nav_at_asof']/1e6:.1f}M" if r['qs_nav_at_asof'] else "—"
        impl = f"{r['implied_cap_at_qs_nav']*100:.1f}%" if r['implied_cap_at_qs_nav'] else "—"
        rtv = f"${r['runtime_tv_amount']/1e6:.1f}M" if r['runtime_tv_amount'] else "—"
        cap = f"{r['runtime_tv_cap_rate']*100:.1f}%" if r['runtime_tv_cap_rate'] else "—"
        rqs = f"${r['rejected_qs_nav']/1e6:.1f}M" if r['rejected_qs_nav'] else "—"
        ric = f"{r['rejected_implied_cap']*100:.1f}%" if r['rejected_implied_cap'] else "—"
        fund_short = r["fund"].split()[0] + (" " + r["fund"].split()[1] if len(r["fund"].split()) > 1 else "")
        md.append(
            f"| {fund_short[:18]} | {r['asset_name'][:30]} | {cb} | {noi} | {qsn} | {impl} | "
            f"{rtv} | {r['runtime_tv_source'] or '—'} | {cap} | "
            f"{r['runtime_tv_cap_rate_source'] or '—'} | {rqs} | {ric} | "
            f"{r['tv_failure_reason'] or '—'} |"
        )

    (out_root / "cap_rate_drift.md").write_text("\n".join(md), encoding="utf-8")
    print(f"[diag] receipts: {out_root}")
    print(f"  total assets: {n}")
    print(f"  used qs_nav cleanly: {n_qs_used}  (rejected as suspect: {n_qs_rejected})")
    print(f"  used noi/cap fallback: {n_noi_cap}")
    print(f"  used debt principal: {n_debt_default}")
    print(f"  failed entirely: {n_failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
