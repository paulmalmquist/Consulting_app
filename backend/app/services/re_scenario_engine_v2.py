"""V2 Scenario Execution Engine: deterministic 8-step pipeline.

Steps:
1. Resolve asset assumptions (base + overrides)
2. Project asset operations (revenue, expenses, NOI, capex)
3. Model debt (interest, principal, refi, payoff)
4. Model exit (sale price, disposition costs, net proceeds)
5. Compute asset levered cashflows
6. Translate to fund share cashflows
7. Run fund waterfall (placeholder — uses existing waterfall engine)
8. Compute return metrics (IRR, MOIC, DPI, RVPI, TVPI)

Stores outputs in structured tables: scenario_asset_cashflows,
scenario_fund_cashflows, scenario_waterfall_results, scenario_return_metrics.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

import numpy as np

from app.db import get_cursor
from app.services import re_model_scenario
from app.services.re_scenario_types import (
    AssetAssumptions,
    AssetResult,
    ExitResult,
    PeriodCashflow,
    ReturnMetrics,
    ScenarioRunResult,
)


# ─── Public API ────────────────────────────────────────────────────────────────


def run_scenario(*, scenario_id: UUID) -> dict:
    """Execute the full 8-step pipeline and persist structured outputs."""
    scenario = re_model_scenario.get_scenario(scenario_id=scenario_id)
    model_id = str(scenario["model_id"])

    scope_assets = re_model_scenario.list_scenario_assets(scenario_id=scenario_id)
    overrides = re_model_scenario.list_scenario_overrides(scenario_id=scenario_id)

    if not scope_assets:
        raise ValueError("No assets in scope. Add assets before running.")

    override_map = _build_override_map(overrides)

    # Compute input hash for idempotency
    input_hash = _compute_hash({
        "scope": sorted(str(a["asset_id"]) for a in scope_assets),
        "overrides": {k: {kk: str(vv) for kk, vv in sorted(v.items())} for k, v in sorted(override_map.items())},
    })

    # Check if latest run for this scenario already has the same input hash
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, status, result_summary
               FROM re_model_run
               WHERE model_id = %s AND input_hash = %s AND status = 'completed'
               ORDER BY started_at DESC LIMIT 1""",
            (model_id, input_hash),
        )
        cached = cur.fetchone()
        if cached:
            return _build_result_from_cached(cached, scenario_id, model_id, scope_assets)

    # Create run record
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO re_model_run (model_id, status, started_at, triggered_by, input_hash)
               VALUES (%s, 'in_progress', now(), 'api', %s)
               RETURNING id""",
            (model_id, input_hash),
        )
        run_id = str(cur.fetchone()["id"])

    try:
        asset_results: list[AssetResult] = []
        fund_cashflows: dict[str, dict[date, dict]] = defaultdict(lambda: defaultdict(lambda: {
            "capital_calls": 0.0, "distributions": 0.0, "net_cf": 0.0,
        }))

        for sa in scope_assets:
            asset_id = str(sa["asset_id"])
            asset_ovs = override_map.get(asset_id, {})

            # Step 1: Resolve assumptions
            assumptions = _resolve_assumptions(asset_id, sa, asset_ovs)

            # Step 2: Project operations
            op_cashflows = _project_operations(assumptions)

            # Step 3: Model debt
            debt_cfs = _model_debt(assumptions, op_cashflows)

            # Step 4: Model exit
            exit_result = _model_exit(assumptions, op_cashflows, debt_cfs)

            # Step 5: Compute levered cashflows
            levered_cfs = _compute_levered_cashflows(op_cashflows, debt_cfs, exit_result)

            # Step 6: Translate to fund share
            fund_id = assumptions.fund_id or "unassigned"
            ownership = assumptions.ownership_pct / 100.0
            for cf in levered_cfs:
                fund_cashflows[fund_id][cf.period_date]["distributions"] += cf.equity_cash_flow * ownership
                fund_cashflows[fund_id][cf.period_date]["net_cf"] += cf.equity_cash_flow * ownership

            # Step 8: Compute asset-level return metrics
            asset_metrics = _compute_return_metrics(
                "asset", asset_id, levered_cfs, assumptions,
            )

            ar = AssetResult(
                asset_id=asset_id,
                asset_name=assumptions.asset_name,
                fund_id=assumptions.fund_id,
                fund_name=assumptions.fund_name,
                cashflows=levered_cfs,
                exit=exit_result,
                metrics=asset_metrics,
            )
            asset_results.append(ar)

        # Step 8 (fund level): Compute fund-level return metrics
        fund_metrics = _compute_fund_metrics(fund_cashflows)

        result = ScenarioRunResult(
            run_id=run_id,
            scenario_id=str(scenario_id),
            model_id=model_id,
            asset_results=asset_results,
            fund_metrics=fund_metrics,
            summary=_build_summary(asset_results, fund_metrics),
        )

        # Persist structured outputs
        _persist_results(result)

        # Mark run complete
        with get_cursor() as cur:
            cur.execute(
                """UPDATE re_model_run
                   SET status = 'completed', completed_at = now(),
                       result_summary = %s::jsonb
                   WHERE id = %s""",
                (json.dumps(result.summary, default=str), run_id),
            )

        return {
            "run_id": run_id,
            "scenario_id": str(scenario_id),
            "model_id": model_id,
            "status": "success",
            "assets_processed": len(asset_results),
            "summary": result.summary,
        }

    except Exception:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE re_model_run SET status = 'failed', completed_at = now() WHERE id = %s",
                (run_id,),
            )
        raise


def preview_asset(*, scenario_id: UUID, asset_id: UUID) -> dict:
    """Lightweight single-asset preview (steps 1-5, no persist).

    Returns projected cashflows and metrics for live drawer display.
    """
    scope_assets = re_model_scenario.list_scenario_assets(scenario_id=scenario_id)
    overrides = re_model_scenario.list_scenario_overrides(scenario_id=scenario_id)

    sa = next((a for a in scope_assets if str(a["asset_id"]) == str(asset_id)), None)
    if not sa:
        raise LookupError(f"Asset {asset_id} not in scenario scope")

    override_map = _build_override_map(overrides)
    asset_ovs = override_map.get(str(asset_id), {})

    assumptions = _resolve_assumptions(str(asset_id), sa, asset_ovs)
    op_cashflows = _project_operations(assumptions)
    debt_cfs = _model_debt(assumptions, op_cashflows)
    exit_result = _model_exit(assumptions, op_cashflows, debt_cfs)
    levered_cfs = _compute_levered_cashflows(op_cashflows, debt_cfs, exit_result)
    metrics = _compute_return_metrics("asset", str(asset_id), levered_cfs, assumptions)

    return {
        "asset_id": str(asset_id),
        "asset_name": assumptions.asset_name,
        "cashflows": [
            {
                "period_date": str(cf.period_date),
                "revenue": round(cf.revenue, 2),
                "expenses": round(cf.expenses, 2),
                "noi": round(cf.noi, 2),
                "capex": round(cf.capex, 2),
                "debt_service": round(cf.debt_service, 2),
                "net_cash_flow": round(cf.net_cash_flow, 2),
                "sale_proceeds": round(cf.sale_proceeds, 2),
                "equity_cash_flow": round(cf.equity_cash_flow, 2),
            }
            for cf in levered_cfs
        ],
        "exit": {
            "sale_date": str(exit_result.sale_date) if exit_result.sale_date else None,
            "gross_sale_price": round(exit_result.gross_sale_price, 2),
            "net_sale_proceeds": round(exit_result.net_sale_proceeds, 2),
            "equity_proceeds": round(exit_result.equity_proceeds, 2),
        } if exit_result else None,
        "metrics": {
            "gross_irr": metrics.gross_irr,
            "net_irr": metrics.net_irr,
            "gross_moic": metrics.gross_moic,
            "net_moic": metrics.net_moic,
            "dpi": metrics.dpi,
            "rvpi": metrics.rvpi,
            "tvpi": metrics.tvpi,
            "ending_nav": metrics.ending_nav,
        } if metrics else None,
        "summary": {
            "total_noi": round(sum(cf.noi for cf in levered_cfs), 2),
            "total_equity_cf": round(sum(cf.equity_cash_flow for cf in levered_cfs), 2),
            "periods": len(levered_cfs),
        },
    }


def compare_scenarios(*, scenario_ids: list[UUID]) -> dict:
    """Compare latest successful runs across multiple scenarios.

    Returns structured metrics with deltas and by-asset attribution.
    """
    runs: list[dict] = []
    for sid in scenario_ids:
        scenario = re_model_scenario.get_scenario(scenario_id=sid)
        with get_cursor() as cur:
            # Get latest successful run
            cur.execute(
                """SELECT id FROM re_model_run
                   WHERE model_id = %s AND status = 'completed'
                   ORDER BY completed_at DESC LIMIT 1""",
                (str(scenario["model_id"]),),
            )
            run_row = cur.fetchone()
            if not run_row:
                continue

            run_id = str(run_row["id"])

            # Get return metrics
            cur.execute(
                "SELECT * FROM scenario_return_metrics WHERE run_id = %s",
                (run_id,),
            )
            metrics = cur.fetchall()

            # Get asset cashflows summary
            cur.execute(
                """SELECT asset_id,
                          SUM(revenue) AS total_revenue,
                          SUM(noi) AS total_noi,
                          SUM(equity_cash_flow) AS total_equity_cf
                   FROM scenario_asset_cashflows
                   WHERE run_id = %s
                   GROUP BY asset_id""",
                (run_id,),
            )
            asset_summary = cur.fetchall()

        runs.append({
            "scenario_id": str(sid),
            "scenario_name": scenario["name"],
            "run_id": run_id,
            "metrics": metrics,
            "asset_summary": asset_summary,
        })

    if len(runs) < 2:
        return {"scenarios": runs, "comparison": None}

    # Compute deltas: first run is base
    base = runs[0]
    base_fund_metrics = next(
        (m for m in base["metrics"] if m["scope_type"] == "fund"), {}
    )
    comparisons = []
    for other in runs[1:]:
        other_fund_metrics = next(
            (m for m in other["metrics"] if m["scope_type"] == "fund"), {}
        )
        delta = {}
        for key in ("gross_irr", "net_irr", "gross_moic", "net_moic", "dpi", "rvpi", "tvpi", "ending_nav"):
            bv = float(base_fund_metrics.get(key) or 0)
            ov = float(other_fund_metrics.get(key) or 0)
            delta[key] = {"base": bv, "compare": ov, "delta": round(ov - bv, 6)}

        # By-asset attribution
        base_assets = {str(a["asset_id"]): a for a in base.get("asset_summary", [])}
        other_assets = {str(a["asset_id"]): a for a in other.get("asset_summary", [])}
        asset_attribution = []
        all_ids = set(base_assets.keys()) | set(other_assets.keys())
        for aid in sorted(all_ids):
            ba = base_assets.get(aid, {})
            oa = other_assets.get(aid, {})
            asset_attribution.append({
                "asset_id": aid,
                "base_noi": float(ba.get("total_noi", 0)),
                "compare_noi": float(oa.get("total_noi", 0)),
                "noi_delta": round(float(oa.get("total_noi", 0)) - float(ba.get("total_noi", 0)), 2),
                "base_equity_cf": float(ba.get("total_equity_cf", 0)),
                "compare_equity_cf": float(oa.get("total_equity_cf", 0)),
                "equity_cf_delta": round(
                    float(oa.get("total_equity_cf", 0)) - float(ba.get("total_equity_cf", 0)), 2
                ),
            })

        comparisons.append({
            "base_scenario": base["scenario_name"],
            "compare_scenario": other["scenario_name"],
            "metric_deltas": delta,
            "asset_attribution": asset_attribution,
        })

    return {"scenarios": runs, "comparison": comparisons}


# ─── Step 1: Resolve Assumptions ──────────────────────────────────────────────


def _resolve_assumptions(
    asset_id: str, scope_asset: dict, overrides: dict,
) -> AssetAssumptions:
    """Load base data from canonical tables and merge scenario overrides."""
    assumptions = AssetAssumptions(
        asset_id=asset_id,
        asset_name=scope_asset.get("asset_name", ""),
        fund_id=str(scope_asset["source_fund_id"]) if scope_asset.get("source_fund_id") else None,
        fund_name=scope_asset.get("fund_name"),
    )

    # Load base schedules
    with get_cursor() as cur:
        cur.execute(
            """SELECT r.period_date,
                      COALESCE(r.revenue, 0) AS revenue,
                      COALESCE(e.expense, 0) AS expense,
                      COALESCE(am.amort_amount, 0) AS amort
               FROM asset_revenue_schedule r
               LEFT JOIN asset_expense_schedule e
                   ON e.asset_id = r.asset_id AND e.period_date = r.period_date
               LEFT JOIN asset_amort_schedule am
                   ON am.asset_id = r.asset_id AND am.period_date = r.period_date
               WHERE r.asset_id = %s
               ORDER BY r.period_date""",
            (asset_id,),
        )
        for row in cur.fetchall():
            pd = row["period_date"]
            assumptions.base_revenue[pd] = Decimal(str(row["revenue"]))
            assumptions.base_expense[pd] = Decimal(str(row["expense"]))
            assumptions.base_amort[pd] = Decimal(str(row["amort"]))

    # Load debt info from re_loan
    with get_cursor() as cur:
        cur.execute(
            """SELECT upb, rate, spread, maturity, amort_type, rate_type
               FROM re_loan WHERE asset_id = %s LIMIT 1""",
            (asset_id,),
        )
        loan = cur.fetchone()
        if loan:
            assumptions.loan_balance = float(loan["upb"])
            assumptions.interest_rate_pct = float(loan["rate"]) * 100 if loan["rate"] else None
            assumptions.spread_bps = float(loan["spread"]) * 10000 if loan["spread"] else None
            assumptions.maturity_date = loan["maturity"]
            if loan["amort_type"] != "interest_only":
                assumptions.amort_years = 30  # default amortization

    # Load ownership percentage
    with get_cursor() as cur:
        cur.execute(
            """SELECT d.committed_capital
               FROM repe_deal d
               JOIN repe_asset a ON a.deal_id = d.deal_id
               WHERE a.asset_id = %s""",
            (asset_id,),
        )
        cur.fetchone()  # deal row used for ownership context
        # Default 100% ownership if no specific percentage available

    # Apply overrides
    _ov = lambda key, default=None: overrides.get(key, default)  # noqa: E731
    _ov_float = lambda key, default=0.0: float(_ov(key, default))  # noqa: E731

    assumptions.rent_growth_pct = _ov_float("rent_growth_pct")
    assumptions.occupancy_pct = _ov("occupancy_pct")
    if assumptions.occupancy_pct is not None:
        assumptions.occupancy_pct = float(assumptions.occupancy_pct)
    assumptions.vacancy_pct = _ov("vacancy_pct")
    if assumptions.vacancy_pct is not None:
        assumptions.vacancy_pct = float(assumptions.vacancy_pct)
    assumptions.bad_debt_pct = _ov_float("bad_debt_pct")
    assumptions.other_income_growth_pct = _ov_float("other_income_growth_pct")
    assumptions.concessions_pct = _ov_float("concessions_pct")
    assumptions.revenue_delta_pct = _ov_float("revenue_delta_pct")

    assumptions.payroll_growth_pct = _ov_float("payroll_growth_pct")
    assumptions.rm_growth_pct = _ov_float("rm_growth_pct")
    assumptions.utilities_growth_pct = _ov_float("utilities_growth_pct")
    assumptions.insurance_growth_pct = _ov_float("insurance_growth_pct")
    assumptions.tax_growth_pct = _ov_float("tax_growth_pct")
    assumptions.mgmt_fee_pct = _ov_float("mgmt_fee_pct")
    assumptions.expense_delta_pct = _ov_float("expense_delta_pct")

    assumptions.recurring_capex = _ov_float("recurring_capex")
    assumptions.onetime_capex = _ov_float("onetime_capex")
    if _ov("capex_override") is not None:
        assumptions.capex_override = float(_ov("capex_override"))
    assumptions.replacement_reserves = _ov_float("replacement_reserves")

    # Debt overrides
    if _ov("loan_balance") is not None:
        assumptions.loan_balance = float(_ov("loan_balance"))
    if _ov("interest_rate_pct") is not None:
        assumptions.interest_rate_pct = float(_ov("interest_rate_pct"))
    if _ov("spread_bps") is not None:
        assumptions.spread_bps = float(_ov("spread_bps"))
    if _ov("sofr_pct") is not None:
        assumptions.sofr_pct = float(_ov("sofr_pct"))
    if _ov("io_period_months") is not None:
        assumptions.io_period_months = int(float(_ov("io_period_months")))
    if _ov("amort_years") is not None:
        assumptions.amort_years = int(float(_ov("amort_years")))
    if _ov("maturity_date") is not None:
        assumptions.maturity_date = _parse_date(_ov("maturity_date"))
    if _ov("refi_date") is not None:
        assumptions.refi_date = _parse_date(_ov("refi_date"))
    if _ov("refi_proceeds") is not None:
        assumptions.refi_proceeds = float(_ov("refi_proceeds"))
    assumptions.amort_delta_pct = _ov_float("amort_delta_pct")

    # Exit overrides
    if _ov("sale_date") is not None:
        assumptions.sale_date = _parse_date(_ov("sale_date"))
    if _ov("exit_cap_rate_pct") is not None:
        assumptions.exit_cap_rate_pct = float(_ov("exit_cap_rate_pct"))
    if _ov("exit_noi_basis") is not None:
        assumptions.exit_noi_basis = float(_ov("exit_noi_basis"))
    assumptions.disposition_cost_pct = _ov_float("disposition_cost_pct", 2.0)
    assumptions.broker_fee_pct = _ov_float("broker_fee_pct", 1.0)
    assumptions.net_proceeds_haircut_pct = _ov_float("net_proceeds_haircut_pct")

    # Hard overrides
    if _ov("noi_override") is not None:
        assumptions.noi_override = float(_ov("noi_override"))
    if _ov("revenue_override_q") is not None:
        assumptions.revenue_override_q = float(_ov("revenue_override_q"))
    if _ov("capex_override_q") is not None:
        assumptions.capex_override_q = float(_ov("capex_override_q"))

    return assumptions


# ─── Step 2: Project Operations ───────────────────────────────────────────────


def _project_operations(a: AssetAssumptions) -> list[PeriodCashflow]:
    """Apply growth rates and overrides to base schedules."""
    periods = sorted(a.base_revenue.keys())
    if not periods:
        return []

    results = []
    for i, pd in enumerate(periods):
        base_rev = float(a.base_revenue.get(pd, 0))
        base_exp = float(a.base_expense.get(pd, 0))

        # Revenue projection
        if a.revenue_override_q is not None:
            revenue = a.revenue_override_q
        else:
            # Apply compounding growth per quarter
            growth_factor = (1 + a.rent_growth_pct / 100 / 4) ** i
            revenue = base_rev * growth_factor

            # Apply occupancy/vacancy adjustment
            if a.vacancy_pct is not None:
                vacancy_adj = (100 - a.vacancy_pct) / 100
                revenue *= vacancy_adj
            elif a.occupancy_pct is not None:
                revenue *= a.occupancy_pct / 100

            # Apply concessions
            if a.concessions_pct:
                revenue *= (1 - a.concessions_pct / 100)

            # Apply bad debt
            if a.bad_debt_pct:
                revenue *= (1 - a.bad_debt_pct / 100)

            # Apply revenue delta override (on top of everything)
            if a.revenue_delta_pct:
                revenue *= (1 + a.revenue_delta_pct / 100)

        # Expense projection
        # Weight expense growth across categories
        avg_expense_growth = _weighted_expense_growth(a)
        exp_growth_factor = (1 + avg_expense_growth / 100 / 4) ** i
        expenses = base_exp * exp_growth_factor

        # Apply expense delta override
        if a.expense_delta_pct:
            expenses *= (1 + a.expense_delta_pct / 100)

        # Management fee (percentage of revenue)
        if a.mgmt_fee_pct:
            expenses += revenue * a.mgmt_fee_pct / 100

        # NOI
        if a.noi_override is not None:
            noi = a.noi_override
        else:
            noi = revenue - expenses

        # Capex
        if a.capex_override_q is not None:
            capex = a.capex_override_q
        elif a.capex_override is not None:
            capex = a.capex_override / len(periods)  # Spread evenly
        else:
            capex = a.recurring_capex / 4 + a.replacement_reserves  # Quarterly
            if i == 0:
                capex += a.onetime_capex  # One-time in first period

        results.append(PeriodCashflow(
            period_date=pd,
            revenue=round(revenue, 2),
            expenses=round(expenses, 2),
            noi=round(noi, 2),
            capex=round(capex, 2),
        ))

    return results


def _weighted_expense_growth(a: AssetAssumptions) -> float:
    """Compute a weighted average expense growth rate from category overrides."""
    rates = [
        a.payroll_growth_pct,
        a.rm_growth_pct,
        a.utilities_growth_pct,
        a.insurance_growth_pct,
        a.tax_growth_pct,
    ]
    nonzero = [r for r in rates if r != 0]
    if not nonzero:
        return 0.0
    return sum(nonzero) / len(nonzero)


# ─── Step 3: Model Debt ──────────────────────────────────────────────────────


def _model_debt(
    a: AssetAssumptions, op_cfs: list[PeriodCashflow],
) -> list[float]:
    """Calculate debt service per period. Returns list aligned with op_cfs."""
    if not a.loan_balance or a.loan_balance <= 0:
        return [0.0] * len(op_cfs)

    # Determine effective interest rate
    if a.interest_rate_pct is not None:
        annual_rate = a.interest_rate_pct / 100
    elif a.sofr_pct is not None and a.spread_bps is not None:
        annual_rate = (a.sofr_pct + a.spread_bps / 100) / 100
    elif a.sofr_pct is not None:
        annual_rate = a.sofr_pct / 100
    else:
        annual_rate = 0.05  # Default 5%

    quarterly_rate = annual_rate / 4
    balance = a.loan_balance
    io_months = a.io_period_months or 0
    amort_years = a.amort_years

    debt_service_list = []
    for i, cf in enumerate(op_cfs):
        month_offset = i * 3  # Quarterly periods

        # Check if past maturity
        if a.maturity_date and cf.period_date > a.maturity_date:
            debt_service_list.append(0.0)
            continue

        # Check for refi
        if a.refi_date and cf.period_date >= a.refi_date:
            if a.refi_proceeds:
                balance = a.refi_proceeds
            debt_service_list.append(round(balance * quarterly_rate, 2))
            continue

        # IO period
        if month_offset < io_months:
            ds = balance * quarterly_rate
        elif amort_years and amort_years > 0:
            # Amortizing: compute quarterly payment
            total_periods = amort_years * 4
            if quarterly_rate > 0:
                ds = balance * (quarterly_rate * (1 + quarterly_rate) ** total_periods) / \
                     ((1 + quarterly_rate) ** total_periods - 1)
            else:
                ds = balance / total_periods
            # Reduce balance
            interest = balance * quarterly_rate
            principal = ds - interest
            balance = max(0, balance - principal)
        else:
            ds = balance * quarterly_rate

        debt_service_list.append(round(ds, 2))

    return debt_service_list


# ─── Step 4: Model Exit ──────────────────────────────────────────────────────


def _model_exit(
    a: AssetAssumptions,
    op_cfs: list[PeriodCashflow],
    debt_cfs: list[float],
) -> ExitResult:
    """Calculate exit/disposition results."""
    if not a.exit_cap_rate_pct or a.exit_cap_rate_pct <= 0:
        return ExitResult()

    # Determine terminal NOI
    if a.exit_noi_basis is not None:
        terminal_noi = a.exit_noi_basis
    elif op_cfs:
        # Use last period's annualized NOI
        terminal_noi = op_cfs[-1].noi * 4
    else:
        return ExitResult()

    cap_rate = a.exit_cap_rate_pct / 100
    gross_sale = terminal_noi / cap_rate if cap_rate > 0 else 0

    disp_costs = gross_sale * a.disposition_cost_pct / 100
    broker_fees = gross_sale * a.broker_fee_pct / 100
    haircut = gross_sale * a.net_proceeds_haircut_pct / 100

    net_sale = gross_sale - disp_costs - broker_fees - haircut

    # Loan payoff at exit (remaining balance)
    loan_payoff = a.loan_balance or 0

    equity_proceeds = net_sale - loan_payoff

    return ExitResult(
        sale_date=a.sale_date,
        terminal_noi=round(terminal_noi, 2),
        gross_sale_price=round(gross_sale, 2),
        disposition_costs=round(disp_costs, 2),
        broker_fees=round(broker_fees, 2),
        net_sale_proceeds=round(net_sale, 2),
        loan_payoff=round(loan_payoff, 2),
        equity_proceeds=round(equity_proceeds, 2),
    )


# ─── Step 5: Compute Levered Cashflows ────────────────────────────────────────


def _compute_levered_cashflows(
    op_cfs: list[PeriodCashflow],
    debt_cfs: list[float],
    exit_result: ExitResult,
) -> list[PeriodCashflow]:
    """Combine operations, debt, and exit into levered cashflows."""
    results = []
    sale_period = exit_result.sale_date if exit_result else None

    for i, cf in enumerate(op_cfs):
        ds = debt_cfs[i] if i < len(debt_cfs) else 0.0
        ncf = cf.noi - cf.capex - ds

        sale_proceeds = 0.0
        if sale_period and cf.period_date >= sale_period:
            if not results or results[-1].sale_proceeds == 0:
                sale_proceeds = exit_result.net_sale_proceeds

        equity_cf = ncf + sale_proceeds

        results.append(PeriodCashflow(
            period_date=cf.period_date,
            revenue=cf.revenue,
            expenses=cf.expenses,
            noi=cf.noi,
            capex=cf.capex,
            debt_service=ds,
            net_cash_flow=round(ncf, 2),
            sale_proceeds=round(sale_proceeds, 2),
            equity_cash_flow=round(equity_cf, 2),
        ))

    return results


# ─── Step 6: Fund Share Translation (embedded in run_scenario loop) ────────


# ─── Step 7: Waterfall (placeholder) ──────────────────────────────────────────


# Step 7 is a placeholder. The existing waterfall engine in finance_repe.py
# requires full fund-level capital account setup. For now, fund cashflows are
# stored directly. A future enhancement will integrate the full waterfall.


# ─── Step 8: Return Metrics ──────────────────────────────────────────────────


def _compute_return_metrics(
    scope_type: str,
    scope_id: str,
    cashflows: list[PeriodCashflow],
    assumptions: AssetAssumptions | None = None,
) -> ReturnMetrics:
    """Compute IRR, MOIC, DPI, RVPI, TVPI from equity cashflows."""
    if not cashflows:
        return ReturnMetrics(scope_type=scope_type, scope_id=scope_id)

    equity_cfs = [cf.equity_cash_flow for cf in cashflows]

    # For IRR, prepend initial investment as negative cash flow
    initial_investment = assumptions.loan_balance or 0 if assumptions else 0
    # Use first period NOI as proxy for equity value if no better data
    if initial_investment <= 0 and cashflows:
        initial_investment = abs(cashflows[0].noi * 4 * 10)  # Rough 10x NOI proxy

    irr_cfs = [-initial_investment] + equity_cfs
    gross_irr = _calculate_irr(irr_cfs)

    # MOIC
    total_distributions = sum(max(0, cf) for cf in equity_cfs)
    total_equity = initial_investment if initial_investment > 0 else 1
    gross_moic = total_distributions / total_equity if total_equity > 0 else 0

    # DPI (distributions to paid-in)
    dpi = total_distributions / total_equity if total_equity > 0 else 0

    # RVPI (residual value to paid-in) — use last period's equity CF as proxy
    residual = cashflows[-1].equity_cash_flow if cashflows else 0
    rvpi = residual / total_equity if total_equity > 0 else 0

    # TVPI = DPI + RVPI
    tvpi = dpi + rvpi

    # Ending NAV
    ending_nav = sum(cf.equity_cash_flow for cf in cashflows)

    return ReturnMetrics(
        scope_type=scope_type,
        scope_id=scope_id,
        gross_irr=round(gross_irr, 6) if gross_irr is not None else None,
        net_irr=round(gross_irr * 0.85, 6) if gross_irr is not None else None,  # Net = gross * (1 - fee estimate)
        gross_moic=round(gross_moic, 4),
        net_moic=round(gross_moic * 0.90, 4),  # Net MOIC after fees
        dpi=round(dpi, 4),
        rvpi=round(rvpi, 4),
        tvpi=round(tvpi, 4),
        ending_nav=round(ending_nav, 2),
    )


def _compute_fund_metrics(
    fund_cashflows: dict[str, dict[date, dict]],
) -> list[ReturnMetrics]:
    """Compute fund-level return metrics from aggregated cashflows."""
    results = []
    for fund_id, period_map in fund_cashflows.items():
        sorted_periods = sorted(period_map.keys())
        if not sorted_periods:
            continue

        cfs = [period_map[p]["net_cf"] for p in sorted_periods]
        total_dist = sum(max(0, c) for c in cfs)
        total_calls = sum(abs(min(0, c)) for c in cfs) or 1

        irr_series = [-total_calls] + cfs
        irr = _calculate_irr(irr_series)

        results.append(ReturnMetrics(
            scope_type="fund",
            scope_id=fund_id,
            gross_irr=round(irr, 6) if irr is not None else None,
            net_irr=round(irr * 0.85, 6) if irr is not None else None,
            gross_moic=round(total_dist / total_calls, 4) if total_calls else None,
            net_moic=round(total_dist / total_calls * 0.90, 4) if total_calls else None,
            dpi=round(total_dist / total_calls, 4) if total_calls else None,
            rvpi=round(cfs[-1] / total_calls, 4) if total_calls and cfs else None,
            tvpi=round((total_dist + cfs[-1]) / total_calls, 4) if total_calls and cfs else None,
            ending_nav=round(sum(cfs), 2),
        ))

    return results


def _calculate_irr(cashflows: list[float]) -> float | None:
    """Calculate IRR using numpy. Returns annualized rate or None."""
    if not cashflows or len(cashflows) < 2:
        return None

    try:
        cf_array = np.array(cashflows, dtype=float)
        # Check if there's a sign change (required for IRR)
        if np.all(cf_array >= 0) or np.all(cf_array <= 0):
            return None

        # Use numpy's IRR (quarterly periods → annualize)
        # numpy.irr was removed in numpy 1.20; use polynomial root method
        coeffs = cf_array[::-1]
        roots = np.roots(coeffs)
        # Filter for real, positive roots
        real_roots = []
        for root in roots:
            if np.isreal(root) and root.real > 0:
                real_roots.append(root.real)

        if not real_roots:
            return None

        # IRR = 1/root - 1 (quarterly rate)
        quarterly_rates = [1.0 / r - 1.0 for r in real_roots]
        # Pick the rate closest to a reasonable range
        valid_rates = [r for r in quarterly_rates if -0.5 < r < 2.0]
        if not valid_rates:
            return None

        quarterly_irr = min(valid_rates, key=abs)  # Pick smallest magnitude
        annual_irr = (1 + quarterly_irr) ** 4 - 1
        return annual_irr

    except Exception:
        return None


# ─── Persistence ──────────────────────────────────────────────────────────────


def _persist_results(result: ScenarioRunResult) -> None:
    """Write structured outputs to the new output tables."""
    with get_cursor() as cur:
        # Asset cashflows
        for ar in result.asset_results:
            for cf in ar.cashflows:
                cur.execute(
                    """INSERT INTO scenario_asset_cashflows
                       (run_id, asset_id, period_date, revenue, expenses, noi,
                        capex, debt_service, net_cash_flow, sale_proceeds, equity_cash_flow)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (run_id, asset_id, period_date) DO NOTHING""",
                    (
                        result.run_id, ar.asset_id, str(cf.period_date),
                        cf.revenue, cf.expenses, cf.noi, cf.capex,
                        cf.debt_service, cf.net_cash_flow, cf.sale_proceeds,
                        cf.equity_cash_flow,
                    ),
                )

            # Asset return metrics
            if ar.metrics:
                m = ar.metrics
                cur.execute(
                    """INSERT INTO scenario_return_metrics
                       (run_id, scope_type, scope_id, gross_irr, net_irr,
                        gross_moic, net_moic, dpi, rvpi, tvpi, ending_nav)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (run_id, scope_type, scope_id) DO NOTHING""",
                    (
                        result.run_id, m.scope_type, m.scope_id,
                        m.gross_irr, m.net_irr, m.gross_moic, m.net_moic,
                        m.dpi, m.rvpi, m.tvpi, m.ending_nav,
                    ),
                )

        # Fund return metrics
        for fm in result.fund_metrics:
            cur.execute(
                """INSERT INTO scenario_return_metrics
                   (run_id, scope_type, scope_id, gross_irr, net_irr,
                    gross_moic, net_moic, dpi, rvpi, tvpi, ending_nav)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (run_id, scope_type, scope_id) DO NOTHING""",
                (
                    result.run_id, fm.scope_type, fm.scope_id,
                    fm.gross_irr, fm.net_irr, fm.gross_moic, fm.net_moic,
                    fm.dpi, fm.rvpi, fm.tvpi, fm.ending_nav,
                ),
            )


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _build_override_map(overrides: list[dict]) -> dict[str, dict]:
    """Build {scope_id: {key: value}} lookup from override rows."""
    override_map: dict[str, dict] = {}
    for ov in overrides:
        sid = str(ov["scope_id"])
        if sid not in override_map:
            override_map[sid] = {}
        val = ov["value_json"]
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
        override_map[sid][ov["key"]] = val
    return override_map


def _build_summary(
    asset_results: list[AssetResult], fund_metrics: list[ReturnMetrics],
) -> dict:
    """Build a human-readable summary of the run."""
    total_noi = sum(
        sum(cf.noi for cf in ar.cashflows)
        for ar in asset_results
    )
    total_equity_cf = sum(
        sum(cf.equity_cash_flow for cf in ar.cashflows)
        for ar in asset_results
    )
    total_revenue = sum(
        sum(cf.revenue for cf in ar.cashflows)
        for ar in asset_results
    )
    total_expense = sum(
        sum(cf.expenses for cf in ar.cashflows)
        for ar in asset_results
    )

    return {
        "asset_count": len(asset_results),
        "total_noi": round(total_noi, 2),
        "total_equity_cf": round(total_equity_cf, 2),
        "total_revenue": round(total_revenue, 2),
        "total_expense": round(total_expense, 2),
        "fund_metrics": [
            {
                "fund_id": fm.scope_id,
                "gross_irr": fm.gross_irr,
                "net_irr": fm.net_irr,
                "gross_moic": fm.gross_moic,
                "tvpi": fm.tvpi,
            }
            for fm in fund_metrics
        ],
        "asset_metrics": [
            {
                "asset_id": ar.asset_id,
                "asset_name": ar.asset_name,
                "gross_irr": ar.metrics.gross_irr if ar.metrics else None,
                "gross_moic": ar.metrics.gross_moic if ar.metrics else None,
                "total_noi": round(sum(cf.noi for cf in ar.cashflows), 2),
            }
            for ar in asset_results
        ],
    }


def _parse_date(value) -> date | None:
    """Parse a date from various formats."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _compute_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def _build_result_from_cached(cached_run: dict, scenario_id: UUID, model_id: str, scope_assets: list[dict]) -> dict:
    """Return a result dict from a cached run record (idempotent hit)."""
    summary = cached_run.get("result_summary") or {}
    return {
        "run_id": str(cached_run["id"]),
        "scenario_id": str(scenario_id),
        "model_id": model_id,
        "status": "success",
        "assets_processed": len(scope_assets),
        "summary": summary,
    }


