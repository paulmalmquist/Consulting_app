"""History Rhymes stream configuration.

Unlike ``app/events/config.py`` (read once at import), these are call-time
getters so pytest can monkeypatch the environment without reload tricks.
Default mode is ``off``: no background task, no broker contact, health
endpoint reports ``not_configured``.
"""

from __future__ import annotations

import os

VALID_MODES = ("off", "synthetic", "replay", "live_kafka")
VALID_PROVIDERS = ("confluent", "google")


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


def stream_mode() -> str:
    """Active HR stream mode. Unrecognized values fail closed to ``off``."""
    raw = _clean(os.getenv("HR_STREAM_MODE", "off")).lower()
    return raw if raw in VALID_MODES else "off"


def kafka_provider() -> str:
    """Broker provider branch. ``google`` means whatever GCP Kafka-compatible
    deployment is configured — semantics confirmed per deployment (PR 11)."""
    raw = _clean(os.getenv("HR_KAFKA_PROVIDER", "confluent")).lower()
    return raw if raw in VALID_PROVIDERS else "confluent"


def kafka_bootstrap() -> str:
    return _clean(os.getenv("HR_KAFKA_BOOTSTRAP", ""))


def kafka_api_key() -> str:
    # Env only — never read from the local credential JSON file.
    return _clean(os.getenv("HR_KAFKA_API_KEY", ""))


def kafka_api_secret() -> str:
    return _clean(os.getenv("HR_KAFKA_API_SECRET", ""))


def kafka_sasl_mechanism() -> str:
    return _clean(os.getenv("HR_KAFKA_SASL_MECHANISM", "PLAIN")) or "PLAIN"


def kafka_schema_registry_url() -> str:
    return _clean(os.getenv("HR_KAFKA_SCHEMA_REGISTRY_URL", ""))


def consumer_group() -> str:
    return _clean(os.getenv("HR_KAFKA_CONSUMER_GROUP", "hr-cockpit-dev")) or "hr-cockpit-dev"


def topic_prefix() -> str:
    return _clean(os.getenv("HR_KAFKA_TOPIC_PREFIX", "hr.dev")) or "hr.dev"


def synthetic_tick_seconds() -> float:
    """Synthetic generator tick interval; floor at 1s so a typo cannot busy-loop."""
    try:
        return max(1.0, float(os.getenv("HR_STREAM_SYNTHETIC_TICK_SECONDS", "5")))
    except ValueError:
        return 5.0
