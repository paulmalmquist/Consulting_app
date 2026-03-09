"""REPE Finance MCP tools — composite tools wrapping deterministic engines.

These tools are available both to the fast-path (direct execution) and
to the LLM tool-calling loop (graceful fallback).
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_finance_tools import (
    CapitalCallImpactInput,
    ClawbackRiskInput,
    CompareScenariosInput,
    ConstructionWaterfallInput,
    DealGeoScoreInput,
    FundMetricsInput,
    GenerateWaterfallMemoInput,
    LpSummaryInput,
    ListScenarioTemplatesInput,
    MonteCarloWaterfallInput,
    PipelineRadarInput,
    PortfolioWaterfallInput,
    RunSaleScenarioInput,
    RunWaterfallInput,
    SensitivityMatrixInput,
    StressCapRateInput,
    UwVsActualWaterfallInput,
)
from app.observability.logger import emit_log


def _serialize(obj):
    """Convert non-serializable types to JSON-safe values."""
    from decimal import Decimal as _Decimal

    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, _Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


def _d(value) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _quarter_end(quarter: str):
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def _load_partner_map(partner_ids: list[str]) -> dict[str, dict]:
    if not partner_ids:
        return {}
    from app.db import get_cursor

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT partner_id::text AS partner_id, name, partner_type
            FROM re_partner
            WHERE partner_id = ANY(%s::uuid[])
            """,
            (partner_ids,),
        )
        return {
            row["partner_id"]: {"name": row.get("name"), "partner_type": row.get("partner_type")}
            for row in cur.fetchall()
        }


