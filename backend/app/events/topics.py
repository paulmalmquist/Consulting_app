"""Kafka topic names for Winston event streams.

Versioned suffix (``.v1``) so the envelope schema can evolve without breaking
existing consumers. New domains add a constant here, a BigQuery table, and one
routing entry in the sink worker.
"""

from __future__ import annotations


class Topics:
    EXECUTIONS = "winston.executions.v1"
    HR_SIGNALS = "winston.hr.signals.v1"
    HR_POLYMARKET_MARKETS = "winston.hr.polymarket.markets.v1"
    HR_POLYMARKET_RAW = "winston.hr.polymarket.raw.v1"
    HR_POLYMARKET_FEATURES = "winston.hr.polymarket.features.v1"
    HR_POLYMARKET_FORECASTS = "winston.hr.polymarket.forecasts.v1"
    DEAD_LETTER = "winston.dead-letter.v1"
