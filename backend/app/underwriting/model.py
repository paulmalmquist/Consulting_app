from __future__ import annotations

from typing import Any

from app.underwriting.scenarios import apply_scenario_levers


_TARGETS = {
    "multifamily": {"irr": 0.12, "dscr": 1.25},
    "industrial": {"irr": 0.115, "dscr": 1.25},
    "office": {"irr": 0.13, "dscr": 1.30},
    "retail": {"irr": 0.125, "dscr": 1.28},
    "medical_office": {"irr": 0.115, "dscr": 1.24},
    "senior_housing": {"irr": 0.13, "dscr": 1.30},
    "student_housing": {"irr": 0.13, "dscr": 1.30},
}


def _npv(rate: float, cashflows: list[float]) -> float:
    return sum(cf / ((1.0 + rate) ** i) for i, cf in enumerate(cashflows))


def _irr(cashflows: list[float]) -> float | None:
    if not cashflows:
        return None
    positives = any(cf > 0 for cf in cashflows)
    negatives = any(cf < 0 for cf in cashflows)
    if not (positives and negatives):
        return None

    low, high = -0.99, 3.0
    f_low = _npv(low, cashflows)
    f_high = _npv(high, cashflows)
    if f_low * f_high > 0:
        return None

    for _ in range(120):
        mid = (low + high) / 2.0
        f_mid = _npv(mid, cashflows)
        if abs(f_mid) < 1e-6:
            return mid
        if f_low * f_mid > 0:
            low = mid
            f_low = f_mid
        else:
            high = mid
    return (low + high) / 2.0


def _annual_payment(principal: float, annual_rate: float, years: int) -> float:
    if principal <= 0:
        return 0.0
    if years <= 0:
        return principal
    if annual_rate <= 0:
        return principal / years
    factor = (1.0 + annual_rate) ** years
    return principal * (annual_rate * factor) / (factor - 1.0)


def _build_debt_schedule(
    *,
    loan_amount_cents: float,
    debt_rate_pct: float,
    amort_years: int,
    io_months: int,
    hold_years: int,
) -> list[dict[str, int | float]]:
    io_years = io_months / 12.0
    balance = float(loan_amount_cents)
    schedule: list[dict[str, int | float]] = []

    annual_payment = _annual_payment(balance, debt_rate_pct, amort_years)
    amort_year = 0

    for year in range(1, hold_years + 1):
        beginning = balance
        if year <= io_years and io_months > 0:
            interest = balance * debt_rate_pct
            principal = 0.0
            debt_service = interest
            ending = balance
        else:
            amort_year += 1
            interest = balance * debt_rate_pct
            debt_service = min(balance + interest, annual_payment)
            principal = max(0.0, debt_service - interest)
            ending = max(0.0, balance - principal)

        dscr = None
        schedule.append(
            {
                "year": year,
                "beginning_balance_cents": int(round(beginning)),
                "debt_service_cents": int(round(debt_service)),
                "interest_cents": int(round(interest)),
                "principal_cents": int(round(principal)),
                "ending_balance_cents": int(round(ending)),
                "dscr": dscr,
            }
        )
        balance = ending

    return schedule


