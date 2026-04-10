"""Python dispatcher — maps python_fn strings to existing finance engines.

Each function:
1. Loads required data from the database
2. Calls the existing pure Python engine
3. Returns a standardized result dict
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# ── Result shape ───────────────────────────────────────────────────


def _result(
    *,
    columns: list[str],
    data: list[dict[str, Any]],
    computation_type: str,
    method: str = "",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "columns": columns,
        "data": data,
        "computation": {
            "type": computation_type,
            "method": method,
            "precision": "Decimal",
            **(extra or {}),
        },
    }


# ── Dispatcher ─────────────────────────────────────────────────────


async def dispatch(
    python_fn: str,
    *,
    business_id: str,
    quarter: str | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Dispatch to the correct Python engine based on function name."""
    params = params or {}
    biz_uuid = UUID(business_id)

    registry = {
        "xirr": _run_xirr,
        "ratio_calc": _run_ratio_calc,
        "dcf": _run_dcf,
        "what_if_valuation": _run_what_if,
        "waterfall": _run_waterfall,
        "rollforward": _run_rollforward,
        "irr_bridge": _run_irr_bridge,
        "monte_carlo": _run_monte_carlo,
    }

    fn = registry.get(python_fn)
    if not fn:
        raise ValueError(f"Unknown python_fn: {python_fn}")

    return fn(business_id=biz_uuid, quarter=quarter, params=params)


# ── XIRR ───────────────────────────────────────────────────────────


