"""Seed and run RE fund engine demo flow (Phase 0-2).

Usage:
  python -m scripts.seed_re_demo
  python -m scripts.seed_re_demo --fund-id <uuid> --asset-id <uuid> --quarter 2026Q1

This script:
1) Finds/uses an existing fin_fund + fin_asset_investment
2) Creates a valuation assumption set
3) Upserts quarterly financials + loan
4) Runs valuation snapshot + asset financial state
5) Runs shadow waterfall
6) Computes fund summary
"""

from __future__ import annotations

import argparse
import json

from app.db import get_cursor
from app.services import re_fund_aggregation, re_valuation, re_waterfall


def _pick_default_fund_and_asset() -> tuple[str, str]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT f.fin_fund_id, a.fin_asset_investment_id
            FROM fin_fund f
            JOIN fin_asset_investment a ON a.fin_fund_id = f.fin_fund_id
            WHERE f.status = 'active' AND a.status IN ('active', 'pipeline')
            ORDER BY f.created_at DESC, a.created_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
    if not row:
        raise SystemExit(
            "No existing fin_fund/fin_asset_investment found. Seed/create a fund and asset first."
        )
    return str(row["fin_fund_id"]), str(row["fin_asset_investment_id"])


def run_demo(fund_id: str, asset_id: str, quarter: str, created_by: str) -> dict:
    # 1) Assumptions
    assumptions = re_valuation.create_assumption_set(
        cap_rate=0.055,
        exit_cap_rate=0.06,
        discount_rate=0.08,
        rent_growth=0.02,
        expense_growth=0.03,
        vacancy_assumption=0.05,
        sale_costs_pct=0.02,
        weight_direct_cap=0.7,
        weight_dcf=0.3,
        created_by=created_by,
        rationale="Demo baseline assumptions",
    )

    # 2) Quarterly operating inputs
    re_valuation.upsert_quarterly_financials(
        fin_asset_investment_id=asset_id,
        quarter=quarter,
        gross_potential_rent=3_600_000,
        vacancy_loss=180_000,
        effective_gross_income=3_470_000,
        operating_expenses=1_400_000,
        net_operating_income=2_070_000,
        occupancy_pct=0.93,
        capex=150_000,
        other_income=50_000,
    )

    # 3) Loan
    loans = re_valuation.get_loans_for_asset(asset_id)
    if not loans:
        re_valuation.create_loan(
            fin_asset_investment_id=asset_id,
            lender="Demo Bank",
            original_balance=22_000_000,
            current_balance=20_000_000,
            interest_rate=0.05,
            amortization_years=30,
            term_years=10,
            maturity_date="2031-12-31",
            annual_debt_service=1_200_000,
            loan_type="fixed",
        )

    # 4) Valuation run
    valuation = re_valuation.run_quarter(
        fin_asset_investment_id=asset_id,
        fin_fund_id=fund_id,
        quarter=quarter,
        assumption_set_id=str(assumptions["assumption_set_id"]),
        accrued_pref=100_000,
        deduct_pref_from_nav=False,
        cumulative_contributions=18_000_000,
        cumulative_distributions=1_000_000,
        cashflows_for_irr=[(0.0, -18_000_000), (1.0, 200_000), (2.0, 250_000)],
    )

    # 5) Waterfall run
    waterfall = re_waterfall.run_shadow(
        fin_fund_id=fund_id,
        quarter=quarter,
        waterfall_style="european",
        sale_costs_pct=0.02,
    )

    # 6) Fund summary
    fund_summary = re_fund_aggregation.compute(
        fin_fund_id=fund_id,
        quarter=quarter,
    )

    return {
        "fund_id": fund_id,
        "asset_id": asset_id,
        "quarter": quarter,
        "assumption_set_id": str(assumptions["assumption_set_id"]),
        "valuation_snapshot_id": str(valuation["valuation_snapshot"]["valuation_snapshot_id"]),
        "asset_financial_state_id": str(valuation["asset_financial_state"]["id"]),
        "waterfall_snapshot_id": str(waterfall["waterfall_snapshot"]["waterfall_snapshot_id"]),
        "fund_summary_id": str(fund_summary["id"]),
        "input_hash": valuation["input_hash"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fund-id", default="")
    parser.add_argument("--asset-id", default="")
    parser.add_argument("--quarter", default="2026Q1")
    parser.add_argument("--created-by", default="seed_re_demo")
    args = parser.parse_args()

    if args.fund_id and args.asset_id:
        fund_id, asset_id = args.fund_id, args.asset_id
    else:
        fund_id, asset_id = _pick_default_fund_and_asset()

    out = run_demo(fund_id, asset_id, args.quarter, args.created_by)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
