"""B1 tests: schema 10023 content, gold materializer, idempotent loader.

No external network; the DB-touching path is covered via the FakeCursor fixture
and a monkeypatched-unavailable path. No connectors, no episode_embeddings.
"""

from __future__ import annotations

import json
from pathlib import Path


from app.services.hr_feature_store import loader as fs_loader
from app.services.hr_feature_store import materialize as fs_mat
from app.services.hr_feature_store.loader import (
    UPSERT_SQL,
    model_obs_to_params,
    upsert_model_observations,
)
from app.services.hr_feature_store.materialize import build_gold_rows, materialize

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "repo-b" / "db" / "schema" / "10023_history_rhymes_feature_store.sql"

REQUIRED_TABLES = [
    "hr_fs_readings_bronze",
    "hr_fs_readings",
    "hr_history_rhymes_model_observations",
    "hr_fs_etl_watermarks",
    "hr_fs_pipeline_status",
]


# ── Migration content ─────────────────────────────────────────────────────────

def test_migration_exists_and_has_required_tables():
    sql = MIGRATION.read_text(encoding="utf-8")
    for tbl in REQUIRED_TABLES:
        assert f"CREATE TABLE IF NOT EXISTS public.{tbl}" in sql, f"missing table {tbl}"


def test_migration_creates_pgvector_and_verifies_dim_256():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "CREATE EXTENSION IF NOT EXISTS vector" in sql
    assert "vector(256)" in sql  # column + verification
    assert "256" in sql
    assert "feature_vector" in sql


def test_migration_comments_every_hr_table_and_justifies_no_rls():
    sql = MIGRATION.read_text(encoding="utf-8")
    for tbl in REQUIRED_TABLES:
        assert f"COMMENT ON TABLE public.{tbl} IS" in sql, f"missing COMMENT for {tbl}"
    assert "exempt from env_id/RLS" in sql.lower() or "exempt from env_id/rls" in sql.lower()


def test_migration_silver_idempotency_key_and_checks():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "UNIQUE (connector, series_key, ts_source)" in sql
    assert "source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback')" in sql
    assert "status IN ('fresh', 'stale', 'failed', 'disabled', 'unavailable')" in sql
    assert "model_readiness_score IS NULL OR model_readiness_score BETWEEN 0 AND 1" in sql


# ── Materializer ──────────────────────────────────────────────────────────────

def test_build_gold_rows_shape():
    rows = build_gold_rows(limit=8)
    assert len(rows) == 8
    for r in rows:
        assert set(r.keys()) == set(fs_mat.GOLD_KEYS)
        assert len(r["feature_vector"]) == 256
        assert len(r["text_embedding"]) == 128
        assert r["source_quality"] == "synthetic"
        assert r["risk_event_30d"] in (0, 1)
        assert 0.0 <= r["model_readiness_score"] <= 1.0
        assert r["model_obs_version"] == "hr-fs-v1"


def test_build_gold_rows_deterministic():
    a = build_gold_rows(limit=6)
    b = build_gold_rows(limit=6)
    assert [r["observation_id"] for r in a] == [r["observation_id"] for r in b]
    assert a[0]["feature_vector"] == b[0]["feature_vector"]
    assert a[-1]["features_normalized"] == b[-1]["features_normalized"]


def test_encode_state_vector_is_256():
    rows = build_gold_rows(limit=1)
    vec = fs_mat._encode_256(rows[0]["features_normalized"])
    assert len(vec) == 256
    # Phase A text half is a deterministic zero placeholder (no narrative embedding, no network).
    assert vec[128:] == [0.0] * 128


def test_materialize_dry_run_default():
    out = materialize(limit=5)
    assert out["status"] == "planned"
    assert out["row_count"] == 5
    assert out["model_obs_version"] == "hr-fs-v1"


# ── Loader ────────────────────────────────────────────────────────────────────

def test_upsert_sql_is_idempotent_shape():
    assert "ON CONFLICT (observation_id, as_of_date, model_obs_version) DO UPDATE" in UPSERT_SQL
    assert "RETURNING (xmax = 0) AS inserted" in UPSERT_SQL


def test_params_preserve_provenance_and_never_zero_missing():
    obs = build_gold_rows(limit=1)[0]
    obs["source_quality"] = "fixture"
    obs["null_reason"] = "provider_outage"
    obs["forward_return_30d"] = None  # missing must stay NULL, not 0
    obs["features_raw"]["vix_spot"] = None
    p = model_obs_to_params(obs)
    assert p["source_quality"] == "fixture"
    assert p["null_reason"] == "provider_outage"
    assert p["forward_return_30d"] is None
    raw = json.loads(p["features_raw"])
    assert raw["vix_spot"] is None  # null, not 0
    # provenance round-trips
    assert json.loads(p["provenance"])["model_obs_version"] == "hr-fs-v1"


def test_upsert_skips_rows_missing_keys():
    counts = upsert_model_observations([{"as_of_date": "2026-06-12"}, {"observation_id": "x"}])
    assert counts["skipped"] == 2
    assert counts["inserted"] == 0


def test_upsert_unavailable_when_db_down(monkeypatch):
    import app.db as appdb

    def _boom(*a, **k):
        raise RuntimeError("no database")

    monkeypatch.setattr(appdb, "get_cursor", _boom)
    rows = build_gold_rows(limit=3)
    counts = upsert_model_observations(rows)
    assert counts["unavailable"] == 3
    assert counts["inserted"] == 0


def test_upsert_tallies_inserted_vs_updated(fake_cursor):
    # FakeCursor returns the queued RETURNING rows; first inserts, second updates.
    fake_cursor.push_result([{"inserted": True}])
    fake_cursor.push_result([{"inserted": False}])
    rows = build_gold_rows(limit=2)
    counts = upsert_model_observations(rows)
    assert counts["inserted"] == 1
    assert counts["updated"] == 1
    assert counts["unavailable"] == 0


# ── Scope guards ──────────────────────────────────────────────────────────────

def test_no_episode_embeddings_or_ade_in_b1_sources():
    for mod in (fs_mat, fs_loader):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "episode_embeddings" not in src
        assert "ade_connectors" not in src
        assert "connectors.cre" not in src
        assert "cre_source_registry" not in src
    migration_sql = MIGRATION.read_text(encoding="utf-8")
    assert "episode_embeddings" not in migration_sql