def _load_fund_context(*, fund_id: UUID, quarter: str, scenario_id: str | None = None) -> dict:
    from app.db import get_cursor

    scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
    params = [str(fund_id), quarter]
    if scenario_id:
        params.append(scenario_id)
    with get_cursor() as cur:
        cur.execute(
            "SELECT name FROM repe_fund WHERE fund_id = %s",
            (str(fund_id),),
        )
        fund = cur.fetchone() or {}
        cur.execute(
            f"""
            SELECT portfolio_nav, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND {scenario_clause}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        state = cur.fetchone() or {}
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi
            FROM re_fund_metrics_qtr
            WHERE fund_id = %s AND quarter = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        metrics = cur.fetchone() or {}
        scenario = {}
        if scenario_id:
            cur.execute("SELECT name FROM re_scenario WHERE scenario_id = %s", (scenario_id,))
            scenario = cur.fetchone() or {}
    return {"fund": fund, "state": state, "metrics": metrics, "scenario": scenario}


def _simulate_nav_with_stress(*, base_nav: Decimal, cap_rate_delta_bps: int, noi_stress_pct: Decimal) -> Decimal:
    nav_adjustment = Decimal("0")
    if cap_rate_delta_bps:
        base_cap_bps = Decimal("550")
        pct_impact = Decimal(str(cap_rate_delta_bps)) / (base_cap_bps + Decimal(str(cap_rate_delta_bps)))
        nav_adjustment -= (base_nav * pct_impact).quantize(Decimal("0.01"))
    if noi_stress_pct:
        multiplier = noi_stress_pct if abs(noi_stress_pct) <= 1 else (noi_stress_pct / Decimal("100"))
        nav_adjustment += (base_nav * multiplier).quantize(Decimal("0.01"))
    return max(base_nav + nav_adjustment, Decimal("0"))


def _summarize_waterfall_run(run: dict) -> dict:
    fund_id = UUID(str(run["fund_id"]))
    quarter = run["quarter"]
    scenario_id = str(run["scenario_id"]) if run.get("scenario_id") else None
    context = _load_fund_context(fund_id=fund_id, quarter=quarter, scenario_id=scenario_id)
    state = context["state"]
    metrics = context["metrics"]
    distributable = _d(run.get("total_distributable"))
    total_called = _d(state.get("total_called"))
    distributed_to_date = _d(state.get("total_distributed"))
    allocations = run.get("results") or []
    partner_map = _load_partner_map([str(item["partner_id"]) for item in allocations if item.get("partner_id")])

    gp_carry = Decimal("0")
    lp_total = Decimal("0")
    normalized_allocations = []
    tier_totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for item in allocations:
        amount = _d(item.get("amount"))
        partner = partner_map.get(str(item.get("partner_id")), {})
        tier_code = str(item.get("tier_code") or "")
        payout_type = str(item.get("payout_type") or "")
        partner_type = str(partner.get("partner_type") or "")
        if partner_type == "gp" or "carry" in tier_code or "catch" in tier_code or payout_type == "promote":
            gp_carry += amount
        else:
            lp_total += amount
        tier_totals[tier_code] += amount
        normalized_allocations.append({
            "tier_code": tier_code,
            "participant_id": str(item.get("partner_id") or ""),
            "partner_name": partner.get("name"),
            "partner_type": partner_type,
            "payout_type": payout_type,
            "amount": float(amount),
        })

    net_tvpi = float(((distributed_to_date + distributable) / total_called).quantize(Decimal("0.0001"))) if total_called > 0 else None
    dpi = float((distributed_to_date / total_called).quantize(Decimal("0.0001"))) if total_called > 0 else None
    rvpi = float((distributable / total_called).quantize(Decimal("0.0001"))) if total_called > 0 else None
    nav_ratio = (distributable / _d(state.get("portfolio_nav"))) if _d(state.get("portfolio_nav")) > 0 else Decimal("1")
    net_irr = None
    gross_irr = None
    if metrics.get("net_irr") is not None:
        net_irr = float((_d(metrics["net_irr"]) * nav_ratio).quantize(Decimal("0.0001")))
    if metrics.get("gross_irr") is not None:
        gross_irr = float((_d(metrics["gross_irr"]) * nav_ratio).quantize(Decimal("0.0001")))

    lp_shortfall = max(total_called - distributed_to_date - lp_total, Decimal("0"))
    return _serialize({
        "run_id": run["run_id"],
        "fund_id": str(fund_id),
        "fund_name": context["fund"].get("name"),
        "quarter": quarter,
        "scenario_id": scenario_id,
        "scenario_name": context["scenario"].get("name"),
        "created_at": run.get("created_at"),
        "allocations": normalized_allocations,
        "tier_totals": {key: float(value) for key, value in tier_totals.items()},
        "summary": {
            "total_distributed": distributable,
            "total_distributable": distributable,
            "gp_carry": gp_carry,
            "lp_total": lp_total,
            "lp_shortfall": lp_shortfall,
            "gross_irr": gross_irr,
            "net_irr": net_irr,
            "gross_tvpi": metrics.get("gross_tvpi"),
            "net_tvpi": net_tvpi,
            "dpi": dpi,
            "rvpi": rvpi,
            "nav": distributable,
            "total_called": total_called,
            "distributed_to_date": distributed_to_date,
        },
    })


def _run_waterfall_summary(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_type: str = "shadow",
    distributable_override: Decimal | None = None,
    participant_adjustments: dict[str, dict] | None = None,
) -> dict:
    from app.services.re_waterfall_runtime import run_waterfall

    run = run_waterfall(
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_type=run_type,
        distributable_override=distributable_override,
        participant_adjustments=participant_adjustments,
    )
    return _summarize_waterfall_run(run)


def _metric_delta(current: dict, baseline: dict, key: str) -> float | None:
    current_value = current.get(key)
    baseline_value = baseline.get(key)
    if current_value is None or baseline_value is None:
        return None
    try:
        return float(Decimal(str(current_value)) - Decimal(str(baseline_value)))
    except Exception:
        return None


def _load_waterfall_run_detail(run_id: UUID) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_waterfall_run WHERE run_id = %s", (str(run_id),))
        run = cur.fetchone()
        if not run:
            raise LookupError(f"Waterfall run {run_id} not found")
        cur.execute(
            """
            SELECT run_id, partner_id, tier_code, payout_type, amount, created_at
            FROM re_waterfall_run_result
            WHERE run_id = %s
            ORDER BY tier_code, created_at
            """,
            (str(run_id),),
        )
        run["results"] = cur.fetchall()
    return _summarize_waterfall_run(run)


def _parse_markdown_sections(markdown: str) -> list[dict]:
    sections: list[dict] = []
    current = {"title": "Memo", "body": ""}
    for line in markdown.splitlines():
        if line.startswith("#"):
            if current["body"].strip():
                sections.append(current)
            current = {"title": line.lstrip("# ").strip() or "Section", "body": ""}
        else:
            current["body"] += f"{line}\n"
    if current["body"].strip():
        sections.append(current)
    return sections or [{"title": "Memo", "body": markdown}]


# ── Tool handlers ────────────────────────────────────────────────────────────


def _run_sale_scenario(ctx: McpContext, inp: RunSaleScenarioInput) -> dict:
    """Run a sale scenario and return base vs scenario metrics with deltas."""
    from app.services.re_sale_scenario import compute_scenario_metrics, create_sale_assumption
    from app.db import get_cursor
    from datetime import date
    from uuid import uuid4

    fund_id = inp.fund_id
    quarter = inp.quarter
    env_id = inp.env_id
    business_id = inp.business_id

    # If no scenario_id, create a temp scenario
    scenario_id = inp.scenario_id
    if not scenario_id:
        # Create temporary scenario in re_model_scenarios
        scenario_id = uuid4()
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO re_model_scenarios (scenario_id, model_id, name, description, is_base, status)
                VALUES (%s, NULL, %s, %s, false, 'temp')
                ON CONFLICT DO NOTHING
                """,
                (str(scenario_id), "Temp Sale Scenario", "Auto-created by Winston fast-path"),
            )

    # If sale_price is provided, create the sale assumption
    if inp.sale_price:
        deal_id = inp.deal_id or inp.asset_id  # fallback
        if deal_id:
            sale_date = date.fromisoformat(inp.sale_date) if inp.sale_date else _quarter_end(quarter)
            create_sale_assumption(
                fund_id=fund_id,
                scenario_id=scenario_id,
                deal_id=deal_id,
                asset_id=inp.asset_id,
                sale_price=Decimal(str(inp.sale_price)),
                sale_date=sale_date,
                memo="Auto-created by Winston fast-path",
            )

    result = compute_scenario_metrics(
        env_id=env_id,
        business_id=UUID(business_id),
        fund_id=fund_id,
        scenario_id=scenario_id,
        quarter=quarter,
    )

    emit_log(
        level="info", service="backend", action="finance.run_sale_scenario",
        message=f"Sale scenario computed for fund {fund_id}",
        context={"fund_id": str(fund_id), "quarter": quarter},
    )

    return _serialize(result)


