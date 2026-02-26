"""Valuation Service — orchestrates quarterly valuation runs.

Exclusively owns NAV and implied values.  No other module computes these.
Every run produces an immutable valuation_snapshot and asset_financial_state row.
"""

from __future__ import annotations

import subprocess
import uuid
from decimal import Decimal

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import (
    _d,
    calculate_dscr,
    calculate_debt_yield,
    calculate_equity_value,
    calculate_irr,
    calculate_ltv,
    calculate_nav_equity,
    calculate_value_blended,
    calculate_value_dcf,
    calculate_value_direct_cap,
    compute_input_hash,
    compute_sensitivities,
)


def _get_code_version() -> str:
    """Return current git commit hash, or 'unknown'."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()[:12]
    except Exception:
        return "unknown"


# ---------------------------------------------------------------------------
# Assumption set management
# ---------------------------------------------------------------------------

def create_assumption_set(
    *,
    tenant_id: str | None = None,
    business_id: str | None = None,
    cap_rate: float,
    exit_cap_rate: float,
    discount_rate: float,
    rent_growth: float = 0.02,
    expense_growth: float = 0.03,
    vacancy_assumption: float = 0.05,
    sale_costs_pct: float = 0.02,
    capex_reserve_pct: float = 0.0,
    weight_direct_cap: float = 1.0,
    weight_dcf: float = 0.0,
    created_by: str | None = None,
    rationale: str | None = None,
    custom_assumptions: dict | None = None,
) -> dict:
    """Create a new versioned assumption set (append-only)."""
    import json

    assumption_set_id = str(uuid.uuid4())
    serialized = {
        "cap_rate": cap_rate,
        "exit_cap_rate": exit_cap_rate,
        "discount_rate": discount_rate,
        "rent_growth": rent_growth,
        "expense_growth": expense_growth,
        "vacancy_assumption": vacancy_assumption,
        "sale_costs_pct": sale_costs_pct,
        "capex_reserve_pct": capex_reserve_pct,
        "weight_direct_cap": weight_direct_cap,
        "weight_dcf": weight_dcf,
        "custom": custom_assumptions,
    }

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_valuation_assumption_set (
                assumption_set_id, tenant_id, business_id, version_number,
                created_by, rationale,
                cap_rate, exit_cap_rate, discount_rate,
                rent_growth, expense_growth, vacancy_assumption,
                sale_costs_pct, capex_reserve_pct,
                weight_direct_cap, weight_dcf,
                custom_assumptions_json, serialized_json
            ) VALUES (
                %s, %s, %s, 1,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s
            )
            RETURNING *
            """,
            (
                assumption_set_id, tenant_id, business_id,
                created_by, rationale,
                cap_rate, exit_cap_rate, discount_rate,
                rent_growth, expense_growth, vacancy_assumption,
                sale_costs_pct, capex_reserve_pct,
                weight_direct_cap, weight_dcf,
                json.dumps(custom_assumptions),
                json.dumps(serialized),
            ),
        )
        row = cur.fetchone()

    emit_log(
        level="info",
        service="re_valuation",
        action="assumption_set.created",
        message=f"Created assumption set {assumption_set_id}",
        context={"assumption_set_id": assumption_set_id},
    )
    return row


