"""Dashboard Composer — deterministic dashboard spec generation from classified intent.

Mirrors the section-based composition logic in:
  repo-b/src/lib/dashboards/layout-archetypes.ts
  repo-b/src/app/api/re/v2/dashboards/generate/route.ts

Keep these in sync when adding new sections or archetypes.
"""
from __future__ import annotations

import re
from typing import Any


# ── Archetype detection ─────────────────────────────────────────────────────

ARCHETYPE_PHRASES: dict[str, list[str]] = {
    "monthly_operating_report": [
        "monthly operating", "operating report", "monthly report",
        "asset management report",
    ],
    "executive_summary": [
        "executive summary", "board summary", "ic memo",
        "quarterly update", "overview",
    ],
    "watchlist": [
        "watchlist", "underperform", "surveillance", "at risk",
    ],
    "fund_quarterly_review": [
        "quarterly review", "fund review", "qbr", "fund performance",
    ],
    "market_comparison": [
        "compar", "vs ", "versus", "benchmark", "side by side",
    ],
    "underwriting_dashboard": [
        "underwriting", "uw dashboard", "deal screen",
    ],
    "operating_review": [
        "operating review", "deep operating", "asset manager",
    ],
}


# ── Section detection ───────────────────────────────────────────────────────

SECTION_PHRASES: dict[str, list[str]] = {
    "noi_trend": ["noi trend", "trend over time", "operating trend", "noi over"],
    "actual_vs_budget": [
        "actual vs budget", "budget variance", "budget comparison", "avb",
        "vs budget",
    ],
    "underperformer_watchlist": [
        "underperforming", "underperformer", "watchlist", "at risk",
        "flag", "highlight",
    ],
    "debt_maturity": [
        "debt maturity", "loan maturity", "maturity schedule",
        "maturity timeline",
    ],
    "downloadable_table": ["downloadable", "download", "export", "summary table"],
    "income_statement": ["income statement", "p&l", "profit and loss"],
    "cash_flow": ["cash flow", "cf statement"],
    "occupancy_trend": [
        "occupancy trend", "occupancy over time", "occupancy rate",
    ],
    "dscr_monitoring": ["dscr", "debt service coverage", "coverage ratio"],
    "noi_bridge": ["noi bridge", "waterfall", "bridge analysis"],
}


# ── Section registry (mirrors SECTION_REGISTRY in layout-archetypes.ts) ─────

_SectionWidget = dict[str, Any]  # {type, w, h, config_overrides}


def _sw(type_: str, w: int, h: int, **overrides: Any) -> _SectionWidget:
    return {"type": type_, "w": w, "h": h, "config_overrides": overrides}


SECTION_REGISTRY: dict[str, list[_SectionWidget]] = {
    "kpi_summary": [_sw("metrics_strip", 12, 2)],
    "noi_trend": [
        _sw("trend_line", 12, 4, title="NOI Trend", format="dollar",
            period_type="quarterly"),
    ],
    "actual_vs_budget": [
        _sw("bar_chart", 7, 4, title="Actual vs Budget",
            comparison="budget", format="dollar"),
        _sw("metrics_strip", 5, 4, title="Budget Variance"),
    ],
    "underperformer_watchlist": [
        _sw("comparison_table", 12, 5, title="Underperforming Assets",
            comparison="budget"),
    ],
    "debt_maturity": [
        _sw("bar_chart", 12, 4, title="Debt Maturity Schedule",
            format="dollar"),
    ],
    "income_statement": [
        _sw("statement_table", 6, 5, title="Income Statement", statement="IS"),
    ],
    "cash_flow": [
        _sw("statement_table", 6, 5, title="Cash Flow Statement",
            statement="CF"),
    ],
    "noi_bridge": [
        _sw("waterfall", 6, 4, title="NOI Bridge"),
    ],
    "occupancy_trend": [
        _sw("trend_line", 6, 4, title="Occupancy Trend", format="percent"),
    ],
    "dscr_monitoring": [
        _sw("trend_line", 6, 4, title="DSCR Trend", format="ratio"),
    ],
    "downloadable_table": [
        _sw("statement_table", 12, 5, title="Summary Report",
            period_type="quarterly"),
    ],
}


# ── Archetype default sections ──────────────────────────────────────────────

