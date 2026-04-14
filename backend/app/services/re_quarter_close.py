from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import re_provenance
from app.services import re_rollup
from app.services import re_metrics
from app.services import re_capital_ledger
from app.services import re_scenario
from app.services import re_sustainability
from app.services import re_waterfall_runtime


def _q(v) -> Decimal | None:  # noqa: ANN001
    """Quantize a numeric value for storage; propagates None as NULL."""
    if v is None:
        return None
    d = v if isinstance(v, Decimal) else Decimal(str(v))
    return d.quantize(Decimal("0.000000000001"))


def _compute_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _d(v: object | None) -> Decimal:
    return Decimal(str(v or 0))


def _quarter_end_date(quarter: str) -> date:
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    elif month == 6:
        return date(year, 6, 30)
    elif month == 9:
        return date(year, 9, 30)
    else:
        return date(year, 12, 31)


def run_quarter_close(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    accounting_basis: str = "accrual",
    valuation_method: str = "cap_rate",
    run_waterfall: bool = False,
    triggered_by: str | None = None,
) -> dict:
    run_id_str = re_provenance.start_run(
        run_type="quarter_close",
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        triggered_by=triggered_by,
    )
    run_id = UUID(run_id_str)

    try:
        result = _execute_quarter_close(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
            accounting_basis=accounting_basis,
            valuation_method=valuation_method,
            do_waterfall=run_waterfall,
        )

        re_provenance.complete_run(
            run_id=run_id_str,
            effective_assumptions_hash=result.get("assumptions_hash"),
            metadata={
                "assets_processed": result.get("assets_processed", 0),
                "jvs_processed": result.get("jvs_processed", 0),
                "investments_processed": result.get("investments_processed", 0),
            },
        )

        result["run_id"] = run_id_str
        result["status"] = "success"
        return result

    except Exception as exc:
        re_provenance.fail_run(run_id=run_id_str, error_message=str(exc))
        raise


