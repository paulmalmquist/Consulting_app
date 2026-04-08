"""Meridian deterministic executor.

Executes a MeridianStructuredContract against REPE services
and returns a StructuredExecutionResult — no LLM, no narrative fallback.

Hard-mapped use cases (spec §E):
  1. fund inventory / rundown / list         → repe.list_funds
  2. summarize each fund's performance       → re_fund_quarter_state
  3. total commitments / breakout by fund    → re_env_portfolio.get_portfolio_kpis
  4. total asset count / active asset count  → repe.count_assets
  5. NOI variance ranked / filter / list     → re_asset_variance_qtr
  6. investment-level gross IRR              → degrade to fund-level with explanation
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.assistant_runtime.meridian_structured_parser import MeridianStructuredContract
from app.db import get_cursor
from app.observability.logger import emit_log


@dataclass
class StructuredExecutionResult:
    answer_text: str = ""
    rows: list[dict[str, Any]] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)
    source_path: str = ""
    degraded: bool = False
    degraded_reason: str | None = None
    canonical_source: str = ""
    result_memory: dict[str, Any] | None = None
    structured_receipt: dict[str, Any] | None = None


# ── Helpers ────────────────────────────────────────────────────────────

def _d(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _fmt_money(val: Any) -> str:
    d = _d(val)
    if d >= 1_000_000:
        return f"${d / 1_000_000:,.1f}M"
    if d >= 1_000:
        return f"${d / 1_000:,.0f}K"
    return f"${d:,.0f}"


def _fmt_pct(val: Any, *, decimals: int = 1) -> str:
    d = _d(val)
    if abs(d) > Decimal("1") and abs(d) < Decimal("100"):
        return f"{d:.{decimals}f}%"
    if abs(d) <= Decimal("1"):
        return f"{(d * 100):.{decimals}f}%"
    return f"{d:.{decimals}f}%"


def _fmt_multiple(val: Any) -> str:
    d = _d(val)
    return f"{d:.2f}x"


def _latest_quarter(business_id: str) -> str:
    """Get the latest quarter with fund state data for this business."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT s.quarter
            FROM re_fund_quarter_state s
            JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE f.business_id = %s::uuid
              AND s.scenario_id IS NULL
            ORDER BY s.quarter DESC
            LIMIT 1
            """,
            (business_id,),
        )
        row = cur.fetchone()
        return row["quarter"] if row else "2026Q1"


# ── Use case executors ─────────────────────────────────────────────────

def _execute_fund_list(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 1: fund inventory / rundown / list."""
    from app.services.repe import list_funds

    funds = list_funds(business_id=UUID(business_id))
    if not funds:
        return StructuredExecutionResult(
            answer_text="No funds found in the current portfolio.",
            source_path="repe.list_funds",
            canonical_source="repe_fund",
        )

    lines = [f"The portfolio contains {len(funds)} fund(s):\n"]
    rows = []
    for f in funds:
        name = f.get("name") or "Unnamed Fund"
        strategy = f.get("strategy") or "—"
        vintage = f.get("vintage_year") or "—"
        lines.append(f"- **{name}** — Strategy: {strategy}, Vintage: {vintage}")
        rows.append({
            "fund_id": str(f.get("fund_id", "")),
            "name": name,
            "strategy": strategy,
            "vintage": vintage,
        })

    return StructuredExecutionResult(
        answer_text="\n".join(lines),
        rows=rows,
        columns=["fund_id", "name", "strategy", "vintage"],
        source_path="repe.list_funds",
        canonical_source="repe_fund",
        result_memory=_build_list_memory(
            rows=rows,
            source_name="repe.list_funds",
            scope={"business_id": business_id, "environment_id": env_id},
        ),
    )