def _run_waterfall(ctx: McpContext, inp: RunWaterfallInput) -> dict:
    """Run waterfall distribution for a fund quarter."""
    result = _run_waterfall_summary(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        scenario_id=inp.scenario_id,
    )

    emit_log(
        level="info", service="backend", action="finance.run_waterfall",
        message=f"Waterfall executed for fund {inp.fund_id}",
        context={"fund_id": str(inp.fund_id), "quarter": inp.quarter},
    )

    return _serialize(result)


def _fund_metrics(ctx: McpContext, inp: FundMetricsInput) -> dict:
    """Retrieve fund-level metrics for a specific quarter."""
    from app.db import get_cursor

    with get_cursor() as cur:
        # Get latest metrics for the fund+quarter
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi, cash_on_cash
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        metrics_row = cur.fetchone()

        # Get fund state (NAV, called, distributed)
        cur.execute(
            """
            SELECT portfolio_nav, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(inp.fund_id), inp.quarter),
        )
        state_row = cur.fetchone()

        # Get gross-net bridge
        cur.execute(
            """
            SELECT gross_return, mgmt_fees, fund_expenses, carry_shadow, net_return
            FROM re_gross_net_bridge_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        bridge_row = cur.fetchone()

    result = {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "metrics": _serialize(dict(metrics_row)) if metrics_row else {},
        "state": _serialize(dict(state_row)) if state_row else {},
        "gross_net_bridge": _serialize(dict(bridge_row)) if bridge_row else {},
    }

    return result


def _stress_cap_rate(ctx: McpContext, inp: StressCapRateInput) -> dict:
    """Stress test cap rate across a fund's assets."""
    from app.db import get_cursor

    delta_bps = inp.cap_rate_delta_bps
    delta_decimal = Decimal(str(delta_bps)) / Decimal("10000")

    with get_cursor() as cur:
        # Get current fund metrics (base case)
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (inp.env_id, inp.business_id, str(inp.fund_id), inp.quarter),
        )
        base_metrics = cur.fetchone()

        # Get asset valuations with cap rates
        cur.execute(
            """
            SELECT vs.asset_id, vs.valuation_amount, vs.cap_rate,
                   a.name AS asset_name
            FROM re_valuation_snapshot vs
            JOIN repe_asset a ON a.asset_id = vs.asset_id
            WHERE vs.fund_id = %s AND vs.quarter = %s
            ORDER BY vs.valuation_amount DESC
            """,
            (str(inp.fund_id), inp.quarter),
        )
        assets = cur.fetchall()

    # Calculate stressed valuations
    stressed_assets = []
    total_base_nav = Decimal("0")
    total_stressed_nav = Decimal("0")

    for asset in assets:
        base_val = Decimal(str(asset["valuation_amount"])) if asset.get("valuation_amount") else Decimal("0")
        base_cap = Decimal(str(asset["cap_rate"])) if asset.get("cap_rate") else None

        total_base_nav += base_val

        if base_cap and base_cap > 0 and base_val > 0:
            # NOI = value * cap_rate, stressed_value = NOI / (cap_rate + delta)
            noi = base_val * base_cap
            stressed_cap = base_cap + delta_decimal
            stressed_val = (noi / stressed_cap).quantize(Decimal("0.01")) if stressed_cap > 0 else base_val
            nav_impact = stressed_val - base_val
        else:
            stressed_val = base_val
            nav_impact = Decimal("0")

        total_stressed_nav += stressed_val
        stressed_assets.append({
            "asset_id": str(asset["asset_id"]),
            "asset_name": asset.get("asset_name", "Unknown"),
            "base_valuation": float(base_val),
            "stressed_valuation": float(stressed_val),
            "nav_impact": float(nav_impact),
            "base_cap_rate": float(base_cap) if base_cap else None,
            "stressed_cap_rate": float(base_cap + delta_decimal) if base_cap else None,
        })

    nav_delta = total_stressed_nav - total_base_nav
    nav_delta_pct = float((nav_delta / total_base_nav * Decimal("100")).quantize(Decimal("0.01"))) if total_base_nav > 0 else 0

    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "cap_rate_delta_bps": delta_bps,
        "base_nav": float(total_base_nav),
        "stressed_nav": float(total_stressed_nav),
        "nav_delta": float(nav_delta),
        "nav_delta_pct": nav_delta_pct,
        "base_metrics": _serialize(dict(base_metrics)) if base_metrics else {},
        "assets": stressed_assets,
    }


