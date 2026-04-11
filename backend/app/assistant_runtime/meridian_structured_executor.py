"""Deprecated Meridian deterministic executor.

This module is kept for compatibility only.
The live authoritative Meridian execution path now lives in
`meridian_structured_runtime.py` plus `meridian_structured_capabilities.py`.

Executes a MeridianStructuredContract against REPE services
and returns a StructuredExecutionResult — no LLM, no narrative fallback.

Hard-mapped use cases (spec §E):
  1. fund inventory / rundown / list         → repe.list_funds
  2. summarize each fund's performance       → released authoritative fund snapshots
  3. total commitments / breakout by fund    → re_env_portfolio.get_portfolio_kpis
  4. total asset count / active asset count  → repe.count_assets
  5. NOI variance ranked / filter / list     → re_asset_variance_qtr
  6. investment-level gross IRR              → degrade to fund-level with explanation
"""
from __future__ import annotations

import re
from contextvars import ContextVar
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.assistant_runtime.meridian_structured_parser import MeridianStructuredContract
from app.db import get_cursor
from app.observability.logger import emit_log

# Phase 4 follow-up: the single-metric snapshot executor needs the
# original user message to resolve fund names that the parser did not
# pre-populate into contract.entity_name. The gate sets this right
# before calling execute_meridian_contract; callers from elsewhere can
# leave it None.
_CONTEXT_MESSAGE: ContextVar[str | None] = ContextVar("meridian_structured_message", default=None)


