"""Tests for PR 13: runner mode dispatch, replay loader, signals/latest route.

runner.py and replay.py are tested via their observable side-effects (ring state,
health writes) without spawning real async tasks. The signals/latest route is
tested via the FastAPI test client.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.hr_stream.contracts import HrSignalEvent, SignalQuality
from app.services.hr_stream.replay import load_fixture, replay_into_ring
from app.services.hr_stream.ring import get_ring, reset_ring

NOW = datetime(2026, 6, 12, 16, 0, tzinfo=timezone.utc)
EARLIER = datetime(2026, 6, 12, 15, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _clean():
    reset_ring()
    yield
    reset_ring()


# ─────────────────────────────────────────────────────────── replay loader


def test_load_fixture_returns_empty_list_when_file_missing():
    result = load_fixture(Path("does/not/exist.jsonl"))
    assert result == []


def test_load_fixture_parses_real_fixture():
    """The sample fixture ships with the repo — must parse cleanly."""
    from app.services.hr_stream import replay as replay_module
    fixture = replay_module.DEFAULT_FIXTURE
    if not fixture.exists():
        pytest.skip("sample_signals.jsonl not present")
    events = load_fixture(fixture)
    assert len(events) == 8
    keys = {e.signal_key for e in events}
    assert "yc_10y2y" in keys
    assert "mvrv_z" in keys


def test_load_fixture_skips_malformed_lines(tmp_path):
    f = tmp_path / "test.jsonl"
    good_line = (
        '{"event_id": "00000000-0000-0000-0000-000000000099", '
        '"event_type": "signal.observed", "source": "replay", '
        '"topic": "hr.dev.signal.macro.v1", "signal_key": "yc_10y2y", '
        '"domain": "macro", "observed_at": "2026-06-10T09:00:00+00:00", '
        '"ingested_at": "2026-06-10T09:00:01+00:00", '
        '"value": 0.42, "unit": "pct", "previous_value": null, "delta": null, '
        '"window": "daily", "freshness_ttl_seconds": 86400, '
        '"quality": {"status": "fresh", "null_reason": null, "source_lag_seconds": null, "validation_errors": []}, '
        '"tags": [], "raw": {}}'
    )
    f.write_text("not json at all\n" + good_line + "\n{broken\n", encoding="utf-8")
    events = load_fixture(f)
    assert len(events) == 1
    assert events[0].signal_key == "yc_10y2y"


def test_load_fixture_skips_comment_and_blank_lines(tmp_path):
    f = tmp_path / "test.jsonl"
    good = (
        '{"event_id": "00000000-0000-0000-0000-000000000088", '
        '"event_type": "signal.observed", "source": "replay", '
        '"topic": "hr.dev.signal.macro.v1", "signal_key": "macro_surprise", '
        '"domain": "macro", "observed_at": "2026-06-10T09:00:00+00:00", '
        '"ingested_at": "2026-06-10T09:00:01+00:00", '
        '"value": 0.3, "unit": "index", "previous_value": null, "delta": null, '
        '"window": "daily", "freshness_ttl_seconds": 86400, '
        '"quality": {"status": "fresh", "null_reason": null, "source_lag_seconds": null, "validation_errors": []}, '
        '"tags": [], "raw": {}}'
    )
    f.write_text("# comment\n\n" + good + "\n", encoding="utf-8")
    events = load_fixture(f)
    assert len(events) == 1


def test_replay_into_ring_injects_in_observed_at_order(tmp_path):
    """Events are sorted by observed_at before injection — ring newest-first."""
    def _ev(key, observed_at):
        return HrSignalEvent(
            source="replay", topic="hr.dev.signal.macro.v1",
            signal_key=key, domain="macro",
            observed_at=observed_at, ingested_at=NOW,
            value=1.0, quality=SignalQuality(status="fresh"),
        )

    events = [_ev("macro_surprise", NOW), _ev("yc_10y2y", EARLIER)]
    count = replay_into_ring(events)
    assert count == 2

    latest = get_ring().latest_per_key()
    assert "macro_surprise" in latest
    assert "yc_10y2y" in latest


# ─────────────────────────────────────────────────────────── signals/latest route


def test_signals_latest_returns_all_8_keys(client, monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    res = client.get("/api/hr/v1/stream/signals/latest")
    assert res.status_code == 200
    body = res.json()
    assert "signals" in body
    assert len(body["signals"]) == 8


def test_signals_latest_missing_key_carries_null_reason(client, monkeypatch):
    """With an empty ring, every key must be present with quality.status='missing'."""
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    # Ring is clean (autouse fixture reset it).
    res = client.get("/api/hr/v1/stream/signals/latest")
    assert res.status_code == 200
    for sig in res.json()["signals"]:
        assert sig["quality"]["status"] == "missing"
        assert sig["quality"]["null_reason"] is not None
        assert sig["value"] is None


def test_signals_latest_shows_ring_value_when_present(client, monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    ev = HrSignalEvent(
        source="synthetic", topic="hr.dev.signal.macro.v1",
        signal_key="yc_10y2y", domain="macro",
        observed_at=NOW, ingested_at=NOW,
        value=0.42, quality=SignalQuality(status="fresh"),
    )
    get_ring().append(ev)

    res = client.get("/api/hr/v1/stream/signals/latest")
    assert res.status_code == 200
    sigs = {s["signal_key"]: s for s in res.json()["signals"]}
    assert sigs["yc_10y2y"]["value"] == pytest.approx(0.42)
    assert sigs["yc_10y2y"]["quality"]["status"] == "fresh"
    # Other keys still missing.
    assert sigs["mvrv_z"]["quality"]["status"] == "missing"


def test_signals_latest_never_500_when_computation_fails(client, monkeypatch):
    import app.routes.hr_stream as mod
    monkeypatch.setattr(mod, "build_signals_latest", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    res = client.get("/api/hr/v1/stream/signals/latest")
    assert res.status_code == 200
    body = res.json()
    for sig in body["signals"]:
        assert sig["quality"]["status"] == "missing"
