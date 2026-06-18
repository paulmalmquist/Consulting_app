"""C1 — gated episode_embeddings backfill: dry-run-first, fail-closed, fixture-only.

No production DB, no network. A FakeBackfillRepository exercises every gate and
the only write path. The headline invariant: nothing writes by default, and the
write path is unreachable unless --write AND --confirm AND every gate passes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.hr_feature_store import backfill_gates as G
from app.services.hr_feature_store.backfill_audit import audit_no_lookahead
from app.services.hr_feature_store.embedding_backfill import (
    EMBEDDING_TYPE,
    execute_backfill,
    plan_backfill,
)

FIXTURES = Path(__file__).parent / "fixtures" / "hr_feature_store" / "backfill"


def _evidence(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _vec(dim: int = G.FEATURE_VECTOR_DIM) -> list[float]:
    # deterministic, non-zero, unit-ish; content is irrelevant to gates
    return [0.01] * dim


def _candidate(obs_id: str, *, source_quality="live", crisis=False, non_event=False,
               features=None, vector_dim=G.FEATURE_VECTOR_DIM, provenance=None,
               as_of="2026-01-15") -> dict:
    return {
        "observation_id": obs_id,
        "as_of_date": as_of,
        "model_obs_version": "hr-fs-v1",
        "features_normalized": features if features is not None else {"yield_curve_10y2y": 0.4},
        "feature_vector": _vec(vector_dim),
        "text_embedding": [0.0] * 128,
        "narrative_text": "",
        "source_quality": source_quality,
        "is_crisis_anchor": crisis,
        "is_non_event": non_event,
        "model_readiness_score": 0.9,
        "readiness_degrade_reasons": [],
        "lineage_json": {"inputs": ["fred:T10Y2Y"]},
        "provenance": provenance or {"connector": "fred"},
    }


def _balanced_candidates(n_crisis=2, n_non_event=5) -> list[dict]:
    """2:1+ non-event:event coverage so coverage passes by default."""
    rows = [_candidate(f"c{i}", crisis=True) for i in range(n_crisis)]
    rows += [_candidate(f"n{i}", non_event=True) for i in range(n_non_event)]
    return rows


class FakeBackfillRepository:
    """In-memory repo. Records every insert; never mutates input rows."""

    def __init__(self, candidates, *, episode_map=None, existing_versions=None,
                 existing_keys=None, existing_obs_keys=None):
        self._candidates = candidates
        self._episode_map = episode_map or {}        # observation_id -> episode_id
        self._existing_versions = set(existing_versions or [])
        self._existing_keys = set(existing_keys or [])
        self._existing_obs_keys = set(existing_obs_keys or [])  # (obs_id, obs_ver, enc_ver)
        self.inserted: list[dict] = []
        self.deleted = 0
        self.updated = 0

    def list_candidates(self, limit=None):
        return self._candidates[:limit] if limit else list(self._candidates)

    def existing_model_versions(self):
        return set(self._existing_versions)

    def existing_episode_keys(self, model_version, embedding_type=EMBEDDING_TYPE):
        return set(self._existing_keys)

    def resolve_episode_id(self, candidate):
        return self._episode_map.get(candidate.get("observation_id"))

    def insert_episode_embeddings(self, rows):
        added = 0
        keys = {(r["episode_id"], r["embedding_type"], r["model_version"]) for r in self.inserted}
        for r in rows:
            k = (r["episode_id"], r["embedding_type"], r["model_version"])
            if k in keys or k in {(eid, EMBEDDING_TYPE, r["model_version"]) for eid in self._existing_keys}:
                continue  # append-only: skip duplicates, never overwrite
            self.inserted.append(r)
            keys.add(k)
            added += 1
        return added

    # C2-B observation-embeddings target (separate table)
    def existing_observation_keys(self, embedding_model_version):
        return {k for k in self._existing_obs_keys if k[2] == embedding_model_version}

    def insert_observation_embeddings(self, rows):
        added = 0
        keys = {(r["observation_id"], r["model_obs_version"], r["embedding_model_version"])
                for r in self.inserted}
        for r in rows:
            k = (r["observation_id"], r["model_obs_version"], r["embedding_model_version"])
            if k in keys or k in self._existing_obs_keys:
                continue  # append-only: skip duplicates, never overwrite
            self.inserted.append(r)
            keys.add(k)
            added += 1
        return added


# fully-eligible repo: live source, mapped episodes, balanced coverage, new version
def _eligible_repo():
    cands = _balanced_candidates()
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    return FakeBackfillRepository(cands, episode_map=episode_map)


# --------------------------------------------------------------------------- gates / audit unit


def test_no_lookahead_passes_clean_row():
    ok, violations = audit_no_lookahead(_candidate("x"))
    assert ok and not violations


@pytest.mark.parametrize("banned", ["forward_return_30d", "target_label", "resolved_outcome",
                                    "next_30d_move", "actual_outcome"])
def test_no_lookahead_blocks_banned_feature(banned):
    ok, violations = audit_no_lookahead(_candidate("x", features={banned: 1.0}))
    assert not ok and any(banned.split("_")[0] in v or banned in v for v in violations)


def test_no_lookahead_blocks_banned_in_provenance():
    ok, _ = audit_no_lookahead(_candidate("x", provenance={"future_return_source": "leak"}))
    assert not ok


def test_brier_gate_threshold():
    assert G.gate_brier({"brier_score": 0.18})["status"] == "pass"
    assert G.gate_brier({"brier_score": 0.22})["status"] == "fail"  # strict <
    assert G.gate_brier(None)["status"] == "missing"


def test_permutation_gate_threshold():
    assert G.gate_permutation({"permutation_p_value": 0.01})["status"] == "pass"
    assert G.gate_permutation({"permutation_p_value": 0.05})["status"] == "fail"
    assert G.gate_permutation({})["status"] == "missing"


def test_version_bump_gate():
    assert G.gate_model_version_bump("hr_feature_store_v2", set(), None)["status"] == "pass"
    assert G.gate_model_version_bump("concat-l2-v1", set(), None)["status"] == "fail"
    assert G.gate_model_version_bump("v2", {"v2"}, None)["status"] == "fail"
    assert G.gate_model_version_bump(None, set(), None)["status"] == "missing"


def test_coverage_gate():
    assert G.gate_non_event_coverage(_balanced_candidates(2, 5))["status"] == "pass"
    assert G.gate_non_event_coverage(_balanced_candidates(3, 3))["status"] == "degraded"
    assert G.gate_non_event_coverage(_balanced_candidates(5, 2))["status"] == "fail"


# --------------------------------------------------------------------------- planner


def test_dry_run_default_makes_no_writes():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"))
    assert receipt["mode"] == "dry_run"
    assert repo.inserted == [] and repo.deleted == 0 and repo.updated == 0


def test_no_candidates_is_not_available():
    receipt, full = plan_backfill(FakeBackfillRepository([]),
                                  requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"))
    assert receipt["status"] == "not_available"
    assert receipt["null_reason"] == "no_model_observation_candidates"
    assert receipt["write_allowed"] is False


def test_valid_fixture_returns_eligible_plan_episode_target():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target="episode_embeddings")
    assert receipt["status"] == "eligible"
    assert receipt["write_allowed"] is True
    assert receipt["blocked_reasons"] == []
    assert receipt["eligible_count"] == 7
    assert len(full) == 7 and all(r["episode_id"] for r in full)


def test_missing_calibration_evidence_blocks():
    repo = _eligible_repo()
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=None)
    assert receipt["status"] == "blocked"
    assert "missing_calibration_evidence" in receipt["blocked_reasons"]
    assert "missing_permutation_evidence" in receipt["blocked_reasons"]
    assert receipt["write_allowed"] is False


def test_high_brier_blocks():
    repo = _eligible_repo()
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=_evidence("calibration_fail_brier.json"))
    assert receipt["status"] == "blocked"
    assert "brier_too_high" in receipt["blocked_reasons"]


def test_weak_permutation_blocks():
    repo = _eligible_repo()
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=_evidence("calibration_fail_permutation.json"))
    assert receipt["status"] == "blocked"
    assert "permutation_not_significant" in receipt["blocked_reasons"]


def test_banned_feature_blocks_via_planner():
    cands = _balanced_candidates()
    cands.append(_candidate("leak", features={"forward_return_30d": 1.0}))
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    repo = FakeBackfillRepository(cands, episode_map=episode_map)
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=_evidence("calibration_pass.json"))
    assert receipt["status"] == "blocked"
    assert "no_lookahead_violation" in receipt["blocked_reasons"]


def test_model_version_not_bumped_blocks():
    repo = _eligible_repo()
    receipt, _ = plan_backfill(repo, requested_model_version=None,
                               calibration_evidence=_evidence("calibration_pass.json"))
    assert "model_version_not_specified" in receipt["blocked_reasons"]
    assert receipt["write_allowed"] is False


def test_wrong_feature_vector_dim_blocks():
    cands = _balanced_candidates()
    cands.append(_candidate("short", vector_dim=128))
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    repo = FakeBackfillRepository(cands, episode_map=episode_map)
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=_evidence("calibration_pass.json"))
    skips = {r["observation_id"]: r["reasons"] for r in receipt["planned_skips"]}
    assert "feature_vector_dim_mismatch" in skips.get("short", [])


def test_synthetic_source_quality_not_promotable():
    cands = [_candidate(f"s{i}", source_quality="synthetic", non_event=True) for i in range(3)]
    cands += [_candidate("c0", source_quality="synthetic", crisis=True)]
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    repo = FakeBackfillRepository(cands, episode_map=episode_map)
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"))
    assert receipt["status"] == "blocked"
    assert "source_quality_not_promotable" in receipt["blocked_reasons"]
    assert full == []


def test_episode_target_mapping_unresolved_blocks_and_proposes_c2():
    # episode_embeddings target with no episode_map → live-schema reality: observation_id has no episode_id
    repo = FakeBackfillRepository(_balanced_candidates())
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target="episode_embeddings")
    assert receipt["status"] == "blocked"
    assert "episode_mapping_unresolved" in receipt["blocked_reasons"]
    assert full == []
    assert "mapping_proposal" in receipt
    assert receipt["mapping_proposal"]["blocked_reason"] == "episode_mapping_unresolved"


def test_episode_target_duplicate_for_model_version_skips():
    cands = _balanced_candidates()
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    existing = {f"ep-{c['observation_id']}" for c in cands[:2]}  # already present
    repo = FakeBackfillRepository(cands, episode_map=episode_map, existing_keys=existing)
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target="episode_embeddings")
    dup_skips = [r for r in receipt["planned_skips"]
                 if "duplicate_for_model_version" in r["reasons"]]
    assert len(dup_skips) == 2
    assert len(full) == len(cands) - 2


def test_insufficient_non_event_coverage_visible():
    cands = _balanced_candidates(n_crisis=5, n_non_event=2)  # ratio 0.4 → fail
    episode_map = {c["observation_id"]: f"ep-{c['observation_id']}" for c in cands}
    repo = FakeBackfillRepository(cands, episode_map=episode_map)
    receipt, _ = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                               calibration_evidence=_evidence("calibration_pass.json"))
    cov = receipt["gate_results"]["non_event_coverage"]
    assert cov["status"] == "fail"
    assert cov["non_event_to_event_ratio"] == 0.4
    assert "insufficient_non_event_coverage" in receipt["blocked_reasons"]


# --------------------------------------------------------------------------- write path


def test_write_without_confirm_is_blocked():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"))
    res = execute_backfill(repo, receipt, full, write=True, confirm=False)
    assert res["write_performed"] is False
    assert res["reason"] == "confirm_required"
    assert repo.inserted == []


def test_confirm_without_write_is_still_dry_run():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"))
    res = execute_backfill(repo, receipt, full, write=False, confirm=True)
    assert res["write_performed"] is False
    assert res["reason"] == "dry_run_default"
    assert repo.inserted == []


def test_write_blocked_when_gates_fail():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_fail_brier.json"))
    res = execute_backfill(repo, receipt, full, write=True, confirm=True)
    assert res["write_performed"] is False
    assert res["reason"] == "gates_not_passed"
    assert repo.inserted == []


def test_episode_target_write_path_works_with_all_gates_and_flags():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target="episode_embeddings")
    res = execute_backfill(repo, receipt, full, write=True, confirm=True)
    assert res["write_performed"] is True
    assert res["written"] == 7
    assert len(repo.inserted) == 7
    assert repo.deleted == 0 and repo.updated == 0  # append-only, no in-place overwrite


def test_episode_target_no_overwrite_on_repeat_write():
    repo = _eligible_repo()
    receipt, full = plan_backfill(repo, requested_model_version="hr_feature_store_v2",
                                  calibration_evidence=_evidence("calibration_pass.json"),
                                  target="episode_embeddings")
    execute_backfill(repo, receipt, full, write=True, confirm=True)
    # second identical write inserts nothing new (ON CONFLICT DO NOTHING semantics)
    res2 = execute_backfill(repo, receipt, full, write=True, confirm=True)
    assert res2["written"] == 0
    assert len(repo.inserted) == 7


def test_no_ade_connector_imports():
    import app.services.hr_feature_store.embedding_backfill as m
    src = Path(m.__file__).read_text(encoding="utf-8")
    assert "ade_connectors" not in src
    assert "cre_source_registry" not in src
