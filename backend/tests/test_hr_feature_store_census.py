"""B3 tests: Census connector (registry / client params + mocked fetch /
normalizer) + silver loader + monthly-cadence freshness + dry-run ingest.
Fixtures only — NO network in any test.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from app.services.hr_feature_store.connectors.census import client as cclient
from app.services.hr_feature_store.connectors.census import normalizer as cnorm
from app.services.hr_feature_store.connectors.census import series_registry as creg
from app.services.hr_feature_store.connectors.census.config import CensusSettings
from app.services.hr_feature_store.connectors.census.ingest import run_ingest
from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER
from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import upsert_silver_readings

FIXTURE = Path(__file__).parent / "fixtures" / "hr_feature_store" / "census" / "resconst_starts.json"
CENSUS_ARRAY = json.loads(FIXTURE.read_text(encoding="utf-8"))


# ── Registry ──────────────────────────────────────────────────────────────────

def test_registry_quant_slots_valid_and_permits_is_auxiliary():
    for name, meta in creg.CENSUS_SERIES.items():
        if meta["quant_slot"] is not None:
            assert meta["quant_slot"] in QUANT_FEATURE_ORDER
        assert meta["cadence"] == "monthly"
    assert creg.CENSUS_SERIES["housing_starts_saar"]["quant_slot"] == "housing_starts_saar"
    assert creg.CENSUS_SERIES["housing_permits_saar"]["quant_slot"] is None  # auxiliary, not a spine slot


# ── Client (pure params + mocked fetch; no network) ──────────────────────────

def test_build_params_pure(monkeypatch):
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    monkeypatch.delenv("CENSUS_API_KEY_FILE", raising=False)
    params = cclient.build_params(creg.CENSUS_SERIES["housing_starts_saar"], CensusSettings())
    assert params["get"] == "cell_value,time"
    assert params["category_code"] == "STARTS"
    assert params["for"] == "us:*"
    assert "key" not in params  # public, no key


def test_fetch_series_uses_response_only(monkeypatch):
    class _Resp:
        status_code = 200

        def json(self):
            return CENSUS_ARRAY

    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp())  # no real network
    out = cclient.fetch_series(creg.CENSUS_SERIES["housing_starts_saar"], limit=24, settings=CensusSettings())
    assert isinstance(out, list) and out[0][0] == "cell_value"


# ── Normalizer (pure) ─────────────────────────────────────────────────────────

def test_normalizer_maps_and_scales_starts():
    rows = cnorm.normalize_response("housing_starts_saar", CENSUS_ARRAY, source_quality="fixture")
    by = {r["ts_source"][:10]: r for r in rows}
    good = by["2026-02-01"]
    assert good["value"] == pytest.approx(1.45)  # 1450 thousand * 0.001 → millions
    assert good["null_reason"] is None
    assert good["connector"] == "census"
    assert good["series_key"] == "housing_starts_saar"
    assert good["source_quality"] == "fixture"
    assert good["provenance"]["category_code"] == "STARTS"
    assert good["provenance"]["period"] == "2026-02"


def test_normalizer_missing_value_is_null_not_zero():
    rows = cnorm.normalize_response("housing_starts_saar", CENSUS_ARRAY)
    missing = next(r for r in rows if r["ts_source"].startswith("2026-04-01"))
    assert missing["value"] is None
    assert missing["value"] != 0
    assert missing["null_reason"] == "census_missing_value"


def test_normalizer_unexpected_shape_raises():
    with pytest.raises(cnorm.CensusShapeError):
        cnorm.normalize_response("housing_starts_saar", "not-a-list")
    with pytest.raises(cnorm.CensusShapeError):
        cnorm.normalize_response("housing_starts_saar", [["nope", "headers"]])


# ── Loader idempotency (FakeCursor) ───────────────────────────────────────────

def test_silver_upsert_tally_with_census_rows(fake_cursor):
    fake_cursor.push_result([{"inserted": True}])
    fake_cursor.push_result([{"inserted": False}])
    rows = cnorm.normalize_response("housing_starts_saar", CENSUS_ARRAY)[:2]
    counts = upsert_silver_readings(rows)
    assert counts["inserted"] == 1 and counts["updated"] == 1


# ── Monthly cadence freshness ─────────────────────────────────────────────────

def test_monthly_cadence_fresh_then_stale():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    assert compute_status(datetime(2026, 5, 12, tzinfo=timezone.utc), now, "monthly")[0] == "fresh"  # ~35d
    assert compute_status(datetime(2026, 4, 20, tzinfo=timezone.utc), now, "monthly")[0] == "stale"  # ~57d


# ── Ingest dry-run vs write (injected deps, no network/DB) ────────────────────

def test_run_ingest_dry_run_does_not_write():
    calls = {"upsert": 0, "status": 0}

    def fake_fetch(cdef, limit=None):
        return CENSUS_ARRAY

    def upsert_spy(rows):
        calls["upsert"] += 1
        return {"inserted": len(rows), "updated": 0, "skipped": 0, "unavailable": 0}

    def status_spy(*a, **k):
        calls["status"] += 1
        return True

    dry = run_ingest(series=["housing_starts_saar"], limit=24, write=False,
                     fetch_fn=fake_fetch, upsert_fn=upsert_spy, status_fn=status_spy)
    assert dry["mode"] == "dry-run"
    assert dry["series"][0]["rows"] >= 1
    assert calls == {"upsert": 0, "status": 0}

    wet = run_ingest(series=["housing_starts_saar"], limit=24, write=True,
                     fetch_fn=fake_fetch, upsert_fn=upsert_spy, status_fn=status_spy)
    assert wet["mode"] == "write"
    assert calls["upsert"] == 1 and calls["status"] == 1
    assert "counts" in wet["series"][0]


# ── Scope guards ──────────────────────────────────────────────────────────────

def test_no_episode_embeddings_or_ade_in_census_sources():
    for mod in (cclient, cnorm, creg):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "episode_embeddings" not in src
        assert "ade_connectors" not in src
        assert "cre_source_registry" not in src
