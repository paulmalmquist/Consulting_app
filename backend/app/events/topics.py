"""Kafka topic names for Winston event streams.

Versioned suffix (``.v1``) so the envelope schema can evolve without breaking
existing consumers. New domains add a constant here, a BigQuery table, and one
routing entry in the sink worker.
"""

from __future__ import annotations


class Topics:
    EXECUTIONS = "winston.executions.v1"
    HR_SIGNALS = "winston.hr.signals.v1"
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