ARCHETYPE_DEFAULT_SECTIONS: dict[str, list[str]] = {
    "monthly_operating_report": [
        "kpi_summary", "noi_trend", "actual_vs_budget",
        "underperformer_watchlist", "debt_maturity", "downloadable_table",
    ],
    "executive_summary": [
        "kpi_summary", "noi_trend", "noi_bridge", "income_statement",
    ],
    "watchlist": [
        "kpi_summary", "underperformer_watchlist", "dscr_monitoring",
        "occupancy_trend",
    ],
    "fund_quarterly_review": [
        "kpi_summary", "noi_trend", "actual_vs_budget",
        "income_statement", "cash_flow",
    ],
    "market_comparison": [
        "kpi_summary", "noi_trend", "occupancy_trend", "noi_bridge",
    ],
    "underwriting_dashboard": [
        "kpi_summary", "income_statement", "cash_flow", "noi_bridge",
        "debt_maturity",
    ],
    "operating_review": [
        "kpi_summary", "income_statement", "cash_flow", "noi_trend",
        "occupancy_trend", "dscr_monitoring",
    ],
}


# ── Metric selection ────────────────────────────────────────────────────────

_DEFAULT_ASSET_METRICS = ["NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE"]
_DEFAULT_FUND_METRICS = ["PORTFOLIO_NAV", "GROSS_IRR", "NET_TVPI", "DPI"]
_DEFAULT_INVESTMENT_METRICS = ["NOI", "ASSET_VALUE", "EQUITY_VALUE", "DSCR_KPI"]

_METRIC_KEYWORDS: dict[str, list[str]] = {
    "noi": ["NOI"],
    "net operating": ["NOI"],
    "revenue": ["RENT", "OTHER_INCOME", "EGI"],
    "rent": ["RENT"],
    "income": ["EGI"],
    "opex": ["TOTAL_OPEX"],
    "expense": ["TOTAL_OPEX"],
    "occupancy": ["OCCUPANCY"],
    "dscr": ["DSCR_KPI"],
    "debt service": ["TOTAL_DEBT_SERVICE", "DSCR_KPI"],
    "ltv": ["LTV"],
    "cash flow": ["NET_CASH_FLOW"],
    "capex": ["CAPEX"],
    "irr": ["GROSS_IRR", "NET_IRR"],
    "tvpi": ["GROSS_TVPI", "NET_TVPI"],
    "dpi": ["DPI"],
    "nav": ["PORTFOLIO_NAV"],
}


def _detect_metrics(message: str, entity_type: str) -> list[str]:
    """Detect metrics mentioned in the message, falling back to entity defaults."""
    msg = message.lower()
    detected: list[str] = []
    for keyword, metrics in _METRIC_KEYWORDS.items():
        if keyword in msg:
            for m in metrics:
                if m not in detected:
                    detected.append(m)
    if detected:
        return detected
    if entity_type == "fund":
        return list(_DEFAULT_FUND_METRICS)
    if entity_type == "investment":
        return list(_DEFAULT_INVESTMENT_METRICS)
    return list(_DEFAULT_ASSET_METRICS)


def _select_metrics_for_widget(
    widget_type: str, metrics: list[str],
) -> list[dict[str, str]]:
    """Pick the right subset of metrics for a widget type."""
    if widget_type == "metrics_strip":
        return [{"key": k} for k in metrics[:4]]
    if widget_type == "trend_line":
        trend = [k for k in metrics if k in (
            "NOI", "OCCUPANCY", "DSCR_KPI", "ASSET_VALUE",
            "PORTFOLIO_NAV", "NET_CASH_FLOW",
        )][:3]
        return [{"key": k} for k in trend] if trend else [{"key": metrics[0]}]
    if widget_type == "bar_chart":
        bar = [k for k in metrics if k in (
            "RENT", "TOTAL_OPEX", "EGI", "NOI", "CAPEX",
            "TOTAL_DEBT_SERVICE",
        )][:3]
        return [{"key": k} for k in bar] if bar else [{"key": "NOI"}, {"key": "TOTAL_OPEX"}]
    if widget_type == "waterfall":
        return [{"key": "EGI"}, {"key": "TOTAL_OPEX"}, {"key": "NOI"}]
    return []


