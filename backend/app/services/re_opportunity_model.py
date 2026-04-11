"""
Assumption versions, model runs, IC approval, and investment conversion
for the REPE opportunity sourcing layer.

Rollup isolation guarantee:
  - run_opportunity_model() writes ONLY to repe_opportunity_model_outputs
    and repe_opportunity_model_runs.
  - Official quarter-state tables are never touched until convert_to_investment()
    is called (stage = 'live').
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import psycopg.rows

from app.db import get_cursor, _get_pool
from app.services.re_opportunities import (
    get_opportunity,
    advance_stage,
    compute_composite_score,
)

logger = logging.getLogger(__name__)


# ── Reporting period helper ───────────────────────────────────────────────────

def resolve_open_reporting_period(env_id: str | UUID) -> str:
    """
    Return the current open reporting quarter for an env as 'YYYY-Qn'.

    Logic:
    1. Query re_fund_quarter_state for the most recent closed quarter in this env.
    2. If found, return the next quarter.
    3. If no data, return the current calendar quarter.
    """
    env = str(env_id)
    today = date.today()

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT fqs.quarter
                FROM re_fund_quarter_state fqs
                JOIN repe_fund f ON f.fund_id = fqs.fund_id
                WHERE f.env_id = %s
                   OR fqs.fund_id IN (
                       SELECT fund_id FROM repe_fund WHERE env_id = %s
                   )
                ORDER BY fqs.quarter DESC
                LIMIT 1
                """,
                [env, env],
            )
            row = cur.fetchone()
            if row:
                return _next_quarter(row["quarter"])
    except Exception:  # noqa: BLE001
        pass

    return _current_quarter(today)


def _current_quarter(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _next_quarter(quarter: str) -> str:
    year = int(quarter[:4])
    q = int(quarter[-1])
    if q == 4:
        return f"{year + 1}-Q1"
    return f"{year}-Q{q + 1}"


def _q(v) -> Decimal | None:
    if v is None:
        return None
    return Decimal(str(v))


def _hash_dict(d: dict) -> str:
    return hashlib.sha256(json.dumps(d, sort_keys=True, default=str).encode()).hexdigest()[:16]


# ── Assumption versions ────────────────────────────────────────────────────────

def list_assumption_versions(opportunity_id: str | UUID) -> list[dict]:
    """Return all assumption versions ordered by version_number DESC."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM repe_opportunity_assumption_versions
            WHERE opportunity_id = %s
            ORDER BY version_number DESC
            """,
            [str(opportunity_id)],
        )
        return list(cur.fetchall())