def _run_xirr(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Compute XIRR for a fund from capital ledger entries."""
    from app.services.re_metrics import compute_fund_irr_from_ledger

    fund_id = _resolve_fund_id(business_id, params)
    if not fund_id:
        return _result(
            columns=["error"], data=[{"error": "No fund found"}],
            computation_type="xirr",
        )

    # Get current NAV for terminal value
    nav = _get_fund_nav(fund_id, quarter)
    as_of = _quarter_end_date(quarter) if quarter else date.today()

    irr = compute_fund_irr_from_ledger(
        fund_id=fund_id, nav=nav, as_of_date=as_of, as_of_quarter=quarter,
    )

    return _result(
        columns=["fund_irr"],
        data=[{"fund_irr": str(irr) if irr is not None else None}],
        computation_type="xirr",
        method="binary_search",
        extra={"as_of_date": str(as_of)},
    )


# ── Ratio calculation (DPI, TVPI) ─────────────────────────────────


def _run_ratio_calc(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Compute DPI/TVPI/RVPI from capital ledger."""
    from app.services.re_metrics import compute_fund_metrics

    fund_id = _resolve_fund_id(business_id, params)
    if not fund_id:
        return _result(
            columns=["error"], data=[{"error": "No fund found"}],
            computation_type="ratio_calc",
        )

    nav = _get_fund_nav(fund_id, quarter)
    as_of = _quarter_end_date(quarter) if quarter else date.today()

    metrics = compute_fund_metrics(
        fund_id=fund_id, nav=nav, as_of_date=as_of, as_of_quarter=quarter,
    )

    return _result(
        columns=list(metrics.keys()),
        data=[{k: str(v) if isinstance(v, Decimal) else v for k, v in metrics.items()}],
        computation_type="ratio_calc",
        method="ledger_aggregation",
    )


# ── DCF valuation ─────────────────────────────────────────────────


def _run_dcf(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """DCF valuation for an asset."""
    from app.services.re_math import calculate_value_dcf

    D = Decimal
    base_noi = D(str(params.get("base_noi", 1000000)))
    discount_rate = D(str(params.get("discount_rate", "0.08")))
    exit_cap_rate = D(str(params.get("exit_cap_rate", "0.06")))
    rent_growth = D(str(params.get("rent_growth", "0.03")))
    expense_growth = D(str(params.get("expense_growth", "0.025")))
    vacancy = D(str(params.get("vacancy", "0.05")))
    hold_years = int(params.get("hold_years", 10))

    value = calculate_value_dcf(
        base_noi=base_noi,
        rent_growth=rent_growth,
        expense_growth=expense_growth,
        vacancy_assumption=vacancy,
        exit_cap_rate=exit_cap_rate,
        discount_rate=discount_rate,
        hold_years=hold_years,
    )

    return _result(
        columns=["dcf_value", "base_noi", "discount_rate", "exit_cap_rate", "hold_years"],
        data=[{
            "dcf_value": str(value),
            "base_noi": str(base_noi),
            "discount_rate": str(discount_rate),
            "exit_cap_rate": str(exit_cap_rate),
            "hold_years": hold_years,
        }],
        computation_type="dcf",
        method="discounted_cash_flow",
    )


# ── What-if valuation ─────────────────────────────────────────────


def _run_what_if(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """What-if direct cap valuation: change cap rate and see impact."""
    from app.services.re_math import calculate_value_direct_cap

    D = Decimal
    noi = D(str(params.get("noi", 1000000)))
    base_cap = D(str(params.get("base_cap_rate", "0.055")))
    new_cap = D(str(params.get("cap_rate", "0.06")))

    base_value = calculate_value_direct_cap(noi, base_cap)
    new_value = calculate_value_direct_cap(noi, new_cap)
    delta = new_value - base_value
    delta_pct = (delta / base_value * 100) if base_value else D(0)

    return _result(
        columns=["scenario", "cap_rate", "value", "delta", "delta_pct"],
        data=[
            {"scenario": "Base", "cap_rate": str(base_cap), "value": str(base_value), "delta": "0", "delta_pct": "0"},
            {"scenario": "New", "cap_rate": str(new_cap), "value": str(new_value), "delta": str(delta), "delta_pct": str(delta_pct.quantize(D("0.01")))},
        ],
        computation_type="what_if_valuation",
        method="direct_cap",
    )


# ── Waterfall ──────────────────────────────────────────────────────


def _run_waterfall(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Run a US-style waterfall distribution."""
    from app.finance.waterfall_engine import run_us_waterfall, WaterfallContract, WaterfallInput

    fund_id = _resolve_fund_id(business_id, params)
    if not fund_id:
        return _result(
            columns=["error"], data=[{"error": "No fund found"}],
            computation_type="waterfall",
        )

    D = Decimal
    # Load fund terms and capital data
    contract = WaterfallContract(
        pref_rate=D(str(params.get("pref_rate", "0.08"))),
        carry_rate=D(str(params.get("carry_rate", "0.20"))),
        catchup_rate=D(str(params.get("catchup_rate", "1.0"))),
    )

    # Get distribution amount and participant data from ledger
    dist_amount, participants = _load_waterfall_inputs(fund_id, quarter)

    wf_input = WaterfallInput(
        as_of_date=_quarter_end_date(quarter) if quarter else date.today(),
        distribution_amount=dist_amount,
        gp_profit_paid_to_date=D(0),
        lp_profit_paid_to_date=D(0),
        participants=participants,
    )

    lines = run_us_waterfall(contract, wf_input)

    return _result(
        columns=["tier", "lp_amount", "gp_amount", "total"],
        data=[{
            "tier": line.tier,
            "lp_amount": str(line.lp_amount),
            "gp_amount": str(line.gp_amount),
            "total": str(line.total),
        } for line in lines],
        computation_type="waterfall",
        method="us_4tier",
    )


# ── Capital account rollforward ────────────────────────────────────


def _run_rollforward(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Build capital account rollforward from events."""
    from app.finance.capital_account_engine import compute_rollforward

    fund_id = _resolve_fund_id(business_id, params)
    if not fund_id:
        return _result(
            columns=["error"], data=[{"error": "No fund found"}],
            computation_type="rollforward",
        )

    as_of = _quarter_end_date(quarter) if quarter else date.today()

    # Load capital events
    with get_cursor() as cur:
        cur.execute(
            "SELECT event_date, fin_entity_id, fin_participant_id, amount, event_type "
            "FROM fin_capital_event WHERE fin_entity_id = %s ORDER BY event_date",
            (str(fund_id),),
        )
        events = cur.fetchall()

    if not events:
        return _result(
            columns=["message"], data=[{"message": "No capital events found"}],
            computation_type="rollforward",
        )

    result = compute_rollforward(events, as_of)
    if not result:
        return _result(
            columns=["message"], data=[{"message": "Empty rollforward"}],
            computation_type="rollforward",
        )

    columns = list(result[0].keys())
    data = [{k: str(v) if isinstance(v, Decimal) else v for k, v in row.items()} for row in result]

    return _result(
        columns=columns,
        data=data,
        computation_type="rollforward",
        method="period_by_period",
    )


# ── IRR bridge (gross to net) ─────────────────────────────────────


def _run_irr_bridge(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Compute gross-to-net IRR bridge showing fee deductions."""
    from app.services.re_fund_metrics import compute_return_metrics

    fund_id = _resolve_fund_id(business_id, params)
    if not fund_id:
        return _result(
            columns=["error"], data=[{"error": "No fund found"}],
            computation_type="irr_bridge",
        )

    # Get env_id for this business
    env_id = _get_env_id(business_id)
    if not env_id:
        return _result(
            columns=["error"], data=[{"error": "No environment found"}],
            computation_type="irr_bridge",
        )

    try:
        metrics = compute_return_metrics(
            env_id=str(env_id),
            business_id=business_id,
            fund_id=fund_id,
            quarter=quarter or "2026Q1",
            run_id=UUID("00000000-0000-0000-0000-000000000000"),
        )
    except Exception as e:
        logger.warning("IRR bridge compute failed: %s", e)
        return _result(
            columns=["error"], data=[{"error": f"Computation failed: {e}"}],
            computation_type="irr_bridge",
        )

    # Build waterfall-style bridge data
    bridge = []
    for key in ["gross_irr", "mgmt_fee_drag", "expense_drag", "carry_drag", "net_irr"]:
        val = metrics.get(key)
        bridge.append({"component": key.replace("_", " ").title(), "value": str(val) if val is not None else None})

    return _result(
        columns=["component", "value"],
        data=bridge,
        computation_type="irr_bridge",
        method="sequential_fee_deduction",
    )


# ── Monte Carlo ────────────────────────────────────────────────────


def _run_monte_carlo(
    *, business_id: UUID, quarter: str | None, params: dict[str, Any],
) -> dict[str, Any]:
    """Run Monte Carlo simulation on a model."""
    from app.services.re_model_monte_carlo import start_run

    model_id = params.get("model_id")
    if not model_id:
        # Find latest model for this business
        with get_cursor() as cur:
            cur.execute(
                "SELECT model_id FROM re_model WHERE env_id IN "
                "(SELECT env_id FROM app.env_business_bindings WHERE business_id = %s) "
                "ORDER BY created_at DESC LIMIT 1",
                (str(business_id),),
            )
            row = cur.fetchone()
            model_id = row["model_id"] if row else None

    if not model_id:
        return _result(
            columns=["error"], data=[{"error": "No model found for Monte Carlo"}],
            computation_type="monte_carlo",
        )

    n_sims = min(int(params.get("n_simulations", 1000)), 5000)
    seed = int(params.get("seed", 42))

    try:
        run_result = start_run(
            model_id=UUID(str(model_id)),
            quarter=quarter or "2026Q1",
            n_sims=n_sims,
            seed=seed,
        )
    except Exception as e:
        logger.warning("Monte Carlo failed: %s", e)
        return _result(
            columns=["error"], data=[{"error": f"Simulation failed: {e}"}],
            computation_type="monte_carlo",
        )

    return _result(
        columns=list(run_result.keys()),
        data=[{k: str(v) if isinstance(v, (Decimal, UUID)) else v for k, v in run_result.items()}],
        computation_type="monte_carlo",
        method="random_simulation",
        extra={"n_simulations": n_sims, "seed": seed},
    )


# ── Helper functions ───────────────────────────────────────────────


def _resolve_fund_id(business_id: UUID, params: dict[str, Any]) -> UUID | None:
    """Resolve a fund_id from params or pick the first fund for the business."""
    if params.get("fund_id"):
        return UUID(str(params["fund_id"]))

    fund_name = params.get("fund_name")
    with get_cursor() as cur:
        if fund_name:
            cur.execute(
                "SELECT fund_id FROM repe_fund WHERE business_id = %s AND name ILIKE %s LIMIT 1",
                (str(business_id), f"%%{fund_name}%%"),
            )
        else:
            cur.execute(
                "SELECT fund_id FROM repe_fund WHERE business_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(business_id),),
            )
        row = cur.fetchone()
        return row["fund_id"] if row else None


def _get_fund_nav(fund_id: UUID, quarter: str | None) -> Decimal:
    """Get the latest released authoritative NAV for a fund."""
    with get_cursor() as cur:
        if quarter:
            cur.execute(
                "SELECT COALESCE(NULLIF(canonical_metrics->>'ending_nav', '')::numeric, "
                "NULLIF(canonical_metrics->>'portfolio_nav', '')::numeric) AS portfolio_nav "
                "FROM re_authoritative_fund_state_qtr "
                "WHERE fund_id = %s AND quarter = %s AND promotion_state = 'released' "
                "ORDER BY released_at DESC NULLS LAST, created_at DESC LIMIT 1",
                (str(fund_id), quarter),
            )
        else:
            cur.execute(
                "SELECT COALESCE(NULLIF(canonical_metrics->>'ending_nav', '')::numeric, "
                "NULLIF(canonical_metrics->>'portfolio_nav', '')::numeric) AS portfolio_nav "
                "FROM re_authoritative_fund_state_qtr "
                "WHERE fund_id = %s AND promotion_state = 'released' "
                "ORDER BY quarter DESC, released_at DESC NULLS LAST, created_at DESC LIMIT 1",
                (str(fund_id),),
            )
        row = cur.fetchone()
        return Decimal(str(row["portfolio_nav"])) if row else Decimal(0)


def _get_env_id(business_id: UUID) -> UUID | None:
    """Resolve env_id from business_id."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT env_id FROM app.env_business_bindings WHERE business_id = %s LIMIT 1",
            (str(business_id),),
        )
        row = cur.fetchone()
        return row["env_id"] if row else None


def _quarter_end_date(quarter: str | None) -> date:
    """Convert quarter string (2026Q1) to end-of-quarter date."""
    if not quarter:
        return date.today()
    import re as _re
    m = _re.match(r"(\d{4})Q([1-4])", quarter)
    if not m:
        return date.today()
    year, q = int(m.group(1)), int(m.group(2))
    month = q * 3
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1).replace(day=1) - __import__("datetime").timedelta(days=1)


def _load_waterfall_inputs(fund_id: UUID, quarter: str | None) -> tuple[Decimal, list]:
    """Load distribution amount and participant states from the capital ledger."""
    from app.finance.waterfall_engine import ParticipantState

    D = Decimal
    with get_cursor() as cur:
        # Total distributions for the quarter
        cur.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total "
            "FROM re_capital_ledger_entry "
            "WHERE fund_id = %s AND entry_type = 'distribution' AND quarter = %s",
            (str(fund_id), quarter or "2026Q1"),
        )
        dist_row = cur.fetchone()
        dist_amount = D(str(dist_row["total"])) if dist_row else D(0)

        # Participants (partners)
        cur.execute(
            "SELECT p.partner_id, p.name, "
            "COALESCE(pc.commitment, 0) AS commitment "
            "FROM re_partner p "
            "LEFT JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id "
            "WHERE p.fund_id = %s",
            (str(fund_id),),
        )
        partner_rows = cur.fetchall()

    total_commitment = sum(D(str(r["commitment"])) for r in partner_rows)
    participants = []
    for r in partner_rows:
        commitment = D(str(r["commitment"]))
        pct = (commitment / total_commitment) if total_commitment else D(0)
        participants.append(ParticipantState(
            participant_id=str(r["partner_id"]),
            name=r["name"],
            commitment=commitment,
            contributed=commitment,  # simplified: assume fully called
            distributed=D(0),
            ownership_pct=pct,
        ))

    return dist_amount, participants
