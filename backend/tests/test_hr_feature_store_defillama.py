"""B6 tests: DefiLlama stablecoin connector (registry / normalizer / growth /
ingest) + silver loader + daily-cadence freshness. Crypto-liquidity proxy only —
no market-liquidity/regime claims. Fixtures only — NO network in any test.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.services.hr_feature_store.connectors.defillama import normalizer as dnorm
from app.services.hr_feature_store.connectors.defillama import series_registry as dreg
from app.services.hr_feature_store.connectors.defillama.ingest import run_ingest
from app.services.hr_feature_store.freshness import compute_status
from app.services.hr_feature_store.loader import upsert_silver_readings

FX = Path(__file__).parent / "fixtures" / "hr_feature_store" / "defillama"
HISTORY = json.loads((FX / "valid_stablecoins_history.json").read_text())
INSUFFICIENT = json.loads((FX / "insufficient_history.json").read_text())
MISSING = json.loads((FX / "missing_supply.json").read_text())
BAD = json.loads((FX / "bad_shape.json").read_text())
ID_RE = re.compile(r"^[a-z0-9_]+$")


# ── Registry ──────────────────────────────────────────────────────────────────

def test_registry_url_safe_all_auxiliary():
    assert set(dreg.DEFILLAMA_SERIES) == {
        "stablecoin_supply_usd", "stablecoin_supply_growth_7d", "stablecoin_supply_growth_30d"
    }
    for key, meta in dreg.DEFILLAMA_SERIES.items():
        assert ID_RE.match(key)
        assert meta["quant_slot"] is None  # stablecoin supply is not a quant slot
        assert meta["cadence"] == "daily"


# ── Supply series ─────────────────────────────────────────────────────────────

def test_normalize_supply_series():
    rows = dnorm.normalize("stablecoin_supply_usd", HISTORY, source_quality="fixture")
    assert len(rows) == 31
    latest = rows[-1]
    assert latest["value"] == 210_000_000_000.0
    assert latest["ts_source"] == "2026-06-12T00:00:00+00:00"
    assert latest["connector"] == "defillama"
    assert latest["series_key"] == "stablecoin_supply_usd"
    assert latest["source_quality"] == "fixture"
    assert latest["null_reason"] is None
    assert "proxy" in latest["provenance"]["note"]  # honesty: not market liquidity


def test_normalize_supply_missing_is_null_not_zero():
    rows = dnorm.normalize("stablecoin_supply_usd", MISSING)
    latest = rows[-1]
    assert latest["value"] is None
    assert latest["value"] != 0
    assert latest["null_reason"] == "defillama_missing_supply"


# ── Growth windows (computed from observed history) ──────────────────────────

def test_growth_7d_and_30d_from_history():
    g7 = dnorm.normalize("stablecoin_supply_growth_7d", HISTORY)[0]
    g30 = dnorm.normalize("stablecoin_supply_growth_30d", HISTORY)[0]
    assert g7["value"] == pytest.approx(0.0714286, abs=1e-6)
    assert g30["value"] == pytest.approx(0.4, abs=1e-9)
    assert g7["provenance"]["window_days"] == 7
    assert g7["provenance"]["calculation"] == "(current_supply - past_supply) / past_supply"
    assert g7["provenance"]["current_supply"] == 210_000_000_000.0
    assert g30["provenance"]["past_supply"] == 150_000_000_000.0


def test_growth_insufficient_history_fails_closed():
    g7 = dnorm.normalize("stablecoin_supply_growth_7d", INSUFFICIENT)[0]
    assert g7["value"] is None
    assert g7["null_reason"] == "defillama_growth_window_insufficient"
    assert g7["provenance"]["observed_points"] == 3


def test_growth_missing_current_supply():
    g7 = dnorm.normalize("stablecoin_supply_growth_7d", MISSING)[0]
    assert g7["value"] is None
    assert g7["null_reason"] == "defillama_missing_supply"


# ── Shape error + no broad-liquidity claims ──────────────────────────────────

def test_bad_shape_raises():
    with pytest.raises(dnorm.DefiLlamaShapeError):
        dnorm.normalize("stablecoin_supply_usd", BAD)
    with pytest.raises(dnorm.DefiLlamaShapeError):
        dnorm.normalize("stablecoin_supply_usd", [123])


def test_no_broad_liquidity_or_regime_claims():
    # Only the 3 proxy series exist; provenance never claims market/CB liquidity or a regime.
    rows = dnorm.normalize("stablecoin_supply_usd", HISTORY)
    p = rows[-1]["provenance"]
    for banned in ("liquidity_fragmentation", "central_bank", "market_liquidity", "regime"):
        assert banned not in p
    assert "central_bank_liquidity_growth" not in dreg.DEFILLAMA_SERIES
    assert "liquidity_fragmentation_score" not in dreg.DEFILLAMA_SERIES


# ── Loader idempotency ────────────────────────────────────────────────────────

def test_silver_upsert_tally_with_defillama_rows(fake_cursor):
    fake_cursor.push_result([{"inserted": True}])
    fake_cursor.push_result([{"inserted": False}])
    rows = dnorm.normalize("stablecoin_supply_usd", HISTORY)[:2]
    counts = upsert_silver_readings(rows)
    assert counts["inserted"] == 1 and counts["updated"] == 1


# ── Daily cadence freshness ───────────────────────────────────────────────────

def test_daily_cadence_fresh_then_stale():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    assert compute_status(datetime(2026, 6, 15, tzinfo=timezone.utc), now, "daily")[0] == "fresh"
    assert compute_status(datetime(2026, 6, 1, tzinfo=timezone.utc), now, "daily")[0] == "stale"


# ── Ingest: one fetch, all series; dry-run no write ──────────────────────────

def _fake_fetch(limit=None):
    return HISTORY


def test_ingest_dry_run_does_not_write():
    calls = {"upsert": 0, "status": 0}
    out = run_ingest(
        write=False, fetch_fn=_fake_fetch,
        upsert_fn=lambda rows: calls.__setitem__("upsert", calls["upsert"] + 1) or {},
        status_fn=lambda *a, **k: calls.__setitem__("status", calls["status"] + 1) or True,
    )
    assert out["mode"] == "dry-run"
    assert {i["series"] for i in out["series"]} == set(dreg.DEFILLAMA_SERIES)
    assert calls == {"upsert": 0, "status": 0}


def test_ingest_write_calls_loader_per_series():
    calls = {"upsert": 0}
    out = run_ingest(
        write=True, fetch_fn=_fake_fetch,
        upsert_fn=lambda rows: calls.__setitem__("upsert", calls["upsert"] + 1) or {"inserted": len(rows)},
        status_fn=lambda *a, **k: True,
    )
    assert out["mode"] == "write"
    assert calls["upsert"] == 3  # supply + 7d + 30d


# ── Scope guards ──────────────────────────────────────────────────────────────

def test_no_episode_embeddings_or_ade_in_defillama_sources():
    from app.services.hr_feature_store.connectors.defillama import client as dclient
    from app.services.hr_feature_store.connectors.defillama import config as dcfg
    from app.services.hr_feature_store.connectors.defillama import ingest as ding

    for mod in (dclient, dnorm, dreg, dcfg, ding):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "episode_embeddings" not in src
        assert "ade_connectors" not in src
        assert "cre_source_registry" not in src
