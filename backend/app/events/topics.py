"""Kafka topic names for Winston event streams.

Versioned suffix (``.v1``) so the envelope schema can evolve without breaking
existing consumers. New domains add a constant here, a BigQuery table, and one
routing entry in the sink worker.
"""

from __future__ import annotations


class Topics:
    EXECUTIONS = "winston.executions.v1"
    # History Rhymes signal stream (Phase 5A). The legacy HR_SIGNALS name is
    # kept for back-compat; HISTORY_RHYMES_SIGNALS is the active topic.
    HR_SIGNALS = "winston.hr.signals.v1"
    HISTORY_RHYMES_SIGNALS = "history-rhymes.signals.v1"
    # History Rhymes feature-store lane (B7 infra). Constants only — connector
    # publishing is wired in a later runtime PR; today connectors write SILVER
    # directly to Postgres. The observational sink may route these to BigQuery.
    HR_FEATURE_STORE_READINGS = "winston.hr.feature_store.readings.v1"
    HR_FEATURE_STORE_PIPELINE_STATUS = "winston.hr.feature_store.pipeline_status.v1"
    HR_FEATURE_STORE_MATERIALIZED = "winston.hr.feature_store.materialized.v1"
    # History Rhymes Polymarket streaming lane.
    HR_POLYMARKET_MARKETS = "winston.hr.polymarket.markets.v1"
    HR_POLYMARKET_RAW = "winston.hr.polymarket.raw.v1"
    HR_POLYMARKET_FEATURES = "winston.hr.polymarket.features.v1"
    HR_POLYMARKET_FORECASTS = "winston.hr.polymarket.forecasts.v1"
    DEAD_LETTER = "winston.dead-letter.v1"


def hr_stream_topic(prefix: str, kind: str, domain: str | None = None) -> str:
    """History Rhymes cockpit stream topics (additive beside the constants).

    ``hr_stream_topic("hr.dev", "signal", "macro")`` -> ``hr.dev.signal.macro.v1``;
    ``kind`` in {"signal", "alerts", "snapshots"} — "signal" requires a domain.
    The legacy ``Topics.HR_SIGNALS`` constant and its sink routing are untouched.
    """
    if kind == "signal":
        if not domain:
            raise ValueError("signal topics require a domain")
        return f"{prefix}.signal.{domain}.v1"
    if kind in ("alerts", "snapshots"):
        return f"{prefix}.{kind}.v1"
    raise ValueError(f"unknown hr stream topic kind: {kind!r}")


class EventTypes:
    """Canonical event_type strings. Kept here so producers and any future
    type-aware routing share one source of truth."""

    EXECUTION_STARTED = "execution.started"
    EXECUTION_COMPLETED = "execution.completed"
    EXECUTION_FAILED = "execution.failed"
    # History Rhymes (Phase 5A)
    HR_SIGNAL_OBSERVED = "hr.signal.observed"
    HR_SIGNAL_BUNDLE_RECEIVED = "hr.signal.bundle_received"