def set_executor_message_context(message: str | None) -> None:
    """Set the original user message on the executor contextvar so
    single-metric snapshot reads can resolve fund names."""
    _CONTEXT_MESSAGE.set(message)


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
    """Get the latest quarter with released authoritative fund state data."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT s.quarter
            FROM re_authoritative_fund_state_qtr s
            JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE f.business_id = %s::uuid
              AND s.promotion_state = 'released'
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
            source_path="re_authoritative_fund_state_qtr",
            canonical_source="re_authoritative_fund_state_qtr",
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
                    NULLIF(canonical_metrics->>'gross_irr', '')::numeric AS gross_irr,
                    NULLIF(canonical_metrics->>'net_irr', '')::numeric AS net_irr,
                    NULLIF(canonical_metrics->>'tvpi', '')::numeric AS tvpi,
                    NULLIF(canonical_metrics->>'dpi', '')::numeric AS dpi,
                    NULLIF(canonical_metrics->>'rvpi', '')::numeric AS rvpi,
                    COALESCE(NULLIF(canonical_metrics->>'ending_nav', '')::numeric, NULLIF(canonical_metrics->>'portfolio_nav', '')::numeric) AS portfolio_nav,
                    NULLIF(canonical_metrics->>'total_called', '')::numeric AS total_called,
                    NULLIF(canonical_metrics->>'total_distributed', '')::numeric AS total_distributed
                FROM re_authoritative_fund_state_qtr
                WHERE fund_id = %s::uuid
                  AND quarter = %s
                  AND promotion_state = 'released'
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
        source_path="re_authoritative_fund_state_qtr",
        canonical_source="re_authoritative_fund_state_qtr",
        result_memory=_build_list_memory(
            rows=rows,
            source_name="re_authoritative_fund_state_qtr",
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
        canonical_source="re_authoritative_fund_state_qtr + re_partner_commitment",
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
                NULLIF(s.canonical_metrics->>'gross_irr', '')::numeric AS gross_irr,
                NULLIF(s.canonical_metrics->>'net_irr', '')::numeric AS net_irr,
                NULLIF(s.canonical_metrics->>'tvpi', '')::numeric AS tvpi,
                COALESCE(NULLIF(s.canonical_metrics->>'ending_nav', '')::numeric, NULLIF(s.canonical_metrics->>'portfolio_nav', '')::numeric) AS portfolio_nav
            FROM re_authoritative_fund_state_qtr s
            JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE f.business_id = %s::uuid
              AND s.quarter = %s
              AND s.promotion_state = 'released'
              AND NULLIF(s.canonical_metrics->>'gross_irr', '')::numeric IS NOT NULL
            ORDER BY NULLIF(s.canonical_metrics->>'gross_irr', '')::numeric DESC
            """,
            (business_id, quarter),
        )
        rows = cur.fetchall()

    if not rows:
        return StructuredExecutionResult(
            answer_text="No fund-level IRR data available.",
            degraded=True,
            degraded_reason="no_data",
            source_path="re_authoritative_fund_state_qtr",
            canonical_source="re_authoritative_fund_state_qtr",
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
        source_path="re_authoritative_fund_state_qtr",
        canonical_source="re_authoritative_fund_state_qtr",
        degraded=True,
        degraded_reason="investment_level_irr_unavailable",
        result_memory=_build_list_memory(
            rows=result_rows,
            source_name="re_authoritative_fund_state_qtr",
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


# ── Single-metric snapshot reader (Phase 4 follow-up) ─────────────────
#
# Authoritative State Lockdown — metrics listed here route to a single
# snapshot read against re_authoritative_fund_state_qtr.canonical_metrics.
# The executor reads the value straight from the released snapshot and
# refuses to return an approximation. Add a parser entry and a capability
# row for each new metric, then list it here and in SNAPSHOT_FUND_METRIC_META.
#
# See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md.

SNAPSHOT_FUND_METRIC_META: dict[str, dict[str, str]] = {
    "gross_operating_cash_flow": {
        "display_name": "gross operating cash flow",
        "format": "currency",
    },
}


def _match_fund_from_message(message: str, funds: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Match the user's message against the fund list by name.

    Returns the first fund whose name (or any non-trivial word from the
    name) appears in the message, preferring longer matches. Used for
    single-metric snapshot reads when the parser didn't pre-resolve
    entity_name.
    """
    if not message or not funds:
        return None
    haystack = message.lower()
    scored: list[tuple[int, dict[str, Any]]] = []
    for f in funds:
        name = (f.get("name") or "").strip()
        if not name:
            continue
        lower = name.lower()
        if lower in haystack:
            scored.append((len(lower), f))
            continue
        # Fall back to longest distinctive token match (>= 6 chars so
        # "fund", "iii", "vii", "capital" don't cause false positives).
        tokens = [t for t in re.split(r"[^a-z0-9]+", lower) if len(t) >= 6]
        hit = next((t for t in tokens if t in haystack), None)
        if hit:
            scored.append((len(hit), f))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[0][1] if scored else None


def _execute_fund_metric_snapshot(
    contract: MeridianStructuredContract,
    business_id: str,
    env_id: str,
) -> StructuredExecutionResult:
    """Read a single canonical_metrics field from the released fund snapshot.

    Routes:
      metric ∈ SNAPSHOT_FUND_METRIC_META → direct snapshot read for the
      scoped fund at contract.timeframe_value. Refuses portfolio
      aggregates. Fund resolution order: (1) entity_name, (2) scan the
      original message against the fund list, (3) single-fund fallback.

    Authoritative State Lockdown — Phase 4 follow-up.
    """
    from app.services.repe import list_funds

    metric_key = contract.metric or ""
    meta = SNAPSHOT_FUND_METRIC_META[metric_key]
    display_name = meta["display_name"]
    fmt = meta["format"]
    quarter = contract.timeframe_value or _latest_quarter(business_id)

    entity_name = getattr(contract, "entity_name", None)

    try:
        funds = list_funds(business_id=UUID(business_id))
    except Exception:
        funds = []

    fund_id: str | None = None
    fund_name: str | None = None
    if entity_name:
        needle = entity_name.lower().strip()
        for f in funds:
            fname = (f.get("name") or "").lower().strip()
            if fname == needle or needle in fname or fname in needle:
                fund_id = str(f.get("fund_id") or "")
                fund_name = f.get("name")
                break

    # Fallback 1: scan the contract's original matched patterns for a
    # fund-name substring. The contract dataclass stores _matched_patterns
    # but not the raw message. The executor signature does not include
    # the raw message either. Instead, read the latest thread_state
    # active_context for a resolved fund identity.
    if not fund_id:
        match = _match_fund_from_message(_CONTEXT_MESSAGE.get() or "", funds)
        if match:
            fund_id = str(match.get("fund_id") or "")
            fund_name = match.get("name")

    # Fallback 2: single fund in scope.
    if not fund_id and len(funds) == 1:
        fund_id = str(funds[0].get("fund_id") or "")
        fund_name = funds[0].get("name")

    if not fund_id:
        return StructuredExecutionResult(
            answer_text=(
                f"To answer the {display_name} question I need a specific fund. "
                f"Please name the fund (e.g. 'Institutional Growth Fund VII') "
                f"and the quarter (e.g. '2025Q4'). I will not return a "
                f"portfolio aggregate from the snapshot contract."
            ),
            source_path="re_authoritative_fund_state_qtr",
            canonical_source="re_authoritative_fund_state_qtr",
            degraded=True,
            degraded_reason="snapshot_requires_fund_scope",
        )

    from app.services import re_authoritative_snapshots

    payload = re_authoritative_snapshots.get_authoritative_state(
        entity_type="fund",
        entity_id=fund_id,
        quarter=quarter,
    )
    canonical_metrics = ((payload.get("state") or {}).get("canonical_metrics") or {})
    null_reason = payload.get("null_reason")
    state_origin = payload.get("state_origin")
    snapshot_version = payload.get("snapshot_version")
    trust_status = payload.get("trust_status")
    period_exact = payload.get("period_exact")
    raw_value = canonical_metrics.get(metric_key)
    label = fund_name or "this fund"

    if null_reason or state_origin != "authoritative" or not period_exact:
        return StructuredExecutionResult(
            answer_text=(
                f"No released authoritative snapshot is available for {label} "
                f"in {quarter}. Reason: {null_reason or 'state_origin=' + str(state_origin)}. "
                f"Per the Authoritative State Lockdown rules, I will not return "
                f"an approximation."
            ),
            source_path="re_authoritative_fund_state_qtr",
            canonical_source="re_authoritative_fund_state_qtr",
            degraded=True,
            degraded_reason="snapshot_missing_or_unexact",
        )

    if raw_value is None:
        return StructuredExecutionResult(
            answer_text=(
                f"The released snapshot for {label} in {quarter} does not record "
                f"a {display_name} value (canonical_metrics.{metric_key} is null). "
                f"Snapshot version {snapshot_version}."
            ),
            source_path="re_authoritative_fund_state_qtr",
            canonical_source="re_authoritative_fund_state_qtr",
            degraded=True,
            degraded_reason="snapshot_metric_null",
        )

    if fmt == "currency":
        formatted = _fmt_money(raw_value)
    elif fmt == "percent":
        formatted = _fmt_pct(raw_value)
    else:
        formatted = str(raw_value)

    answer = (
        f"{display_name.capitalize()} for **{label}** in {quarter} is "
        f"**{formatted}** (snapshot {snapshot_version}, trust {trust_status})."
    )
    return StructuredExecutionResult(
        answer_text=answer,
        rows=[
            {
                "fund_id": fund_id,
                "name": label,
                "quarter": quarter,
                metric_key: str(raw_value),
                "formatted": formatted,
                "snapshot_version": snapshot_version,
                "trust_status": trust_status,
                "period_exact": period_exact,
            }
        ],
        columns=["name", "quarter", metric_key, "snapshot_version", "trust_status"],
        source_path="re_authoritative_fund_state_qtr",
        canonical_source="re_authoritative_fund_state_qtr",
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

    # Phase 4 follow-up: single-metric snapshot reads (gross operating
    # cash flow and future canonical_metrics fields).
    if metric in SNAPSHOT_FUND_METRIC_META:
        return "fund_metric_snapshot"

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
    # Phase 4 follow-up — single-metric snapshot reads.
    "fund_metric_snapshot": _execute_fund_metric_snapshot,
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
