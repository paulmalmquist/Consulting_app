"""Unified Metric Registry — single source of truth for all metric contracts.

Loads from semantic_metric_def (including routing columns from 447/448 migrations),
builds a synonym map for NLP extraction, and validates the schema at startup.

Usage:
    from app.services.unified_metric_registry import get_registry
    registry = get_registry()
    contract = registry.resolve("gross irr")   # alias → MetricContract
    results = registry.list_for_family("returns")
"""

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, ClassVar

from app.sql_agent.query_templates import _ALL_TEMPLATES

log = logging.getLogger(__name__)

# ── Stop words excluded from display_name synonym generation ─────────
_STOP_WORDS = frozenset({
    "a", "an", "the", "of", "to", "in", "for", "and", "or", "by",
    "per", "as", "at", "on", "is", "it", "vs", "from", "with", "over",
    "than", "into",
})

# ── Service dispatch map — service_function keys to callables ────────
# Populated lazily on first use to avoid circular imports.
_SERVICE_MAP: dict[str, Any] | None = None


def _get_service_map() -> dict[str, Any]:
    global _SERVICE_MAP
    if _SERVICE_MAP is None:
        from app.services.re_env_portfolio import get_portfolio_kpis
        from app.services.re_fund_metrics import get_fund_metrics
        _SERVICE_MAP = {
            "portfolio_kpis": get_portfolio_kpis,
            "fund_metrics": get_fund_metrics,
        }
    return _SERVICE_MAP


# ── MetricContract dataclass ─────────────────────────────────────────

@dataclass(frozen=True)
class MetricContract:
    """Immutable contract for a single metric in the registry."""
    metric_key: str
    display_name: str
    description: str | None
    aliases: tuple[str, ...]
    metric_family: str | None
    query_strategy: str       # template | semantic | service | computed
    template_key: str | None
    service_function: str | None
    sql_template: str | None
    unit: str
    aggregation: str
    format_hint_fe: str | None
    polarity: str
    entity_key: str | None
    allowed_breakouts: tuple[str, ...]
    time_behavior: str


# ── UnifiedMetricRegistry ────────────────────────────────────────────

class UnifiedMetricRegistry:
    """Cached singleton registry of all metric contracts.

    Loaded from semantic_metric_def at startup. Provides:
    - resolve(key_or_alias) → MetricContract | None
    - list_for_entity(entity_key) → list[MetricContract]
    - list_for_family(family) → list[MetricContract]
    - list_all() → list[MetricContract]
    - extract_from_text(text) → dict | None   (NLP extraction)
    - validate_schema(cur) → list[str]         (startup checks)
    """

    _instance: ClassVar[UnifiedMetricRegistry | None] = None

    def __init__(self, metrics: list[MetricContract]) -> None:
        self._metrics = metrics
        self._by_key: dict[str, MetricContract] = {}
        self._synonyms: dict[str, str] = {}  # lowered alias → canonical key
        self._by_family: dict[str, list[MetricContract]] = defaultdict(list)
        self._by_entity: dict[str, list[MetricContract]] = defaultdict(list)

        for m in metrics:
            key_lower = m.metric_key.lower()
            self._by_key[key_lower] = m
            self._synonyms[key_lower] = key_lower

            if m.metric_family:
                self._by_family[m.metric_family].append(m)
            if m.entity_key:
                self._by_entity[m.entity_key].append(m)

            # Register aliases from DB column (authoritative)
            for alias in m.aliases:
                alias_lower = alias.lower().strip()
                if alias_lower:
                    self._synonyms[alias_lower] = key_lower

            # Augment with display_name tokens (fallback)
            if m.display_name:
                dn_lower = m.display_name.lower()
                self._synonyms[dn_lower] = key_lower
                for word in dn_lower.split():
                    if len(word) >= 4 and word not in _STOP_WORDS:
                        # Only add if not already claimed by another metric
                        self._synonyms.setdefault(word, key_lower)

        # Pre-sort synonym patterns longest-first for NLP extraction
        self._sorted_patterns = sorted(
            self._synonyms.keys(), key=len, reverse=True,
        )
        self._pattern_re = self._build_extraction_regex()

    def _build_extraction_regex(self) -> re.Pattern[str] | None:
        if not self._sorted_patterns:
            return None
        escaped = [re.escape(p) for p in self._sorted_patterns]
        return re.compile(r"\b(" + "|".join(escaped) + r")\b", re.IGNORECASE)

    # ── Lookup methods ───────────────────────────────────────────────

    def resolve(self, key_or_alias: str) -> MetricContract | None:
        """Resolve a metric key or alias to its contract."""
        canonical = self._synonyms.get(key_or_alias.lower().strip())
        if canonical:
            return self._by_key.get(canonical)
        return None

    def list_for_entity(self, entity_key: str) -> list[MetricContract]:
        return list(self._by_entity.get(entity_key, []))

    def list_for_family(self, family: str) -> list[MetricContract]:
        return list(self._by_family.get(family, []))

    def list_all(self) -> list[MetricContract]:
        return list(self._metrics)

    @property
    def metric_keys(self) -> list[str]:
        return [m.metric_key for m in self._metrics]

    @property
    def has_data(self) -> bool:
        return len(self._metrics) > 0

    # ── NLP extraction ───────────────────────────────────────────────

    def extract_from_text(self, text: str) -> dict[str, Any] | None:
        """Extract a metric reference from natural language text.

        Returns {normalized, raw, confidence, source, metric_family} or None.
        """
        if not self._pattern_re:
            return None
        match = self._pattern_re.search(text.lower())
        if not match:
            return None
        raw = match.group(0)
        canonical = self._synonyms.get(raw)
        if not canonical:
            return None
        contract = self._by_key.get(canonical)
        if not contract:
            return None
        return {
            "normalized": canonical,
            "raw": raw,
            "confidence": 0.92,
            "source": "unified_registry",
            "metric_family": contract.metric_family,
        }

    # ── Schema validation ────────────────────────────────────────────

    def validate_schema(self, cur: Any | None = None) -> list[str]:
        """Validate that all metrics have valid routing configuration.

        If a cursor is provided, also validates that referenced tables exist.
        Returns a list of issue strings (empty = all good).
        """
        issues: list[str] = []

        for m in self._metrics:
            # Template strategy: template must exist
            if m.query_strategy == "template":
                if not m.template_key:
                    issues.append(f"{m.metric_key}: template strategy but no template_key")
                elif m.template_key not in _ALL_TEMPLATES:
                    issues.append(f"{m.metric_key}: template_key '{m.template_key}' not found in query_templates")

            # Service strategy: function must be in dispatch map
            elif m.query_strategy == "service":
                if not m.service_function:
                    issues.append(f"{m.metric_key}: service strategy but no service_function")
                else:
                    try:
                        svc_map = _get_service_map()
                        if m.service_function not in svc_map:
                            issues.append(f"{m.metric_key}: service_function '{m.service_function}' not in dispatch map")
                    except Exception as e:
                        issues.append(f"{m.metric_key}: cannot import service map: {e}")

            # Semantic strategy: must have sql_template and entity_key
            elif m.query_strategy == "semantic":
                if not m.sql_template:
                    issues.append(f"{m.metric_key}: semantic strategy but no sql_template")
                if not m.entity_key:
                    issues.append(f"{m.metric_key}: semantic strategy but no entity_key")

            # Aliases: every metric should have at least one
            if not m.aliases:
                issues.append(f"{m.metric_key}: no aliases defined (NLP extraction will miss this metric)")

            # Family: should be set
            if not m.metric_family:
                issues.append(f"{m.metric_key}: no metric_family defined")

        # Optional: validate referenced tables exist in DB
        if cur is not None:
            entity_tables = set()
            for m in self._metrics:
                if m.query_strategy == "semantic" and m.entity_key:
                    entity_tables.add(m.entity_key)
            if entity_tables:
                try:
                    cur.execute(
                        """
                        SELECT entity_key, table_name
                        FROM semantic_entity_def
                        WHERE business_id = %s AND is_active = true
                          AND entity_key = ANY(%s)
                        """,
                        [self._metrics[0].metric_key, list(entity_tables)],
                    )
                except Exception:
                    pass  # best-effort; don't fail validation on query error

        return issues


