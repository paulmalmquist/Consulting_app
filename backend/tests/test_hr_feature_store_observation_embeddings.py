"""C2-B — observation-keyed embedding target + migration static checks.

Feature-store observations get their OWN append-only table; episode_embeddings is
left untouched. Fixture/fake-repo only — no production DB, no network. Reuses the
C1 FakeBackfillRepository + candidate builders.
"""

from __future__ import annotations

from pathlib import Path


from app.services.hr_feature_store.embedding_backfill import (
    TARGET_EPISODE,
    TARGET_OBSERVATION,
    execute_backfill,
    plan_backfill,
)

from tests.test_hr_feature_store_embedding_backfill import (  # reuse C1 harness
    FakeBackfillRepository,
    _balanced_candidates,
    _candidate,
    _evidence,
)

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "repo-b" / "db" / "schema" / "10024_history_rhymes_observation_embeddings.sql"

ENC = "state_vector_encoder_v1"
MODELV = "hr_feature_store_v2"


def _obs_repo(existing_obs_keys=None):
    # observation target needs NO episode_map (the key is intrinsic)
    return FakeBackfillRepository(_balanced_candidates(), existing_obs_keys=existing_obs_keys or set())


def _plan_obs(repo, *, evidence="calibration_pass.json", model_version=MODELV,
              embedding_model_version=ENC):
    return plan_backfill(
        repo, requested_model_version=model_version,
        calibration_evidence=_evidence(evidence) if evidence else None,
        target=TARGET_OBSERVATION, embedding_model_version=embedding_model_version,
    )


# --------------------------------------------------------------------------- migration (static)


def test_migration_file_exists():
    assert MIGRATION.exists(), "10024 observation-embeddings migration missing"


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_migration_creates_observation_table():
    assert "CREATE TABLE IF NOT EXISTS public.hr_feature_store_observation_embeddings" in _sql()


def test_migration_does_not_touch_episode_embeddings():
    sql = _sql().lower()
    # episode_embeddings may be NAMED in comments explaining separation, but never altered/dropped
    for verb in ("alter table public.episode_embeddings", "drop table public.episode_embeddings",
                 "insert into public.episode_embeddings", "update public.episode_embeddings",
                 "delete from public.episode_embeddings"):
        assert verb not in sql, f"migration must not mutate episode_embeddings: {verb}"


def test_migration_is_additive_only():
    sql = _sql().lower()
    assert "drop table" not in sql
    assert "drop column" not in sql
    assert "truncate" not in sql


def test_migration_creates_vector_extension():
    assert "create extension if not exists vector" in _sql().lower()


def test_migration_verifies_vector_256():
    sql = _sql()
    assert "vector(256)" in sql
    assert "RAISE EXCEPTION" in sql and "DO $$" in sql  # verification DO block present


def test_migration_comments_explain_separation():
    sql = _sql().lower()
    assert "comment on table" in sql
    assert "episode_embeddings" in sql  # the comment must reference the table it's separate from
    assert "separate" in sql or "intentionally" in sql


def test_migration_unique_and_check_constraints():
    sql = _sql()
    assert "UNIQUE (observation_id, model_obs_version, embedding_model_version)" in sql
    assert "source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback')" in sql
    assert "model_readiness_score BETWEEN 0 AND 1" in sql


def test_migration_useful_indexes():
    sql = _sql().lower()
    assert "idx_hr_fs_obs_emb_as_of" in sql
    assert "idx_hr_fs_obs_emb_model_obs_version" in sql
    assert "idx_hr_fs_obs_emb_source_quality" in sql


# --------------------------------------------------------------------------- planner: target behavior


def test_default_target_is_observation_embeddings():
    repo = _obs_repo()
    # no target kwarg → exercise the planner's DEFAULT
    receipt, _ = plan_backfill(repo, requested_model_version=MODELV,
                               calibration_evidence=_evidence("calibration_pass.json"),
                               embedding_model_version=ENC)
    assert receipt["target"] == TARGET_OBSERVATION
    assert receipt["status"] == "eligible"


def test_episode_target_blocks_without_mapping():
    repo = FakeBackfillRepository(_balanced_candidates())  # no episode_map
    receipt, full = plan_backfill(repo, requested_model_version=MODELV,
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target=TARGET_EPISODE)
    assert receipt["status"] == "blocked"
    assert receipt["blocked_reasons"] == ["episode_mapping_unresolved"] or \
        "episode_mapping_unresolved" in receipt["blocked_reasons"]
    assert receipt["write_allowed"] is False
    assert full == []


