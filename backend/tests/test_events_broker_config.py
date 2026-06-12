"""Tests for the Phase 3B cloud-broker transport config.

Covers the SASL/SSL security-config layer added so the existing KafkaTransport
can speak to a managed broker (Confluent Cloud) as well as local Redpanda.

No broker, no credentials, no network — every test asserts pure config
resolution and the fail-closed default. This is the CI path.
"""

from unittest.mock import patch

from app.events import config as events_config
from app.events import transport as events_transport


# ── producer_security_config: default-off (local Redpanda) ───────────────────

def test_security_config_empty_for_plaintext():
    """Default protocol PLAINTEXT yields no security keys — local dev untouched."""
    with patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "PLAINTEXT"):
        assert events_config.producer_security_config() == {}


def test_security_config_sasl_ssl_full():
    """SASL_SSL surfaces protocol + mechanism + api key/secret for Confluent."""
    with patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SASL_SSL"), \
         patch.object(events_config, "EVENTS_SASL_MECHANISM", "PLAIN"), \
         patch.object(events_config, "EVENTS_SASL_USERNAME", "API_KEY"), \
         patch.object(events_config, "EVENTS_SASL_PASSWORD", "API_SECRET"):
        cfg = events_config.producer_security_config()
    assert cfg == {
        "security.protocol": "SASL_SSL",
        "sasl.mechanisms": "PLAIN",
        "sasl.username": "API_KEY",
        "sasl.password": "API_SECRET",
    }


def test_security_config_ssl_only_no_sasl_keys():
    """Plain SSL (mTLS-style) sets protocol but no SASL username/password."""
    with patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SSL"):
        cfg = events_config.producer_security_config()
    assert cfg == {"security.protocol": "SSL"}
    assert "sasl.username" not in cfg


def test_security_config_sasl_plaintext_carries_credentials():
    with patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SASL_PLAINTEXT"), \
         patch.object(events_config, "EVENTS_SASL_MECHANISM", "SCRAM-SHA-256"), \
         patch.object(events_config, "EVENTS_SASL_USERNAME", "u"), \
         patch.object(events_config, "EVENTS_SASL_PASSWORD", "p"):
        cfg = events_config.producer_security_config()
    assert cfg["security.protocol"] == "SASL_PLAINTEXT"
    assert cfg["sasl.mechanisms"] == "SCRAM-SHA-256"


# ── transport resolution still fail-closed with broker security set ──────────

def test_transport_noop_when_disabled_even_with_sasl_configured():
    """SASL creds present but EVENTS_ENABLED=false must still resolve to noop."""
    events_transport.reset_transport()
    with patch.object(events_config, "EVENTS_ENABLED", False), \
         patch.object(events_config, "EVENTS_BROKER_URL", "pkc-x.confluent.cloud:9092"), \
         patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SASL_SSL"), \
         patch.object(events_config, "EVENTS_SASL_USERNAME", "k"), \
         patch.object(events_config, "EVENTS_SASL_PASSWORD", "s"):
        assert events_transport.get_transport().name == "noop"
    events_transport.reset_transport()


def test_transport_noop_when_confluent_kafka_absent():
    """Enabled + broker + SASL but no confluent-kafka installed → fail closed."""
    events_transport.reset_transport()
    with patch.object(events_config, "EVENTS_ENABLED", True), \
         patch.object(events_config, "EVENTS_TRANSPORT", "auto"), \
         patch.object(events_config, "EVENTS_BROKER_URL", "pkc-x.confluent.cloud:9092"), \
         patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SASL_SSL"), \
         patch.object(events_config, "EVENTS_SASL_USERNAME", "k"), \
         patch.object(events_config, "EVENTS_SASL_PASSWORD", "s"), \
         patch.object(
             events_transport.KafkaTransport,
             "__init__",
             side_effect=ImportError("no confluent_kafka"),
         ):
        # KafkaTransport construction raises (simulating missing client) → noop.
        assert events_transport.get_transport().name == "noop"
    events_transport.reset_transport()


def test_kafka_transport_applies_security_config_to_producer():
    """KafkaTransport merges producer_security_config() into the librdkafka conf."""
    captured: dict = {}

    class _FakeProducer:
        def __init__(self, conf):
            captured.update(conf)

    import sys
    import types

    fake_module = types.ModuleType("confluent_kafka")
    fake_module.Producer = _FakeProducer  # type: ignore[attr-defined]

    with patch.dict(sys.modules, {"confluent_kafka": fake_module}), \
         patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "SASL_SSL"), \
         patch.object(events_config, "EVENTS_SASL_MECHANISM", "PLAIN"), \
         patch.object(events_config, "EVENTS_SASL_USERNAME", "API_KEY"), \
         patch.object(events_config, "EVENTS_SASL_PASSWORD", "API_SECRET"):
        events_transport.KafkaTransport("pkc-x.confluent.cloud:9092", 200)

    assert captured["bootstrap.servers"] == "pkc-x.confluent.cloud:9092"
    assert captured["security.protocol"] == "SASL_SSL"
    assert captured["sasl.username"] == "API_KEY"
    assert captured["sasl.password"] == "API_SECRET"


def test_kafka_transport_plaintext_has_no_security_keys():
    """Local Redpanda path: producer config carries only bootstrap.servers."""
    captured: dict = {}

    class _FakeProducer:
        def __init__(self, conf):
            captured.update(conf)

    import sys
    import types

    fake_module = types.ModuleType("confluent_kafka")
    fake_module.Producer = _FakeProducer  # type: ignore[attr-defined]

    with patch.dict(sys.modules, {"confluent_kafka": fake_module}), \
         patch.object(events_config, "EVENTS_SECURITY_PROTOCOL", "PLAINTEXT"):
        events_transport.KafkaTransport("localhost:9092", 200)

    assert captured == {"bootstrap.servers": "localhost:9092"}