# ── Singleton loader ─────────────────────────────────────────────────

def _load_from_db(business_id: str) -> list[MetricContract]:
    """Load all active metrics with routing columns from DB."""
    from app.db import get_cursor

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, display_name, description, sql_template,
                   unit, aggregation, format_hint, entity_key,
                   query_strategy, template_key, service_function,
                   aliases, metric_family, allowed_breakouts,
                   time_behavior, polarity, format_hint_fe
            FROM semantic_metric_def
            WHERE business_id = %s AND is_active = true
            ORDER BY metric_key
            """,
            [business_id],
        )
        rows = cur.fetchall()

    contracts = []
    for row in rows:
        contracts.append(MetricContract(
            metric_key=row["metric_key"].lower(),
            display_name=row["display_name"],
            description=row.get("description"),
            aliases=tuple(row.get("aliases") or []),
            metric_family=row.get("metric_family"),
            query_strategy=row.get("query_strategy", "semantic"),
            template_key=row.get("template_key"),
            service_function=row.get("service_function"),
            sql_template=row.get("sql_template"),
            unit=row["unit"],
            aggregation=row["aggregation"],
            format_hint_fe=row.get("format_hint_fe") or row.get("format_hint"),
            polarity=row.get("polarity", "up_good"),
            entity_key=row.get("entity_key"),
            allowed_breakouts=tuple(row.get("allowed_breakouts") or []),
            time_behavior=row.get("time_behavior", "point_in_time"),
        ))
    return contracts


# Default business_id for the Meridian seed environment.
_DEFAULT_BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"

_registry: UnifiedMetricRegistry | None = None


def get_registry(
    *,
    force_reload: bool = False,
    business_id: str = _DEFAULT_BUSINESS_ID,
) -> UnifiedMetricRegistry:
    """Return the cached UnifiedMetricRegistry singleton.

    On first call (or force_reload), loads from DB.
    Degrades gracefully to an empty registry if DB is unavailable.
    """
    global _registry
    if _registry is not None and not force_reload:
        return _registry

    t0 = time.monotonic()
    try:
        contracts = _load_from_db(business_id)
        _registry = UnifiedMetricRegistry(contracts)
        elapsed = (time.monotonic() - t0) * 1000
        log.info(
            "Unified metric registry loaded: %d metrics in %.1f ms",
            len(contracts), elapsed,
        )
    except Exception as exc:
        log.warning("Failed to load metric registry: %s — using empty registry", exc)
        _registry = UnifiedMetricRegistry([])

    return _registry
