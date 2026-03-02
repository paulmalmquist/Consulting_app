"""Underwriting vs Actual Returns: linkage, metric comparison, attribution bridge.

Compares locked underwriting (IO) or forecast (CF) model results against
actual quarterly snapshots from re_investment_quarter_state.
"""

from __future__ import annotations

import json
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import re_model


# ── Linkage ──────────────────────────────────────────────────────────────────

def link_underwriting(*, investment_id: UUID, model_id: UUID, linked_by: str = "api") -> dict:
    """Link a locked underwriting_io model to an investment."""
    m = re_model.get_model(model_id=model_id)
    if not m.get("locked_at"):
        raise ValueError("Model must be locked before linking as underwriting baseline")
    if m.get("model_type") != "underwriting_io":
        raise ValueError(f"Model type must be 'underwriting_io', got '{m.get('model_type')}'")
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_investment_underwriting_link (investment_id, model_id, linked_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (investment_id) DO UPDATE
            SET model_id = EXCLUDED.model_id, linked_at = now(), linked_by = EXCLUDED.linked_by
            RETURNING id, investment_id, model_id, linked_at, linked_by
            """,
            (str(investment_id), str(model_id), linked_by),
        )
        return cur.fetchone()


def link_forecast(*, investment_id: UUID, model_id: UUID, linked_by: str = "api") -> dict:
    """Link an approved forecast model to an investment."""
    m = re_model.get_model(model_id=model_id)
    if m.get("model_type") != "forecast":
        raise ValueError(f"Model type must be 'forecast', got '{m.get('model_type')}'")
    if m.get("status") != "approved":
        raise ValueError("Forecast model must be approved before linking")
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_investment_forecast_link (investment_id, model_id, linked_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (investment_id) DO UPDATE
            SET model_id = EXCLUDED.model_id, linked_at = now(), linked_by = EXCLUDED.linked_by
            RETURNING id, investment_id, model_id, linked_at, linked_by
            """,
            (str(investment_id), str(model_id), linked_by),
        )
        return cur.fetchone()


def get_underwriting_link(*, investment_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, investment_id, model_id, linked_at, linked_by "
            "FROM re_investment_underwriting_link WHERE investment_id = %s",
            (str(investment_id),),
        )
        return cur.fetchone()


def get_forecast_link(*, investment_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, investment_id, model_id, linked_at, linked_by "
            "FROM re_investment_forecast_link WHERE investment_id = %s",
            (str(investment_id),),
        )
        return cur.fetchone()


def remove_underwriting_link(*, investment_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_investment_underwriting_link WHERE investment_id = %s",
            (str(investment_id),),
        )


def remove_forecast_link(*, investment_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_investment_forecast_link WHERE investment_id = %s",
            (str(investment_id),),
        )


# ── Model Results ────────────────────────────────────────────────────────────

def store_model_results(
    *,
    model_id: UUID,
    investment_id: UUID,
    metrics: dict,
    run_id: UUID | None = None,
    compute_version: str = "v1",
) -> dict:
    """Persist investment-level metrics from a model run."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_results_investment
                (model_id, investment_id, metrics_json, run_id, compute_version)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (model_id, investment_id, compute_version) DO UPDATE
            SET metrics_json = EXCLUDED.metrics_json,
                computed_at = now(),
                run_id = EXCLUDED.run_id
            RETURNING id, model_id, investment_id, metrics_json, computed_at, compute_version, run_id
            """,
            (
                str(model_id),
                str(investment_id),
                json.dumps(metrics, default=str),
                str(run_id) if run_id else None,
                compute_version,
            ),
        )
        return cur.fetchone()


# ── Metric Fetching ──────────────────────────────────────────────────────────