def _compare_scenarios(ctx: McpContext, inp: CompareScenariosInput) -> dict:
    """Compare multiple scenarios side-by-side."""
    from app.db import get_cursor

    results = []
    with get_cursor() as cur:
        for sid in inp.scenario_ids:
            cur.execute(
                """
                SELECT scenario_id, quarter, gross_irr, net_irr,
                       gross_tvpi, net_tvpi, dpi, rvpi,
                       total_distributed, portfolio_nav, carry_estimate
                FROM re_scenario_metrics_snapshot
                WHERE fund_id = %s AND scenario_id = %s AND quarter = %s
                ORDER BY computed_at DESC LIMIT 1
                """,
                (str(inp.fund_id), sid, inp.quarter),
            )
            row = cur.fetchone()
            if row:
                results.append(_serialize(dict(row)))

    return {
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "scenarios": results,
        "scenario_count": len(results),
    }


def _lp_summary(ctx: McpContext, inp: LpSummaryInput) -> dict:
    """Build consolidated LP summary with capital accounts and waterfall."""
    from app.services.re_sale_scenario import get_lp_summary

    result = get_lp_summary(
        env_id=inp.env_id,
        business_id=UUID(inp.business_id),
        fund_id=inp.fund_id,
        quarter=inp.quarter,
    )

    return _serialize(result)


def _monte_carlo_waterfall(ctx: McpContext, inp: MonteCarloWaterfallInput) -> dict:
    scenarios = {
        "p10": _run_waterfall_summary(
            fund_id=inp.fund_id,
            quarter=inp.quarter,
            distributable_override=_d(inp.p10_nav),
            run_type="monte_carlo_p10",
        ),
        "p50": _run_waterfall_summary(
            fund_id=inp.fund_id,
            quarter=inp.quarter,
            distributable_override=_d(inp.p50_nav),
            run_type="monte_carlo_p50",
        ),
        "p90": _run_waterfall_summary(
            fund_id=inp.fund_id,
            quarter=inp.quarter,
            distributable_override=_d(inp.p90_nav),
            run_type="monte_carlo_p90",
        ),
    }
    p50_summary = scenarios["p50"]["summary"]
    return _serialize({
        **scenarios,
        "deltas": {
            "p10_vs_p50": {
                "lp_total": _metric_delta(scenarios["p10"]["summary"], p50_summary, "lp_total"),
                "gp_carry": _metric_delta(scenarios["p10"]["summary"], p50_summary, "gp_carry"),
                "net_tvpi": _metric_delta(scenarios["p10"]["summary"], p50_summary, "net_tvpi"),
            },
            "p90_vs_p50": {
                "lp_total": _metric_delta(scenarios["p90"]["summary"], p50_summary, "lp_total"),
                "gp_carry": _metric_delta(scenarios["p90"]["summary"], p50_summary, "gp_carry"),
                "net_tvpi": _metric_delta(scenarios["p90"]["summary"], p50_summary, "net_tvpi"),
            },
        },
    })


