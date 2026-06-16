from unittest.mock import MagicMock

import pytest

from app.events.sink_worker import EventSinkWorker, configured_topics
from app.events.topics import Topics
from app.events.protobuf_codec import build_confluent_conf


def test_configured_topics_defaults_include_polymarket_raw():
    assert Topics.HR_POLYMARKET_RAW in configured_topics("")


def test_configured_topics_uses_explicit_csv():
    assert configured_topics("one.v1, two.v1") == ["one.v1", "two.v1"]


def test_sink_commits_only_after_processor_returns():
    order = []
    message = MagicMock()
    message.value.return_value = b"wire"
    consumer = MagicMock()

    def processor(raw):
        assert raw == b"wire"
        order.append("processed")
        return {"status": "ok"}

    consumer.commit.side_effect = lambda **_: order.append("committed")
    result = EventSinkWorker(
        consumer=consumer,
        processor=processor,
    ).process_message(message)

    assert result == {"status": "ok"}
    assert order == ["processed", "committed"]


def test_sink_does_not_commit_when_processor_raises():
    message = MagicMock()
    message.value.return_value = b"wire"
    consumer = MagicMock()

    def processor(_raw):
        raise RuntimeError("write failed")

    worker = EventSinkWorker(consumer=consumer, processor=processor)

    with pytest.raises(RuntimeError, match="write failed"):
        worker.process_message(message)

    consumer.commit.assert_not_called()


def test_confluent_credentials_can_be_read_from_secret_files(
    monkeypatch,
    tmp_path,
):
    bootstrap = tmp_path / "bootstrap"
    api_key = tmp_path / "key"
    api_secret = tmp_path / "secret"
    bootstrap.write_text("pkc.example:9092\n", encoding="utf-8")
    api_key.write_text("key\n", encoding="utf-8")
    api_secret.write_text("secret\n", encoding="utf-8")
    monkeypatch.delenv("CONFLUENT_BOOTSTRAP_SERVERS", raising=False)
    monkeypatch.delenv("CONFLUENT_API_KEY", raising=False)
    monkeypatch.delenv("CONFLUENT_API_SECRET", raising=False)
    monkeypatch.setenv("CONFLUENT_BOOTSTRAP_SERVERS_FILE", str(bootstrap))
    monkeypatch.setenv("CONFLUENT_API_KEY_FILE", str(api_key))
    monkeypatch.setenv("CONFLUENT_API_SECRET_FILE", str(api_secret))

    config = build_confluent_conf()

    assert config["bootstrap.servers"] == "pkc.example:9092"
    assert config["sasl.username"] == "key"
    assert config["sasl.password"] == "secret"
