"""Meridian structured contract parser.

Deterministic, regex-based parser that converts natural-language REPE queries
into a canonical MeridianStructuredContract.  No LLM calls.

Parse order (matches the prompt spec):
  1. transformation (sort/rank/filter/breakout/compare/trend/detail/holdings/investigation)
  2. metric / fact
  3. entity / scope
  4. operators (sort_by, sort_direction, limit, group_by, aggregation, filters)
  5. timeframe
  6. continuity (referential follow-ups that inherit prior state)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# ── Contract ───────────────────────────────────────────────────────────

@dataclass
class MeridianStructuredContract:
    entity: str | None = None            # portfolio|fund|investment|asset|loan|null
    entity_name: str | None = None
    metric: str | None = None
    fact: str | None = None
    transformation: str | None = None    # summary|list|rank|filter|breakout|compare|trend|detail|holdings|investigation
    group_by: str | None = None
    aggregation: str | None = None
    filters: list[dict[str, Any]] = field(default_factory=list)
    sort_by: str | None = None
    sort_direction: str | None = None    # asc|desc
    limit: int | None = None
    timeframe_type: str | None = None    # quarter|latest|ttm|ltm|none
    timeframe_value: str | None = None
    needs_clarification: bool = False
    # Metadata
    _matched_patterns: list[str] = field(default_factory=list)


# ── Transformation detection ───────────────────────────────────────────

_RANK_RE = re.compile(
    r"\b(sort|rank|top|highest|lowest|ascending|descending|worst(?:\s+to\s+best)?|best(?:\s+to\s+worst)?|bottom)\b",
    re.IGNORECASE,
)
_FILTER_RE = re.compile(
    r"\b(which\s+have|with\s+(?:a|an)?\s*(?:noi|irr|tvpi|dpi|occupancy|revenue|expenses|dscr|ltv)|above|below|less\s+than|greater\s+than|or\s+worse|not\s+active|worse\s+than|better\s+than|at\s+least|no\s+more\s+than|exceeding)\b",
    re.IGNORECASE,
)
_BREAKOUT_RE = re.compile(
    r"\b(each|per|by\s+fund|by\s+market|by\s+property\s*type|by\s+status|by\s+strategy|break\s+(?:that|it|this)\s+out|broken?\s+out|breakout|break\s+down|breakdown)\b",
    re.IGNORECASE,
)
_LIST_RE = re.compile(
    r"\b(list|show\s+(?:me\s+)?(?:all|the)|what\s+are(?:\s+the)?|rundown|inventory|give\s+me\s+(?:a\s+)?list)\b",
    re.IGNORECASE,
)
_SUMMARY_RE = re.compile(
    r"\b(summar(?:y|ize)|overview|recap|high(?:-|\s)?level|snapshot"
    r"|how\s+(?:is|are)\s+(?:the\s+)?(?:fund|portfolio|each\s+fund)s?\s+(?:doing|performing)"
    r"|how\s+(?:is|are)\s+each\s+fund(?:'?s?)?\s+(?:doing|performing))\b",
    re.IGNORECASE,
)
_DETAIL_RE = re.compile(
    r"\b(detail(?:s|ed)?|drill\s+(?:down|into)|deep(?:er)?\s+dive|tell\s+me\s+(?:more\s+)?about|specifics|elaborate)\b",
    re.IGNORECASE,
)
_COUNT_RE = re.compile(
    r"\b(how\s+many|count|total\s+(?:number|count)|number\s+of)\b",
    re.IGNORECASE,
)
_COMPARE_RE = re.compile(
    r"\b(compare|versus|vs\.?|side\s+by\s+side|relative\s+to|compared?\s+to|against)\b",
    re.IGNORECASE,
)
_TREND_RE = re.compile(
    r"\b(trend|over\s+time|quarter\s+over\s+quarter|qoq|yoy|year\s+over\s+year|trajectory|progression)\b",
    re.IGNORECASE,
)
_HOLDINGS_RE = re.compile(
    r"\b(holdings?|what\s+(?:does|do)\s+(?:it|they|we)\s+(?:hold|own)|portfolio\s+composition|what(?:'s|s)?\s+in\s+(?:the\s+)?(?:fund|portfolio))\b",
    re.IGNORECASE,
)
_INVESTIGATION_RE = re.compile(
    r"\b(why\s+(?:is|are|did|does|do)|what\s+(?:is\s+)?driving|what\s+caused|explain\s+(?:the|this|why)|root\s+cause|investigate)\b",
    re.IGNORECASE,
)


def _detect_transformation(msg: str) -> tuple[str | None, list[str]]:
    """Return (transformation, matched_patterns).  Priority order matters."""
    patterns: list[str] = []
    if _RANK_RE.search(msg):
        patterns.append("rank")
    if _FILTER_RE.search(msg):
        patterns.append("filter")
    if _BREAKOUT_RE.search(msg):
        patterns.append("breakout")
    if _LIST_RE.search(msg):
        patterns.append("list")
    if _SUMMARY_RE.search(msg):
        patterns.append("summary")
    if _DETAIL_RE.search(msg):
        patterns.append("detail")
    if _COUNT_RE.search(msg):
        patterns.append("count")
    if _COMPARE_RE.search(msg):
        patterns.append("compare")
    if _TREND_RE.search(msg):
        patterns.append("trend")
    if _HOLDINGS_RE.search(msg):
        patterns.append("holdings")
    if _INVESTIGATION_RE.search(msg):
        patterns.append("investigation")

    # Priority: rank > filter > breakout > summary > list > count > detail > compare > trend > holdings > investigation
    # Exception: if both "summary" and "breakout" match, summary wins when
    # the message contains "summarize" or "how is/are ... doing/performing"
    # (because "each" triggers breakout but "summarize each fund" is summary intent).
    _PRIORITY = [
        "rank", "filter", "breakout", "summary", "list",
        "count", "detail", "compare", "trend", "holdings", "investigation",
    ]
    if "summary" in patterns and "breakout" in patterns:
        return "summary", patterns
    for t in _PRIORITY:
        if t in patterns:
            return t, patterns
    return None, patterns


# ── Metric / fact detection ────────────────────────────────────────────

_METRIC_MAP: dict[str, str] = {
    "irr": "irr",
    "gross irr": "gross_irr",
    "net irr": "net_irr",
    "tvpi": "tvpi",
    "dpi": "dpi",
    "rvpi": "rvpi",
    "noi": "noi",
    "noi variance": "noi_variance",
    "occupancy": "occupancy",
    "dscr": "dscr",
    "ltv": "ltv",
    "cap rate": "cap_rate",
    "revenue": "revenue",
    "expenses": "expenses",
    "opex": "opex",
    "nav": "nav",
    "ncf": "ncf",
    "debt yield": "debt_yield",
    "cash on cash": "cash_on_cash",
    "performance": "performance",
}

_METRIC_RE_SORTED = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(_METRIC_MAP.keys(), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

_FACT_MAP: dict[str, str] = {
    "commitments": "commitments",
    "total commitments": "commitments",
    "commitment": "commitments",
    "capital committed": "commitments",
    "called capital": "called_capital",
    "capital called": "called_capital",
    "distributed capital": "distributed_capital",
    "distributions": "distributed_capital",
    "contributions": "contributions",
    "assets": "asset_count",
    "asset count": "asset_count",
    "number of assets": "asset_count",
    "funds": "fund_list",
    "fund list": "fund_list",
    "fund names": "fund_list",
    "property type": "property_type",
    "market": "market",
    "vintage": "vintage",
    "strategy": "strategy",
    "status": "status",
    "names": "names",
}

_FACT_RE_SORTED = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in sorted(_FACT_MAP.keys(), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def _detect_metric_fact(msg: str) -> tuple[str | None, str | None]:
    metric: str | None = None
    fact: str | None = None

    m = _METRIC_RE_SORTED.search(msg)
    if m:
        metric = _METRIC_MAP.get(m.group(0).lower())

    f = _FACT_RE_SORTED.search(msg)
    if f:
        fact = _FACT_MAP.get(f.group(0).lower())

    # "performance" as a metric proxy when "summarize each fund's performance"
    # or "how is each fund doing/performing"
    if not metric and re.search(r"\b(?:performance|performing|doing)\b", msg, re.IGNORECASE):
        metric = "performance"

    return metric, fact


# ── Entity / scope detection ───────────────────────────────────────────

_ENTITY_RE = re.compile(
    r"\b(portfolio|fund(?:s)?|investment(?:s)?|asset(?:s)?|propert(?:y|ies)|loan(?:s)?)\b",
    re.IGNORECASE,
)
_ENTITY_NORMALIZE: dict[str, str] = {
    "portfolio": "portfolio",
    "fund": "fund",
    "funds": "fund",
    "investment": "investment",
    "investments": "investment",
    "asset": "asset",
    "assets": "asset",
    "property": "asset",
    "properties": "asset",
    "loan": "loan",
    "loans": "loan",
}


def _detect_entity(msg: str) -> str | None:
    m = _ENTITY_RE.search(msg)
    if not m:
        return None
    return _ENTITY_NORMALIZE.get(m.group(0).lower())


# ── Operator extraction ────────────────────────────────────────────────

_SORT_DIRECTION_RE = re.compile(
    r"\b(ascending|descending|asc|desc|worst\s+to\s+best|best\s+to\s+worst|lowest\s+(?:to\s+highest|first)|highest\s+(?:to\s+lowest|first))\b",
    re.IGNORECASE,
)
_ASC_TERMS = {"ascending", "asc", "worst to best", "lowest to highest", "lowest first"}
_DESC_TERMS = {"descending", "desc", "best to worst", "highest to lowest", "highest first"}

_TOP_N_RE = re.compile(r"\b(?:top|bottom|worst|best)\s+(\d+)\b", re.IGNORECASE)
_LIMIT_RE = re.compile(r"\blimit\s+(\d+)\b", re.IGNORECASE)

_NUMERIC_FILTER_RE = re.compile(
    r"(?:(?:above|over|greater\s+than|more\s+than|exceeding|at\s+least)\s+([+-]?\d+(?:\.\d+)?)\s*%?"
    r"|(?:below|under|less\s+than|worse\s+than|no\s+more\s+than)\s+([+-]?\d+(?:\.\d+)?)\s*%?"
    r"|(?:of\s+)?([+-]?\d+(?:\.\d+)?)\s*%?\s+(?:or\s+worse|or\s+more|or\s+less|or\s+better))",
    re.IGNORECASE,
)

_GROUP_BY_RE = re.compile(
    r"\b(?:by|per|each|group\s+by|broken?\s+out\s+by)\s+(fund|market|property\s*type|status|strategy|vintage|region)\b",
    re.IGNORECASE,
)


def _extract_operators(msg: str) -> dict[str, Any]:
    ops: dict[str, Any] = {}

    # Sort direction
    sd = _SORT_DIRECTION_RE.search(msg)
    if sd:
        raw = sd.group(0).lower().strip()
        if raw in _ASC_TERMS:
            ops["sort_direction"] = "asc"
        elif raw in _DESC_TERMS:
            ops["sort_direction"] = "desc"

    # Limit
    tn = _TOP_N_RE.search(msg)
    if tn:
        ops["limit"] = int(tn.group(1))
        # top → desc, bottom/worst → asc
        prefix = msg[tn.start():tn.start() + 6].lower()
        if "bottom" in prefix or "worst" in prefix:
            ops.setdefault("sort_direction", "asc")
        else:
            ops.setdefault("sort_direction", "desc")
    elif (lm := _LIMIT_RE.search(msg)):
        ops["limit"] = int(lm.group(1))

    # Group by
    gb = _GROUP_BY_RE.search(msg)
    if gb:
        ops["group_by"] = gb.group(1).lower().replace(" ", "_")

    # Numeric filters
    filters: list[dict[str, Any]] = []
    for fm in _NUMERIC_FILTER_RE.finditer(msg):
        above_val, below_val, relative_val = fm.groups()
        if above_val is not None:
            filters.append({"operator": ">=", "value": float(above_val)})
        elif below_val is not None:
            filters.append({"operator": "<=", "value": float(below_val)})
        elif relative_val is not None:
            # "X or worse" — depends on context; for NOI variance, worse = more negative
            matched_text = fm.group(0).lower()
            if "or worse" in matched_text:
                filters.append({"operator": "<=", "value": float(relative_val)})
            elif "or better" in matched_text:
                filters.append({"operator": ">=", "value": float(relative_val)})
            elif "or more" in matched_text:
                filters.append({"operator": ">=", "value": float(relative_val)})
            elif "or less" in matched_text:
                filters.append({"operator": "<=", "value": float(relative_val)})
    if filters:
        ops["filters"] = filters

    return ops


# ── Timeframe detection ────────────────────────────────────────────────

_QUARTER_RE = re.compile(r"\b(?:Q([1-4])\s*(\d{4})|(\d{4})\s*Q([1-4]))\b", re.IGNORECASE)
_LATEST_RE = re.compile(r"\b(latest|current|most\s+recent|as\s+of\s+today|as\s+of\s+now)\b", re.IGNORECASE)
_TTM_RE = re.compile(r"\b(ttm|ltm|trailing\s+(?:12|twelve)\s+months?|last\s+(?:12|twelve)\s+months?)\b", re.IGNORECASE)


def _detect_timeframe(msg: str) -> tuple[str | None, str | None]:
    qm = _QUARTER_RE.search(msg)
    if qm:
        if qm.group(1) and qm.group(2):
            return "quarter", f"{qm.group(2)}Q{qm.group(1)}"
        elif qm.group(3) and qm.group(4):
            return "quarter", f"{qm.group(3)}Q{qm.group(4)}"

    if _TTM_RE.search(msg):
        return "ttm", None

    if _LATEST_RE.search(msg):
        return "latest", None

    return None, None


# ── Continuity / referential follow-up detection ───────────────────────

_CONTINUITY_RE = re.compile(
    r"\b(the\s+other(?:\s+\d+)?|remaining|which\s+ones|their\s+names|the\s+rest|those|"
    r"can\s+you\s+break\s+that\s+out|break\s+that\s+out|and\s+(?:the|their)\b|"
    r"what\s+about\s+the\s+(?:other|rest))\b",
    re.IGNORECASE,
)


def _is_continuity_query(msg: str) -> bool:
    return bool(_CONTINUITY_RE.search(msg))


# ── Public API ─────────────────────────────────────────────────────────

def is_meridian_structured_query(
    message: str,
    *,
    env_name: str | None = None,
) -> bool:
    """Quick check: does this message look like a structured REPE query?

    This is intentionally broad — the full parser will decide if it can
    produce a complete contract.  False positives are OK; they just fall
    through to the normal runtime.
    """
    msg = (message or "").strip()
    if not msg or len(msg) < 6:
        return False

    # Must touch at least one REPE concept
    has_metric = bool(_METRIC_RE_SORTED.search(msg))
    has_fact = bool(_FACT_RE_SORTED.search(msg))
    has_entity = bool(_ENTITY_RE.search(msg))
    has_transformation = _detect_transformation(msg)[0] is not None
    has_continuity = _is_continuity_query(msg)

    return (has_metric or has_fact or has_continuity) and (has_entity or has_transformation or has_continuity)


def parse_meridian_contract(
    message: str,
    prior_state: dict[str, Any] | None = None,
) -> MeridianStructuredContract | None:
    """Parse a user message into a MeridianStructuredContract.

    Returns None if the message doesn't parse into a usable contract.
    Returns a contract with needs_clarification=True if the query is
    recognized but incomplete.
    """
    msg = (message or "").strip()
    if not msg:
        return None

    # 1. Transformation
    transformation, matched_patterns = _detect_transformation(msg)

    # 2. Metric / fact
    metric, fact = _detect_metric_fact(msg)

    # 3. Entity / scope
    entity = _detect_entity(msg)

    # 4. Operators
    ops = _extract_operators(msg)

    # 5. Timeframe
    tf_type, tf_value = _detect_timeframe(msg)

    # 6. Continuity — inherit from prior state
    is_continuation = _is_continuity_query(msg)
    if is_continuation and prior_state:
        active = prior_state.get("active_context") or {}
        if not entity and active.get("entity", {}).get("type"):
            entity = active["entity"]["type"]
        if not metric and active.get("metric", {}).get("key"):
            metric = active["metric"]["key"]
        if not tf_type and active.get("timeframe", {}).get("type"):
            tf_type = active["timeframe"]["type"]
            tf_value = active["timeframe"].get("value")

    # Infer implicit transformations when none was explicitly detected
    if transformation is None:
        if ops.get("sort_direction") or ops.get("limit"):
            transformation = "rank"
            matched_patterns.append("rank_inferred_from_operators")
        elif ops.get("group_by"):
            transformation = "breakout"
            matched_patterns.append("breakout_inferred_from_group_by")
        elif ops.get("filters"):
            transformation = "filter"
            matched_patterns.append("filter_inferred_from_operators")

    # Require at least a metric/fact or a recognized transformation to proceed
    if not metric and not fact and not transformation and not is_continuation:
        return None

    # Default sort_by to metric when ranking
    sort_by = ops.get("sort_by") or metric

    contract = MeridianStructuredContract(
        entity=entity,
        metric=metric,
        fact=fact,
        transformation=transformation,
        group_by=ops.get("group_by"),
        aggregation=ops.get("aggregation"),
        filters=ops.get("filters", []),
        sort_by=sort_by,
        sort_direction=ops.get("sort_direction"),
        limit=ops.get("limit"),
        timeframe_type=tf_type or ("latest" if not tf_value else None),
        timeframe_value=tf_value,
        needs_clarification=False,
        _matched_patterns=matched_patterns,
    )

    return contract
