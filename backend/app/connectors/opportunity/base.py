from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from hashlib import sha256
from time import perf_counter
from typing import Any, Callable


THEME_CATALOG: dict[str, dict[str, Any]] = {
    "rates_easing": {
        "label": "Rates Easing",
        "keywords": ["fed", "rate cut", "rates", "treasury", "yield", "soft landing"],
        "sector": "macro",
        "geography": "United States",
    },
    "construction_cost_pressure": {
        "label": "Construction Cost Pressure",
        "keywords": ["construction", "lumber", "copper", "cement", "tariff", "materials"],
        "sector": "construction",
        "geography": "United States",
    },
    "labor_tightness": {
        "label": "Labor Tightness",
        "keywords": ["labor", "jobs", "unemployment", "wage", "payroll"],
        "sector": "macro",
        "geography": "United States",
    },
    "housing_demand_sunbelt": {
        "label": "Sun Belt Housing Demand",
        "keywords": ["housing", "rent", "multifamily", "sun belt", "migration"],
        "sector": "real_estate",
        "geography": "Sun Belt",
    },
    "commercial_distress": {
        "label": "Commercial Distress",
        "keywords": ["office", "delinquency", "default", "cmbs", "distress", "vacancy"],
        "sector": "real_estate",
        "geography": "United States",
    },
    "inflation_cooling": {
        "label": "Inflation Cooling",
        "keywords": ["inflation", "cpi", "ppi", "prices"],
        "sector": "macro",
        "geography": "United States",
    },
    "storm_risk": {
        "label": "Storm Risk",
        "keywords": ["storm", "hurricane", "flood", "wildfire", "catastrophe"],
        "sector": "real_estate",
        "geography": "Coastal US",
    },
}


@dataclass(slots=True)
class OpportunityConnectorContext:
    run_id: str
    source_key: str
    mode: str
    as_of_date: date
    filters: dict[str, Any]


@dataclass(slots=True)
class OpportunityConnectorResult:
    source_key: str
    rows_read: int
    rows_written: int
    duration_ms: int


class BaseOpportunityConnector:
    def __init__(
        self,
        *,
        source_key: str,
        fetch_fn: Callable[[OpportunityConnectorContext], Any],
        parse_fn: Callable[[Any, OpportunityConnectorContext], list[dict[str, Any]]],
        load_fn: Callable[[list[dict[str, Any]], OpportunityConnectorContext], int],
    ):
        self.source_key = source_key
        self._fetch = fetch_fn
        self._parse = parse_fn
        self._load = load_fn

    def run(self, context: OpportunityConnectorContext) -> tuple[list[dict[str, Any]], OpportunityConnectorResult]:
        started = perf_counter()
        raw = self._fetch(context)
        parsed = self._parse(raw, context)
        rows_written = self._load(parsed, context)
        duration_ms = int((perf_counter() - started) * 1000)
        return parsed, OpportunityConnectorResult(
            source_key=self.source_key,
            rows_read=len(parsed),
            rows_written=rows_written,
            duration_ms=duration_ms,
        )


def clamp_probability(value: Any, default: float = 0.5) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if numeric > 1:
        numeric = numeric / 100.0
    return max(0.01, min(0.99, numeric))


def deterministic_probability(seed: str, low: float = 0.32, high: float = 0.78) -> float:
    digest = sha256(seed.encode("utf-8")).hexdigest()
    fraction = (int(digest[:8], 16) % 10_000) / 10_000
    return round(low + ((high - low) * fraction), 4)


def canonicalize_market(title: str, *, default_topic: str = "rates_easing") -> dict[str, Any]:
    lowered = title.lower()
    best_topic = default_topic
    best_hits = 0
    for topic, meta in THEME_CATALOG.items():
        hits = sum(1 for keyword in meta["keywords"] if keyword in lowered)
        if hits > best_hits:
            best_topic = topic
            best_hits = hits
    meta = THEME_CATALOG[best_topic]
    return {
        "canonical_topic": best_topic,
        "topic_label": meta["label"],
        "sector": meta["sector"],
        "geography": meta["geography"],
    }


def make_signal_key(*, source_key: str, market_id: str, canonical_topic: str) -> str:
    return f"{source_key}:{market_id}:{canonical_topic}"


def infer_direction(probability: float) -> str:
    if probability >= 0.6:
        return "bullish"
    if probability <= 0.4:
        return "bearish"
    return "neutral"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