def get_assumption_version(assumption_version_id: str | UUID) -> dict:
    """Return a single assumption version or raise LookupError."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM repe_opportunity_assumption_versions WHERE assumption_version_id = %s",
            [str(assumption_version_id)],
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Assumption version {assumption_version_id} not found")
    return dict(row)


def create_assumption_version(
    opportunity_id: str | UUID,
    env_id: str | UUID,
    payload: dict,
) -> dict:
    """
    Create a new assumption version.  Auto-increments version_number.
    Sets is_current=True, clears is_current on previous versions.
    Updates opportunity.current_assumption_version_id.
    """
    opp_id = str(opportunity_id)
    env = str(env_id)
    p = dict(payload)

    with get_cursor() as cur:
        # Next version number
        cur.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_v "
            "FROM repe_opportunity_assumption_versions WHERE opportunity_id = %s",
            [opp_id],
        )
        next_v = cur.fetchone()["next_v"]

        # Clear current flag on existing versions
        cur.execute(
            "UPDATE repe_opportunity_assumption_versions SET is_current = false "
            "WHERE opportunity_id = %s",
            [opp_id],
        )

        cur.execute(
            """
            INSERT INTO repe_opportunity_assumption_versions (
                env_id, opportunity_id, version_number, label,
                purchase_price, equity_check, loan_amount, ltv,
                interest_rate_pct, io_period_months, amort_years,
                loan_term_years, base_noi, rent_growth_pct, vacancy_pct,
                expense_growth_pct, mgmt_fee_pct, exit_cap_rate_pct,
                exit_year, disposition_cost_pct, discount_rate_pct,
                hold_years, capex_reserve_pct, fee_load_pct,
                operating_json, lease_json, capex_json, debt_json, exit_json,
                is_current, notes, created_by
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s, %s,
                true, %s, %s
            )
            RETURNING *
            """,
            [
                env, opp_id, next_v, p.get("label"),
                _q(p.get("purchase_price")), _q(p.get("equity_check")),
                _q(p.get("loan_amount")), _q(p.get("ltv")),
                _q(p.get("interest_rate_pct")), p.get("io_period_months"),
                p.get("amort_years"), p.get("loan_term_years"),
                _q(p.get("base_noi")), _q(p.get("rent_growth_pct")),
                _q(p.get("vacancy_pct")), _q(p.get("expense_growth_pct")),
                _q(p.get("mgmt_fee_pct")), _q(p.get("exit_cap_rate_pct")),
                p.get("exit_year", 5), _q(p.get("disposition_cost_pct", 0.02)),
                _q(p.get("discount_rate_pct")),
                p.get("hold_years", 5), _q(p.get("capex_reserve_pct")),
                _q(p.get("fee_load_pct", 0.015)),
                json.dumps(p.get("operating_json") or {}),
                json.dumps(p.get("lease_json") or {}),
                json.dumps(p.get("capex_json") or {}),
                json.dumps(p.get("debt_json") or {}),
                json.dumps(p.get("exit_json") or {}),
                p.get("notes"), p.get("created_by"),
            ],
        )
        row = dict(cur.fetchone())
        av_id = row["assumption_version_id"]

        # Update opportunity.current_assumption_version_id
        cur.execute(
            "UPDATE repe_opportunities SET current_assumption_version_id = %s "
            "WHERE opportunity_id = %s",
            [av_id, opp_id],
        )

    return row


def update_assumption_version(assumption_version_id: str | UUID, payload: dict) -> dict:
    """
    In-place update of an assumption version.
    Raises ValueError if a completed model run exists for this version.
    """
    av_id = str(assumption_version_id)

    # Check for completed model runs
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM repe_opportunity_model_runs
            WHERE assumption_version_id = %s AND status = 'completed'
            LIMIT 1
            """,
            [av_id],
        )
        if cur.fetchone():
            raise ValueError(
                f"Assumption version {av_id} has completed model runs — "
                "create a new version instead"
            )

    allowed = {
        "label", "purchase_price", "equity_check", "loan_amount", "ltv",
        "interest_rate_pct", "io_period_months", "amort_years", "loan_term_years",
        "base_noi", "rent_growth_pct", "vacancy_pct", "expense_growth_pct",
        "mgmt_fee_pct", "exit_cap_rate_pct", "exit_year", "disposition_cost_pct",
        "discount_rate_pct", "hold_years", "capex_reserve_pct", "fee_load_pct",
        "operating_json", "lease_json", "capex_json", "debt_json", "exit_json",
        "notes",
    }
    money_fields = {
        "purchase_price", "equity_check", "loan_amount", "base_noi",
    }
    decimal_fields = {
        "ltv", "interest_rate_pct", "rent_growth_pct", "vacancy_pct",
        "expense_growth_pct", "mgmt_fee_pct", "exit_cap_rate_pct",
        "disposition_cost_pct", "discount_rate_pct", "capex_reserve_pct", "fee_load_pct",
    }

    updates: dict = {}
    for k, v in payload.items():
        if k not in allowed:
            continue
        if k in money_fields or k in decimal_fields:
            updates[k] = _q(v)
        elif k in {"operating_json", "lease_json", "capex_json", "debt_json", "exit_json"}:
            updates[k] = json.dumps(v or {})
        else:
            updates[k] = v

    if not updates:
        return get_assumption_version(av_id)

    set_clauses = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [av_id]

    with get_cursor() as cur:
        cur.execute(
            f"UPDATE repe_opportunity_assumption_versions SET {set_clauses} "
            f"WHERE assumption_version_id = %s RETURNING *",
            values,
        )
        row = cur.fetchone()

    if row is None:
        raise LookupError(f"Assumption version {av_id} not found")
    return dict(row)