def _portfolio_waterfall(ctx: McpContext, inp: PortfolioWaterfallInput) -> dict:
    funds: list[dict] = []
    total_nav = Decimal("0")
    weighted_irr_numerator = Decimal("0")
    total_carry = Decimal("0")
    total_lp_shortfall = Decimal("0")
    for fund_id in inp.fund_ids:
        summary = _run_waterfall_summary(fund_id=fund_id, quarter=inp.quarter, run_type="portfolio_rollup")
        fund_summary = summary["summary"]
        nav = _d(fund_summary.get("total_distributable"))
        irr = _d(fund_summary.get("net_irr"))
        carry = _d(fund_summary.get("gp_carry"))
        lp_shortfall = _d(fund_summary.get("lp_shortfall"))
        funds.append({
            "fund_id": str(fund_id),
            "fund_name": summary.get("fund_name"),
            "nav": nav,
            "net_irr": irr,
            "carry": carry,
            "lp_shortfall": lp_shortfall,
            "lp_total": fund_summary.get("lp_total"),
            "run_id": summary.get("run_id"),
        })
        total_nav += nav
        weighted_irr_numerator += nav * irr
        total_carry += carry
        total_lp_shortfall += lp_shortfall

    weighted_irr = (weighted_irr_numerator / total_nav).quantize(Decimal("0.0001")) if total_nav > 0 else Decimal("0")
    contribution_base = sum(abs(_d(fund.get("nav"))) for fund in funds) or Decimal("1")
    hhi = sum(((_d(fund.get("nav")) / contribution_base) ** 2) for fund in funds)
    diversification_score = max(Decimal("0"), Decimal("100") * (Decimal("1") - hhi))

    portfolio = {
        "total_nav": total_nav,
        "weighted_irr": weighted_irr,
        "total_carry": total_carry,
        "total_lp_shortfall": total_lp_shortfall,
    }
    return _serialize({
        "funds": funds,
        "portfolio": portfolio,
        "diversification_score": diversification_score.quantize(Decimal("0.01")),
    })


def _deal_geo_score(ctx: McpContext, inp: DealGeoScoreInput) -> dict:
    from app.services import re_pipeline

    return _serialize(re_pipeline.enrich_deal_with_geo(
        deal_id=str(inp.deal_id),
        market_id=inp.market_id,
    ))


def _pipeline_radar(ctx: McpContext, inp: PipelineRadarInput) -> dict:
    from app.services.re_deal_scoring import batch_score_deals

    deals = batch_score_deals(
        env_id=inp.env_id,
        business_id=inp.business_id,
        stage_filter=inp.stage_filter,
    )
    return _serialize({
        "deals": deals,
        "top_5": deals[:5],
        "count": len(deals),
    })


def _list_scenario_templates(ctx: McpContext, inp: ListScenarioTemplatesInput) -> dict:
    from app.services.re_scenario_templates import list_templates

    return _serialize({"templates": list_templates(env_id=inp.env_id)})


