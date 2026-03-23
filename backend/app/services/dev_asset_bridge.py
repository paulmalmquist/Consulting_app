"""Development ↔ REPE Asset Bridge service.

Links PDS analytics projects to REPE assets and provides development
assumption management, scenario comparison, and fund-impact calculations.
"""
from __future__ import annotations

import math
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ── Helpers ────────────────────────────────────────────────────────

def _q(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _q4(value: Any) -> Decimal:
    """4-decimal precision for rates/percentages."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.0001"))


def _ser(row: dict[str, Any]) -> dict[str, Any]:
    """Serialize Decimal/date fields to strings for JSON response."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = str(v)
        elif hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


# ── Recalculation ─────────────────────────────────────────────────

def _recalculate_outputs(cur: Any, assumption_set_id: UUID) -> None:
    """Compute derived metrics and write back to the assumption set row."""
    cur.execute(
        "SELECT * FROM dev_assumption_set WHERE assumption_set_id = %s::uuid",
        (str(assumption_set_id),),
    )
    row = cur.fetchone()
    if not row:
        return

    tdc = _q(row.get("total_development_cost"))
    noi = _q(row.get("stabilized_noi"))
    cap = _q4(row.get("exit_cap_rate"))

    # yield_on_cost = NOI / TDC
    yoc = Decimal("0")
    if tdc > 0:
        yoc = (noi / tdc).quantize(Decimal("0.0001"))

    # stabilized_value = NOI / cap_rate
    stab_val = Decimal("0")
    if cap > 0:
        stab_val = (noi / cap).quantize(Decimal("0.01"))

    # moic = stabilized_value / TDC
    moic = Decimal("0")
    if tdc > 0:
        moic = (stab_val / tdc).quantize(Decimal("0.0001"))

    # projected_irr = annualized return approximation
    # (stabilized_value / TDC) ^ (1 / hold_years) - 1
    irr = Decimal("0")
    c_start = row.get("construction_start")
    s_date = row.get("stabilization_date")
    if c_start and s_date and tdc > 0 and stab_val > 0:
        days = (s_date - c_start).days
        if days > 0:
            years = days / 365.25
            ratio = float(stab_val) / float(tdc)
            if ratio > 0:
                irr_float = math.pow(ratio, 1.0 / years) - 1.0
                irr = Decimal(str(round(irr_float, 4)))

    cur.execute(
        """
        UPDATE dev_assumption_set
        SET yield_on_cost = %s, stabilized_value = %s,
            projected_irr = %s, projected_moic = %s,
            updated_at = now()
        WHERE assumption_set_id = %s::uuid
        """,
        (str(yoc), str(stab_val), str(irr), str(moic), str(assumption_set_id)),
    )


# ── Portfolio ─────────────────────────────────────────────────────

def get_dev_portfolio(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT l.link_id, l.pds_project_id, l.repe_asset_id,
                   l.link_type, l.status AS link_status,
                   p.project_name, p.project_type, p.market,
                   p.status AS project_status, p.percent_complete,
                   p.total_budget,
                   a.name AS asset_name,
                   pa.property_type, pa.market AS asset_market,
                   s.total_development_cost, s.stabilized_noi,
                   s.yield_on_cost, s.stabilized_value,
                   s.projected_irr, s.projected_moic,
                   s.hard_cost, s.soft_cost, s.contingency
            FROM dev_project_asset_link l
            LEFT JOIN pds_analytics_projects p ON p.project_id = l.pds_project_id
            LEFT JOIN repe_asset a ON a.asset_id = l.repe_asset_id
            LEFT JOIN repe_property_asset pa ON pa.asset_id = l.repe_asset_id
            LEFT JOIN dev_assumption_set s ON s.link_id = l.link_id AND s.is_base = true
            WHERE l.env_id = %s::uuid AND l.business_id = %s::uuid
            ORDER BY p.project_name
            """,
            (str(env_id), str(business_id)),
        )
        rows = cur.fetchall()

        # Spend trend: monthly draw amounts for last 18 months
        cur.execute(
            """
            SELECT date_trunc('month', d.draw_date)::date AS month,
                   SUM(d.draw_amount) AS total_drawn
            FROM dev_draw_schedule d
            JOIN dev_assumption_set s ON s.assumption_set_id = d.assumption_set_id
            JOIN dev_project_asset_link l ON l.link_id = s.link_id
            WHERE l.env_id = %s::uuid AND l.business_id = %s::uuid
              AND s.is_base = true
              AND d.draw_date >= (CURRENT_DATE - interval '18 months')
            GROUP BY 1
            ORDER BY 1
            """,
            (str(env_id), str(business_id)),
        )
        spend_rows = cur.fetchall()

    # Build KPIs
    total_budget = Decimal("0")
    total_committed = Decimal("0")
    total_spent = Decimal("0")
    total_contingency = Decimal("0")
    sum_yoc = Decimal("0")
    sum_irr = Decimal("0")
    yoc_count = 0
    irr_count = 0
    on_track = 0
    at_risk = 0
    delayed = 0

    projects = []
    for row in rows:
        tdc = _q(row.get("total_development_cost"))
        total_budget += tdc
        total_committed += _q(row.get("hard_cost")) + _q(row.get("soft_cost"))
        total_contingency += _q(row.get("contingency"))

        pct = float(row.get("percent_complete") or 0) / 100.0
        total_spent += tdc * Decimal(str(round(pct, 4)))

        yoc = _q4(row.get("yield_on_cost"))
        irr = _q4(row.get("projected_irr"))
        if yoc > 0:
            sum_yoc += yoc
            yoc_count += 1
        if irr > 0:
            sum_irr += irr
            irr_count += 1

        # Simple health from percent_complete and link_status
        pct_val = float(row.get("percent_complete") or 0)
        status = row.get("project_status", "active")
        if status == "on_hold" or pct_val < 10:
            health = "delayed"
            delayed += 1
        elif pct_val < 30:
            health = "at_risk"
            at_risk += 1
        else:
            health = "on_track"
            on_track += 1

        projects.append({
            "link_id": str(row["link_id"]),
            "project_name": row.get("project_name") or "Untitled",
            "asset_name": row.get("asset_name") or "Unknown",
            "property_type": row.get("property_type"),
            "market": row.get("asset_market") or row.get("market"),
            "link_type": row.get("link_type"),
            "status": row.get("link_status"),
            "stage": row.get("project_status", "active"),
            "total_development_cost": str(tdc),
            "percent_complete": str(_q(row.get("percent_complete"))),
            "health": health,
            "projected_irr": str(irr),
            "yield_on_cost": str(yoc),
            "projected_moic": str(_q4(row.get("projected_moic"))),
        })

    forecast = total_budget  # simplified: forecast = budget for now
    contingency_pct = Decimal("0")
    if total_budget > 0:
        contingency_pct = (total_contingency / total_budget * 100).quantize(Decimal("0.01"))

    kpis = {
        "total_development_budget": str(total_budget),
        "total_committed": str(total_committed),
        "total_spent": str(total_spent.quantize(Decimal("0.01"))),
        "total_forecast": str(forecast),
        "contingency_remaining_pct": str(contingency_pct),
        "contingency_remaining_abs": str(total_contingency),
        "projects_on_track": on_track,
        "projects_at_risk": at_risk,
        "projects_delayed": delayed,
        "avg_yield_on_cost": str((sum_yoc / yoc_count).quantize(Decimal("0.0001")) if yoc_count else Decimal("0")),
        "avg_projected_irr": str((sum_irr / irr_count).quantize(Decimal("0.0001")) if irr_count else Decimal("0")),
    }

    spend_trend = [
        {"month": r["month"].isoformat() if hasattr(r["month"], "isoformat") else str(r["month"]),
         "total_drawn": str(_q(r["total_drawn"]))}
        for r in spend_rows
    ]

    return {"kpis": kpis, "projects": projects, "spend_trend": spend_trend}


# ── Project Detail ────────────────────────────────────────────────

def get_dev_project_detail(*, link_id: UUID, env_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        # Link + PDS project + REPE asset
        cur.execute(
            """
            SELECT l.*,
                   p.project_name, p.project_type, p.market AS pds_market,
                   p.status AS project_status, p.percent_complete,
                   p.total_budget AS pds_budget, p.start_date, p.planned_end_date,
                   p.fee_type, p.fee_percentage, p.fee_amount,
                   a.name AS asset_name, a.deal_id,
                   pa.property_type, pa.market AS asset_market, pa.units,
                   pa.noi_annual, pa.occupancy_rate, pa.year_built
            FROM dev_project_asset_link l
            LEFT JOIN pds_analytics_projects p ON p.project_id = l.pds_project_id
            LEFT JOIN repe_asset a ON a.asset_id = l.repe_asset_id
            LEFT JOIN repe_property_asset pa ON pa.asset_id = l.repe_asset_id
            WHERE l.link_id = %s::uuid AND l.env_id = %s::uuid
            """,
            (str(link_id), str(env_id)),
        )
        link = cur.fetchone()
        if not link:
            raise LookupError(f"Dev project link {link_id} not found")

        # All assumption sets
        cur.execute(
            """
            SELECT * FROM dev_assumption_set
            WHERE link_id = %s::uuid
            ORDER BY is_base DESC, scenario_label
            """,
            (str(link_id),),
        )
        assumptions = [_ser(r) for r in cur.fetchall()]

        # Fund info via deal → fund
        fund_info: dict[str, Any] = {}
        deal_id = link.get("deal_id")
        if deal_id:
            cur.execute(
                """
                SELECT f.fund_id, f.name AS fund_name,
                       d.committed_capital, d.invested_capital
                FROM repe_deal d
                JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE d.deal_id = %s::uuid
                """,
                (str(deal_id),),
            )
            frow = cur.fetchone()
            if frow:
                fund_info = _ser(frow)
                # Try to get latest fund quarter state
                cur.execute(
                    """
                    SELECT portfolio_nav, gross_irr, net_irr, tvpi, dpi
                    FROM re_fund_quarter_state
                    WHERE fund_id = %s::uuid
                    ORDER BY quarter DESC LIMIT 1
                    """,
                    (str(frow["fund_id"]),),
                )
                fqs = cur.fetchone()
                if fqs:
                    fund_info.update(_ser(fqs))

    # Build pds_execution section
    pds_execution = {
        "project_name": link.get("project_name") or "Untitled",
        "project_type": link.get("project_type"),
        "stage": link.get("project_status", "active"),
        "market": link.get("pds_market"),
        "budget": str(_q(link.get("pds_budget"))),
        "percent_complete": str(_q(link.get("percent_complete"))),
        "start_date": link["start_date"].isoformat() if link.get("start_date") else None,
        "planned_end_date": link["planned_end_date"].isoformat() if link.get("planned_end_date") else None,
        "fee_type": link.get("fee_type"),
        "fee_percentage": str(_q4(link.get("fee_percentage"))) if link.get("fee_percentage") else None,
    }

    # Build fund_impact section
    base_assumption = next((a for a in assumptions if a.get("is_base")), None)
    nav_contribution_pct = None
    if base_assumption and fund_info.get("portfolio_nav"):
        nav = Decimal(str(fund_info["portfolio_nav"]))
        stab_val = Decimal(str(base_assumption.get("stabilized_value", "0")))
        if nav > 0:
            nav_contribution_pct = str((stab_val / nav * 100).quantize(Decimal("0.01")))

    fund_impact = {
        **fund_info,
        "asset_name": link.get("asset_name"),
        "property_type": link.get("property_type"),
        "asset_market": link.get("asset_market"),
        "link_type": link.get("link_type"),
        "nav_contribution_pct": nav_contribution_pct,
    }

    return {
        "link_id": str(link["link_id"]),
        "pds_execution": pds_execution,
        "assumptions": assumptions,
        "fund_impact": fund_impact,
        "asset": {
            "asset_id": str(link["repe_asset_id"]),
            "name": link.get("asset_name"),
            "property_type": link.get("property_type"),
            "market": link.get("asset_market"),
            "units": link.get("units"),
            "noi_annual": str(_q(link.get("noi_annual"))) if link.get("noi_annual") else None,
            "occupancy_rate": str(_q4(link.get("occupancy_rate"))) if link.get("occupancy_rate") else None,
        },
    }


# ── Assumptions CRUD ──────────────────────────────────────────────

def get_dev_assumptions(*, link_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM dev_assumption_set
            WHERE link_id = %s::uuid
            ORDER BY is_base DESC, scenario_label
            """,
            (str(link_id),),
        )
        return [_ser(r) for r in cur.fetchall()]


def update_dev_assumptions(*, assumption_set_id: UUID, updates: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "hard_cost", "soft_cost", "contingency", "financing_cost", "total_development_cost",
        "construction_start", "construction_end", "lease_up_start", "lease_up_months", "stabilization_date",
        "stabilized_occupancy", "stabilized_noi", "exit_cap_rate",
        "construction_loan_amt", "construction_loan_rate", "perm_loan_amt", "perm_loan_rate",
    }
    filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
    if not filtered:
        raise ValueError("No valid fields to update")

    with get_cursor() as cur:
        set_clauses = ", ".join(f"{k} = %s" for k in filtered)
        values = list(filtered.values()) + [str(assumption_set_id)]
        cur.execute(
            f"UPDATE dev_assumption_set SET {set_clauses}, updated_at = now() WHERE assumption_set_id = %s::uuid",
            values,
        )
        if cur.rowcount == 0:
            raise LookupError(f"Assumption set {assumption_set_id} not found")

        _recalculate_outputs(cur, assumption_set_id)

        cur.execute(
            "SELECT * FROM dev_assumption_set WHERE assumption_set_id = %s::uuid",
            (str(assumption_set_id),),
        )
        return _ser(cur.fetchone())


# ── Draw Schedule ─────────────────────────────────────────────────

def get_dev_draws(*, link_id: UUID, scenario_label: str = "base") -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT d.* FROM dev_draw_schedule d
            JOIN dev_assumption_set s ON s.assumption_set_id = d.assumption_set_id
            WHERE s.link_id = %s::uuid AND s.scenario_label = %s
            ORDER BY d.draw_date
            """,
            (str(link_id), scenario_label),
        )
        return [_ser(r) for r in cur.fetchall()]


# ── Scenario Comparison ──────────────────────────────────────────

def get_scenario_comparison(*, link_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT scenario_label, is_base,
                   total_development_cost, hard_cost, soft_cost, contingency,
                   stabilized_noi, stabilized_value, stabilized_occupancy,
                   exit_cap_rate, yield_on_cost, projected_irr, projected_moic,
                   construction_start, construction_end, lease_up_months, stabilization_date
            FROM dev_assumption_set
            WHERE link_id = %s::uuid
            ORDER BY is_base DESC, scenario_label
            """,
            (str(link_id),),
        )
        rows = [_ser(r) for r in cur.fetchall()]

    if not rows:
        return {"scenarios": [], "deltas": []}

    base = rows[0] if rows[0].get("is_base") else None
    scenarios = rows

    deltas = []
    if base:
        for row in rows:
            if row.get("is_base"):
                continue
            delta: dict[str, Any] = {"scenario_label": row["scenario_label"]}
            for key in ("total_development_cost", "stabilized_noi", "stabilized_value",
                        "yield_on_cost", "projected_irr", "projected_moic"):
                b_val = Decimal(str(base.get(key) or "0"))
                r_val = Decimal(str(row.get(key) or "0"))
                delta[f"{key}_delta"] = str((r_val - b_val).quantize(Decimal("0.0001")))
                if b_val != 0:
                    delta[f"{key}_delta_pct"] = str(((r_val - b_val) / b_val * 100).quantize(Decimal("0.01")))
                else:
                    delta[f"{key}_delta_pct"] = "0"
            deltas.append(delta)

    return {"scenarios": scenarios, "deltas": deltas}


