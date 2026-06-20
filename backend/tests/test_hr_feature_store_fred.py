"""B2 tests: FRED connector (registry / client key-gating / normalizer) + the
silver loader + cadence-aware freshness. Fixtures only — NO network in any test.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.hr_feature_store.connectors.fred import client as fred_client
from app.services.hr_feature_store.connectors.fred import normalizer as fred_norm
from app.services.hr_feature_store.connectors.fred import series_registry as reg
from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER
from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store import loader as fs_loader
from app.services.hr_feature_store.loader import (
    SILVER_UPSERT_SQL,
    silver_reading_to_params,
    update_pipeline_status,
    upsert_silver_readings,
)

FIXTURE = Path(__file__).parent / "fixtures" / "hr_feature_store" / "fred" / "T10Y2Y.json"
FRED_JSON = json.loads(FIXTURE.read_text(encoding="utf-8"))


# ── Series registry ───────────────────────────────────────────────────────────

def test_registry_keys_are_canonical_quant_names():
    for name, meta in reg.FRED_SERIES.items():
        assert name in QUANT_FEATURE_ORDER, f"{name} is not a canonical quant slot"
        assert meta["series_id"]
        assert meta["cadence"] in ("daily", "weekly", "monthly", "event")


def test_canonical_for_series_id_roundtrip():
    assert reg.canonical_for_series_id("T10Y2Y") == "yield_curve_10y2y"
    assert reg.canonical_for_series_id("NOPE") is None


# ── Client key-gating (no network) ────────────────────────────────────────────

def test_client_raises_without_key(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    monkeypatch.delenv("FRED_API_KEY_FILE", raising=False)
    with pytest.raises(fred_client.FredConfigError):
        fred_client.fetch_observations("T10Y2Y")  # raises before any HTTP


# ── Normalizer (pure) ─────────────────────────────────────────────────────────

def test_normalizer_maps_and_preserves_missing_as_null():
    rows = fred_norm.normalize_observations("yield_curve_10y2y", FRED_JSON, source_quality="fixture")
    assert len(rows) == 5
    by_date = {r["ts_source"][:10]: r for r in rows}
    # numeric obs
    good = by_date["2026-06-08"]
    assert good["value"] == 0.52
    assert good["null_reason"] is None
    assert good["connector"] == "fred"
    assert good["series_key"] == "yield_curve_10y2y"
    assert good["source_quality"] == "fixture"
    assert good["provenance"]["series_id"] == "T10Y2Y"
    # missing obs ('.') → None, NOT zero
    missing = by_date["2026-06-10"]
    assert missing["value"] is None
    assert missing["value"] != 0
    assert missing["null_reason"] == "fred_missing_value"
    assert missing["quality_flag"] == "missing"


# ── Silver loader ─────────────────────────────────────────────────────────────

def test_silver_upsert_sql_idempotent_shape():
    assert "ON CONFLICT (connector, series_key, ts_source) DO UPDATE" in SILVER_UPSERT_SQL
    assert "RETURNING (xmax = 0) AS inserted" in SILVER_UPSERT_SQL


def test_silver_params_preserve_null_and_provenance():
    rows = fred_norm.normalize_observations("yield_curve_10y2y", FRED_JSON, source_quality="fixture")
    missing = next(r for r in rows if r["ts_source"].startswith("2026-06-10"))
    p = silver_reading_to_params(missing)
    assert p["value"] is None  # never coerced to 0
    assert p["null_reason"] == "fred_missing_value"
    assert p["source_quality"] == "fixture"
    assert json.loads(p["provenance"])["series_id"] == "T10Y2Y"


def test_silver_upsert_tally(fake_cursor):
    fake_cursor.push_result([{"inserted": True}])
    fake_cursor.push_result([{"inserted": False}])
    rows = fred_norm.normalize_observations("yield_curve_10y2y", FRED_JSON)[:2]
    counts = upsert_silver_readings(rows)
    assert counts["inserted"] == 1 and counts["updated"] == 1 and counts["unavailable"] == 0


def test_silver_upsert_unavailable(monkeypatch):
    import app.db as appdb

    monkeypatch.setattr(appdb, "get_cursor", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no db")))
    rows = fred_norm.normalize_observations("yield_curve_10y2y", FRED_JSON)
    counts = upsert_silver_readings(rows)
    assert counts["unavailable"] == len(rows)


def test_silver_upsert_skips_incomplete_rows():
    counts = upsert_silver_readings([{"connector": "fred", "series_key": "x"}])  # no ts_source
    assert counts["skipped"] == 1


def test_update_pipeline_status_unavailable(monkeypatch):
    import app.db as appdb

    monkeypatch.setattr(appdb, "get_cursor", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no db")))
    assert update_pipeline_status("fred", "yield_curve_10y2y", "fresh") is False


# ── Cadence-aware freshness ───────────────────────────────────────────────────

def test_compute_status_fresh_vs_stale_vs_unavailable():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    fresh_as_of = datetime(2026, 6, 15, tzinfo=timezone.utc)
    stale_as_of = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert compute_status(fresh_as_of, now, "daily")[0] == "fresh"
    assert compute_status(stale_as_of, now, "daily")[0] == "stale"
    # weekly cadence tolerates a longer lag
    assert compute_status(datetime(2026, 6, 10, tzinfo=timezone.utc), now, "weekly")[0] == "fresh"
    assert compute_status(None, now, "daily") == ("unavailable", None)


# ── Scope guards ──────────────────────────────────────────────────────────────

def test_no_episode_embeddings_or_ade_in_fred_sources():
    for mod in (fred_client, fred_norm, reg, fs_loader):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "episode_embeddings" not in src
        assert "ade_connectors" not in src
        assert "cre_source_registry" not in src