def _get_baseline_metrics(*, investment_id: UUID, baseline: str) -> dict | None:
    """Get metrics from the linked baseline model (IO or CF)."""
    link_table = (
        "re_investment_underwriting_link" if baseline == "IO"
        else "re_investment_forecast_link"
    )
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT r.metrics_json, r.computed_at, r.compute_version, r.run_id,
                   m.name AS model_name, m.model_id, m.model_type, m.locked_at,
                   m.base_snapshot_id
            FROM {link_table} lnk
            JOIN re_model_results_investment r ON r.model_id = lnk.model_id
                AND r.investment_id = lnk.investment_id
            JOIN re_model m ON m.model_id = lnk.model_id
            WHERE lnk.investment_id = %s
            ORDER BY r.computed_at DESC
            LIMIT 1
            """,
            (str(investment_id),),
        )
        return cur.fetchone()


def get_actual_metrics(*, investment_id: UUID, quarter: str) -> dict | None:
    """Get actual metrics from re_investment_quarter_state (base scenario)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT investment_id, quarter, nav, committed_capital, invested_capital,
                   realized_distributions, unrealized_value, gross_asset_value,
                   gross_irr, net_irr, equity_multiple, debt_balance, cash_balance,
                   run_id, created_at
            FROM re_investment_quarter_state
            WHERE investment_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(investment_id), quarter),
        )
        return cur.fetchone()


# ── Portfolio Scorecard ──────────────────────────────────────────────────────

def _d(v) -> Decimal | None:
    if v is None:
        return None
    return Decimal(str(v))


def _delta(a, b) -> Decimal | None:
    if a is None or b is None:
        return None
    return _d(a) - _d(b)


