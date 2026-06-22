"""B4 tests: VIX connector (registry / normalizer / ingest) + silver loader +
daily-cadence freshness. Spot only; term structure is unavailable, never
fabricated. Fixtures only — NO network in any test.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.hr_feature_store.connectors.vix import normalizer as vnorm
from app.services.hr_feature_store.connectors.vix import series_registry as vreg
from app.services.hr_feature_store.connectors.vix.ingest import run_ingest
from app.services.hr_feature_store.contract import QUANT_FEATURE_ORDER
from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import upsert_silver_readings

FIXTURE = Path(__file__).parent / "fixtures" / "hr_feature_store" / "vix" / "vixcls.json"
VIX_JSON = json.loads(FIXTURE.read_text(encoding="utf-8"))


# ── Registry ──────────────────────────────────────────────────────────────────

def test_registry_quant_slots_valid():
    for name, meta in vreg.VIX_SERIES.items():
        if meta["quant_slot"] is not None:
            assert meta["quant_slot"] in QUANT_FEATURE_ORDER
        assert meta["cadence"] == "daily"


def test_vix_spot_is_sourced_slot_and_term_structure_is_unavailable():
    spot = vreg.VIX_SERIES["vix_spot"]
    assert spot["quant_slot"] == "vix_spot" and spot["source_available"] is True
    term = vreg.VIX_SERIES["vix_term_structure"]
    assert term["quant_slot"] == "vix_term_structure"  # a real slot…
    assert term["source_available"] is False            # …but no source wired
    assert term["null_reason"] == "term_structure_source_not_configured"


# ── Normalizer (pure, spot only) ──────────────────────────────────────────────

def test_normalizer_maps_spot():
    rows = vnorm.normalize_spot("vix_spot", VIX_JSON, source_quality="fixture")
    by = {r["ts_source"][:10]: r for r in rows}
    good = by["2026-06-08"]
    assert good["value"] == pytest.approx(17.21)
    assert good["null_reason"] is None
    assert good["connector"] == "vix"
    assert good["series_key"] == "vix_spot"
    assert good["source_quality"] == "fixture"
    assert good["provenance"]["series_id"] == "VIXCLS"


def test_normalizer_missing_value_is_null_not_zero():
    rows = vnorm.normalize_spot("vix_spot", VIX_JSON)
    missing = next(r for r in rows if r["ts_source"].startswith("2026-06-10"))
    assert missing["value"] is None
    assert missing["value"] != 0
    assert missing["null_reason"] == "vix_missing_value"


def test_normalizer_unexpected_shape_raises():
    with pytest.raises(vnorm.VixShapeError):
        vnorm.normalize_spot("vix_spot", "not-a-dict")
    with pytest.raises(vnorm.VixShapeError):
        vnorm.normalize_spot("vix_spot", {"no_observations": []})


def test_normalizer_refuses_unsourced_series():
    # Defensive: term structure has no source → must not be normalized into rows.
    with pytest.raises(ValueError):
        vnorm.normalize_spot("vix_term_structure", VIX_JSON)


# ── Loader idempotency (FakeCursor) ───────────────────────────────────────────

def test_silver_upsert_tally_with_vix_rows(fake_cursor):
    fake_cursor.push_result([{"inserted": True}])
    fake_cursor.push_result([{"inserted": False}])
    rows = vnorm.normalize_spot("vix_spot", VIX_JSON)[:2]
    counts = upsert_silver_readings(rows)
    assert counts["inserted"] == 1 and counts["updated"] == 1


# ── Daily cadence freshness ───────────────────────────────────────────────────

def test_daily_cadence_fresh_then_stale():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    assert compute_status(datetime(2026, 6, 15, tzinfo=timezone.utc), now, "daily")[0] == "fresh"
    assert compute_status(datetime(2026, 6, 1, tzinfo=timezone.utc), now, "daily")[0] == "stale"


# ── Ingest: spot writes, term structure unavailable, dry-run no write ─────────

def _fake_fetch(vdef, limit=None):
    return VIX_JSON


def test_term_structure_reported_unavailable_never_written():
    calls = {"upsert": 0}

    def upsert_spy(rows):
        calls["upsert"] += 1
        return {"inserted": len(rows), "updated": 0, "skipped": 0, "unavailable": 0}

    out = run_ingest(write=True, fetch_fn=_fake_fetch, upsert_fn=upsert_spy, status_fn=lambda *a, **k: True)
    by = {item["series"]: item for item in out["series"]}
    # term structure: unavailable + reason, NOT fetched/written
    assert by["vix_term_structure"]["status"] == "unavailable"
    assert by["vix_term_structure"]["null_reason"] == "term_structure_source_not_configured"
    assert "rows" not in by["vix_term_structure"]
    # spot: real rows + written exactly once (only the sourced series)
    assert by["vix_spot"]["rows"] >= 1
    assert calls["upsert"] == 1


def test_run_ingest_dry_run_does_not_write():
    calls = {"upsert": 0, "status": 0}
    dry = run_ingest(
        series=["vix_spot"], write=False, fetch_fn=_fake_fetch,
        upsert_fn=lambda rows: calls.__setitem__("upsert", calls["upsert"] + 1) or {},
        status_fn=lambda *a, **k: calls.__setitem__("status", calls["status"] + 1) or True,
    )
    assert dry["mode"] == "dry-run"
    assert calls == {"upsert": 0, "status": 0}


# ── Scope guards ──────────────────────────────────────────────────────────────

def test_no_episode_embeddings_or_ade_in_vix_sources():
    from app.services.hr_feature_store.connectors.vix import client as vclient
    from app.services.hr_feature_store.connectors.vix import config as vcfg
    from app.services.hr_feature_store.connectors.vix import ingest as ving

    for mod in (vclient, vnorm, vreg, vcfg, ving):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "episode_embeddings" not in src
        assert "ade_connectors" not in src
        assert "cre_source_registry" not in src