def _generate_waterfall_memo(ctx: McpContext, inp: GenerateWaterfallMemoInput) -> dict:
    import openai

    from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL
    from app.services.model_registry import sanitize_params

    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")

    base = _load_waterfall_run_detail(inp.run_id_base)
    scenario = _load_waterfall_run_detail(inp.run_id_scenario)
    deltas = {
        key: _metric_delta(scenario["summary"], base["summary"], key)
        for key in ("total_distributable", "gp_carry", "lp_total", "net_irr", "net_tvpi")
    }
    fund_name = scenario.get("fund_name") or base.get("fund_name") or str(inp.fund_id)
    prompt = (
        f"Given these waterfall results for {fund_name} in {inp.quarter}, write an IC memo section covering: "
        "(1) Scenario Assumptions, (2) Key Metrics Impact, (3) LP Distribution Impact by Tier, "
        "(4) GP Carry Economics, (5) Risk Factors and Mitigants.\n\n"
        f"Base summary: {json.dumps(base['summary'], default=str)}\n"
        f"Scenario summary: {json.dumps(scenario['summary'], default=str)}\n"
        f"Deltas: {json.dumps(deltas, default=str)}\n"
        f"Tier deltas: {json.dumps({k: scenario['tier_totals'].get(k, 0) - base['tier_totals'].get(k, 0) for k in set(base['tier_totals']) | set(scenario['tier_totals'])}, default=str)}\n"
        "Use markdown headings."
    )
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(**sanitize_params(
        OPENAI_CHAT_MODEL,
        messages=[
            {"role": "system", "content": "You write concise institutional investment committee memos."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1200,
        reasoning_effort="medium",
    ))
    memo_markdown = response.choices[0].message.content or ""
    sections = _parse_markdown_sections(memo_markdown)
    return _serialize({
        "memo_markdown": memo_markdown,
        "sections": sections,
        "metadata": {
            "fund_name": fund_name,
            "quarter": inp.quarter,
            "scenarios_compared": [str(inp.run_id_base), str(inp.run_id_scenario)],
        },
    })


def _capital_call_impact(ctx: McpContext, inp: CapitalCallImpactInput) -> dict:
    from app.services.re_capital_account import rollforward_with_injection

    result = rollforward_with_injection(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        additional_call_amount=_d(inp.additional_call_amount),
    )
    base = _summarize_waterfall_run(result["base_waterfall"])
    after = _summarize_waterfall_run(result["injected_waterfall"])
    return _serialize({
        "before": base,
        "after": after,
        "deltas": {
            "lp_total": _metric_delta(after["summary"], base["summary"], "lp_total"),
            "gp_carry": _metric_delta(after["summary"], base["summary"], "gp_carry"),
            "net_tvpi": _metric_delta(after["summary"], base["summary"], "net_tvpi"),
        },
        "additional_call_amount": inp.additional_call_amount,
        "before_rollforward": result["before_rollforward"],
        "after_rollforward": result["after_rollforward"],
    })


def _clawback_risk(ctx: McpContext, inp: ClawbackRiskInput) -> dict:
    from app.finance.clawback_engine import compute_clawback, compute_promote_position

    summary = _run_waterfall_summary(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        scenario_id=inp.scenario_id,
        run_type="clawback_risk_check",
    )
    metrics = summary["summary"]
    nav = _d(metrics.get("nav"))
    gp_profit_paid = _d(metrics.get("gp_carry"))
    lp_shortfall = _d(metrics.get("lp_shortfall"))
    gp_target_profit = max(gp_profit_paid - (lp_shortfall * Decimal("0.50")), Decimal("0"))
    clawback = compute_clawback(gp_profit_paid, gp_target_profit)
    promote = compute_promote_position(gp_target_profit, gp_profit_paid)
    outstanding = _d(clawback["outstanding_amount"])
    promote_gap = gp_target_profit - gp_profit_paid
    nav_ratio = (outstanding / nav) if nav > 0 else Decimal("0")
    if outstanding == 0 and promote_gap >= 0:
        risk_level = "none"
    elif nav_ratio < Decimal("0.01"):
        risk_level = "low"
    elif nav_ratio <= Decimal("0.03"):
        risk_level = "medium"
    else:
        risk_level = "high"
    if promote_gap < 0:
        risk_level = "high"
    return _serialize({
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "scenario_id": str(inp.scenario_id) if inp.scenario_id else None,
        "clawback_liability": clawback["liability_amount"],
        "clawback_outstanding": clawback["outstanding_amount"],
        "promote_outstanding": promote["promote_outstanding"],
        "risk_level": risk_level,
        "reference_run_id": summary["run_id"],
    })


def _uw_vs_actual_waterfall(ctx: McpContext, inp: UwVsActualWaterfallInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        if inp.model_id:
            cur.execute(
                """
                SELECT id, name
                FROM re_model_scenarios
                WHERE model_id = %s AND is_base = true
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT 1
                """,
                (str(inp.model_id),),
            )
        else:
            cur.execute(
                """
                SELECT scenario_id AS id, name
                FROM re_scenario
                WHERE fund_id = %s AND is_base = true
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(inp.fund_id),),
            )
        base_scenario = cur.fetchone()

    if not base_scenario:
        raise LookupError(f"No underwriting/base scenario found for fund {inp.fund_id}")

    actual = _run_waterfall_summary(fund_id=inp.fund_id, quarter=inp.quarter, run_type="uw_actual")
    uw = _run_waterfall_summary(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        scenario_id=UUID(str(base_scenario["id"])),
        run_type="uw_baseline",
    )
    tier_keys = sorted(set(actual["tier_totals"]) | set(uw["tier_totals"]))
    tier_attribution = [
        {
            "tier_code": key,
            "uw_amount": uw["tier_totals"].get(key, 0),
            "actual_amount": actual["tier_totals"].get(key, 0),
            "delta": actual["tier_totals"].get(key, 0) - uw["tier_totals"].get(key, 0),
        }
        for key in tier_keys
    ]
    largest_driver = max(tier_attribution, key=lambda item: abs(item["delta"]), default={"tier_code": "nav"})
    return _serialize({
        "uw": uw,
        "actual": actual,
        "attribution": {
            "nav_attribution": {
                "uw_nav": uw["summary"].get("nav"),
                "actual_nav": actual["summary"].get("nav"),
                "delta": _metric_delta(actual["summary"], uw["summary"], "nav"),
            },
            "irr_attribution": {
                "uw_irr": uw["summary"].get("net_irr"),
                "actual_irr": actual["summary"].get("net_irr"),
                "delta": _metric_delta(actual["summary"], uw["summary"], "net_irr"),
            },
            "tier_attribution": tier_attribution,
            "largest_driver": largest_driver["tier_code"],
        },
        "narrative_hint": (
            f"Actual IRR trails underwriting by "
            f"{(_metric_delta(actual['summary'], uw['summary'], 'net_irr') or 0) * 100:.0f}bps, "
            f"primarily driven by {largest_driver['tier_code']}."
        ),
    })


def _sensitivity_matrix(ctx: McpContext, inp: SensitivityMatrixInput) -> dict:
    context = _load_fund_context(fund_id=inp.fund_id, quarter=inp.quarter)
    base_nav = _d(context["state"].get("portfolio_nav"))
    rows: list[list[float | None]] = []
    for noi_stress in inp.noi_stress_range_pct:
        row: list[float | None] = []
        for cap_rate in inp.cap_rate_range_bps:
            scenario_nav = _simulate_nav_with_stress(
                base_nav=base_nav,
                cap_rate_delta_bps=cap_rate,
                noi_stress_pct=_d(noi_stress),
            )
            summary = _run_waterfall_summary(
                fund_id=inp.fund_id,
                quarter=inp.quarter,
                distributable_override=scenario_nav,
                run_type="sensitivity_matrix",
            )
            metric_value = summary["summary"].get(inp.metric)
            if metric_value is None and inp.metric == "net_irr" and base_nav > 0:
                metric_value = float((_d(context["metrics"].get("net_irr")) * (scenario_nav / base_nav)).quantize(Decimal("0.0001")))
            row.append(float(metric_value) if metric_value is not None else None)
        rows.append(row)
    base_value = rows[0][0] if rows and rows[0] else None
    return _serialize({
        "rows": rows,
        "col_headers": [str(item) for item in inp.cap_rate_range_bps],
        "row_headers": [str(item) for item in inp.noi_stress_range_pct],
        "metric_name": inp.metric,
        "base_value": base_value,
    })


def _construction_waterfall(ctx: McpContext, inp: ConstructionWaterfallInput) -> dict:
    from app.services.re_construction import adjust_waterfall_timing, load_budget_summary, load_construction_schedule, project_stabilization

    schedule = load_construction_schedule(fund_id=inp.fund_id, asset_id=inp.asset_id)
    budget = load_budget_summary(fund_id=inp.fund_id, asset_id=inp.asset_id, quarter=inp.quarter)
    avg_monthly_draw = (
        sum(_d(item.get("amount")) for item in schedule) / Decimal(str(max(len(schedule), 1)))
        if schedule else Decimal("1")
    )
    projection = project_stabilization(
        budget=budget["revised_budget"],
        committed=budget["committed_cost"],
        actual=budget["actual_cost"],
        monthly_draw_rate=avg_monthly_draw,
        as_of_date=budget["as_of_date"],
    )
    timing = adjust_waterfall_timing(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        construction_projections=projection,
    )
    base = _run_waterfall_summary(fund_id=inp.fund_id, quarter=inp.quarter, run_type="construction_base")
    adjusted = _run_waterfall_summary(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        distributable_override=(_d(base["summary"]["total_distributable"]) * _d(timing["timing_discount_factor"])).quantize(Decimal("0.01")),
        run_type="construction_adjusted",
    )
    return _serialize({
        "base": base,
        "construction_adjusted": adjusted,
        "stabilization_date": projection["stabilization_date"],
        "months_to_stabilization": projection["months_to_stabilization"],
        "exit_shift_applied": timing["exit_shift_applied"],
        "construction_schedule": schedule,
    })


# ── Registration ─────────────────────────────────────────────────────────────

def register_repe_finance_tools():
    """Register all REPE finance composite tools."""

    registry.register(ToolDef(
        name="finance.run_sale_scenario",
        description="Run a hypothetical sale scenario for an asset/deal and compute IRR/TVPI impact vs base case",
        module="bm",
        permission="read",
        input_model=RunSaleScenarioInput,
        handler=_run_sale_scenario,
    ))

    registry.register(ToolDef(
        name="finance.run_waterfall",
        description="Run waterfall distribution (return of capital, preferred return, catch-up, carry split) for a fund quarter",
        module="bm",
        permission="read",
        input_model=RunWaterfallInput,
        handler=_run_waterfall,
    ))

    registry.register(ToolDef(
        name="finance.fund_metrics",
        description="Get fund-level performance metrics (IRR, TVPI, DPI, RVPI, NAV) for a specific quarter",
        module="bm",
        permission="read",
        input_model=FundMetricsInput,
        handler=_fund_metrics,
    ))

    registry.register(ToolDef(
        name="finance.stress_cap_rate",
        description="Stress test cap rate expansion across all assets in a fund and show NAV impact",
        module="bm",
        permission="read",
        input_model=StressCapRateInput,
        handler=_stress_cap_rate,
    ))

    registry.register(ToolDef(
        name="finance.compare_scenarios",
        description="Compare multiple scenario snapshots side-by-side with deltas",
        module="bm",
        permission="read",
        input_model=CompareScenariosInput,
        handler=_compare_scenarios,
    ))

    registry.register(ToolDef(
        name="finance.lp_summary",
        description="Build consolidated LP summary with capital accounts, partner returns, and waterfall allocations",
        module="bm",
        permission="read",
        input_model=LpSummaryInput,
        handler=_lp_summary,
    ))

    registry.register(ToolDef(
        name="finance.monte_carlo_waterfall",
        description="Run P10, P50, and P90 percentile waterfalls from Monte Carlo output",
        module="bm",
        permission="read",
        input_model=MonteCarloWaterfallInput,
        handler=_monte_carlo_waterfall,
    ))

    registry.register(ToolDef(
        name="finance.portfolio_waterfall",
        description="Aggregate waterfall outcomes across multiple funds",
        module="bm",
        permission="read",
        input_model=PortfolioWaterfallInput,
        handler=_portfolio_waterfall,
    ))

    registry.register(ToolDef(
        name="finance.deal_geo_score",
        description="Enrich a pipeline deal with geo market metrics and a geo risk score",
        module="bm",
        permission="read",
        input_model=DealGeoScoreInput,
        handler=_deal_geo_score,
    ))

    registry.register(ToolDef(
        name="finance.pipeline_radar",
        description="Score and rank pipeline deals for the radar workspace",
        module="bm",
        permission="read",
        input_model=PipelineRadarInput,
        handler=_pipeline_radar,
    ))

    registry.register(ToolDef(
        name="finance.list_scenario_templates",
        description="List named waterfall stress templates",
        module="bm",
        permission="read",
        input_model=ListScenarioTemplatesInput,
        handler=_list_scenario_templates,
    ))

    registry.register(ToolDef(
        name="finance.generate_waterfall_memo",
        description="Generate an IC memo section comparing two waterfall runs",
        module="bm",
        permission="read",
        input_model=GenerateWaterfallMemoInput,
        handler=_generate_waterfall_memo,
    ))

    registry.register(ToolDef(
        name="finance.capital_call_impact",
        description="Estimate the impact of an incremental capital call on waterfall outcomes",
        module="bm",
        permission="read",
        input_model=CapitalCallImpactInput,
        handler=_capital_call_impact,
    ))

    registry.register(ToolDef(
        name="finance.clawback_risk",
        description="Assess GP clawback and promote risk from a waterfall outcome",
        module="bm",
        permission="read",
        input_model=ClawbackRiskInput,
        handler=_clawback_risk,
    ))

    registry.register(ToolDef(
        name="finance.uw_vs_actual_waterfall",
        description="Compare underwriting and actual waterfall outcomes for a fund",
        module="bm",
        permission="read",
        input_model=UwVsActualWaterfallInput,
        handler=_uw_vs_actual_waterfall,
    ))

    registry.register(ToolDef(
        name="finance.sensitivity_matrix",
        description="Run a 2D waterfall sensitivity matrix across cap-rate and NOI stress assumptions",
        module="bm",
        permission="read",
        input_model=SensitivityMatrixInput,
        handler=_sensitivity_matrix,
    ))

    registry.register(ToolDef(
        name="finance.construction_waterfall",
        description="Compare base and construction-adjusted waterfall outcomes",
        module="bm",
        permission="read",
        input_model=ConstructionWaterfallInput,
        handler=_construction_waterfall,
    ))