def _execute_fund_performance_summary(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 2: summarize each fund's performance."""
    from app.services.repe import list_funds

    quarter = contract.timeframe_value or _latest_quarter(business_id)
    funds = list_funds(business_id=UUID(business_id))
    if not funds:
        return StructuredExecutionResult(
            answer_text="No funds found.",
            source_path="re_fund_quarter_state",
            canonical_source="re_fund_quarter_state",
        )

    lines = [f"Fund performance summary as of **{quarter}**:\n"]
    rows = []

    with get_cursor() as cur:
        for f in funds:
            fund_id = str(f.get("fund_id", ""))
            fund_name = f.get("name") or "Unnamed Fund"

            cur.execute(
                """
                SELECT
                    gross_irr, net_irr, tvpi, dpi, rvpi,
                    portfolio_nav, total_called, total_distributed
                FROM re_fund_quarter_state
                WHERE fund_id = %s::uuid
                  AND quarter = %s
                  AND scenario_id IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (fund_id, quarter),
            )
            state = cur.fetchone()
            if state:
                row = {
                    "fund_id": fund_id,
                    "name": fund_name,
                    "quarter": quarter,
                    "gross_irr": str(state.get("gross_irr") or ""),
                    "net_irr": str(state.get("net_irr") or ""),
                    "tvpi": str(state.get("tvpi") or ""),
                    "dpi": str(state.get("dpi") or ""),
                    "rvpi": str(state.get("rvpi") or ""),
                    "nav": str(state.get("portfolio_nav") or ""),
                    "called": str(state.get("total_called") or ""),
                    "distributed": str(state.get("total_distributed") or ""),
                }
                rows.append(row)
                lines.append(
                    f"**{fund_name}** — "
                    f"Gross IRR: {_fmt_pct(state.get('gross_irr'))}, "
                    f"Net IRR: {_fmt_pct(state.get('net_irr'))}, "
                    f"TVPI: {_fmt_multiple(state.get('tvpi'))}, "
                    f"DPI: {_fmt_multiple(state.get('dpi'))}, "
                    f"NAV: {_fmt_money(state.get('portfolio_nav'))}"
                )
            else:
                lines.append(f"**{fund_name}** — No quarter state data for {quarter}")
                rows.append({"fund_id": fund_id, "name": fund_name, "quarter": quarter})

    return StructuredExecutionResult(
        answer_text="\n".join(lines),
        rows=rows,
        columns=["name", "gross_irr", "net_irr", "tvpi", "dpi", "rvpi", "nav"],
        source_path="re_fund_quarter_state",
        canonical_source="re_fund_quarter_state",
        result_memory=_build_list_memory(
            rows=rows,
            source_name="re_fund_quarter_state",
            scope={"business_id": business_id, "environment_id": env_id},
            result_type="ranked_list",
        ),
    )


def _execute_portfolio_kpis(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 3: total commitments / breakout by fund."""
    from app.services.re_env_portfolio import get_portfolio_kpis

    quarter = contract.timeframe_value or _latest_quarter(business_id)
    kpis = get_portfolio_kpis(
        env_id=env_id,
        business_id=business_id,
        quarter=quarter,
    )

    lines = [f"Portfolio KPIs as of **{quarter}**:\n"]
    lines.append(f"- Funds: {kpis.get('fund_count', 0)}")
    lines.append(f"- Total commitments: {_fmt_money(kpis.get('total_commitments'))}")
    lines.append(f"- Portfolio NAV: {_fmt_money(kpis.get('portfolio_nav'))}")
    lines.append(f"- Active assets: {kpis.get('active_assets', 0)}")
    gross = kpis.get("gross_irr")
    net = kpis.get("net_irr")
    if gross:
        lines.append(f"- Portfolio gross IRR: {_fmt_pct(gross)}")
    if net:
        lines.append(f"- Portfolio net IRR: {_fmt_pct(net)}")

    # If breakout requested, add per-fund commitments
    if contract.transformation == "breakout" and contract.group_by in ("fund", None):
        lines.append("\n**Commitment breakout by fund:**\n")
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT
                    f.name AS fund_name,
                    COALESCE(SUM(pc.committed_amount), 0) AS committed
                FROM repe_fund f
                LEFT JOIN re_partner_commitment pc
                    ON pc.fund_id = f.fund_id
                    AND pc.status IN ('active', 'fully_called')
                WHERE f.business_id = %s::uuid
                GROUP BY f.fund_id, f.name
                ORDER BY committed DESC
                """,
                (business_id,),
            )
            fund_rows = cur.fetchall()
            for fr in fund_rows:
                lines.append(f"- {fr['fund_name']}: {_fmt_money(fr['committed'])}")

    return StructuredExecutionResult(
        answer_text="\n".join(lines),
        rows=[kpis],
        columns=["fund_count", "total_commitments", "portfolio_nav", "active_assets", "gross_irr", "net_irr"],
        source_path="re_env_portfolio.get_portfolio_kpis",
        canonical_source="re_fund_quarter_state + re_partner_commitment",
    )


def _execute_asset_count(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 4: total asset count / active asset count."""
    from app.services.repe import count_assets, list_property_assets
    from app.assistant_runtime.result_memory import (
        build_bucketed_count_result_memory,
        build_memory_scope,
        build_query_signature,
    )

    counts = count_assets(business_id=UUID(business_id))
    assets = list_property_assets(business_id=UUID(business_id))

    # Bucket members for result memory
    bucket_members: dict[str, list[dict[str, Any]]] = {
        "active": [], "disposed": [], "pipeline": [], "other": [],
    }
    _ACTIVE = {"active", "held", "lease_up", "operating"}
    _DISPOSED = {"disposed", "realized", "written_off"}
    for a in assets:
        status = (a.get("asset_status") or "").lower() or "active"
        row = {"name": a.get("name", "Unnamed"), "asset_id": str(a.get("asset_id", "")), "status": status}
        if status in _ACTIVE or not a.get("asset_status"):
            bucket_members["active"].append(row)
        elif status in _DISPOSED:
            bucket_members["disposed"].append(row)
        elif status == "pipeline":
            bucket_members["pipeline"].append(row)
        else:
            bucket_members["other"].append(row)

    scope = build_memory_scope(
        business_id=business_id,
        environment_id=env_id,
        entity_type="environment",
        entity_id=env_id,
        entity_name=None,
    )
    sig = build_query_signature(result_type="bucketed_count", source_name="repe.count_assets", scope=scope)

    summary = {
        "total": counts["total"],
        "bucket_counts": counts,
        "active_definition": "Active includes: active, held, lease_up, operating, or NULL status",
    }

    rm = build_bucketed_count_result_memory(
        scope=scope,
        query_signature=sig,
        summary=summary,
        rows=[{"name": a.get("name", ""), "asset_id": str(a.get("asset_id", "")), "status": a.get("asset_status", "")} for a in assets],
        bucket_members=bucket_members,
    )

    from app.assistant_runtime.result_memory import build_asset_count_response_text
    text = build_asset_count_response_text(scope_label="The portfolio", summary=summary)

    return StructuredExecutionResult(
        answer_text=text,
        rows=[counts],
        columns=["active", "disposed", "pipeline", "total"],
        source_path="repe.count_assets",
        canonical_source="repe_asset",
        result_memory=rm,
    )


def _execute_noi_variance(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 5: NOI variance ranked / filter / list."""
    # Query asset-level NOI variance rows from seeded data
    with get_cursor() as cur:
        # Get the latest quarter with variance data
        cur.execute(
            """
            SELECT DISTINCT v.quarter
            FROM re_asset_variance_qtr v
            WHERE v.business_id = %s::uuid
              AND v.line_code = 'NOI'
            ORDER BY v.quarter DESC
            LIMIT 1
            """,
            (business_id,),
        )
        q_row = cur.fetchone()
        quarter = contract.timeframe_value or (q_row["quarter"] if q_row else "2025Q4")

        cur.execute(
            """
            SELECT
                a.name AS asset_name,
                COALESCE(pa.property_type, a.asset_type) AS property_type,
                pa.city, pa.state,
                f.name AS fund_name,
                v.actual_amount::numeric AS actual,
                v.plan_amount::numeric AS plan,
                v.variance_amount::numeric AS variance,
                v.variance_pct::numeric AS variance_pct,
                v.asset_id::text,
                v.fund_id::text
            FROM re_asset_variance_qtr v
            JOIN repe_asset a ON a.asset_id = v.asset_id
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE v.business_id = %s::uuid
              AND v.line_code = 'NOI'
              AND v.quarter = %s
            ORDER BY v.variance_pct ASC
            """,
            (business_id, quarter),
        )
        rows = cur.fetchall()

    if not rows:
        return StructuredExecutionResult(
            answer_text=f"No NOI variance data found for {quarter}.",
            source_path="re_asset_variance_qtr",
            canonical_source="re_asset_variance_qtr",
        )

    # Apply filters
    filtered = list(rows)
    for filt in contract.filters:
        op = filt.get("operator")
        val = Decimal(str(filt.get("value", 0)))
        if op == "<=":
            filtered = [r for r in filtered if _d(r.get("variance_pct")) <= val]
        elif op == ">=":
            filtered = [r for r in filtered if _d(r.get("variance_pct")) >= val]
        elif op == "<":
            filtered = [r for r in filtered if _d(r.get("variance_pct")) < val]
        elif op == ">":
            filtered = [r for r in filtered if _d(r.get("variance_pct")) > val]

    # Sort
    sort_dir = contract.sort_direction or "asc"
    filtered.sort(
        key=lambda r: _d(r.get("variance_pct")),
        reverse=(sort_dir == "desc"),
    )

    # Limit
    if contract.limit:
        filtered = filtered[:contract.limit]

    # Format
    lines = [f"NOI variance by asset for **{quarter}** ({len(filtered)} asset(s)):\n"]
    result_rows = []
    for r in filtered:
        name = r.get("asset_name") or "Unnamed"
        prop_type = r.get("property_type") or ""
        city = r.get("city") or ""
        state = r.get("state") or ""
        location = f"{city}, {state}" if city else ""
        fund = r.get("fund_name") or ""
        variance_pct = _d(r.get("variance_pct"))
        actual = _d(r.get("actual"))
        plan = _d(r.get("plan"))

        location_str = f" ({location})" if location else ""
        lines.append(
            f"- **{name}**{location_str} — "
            f"Actual: {_fmt_money(actual)}, Plan: {_fmt_money(plan)}, "
            f"Variance: {_fmt_pct(variance_pct)}"
        )
        result_rows.append({
            "name": name,
            "property_type": prop_type,
            "location": location,
            "fund_name": fund,
            "actual": str(actual),
            "plan": str(plan),
            "variance_pct": str(variance_pct),
            "asset_id": r.get("asset_id"),
        })

    if contract.group_by == "fund":
        # Re-group output by fund
        from itertools import groupby
        lines = [f"NOI variance by asset for **{quarter}**, grouped by fund:\n"]
        sorted_by_fund = sorted(filtered, key=lambda r: r.get("fund_name") or "")
        for fund_name, group in groupby(sorted_by_fund, key=lambda r: r.get("fund_name") or ""):
            lines.append(f"\n**{fund_name}:**")
            for r in group:
                name = r.get("asset_name") or "Unnamed"
                variance_pct = _d(r.get("variance_pct"))
                lines.append(f"  - {name}: {_fmt_pct(variance_pct)}")

    return StructuredExecutionResult(
        answer_text="\n".join(lines),
        rows=result_rows,
        columns=["name", "property_type", "fund_name", "actual", "plan", "variance_pct"],
        source_path="re_asset_variance_qtr",
        canonical_source="re_asset_variance_qtr",
        result_memory=_build_list_memory(
            rows=result_rows,
            source_name="re_asset_variance_qtr",
            scope={"business_id": business_id, "environment_id": env_id},
            result_type="ranked_list",
        ),
    )


def _execute_investment_irr_degraded(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Use case 6: investment-level gross IRR → degrade to fund-level."""
    quarter = contract.timeframe_value or _latest_quarter(business_id)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                f.name AS fund_name,
                s.gross_irr, s.net_irr, s.tvpi, s.portfolio_nav
            FROM re_fund_quarter_state s
            JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE f.business_id = %s::uuid
              AND s.quarter = %s
              AND s.scenario_id IS NULL
              AND s.gross_irr IS NOT NULL
            ORDER BY s.gross_irr DESC
            """,
            (business_id, quarter),
        )
        rows = cur.fetchall()

    if not rows:
        return StructuredExecutionResult(
            answer_text="No fund-level IRR data available.",
            degraded=True,
            degraded_reason="no_data",
            source_path="re_fund_quarter_state",
            canonical_source="re_fund_quarter_state",
        )

    lines = [
        "Investment-level IRR is not available at the individual deal grain. "
        f"Here is the fund-level IRR ranking for **{quarter}** instead:\n",
    ]
    result_rows = []
    for r in rows:
        name = r.get("fund_name") or "Unnamed"
        lines.append(
            f"- **{name}** — Gross IRR: {_fmt_pct(r.get('gross_irr'))}, "
            f"Net IRR: {_fmt_pct(r.get('net_irr'))}, "
            f"TVPI: {_fmt_multiple(r.get('tvpi'))}"
        )
        result_rows.append({
            "name": name,
            "gross_irr": str(r.get("gross_irr") or ""),
            "net_irr": str(r.get("net_irr") or ""),
            "tvpi": str(r.get("tvpi") or ""),
        })

    return StructuredExecutionResult(
        answer_text="\n".join(lines),
        rows=result_rows,
        columns=["name", "gross_irr", "net_irr", "tvpi"],
        source_path="re_fund_quarter_state",
        canonical_source="re_fund_quarter_state",
        degraded=True,
        degraded_reason="investment_level_irr_unavailable",
        result_memory=_build_list_memory(
            rows=result_rows,
            source_name="re_fund_quarter_state",
            scope={"business_id": business_id, "environment_id": env_id},
            result_type="ranked_list",
        ),
    )


# ── Result memory helpers ──────────────────────────────────────────────

def _build_list_memory(
    *,
    rows: list[dict[str, Any]],
    source_name: str,
    scope: dict[str, Any],
    result_type: str = "list",
) -> dict[str, Any]:
    from app.assistant_runtime.result_memory import (
        build_list_result_memory,
        build_query_signature,
    )
    sig = build_query_signature(result_type=result_type, source_name=source_name, scope=scope)
    return build_list_result_memory(
        scope=scope,
        query_signature=sig,
        summary={"item_count": len(rows), "item_label": "items"},
        rows=rows,
        result_type=result_type,
    )


# ── Routing: contract → executor ───────────────────────────────────────

def _route_contract(contract: MeridianStructuredContract) -> str:
    """Map a contract to a use-case key.

    Priority order: metric-specific routes first, then fact-based, then entity fallbacks.
    This ensures "sort assets by NOI variance" routes to noi_variance even though
    "assets" also matches the asset_count fact.
    """
    metric = contract.metric
    fact = contract.fact
    transformation = contract.transformation
    entity = contract.entity

    # ── Metric-first routes (highest priority) ────────────────────────

    # Use case 5: NOI variance (any query mentioning NOI/NOI variance with data intent)
    if metric in ("noi_variance", "noi") and transformation in ("rank", "filter", "list", "summary", "breakout", None):
        return "noi_variance"

    # Use case 6: investment-level IRR (detect unavailable grain)
    if metric in ("irr", "gross_irr", "net_irr") and entity == "investment":
        return "investment_irr_degraded"

    # Use case 2: fund performance summary
    if metric in ("performance", "irr", "gross_irr", "net_irr", "tvpi", "dpi", "rvpi", "nav"):
        if transformation in ("summary", "list", "rank", None) and entity in ("fund", "portfolio", None):
            return "fund_performance"

    # ── Fact-based routes ─────────────────────────────────────────────

    # Use case 4: asset count (explicit count queries only — requires count transformation or count fact without a metric)
    if transformation == "count" and entity == "asset":
        return "asset_count"
    if fact == "asset_count" and not metric:
        return "asset_count"

    # Use case 1: fund list
    if fact in ("fund_list", "fund_names") or (transformation == "list" and entity == "fund"):
        return "fund_list"

    # Use case 3: portfolio KPIs / commitments
    if fact == "commitments" or (transformation == "breakout" and fact == "commitments"):
        return "portfolio_kpis"

    # ── Entity fallbacks ──────────────────────────────────────────────

    # Fund summary when entity is portfolio/fund and asking for summary-ish things
    if entity in ("portfolio", "fund") and transformation in ("summary", "list"):
        return "fund_performance"

    return "unknown"


_EXECUTORS: dict[str, Any] = {
    "fund_list": _execute_fund_list,
    "fund_performance": _execute_fund_performance_summary,
    "portfolio_kpis": _execute_portfolio_kpis,
    "asset_count": _execute_asset_count,
    "noi_variance": _execute_noi_variance,
    "investment_irr_degraded": _execute_investment_irr_degraded,
}


def execute_meridian_contract(
    contract: MeridianStructuredContract,
    *,
    business_id: str,
    env_id: str,
    thread_state: dict[str, Any] | None = None,
) -> StructuredExecutionResult | None:
    """Execute a parsed contract.  Returns None if no executor matches."""
    use_case = _route_contract(contract)

    emit_log(
        level="info",
        service="backend",
        action="meridian_executor.route",
        message=f"Meridian executor routing: {use_case}",
        context={
            "use_case": use_case,
            "metric": contract.metric,
            "fact": contract.fact,
            "transformation": contract.transformation,
            "entity": contract.entity,
        },
    )

    executor = _EXECUTORS.get(use_case)
    if executor is None:
        return None

    try:
        result = executor(contract, business_id, env_id)
        result.structured_receipt = {
            "parsed_contract": {
                "entity": contract.entity,
                "metric": contract.metric,
                "fact": contract.fact,
                "transformation": contract.transformation,
                "group_by": contract.group_by,
                "filters": contract.filters,
                "sort_by": contract.sort_by,
                "sort_direction": contract.sort_direction,
                "limit": contract.limit,
                "timeframe_type": contract.timeframe_type,
                "timeframe_value": contract.timeframe_value,
            },
            "execution_path": use_case,
            "operators_applied": [
                f"sort:{contract.sort_direction}" if contract.sort_direction else None,
                f"limit:{contract.limit}" if contract.limit else None,
                f"group_by:{contract.group_by}" if contract.group_by else None,
                f"filters:{len(contract.filters)}" if contract.filters else None,
            ],
            "memory_used": thread_state is not None,
            "degraded": result.degraded,
            "canonical_source": result.canonical_source,
        }
        # Remove None entries
        result.structured_receipt["operators_applied"] = [
            op for op in result.structured_receipt["operators_applied"] if op is not None
        ]
        return result
    except Exception as exc:
        emit_log(
            level="error",
            service="backend",
            action="meridian_executor.error",
            message=f"Meridian executor error: {exc}",
            context={"use_case": use_case, "error": str(exc)[:500]},
        )
        return None