# ── Fund Impact ──────────────────────────────────────────────────

def get_fund_impact(*, link_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT l.link_id, l.repe_asset_id,
                   a.name AS asset_name, a.deal_id,
                   f.fund_id, f.name AS fund_name,
                   d.committed_capital, d.invested_capital
            FROM dev_project_asset_link l
            JOIN repe_asset a ON a.asset_id = l.repe_asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE l.link_id = %s::uuid
            """,
            (str(link_id),),
        )
        link = cur.fetchone()
        if not link:
            return {"error": "Link or fund chain not found", "data_status": "no_fund_chain"}

        fund_id = link["fund_id"]

        # Latest fund quarter state
        cur.execute(
            """
            SELECT quarter, portfolio_nav, gross_irr, net_irr, tvpi, dpi, rvpi,
                   total_committed, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s::uuid
            ORDER BY quarter DESC LIMIT 1
            """,
            (str(fund_id),),
        )
        fqs = cur.fetchone()

        # All assumption scenarios for this link
        cur.execute(
            """
            SELECT scenario_label, is_base,
                   total_development_cost, stabilized_value,
                   yield_on_cost, projected_irr, projected_moic
            FROM dev_assumption_set
            WHERE link_id = %s::uuid
            ORDER BY is_base DESC, scenario_label
            """,
            (str(link_id),),
        )
        scenarios = [_ser(r) for r in cur.fetchall()]

    result: dict[str, Any] = {
        "fund_id": str(fund_id),
        "fund_name": link.get("fund_name"),
        "asset_name": link.get("asset_name"),
        "committed_capital": str(_q(link.get("committed_capital"))),
        "invested_capital": str(_q(link.get("invested_capital"))),
        "scenarios": scenarios,
    }

    if fqs:
        fund_nav = _q(fqs.get("portfolio_nav"))
        result["fund_quarter"] = fqs.get("quarter")
        result["fund_nav"] = str(fund_nav)
        result["fund_gross_irr"] = str(_q4(fqs.get("gross_irr")))
        result["fund_net_irr"] = str(_q4(fqs.get("net_irr")))
        result["fund_tvpi"] = str(_q4(fqs.get("tvpi")))
        result["fund_dpi"] = str(_q4(fqs.get("dpi")))

        # Compute NAV contribution for each scenario
        for sc in scenarios:
            stab_val = Decimal(str(sc.get("stabilized_value") or "0"))
            if fund_nav > 0:
                sc["nav_contribution_pct"] = str((stab_val / fund_nav * 100).quantize(Decimal("0.01")))
            else:
                sc["nav_contribution_pct"] = "0"
    else:
        result["data_status"] = "no_quarter_state"

    return result