def _execute_quarter_close(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None,
    run_id: UUID,
    accounting_basis: str,
    valuation_method: str,
    do_waterfall: bool,
) -> dict:
    as_of = _quarter_end_date(quarter)

    with get_cursor() as cur:
        # 1. Get all investments for this fund
        cur.execute(
            "SELECT deal_id AS investment_id FROM repe_deal WHERE fund_id = %s",
            (str(fund_id),),
        )
        investments = cur.fetchall()

        assets_processed = 0
        jvs_processed = 0
        investments_processed = 0

        for inv in investments:
            inv_id = inv["investment_id"]

            # 2. Get all JVs for this investment
            cur.execute(
                "SELECT jv_id FROM re_jv WHERE investment_id = %s",
                (str(inv_id),),
            )
            jvs = cur.fetchall()

            for jv in jvs:
                jv_id_val = jv["jv_id"]

                # 3. Get all assets for this JV
                cur.execute(
                    "SELECT asset_id, asset_type FROM repe_asset WHERE jv_id = %s",
                    (str(jv_id_val),),
                )
                assets = cur.fetchall()

                for asset in assets:
                    _compute_asset_state(
                        cur=cur,
                        asset_id=UUID(str(asset["asset_id"])),
                        asset_type=asset["asset_type"],
                        quarter=quarter,
                        scenario_id=scenario_id,
                        run_id=run_id,
                        accounting_basis=accounting_basis,
                        valuation_method=valuation_method,
                    )
                    assets_processed += 1

                # 4. Rollup JV
                re_rollup.rollup_jv(
                    jv_id=UUID(str(jv_id_val)),
                    quarter=quarter,
                    scenario_id=scenario_id,
                    run_id=run_id,
                )
                jvs_processed += 1

            # Also process assets attached directly to investment (no JV)
            cur.execute(
                """
                SELECT asset_id, asset_type FROM repe_asset
                WHERE deal_id = %s AND jv_id IS NULL
                """,
                (str(inv_id),),
            )
            direct_assets = cur.fetchall()
            for asset in direct_assets:
                _compute_asset_state(
                    cur=cur,
                    asset_id=UUID(str(asset["asset_id"])),
                    asset_type=asset["asset_type"],
                    quarter=quarter,
                    scenario_id=scenario_id,
                    run_id=run_id,
                    accounting_basis=accounting_basis,
                    valuation_method=valuation_method,
                )
                assets_processed += 1

            # 5. Rollup investment
            re_rollup.rollup_investment(
                investment_id=UUID(str(inv_id)),
                quarter=quarter,
                scenario_id=scenario_id,
                run_id=run_id,
            )
            investments_processed += 1

    # 6. Get capital totals from ledger
    totals = re_capital_ledger.compute_fund_totals(
        fund_id=fund_id, as_of_quarter=quarter
    )

    # 7. Rollup fund
    fund_state = re_rollup.rollup_fund(
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_id=run_id,
        total_committed=Decimal(totals["total_committed"]),
        total_called=Decimal(totals["total_called"]),
        total_distributed=Decimal(totals["total_distributed"]),
    )

    # 8. Compute fund-level metrics
    fund_metrics = re_metrics.compute_fund_metrics(
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_id=run_id,
        as_of_date=as_of,
    )

    # 8a. Refresh bottom-up CF materialization for every asset in the fund,
    # then re-derive investment rollups. Only runs for the canonical (no
    # scenario) path — scenario branches do not own the materialized cache.
    if scenario_id is None:
        try:
            from app.services.bottom_up_refresh import (
                refresh_asset_cf_series_materialized,
            )

            with get_cursor() as _cur:
                _cur.execute(
                    """
                    SELECT a.asset_id
                    FROM repe_asset a
                    JOIN repe_deal d ON d.deal_id = a.deal_id
                    WHERE d.fund_id = %s
                    """,
                    (str(fund_id),),
                )
                for row in _cur.fetchall() or []:
                    try:
                        refresh_asset_cf_series_materialized(
                            UUID(str(row["asset_id"])),
                            quarter,
                            force=True,
                        )
                    except Exception as exc:  # best-effort refresh
                        import logging
                        logging.getLogger(__name__).warning(
                            "bottom_up_refresh_error asset=%s quarter=%s error=%s",
                            row["asset_id"], quarter, exc,
                        )
        except ImportError:
            pass

    # 9. Compute partner-level metrics
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.partner_id FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

    for p in partners:
        re_metrics.compute_partner_metrics(
            fund_id=fund_id,
            partner_id=UUID(str(p["partner_id"])),
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
            as_of_date=as_of,
        )

    # 10. Optional waterfall
    waterfall_run = None
    if do_waterfall:
        try:
            waterfall_run = re_waterfall_runtime.run_waterfall(
                fund_id=fund_id,
                quarter=quarter,
                scenario_id=scenario_id,
                run_type="shadow",
            )
        except (LookupError, ValueError):
            pass

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "fund_state": fund_state,
        "fund_metrics": fund_metrics,
        "waterfall_run": waterfall_run,
        "assets_processed": assets_processed,
        "jvs_processed": jvs_processed,
        "investments_processed": investments_processed,
    }