def _core_model(
    *,
    property_inputs: dict[str, Any],
    market_snapshot: dict[str, Any],
    assumptions: dict[str, Any],
) -> dict[str, Any]:
    hold_years = max(1, int(assumptions.get("hold_years", 10)))
    rent_growth_pct = float(assumptions.get("rent_growth_pct", 0.03))
    expense_growth_pct = float(assumptions.get("expense_growth_pct", 0.025))
    vacancy_pct = float(assumptions.get("vacancy_pct", 0.06))
    opex_ratio = float(assumptions.get("opex_ratio", 0.38))
    ti_lc_per_sf_cents = float(assumptions.get("ti_lc_per_sf_cents", 1500))
    capex_reserve_per_sf_cents = float(assumptions.get("capex_reserve_per_sf_cents", 300))
    debt_rate_pct = float(assumptions.get("debt_rate_pct", 0.06))
    ltv = float(assumptions.get("ltv", 0.65))
    amort_years = max(1, int(assumptions.get("amort_years", 30)))
    io_months = max(0, int(assumptions.get("io_months", 24)))
    sale_cost_pct = float(assumptions.get("sale_cost_pct", 0.02))
    discount_rate_pct = float(assumptions.get("discount_rate_pct", 0.10))

    entry_cap_pct = float(market_snapshot.get("cap_rate") or assumptions.get("entry_cap_pct") or 0.055)
    exit_cap_pct = float(market_snapshot.get("exit_cap_rate") or assumptions.get("exit_cap_pct") or entry_cap_pct)
    entry_cap_pct = max(0.01, min(0.20, entry_cap_pct))
    exit_cap_pct = max(0.01, min(0.20, exit_cap_pct))

    gross_area_sf = float(property_inputs.get("gross_area_sf") or 0)
    in_place_noi_cents = float(property_inputs.get("in_place_noi_cents") or 0)
    purchase_price_cents = float(property_inputs.get("purchase_price_cents") or 0)

    if in_place_noi_cents <= 0 and purchase_price_cents > 0:
        in_place_noi_cents = purchase_price_cents * entry_cap_pct
    if purchase_price_cents <= 0 and in_place_noi_cents > 0:
        purchase_price_cents = in_place_noi_cents / entry_cap_pct
    if purchase_price_cents <= 0:
        purchase_price_cents = 50_000_000.0
    if in_place_noi_cents <= 0:
        in_place_noi_cents = purchase_price_cents * entry_cap_pct

    revenue_denom = max((1.0 - vacancy_pct) * (1.0 - opex_ratio), 0.05)
    base_revenue_cents = in_place_noi_cents / revenue_denom

    proforma: list[dict[str, Any]] = []
    for year in range(1, hold_years + 1):
        growth_factor = (1.0 + rent_growth_pct) ** (year - 1)
        expense_growth_factor = (1.0 + expense_growth_pct) ** (year - 1)

        gross_revenue = base_revenue_cents * growth_factor
        vacancy_loss = gross_revenue * vacancy_pct
        effective_revenue = gross_revenue - vacancy_loss
        operating_expense = effective_revenue * opex_ratio * expense_growth_factor
        ti_lc = gross_area_sf * ti_lc_per_sf_cents
        capex_reserve = gross_area_sf * capex_reserve_per_sf_cents
        noi = effective_revenue - operating_expense - ti_lc - capex_reserve

        proforma.append(
            {
                "year": year,
                "gross_revenue_cents": int(round(gross_revenue)),
                "vacancy_loss_cents": int(round(vacancy_loss)),
                "effective_revenue_cents": int(round(effective_revenue)),
                "operating_expense_cents": int(round(operating_expense)),
                "ti_lc_cents": int(round(ti_lc)),
                "capex_reserve_cents": int(round(capex_reserve)),
                "noi_cents": int(round(noi)),
            }
        )

    stabilized_noi_cents = float(proforma[min(1, len(proforma) - 1)]["noi_cents"])
    direct_cap_value_cents = int(round(stabilized_noi_cents / entry_cap_pct))

    loan_amount_cents = max(0.0, purchase_price_cents * ltv)
    equity_cents = max(0.0, purchase_price_cents - loan_amount_cents)

    debt_schedule = _build_debt_schedule(
        loan_amount_cents=loan_amount_cents,
        debt_rate_pct=debt_rate_pct,
        amort_years=amort_years,
        io_months=io_months,
        hold_years=hold_years,
    )

    unlevered_cfs: list[float] = [-purchase_price_cents]
    levered_cfs: list[float] = [-equity_cents]

    dscr_values: list[float] = []
    for i, year_row in enumerate(proforma):
        debt_service = float(debt_schedule[i]["debt_service_cents"])
        noi = float(year_row["noi_cents"])
        if debt_service > 0:
            dscr = noi / debt_service
            dscr_values.append(dscr)
            debt_schedule[i]["dscr"] = round(dscr, 6)
        else:
            debt_schedule[i]["dscr"] = None

        unlevered_cfs.append(noi)
        levered_cfs.append(noi - debt_service)

    terminal_noi_cents = float(proforma[-1]["noi_cents"]) * (1.0 + rent_growth_pct)
    gross_exit_value_cents = terminal_noi_cents / exit_cap_pct
    net_exit_value_cents = gross_exit_value_cents * (1.0 - sale_cost_pct)
    balloon_balance_cents = float(debt_schedule[-1]["ending_balance_cents"])

    unlevered_cfs[-1] += net_exit_value_cents
    levered_cfs[-1] += net_exit_value_cents - balloon_balance_cents

    levered_irr = _irr(levered_cfs)
    unlevered_irr = _irr(unlevered_cfs)
    npv_cents = _npv(discount_rate_pct, levered_cfs)

    positive_levered = sum(cf for cf in levered_cfs[1:] if cf > 0)
    equity_multiple = (positive_levered / abs(levered_cfs[0])) if levered_cfs[0] != 0 else None

    min_dscr = min(dscr_values) if dscr_values else None
    avg_dscr = (sum(dscr_values) / len(dscr_values)) if dscr_values else None

    valuation = {
        "stabilized_noi_cents": int(round(stabilized_noi_cents)),
        "direct_cap_value_cents": int(round(direct_cap_value_cents)),
        "entry_cap_pct": round(entry_cap_pct, 6),
        "exit_cap_pct": round(exit_cap_pct, 6),
        "gross_exit_value_cents": int(round(gross_exit_value_cents)),
        "net_exit_value_cents": int(round(net_exit_value_cents)),
    }
    returns = {
        "levered_irr": round(levered_irr, 6) if levered_irr is not None else None,
        "unlevered_irr": round(unlevered_irr, 6) if unlevered_irr is not None else None,
        "equity_multiple": round(equity_multiple, 6) if equity_multiple is not None else None,
        "npv_cents": int(round(npv_cents)),
    }
    debt = {
        "loan_amount_cents": int(round(loan_amount_cents)),
        "ltv": round(ltv, 6),
        "debt_rate_pct": round(debt_rate_pct, 6),
        "amort_years": amort_years,
        "io_months": io_months,
        "min_dscr": round(min_dscr, 6) if min_dscr is not None else None,
        "avg_dscr": round(avg_dscr, 6) if avg_dscr is not None else None,
        "balloon_balance_cents": int(round(balloon_balance_cents)),
        "schedule": debt_schedule,
    }

    return {
        "valuation": valuation,
        "returns": returns,
        "debt": debt,
        "proforma": proforma,
        "applied_assumptions": {
            **assumptions,
            "entry_cap_pct": entry_cap_pct,
            "exit_cap_pct": exit_cap_pct,
        },
    }


