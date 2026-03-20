"""REPE Analysis MCP tools — waterfall comparison and NOI variance.

Read-only tools for comparing waterfall runs side-by-side and
retrieving budget vs actual variance data.
"""
from __future__ import annotations

from decimal import Decimal

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_analysis_tools import (
    CompareWaterfallRunsInput,
    NoiVarianceInput,
    ScanPortfolioUwVsActualInput,
)
from app.observability.logger import emit_log


def _serialize(obj):
    """Convert non-serializable types to JSON-safe values."""
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
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


# ── Handlers ───────────────────────────────────────────────────────────────────


def _compare_waterfall_runs(ctx: McpContext, inp: CompareWaterfallRunsInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        # Fetch run metadata for both runs
        cur.execute(
            """
            SELECT
              wr.run_id::text,
              wr.fund_id::text,
              f.name AS fund_name,
              wr.quarter,
              wr.run_type,
              wr.total_distributable::text,
              wr.status,
              wr.created_at::text,
              s.name AS scenario_name,
              s.scenario_type
            FROM re_waterfall_run wr
            JOIN repe_fund f ON f.fund_id = wr.fund_id
            LEFT JOIN re_scenario s ON s.scenario_id = wr.scenario_id
            WHERE wr.run_id = ANY(%s::uuid[])
            """,
            ([inp.run_id_a, inp.run_id_b],),
        )
        runs_rows = cur.fetchall()

    run_map = {row["run_id"]: row for row in runs_rows}
    run_a_meta = run_map.get(inp.run_id_a)
    run_b_meta = run_map.get(inp.run_id_b)

    if not run_a_meta or not run_b_meta:
        return {"error": "One or both waterfall runs not found"}

    with get_cursor() as cur:
        # Fetch allocations for both runs
        cur.execute(
            """
            SELECT
              wrr.run_id::text,
              wrr.result_id::text,
              wrr.partner_id::text,
              p.name AS partner_name,
              wrr.tier_code,
              wrr.payout_type,
              wrr.amount::text,
              wrr.ending_capital_balance::text
            FROM re_waterfall_run_result wrr
            LEFT JOIN re_partner p ON p.partner_id = wrr.partner_id
            WHERE wrr.run_id = ANY(%s::uuid[])
            ORDER BY wrr.tier_code, p.name
            LIMIT 500
            """,
            ([inp.run_id_a, inp.run_id_b],),
        )
        allocs = cur.fetchall()

    allocs_a = [a for a in allocs if a["run_id"] == inp.run_id_a]
    allocs_b = [a for a in allocs if a["run_id"] == inp.run_id_b]

    # Compute deltas by tier
    tier_totals_a: dict[str, Decimal] = {}
    tier_totals_b: dict[str, Decimal] = {}
    for a in allocs_a:
        tier = a["tier_code"]
        tier_totals_a[tier] = tier_totals_a.get(tier, Decimal("0")) + _d(a.get("amount"))
    for b in allocs_b:
        tier = b["tier_code"]
        tier_totals_b[tier] = tier_totals_b.get(tier, Decimal("0")) + _d(b.get("amount"))

    all_tiers = set(tier_totals_a.keys()) | set(tier_totals_b.keys())
    by_tier = {}
    for tier in sorted(all_tiers):
        delta = tier_totals_b.get(tier, Decimal("0")) - tier_totals_a.get(tier, Decimal("0"))
        by_tier[tier] = str(delta)

    # Compute deltas by partner
    partner_totals_a: dict[str, Decimal] = {}
    partner_totals_b: dict[str, Decimal] = {}
    for a in allocs_a:
        name = a.get("partner_name") or a.get("partner_id") or "Unknown"
        partner_totals_a[name] = partner_totals_a.get(name, Decimal("0")) + _d(a.get("amount"))
    for b in allocs_b:
        name = b.get("partner_name") or b.get("partner_id") or "Unknown"
        partner_totals_b[name] = partner_totals_b.get(name, Decimal("0")) + _d(b.get("amount"))

    all_partners = set(partner_totals_a.keys()) | set(partner_totals_b.keys())
    by_partner = {}
    for partner in sorted(all_partners):
        delta = partner_totals_b.get(partner, Decimal("0")) - partner_totals_a.get(partner, Decimal("0"))
        by_partner[partner] = str(delta)

    total_dist_a = _d(run_a_meta.get("total_distributable"))
    total_dist_b = _d(run_b_meta.get("total_distributable"))

    emit_log(
        level="info",
        service="mcp",
        action="finance.compare_waterfall_runs",
        message=f"Compared waterfall runs {inp.run_id_a[:8]} vs {inp.run_id_b[:8]}",
        context={"run_id_a": inp.run_id_a, "run_id_b": inp.run_id_b},
    )

    return _serialize({
        "run_a": {**run_a_meta, "allocations": allocs_a},
        "run_b": {**run_b_meta, "allocations": allocs_b},
        "deltas": {
            "total_distributable": str(total_dist_b - total_dist_a),
            "by_tier": by_tier,
            "by_partner": by_partner,
        },
    })


def _noi_variance(ctx: McpContext, inp: NoiVarianceInput) -> dict:
    from app.db import get_cursor

    with get_cursor() as cur:
        conditions = ["v.business_id = %s"]
        params: list = [inp.business_id]

        if inp.fund_id:
            conditions.append("v.fund_id = %s")
            params.append(str(inp.fund_id))

        if inp.quarter:
            conditions.append("v.quarter = %s")
            params.append(inp.quarter)

        if inp.asset_id:
            conditions.append("v.asset_id = %s")
            params.append(str(inp.asset_id))

        where = " AND ".join(conditions)

        cur.execute(
            f"""
            SELECT
              v.id::text,
              v.run_id::text,
              v.fund_id::text,
              v.asset_id::text,
              a.name AS asset_name,
              a.property_type,
              a.address_city,
              a.address_state,
              v.quarter,
              v.line_code,
              v.actual_amount::text,
              v.plan_amount::text,
              v.variance_amount::text,
              v.variance_pct::text
            FROM re_asset_variance_qtr v
            JOIN repe_asset a ON a.asset_id = v.asset_id
            WHERE {where}
            ORDER BY a.name, v.line_code
            """,
            params,
        )
        rows = cur.fetchall()

    # Compute summary
    total_actual = Decimal("0")
    total_plan = Decimal("0")
    total_variance = Decimal("0")
    pct_sum = Decimal("0")
    pct_count = 0

    for row in rows:
        total_actual += _d(row.get("actual_amount"))
        total_plan += _d(row.get("plan_amount"))
        total_variance += _d(row.get("variance_amount"))
        if row.get("variance_pct") is not None:
            pct_sum += _d(row.get("variance_pct"))
            pct_count += 1

    avg_variance_pct = (pct_sum / pct_count) if pct_count > 0 else Decimal("0")

    emit_log(
        level="info",
        service="mcp",
        action="finance.noi_variance",
        message=f"Retrieved {len(rows)} variance rows",
        context={"business_id": inp.business_id, "fund_id": str(inp.fund_id) if inp.fund_id else None},
    )

    return _serialize({
        "variance_items": rows,
        "count": len(rows),
        "summary": {
            "total_actual": str(total_actual),
            "total_plan": str(total_plan),
            "total_variance": str(total_variance),
            "avg_variance_pct": str(avg_variance_pct.quantize(Decimal("0.01"))),
        },
    })


def _scan_portfolio_uw_vs_actual(ctx: McpContext, inp: ScanPortfolioUwVsActualInput) -> dict:
    from app.services.re_uw_vs_actual import compute_portfolio_scorecard

    scorecard = compute_portfolio_scorecard(
        fund_id=inp.fund_id,
        quarter=inp.quarter,
        baseline=inp.baseline,
    )

    threshold = Decimal(str(inp.threshold_bps)) / Decimal("10000")
    flagged = []
    for row in scorecard.get("rows", []):
        delta = row.get("delta_irr")
        if delta is not None and abs(delta) >= threshold:
            risk = "high" if abs(delta) >= Decimal("0.03") else "medium"
            flagged.append({
                **row,
                "risk_flag": risk,
                "abs_delta_irr": abs(delta),
            })
        elif row.get("uw_irr") is None:
            flagged.append({**row, "risk_flag": "no_baseline", "abs_delta_irr": None})

    flagged.sort(key=lambda r: r.get("abs_delta_irr") or Decimal("0"), reverse=True)

    emit_log(
        level="info",
        service="mcp",
        action="repe.scan_portfolio_uw_vs_actual",
        message=f"Scanned {len(scorecard.get('rows', []))} investments, flagged {len(flagged)}",
        context={"fund_id": str(inp.fund_id), "threshold_bps": inp.threshold_bps},
    )

    return _serialize({
        "fund_id": str(inp.fund_id),
        "quarter": inp.quarter,
        "baseline": inp.baseline,
        "threshold_bps": inp.threshold_bps,
        "scanned": len(scorecard.get("rows", [])),
        "flagged": len(flagged),
        "results": flagged,
        "summary": scorecard.get("summary", {}),
    })


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_analysis_tools():
    """Register REPE analysis MCP tools."""

    registry.register(ToolDef(
        name="finance.compare_waterfall_runs",
        description="Compare two waterfall runs side-by-side showing allocation deltas by tier and partner",
        module="bm",
        permission="read",
        input_model=CompareWaterfallRunsInput,
        handler=_compare_waterfall_runs,
        tags=frozenset({"repe", "analysis"}),
    ))

    registry.register(ToolDef(
        name="finance.noi_variance",
        description="Retrieve budget vs actual NOI variance by asset and line code with summary statistics",
        module="bm",
        permission="read",
        input_model=NoiVarianceInput,
        handler=_noi_variance,
        tags=frozenset({"repe", "analysis"}),
    ))

    registry.register(ToolDef(
        name="repe.scan_portfolio_uw_vs_actual",
        description="Scan all portfolio investments and return a ranked list of those with IRR variance exceeding a threshold vs their locked underwriting model. Returns risk flags and delta metrics.",
        module="bm",
        permission="read",
        input_model=ScanPortfolioUwVsActualInput,
        handler=_scan_portfolio_uw_vs_actual,
        tags=frozenset({"repe", "analysis", "underwriting", "portfolio"}),
    ))