def _compute_asset_state(
    *,
    cur,
    asset_id: UUID,
    asset_type: str,
    quarter: str,
    scenario_id: UUID | None,
    run_id: UUID,
    accounting_basis: str,
    valuation_method: str,
) -> dict:
    revenue = Decimal("0")
    other_income = Decimal("0")
    opex = Decimal("0")
    capex = Decimal("0")
    # Null-reason codes — populated below when a metric cannot be computed
    value_reason: str | None = None
    debt_reason: str | None = None
    noi_reason: str | None = None
    debt_service = Decimal("0")
    leasing_costs = Decimal("0")
    tenant_improvements = Decimal("0")
    free_rent = Decimal("0")
    noi = Decimal("0")
    net_cash_flow = Decimal("0")
    occupancy: Decimal | None = None
    debt_balance = Decimal("0")
    cash_balance = Decimal("0")
    asset_value = Decimal("0")
    implied_equity_value = Decimal("0")
    ltv: Decimal | None = None
    dscr: Decimal | None = None
    debt_yield: Decimal | None = None
    assumptions_hash: str | None = None
    assumptions: dict = {}
    value_source = "missing_inputs_fallback"

    cur.execute(
        """
        SELECT a.asset_id, a.deal_id, a.jv_id, a.cost_basis, d.fund_id, pa.current_noi, pa.occupancy
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
        WHERE a.asset_id = %s
        """,
        (str(asset_id),),
    )
    asset_row = cur.fetchone() or {}
    cost_basis = _d(asset_row.get("cost_basis"))

    cur.execute(
        """
        SELECT *
        FROM re_loan_detail
        WHERE asset_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (str(asset_id),),
    )
    loan = cur.fetchone()

    operating_row = None
    if scenario_id:
        cur.execute(
            """
            SELECT *
            FROM re_asset_operating_qtr
            WHERE asset_id = %s AND quarter = %s AND scenario_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(asset_id), quarter, str(scenario_id)),
        )
        operating_row = cur.fetchone()
    if not operating_row:
        cur.execute(
            """
            SELECT *
            FROM re_asset_operating_qtr
            WHERE asset_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(asset_id), quarter),
        )
        operating_row = cur.fetchone()

    if scenario_id:
        assumptions, assumptions_hash = re_scenario.resolve_assumptions(
            scenario_id=scenario_id,
            node_path={
                "fund_id": asset_row.get("fund_id"),
                "investment_id": asset_row.get("deal_id"),
                "jv_id": asset_row.get("jv_id"),
                "asset_id": asset_id,
            },
        )

    if operating_row:
        revenue = _d(operating_row.get("revenue"))
        other_income = _d(operating_row.get("other_income"))
        opex = _d(operating_row.get("opex"))
        capex = _d(operating_row.get("capex"))
        debt_service = _d(operating_row.get("debt_service"))
        leasing_costs = _d(operating_row.get("leasing_costs"))
        tenant_improvements = _d(operating_row.get("tenant_improvements"))
        free_rent = _d(operating_row.get("free_rent"))
        cash_balance = _d(operating_row.get("cash_balance"))
        if operating_row.get("occupancy") is not None:
            occupancy = _d(operating_row.get("occupancy"))
        value_source = "operating_qtr"
    else:
        # Fallback 1: Try accounting rollup table (populated by TB uploads and seeds)
        cur.execute(
            """
            SELECT revenue, opex, noi, capex, debt_service, ti_lc, reserves, net_cash_flow
            FROM re_asset_acct_quarter_rollup
            WHERE asset_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(asset_id), quarter),
        )
        acct_rollup = cur.fetchone()

        if acct_rollup and _d(acct_rollup.get("revenue")) > 0:
            revenue = _d(acct_rollup.get("revenue"))
            opex = _d(acct_rollup.get("opex"))
            capex = _d(acct_rollup.get("capex"))
            debt_service = _d(acct_rollup.get("debt_service"))
            tenant_improvements = _d(acct_rollup.get("ti_lc"))
            value_source = "accounting_rollup"

            # Also pull occupancy from quarter table
            cur.execute(
                """
                SELECT occupancy, avg_rent
                FROM re_asset_occupancy_quarter
                WHERE asset_id = %s AND quarter = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(asset_id), quarter),
            )
            occ_row = cur.fetchone()
            if occ_row and occ_row.get("occupancy") is not None:
                occupancy = _d(occ_row.get("occupancy"))
        else:
            # Fallback 2: Try normalized accounting monthly data
            year = int(quarter[:4])
            q = int(quarter[-1])
            start_month = (q - 1) * 3 + 1
            end_month = start_month + 2
            start_date = f"{year}-{start_month:02d}-01"
            import calendar
            last_day = calendar.monthrange(year, end_month)[1]
            end_date = f"{year}-{end_month:02d}-{last_day:02d}"

            cur.execute(
                """
                SELECT line_code, SUM(amount) AS amount
                FROM acct_normalized_noi_monthly
                WHERE asset_id = %s
                  AND period_month >= %s AND period_month <= %s
                GROUP BY line_code
                """,
                (str(asset_id), start_date, end_date),
            )
            acct_rows = cur.fetchall()

            if acct_rows:
                for ar in acct_rows:
                    amt = _d(ar.get("amount"))
                    lc = ar.get("line_code", "")
                    if lc in ("RENT", "OTHER_INCOME"):
                        if lc == "RENT":
                            revenue += amt
                        else:
                            other_income += amt
                    elif amt < 0:
                        opex += abs(amt)
                value_source = "accounting_normalized"
            else:
                # Fallback 3: Original minimal fallback
                cash_balance = Decimal("0")
                if asset_type == "property":
                    base_noi = _d(asset_row.get("current_noi"))
                    revenue = base_noi
                    occupancy = _d(asset_row.get("occupancy")) if asset_row.get("occupancy") is not None else None
                elif loan and loan.get("coupon"):
                    debt_balance = _d(loan.get("current_balance"))
                    revenue = (debt_balance * _d(loan.get("coupon")) / Decimal("4")).quantize(Decimal("0.01"))
                value_source = "missing_inputs_fallback"

    growth_keys = (
        assumptions.get("rent_growth_override")
        or assumptions.get("rent_growth")
        or Decimal("0")
    )
    expense_growth = (
        assumptions.get("expense_growth_override")
        or assumptions.get("expense_growth")
        or Decimal("0")
    )
    noi_stress_pct = assumptions.get("noi_stress_pct") or Decimal("0")
    exit_cap_rate = assumptions.get("exit_cap_rate_override") or assumptions.get("exit_cap_rate") or Decimal("0.06")
    cap_rate_delta_bps = assumptions.get("exit_cap_rate_delta_bps") or Decimal("0")

    if assumptions:
        revenue = (revenue * (Decimal("1") + _d(growth_keys))).quantize(Decimal("0.01"))
        other_income = (other_income * (Decimal("1") + _d(growth_keys))).quantize(Decimal("0.01"))
        opex = (opex * (Decimal("1") + _d(expense_growth))).quantize(Decimal("0.01"))
        value_source = "scenario_override"

    effective_revenue = revenue + other_income - free_rent
    noi = effective_revenue - opex
    if noi_stress_pct:
        noi = (noi * (Decimal("1") - (_d(noi_stress_pct) / Decimal("100")))).quantize(Decimal("0.01"))

    sustainability = re_sustainability.compute_asset_adjustments(
        asset_id=asset_id,
        quarter=quarter,
        scenario_id=scenario_id,
    )
    opex = (
        opex
        + _d(sustainability.get("utility_opex_delta"))
        + _d(sustainability.get("carbon_penalty_delta"))
        + _d(sustainability.get("regulatory_penalty_delta"))
    ).quantize(Decimal("0.01"))
    capex = (capex + _d(sustainability.get("project_capex_delta"))).quantize(Decimal("0.01"))
    noi = (effective_revenue - opex + _d(sustainability.get("stabilized_noi_delta"))).quantize(Decimal("0.01"))
    cap_rate_delta_bps = (_d(cap_rate_delta_bps) + _d(sustainability.get("exit_cap_rate_delta_bps"))).quantize(Decimal("0.01"))
    if sustainability.get("sustainability_inputs_hash"):
        value_source = "scenario_override_sustainability" if assumptions else "sustainability_adjusted"

    if loan:
        debt_balance = _d(loan.get("current_balance"))
        if debt_service <= 0 and loan.get("coupon"):
            debt_service = (debt_balance * _d(loan.get("coupon")) / Decimal("4")).quantize(Decimal("0.01"))

    net_cash_flow = noi - capex - debt_service - leasing_costs - tenant_improvements

    if asset_type == "property":
        cap_rate = _d(exit_cap_rate)
        if cap_rate_delta_bps:
            cap_rate = (cap_rate + (_d(cap_rate_delta_bps) / Decimal("10000"))).quantize(Decimal("0.0001"))
        if valuation_method == "cap_rate" and noi > 0 and cap_rate > 0:
            # Preferred: direct cap valuation
            asset_value = (noi / cap_rate).quantize(Decimal("0.01"))
        elif cost_basis > 0:
            # Fallback 1: use cost basis rather than silently zeroing NAV
            asset_value = cost_basis
            value_reason = "cost_basis_fallback"
        else:
            # Fallback 2: last known value from re_asset_quarter_state prior period
            # (best-effort to avoid zero NAV; caller may pass None if unavailable)
            cur.execute(
                """
                SELECT asset_value FROM re_asset_quarter_state
                WHERE asset_id = %s AND asset_value > 0
                ORDER BY quarter DESC, created_at DESC
                LIMIT 1
                """,
                (str(asset_id),),
            )
            prior = cur.fetchone()
            if prior and prior.get("asset_value"):
                asset_value = _d(prior["asset_value"])
                value_reason = "prior_period_value"
            else:
                # No valuation can be derived — mark explicitly, do not write zero NAV
                asset_value = None  # type: ignore[assignment]
                value_reason = "no_valuation_available"
    else:
        _candidates = [v for v in [cost_basis, debt_balance, revenue] if v > 0]
        asset_value = max(_candidates) if _candidates else None  # type: ignore[assignment]
        if asset_value is None:
            value_reason = "no_valuation_available"

    if asset_value is not None:
        implied_equity_value = (_d(asset_value) - debt_balance).quantize(Decimal("0.01"))
        nav = (implied_equity_value + cash_balance).quantize(Decimal("0.01"))
    else:
        # Do NOT write zero NAV — write NULL and surface reason code.
        # Zero NAV would collapse fund rollups for all assets without valuation data.
        implied_equity_value = None  # type: ignore[assignment]
        nav = None  # type: ignore[assignment]
        noi_reason = noi_reason or ("no_operating_data" if noi == 0 and not operating_row else None)

    _av = _d(asset_value) if asset_value is not None else Decimal("0")
    if _av > 0 and debt_balance > 0:
        ltv = (debt_balance / _av).quantize(Decimal("0.0001"))
    elif _av > 0 and loan is None:
        debt_reason = "no_debt_data"
    elif loan and loan.get("ltv") is not None:
        ltv = _d(loan.get("ltv")).quantize(Decimal("0.0001"))
    else:
        debt_reason = debt_reason or ("no_debt_data" if not loan else None)

    if debt_service > 0 and noi != 0:
        dscr = (noi / debt_service).quantize(Decimal("0.0001"))
    elif loan and loan.get("dscr") is not None:
        dscr = _d(loan.get("dscr")).quantize(Decimal("0.0001"))

    if debt_balance > 0 and noi != 0:
        debt_yield = (noi / debt_balance).quantize(Decimal("0.0001"))

    inputs_hash = _compute_hash({
        "asset_id": str(asset_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "operating_inputs_hash": operating_row.get("inputs_hash") if operating_row else None,
        "assumptions_hash": assumptions_hash,
        "revenue": str(revenue),
        "other_income": str(other_income),
        "opex": str(opex),
        "capex": str(capex),
        "debt_service": str(debt_service),
        "leasing_costs": str(leasing_costs),
        "tenant_improvements": str(tenant_improvements),
        "free_rent": str(free_rent),
        "cash_balance": str(cash_balance),
        "debt_balance": str(debt_balance),
        "asset_value": str(asset_value) if asset_value is not None else None,
        "value_reason": value_reason,
        "valuation_method": valuation_method,
        "value_source": value_source,
        "sustainability_inputs_hash": sustainability.get("sustainability_inputs_hash"),
    })

    cur.execute(
        """
        INSERT INTO re_asset_quarter_state (
            asset_id, quarter, scenario_id, run_id, accounting_basis,
            noi, revenue, other_income, opex, capex, debt_service,
            leasing_costs, tenant_improvements, free_rent, net_cash_flow,
            occupancy, debt_balance, cash_balance,
            asset_value, implied_equity_value, nav,
            ltv, dscr, debt_yield,
            valuation_method, value_source, inputs_hash
        )
        VALUES (
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s
        )
        ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            run_id = EXCLUDED.run_id,
            accounting_basis = EXCLUDED.accounting_basis,
            noi = EXCLUDED.noi,
            revenue = EXCLUDED.revenue,
            other_income = EXCLUDED.other_income,
            opex = EXCLUDED.opex,
            capex = EXCLUDED.capex,
            debt_service = EXCLUDED.debt_service,
            leasing_costs = EXCLUDED.leasing_costs,
            tenant_improvements = EXCLUDED.tenant_improvements,
            free_rent = EXCLUDED.free_rent,
            net_cash_flow = EXCLUDED.net_cash_flow,
            occupancy = EXCLUDED.occupancy,
            debt_balance = EXCLUDED.debt_balance,
            cash_balance = EXCLUDED.cash_balance,
            asset_value = EXCLUDED.asset_value,
            implied_equity_value = EXCLUDED.implied_equity_value,
            nav = EXCLUDED.nav,
            ltv = EXCLUDED.ltv,
            dscr = EXCLUDED.dscr,
            debt_yield = EXCLUDED.debt_yield,
            valuation_method = EXCLUDED.valuation_method,
            value_source = EXCLUDED.value_source,
            inputs_hash = EXCLUDED.inputs_hash,
            created_at = now()
        RETURNING *
        """,
        (
            str(asset_id), quarter,
            str(scenario_id) if scenario_id else None,
            str(run_id), accounting_basis,
            _q(noi), _q(revenue), _q(other_income), _q(opex), _q(capex), _q(debt_service),
            _q(leasing_costs), _q(tenant_improvements), _q(free_rent), _q(net_cash_flow),
            _q(occupancy), _q(debt_balance), _q(cash_balance),
            _q(asset_value), _q(implied_equity_value), _q(nav),
            _q(ltv), _q(dscr), _q(debt_yield),
            valuation_method, value_source, inputs_hash,
        ),
    )
    return cur.fetchone()
