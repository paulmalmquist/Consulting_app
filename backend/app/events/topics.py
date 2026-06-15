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
    DEAD_LETTER = "winston.dead-letter.v1"


class EventTypes:
    """Canonical event_type strings. Kept here so producers and any future
    type-aware routing share one source of truth."""

    EXECUTION_STARTED = "execution.started"
    EXECUTION_COMPLETED = "execution.completed"
    EXECUTION_FAILED = "execution.failed"
    # History Rhymes (Phase 5A)
    HR_SIGNAL_OBSERVED = "hr.signal.observed"
    HR_SIGNAL_BUNDLE_RECEIVED = "hr.signal.bundle_received"