# ── Core composition ────────────────────────────────────────────────────────

def _detect_archetype(message: str) -> str:
    msg = message.lower()
    for key, phrases in ARCHETYPE_PHRASES.items():
        if any(p in msg for p in phrases):
            return key
    return "executive_summary"


def _detect_sections(message: str) -> list[str]:
    msg = message.lower()
    sections: list[str] = []
    for key, phrases in SECTION_PHRASES.items():
        if any(p in msg for p in phrases):
            sections.append(key)
    return sections


def _detect_entity_type(message: str) -> str:
    msg = message.lower()
    if re.search(r"\b(fund|portfolio|nav|tvpi|dpi)\b", msg):
        return "fund"
    if re.search(r"\b(investment|deal|return|irr|moic)\b", msg):
        return "investment"
    return "asset"


def _generate_name(message: str, archetype: str) -> str:
    labels: dict[str, str] = {
        "executive_summary": "Executive Summary",
        "operating_review": "Operating Review",
        "monthly_operating_report": "Monthly Operating Report",
        "watchlist": "Watchlist",
        "fund_quarterly_review": "Fund Quarterly Review",
        "market_comparison": "Market Comparison",
        "underwriting_dashboard": "Underwriting Dashboard",
        "custom": "Dashboard",
    }
    msg = message.lower()
    parts: list[str] = []

    prop_match = re.search(
        r"(multifamily|office|industrial|retail|hotel|medical)", msg,
    )
    if prop_match:
        parts.append(prop_match.group(1).title())

    market_match = re.search(
        r"(phoenix|denver|aurora|dallas|austin|atlanta|miami|chicago|boston)",
        msg,
    )
    if market_match:
        parts.append(market_match.group(1).title())

    parts.append(labels.get(archetype, "Dashboard"))
    return " ".join(parts)


def compose_dashboard_spec(
    message: str,
    env_id: str | None = None,
    business_id: str | None = None,
    fund_id: str | None = None,
    quarter: str | None = None,
) -> dict[str, Any]:
    """Compose a complete dashboard spec from a user message.

    Returns a dict matching the frontend DashboardSpec + metadata shape:
    {name, archetype, widgets[], entity_scope{}, quarter}
    """
    archetype = _detect_archetype(message)
    entity_type = _detect_entity_type(message)
    metrics = _detect_metrics(message, entity_type)

    # Use explicitly requested sections, or fall back to archetype defaults
    sections = _detect_sections(message)
    if not sections:
        sections = ARCHETYPE_DEFAULT_SECTIONS.get(
            archetype, ARCHETYPE_DEFAULT_SECTIONS["executive_summary"],
        )

    # Always start with kpi_summary
    if "kpi_summary" not in sections:
        sections = ["kpi_summary", *sections]

    # Build widgets on 12-col grid
    widgets: list[dict[str, Any]] = []
    current_y = 0
    compact = len(sections) >= 6

    for section_key in sections:
        section_defs = SECTION_REGISTRY.get(section_key)
        if not section_defs:
            continue

        current_x = 0
        section_h = 0

        for defn in section_defs:
            h = defn["h"]
            if compact and h > 2:
                h = max(3, h - 1)

            if current_x + defn["w"] > 12:
                current_y += section_h
                current_x = 0
                section_h = 0

            section_h = max(section_h, h)

            widget: dict[str, Any] = {
                "id": f"{section_key}_{len(widgets)}",
                "type": defn["type"],
                "config": {
                    **defn["config_overrides"],
                    "entity_type": entity_type,
                    "quarter": quarter,
                    "scenario": "actual",
                    "metrics": _select_metrics_for_widget(
                        defn["type"], metrics,
                    ),
                },
                "layout": {
                    "x": current_x,
                    "y": current_y,
                    "w": defn["w"],
                    "h": h,
                },
            }
            widgets.append(widget)
            current_x += defn["w"]

        current_y += section_h

    name = _generate_name(message, archetype)

    return {
        "name": name,
        "archetype": archetype,
        "widgets": widgets,
        "entity_scope": {
            "entity_type": entity_type,
            "env_id": env_id,
            "business_id": business_id,
            "fund_id": fund_id,
        },
        "quarter": quarter,
        "prompt": message,
    }
