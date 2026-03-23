"""Dashboard Composer — deterministic dashboard spec generation from classified intent.

Mirrors the section-based composition logic in:
  repo-b/src/lib/dashboards/layout-archetypes.ts
  repo-b/src/app/api/re/v2/dashboards/generate/route.ts

Keep these in sync when adding new sections or archetypes.

Two composition paths:
  1. Free-form path — prompt describes specific charts (e.g., "NOI over time by
     investment", "scatter plot of X vs Y").  Produces targeted widgets with no
     KPI injection and adaptive layout.
  2. Archetype path — prompt describes a full dashboard type (e.g., "monthly
     operating report").  Uses pre-defined section templates with KPI strip.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# ── Intent → widget type mapping ────────────────────────────────────────────
# Maps section_key to the canonical widget type for that intent.
# Used in section composition instead of hardcoded type strings.

INTENT_WIDGET_MAP: dict[str, str] = {
    "kpi_summary": "metrics_strip",
    "noi_trend": "trend_line",
    "actual_vs_budget": "bar_chart",
    "underperformer_watchlist": "comparison_table",
    "debt_maturity": "bar_chart",
    "income_statement": "statement_table",
    "cash_flow": "statement_table",
    "noi_bridge": "waterfall",
    "occupancy_trend": "trend_line",
    "dscr_monitoring": "trend_line",
    "downloadable_table": "statement_table",
    "pipeline_analysis": "pipeline_bar",
    "geographic_analysis": "geographic_map",
}

# ── Table inference rules ────────────────────────────────────────────────────
# After composing widgets, iterate this dict. If the key section is present in
# the final widget list, inject a companion comparison_table below it.

TABLE_INFERENCE_RULES: dict[str, dict[str, Any]] = {
    "pipeline_bar": {
        "companion_type": "comparison_table",
        "title": "Pipeline Deal Detail",
        "w": 12,
        "h": 5,
        "reason": "Pipeline bar charts should be paired with a drill-down deal table",
    },
    "geographic_map": {
        "companion_type": "comparison_table",
        "title": "Asset Detail by Geography",
        "w": 12,
        "h": 5,
        "reason": "Geographic maps should be paired with a linked detail table",
    },
}

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
    "pipeline_analysis": [
        "pipeline", "deal pipeline", "deal stages", "acquisition pipeline",
        "active deals", "deal flow", "pipeline stages",
    ],
    "geographic_analysis": [
        "map", "geographic", "geography", "by market", "by region", "by state",
        "by msa", "spatial", "location", "where are",
    ],
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
    "pipeline_analysis": [
        _sw("pipeline_bar", 12, 5, title="Deal Pipeline by Stage"),
    ],
    "geographic_analysis": [
        _sw("geographic_map", 12, 6, title="Portfolio Map"),
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


# ── Dimension detection ────────────────────────────────────────────────────

_DIMENSION_PATTERNS: list[tuple[re.Pattern[str], str | None]] = [
    (re.compile(r"\bby\s+investment\b", re.I), "investment"),
    (re.compile(r"\bby\s+asset\b", re.I), "asset"),
    (re.compile(r"\bby\s+property\b", re.I), "asset"),
    (re.compile(r"\bby\s+fund\b", re.I), "fund"),
    (re.compile(r"\bby\s+market\b", re.I), "market"),
    (re.compile(r"\bby\s+region\b", re.I), "region"),
    (re.compile(r"\bby\s+quarter\b", re.I), "quarter"),
    (re.compile(r"\bper\s+investment\b", re.I), "investment"),
    (re.compile(r"\bper\s+asset\b", re.I), "asset"),
    (re.compile(r"\bper\s+fund\b", re.I), "fund"),
    (re.compile(r"\bacross\s+(?:all\s+)?investments?\b", re.I), "investment"),
    (re.compile(r"\bacross\s+(?:all\s+)?assets?\b", re.I), "asset"),
    (re.compile(r"\bacross\s+(?:all\s+)?funds?\b", re.I), "fund"),
    (re.compile(r"\bacross\s+(?:all\s+)?markets?\b", re.I), "market"),
    (re.compile(r"\bacross\s+(?:all\s+)?regions?\b", re.I), "region"),
    (re.compile(r"\beach\s+investment\b", re.I), "investment"),
    (re.compile(r"\beach\s+asset\b", re.I), "asset"),
]

_BROKEN_DOWN_RE = re.compile(r"\b(?:broken?\s+down|grouped?)\s+by\s+(\w+)", re.I)

_DIM_WORD_MAP: dict[str, str] = {
    "investment": "investment", "investments": "investment",
    "asset": "asset", "assets": "asset",
    "property": "asset", "properties": "asset",
    "fund": "fund", "funds": "fund",
    "market": "market", "markets": "market",
    "region": "region", "regions": "region",
}

_TIME_PATTERNS: list[tuple[str, str]] = [
    # Explicit grains first — they override generic "trend"/"over time" defaults
    (r"\bmonthly\b", "monthly"),
    (r"\bquarterly\b", "quarterly"),
    (r"\bannual\b", "annual"),
    (r"\byear[\s-]over[\s-]year\b", "annual"),
    # Generic time-series patterns default to quarterly
    (r"\bover\s+time\b", "quarterly"),
    (r"\btrend\b", "quarterly"),
    (r"\btime\s+series\b", "quarterly"),
]


def _detect_dimensions(message: str) -> dict[str, str | None]:
    """Extract grouping/series dimensions from natural language.

    Returns dict with:
      group_by: "investment" | "asset" | "fund" | "market" | "region" | None
      time_grain: "monthly" | "quarterly" | "annual" | None
    """
    msg = message.lower()
    group_by: str | None = None
    time_grain: str | None = None

    for pattern, dimension in _DIMENSION_PATTERNS:
        if pattern.search(msg):
            group_by = dimension
            break

    if group_by is None:
        m = _BROKEN_DOWN_RE.search(msg)
        if m:
            group_by = _DIM_WORD_MAP.get(m.group(1).lower())

    for pat, grain in _TIME_PATTERNS:
        if re.search(pat, msg, re.I):
            time_grain = grain
            break

    return {"group_by": group_by, "time_grain": time_grain}


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
    if re.search(r"\b(investments?|deals?|returns?|irr|moic)\b", msg):
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


AVAILABLE_WIDGET_TYPES: set[str] = {
    "metric_card", "metrics_strip", "trend_line", "bar_chart", "waterfall",
    "statement_table", "comparison_table", "sparkline_grid", "sensitivity_heat",
    "text_block", "pipeline_bar", "geographic_map",
}

_WIDGET_FALLBACKS: dict[str, str] = {
    "sparkline_grid": "metrics_strip",
    "sensitivity_heat": "bar_chart",
    "heatmap": "bar_chart",
    "gauge": "metric_card",
    "scatter": "trend_line",
    "bubble": "bar_chart",
}


def _resolve_widget_type(requested: str) -> tuple[str, str | None]:
    """Return (resolved_type, fallback_message | None)."""
    if requested in AVAILABLE_WIDGET_TYPES:
        return requested, None
    fallback = _WIDGET_FALLBACKS.get(requested, "bar_chart")
    return fallback, f"Widget type '{requested}' is not available; using '{fallback}' instead"


# ── Free-form chart intent detection ───────────────────────────────────


@dataclass
class WidgetIntent:
    """Parsed intent for a single widget from a free-form prompt."""
    chart_type: str                      # resolved widget type
    metrics: list[str] = field(default_factory=list)
    group_by: str | None = None
    time_grain: str | None = None
    stacked: bool = False
    comparison: str | None = None        # "budget" | "prior_year"
    sort_desc: bool = False
    limit: int | None = None
    title: str | None = None
    format: str | None = None


# Patterns ordered by specificity (most specific first).
_CHART_TYPE_PATTERNS: list[tuple[re.Pattern[str], str, dict[str, Any]]] = [
    (re.compile(r"\bscatter\s*plot\b", re.I), "trend_line",
     {"_fallback_msg": "Scatter plot rendered as multi-series line chart"}),
    (re.compile(r"\bheatmap\b", re.I), "sensitivity_heat", {}),
    (re.compile(r"\bstacked\s+bar\b", re.I), "bar_chart", {"stacked": True}),
    (re.compile(r"\bline\s+chart\b", re.I), "trend_line", {}),
    (re.compile(r"\bbar\s+chart\b", re.I), "bar_chart", {}),
    (re.compile(r"\btable\b", re.I), "comparison_table", {}),
    (re.compile(r"\bhistogram\b", re.I), "bar_chart", {}),
    (re.compile(r"\bdistribution\b", re.I), "bar_chart", {}),
]

_TOP_N_RE = re.compile(r"\btop\s+(\d+)\b", re.I)
_RANK_RE = re.compile(r"\b(?:ranked?|sorted?)\s+(?:by|desc)\b", re.I)
_COMPARE_RE = re.compile(
    r"\b(?:compare|comparison)\b", re.I,
)
_BUDGET_VS_ACTUAL_RE = re.compile(
    r"\b(?:budget\s+vs\.?\s+actual|actual\s+vs\.?\s+budget)\b", re.I,
)
_OVER_TIME_RE = re.compile(r"\bover\s+time\b", re.I)
_TREND_RE = re.compile(r"\btrend\b", re.I)
_VS_METRICS_RE = re.compile(
    r"\b(\w[\w\s]*?)\s+(?:vs\.?|versus)\s+(\w[\w\s]*?)(?:\s+by\b|\s*$)", re.I,
)
_MULTI_WIDGET_RE = re.compile(
    r"\bdashboard\s+with\b", re.I,
)
_AND_SPLIT_RE = re.compile(
    r"\s+and\s+|\s*,\s*", re.I,
)


def _detect_chart_intents(
    message: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
) -> list[WidgetIntent] | None:
    """Attempt to parse explicit chart intents from a free-form prompt.

    Returns a list of WidgetIntent objects if the prompt describes specific
    charts, or None if the prompt should go through the archetype path.
    """
    msg = message.lower().strip()

    # ── Guard: if prompt matches multiple section phrases, it's a dashboard
    # request, not a free-form chart.  Let the archetype path handle it. ──
    matched_sections = _detect_sections(message)
    if len(matched_sections) >= 2 and not _MULTI_WIDGET_RE.search(msg):
        # Exception: "side by side" explicitly requests separate widgets
        if "side by side" not in msg:
            return None

    # ── Multi-widget: "Dashboard with X, Y, and Z" ──
    if _MULTI_WIDGET_RE.search(msg):
        return _parse_multi_widget(message, metrics, dimensions)

    # ── Side-by-side: "X and Y side by side" ──
    if "side by side" in msg:
        return _parse_side_by_side(message, metrics, dimensions)

    # ── Single widget intent ──
    intent = _parse_single_intent(message, metrics, dimensions)
    if intent is not None:
        return [intent]

    return None


def _parse_single_intent(
    message: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
) -> WidgetIntent | None:
    """Parse a single chart intent from the message."""
    msg = message.lower().strip()

    chart_type: str | None = None
    extra: dict[str, Any] = {}
    fallback_msg: str | None = None

    # 1. Explicit chart type
    for pattern, ctype, attrs in _CHART_TYPE_PATTERNS:
        if pattern.search(msg):
            chart_type = ctype
            extra = {k: v for k, v in attrs.items() if not k.startswith("_")}
            fallback_msg = attrs.get("_fallback_msg")
            break

    # 2. Budget vs actual pattern
    if _BUDGET_VS_ACTUAL_RE.search(msg):
        chart_type = chart_type or "bar_chart"
        extra["comparison"] = "budget"

    # 3. Top N pattern
    top_match = _TOP_N_RE.search(msg)
    if top_match:
        chart_type = chart_type or "bar_chart"
        extra["limit"] = int(top_match.group(1))
        extra["sort_desc"] = True

    # 4. Ranked/sorted pattern
    if _RANK_RE.search(msg):
        if chart_type is None:
            chart_type = "comparison_table"
        extra["sort_desc"] = True

    # 5. "over time" or "trend" → trend_line
    if chart_type is None and (_OVER_TIME_RE.search(msg) or _TREND_RE.search(msg)):
        chart_type = "trend_line"

    # 6. "compare X and Y" (without "budget vs actual") → bar_chart
    if chart_type is None and _COMPARE_RE.search(msg):
        chart_type = "bar_chart"

    # 7. "X vs Y" (metric comparison) → bar_chart
    if chart_type is None and _VS_METRICS_RE.search(msg):
        chart_type = "bar_chart"

    if chart_type is None:
        return None

    # Resolve widget type through fallback system
    resolved_type, resolve_msg = _resolve_widget_type(chart_type)
    if resolve_msg and not fallback_msg:
        fallback_msg = resolve_msg

    # Detect format from metric context
    fmt = _infer_format(metrics)

    intent = WidgetIntent(
        chart_type=resolved_type,
        metrics=list(metrics),
        group_by=dimensions.get("group_by"),
        time_grain=dimensions.get("time_grain"),
        format=fmt,
        **extra,
    )

    # Default time_grain for trend_line
    if intent.chart_type == "trend_line" and not intent.time_grain:
        intent.time_grain = "quarterly"

    # Auto-generate title
    intent.title = _generate_widget_title(intent, message)

    return intent


def _parse_multi_widget(
    message: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
) -> list[WidgetIntent] | None:
    """Parse 'Dashboard with X, Y, and Z' into multiple widget intents."""
    msg = message.lower()
    # Strip "dashboard with" prefix
    prefix_end = msg.find("dashboard with")
    if prefix_end < 0:
        return None
    remainder = message[prefix_end + len("dashboard with"):].strip()

    # Split on "and" / ","
    segments = _AND_SPLIT_RE.split(remainder)
    segments = [s.strip() for s in segments if s.strip()]

    if len(segments) < 2:
        return None

    intents: list[WidgetIntent] = []
    for segment in segments:
        seg_metrics = _detect_metrics(segment, "asset")
        seg_dims = _detect_dimensions(segment)
        intent = _parse_single_intent(segment, seg_metrics, seg_dims)
        if intent is None:
            # Try inferring from segment keywords
            intent = _infer_intent_from_segment(segment, seg_metrics, seg_dims)
        if intent is not None:
            intents.append(intent)

    return intents if len(intents) >= 2 else None


def _parse_side_by_side(
    message: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
) -> list[WidgetIntent] | None:
    """Parse 'X and Y side by side' into two widget intents."""
    msg = message.lower()
    # Remove "side by side" and "show"
    cleaned = re.sub(r"\bside\s+by\s+side\b", "", msg)
    cleaned = re.sub(r"\bshow\b", "", cleaned).strip()

    segments = _AND_SPLIT_RE.split(cleaned)
    segments = [s.strip() for s in segments if s.strip()]

    if len(segments) < 2:
        return None

    intents: list[WidgetIntent] = []
    for segment in segments:
        seg_metrics = _detect_metrics(segment, "asset")
        seg_dims = _detect_dimensions(segment)
        intent = _parse_single_intent(segment, seg_metrics, seg_dims)
        if intent is None:
            intent = _infer_intent_from_segment(segment, seg_metrics, seg_dims)
        if intent is not None:
            intents.append(intent)

    return intents if len(intents) >= 2 else None


def _infer_intent_from_segment(
    segment: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
) -> WidgetIntent | None:
    """Infer a widget intent from a segment that lacks an explicit chart type.

    Handles phrases like "NOI trend", "occupancy trend", "asset ranking table".
    """
    seg = segment.lower().strip()

    # "ranking table" or "ranked" → comparison_table
    if "ranking" in seg or "ranked" in seg or "table" in seg:
        return WidgetIntent(
            chart_type="comparison_table",
            metrics=metrics or ["NOI"],
            group_by=dimensions.get("group_by"),
            sort_desc=True,
            title=_title_case_segment(segment),
        )

    # "trend" or "over time" → trend_line
    if "trend" in seg or "over time" in seg:
        fmt = _infer_format(metrics)
        return WidgetIntent(
            chart_type="trend_line",
            metrics=metrics,
            group_by=dimensions.get("group_by"),
            time_grain=dimensions.get("time_grain") or "quarterly",
            format=fmt,
            title=_title_case_segment(segment),
        )

    return None


def _infer_format(metrics: list[str]) -> str | None:
    """Infer chart format from the primary metric."""
    if not metrics:
        return None
    primary = metrics[0]
    if primary in ("OCCUPANCY", "NOI_MARGIN", "NOI_MARGIN_KPI", "LTV"):
        return "percent"
    if primary in ("DSCR_KPI", "DSCR", "GROSS_TVPI", "NET_TVPI", "DPI", "RVPI"):
        return "ratio"
    if primary in ("NOI", "RENT", "EGI", "TOTAL_OPEX", "NET_CASH_FLOW",
                    "CAPEX", "ASSET_VALUE", "EQUITY_VALUE", "PORTFOLIO_NAV",
                    "TOTAL_DEBT_SERVICE"):
        return "dollar"
    return None


def _title_case_segment(segment: str) -> str:
    """Convert a segment to a readable title."""
    # Remove common filler words
    cleaned = re.sub(r"\b(show|me|a|the|of|for)\b", "", segment, flags=re.I)
    cleaned = " ".join(cleaned.split())
    return cleaned.strip().title() if cleaned.strip() else "Chart"


def _generate_widget_title(intent: WidgetIntent, message: str) -> str:
    """Generate a descriptive title for a widget from its intent."""
    parts: list[str] = []

    # Metric names
    metric_labels = {
        "NOI": "NOI", "OCCUPANCY": "Occupancy", "DSCR_KPI": "DSCR",
        "RENT": "Revenue", "TOTAL_OPEX": "Expenses", "EGI": "EGI",
        "NET_CASH_FLOW": "Net Cash Flow", "ASSET_VALUE": "Asset Value",
        "EQUITY_VALUE": "Equity Value", "CAPEX": "CapEx",
        "TOTAL_DEBT_SERVICE": "Debt Service", "LTV": "LTV",
        "GROSS_IRR": "Gross IRR", "NET_IRR": "Net IRR",
        "GROSS_TVPI": "TVPI", "NET_TVPI": "Net TVPI",
        "DPI": "DPI", "PORTFOLIO_NAV": "NAV",
    }

    if intent.metrics:
        metric_names = [metric_labels.get(m, m) for m in intent.metrics[:3]]
        if intent.comparison == "budget":
            parts.append(f"{metric_names[0]} — Budget vs Actual")
        elif len(metric_names) >= 2 and intent.chart_type == "bar_chart":
            parts.append(" vs ".join(metric_names[:2]))
        else:
            parts.append(", ".join(metric_names))

    if intent.chart_type == "trend_line" and not intent.comparison:
        parts.append("Trend")

    if intent.group_by:
        parts.append(f"by {intent.group_by.title()}")

    if intent.limit:
        return f"Top {intent.limit} — {' '.join(parts)}"

    return " ".join(parts) if parts else "Chart"


def _build_freeform_widget(
    intent: WidgetIntent,
    idx: int,
    entity_type: str,
    quarter: str | None,
) -> dict[str, Any]:
    """Build a single widget dict from a WidgetIntent."""
    config: dict[str, Any] = {
        "entity_type": entity_type,
        "quarter": quarter,
        "scenario": "actual",
        "metrics": [{"key": k} for k in intent.metrics],
    }
    if intent.title:
        config["title"] = intent.title
    if intent.group_by:
        config["group_by"] = intent.group_by
    if intent.time_grain:
        config["time_grain"] = intent.time_grain
    if intent.stacked:
        config["stacked"] = True
    if intent.comparison:
        config["comparison"] = intent.comparison
    if intent.sort_desc:
        config["sort_desc"] = True
    if intent.limit:
        config["limit"] = intent.limit
    if intent.format:
        config["format"] = intent.format

    return {
        "id": f"freeform_{idx}",
        "type": intent.chart_type,
        "config": config,
        "layout": {"x": 0, "y": 0, "w": 12, "h": 4},  # placeholder
    }


def _apply_freeform_layout(widgets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply adaptive layout to free-form widgets based on count and type."""
    n = len(widgets)
    if n == 0:
        return widgets

    if n == 1:
        w = widgets[0]
        if w["type"] == "comparison_table":
            w["layout"] = {"x": 0, "y": 0, "w": 12, "h": 5}
        elif w["config"].get("group_by") or w["config"].get("stacked"):
            w["layout"] = {"x": 0, "y": 0, "w": 12, "h": 4}
        else:
            w["layout"] = {"x": 2, "y": 0, "w": 8, "h": 4}
        return widgets

    if n == 2:
        for i, w in enumerate(widgets):
            if w["type"] == "comparison_table":
                w["layout"] = {"x": 0, "y": 4, "w": 12, "h": 5}
            else:
                w["layout"] = {"x": i * 6, "y": 0, "w": 6, "h": 4}
        # Fix: if both are tables, stack them
        if all(w["type"] == "comparison_table" for w in widgets):
            widgets[0]["layout"] = {"x": 0, "y": 0, "w": 12, "h": 5}
            widgets[1]["layout"] = {"x": 0, "y": 5, "w": 12, "h": 5}
        return widgets

    # 3+ widgets: grid layout
    current_x = 0
    current_y = 0
    row_h = 0
    for w in widgets:
        if w["type"] == "comparison_table":
            # Tables go full width on a new row
            if current_x > 0:
                current_y += row_h
                current_x = 0
                row_h = 0
            w["layout"] = {"x": 0, "y": current_y, "w": 12, "h": 5}
            current_y += 5
            row_h = 0
        else:
            width = 6
            h = 4
            if current_x + width > 12:
                current_y += row_h
                current_x = 0
                row_h = 0
            w["layout"] = {"x": current_x, "y": current_y, "w": width, "h": h}
            row_h = max(row_h, h)
            current_x += width

    return widgets