def get_assumption_set(assumption_set_id: str) -> dict:
    """Fetch a single assumption set by ID."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_valuation_assumption_set WHERE assumption_set_id = %s",
            (assumption_set_id,),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Assumption set not found: {assumption_set_id}")
    return row


# ---------------------------------------------------------------------------
# Quarterly financial data
# ---------------------------------------------------------------------------

def upsert_quarterly_financials(
    *,
    fin_asset_investment_id: str,
    quarter: str,
    gross_potential_rent: float,
    vacancy_loss: float,
    effective_gross_income: float,
    operating_expenses: float,
    net_operating_income: float,
    occupancy_pct: float | None = None,
    capex: float = 0,
    other_income: float = 0,
) -> dict:
    """Insert or update raw quarterly operating data for an asset."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_asset_quarterly_financials (
                fin_asset_investment_id, quarter,
                gross_potential_rent, vacancy_loss, effective_gross_income,
                operating_expenses, net_operating_income,
                occupancy_pct, capex, other_income
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_asset_investment_id, quarter)
            DO UPDATE SET
                gross_potential_rent = EXCLUDED.gross_potential_rent,
                vacancy_loss = EXCLUDED.vacancy_loss,
                effective_gross_income = EXCLUDED.effective_gross_income,
                operating_expenses = EXCLUDED.operating_expenses,
                net_operating_income = EXCLUDED.net_operating_income,
                occupancy_pct = EXCLUDED.occupancy_pct,
                capex = EXCLUDED.capex,
                other_income = EXCLUDED.other_income
            RETURNING *
            """,
            (
                fin_asset_investment_id, quarter,
                gross_potential_rent, vacancy_loss, effective_gross_income,
                operating_expenses, net_operating_income,
                occupancy_pct, capex, other_income,
            ),
        )
        return cur.fetchone()


def get_quarterly_financials(fin_asset_investment_id: str, quarter: str) -> dict:
    """Fetch quarterly operating data for an asset."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_asset_quarterly_financials
            WHERE fin_asset_investment_id = %s AND quarter = %s
            """,
            (fin_asset_investment_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(
            f"No quarterly financials for asset {fin_asset_investment_id} quarter {quarter}"
        )
    return row


# ---------------------------------------------------------------------------
# Loan management
# ---------------------------------------------------------------------------

def create_loan(
    *,
    fin_asset_investment_id: str,
    original_balance: float,
    current_balance: float,
    interest_rate: float,
    amortization_years: int | None = None,
    term_years: int | None = None,
    maturity_date: str | None = None,
    io_period_months: int = 0,
    loan_type: str = "fixed",
    annual_debt_service: float | None = None,
    lender: str | None = None,
) -> dict:
    """Create a loan record for an asset."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_loan (
                fin_asset_investment_id, lender,
                original_balance, current_balance, interest_rate,
                amortization_years, term_years, maturity_date,
                io_period_months, loan_type, annual_debt_service
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                fin_asset_investment_id, lender,
                original_balance, current_balance, interest_rate,
                amortization_years, term_years, maturity_date,
                io_period_months, loan_type, annual_debt_service,
            ),
        )
        return cur.fetchone()