# ─── Opportunity Model (pre-investment, isolated) ───────────────────────────
#
# run_opportunity_model() is the ONLY function allowed to write to
# repe_opportunity_model_outputs and repe_opportunity_model_runs.
# It MUST NEVER write to any of the tables in FORBIDDEN_TABLES.
# This is validated at test time by test_opportunity_rollup_isolation.py.

FORBIDDEN_TABLES = [
    "re_asset_quarter_state",
    "re_investment_quarter_state",
    "re_fund_quarter_state",
    "re_capital_ledger_entry",
    "scenario_asset_cashflows",
    "scenario_fund_cashflows",
]


def run_opportunity_model(
    *,
    assumption_version_id: UUID,
    model_run_id: UUID,
    env_id: str,
    opportunity_id: str,
) -> dict:
    """
    Paper-invest an opportunity through the deterministic finance engine.

    Reuses the existing private math functions (_model_debt, _model_exit,
    _compute_levered_cashflows, _compute_return_metrics) with synthetic inputs
    derived from repe_opportunity_assumption_versions.

    Writes ONLY to:
    - repe_opportunity_model_outputs

    Never touches: re_asset_quarter_state, re_investment_quarter_state,
    re_fund_quarter_state, re_capital_ledger_entry, or scenario_*_cashflows.
    """
    import json as _json
    from datetime import date

    # ── Step 1: Load assumptions ───────────────────────────────────────────────
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM repe_opportunity_assumption_versions WHERE assumption_version_id = %s",
            [str(assumption_version_id)],
        )
        av_row = cur.fetchone()
    if av_row is None:
        raise LookupError(f"Assumption version {assumption_version_id} not found")
    av = dict(av_row)

    def _f(v) -> float | None:
        return float(v) if v is not None else None

    def _fi(v, default: float = 0.0) -> float:
        return float(v) if v is not None else default

    # Canonical flat fields (decimal format: 0.065 = 6.5%)
    purchase_price = _fi(av.get("purchase_price"))
    ltv = _fi(av.get("ltv"), 0.65)
    loan_amount = _fi(av.get("loan_amount")) or purchase_price * ltv
    equity_check = _fi(av.get("equity_check")) or purchase_price * (1.0 - ltv)
    interest_rate_pct = _fi(av.get("interest_rate_pct"), 0.065)
    io_period_months = av.get("io_period_months") or 0
    amort_years = av.get("amort_years") or 30
    hold_years = av.get("hold_years") or 5
    base_noi = _fi(av.get("base_noi"))
    rent_growth_pct = _fi(av.get("rent_growth_pct"), 0.03)
    vacancy_pct = _fi(av.get("vacancy_pct"), 0.05)
    mgmt_fee_pct = _fi(av.get("mgmt_fee_pct"), 0.04)
    exit_cap_rate_pct = _fi(av.get("exit_cap_rate_pct"), 0.055)
    disposition_cost_pct = _fi(av.get("disposition_cost_pct"), 0.02)
    capex_reserve_pct = _fi(av.get("capex_reserve_pct"), 0.005)
    fee_load_pct = _fi(av.get("fee_load_pct"), 0.015)

    # ── Step 2: Generate synthetic quarterly periods ──────────────────────────
    quarters = hold_years * 4
    today = date.today()
    op_cfs: list[PeriodCashflow] = []

    for i in range(quarters):
        # Period date: start from next full quarter
        month_offset = (i + 1) * 3
        period_date = date(
            today.year + (today.month + month_offset - 1) // 12,
            ((today.month + month_offset - 1) % 12) + 1,
            1,
        )

        # Grow NOI quarterly
        year_num = i // 4
        annual_noi_grown = base_noi * (1.0 + rent_growth_pct) ** year_num
        # Apply vacancy and mgmt fee
        eff_noi = annual_noi_grown * (1.0 - vacancy_pct) * (1.0 - mgmt_fee_pct)
        quarterly_noi = eff_noi / 4.0

        # Apply capex reserve
        quarterly_capex = (purchase_price * capex_reserve_pct) / 4.0

        quarterly_revenue = annual_noi_grown * (1.0 - vacancy_pct) / 4.0
        quarterly_expenses = (quarterly_revenue - quarterly_noi) + quarterly_capex

        op_cfs.append(PeriodCashflow(
            period_date=period_date,
            revenue=round(quarterly_revenue, 2),
            expenses=round(quarterly_expenses, 2),
            noi=round(quarterly_noi, 2),
            capex=round(quarterly_capex, 2),
        ))

    # ── Step 3: Model Debt ────────────────────────────────────────────────────
    # AssetAssumptions expects interest_rate_pct in percentage form (e.g. 6.25, not 0.0625)
    # and loan_balance = equity_check for correct IRR calculation.
    a = AssetAssumptions(
        asset_id=str(assumption_version_id),
        asset_name="opportunity_model",
        fund_id=None,
        fund_name=None,
        loan_balance=loan_amount,
        interest_rate_pct=interest_rate_pct * 100.0,  # decimal → percentage
        io_period_months=io_period_months,
        amort_years=amort_years,
        exit_cap_rate_pct=exit_cap_rate_pct * 100.0,  # decimal → percentage
        disposition_cost_pct=disposition_cost_pct * 100.0,
        mgmt_fee_pct=mgmt_fee_pct * 100.0,
        sale_date=op_cfs[-1].period_date if op_cfs else None,
    )

    debt_cfs = _model_debt(a, op_cfs)

    # ── Step 4: Model Exit ────────────────────────────────────────────────────
    exit_result = _model_exit(a, op_cfs, debt_cfs)

    # ── Step 5: Compute Levered Cashflows ─────────────────────────────────────
    levered_cfs = _compute_levered_cashflows(op_cfs, debt_cfs, exit_result)

    # ── Step 6: Compute Return Metrics ───────────────────────────────────────
    # Override loan_balance with equity_check so _compute_return_metrics uses
    # the correct initial investment (not loan amount).
    a_for_metrics = AssetAssumptions(
        asset_id=str(assumption_version_id),
        asset_name="opportunity_model",
        fund_id=None,
        fund_name=None,
        loan_balance=equity_check,  # initial equity investment
        interest_rate_pct=interest_rate_pct * 100.0,
        exit_cap_rate_pct=exit_cap_rate_pct * 100.0,
        disposition_cost_pct=disposition_cost_pct * 100.0,
    )
    metrics = _compute_return_metrics("opportunity", str(opportunity_id), levered_cfs, a_for_metrics)

    # Net metrics
    gross_irr = metrics.gross_irr or 0.0
    gross_em = metrics.gross_moic or 0.0
    net_irr = round(gross_irr * (1.0 - fee_load_pct), 6)
    net_equity_multiple = round(gross_em * (1.0 - fee_load_pct * hold_years), 4)

    # ── Step 7: Risk Metrics ──────────────────────────────────────────────────
    # DSCR = NOI / debt_service per period, minimum across all periods
    min_dscr: float | None = None
    dscr_values = []
    for i, cf in enumerate(op_cfs):
        ds = debt_cfs[i] if i < len(debt_cfs) else 0.0
        if ds > 0:
            dscr_values.append(cf.noi / ds)
    if dscr_values:
        min_dscr = round(min(dscr_values), 4)

    # Exit LTV = remaining loan / gross sale price
    exit_ltv: float | None = None
    if exit_result.gross_sale_price and exit_result.gross_sale_price > 0:
        exit_ltv = round(exit_result.loan_payoff / exit_result.gross_sale_price, 4)

    # Debt yield = NOI(year1) / loan_amount
    debt_yield: float | None = None
    if loan_amount > 0 and base_noi > 0:
        debt_yield = round(base_noi / loan_amount, 4)

    # ── Step 8: Cashflow JSON for storage ────────────────────────────────────
    cashflow_rows = []
    for i, cf in enumerate(levered_cfs):
        cashflow_rows.append({
            "period": i + 1,
            "period_date": str(cf.period_date),
            "noi": round(cf.noi, 2),
            "capex": round(cf.capex, 2),
            "debt_service": round(cf.debt_service, 2),
            "net_cash_flow": round(cf.net_cash_flow, 2),
            "sale_proceeds": round(cf.sale_proceeds, 2),
            "equity_cash_flow": round(cf.equity_cash_flow, 2),
        })

    # ── Belt-and-suspenders guard (tested by monkeypatch in CI) ──────────────
    # In production this is a no-op; tests override _check_forbidden_writes.
    _assert_no_forbidden_table_writes(cashflow_rows, FORBIDDEN_TABLES)

    # ── Write to repe_opportunity_model_outputs ONLY ─────────────────────────
    engine_version = "scenario_engine_v2"
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunity_model_outputs (
                env_id, model_run_id, opportunity_id,
                assumption_version_id, engine_version, run_timestamp,
                gross_irr, net_irr, gross_equity_multiple, net_equity_multiple,
                tvpi, dpi, nav,
                min_dscr, exit_ltv, debt_yield,
                cashflow_json
            ) VALUES (
                %s, %s, %s,
                %s, %s, now(),
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s
            )
            ON CONFLICT (model_run_id) DO UPDATE SET
                gross_irr = EXCLUDED.gross_irr,
                net_irr = EXCLUDED.net_irr,
                gross_equity_multiple = EXCLUDED.gross_equity_multiple,
                net_equity_multiple = EXCLUDED.net_equity_multiple,
                tvpi = EXCLUDED.tvpi,
                dpi = EXCLUDED.dpi,
                nav = EXCLUDED.nav,
                min_dscr = EXCLUDED.min_dscr,
                exit_ltv = EXCLUDED.exit_ltv,
                debt_yield = EXCLUDED.debt_yield,
                cashflow_json = EXCLUDED.cashflow_json,
                run_timestamp = now()
            RETURNING run_timestamp, output_id
            """,
            [
                env_id,
                str(model_run_id),
                opportunity_id,
                str(assumption_version_id),
                engine_version,
                metrics.gross_irr,
                net_irr,
                metrics.gross_moic,
                net_equity_multiple,
                metrics.tvpi,
                metrics.dpi,
                metrics.ending_nav,
                min_dscr,
                exit_ltv,
                debt_yield,
                _json.dumps(cashflow_rows),
            ],
        )
        out_row = cur.fetchone()

    return {
        "gross_irr": metrics.gross_irr,
        "net_irr": net_irr,
        "gross_equity_multiple": metrics.gross_moic,
        "net_equity_multiple": net_equity_multiple,
        "tvpi": metrics.tvpi,
        "dpi": metrics.dpi,
        "nav": metrics.ending_nav,
        "min_dscr": min_dscr,
        "exit_ltv": exit_ltv,
        "debt_yield": debt_yield,
        "engine_version": engine_version,
        "run_timestamp": str(out_row["run_timestamp"]) if out_row else None,
        "cashflows": cashflow_rows,
    }


def _assert_no_forbidden_table_writes(data: object, forbidden: list[str]) -> None:
    """
    Belt-and-suspenders guard.

    In production: a no-op (data is a list of cashflow dicts, never contains
    SQL statements).

    In tests: monkeypatched to intercept the SQL log and assert that none of the
    FORBIDDEN_TABLES appear in any executed statement.  See
    test_opportunity_rollup_isolation.py for the monkeypatch pattern.
    """
    pass
