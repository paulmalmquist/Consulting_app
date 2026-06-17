"""Kafka topic names for Winston event streams.

Versioned suffix (``.v1``) so the envelope schema can evolve without breaking
existing consumers. New domains add a constant here, a BigQuery table, and one
routing entry in the sink worker.
"""

from __future__ import annotations


class Topics:
    EXECUTIONS = "winston.executions.v1"
    HR_SIGNALS = "winston.hr.signals.v1"
    # History Rhymes feature-store lane (B7 infra). Constants only — connector
    # publishing is wired in a later runtime PR; today connectors write SILVER
    # directly to Postgres. The observational sink may route these to BigQuery.
    HR_FEATURE_STORE_READINGS = "winston.hr.feature_store.readings.v1"
    HR_FEATURE_STORE_PIPELINE_STATUS = "winston.hr.feature_store.pipeline_status.v1"
    HR_FEATURE_STORE_MATERIALIZED = "winston.hr.feature_store.materialized.v1"
    DEAD_LETTER = "winston.dead-letter.v1"
