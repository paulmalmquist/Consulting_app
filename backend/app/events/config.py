"""Event-streaming configuration.

Self-contained so it does not bloat ``app/config.py``. Mirrors that module's
flat ``os.getenv`` pattern. Read once at import; the runtime degrades to a
no-op transport whenever the broker is not configured.
"""

from __future__ import annotations

import os


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


# Master switch. Off by default so the backbone is inert until explicitly enabled.
EVENTS_ENABLED: bool = os.getenv("EVENTS_ENABLED", "false").lower() == "true"

# Kafka bootstrap servers, e.g. "localhost:9092". Empty → no-op transport.
EVENTS_BROKER_URL: str = _clean(os.getenv("EVENTS_BROKER_URL", ""))

# auto | kafka | noop. "auto" picks kafka when enabled + broker set, else noop.
EVENTS_TRANSPORT: str = (os.getenv("EVENTS_TRANSPORT", "auto") or "auto").strip().lower()

# Hard ceiling on how long a single best-effort publish may block.
EVENTS_PUBLISH_TIMEOUT_MS: int = int(os.getenv("EVENTS_PUBLISH_TIMEOUT_MS", "200"))

# ── Broker security ──────────────────────────────────────────────────────────
# Local Redpanda needs none of this (PLAINTEXT). A managed broker such as
# Confluent Cloud needs SASL_SSL + PLAIN with an API key/secret. All empty by
# default → producer stays a plain PLAINTEXT client, so local dev is unchanged.
#
#   EVENTS_SECURITY_PROTOCOL  PLAINTEXT (default) | SASL_SSL | SASL_PLAINTEXT | SSL
#   EVENTS_SASL_MECHANISM     PLAIN (default for Confluent) | SCRAM-SHA-256 | ...
#   EVENTS_SASL_USERNAME      Confluent API key
#   EVENTS_SASL_PASSWORD      Confluent API secret (never commit; env only)
EVENTS_SECURITY_PROTOCOL: str = (
    os.getenv("EVENTS_SECURITY_PROTOCOL", "PLAINTEXT") or "PLAINTEXT"
).strip().upper()
EVENTS_SASL_MECHANISM: str = (
    os.getenv("EVENTS_SASL_MECHANISM", "PLAIN") or "PLAIN"
).strip().upper()
EVENTS_SASL_USERNAME: str = _clean(os.getenv("EVENTS_SASL_USERNAME", ""))
EVENTS_SASL_PASSWORD: str = _clean(os.getenv("EVENTS_SASL_PASSWORD", ""))


def producer_security_config() -> dict[str, str]:
    """librdkafka security settings derived from env.

    Returns the SASL/SSL keys only when a non-PLAINTEXT protocol is configured,
    so the default (local Redpanda) producer config is untouched.
    """
    if EVENTS_SECURITY_PROTOCOL == "PLAINTEXT":
        return {}
    cfg: dict[str, str] = {"security.protocol": EVENTS_SECURITY_PROTOCOL}
    if EVENTS_SECURITY_PROTOCOL in ("SASL_SSL", "SASL_PLAINTEXT"):
        cfg["sasl.mechanisms"] = EVENTS_SASL_MECHANISM
        cfg["sasl.username"] = EVENTS_SASL_USERNAME
        cfg["sasl.password"] = EVENTS_SASL_PASSWORD
    return cfg


# ── Consumer (sink worker) ───────────────────────────────────────────────────
# The long-running observational sink worker (Phase 4). Shares the broker URL +
# security config above; only the consumer group and the subscribed topics are
# consumer-specific. Defaults match the execution-events stream.
EVENTS_CONSUMER_GROUP: str = _clean(
    os.getenv("EVENTS_CONSUMER_GROUP", "")
) or "winston-bq-sink"

# Comma-separated topic list. Defaults to the executions stream.
EVENTS_CONSUMER_TOPICS: str = _clean(
    os.getenv("EVENTS_CONSUMER_TOPICS", "")
) or "winston.executions.v1"

# Where a new consumer group starts: earliest | latest. earliest so the worker
# drains a backlog rather than skipping events published before it came up.
EVENTS_CONSUMER_OFFSET_RESET: str = (
    os.getenv("EVENTS_CONSUMER_OFFSET_RESET", "earliest") or "earliest"
).strip().lower()

# Max seconds a single poll() blocks waiting for a message.
EVENTS_CONSUMER_POLL_TIMEOUT_S: float = float(
    os.getenv("EVENTS_CONSUMER_POLL_TIMEOUT_S", "1.0")
)


def consumer_config() -> dict[str, object]:
    """librdkafka consumer config (broker + security + group + offset policy).

    Offsets are committed manually (``enable.auto.commit=false``) so the worker
    only advances past a message after the sink has durably handled it.
    """
    cfg: dict[str, object] = {
        "bootstrap.servers": EVENTS_BROKER_URL,
        "group.id": EVENTS_CONSUMER_GROUP,
        "auto.offset.reset": EVENTS_CONSUMER_OFFSET_RESET,
        "enable.auto.commit": False,
    }
    cfg.update(producer_security_config())
    return cfg