# ── Model runs ────────────────────────────────────────────────────────────────

def list_model_runs(opportunity_id: str | UUID) -> list[dict]:
    """Return model runs with output if completed, ordered by started_at DESC."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                mr.*,
                mo.gross_irr, mo.net_irr, mo.gross_equity_multiple,
                mo.net_equity_multiple, mo.tvpi, mo.dpi, mo.nav,
                mo.min_dscr, mo.exit_ltv, mo.debt_yield,
                mo.engine_version, mo.run_timestamp AS output_run_timestamp,
                mo.output_id
            FROM repe_opportunity_model_runs mr
            LEFT JOIN repe_opportunity_model_outputs mo
                ON mo.model_run_id = mr.model_run_id
            WHERE mr.opportunity_id = %s
            ORDER BY mr.started_at DESC
            """,
            [str(opportunity_id)],
        )
        return list(cur.fetchall())


def get_model_run(model_run_id: str | UUID) -> dict:
    """Return a model run with its output if completed."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                mr.*,
                mo.output_id,
                mo.assumption_version_id AS output_assumption_version_id,
                mo.engine_version, mo.run_timestamp AS output_run_timestamp,
                mo.gross_irr, mo.net_irr, mo.gross_equity_multiple,
                mo.net_equity_multiple, mo.tvpi, mo.dpi, mo.nav,
                mo.min_dscr, mo.exit_ltv, mo.debt_yield, mo.cashflow_json
            FROM repe_opportunity_model_runs mr
            LEFT JOIN repe_opportunity_model_outputs mo
                ON mo.model_run_id = mr.model_run_id
            WHERE mr.model_run_id = %s
            """,
            [str(model_run_id)],
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"Model run {model_run_id} not found")
    return dict(row)


