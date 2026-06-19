"""C11 — additive episodes promotion-origin columns + C10 wiring.

Migration static checks + service-level proof that origin fields are carried onto
the episode row, with a fail-soft path when the columns aren't present. No DB,
no network.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.hr_feature_store import episode_creation as EC

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "repo-b" / "db" / "schema" / "10023_history_rhymes_episode_origin.sql"

ORIGIN_COLS = ("origin_candidate_id", "origin_observation_id", "origin_model_obs_version",
               "origin_embedding_model_version", "origin_receipt_hash", "origin_metadata_json")

AUTHORED = {
    "name": "Jan 2026 vol spike", "asset_class": "macro",
    "macro_conditions_entering": "Late cycle, tight credit.",
    "catalyst_trigger": "Contained risk-off.",
    "timeline_narrative": "Spiked, mean-reverted, no recession.",
    "start_date": "2026-01-05",
}


def _candidate(**over):
    c = {
        "candidate_id": "c1", "observation_id": "obs-2026-01-05", "approval_status": "approved",
        "approval_actor": "paul", "approval_timestamp": "2026-06-18T00:00:00Z",
        "model_obs_version": "hr-fs-v1", "embedding_model_version": "state_vector_encoder_v1",
        "candidate_type": "non_event_anchor", "candidate_label": "non_event",
        "condition_cluster": "vix_spike_no_recession",
        "promotion_receipt_json": {"version": 1, "candidate_id": "c1"},
        "calibration_evidence_json": {"brier_score": 0.18},
        "no_lookahead_audit_json": {"passed": True, "violations": []},
        "non_event_context_json": {"crisis_anchor_count": 2, "non_event_count": 6},
        "features_snapshot": {"vix": 0.7}, "lineage_json": {"inputs": ["fred:VIXCLS"]},
        "narrative_summary": "x",
    }
    c.update(over)
    return c


# --------------------------------------------------------------------------- migration


def test_migration_exists_and_additive():
    assert MIGRATION.exists()
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "alter table public.episodes" in sql
    assert "add column if not exists" in sql
    for bad in ("drop table", "drop column", "truncate", "delete from"):
        assert bad not in sql


def test_migration_adds_all_origin_columns_with_comments():
    sql = MIGRATION.read_text(encoding="utf-8")
    for col in ORIGIN_COLS:
        assert col in sql
    assert "COMMENT ON COLUMN public.episodes.origin_candidate_id" in sql
    assert "RAISE EXCEPTION" in sql and "DO $$" in sql  # verification block


def test_migration_does_not_touch_episode_embeddings():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    for verb in ("alter table public.episode_embeddings", "insert into public.episode_embeddings",
                 "update public.episode_embeddings", "drop table public.episode_embeddings"):
        assert verb not in sql


# --------------------------------------------------------------------------- origin wiring


def test_origin_fields_built_from_candidate():
    origin = EC.build_origin_fields(_candidate())
    assert origin["origin_candidate_id"] == "c1"
    assert origin["origin_observation_id"] == "obs-2026-01-05"
    assert origin["origin_model_obs_version"] == "hr-fs-v1"
    assert origin["origin_embedding_model_version"] == "state_vector_encoder_v1"
    assert origin["origin_receipt_hash"].startswith("sha256:")
    meta = json.loads(origin["origin_metadata_json"])
    assert meta["candidate_label"] == "non_event"
    assert meta["condition_cluster"] == "vix_spike_no_recession"


def test_created_episode_row_carries_origin():
    captured = {}

    class R:
        def get_candidate(self, cid):
            return _candidate()

        def insert_episode(self, episode):
            captured.update(episode)
            return "ep-1"

    out = EC.create_episode(R(), "c1", AUTHORED)
    assert out["episode_id"] == "ep-1"
    assert out["searchable"] is False and out["embedding_status"] == "not_created"  # C10 behavior preserved
    assert captured["source"] == "promotion"
    assert captured["origin_candidate_id"] == "c1"
    assert "origin_metadata_json" in captured


def test_insert_fails_soft_without_origin_columns(monkeypatch):
    """If migration 10023 isn't applied, the insert retries without origin cols."""
    attempts = []

    class FakeCursorCtx:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, sql, params):
            attempts.append(params)
            if any(k.startswith("origin_") for k in params):
                raise Exception('column "origin_candidate_id" of relation "episodes" does not exist')

        def fetchone(self):
            return {"id": "ep-soft"}

    import app.db as appdb
    monkeypatch.setattr(appdb, "get_cursor", lambda: FakeCursorCtx())
    repo = EC.DbEpisodeRepository()
    row = {"name": "n", "asset_class": "macro", "source": "promotion",
           "origin_candidate_id": "c1", "origin_metadata_json": "{}"}
    eid = repo.insert_episode(row)
    assert eid == "ep-soft"
    assert len(attempts) == 2  # first with origin (failed), retry without
    assert not any(k.startswith("origin_") for k in attempts[1])


def test_no_embedding_or_seal_in_origin_path():
    src = Path(EC.__file__).read_text(encoding="utf-8").lower()
    assert "insert into episode_embeddings" not in src
    assert "record_promoted_episode_link(" not in src
    assert "encode_state_vector(" not in src
