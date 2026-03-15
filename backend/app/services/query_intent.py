"""Analytical query intent extraction — regex-based parsing of group_by, time grain,
chart preference, sort, limit, and comparison from natural language.

Used by the AI gateway fast-path and the response block builder to produce
properly structured chart/table blocks for analytical queries.

Runs in <1ms. No LLM required.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class AnalyticalQueryIntent:
    """Parsed analytical query intent."""

    metrics: list[str] = field(default_factory=list)
    group_by: str | None = None
    time_grain: str | None = None
    is_time_series: bool = False
    chart_preference: str | None = None
    sort_by: str | None = None
    sort_dir: str = "desc"
    limit: int | None = None
    comparison: str | None = None
    filters: dict[str, str] = field(default_factory=dict)


# ── Metric keywords ──────────────────────────────────────────────────────

_METRIC_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bnoi\b", re.I), "noi"),
    (re.compile(r"\bnet\s+operating\s+income\b", re.I), "noi"),
    (re.compile(r"\brevenue\b", re.I), "revenue"),
    (re.compile(r"\brent(?:al)?\s+income\b", re.I), "revenue"),
    (re.compile(r"\bopex\b", re.I), "opex"),
    (re.compile(r"\boperating\s+expense", re.I), "opex"),
    (re.compile(r"\birr\b", re.I), "irr"),
    (re.compile(r"\btvpi\b", re.I), "tvpi"),
    (re.compile(r"\bdpi\b", re.I), "dpi"),
    (re.compile(r"\bnav\b", re.I), "nav"),
    (re.compile(r"\boccupancy\b", re.I), "occupancy"),
    (re.compile(r"\bcap\s*rate\b", re.I), "cap_rate"),
    (re.compile(r"\bcarry\b", re.I), "carry"),
    (re.compile(r"\bdistribution", re.I), "distributions"),
    (re.compile(r"\bcapital\s+call", re.I), "capital_calls"),
    (re.compile(r"\bdebt\s+service\b", re.I), "debt_service"),
    (re.compile(r"\bdscr\b", re.I), "dscr"),
    (re.compile(r"\bltv\b", re.I), "ltv"),
    (re.compile(r"\bvaluation\b", re.I), "valuation"),
]


# ── Dimension patterns ────────────────────────────────────────────────────

_DIMENSION_PATTERNS: list[tuple[re.Pattern[str], str | None]] = [
    (re.compile(r"\bby\s+investment\b", re.I), "investment"),
    (re.compile(r"\bby\s+asset\b", re.I), "asset"),
    (re.compile(r"\bby\s+propert(?:y|ies)\b", re.I), "asset"),
    (re.compile(r"\bby\s+fund\b", re.I), "fund"),
    (re.compile(r"\bby\s+market\b", re.I), "market"),
    (re.compile(r"\bby\s+region\b", re.I), "region"),
    (re.compile(r"\bby\s+quarter\b", re.I), "quarter"),
    (re.compile(r"\bby\s+vintage\b", re.I), "vintage"),
    (re.compile(r"\bper\s+investment\b", re.I), "investment"),
    (re.compile(r"\bper\s+asset\b", re.I), "asset"),
    (re.compile(r"\bper\s+fund\b", re.I), "fund"),
    (re.compile(r"\bacross\s+investments?\b", re.I), "investment"),
    (re.compile(r"\bacross\s+assets?\b", re.I), "asset"),
    (re.compile(r"\bacross\s+funds?\b", re.I), "fund"),
    (re.compile(r"\beach\s+investment\b", re.I), "investment"),
    (re.compile(r"\beach\s+asset\b", re.I), "asset"),
    (re.compile(r"\beach\s+fund\b", re.I), "fund"),
    # Generic "broken down by X" / "grouped by X"
    (re.compile(r"\bbroken?\s+down\s+by\s+(investment|asset|fund|market|region|quarter|vintage)\b", re.I), None),
    (re.compile(r"\bgrouped?\s+by\s+(investment|asset|fund|market|region|quarter|vintage)\b", re.I), None),
]

# ── Time patterns ─────────────────────────────────────────────────────────

_TIME_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bover\s+time\b", re.I), "quarterly"),
    (re.compile(r"\btrend\b", re.I), "quarterly"),
    (re.compile(r"\btime\s+series\b", re.I), "quarterly"),
    (re.compile(r"\bmonthly\b", re.I), "monthly"),
    (re.compile(r"\bquarterly\b", re.I), "quarterly"),
    (re.compile(r"\bannual(?:ly)?\b", re.I), "annual"),
    (re.compile(r"\byear[\s-]over[\s-]year\b", re.I), "annual"),
    (re.compile(r"\byoy\b", re.I), "annual"),
    (re.compile(r"\bhistor(?:y|ical)\b", re.I), "quarterly"),
]

# ── Chart preference patterns ─────────────────────────────────────────────

_CHART_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bline\s+chart\b", re.I), "line"),
    (re.compile(r"\bplot\b", re.I), "line"),
    (re.compile(r"\bgraph\b", re.I), "line"),
    (re.compile(r"\bbar\s+chart\b", re.I), "bar"),
    (re.compile(r"\btable\b", re.I), "table"),
    (re.compile(r"\branked?\b", re.I), "table"),
    (re.compile(r"\blist\b", re.I), "table"),
    (re.compile(r"\bheatmap\b", re.I), "heatmap"),
]

# ── Comparison patterns ───────────────────────────────────────────────────

_COMPARISON_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bvs\.?\s+budget\b", re.I), "budget"),
    (re.compile(r"\bactual\s+vs\.?\s+budget\b", re.I), "budget"),
    (re.compile(r"\bbudget\s+vs\.?\s+actual\b", re.I), "budget"),
    (re.compile(r"\bvs\.?\s+(?:prior|last)\s+(?:quarter|period|year)\b", re.I), "prior_period"),
    (re.compile(r"\bprior\s+(?:quarter|period|year)\b", re.I), "prior_period"),
    (re.compile(r"\byoy\b", re.I), "prior_period"),
    (re.compile(r"\bunderwriting\s+vs\.?\s+actual\b", re.I), "underwriting"),
    (re.compile(r"\buw\s+vs\.?\s+actual\b", re.I), "underwriting"),
]

# ── Top-N / limit ─────────────────────────────────────────────────────────

_TOP_N_RE = re.compile(r"\btop\s+(\d+)\b", re.I)
_BOTTOM_N_RE = re.compile(r"\bbottom\s+(\d+)\b", re.I)

# ── Transform commands ────────────────────────────────────────────────────

_TRANSFORM_PATTERNS: list[tuple[re.Pattern[str], str, str | None]] = [
    (re.compile(r"\bturn\s+(?:that|this|it)\s+into\s+(?:a\s+)?bar\s+chart", re.I), "chart_type", "bar"),
    (re.compile(r"\bturn\s+(?:that|this|it)\s+into\s+(?:a\s+)?line\s+chart", re.I), "chart_type", "line"),
    (re.compile(r"\bturn\s+(?:that|this|it)\s+into\s+(?:a\s+)?table", re.I), "chart_type", "table"),
    (re.compile(r"\bshow\s+(?:that|this|it)\s+as\s+(?:a\s+)?bar", re.I), "chart_type", "bar"),
    (re.compile(r"\bshow\s+(?:that|this|it)\s+as\s+(?:a\s+)?line", re.I), "chart_type", "line"),
    (re.compile(r"\bshow\s+(?:that|this|it)\s+as\s+(?:a\s+)?table", re.I), "chart_type", "table"),
    (re.compile(r"\bgive\s+me\s+(?:a\s+)?table\s+instead\b", re.I), "chart_type", "table"),
    (re.compile(r"\btable\s+instead\b", re.I), "chart_type", "table"),
    (re.compile(r"\bbr(?:eak|oken)\s+(?:that|this|it)\s+(?:down\s+)?(?:out\s+)?by\s+(\w+)", re.I), "group_by", None),
    (re.compile(r"\btop\s+(\d+)\s+only\b", re.I), "limit", None),
]


def extract_query_intent(message: str) -> AnalyticalQueryIntent:
    """Parse natural language into structured analytical query intent.

    Returns an AnalyticalQueryIntent with extracted metrics, grouping,
    time grain, chart preference, sorting, limit, and comparison.
    """
    intent = AnalyticalQueryIntent()

    # Extract metrics
    for pattern, metric in _METRIC_KEYWORDS:
        if pattern.search(message):
            if metric not in intent.metrics:
                intent.metrics.append(metric)

    # Extract group_by dimension
    for pattern, dimension in _DIMENSION_PATTERNS:
        match = pattern.search(message)
        if match:
            if dimension is not None:
                intent.group_by = dimension
            else:
                # Dynamic capture from group 1
                intent.group_by = match.group(1).lower()
            break

    # Extract time grain
    for pattern, grain in _TIME_PATTERNS:
        if pattern.search(message):
            intent.time_grain = grain
            intent.is_time_series = True
            break

    # Extract chart preference
    for pattern, pref in _CHART_PATTERNS:
        if pattern.search(message):
            intent.chart_preference = pref
            break

    # Infer chart preference from time_series + group_by
    if intent.chart_preference is None:
        if intent.is_time_series and intent.group_by:
            intent.chart_preference = "line"
        elif intent.is_time_series:
            intent.chart_preference = "line"
        elif intent.group_by:
            intent.chart_preference = "bar"

    # Extract comparison
    for pattern, comp in _COMPARISON_PATTERNS:
        if pattern.search(message):
            intent.comparison = comp
            break

    # Extract top-N / bottom-N
    top_match = _TOP_N_RE.search(message)
    if top_match:
        intent.limit = int(top_match.group(1))
        intent.sort_dir = "desc"
        if not intent.chart_preference:
            intent.chart_preference = "table"

    bottom_match = _BOTTOM_N_RE.search(message)
    if bottom_match:
        intent.limit = int(bottom_match.group(1))
        intent.sort_dir = "asc"
        if not intent.chart_preference:
            intent.chart_preference = "table"

    # Sort by first metric if limit is set
    if intent.limit and intent.metrics and not intent.sort_by:
        intent.sort_by = intent.metrics[0]

    return intent


def detect_transform(message: str) -> dict[str, str] | None:
    """Detect if a message is a conversational transform command.

    Returns a dict like {"chart_type": "bar"} or {"group_by": "market"}
    or {"limit": "5"}, or None if not a transform.
    """
    for pattern, key, value in _TRANSFORM_PATTERNS:
        match = pattern.search(message)
        if match:
            if value is not None:
                return {key: value}
            # Dynamic capture
            return {key: match.group(1).lower() if match.lastindex else ""}
    return None


def is_transform_command(message: str) -> bool:
    """Quick check: is this message a conversational transform?"""
    return detect_transform(message) is not None