def compute_portfolio_scorecard(
    *,
    fund_id: UUID,
    quarter: str,
    baseline: str = "IO",
    level: str = "investment",
) -> dict:
    """Build portfolio scorecard comparing UW/CF metrics vs actual for all investments."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT deal_id, name FROM repe_deal WHERE fund_id = %s ORDER BY name",
            (str(fund_id),),
        )
        investments = cur.fetchall()

    rows = []
    for inv in investments:
        inv_id = inv["deal_id"]
        uw = _get_baseline_metrics(investment_id=inv_id, baseline=baseline)
        actual = get_actual_metrics(investment_id=inv_id, quarter=quarter)

        uw_m = uw["metrics_json"] if uw and uw.get("metrics_json") else {}
        if isinstance(uw_m, str):
            uw_m = json.loads(uw_m)

        uw_irr = _d(uw_m.get("gross_irr"))
        uw_moic = _d(uw_m.get("equity_multiple") or uw_m.get("moic"))
        uw_nav = _d(uw_m.get("nav"))
        uw_tvpi = _d(uw_m.get("tvpi"))

        actual_irr = _d(actual["gross_irr"]) if actual else None
        actual_moic = _d(actual["equity_multiple"]) if actual else None
        actual_nav = _d(actual["nav"]) if actual else None
        actual_tvpi = None  # TVPI lives at fund level

        rows.append({
            "investment_id": inv_id,
            "investment_name": inv["name"],
            "baseline_type": baseline,
            "uw_irr": uw_irr,
            "actual_irr": actual_irr,
            "delta_irr": _delta(actual_irr, uw_irr),
            "uw_moic": uw_moic,
            "actual_moic": actual_moic,
            "delta_moic": _delta(actual_moic, uw_moic),
            "uw_nav": uw_nav,
            "actual_nav": actual_nav,
            "delta_nav": _delta(actual_nav, uw_nav),
            "uw_tvpi": uw_tvpi,
            "actual_tvpi": actual_tvpi,
            "delta_tvpi": _delta(actual_tvpi, uw_tvpi),
        })

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "baseline": baseline,
        "level": level,
        "rows": rows,
        "summary": _compute_summary(rows),
    }


def _compute_summary(rows: list[dict]) -> dict:
    """Aggregate portfolio-level summary from investment rows."""
    irrs = [r["actual_irr"] for r in rows if r["actual_irr"] is not None]
    navs = [r["actual_nav"] for r in rows if r["actual_nav"] is not None]
    return {
        "total_investments": len(rows),
        "investments_with_baseline": sum(1 for r in rows if r["uw_irr"] is not None),
        "avg_actual_irr": str(sum(irrs) / len(irrs)) if irrs else None,
        "total_actual_nav": str(sum(navs)) if navs else None,
    }


# ── Detail ───────────────────────────────────────────────────────────────────

def compute_detail(
    *,
    level: str,
    entity_id: UUID,
    quarter: str,
    baseline: str = "IO",
) -> dict:
    """Full metric comparison + lineage for a single entity."""
    uw = _get_baseline_metrics(investment_id=entity_id, baseline=baseline)
    actual = get_actual_metrics(investment_id=entity_id, quarter=quarter)

    uw_m = {}
    lineage = {"quarter": quarter, "baseline": baseline}
    if uw:
        uw_m = uw["metrics_json"] if isinstance(uw["metrics_json"], dict) else json.loads(uw["metrics_json"])
        lineage["model_name"] = uw.get("model_name")
        lineage["model_id"] = str(uw.get("model_id")) if uw.get("model_id") else None
        lineage["model_type"] = uw.get("model_type")
        lineage["locked_at"] = str(uw.get("locked_at")) if uw.get("locked_at") else None
        lineage["computed_at"] = str(uw.get("computed_at")) if uw.get("computed_at") else None
        lineage["compute_version"] = uw.get("compute_version")

    return {
        "entity_id": str(entity_id),
        "level": level,
        "baseline_metrics": uw_m,
        "actual_metrics": dict(actual) if actual else {},
        "lineage": lineage,
    }


# ── Attribution Bridge (Fast Mode) ──────────────────────────────────────────

def compute_bridge_fast(
    *,
    level: str,
    entity_id: UUID,
    quarter: str,
    baseline: str = "IO",
) -> dict:
    """Fast attribution bridge using driver-level variance.

    Computes the delta for each driver category and approximates
    the IRR impact using sensitivity coefficients.
    """
    uw = _get_baseline_metrics(investment_id=entity_id, baseline=baseline)
    actual = get_actual_metrics(investment_id=entity_id, quarter=quarter)

    uw_m = {}
    if uw and uw.get("metrics_json"):
        uw_m = uw["metrics_json"] if isinstance(uw["metrics_json"], dict) else json.loads(uw["metrics_json"])
    actual_m = dict(actual) if actual else {}

    # Fetch asset-level operating data for driver decomposition
    asset_drivers = _get_asset_driver_data(investment_id=entity_id, quarter=quarter)

    drivers = []

    # NOI variance
    uw_noi = _d(uw_m.get("noi"))
    act_noi = _d(asset_drivers.get("actual_noi"))
    noi_delta = _delta(act_noi, uw_noi)
    drivers.append({
        "driver": "NOI",
        "uw_value": uw_noi,
        "actual_value": act_noi,
        "delta": noi_delta,
        "irr_impact_bps": _estimate_irr_impact(noi_delta, uw_noi, base_sensitivity=150),
    })

    # Occupancy variance
    uw_occ = _d(uw_m.get("occupancy"))
    act_occ = _d(asset_drivers.get("actual_occupancy"))
    occ_delta = _delta(act_occ, uw_occ)
    drivers.append({
        "driver": "Occupancy",
        "uw_value": uw_occ,
        "actual_value": act_occ,
        "delta": occ_delta,
        "irr_impact_bps": _estimate_irr_impact(occ_delta, uw_occ, base_sensitivity=100),
    })

    # Capex variance
    uw_capex = _d(uw_m.get("capex"))
    act_capex = _d(asset_drivers.get("actual_capex"))
    capex_delta = _delta(act_capex, uw_capex)
    drivers.append({
        "driver": "Capex",
        "uw_value": uw_capex,
        "actual_value": act_capex,
        "delta": capex_delta,
        "irr_impact_bps": _estimate_irr_impact(
            capex_delta, uw_capex, base_sensitivity=-80, invert=True
        ),
    })

    # Exit cap rate variance
    uw_cap = _d(uw_m.get("exit_cap_rate") or uw_m.get("cap_rate"))
    act_cap = _d(asset_drivers.get("actual_cap_rate"))
    cap_delta = _delta(act_cap, uw_cap)
    drivers.append({
        "driver": "Exit Cap Rate",
        "uw_value": uw_cap,
        "actual_value": act_cap,
        "delta": cap_delta,
        "irr_impact_bps": _estimate_cap_rate_impact(cap_delta),
    })

    # Debt terms variance
    uw_debt = _d(uw_m.get("debt_rate"))
    act_debt = _d(asset_drivers.get("actual_debt_rate"))
    debt_delta = _delta(act_debt, uw_debt)
    drivers.append({
        "driver": "Debt Terms",
        "uw_value": uw_debt,
        "actual_value": act_debt,
        "delta": debt_delta,
        "irr_impact_bps": _estimate_irr_impact(
            debt_delta, uw_debt, base_sensitivity=-60, invert=True
        ),
    })

    # Compute explained total and residual
    total_irr_delta = _delta(
        _d(actual_m.get("gross_irr")),
        _d(uw_m.get("gross_irr")),
    )
    explained = sum(
        (d["irr_impact_bps"] or Decimal(0)) for d in drivers
    )
    residual = (_d(total_irr_delta) * 10000 - explained) if total_irr_delta is not None else None

    drivers.append({
        "driver": "Residual",
        "uw_value": None,
        "actual_value": None,
        "delta": None,
        "irr_impact_bps": residual,
    })

    return {
        "level": level,
        "entity_id": str(entity_id),
        "quarter": quarter,
        "baseline": baseline,
        "drivers": drivers,
        "total_explained_bps": explained,
        "residual_bps": residual,
        "lineage": {
            "mode": "fast",
            "quarter": quarter,
            "baseline": baseline,
        },
    }


def _get_asset_driver_data(*, investment_id: UUID, quarter: str) -> dict:
    """Fetch aggregated asset operating data for an investment's assets."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                SUM(aq.noi) AS actual_noi,
                AVG(aq.occupancy) AS actual_occupancy,
                SUM(aq.capex) AS actual_capex,
                AVG(CASE WHEN aq.noi > 0 AND aq.asset_value > 0
                    THEN aq.noi / aq.asset_value END) AS actual_cap_rate,
                AVG(CASE WHEN aq.debt_balance > 0 AND aq.debt_service > 0
                    THEN aq.debt_service / aq.debt_balance END) AS actual_debt_rate
            FROM re_asset_quarter_state aq
            JOIN repe_asset a ON a.asset_id = aq.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.deal_id = %s
              AND aq.quarter = %s
              AND aq.scenario_id IS NULL
            """,
            (str(investment_id), quarter),
        )
        row = cur.fetchone()
        return dict(row) if row else {}


def _estimate_irr_impact(
    delta: Decimal | None,
    base: Decimal | None,
    base_sensitivity: int = 100,
    invert: bool = False,
) -> Decimal | None:
    """Approximate IRR impact in bps from a driver delta.

    base_sensitivity: bps of IRR change per 1% change in the driver.
    """
    if delta is None or base is None or base == 0:
        return None
    pct_change = delta / base
    impact = pct_change * Decimal(base_sensitivity)
    return -impact if invert else impact


def _estimate_cap_rate_impact(cap_delta: Decimal | None) -> Decimal | None:
    """Cap rate impact: ~200bps IRR loss per 100bps cap rate expansion."""
    if cap_delta is None:
        return None
    return cap_delta * Decimal(-20000)  # in bps