def _try_freeform_widgets(
    message: str,
    entity_type: str,
    metrics: list[str],
    dimensions: dict[str, str | None],
    quarter: str | None,
) -> list[dict[str, Any]] | None:
    """Attempt to build widgets directly from semantic prompt analysis.

    Returns a list of widget dicts if the prompt describes specific charts,
    or None to fall through to the archetype path.
    """
    intents = _detect_chart_intents(message, metrics, dimensions)
    if intents is None:
        return None

    widgets = [
        _build_freeform_widget(intent, i, entity_type, quarter)
        for i, intent in enumerate(intents)
    ]

    return _apply_freeform_layout(widgets)


# ── Core composition ──────────────────────────────────────────────────────


def compose_dashboard_spec(
    message: str,
    env_id: str | None = None,
    business_id: str | None = None,
    fund_id: str | None = None,
    quarter: str | None = None,
    density: str = "auto",
) -> dict[str, Any]:
    """Compose a complete dashboard spec from a user message.

    Returns a dict matching the frontend DashboardSpec + metadata shape:
    {name, archetype, widgets[], entity_scope{}, quarter}

    Two paths:
      1. Free-form: prompt describes specific charts → targeted widgets
      2. Archetype: prompt describes a dashboard type → section templates
    """
    entity_type = _detect_entity_type(message)
    metrics = _detect_metrics(message, entity_type)
    dimensions = _detect_dimensions(message)

    # ── Path 1: Free-form analysis ──
    freeform_widgets = _try_freeform_widgets(
        message, entity_type, metrics, dimensions, quarter,
    )
    if freeform_widgets is not None:
        builder_messages: list[dict[str, str]] = []
        name = _generate_name(message, "custom")
        result: dict[str, Any] = {
            "name": name,
            "archetype": "custom",
            "widgets": freeform_widgets,
            "entity_scope": {
                "entity_type": entity_type,
                "env_id": env_id,
                "business_id": business_id,
                "fund_id": fund_id,
            },
            "quarter": quarter,
            "prompt": message,
            "density": density if density != "auto" else "comfortable",
        }
        if builder_messages:
            result["builder_messages"] = builder_messages
        return result

    # ── Path 2: Archetype-based composition ──
    archetype = _detect_archetype(message)

    # Use explicitly requested sections, or fall back to archetype defaults.
    # When detected sections are a subset of the archetype defaults, prefer the
    # full archetype template — the user asked for a dashboard TYPE, not specific
    # sections (e.g. "watchlist dashboard" should get the full watchlist layout).
    sections = _detect_sections(message)
    archetype_defaults = ARCHETYPE_DEFAULT_SECTIONS.get(
        archetype, ARCHETYPE_DEFAULT_SECTIONS["executive_summary"],
    )
    if not sections or set(sections).issubset(set(archetype_defaults)):
        sections = archetype_defaults

    # Suppress auto-KPI for simple single-analysis requests
    _SIMPLE_SECTIONS = {
        "noi_trend", "occupancy_trend", "dscr_monitoring",
        "pipeline_analysis", "geographic_analysis",
    }
    skip_auto_kpi = (
        len(sections) == 1 and sections[0] in _SIMPLE_SECTIONS
    )
    if not skip_auto_kpi and "kpi_summary" not in sections:
        sections = ["kpi_summary", *sections]

    # Build widgets on 12-col grid
    widgets: list[dict[str, Any]] = []
    arch_builder_messages: list[dict[str, str]] = []
    current_y = 0
    if density == "compact":
        compact = True
    elif density == "comfortable":
        compact = False
    else:  # "auto"
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

            resolved_type, fallback_msg = _resolve_widget_type(defn["type"])
            if fallback_msg:
                arch_builder_messages.append({"level": "warning", "text": fallback_msg})

            # Build config with optional dimension fields
            widget_config: dict[str, Any] = {
                **defn["config_overrides"],
                "entity_type": entity_type,
                "quarter": quarter,
                "scenario": "actual",
                "metrics": _select_metrics_for_widget(
                    defn["type"], metrics,
                ),
            }
            # Propagate grouping dimensions for chart widgets
            if resolved_type in ("trend_line", "bar_chart"):
                if dimensions["group_by"]:
                    widget_config["group_by"] = dimensions["group_by"]
                if dimensions["time_grain"]:
                    widget_config["time_grain"] = dimensions["time_grain"]

            widget: dict[str, Any] = {
                "id": f"{section_key}_{len(widgets)}",
                "type": resolved_type,
                "config": widget_config,
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

    # Adaptive sizing: center single chart widgets
    non_kpi = [w for w in widgets if w["type"] != "metrics_strip"]
    if len(non_kpi) == 1 and not non_kpi[0]["config"].get("group_by"):
        w = non_kpi[0]
        w["layout"]["w"] = 8
        w["layout"]["x"] = 2

    # Inject companion tables for pipeline_bar and geographic_map
    existing_types = {w["type"] for w in widgets}
    for trigger_type, rule in TABLE_INFERENCE_RULES.items():
        if trigger_type in existing_types:
            # Only inject if no comparison_table already present
            if rule["companion_type"] not in existing_types:
                widgets.append({
                    "id": f"inferred_table_{len(widgets)}",
                    "type": rule["companion_type"],
                    "config": {
                        "title": rule["title"],
                        "entity_type": entity_type,
                        "quarter": quarter,
                        "scenario": "actual",
                        "metrics": [],
                    },
                    "layout": {"x": 0, "y": current_y, "w": rule["w"], "h": rule["h"]},
                })
                current_y += rule["h"]
                existing_types.add(rule["companion_type"])
                arch_builder_messages.append({
                    "level": "info",
                    "text": rule["reason"],
                })

    name = _generate_name(message, archetype)

    result = {
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
        "density": density if density != "auto" else ("compact" if compact else "comfortable"),
    }
    if arch_builder_messages:
        result["builder_messages"] = arch_builder_messages
    return result