def trigger_model_run(
    opportunity_id: str | UUID,
    assumption_version_id: str | UUID,
    triggered_by: str = "api",
) -> dict:
    """
    Create a model run record, call run_opportunity_model(), update status.
    On success, updates score_return_modeled and recomputes composite.
    """
    opp = get_opportunity(opportunity_id)
    av = get_assumption_version(assumption_version_id)

    input_data = {
        "assumption_version_id": str(assumption_version_id),
        "purchase_price": str(av.get("purchase_price")),
        "base_noi": str(av.get("base_noi")),
        "ltv": str(av.get("ltv")),
        "hold_years": av.get("hold_years"),
    }
    input_hash = _hash_dict(input_data)

    # Create model run record
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunity_model_runs
                (env_id, opportunity_id, assumption_version_id,
                 status, input_hash, triggered_by)
            VALUES (%s, %s, %s, 'in_progress', %s, %s)
            RETURNING *
            """,
            [
                str(opp["env_id"]),
                str(opportunity_id),
                str(assumption_version_id),
                input_hash,
                triggered_by,
            ],
        )
        run = dict(cur.fetchone())
    run_id = run["model_run_id"]

    try:
        # Lazy import to avoid circular imports
        from app.services.re_scenario_engine_v2 import run_opportunity_model

        result = run_opportunity_model(
            assumption_version_id=UUID(str(assumption_version_id)),
            model_run_id=UUID(str(run_id)),
            env_id=str(opp["env_id"]),
            opportunity_id=str(opportunity_id),
        )

        # Mark completed
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE repe_opportunity_model_runs
                SET status = 'completed', completed_at = now()
                WHERE model_run_id = %s
                """,
                [str(run_id)],
            )

        # Update return score and recompute composite
        gross_irr = result.get("gross_irr")
        gross_em = result.get("gross_equity_multiple")
        _update_return_score_modeled(opportunity_id, gross_irr=gross_irr, equity_multiple=gross_em)

        return get_model_run(run_id)

    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE repe_opportunity_model_runs
                SET status = 'failed', error_message = %s
                WHERE model_run_id = %s
                """,
                [str(exc), str(run_id)],
            )
        raise


def _update_return_score_modeled(
    opportunity_id: str | UUID,
    gross_irr: float | None,
    equity_multiple: float | None,
) -> None:
    """
    Derive score_return_modeled from model outputs and recompute composite.

    IRR-to-score mapping:
        IRR >= 25%  → 100
        IRR >= 20%  → 90
        IRR >= 15%  → 75
        IRR >= 12%  → 60
        IRR >= 8%   → 40
        IRR < 8%    → 20

    MOIC adjustment (additive, capped at 100):
        EM >= 3.0  → +10
        EM >= 2.5  → +5
        EM >= 2.0  → +0
        EM < 1.5   → -10
    """
    irr_score = 50.0  # neutral default
    if gross_irr is not None:
        g = float(gross_irr)
        if g >= 0.25:
            irr_score = 100.0
        elif g >= 0.20:
            irr_score = 90.0
        elif g >= 0.15:
            irr_score = 75.0
        elif g >= 0.12:
            irr_score = 60.0
        elif g >= 0.08:
            irr_score = 40.0
        else:
            irr_score = 20.0

    em_adj = 0.0
    if equity_multiple is not None:
        em = float(equity_multiple)
        if em >= 3.0:
            em_adj = 10.0
        elif em >= 2.5:
            em_adj = 5.0
        elif em < 1.5:
            em_adj = -10.0

    score_return_modeled = max(0.0, min(100.0, irr_score + em_adj))

    opp = get_opportunity(opportunity_id)
    new_composite = compute_composite_score(
        score_return_estimated=opp.get("score_return_estimated"),
        score_return_modeled=score_return_modeled,
        score_source="modeled",
        score_fund_fit=opp.get("score_fund_fit"),
        score_signal=opp.get("score_signal"),
        score_execution=opp.get("score_execution"),
        score_risk_penalty=opp.get("score_risk_penalty"),
    )

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE repe_opportunities
            SET score_return_modeled = %s,
                score_source = 'modeled',
                composite_score = %s
            WHERE opportunity_id = %s
            """,
            [score_return_modeled, new_composite, str(opportunity_id)],
        )


# ── Fund impact ───────────────────────────────────────────────────────────────

