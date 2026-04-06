"""Query classifier — deterministic classification of natural-language questions.

Classifies into structured query types WITHOUT an LLM call (sub-1ms).
Falls back to LLM-based classification only for truly ambiguous cases.

Query types:
  - lookup: single-entity or filtered list retrieval
  - ranked_comparison: top-N / bottom-N ranking
  - grouped_aggregation: SUM/AVG/COUNT grouped by dimension
  - time_series: metric over time periods
  - variance_analysis: actual vs budget / plan vs forecast
  - filtered_list: filtered table scan with conditions
  - diagnostic: schema or metadata question
  - chart_first: user explicitly asks for a chart/plot/graph
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class QueryType(str, Enum):
    LOOKUP = "lookup"
    RANKED_COMPARISON = "ranked_comparison"
    GROUPED_AGGREGATION = "grouped_aggregation"
    TIME_SERIES = "time_series"
    VARIANCE_ANALYSIS = "variance_analysis"
    FILTERED_LIST = "filtered_list"
    DIAGNOSTIC = "diagnostic"
    CHART_FIRST = "chart_first"


@dataclass
class QueryClassification:
    query_type: QueryType
    confidence: float  # 0.0 - 1.0
    domain: str  # "repe" | "pds" | "crm" | "general"
    signals: dict[str, Any] = field(default_factory=dict)
    suggested_template_key: str | None = None


# ── Signal patterns ──────────────────────────────────────────────────

_RANK_PATTERNS = re.compile(
    r"\b(top|bottom|best|worst|highest|lowest|largest|smallest|most|least|rank)\b"
    r"|\b(top\s*\d+|bottom\s*\d+)\b",
    re.IGNORECASE,
)

_TIME_PATTERNS = re.compile(
    r"\b(trend|over\s+time|by\s+(quarter|month|year|period)|quarter[- ]over[- ]quarter"
    r"|month[- ]over[- ]month|year[- ]over[- ]year|q[1-4]|20\d{2}Q[1-4]"
    r"|trailing|rolling|ytd|mtd|qtd|last\s+\d+\s+(quarters?|months?|years?)"
    r"|time\s*series|historical)\b",
    re.IGNORECASE,
)

_VARIANCE_PATTERNS = re.compile(
    r"\b(vs\.?|versus|compared?\s+to|variance|budget|forecast|underwriting"
    r"|actual|plan|deviation|delta|gap|shortfall|overage|miss)\b",
    re.IGNORECASE,
)

_AGGREGATION_PATTERNS = re.compile(
    r"\b(by\s+(market|region|property.?type|fund|asset|deal|service.?line|account|tier|department)"
    r"|group|breakdown|distribution|split|composition|mix|allocation|per\s+\w+)\b",
    re.IGNORECASE,
)

_CHART_PATTERNS = re.compile(
    r"\b(plot|chart|graph|visualize|diagram|bar\s+chart|line\s+chart|scatter"
    r"|heatmap|histogram|pie|donut|area\s+chart|waterfall|stacked)\b",
    re.IGNORECASE,
)

_DIAGNOSTIC_PATTERNS = re.compile(
    r"\b(schema|tables?|columns?|what\s+data|describe|definition|metadata"
    r"|what\s+fields|how\s+is\s+\w+\s+stored|data\s+model|what\s+metrics)\b",
    re.IGNORECASE,
)

_LOOKUP_PATTERNS = re.compile(
    r"\b(show\s+me|what\s+is|what\s+are|list|get|find|look\s*up|details?\s+(for|of|on)"
    r"|tell\s+me\s+about|info\s+on|summary\s+(for|of))\b",
    re.IGNORECASE,
)

_FILTER_PATTERNS = re.compile(
    r"\b(where|with|below|above|under|over|less\s+than|more\s+than|greater\s+than"
    r"|exceeds?|at\s+least|at\s+most|between|stale|overdue|expired|maturing"
    r"|delinquent|non[- ]?compliant|breached)\b",
    re.IGNORECASE,
)

# ── Domain keywords ──────────────────────────────────────────────────

_REPE_KEYWORDS = frozenset({
    "fund", "deal", "asset", "property", "loan", "irr", "tvpi", "dpi",
    "noi", "cap rate", "dscr", "ltv", "debt yield", "waterfall",
    "capital account", "occupancy", "rent", "lease", "covenant",
    "vintage", "sponsor", "equity", "gp", "lp", "partner",
    "repe", "real estate", "private equity", "multifamily", "office",
    "industrial", "retail", "hotel", "valuation", "nav", "rvpi",
    "debt", "maturity", "gross irr", "net irr",
})

_PDS_KEYWORDS = frozenset({
    "utilization", "nps", "satisfaction", "employee", "adoption",
    "project", "budget", "billing", "billable", "bench", "resource",
    "capacity", "demand", "service line", "governance", "pipeline",
    "revenue recognition", "backlog", "forecast", "pds",
    "construction", "development", "cost management",
})

_CRM_KEYWORDS = frozenset({
    "opportunity", "account", "contact", "lead", "pipeline stage",
    "win rate", "close date", "prospect", "vendor", "crm",
    "activity", "outreach", "proposal", "engagement",
})


# ── Top-N extraction ─────────────────────────────────────────────────

_TOP_N_PATTERN = re.compile(r"\b(top|bottom)\s*(\d+)\b", re.IGNORECASE)


def _extract_top_n(question: str) -> int | None:
    m = _TOP_N_PATTERN.search(question)
    return int(m.group(2)) if m else None


# ── Main classifier ──────────────────────────────────────────────────


def classify_query(question: str) -> QueryClassification:
    """Classify a natural-language question into a structured query type.

    Deterministic, sub-1ms, no LLM call. Uses weighted signal scoring.
    """
    q = question.lower().strip()
    scores: dict[QueryType, float] = {qt: 0.0 for qt in QueryType}

    # Score each pattern
    if _CHART_PATTERNS.search(q):
        scores[QueryType.CHART_FIRST] += 3.0

    if _DIAGNOSTIC_PATTERNS.search(q):
        scores[QueryType.DIAGNOSTIC] += 3.0

    if _RANK_PATTERNS.search(q):
        scores[QueryType.RANKED_COMPARISON] += 2.5

    if _TIME_PATTERNS.search(q):
        scores[QueryType.TIME_SERIES] += 2.5

    if _VARIANCE_PATTERNS.search(q):
        scores[QueryType.VARIANCE_ANALYSIS] += 2.5

    if _AGGREGATION_PATTERNS.search(q):
        scores[QueryType.GROUPED_AGGREGATION] += 2.0

    if _FILTER_PATTERNS.search(q):
        scores[QueryType.FILTERED_LIST] += 1.5

    if _LOOKUP_PATTERNS.search(q):
        scores[QueryType.LOOKUP] += 1.0

    # Tie-breaking: chart_first can combine with others
    # If chart is requested AND a data type is clear, keep the data type
    # but note the chart preference in signals
    chart_requested = scores[QueryType.CHART_FIRST] > 0
    if chart_requested:
        # Check if another type is also strong
        non_chart_max = max(
            (s for qt, s in scores.items() if qt != QueryType.CHART_FIRST),
            default=0.0,
        )
        if non_chart_max >= 2.0:
            # The data type is clear; chart is a rendering preference
            scores[QueryType.CHART_FIRST] = 0.0

    # Pick winner
    best_type = max(scores, key=lambda qt: scores[qt])
    best_score = scores[best_type]

    # Default to filtered_list if nothing matched strongly
    if best_score < 1.0:
        best_type = QueryType.FILTERED_LIST
        best_score = 0.5

    # Confidence: normalize to 0-1 range (max reasonable score ~5)
    confidence = min(best_score / 4.0, 1.0)

    # Domain classification
    domain = _classify_domain(q)

    # Extract signals
    signals: dict[str, Any] = {}
    top_n = _extract_top_n(question)
    if top_n:
        signals["top_n"] = top_n
    if chart_requested:
        signals["chart_requested"] = True
    signals["scores"] = {qt.value: round(s, 2) for qt, s in scores.items() if s > 0}

    # Template matching
    template_key = _match_template(q, best_type, domain)

    return QueryClassification(
        query_type=best_type,
        confidence=confidence,
        domain=domain,
        signals=signals,
        suggested_template_key=template_key,
    )


def _classify_domain(q: str) -> str:
    """Keyword-based domain classification."""
    repe = sum(1 for kw in _REPE_KEYWORDS if kw in q)
    pds = sum(1 for kw in _PDS_KEYWORDS if kw in q)
    crm = sum(1 for kw in _CRM_KEYWORDS if kw in q)

    if repe > pds and repe > crm:
        return "repe"
    if pds > repe and pds > crm:
        return "pds"
    if crm > repe and crm > pds:
        return "crm"
    return "general"


def _match_template(q: str, query_type: QueryType, domain: str) -> str | None:
    """Try to match a deterministic query template key."""
    # REPE templates
    if domain == "repe":
        # "NOI movers" → always route to noi_movers regardless of query type
        if "noi" in q and "mover" in q:
            return "repe.noi_movers"
        # "best/worst/top/bottom performing assets" with no explicit metric → rank by NOI
        if query_type == QueryType.RANKED_COMPARISON and "fund" not in q:
            if any(kw in q for kw in ("best", "worst", "top", "bottom",
                                       "performing", "performance", "rank")):
                return "repe.noi_ranked"
        if "noi" in q and query_type == QueryType.RANKED_COMPARISON:
            # noi_movers = change between periods; noi_ranked = absolute value ranking
            if any(kw in q for kw in ("change", "mover", "moved", "delta", "swing",
                                       "quarter over quarter", "qoq", "shift")):
                return "repe.noi_movers"
            return "repe.noi_ranked"
        if "noi" in q and query_type == QueryType.TIME_SERIES:
            # Period-comparison queries (movers) land here when TIME_SERIES wins scoring
            if any(kw in q for kw in ("change", "mover", "moved", "delta", "shift",
                                       "quarter over quarter", "qoq")):
                return "repe.noi_movers"
            return "repe.noi_trend"
        if "occupancy" in q and query_type == QueryType.TIME_SERIES:
            return "repe.occupancy_trend"
        if "occupancy" in q and query_type == QueryType.RANKED_COMPARISON:
            return "repe.occupancy_ranked"
        # Fund return rankings — specific metric beats generic fund_returns
        if "irr" in q and query_type == QueryType.RANKED_COMPARISON:
            return "repe.irr_ranked"
        if "tvpi" in q and query_type == QueryType.RANKED_COMPARISON:
            return "repe.tvpi_ranked"
        if "nav" in q and query_type == QueryType.RANKED_COMPARISON and "fund" in q:
            return "repe.nav_ranked"
        if ("irr" in q or "tvpi" in q or "dpi" in q) and "fund" in q:
            return "repe.fund_returns"
        # Asset-level debt rankings
        if "dscr" in q and query_type == QueryType.RANKED_COMPARISON:
            return "repe.dscr_ranked"
        if "ltv" in q and query_type == QueryType.RANKED_COMPARISON:
            return "repe.ltv_ranked"
        # Debt maturity (canonical template with correct column names)
        if "matur" in q and ("loan" in q or "debt" in q or "maturity" in q):
            return "repe.debt_maturity"
        if "covenant" in q or "dscr" in q or "ltv" in q:
            return "repe.covenant_status"
        if "loan" in q and ("maturing" in q or "maturity" in q):
            return "repe.debt_maturity"
        if "budget" in q and "variance" in q:
            return "repe.budget_variance"

    # PDS templates
    if domain == "pds":
        if "utilization" in q and query_type == QueryType.TIME_SERIES:
            return "pds.utilization_trend"
        if "utilization" in q and query_type in (QueryType.RANKED_COMPARISON, QueryType.GROUPED_AGGREGATION):
            return "pds.utilization_by_group"
        if "revenue" in q and ("budget" in q or "variance" in q or "actual" in q):
            return "pds.revenue_variance"
        if "nps" in q:
            return "pds.nps_summary"
        if "bench" in q or "bench" in q:
            return "pds.bench_report"
        if "adoption" in q:
            return "pds.tech_adoption"

    # CRM templates
    if domain == "crm":
        if "stale" in q or "overdue" in q:
            return "crm.stale_opportunities"
        if "pipeline" in q:
            return "crm.pipeline_summary"
        if "win" in q and "rate" in q:
            return "crm.win_rate"

    return None