def get_loans_for_asset(fin_asset_investment_id: str) -> list[dict]:
    """Fetch all loans for an asset."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_loan WHERE fin_asset_investment_id = %s ORDER BY created_at",
            (fin_asset_investment_id,),
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Core valuation run
# ---------------------------------------------------------------------------

def run_quarter(
    *,
    fin_asset_investment_id: str,
    quarter: str,
    assumption_set_id: str,
    fin_fund_id: str | None = None,
    forward_noi_override: float | None = None,
    accrued_pref: float = 0,
    deduct_pref_from_nav: bool = False,
    cumulative_contributions: float = 0,
    cumulative_distributions: float = 0,
    cashflows_for_irr: list[tuple[float, float]] | None = None,
) -> dict:
    """Execute a full quarterly valuation run for one asset.

    Steps:
    1. Read quarterly financials and loan data
    2. Compute valuation (direct cap, DCF, blended) using assumption set
    3. Compute debt metrics (DSCR, debt yield, LTV)
    4. Compute sensitivities
    5. Compute IRR to date (if cashflows provided)
    6. Create immutable valuation_snapshot
    7. Create immutable asset_financial_state
    8. Return the complete state

    This function is the ONLY entry point for producing NAV.
    """
    # --- 1. Load inputs ---
    assumptions = get_assumption_set(assumption_set_id)
    financials = get_quarterly_financials(fin_asset_investment_id, quarter)
    loans = get_loans_for_asset(fin_asset_investment_id)

    # Aggregate loan data
    total_loan_balance = sum(_d(ln["current_balance"]) for ln in loans)
    total_debt_service = sum(_d(ln.get("annual_debt_service") or 0) for ln in loans)
    weighted_rate = (
        sum(_d(ln["current_balance"]) * _d(ln["interest_rate"]) for ln in loans) / total_loan_balance
        if total_loan_balance > 0 else Decimal(0)
    )

    noi = _d(financials["net_operating_income"])
    forward_noi = _d(forward_noi_override) if forward_noi_override is not None else noi

    # --- 2. Valuation ---
    cap_rate = _d(assumptions["cap_rate"])
    exit_cap = _d(assumptions["exit_cap_rate"])
    discount = _d(assumptions["discount_rate"])
    rg = _d(assumptions["rent_growth"])
    eg = _d(assumptions["expense_growth"])
    vac = _d(assumptions["vacancy_assumption"])
    w_cap = _d(assumptions["weight_direct_cap"])
    w_dcf = _d(assumptions["weight_dcf"])
    capex_pct = _d(assumptions.get("capex_reserve_pct") or 0)

    value_cap = calculate_value_direct_cap(forward_noi, cap_rate)
    value_dcf = None
    if w_dcf > 0:
        value_dcf = calculate_value_dcf(
            base_noi=noi,
            rent_growth=rg,
            expense_growth=eg,
            vacancy_assumption=vac,
            exit_cap_rate=exit_cap,
            discount_rate=discount,
            capex_reserve_pct=capex_pct,
        )

    if value_dcf is not None and w_cap > 0 and w_dcf > 0:
        method_used = "blended"
        implied_gross = calculate_value_blended(value_cap, value_dcf, w_cap, w_dcf)
    elif value_dcf is not None and w_dcf > 0:
        method_used = "dcf"
        implied_gross = value_dcf
    else:
        method_used = "direct_cap"
        implied_gross = value_cap

    # --- 3. Debt metrics ---
    equity = calculate_equity_value(implied_gross, total_loan_balance)
    nav = calculate_nav_equity(equity, _d(accrued_pref), deduct_pref_from_nav)

    dscr = calculate_dscr(noi, total_debt_service) if total_debt_service > 0 else None
    dy = calculate_debt_yield(noi, total_loan_balance) if total_loan_balance > 0 else None
    ltv = calculate_ltv(total_loan_balance, implied_gross) if implied_gross > 0 else None

    unrealized_gain = equity - _d(cumulative_contributions) + _d(cumulative_distributions)

    # --- 4. Sensitivities ---
    sensitivities = compute_sensitivities(
        forward_noi, total_loan_balance, total_debt_service, cap_rate
    ) if total_debt_service > 0 else {}

    # --- 5. IRR ---
    irr = None
    if cashflows_for_irr:
        # Append current NAV as final cash flow
        last_t = cashflows_for_irr[-1][0] if cashflows_for_irr else 0.0
        cf_with_nav = list(cashflows_for_irr) + [(last_t, float(nav))]
        irr = calculate_irr(cf_with_nav)

    # --- 6. Input hash ---
    hash_inputs = {
        "fin_asset_investment_id": fin_asset_investment_id,
        "quarter": quarter,
        "assumption_set_id": assumption_set_id,
        "financials": {
            k: str(v) for k, v in financials.items()
            if k not in ("id", "created_at")
        },
        "loans": [
            {k: str(v) for k, v in ln.items() if k not in ("re_loan_id", "created_at")}
            for ln in loans
        ],
        "forward_noi_override": str(forward_noi_override) if forward_noi_override else None,
        "accrued_pref": str(accrued_pref),
        "deduct_pref_from_nav": deduct_pref_from_nav,
    }
    input_hash = compute_input_hash(hash_inputs)
    code_version = _get_code_version()

    # --- 7. Store valuation snapshot ---
    snapshot_id = str(uuid.uuid4())
    import json

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_valuation_snapshot (
                valuation_snapshot_id, fin_asset_investment_id, quarter,
                assumption_set_id, method_used,
                implied_value_cap, implied_value_dcf, implied_value_blended,
                implied_equity_value, nav_equity, unrealized_gain,
                irr_to_date, sensitivities_json,
                input_hash, code_version
            ) VALUES (
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s
            )
            RETURNING *
            """,
            (
                snapshot_id, fin_asset_investment_id, quarter,
                assumption_set_id, method_used,
                str(value_cap), str(value_dcf) if value_dcf else None, str(implied_gross),
                str(equity), str(nav), str(unrealized_gain),
                irr, json.dumps(sensitivities),
                input_hash, code_version,
            ),
        )
        snapshot = cur.fetchone()

    # --- 8. Store asset financial state ---
    state_id = str(uuid.uuid4())

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_asset_financial_state (
                id, fin_asset_investment_id, fin_fund_id, quarter,
                valuation_snapshot_id,
                trailing_noi, forward_12_noi,
                gross_potential_rent, vacancy_loss, effective_gross_income,
                operating_expenses, net_operating_income,
                loan_balance, interest_rate, debt_service,
                dscr, debt_yield, ltv,
                implied_gross_value, implied_equity_value, nav_equity,
                unfunded_capex, accrued_pref,
                cumulative_contributions, cumulative_distributions
            ) VALUES (
                %s, %s, %s, %s,
                %s,
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s
            )
            RETURNING *
            """,
            (
                state_id, fin_asset_investment_id, fin_fund_id, quarter,
                snapshot_id,
                str(noi), str(forward_noi),
                str(financials["gross_potential_rent"]),
                str(financials["vacancy_loss"]),
                str(financials["effective_gross_income"]),
                str(financials["operating_expenses"]),
                str(noi),
                str(total_loan_balance), str(weighted_rate), str(total_debt_service),
                str(dscr) if dscr else None,
                str(dy) if dy else None,
                str(ltv) if ltv else None,
                str(implied_gross), str(equity), str(nav),
                str(financials.get("capex") or 0),
                str(accrued_pref),
                str(cumulative_contributions),
                str(cumulative_distributions),
            ),
        )
        state = cur.fetchone()

    emit_log(
        level="info",
        service="re_valuation",
        action="valuation.run_quarter",
        message=f"Quarterly valuation complete for asset {fin_asset_investment_id} {quarter}",
        context={
            "fin_asset_investment_id": fin_asset_investment_id,
            "quarter": quarter,
            "valuation_snapshot_id": snapshot_id,
            "asset_financial_state_id": state_id,
            "method": method_used,
            "nav_equity": str(nav),
            "input_hash": input_hash,
        },
    )

    return {
        "valuation_snapshot": snapshot,
        "asset_financial_state": state,
        "input_hash": input_hash,
    }


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def get_asset_financial_state(fin_asset_investment_id: str, quarter: str) -> dict:
    """Get the most recent asset financial state for a given quarter."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT afs.*, vs.sensitivities_json, vs.input_hash, vs.code_version
            FROM re_asset_financial_state afs
            JOIN re_valuation_snapshot vs ON vs.valuation_snapshot_id = afs.valuation_snapshot_id
            WHERE afs.fin_asset_investment_id = %s AND afs.quarter = %s
            ORDER BY afs.created_at DESC
            LIMIT 1
            """,
            (fin_asset_investment_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(
            f"No financial state for asset {fin_asset_investment_id} quarter {quarter}"
        )
    return row


def get_asset_financial_states_for_fund(fin_fund_id: str, quarter: str) -> list[dict]:
    """Get all asset financial states for a fund in a given quarter."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (fin_asset_investment_id)
                afs.*
            FROM re_asset_financial_state afs
            WHERE afs.fin_fund_id = %s AND afs.quarter = %s
            ORDER BY fin_asset_investment_id, afs.created_at DESC
            """,
            (fin_fund_id, quarter),
        )
        return cur.fetchall()


def list_valuation_snapshots(
    fin_asset_investment_id: str, limit: int = 20
) -> list[dict]:
    """List valuation snapshots for an asset, most recent first."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_valuation_snapshot
            WHERE fin_asset_investment_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (fin_asset_investment_id, limit),
        )
        return cur.fetchall()