def _recommendation(property_type: str, levered_irr: float | None, min_dscr: float | None) -> str:
    targets = _TARGETS.get(property_type, _TARGETS["multifamily"])
    irr_target = targets["irr"]
    dscr_target = targets["dscr"]

    irr_value = levered_irr if levered_irr is not None else -1.0
    dscr_value = min_dscr if min_dscr is not None else -1.0

    if irr_value >= irr_target and dscr_value >= dscr_target:
        return "buy"
    if irr_value >= (irr_target - 0.01) and dscr_value >= (dscr_target - 0.10):
        return "reprice"
    return "pass"


def run_underwriting_model(
    *,
    property_inputs: dict[str, Any],
    market_snapshot: dict[str, Any],
    assumptions: dict[str, Any],
    scenario_levers: dict[str, Any],
) -> dict[str, Any]:
    applied_assumptions = apply_scenario_levers(assumptions, scenario_levers)
    core = _core_model(
        property_inputs=property_inputs,
        market_snapshot=market_snapshot,
        assumptions=applied_assumptions,
    )

    base_returns = core["returns"]
    base_debt = core["debt"]

    sensitivity_inputs = [
        ("exit_cap_minus_50bps", {"exit_cap_pct": applied_assumptions["exit_cap_pct"] - 0.005}),
        ("exit_cap_plus_50bps", {"exit_cap_pct": applied_assumptions["exit_cap_pct"] + 0.005}),
        ("rent_growth_minus_100bps", {"rent_growth_pct": applied_assumptions["rent_growth_pct"] - 0.01}),
        ("rent_growth_plus_100bps", {"rent_growth_pct": applied_assumptions["rent_growth_pct"] + 0.01}),
        ("vacancy_minus_200bps", {"vacancy_pct": applied_assumptions["vacancy_pct"] - 0.02}),
        ("vacancy_plus_200bps", {"vacancy_pct": applied_assumptions["vacancy_pct"] + 0.02}),
    ]

    sensitivities: dict[str, Any] = {}
    for key, overrides in sensitivity_inputs:
        tmp_assumptions = dict(applied_assumptions)
        tmp_assumptions.update(overrides)
        tmp = _core_model(
            property_inputs=property_inputs,
            market_snapshot=market_snapshot,
            assumptions=tmp_assumptions,
        )
        sensitivities[key] = {
            "levered_irr": tmp["returns"]["levered_irr"],
            "direct_cap_value_cents": tmp["valuation"]["direct_cap_value_cents"],
        }

    recommendation = _recommendation(
        str(property_inputs.get("property_type") or "multifamily"),
        base_returns.get("levered_irr"),
        base_debt.get("min_dscr"),
    )

    return {
        "valuation": core["valuation"],
        "returns": base_returns,
        "debt": base_debt,
        "sensitivities": sensitivities,
        "proforma": core["proforma"],
        "applied_assumptions": core["applied_assumptions"],
        "recommendation": recommendation,
    }