def compute_fund_impact(
    opportunity_id: str | UUID,
    fund_id: str | UUID,
    model_run_id: str | UUID,
) -> dict:
    """
    Compute pre/post fund impact metrics and persist to repe_opportunity_fund_impacts.
    """
    opp = get_opportunity(opportunity_id)
    run = get_model_run(model_run_id)

    if run.get("status") != "completed":
        raise ValueError("Cannot compute fund impact: model run is not completed")

    fund_id_str = str(fund_id)

    # Fetch current fund state
    fund_state = _get_latest_fund_state_for_impact(fund_id_str)

    nav_before = float(fund_state.get("ending_nav") or 0) if fund_state else 0.0
    irr_before = float(fund_state.get("fund_irr") or 0) if fund_state else 0.0
    tvpi_before = float(fund_state.get("tvpi") or 0) if fund_state else 0.0
    cap_before = float(fund_state.get("uncalled_capital") or 0) if fund_state else 0.0
    lev_before = float(fund_state.get("leverage_ratio") or 0) if fund_state else 0.0

    # Estimate post-impact (simplified: add opp metrics proportionally)
    opp_nav = float(run.get("nav") or 0)
    opp_eq = float(opp.get("target_equity_check") or 0)
    opp_irr = float(run.get("gross_irr") or 0)
    opp_tvpi = float(run.get("tvpi") or 0)

    nav_after = nav_before + opp_nav
    irr_after = (
        ((irr_before * nav_before) + (opp_irr * opp_eq)) / (nav_before + opp_eq)
        if (nav_before + opp_eq) > 0 else irr_before
    )
    tvpi_after = (
        ((tvpi_before * nav_before) + (opp_tvpi * opp_eq)) / (nav_before + opp_eq)
        if (nav_before + opp_eq) > 0 else tvpi_before
    )
    cap_after = max(0.0, cap_before - opp_eq)
    lev_after = lev_before  # simplified — full model recalculates

    irr_delta = irr_after - irr_before
    tvpi_delta = tvpi_after - tvpi_before
    nav_delta = nav_after - nav_before

    # 6-component fund fit breakdown
    from app.services.re_opportunities import _score_fund_fit
    fund_fit = _score_fund_fit(opportunity_id, fund_id)

    allocation_pct = (opp_eq / nav_before * 100) if nav_before > 0 else 0.0

    # Build fit breakdown for storage
    fit_breakdown = {
        "mandate": 50.0,
        "geography": 50.0,
        "concentration": 65.0,
        "capital_availability": max(0.0, min(100.0, (1.0 - opp_eq / cap_before * 1.0) * 100)) if cap_before > 0 else 50.0,
        "duration": 50.0,
        "leverage_tolerance": max(0.0, min(100.0, (1.0 - float(opp.get("target_ltv") or 0.65)) * 150)) if opp.get("target_ltv") else 50.0,
    }

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunity_fund_impacts (
                env_id, opportunity_id, model_run_id, fund_id,
                fund_nav_before, fund_nav_after,
                fund_gross_irr_before, fund_gross_irr_after,
                fund_tvpi_before, fund_tvpi_after,
                irr_delta, tvpi_delta, nav_delta,
                capital_available_before, capital_available_after,
                leverage_ratio_before, leverage_ratio_after,
                fund_fit_score, fit_rationale, allocation_pct,
                fund_fit_breakdown_json
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s
            )
            ON CONFLICT (opportunity_id, model_run_id, fund_id) DO UPDATE SET
                fund_nav_before = EXCLUDED.fund_nav_before,
                fund_nav_after = EXCLUDED.fund_nav_after,
                fund_gross_irr_before = EXCLUDED.fund_gross_irr_before,
                fund_gross_irr_after = EXCLUDED.fund_gross_irr_after,
                fund_tvpi_before = EXCLUDED.fund_tvpi_before,
                fund_tvpi_after = EXCLUDED.fund_tvpi_after,
                irr_delta = EXCLUDED.irr_delta,
                tvpi_delta = EXCLUDED.tvpi_delta,
                nav_delta = EXCLUDED.nav_delta,
                capital_available_before = EXCLUDED.capital_available_before,
                capital_available_after = EXCLUDED.capital_available_after,
                leverage_ratio_before = EXCLUDED.leverage_ratio_before,
                leverage_ratio_after = EXCLUDED.leverage_ratio_after,
                fund_fit_score = EXCLUDED.fund_fit_score,
                fit_rationale = EXCLUDED.fit_rationale,
                allocation_pct = EXCLUDED.allocation_pct,
                fund_fit_breakdown_json = EXCLUDED.fund_fit_breakdown_json
            RETURNING *
            """,
            [
                str(opp["env_id"]),
                str(opportunity_id),
                str(model_run_id),
                fund_id_str,
                _q(nav_before), _q(nav_after),
                _q(irr_before), _q(irr_after),
                _q(tvpi_before), _q(tvpi_after),
                _q(irr_delta), _q(tvpi_delta), _q(nav_delta),
                _q(cap_before), _q(cap_after),
                _q(lev_before), _q(lev_after),
                _q(fund_fit), None, _q(allocation_pct),
                json.dumps(fit_breakdown),
            ],
        )
        row = dict(cur.fetchone())

    return row


def get_fund_impact(opportunity_id: str | UUID) -> list[dict]:
    """Return all fund impact rows for an opportunity."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT fi.*
            FROM repe_opportunity_fund_impacts fi
            WHERE fi.opportunity_id = %s
            ORDER BY fi.created_at DESC
            """,
            [str(opportunity_id)],
        )
        return list(cur.fetchall())


# ── IC approval ───────────────────────────────────────────────────────────────

def approve_opportunity(
    opportunity_id: str | UUID,
    ic_memo_text: str | None = None,
    approved_by: str | None = None,
) -> dict:
    """
    IC approval action.

    Validates:
    - stage == 'ic_ready'
    - current_assumption_version_id is set
    - at least one completed model run exists

    Creates repe_opportunity_promotions row.
    Advances stage to 'approved'.
    Does NOT create a real investment.
    """
    opp = get_opportunity(opportunity_id)

    if opp["stage"] != "ic_ready":
        raise ValueError(
            f"Cannot approve: stage must be 'ic_ready', got '{opp['stage']}'"
        )
    if not opp.get("current_assumption_version_id"):
        raise ValueError("Cannot approve: no assumption version set")

    # Check for completed model run
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT model_run_id, assumption_version_id
            FROM repe_opportunity_model_runs
            WHERE opportunity_id = %s AND status = 'completed'
            ORDER BY started_at DESC
            LIMIT 1
            """,
            [str(opportunity_id)],
        )
        run_row = cur.fetchone()

    if run_row is None:
        raise ValueError("Cannot approve: no completed model run exists")

    # Create promotion record
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO repe_opportunity_promotions (
                env_id, opportunity_id, assumption_version_id,
                model_run_id, promotion_status, ic_memo_text, approved_by,
                approved_at
            ) VALUES (%s, %s, %s, %s, 'approved', %s, %s, now())
            RETURNING *
            """,
            [
                str(opp["env_id"]),
                str(opportunity_id),
                str(opp["current_assumption_version_id"]),
                str(run_row["model_run_id"]),
                ic_memo_text,
                approved_by,
            ],
        )
        promotion = dict(cur.fetchone())

    # Advance stage
    advance_stage(opportunity_id, "approved")

    return promotion


def get_promotion(opportunity_id: str | UUID) -> dict | None:
    """Return the most recent promotion record for an opportunity."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM repe_opportunity_promotions
            WHERE opportunity_id = %s
            ORDER BY promoted_at DESC
            LIMIT 1
            """,
            [str(opportunity_id)],
        )
        row = cur.fetchone()
    return dict(row) if row else None


# ── Convert to investment ──────────────────────────────────────────────────────

def convert_to_investment(
    opportunity_id: str | UUID,
    fund_id: str | UUID,
    promoted_by: str | None = None,
) -> dict:
    """
    Convert an approved opportunity to a real investment.

    Executes in a single database transaction:
    1. Creates repe_deal (investment)
    2. Creates repe_asset + repe_property_asset
    3. Writes re_asset_quarter_state for the current open reporting period
    4. Writes re_investment_quarter_state for the current open reporting period
    5. Updates repe_opportunities.promoted_investment_id
    6. Sets stage = 'live'
    7. Updates repe_opportunity_promotions.conversion_status = 'completed'

    If any step fails, the transaction rolls back completely and
    conversion_status = 'failed' is recorded with conversion_error.
    """
    opp = get_opportunity(opportunity_id)

    if opp["stage"] != "approved":
        raise ValueError(
            f"Cannot convert: stage must be 'approved', got '{opp['stage']}'"
        )

    promotion = get_promotion(opportunity_id)
    if promotion is None:
        raise ValueError("Cannot convert: no promotion record found")

    env_id = str(opp["env_id"])
    fund_id_str = str(fund_id)
    quarter = resolve_open_reporting_period(env_id)

    # All writes in a single transaction
    pool = _get_pool()
    deal_id: str | None = None

    try:
        with pool.connection() as conn:
            conn.autocommit = False
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:

                # 1. Create repe_deal (investment)
                cur.execute(
                    """
                    INSERT INTO repe_deal (fund_id, name, deal_type, stage)
                    VALUES (%s, %s, 'equity', 'closing')
                    RETURNING deal_id
                    """,
                    [fund_id_str, opp["name"]],
                )
                deal_id = str(cur.fetchone()["deal_id"])

                # 2. Create repe_asset
                cur.execute(
                    """
                    INSERT INTO repe_asset (deal_id, asset_type, name)
                    VALUES (%s, 'property', %s)
                    RETURNING asset_id
                    """,
                    [deal_id, opp["name"]],
                )
                asset_id = str(cur.fetchone()["asset_id"])

                # 3. Create repe_property_asset
                av = None
                if opp.get("current_assumption_version_id"):
                    cur.execute(
                        "SELECT * FROM repe_opportunity_assumption_versions "
                        "WHERE assumption_version_id = %s",
                        [str(opp["current_assumption_version_id"])],
                    )
                    av_row = cur.fetchone()
                    av = dict(av_row) if av_row else None

                cur.execute(
                    """
                    INSERT INTO repe_property_asset
                        (asset_id, property_type, market, current_noi)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [
                        asset_id,
                        opp.get("property_type"),
                        opp.get("market"),
                        _q(av.get("base_noi")) if av else None,
                    ],
                )

                # 4. Stub re_asset_quarter_state for current open period
                stub_run_id = str(uuid4())
                inputs_hash = _hash_dict({"asset_id": asset_id, "quarter": quarter})
                cur.execute(
                    """
                    INSERT INTO re_asset_quarter_state (
                        asset_id, quarter, run_id,
                        noi, revenue, debt_service,
                        asset_value, nav, inputs_hash
                    ) VALUES (%s, %s, %s::uuid, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    [
                        asset_id, quarter, stub_run_id,
                        _q(av.get("base_noi")) if av else None,
                        _q(av.get("base_noi")) if av else None,
                        None, None, None,
                        inputs_hash,
                    ],
                )

                # 5. Stub re_investment_quarter_state
                inv_inputs_hash = _hash_dict({"deal_id": deal_id, "quarter": quarter})
                cur.execute(
                    """
                    INSERT INTO re_investment_quarter_state (
                        investment_id, quarter, run_id,
                        committed_capital, invested_capital, inputs_hash
                    ) VALUES (%s, %s, %s::uuid, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    [
                        deal_id, quarter, stub_run_id,
                        _q(av.get("purchase_price")) if av else None,
                        _q(av.get("equity_check")) if av else None,
                        inv_inputs_hash,
                    ],
                )

                # 6. Update opportunity: promoted_investment_id + stage
                cur.execute(
                    """
                    UPDATE repe_opportunities
                    SET promoted_investment_id = %s::uuid, stage = 'live'
                    WHERE opportunity_id = %s
                    """,
                    [deal_id, str(opportunity_id)],
                )

                # 7. Update promotion record
                if promotion:
                    cur.execute(
                        """
                        UPDATE repe_opportunity_promotions
                        SET promoted_to_investment_id = %s::uuid,
                            conversion_status = 'completed',
                            converted_at = now()
                        WHERE promotion_id = %s
                        """,
                        [deal_id, str(promotion["promotion_id"])],
                    )

            conn.commit()

        return get_opportunity(opportunity_id)

    except Exception as exc:
        # Record failure
        logger.error("convert_to_investment failed for opp=%s: %s", opportunity_id, exc)
        try:
            if promotion:
                with get_cursor() as cur:
                    cur.execute(
                        """
                        UPDATE repe_opportunity_promotions
                        SET conversion_status = 'failed',
                            conversion_error = %s
                        WHERE promotion_id = %s
                        """,
                        [str(exc), str(promotion["promotion_id"])],
                    )
        except Exception:  # noqa: BLE001
            pass
        raise ValueError(f"Investment conversion failed: {exc}") from exc


# ── Receipt / proof pack ─────────────────────────────────────────────────────

def get_receipts(opportunity_id: str | UUID) -> dict:
    """
    Return a complete JSON proof pack for an opportunity:

    {
      "opportunity": {...},
      "signals": [...],
      "assumption_version": {...},
      "model_run": {...},
      "model_outputs": {...},
      "fund_impact": {...},
      "score_breakdown": {...},
      "provenance": {
        "engine": "scenario_engine_v2",
        "engine_version": "vX",
        "run_timestamp": "ISO",
        "assumption_version_id": "...",
        "model_run_id": "..."
      },
      "generated_at": "ISO"
    }
    """
    from app.services.re_opportunities import get_score_breakdown, get_signal_links

    opp = get_opportunity(opportunity_id)

    # Signals
    signal_links = get_signal_links(opportunity_id)

    # Latest assumption version
    av = None
    if opp.get("current_assumption_version_id"):
        try:
            av = get_assumption_version(opp["current_assumption_version_id"])
        except LookupError:
            pass

    # Latest completed model run
    model_run = None
    model_output = None
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT mr.*, mo.*
            FROM repe_opportunity_model_runs mr
            JOIN repe_opportunity_model_outputs mo ON mo.model_run_id = mr.model_run_id
            WHERE mr.opportunity_id = %s AND mr.status = 'completed'
            ORDER BY mr.started_at DESC
            LIMIT 1
            """,
            [str(opportunity_id)],
        )
        run_row = cur.fetchone()
    if run_row:
        model_run = {k: v for k, v in dict(run_row).items() if k in {
            "model_run_id", "status", "started_at", "completed_at",
            "assumption_version_id", "triggered_by", "input_hash",
        }}
        model_output = {k: v for k, v in dict(run_row).items() if k in {
            "output_id", "assumption_version_id", "engine_version", "run_timestamp",
            "gross_irr", "net_irr", "gross_equity_multiple", "net_equity_multiple",
            "tvpi", "dpi", "nav", "min_dscr", "exit_ltv", "debt_yield", "cashflow_json",
        }}

    # Latest fund impact
    fund_impacts = get_fund_impact(opportunity_id)
    fund_impact = fund_impacts[0] if fund_impacts else None

    # Score breakdown
    score_breakdown = get_score_breakdown(opportunity_id)

    # Provenance block
    provenance = {
        "engine": "scenario_engine_v2",
        "engine_version": model_output.get("engine_version") if model_output else None,
        "run_timestamp": str(model_output.get("run_timestamp")) if model_output else None,
        "assumption_version_id": str(opp.get("current_assumption_version_id")) if opp.get("current_assumption_version_id") else None,
        "model_run_id": str(model_run.get("model_run_id")) if model_run else None,
    }

    return {
        "opportunity": {k: str(v) if isinstance(v, (UUID, Decimal)) else v for k, v in opp.items()},
        "signals": [dict(s) for s in signal_links],
        "assumption_version": {k: str(v) if isinstance(v, (UUID, Decimal)) else v for k, v in (av or {}).items()},
        "model_run": model_run,
        "model_outputs": model_output,
        "fund_impact": {k: str(v) if isinstance(v, (UUID, Decimal)) else v for k, v in (fund_impact or {}).items()} if fund_impact else None,
        "score_breakdown": score_breakdown,
        "provenance": provenance,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Internal helper ───────────────────────────────────────────────────────────

def _get_latest_fund_state_for_impact(fund_id: str) -> dict | None:
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT
                    fqs.ending_nav,
                    fqs.uncalled_capital,
                    fqs.gross_irr AS fund_irr,
                    fqs.tvpi,
                    (CASE WHEN fqs.total_equity > 0
                          THEN fqs.total_debt / fqs.total_equity
                          ELSE NULL END) AS leverage_ratio
                FROM re_fund_quarter_state fqs
                WHERE fqs.fund_id = %s
                ORDER BY fqs.quarter DESC
                LIMIT 1
                """,
                [fund_id],
            )
            row = cur.fetchone()
        return dict(row) if row else None
    except Exception:  # noqa: BLE001
        return None
