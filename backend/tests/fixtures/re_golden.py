"""Golden fixtures for RE valuation reproducibility tests."""

BASE_CASE = {
    "fin_asset_investment_id": "asset_demo_1",
    "quarter": "2026Q1",
    "assumptions": {
        "cap_rate": 0.055,
        "exit_cap_rate": 0.06,
        "discount_rate": 0.08,
        "rent_growth": 0.02,
        "expense_growth": 0.03,
        "vacancy_assumption": 0.05,
        "sale_costs_pct": 0.02,
        "weight_direct_cap": 1.0,
        "weight_dcf": 0.0,
    },
    "financials": {
        "gross_potential_rent": 3600000.0,
        "vacancy_loss": 180000.0,
        "effective_gross_income": 3470000.0,
        "operating_expenses": 1400000.0,
        "net_operating_income": 2070000.0,
    },
    "loan": {
        "current_balance": 20000000.0,
        "interest_rate": 0.05,
        "annual_debt_service": 1200000.0,
    },
    "expected": {
        "implied_gross_value": 37636363.64,
        "implied_equity_value": 17636363.64,
        "nav_equity": 17636363.64,
        "dscr": 1.7250,
        "debt_yield": 0.1035,
        "ltv": 0.531401,
    },
}