def test_observation_target_eligible_without_episode_mapping():
    repo = _obs_repo()
    receipt, full = _plan_obs(repo)
    assert receipt["status"] == "eligible"
    assert receipt["write_allowed"] is True
    assert receipt["blocked_reasons"] == []
    assert receipt["eligible_count"] == 7
    assert "mapping_proposal" not in receipt  # observation target has no mapping gap
    assert all(r["embedding_model_version"] == ENC for r in full)


def test_observation_target_requires_embedding_model_version():
    repo = _obs_repo()
    receipt, _ = _plan_obs(repo, embedding_model_version=None)
    assert receipt["status"] == "blocked"
    assert "embedding_model_version_not_specified" in receipt["blocked_reasons"]


def test_observation_target_requires_model_version():
    repo = _obs_repo()
    receipt, _ = _plan_obs(repo, model_version=None)
    assert "model_version_not_specified" in receipt["blocked_reasons"]
    assert receipt["write_allowed"] is False


def test_observation_dry_run_makes_no_writes():
    repo = _obs_repo()
    receipt, _ = _plan_obs(repo)
    assert receipt["mode"] == "dry_run"
    assert repo.inserted == [] and repo.deleted == 0 and repo.updated == 0


# --------------------------------------------------------------------------- write path (observation)


def test_observation_write_without_confirm_blocks():
    repo = _obs_repo()
    receipt, full = _plan_obs(repo)
    res = execute_backfill(repo, receipt, full, write=True, confirm=False)
    assert res["write_performed"] is False and res["reason"] == "confirm_required"
    assert repo.inserted == []


def test_observation_write_path_works_with_all_gates_and_flags():
    repo = _obs_repo()
    receipt, full = _plan_obs(repo)
    res = execute_backfill(repo, receipt, full, write=True, confirm=True)
    assert res["write_performed"] is True
    assert res["written"] == 7
    assert len(repo.inserted) == 7
    # wrote to the OBSERVATION table only: every row carries observation keys, no episode_id
    assert all("episode_id" not in r for r in repo.inserted)
    assert all(r["embedding_model_version"] == ENC for r in repo.inserted)
    assert repo.deleted == 0 and repo.updated == 0  # append-only, no in-place overwrite


def test_observation_duplicate_write_inserts_zero():
    repo = _obs_repo()
    receipt, full = _plan_obs(repo)
    execute_backfill(repo, receipt, full, write=True, confirm=True)
    res2 = execute_backfill(repo, receipt, full, write=True, confirm=True)
    assert res2["written"] == 0
    assert len(repo.inserted) == 7  # no overwrite


def test_observation_preexisting_keys_skip_with_reason():
    cands = _balanced_candidates()
    pre = {(cands[0]["observation_id"], "hr-fs-v1", ENC),
           (cands[1]["observation_id"], "hr-fs-v1", ENC)}
    repo = FakeBackfillRepository(cands, existing_obs_keys=pre)
    receipt, full = _plan_obs(repo)
    dup = [r for r in receipt["planned_skips"] if "duplicate_for_model_version" in r["reasons"]]
    assert len(dup) == 2
    assert len(full) == len(cands) - 2


def test_observation_target_still_applies_c1_gates():
    # banned future-looking feature must still block under the observation target
    cands = _balanced_candidates()
    cands.append(_candidate("leak", features={"forward_return_30d": 1.0}))
    repo = FakeBackfillRepository(cands)
    receipt, _ = _plan_obs(repo)
    assert receipt["status"] == "blocked"
    assert "no_lookahead_violation" in receipt["blocked_reasons"]


def test_observation_target_insufficient_coverage_visible():
    cands = _balanced_candidates(n_crisis=5, n_non_event=2)  # ratio 0.4
    repo = FakeBackfillRepository(cands)
    receipt, _ = _plan_obs(repo)
    cov = receipt["gate_results"]["non_event_coverage"]
    assert cov["status"] == "fail"
    assert "insufficient_non_event_coverage" in receipt["blocked_reasons"]


def test_observation_target_synthetic_not_promotable():
    cands = [_candidate(f"s{i}", source_quality="synthetic", non_event=True) for i in range(3)]
    cands += [_candidate("c0", source_quality="synthetic", crisis=True)]
    repo = FakeBackfillRepository(cands)
    receipt, full = _plan_obs(repo)
    assert receipt["status"] == "blocked"
    assert "source_quality_not_promotable" in receipt["blocked_reasons"]
    assert full == []


def test_no_ade_connector_imports():
    import app.services.hr_feature_store.embedding_backfill as m
    src = Path(m.__file__).read_text(encoding="utf-8")
    assert "ade_connectors" not in src and "cre_source_registry" not in src
