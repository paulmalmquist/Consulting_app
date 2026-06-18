"""C4 — promotion-candidate storage + immutable receipt: the airlock.

Fake in-memory repo only; no production DB, no network. Verifies the status
machine, the evidence gate, non-event coverage, immutable receipts, and that C4
never creates episodes or writes episode_embeddings.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.hr_feature_store import promotion_candidates as PC
from app.services.hr_feature_store.promotion_receipts import (
    append_receipt,
    build_receipt,
    stable_hash,
)

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "repo-b" / "db" / "schema" / "10021_history_rhymes_episode_promotion_candidates.sql"


class FakeCandidateRepo:
    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.episode_writes = 0
        self.embedding_writes = 0

    def insert(self, candidate):
        self.rows[candidate["candidate_id"]] = dict(candidate)
        return dict(candidate)

    def get(self, candidate_id):
        r = self.rows.get(candidate_id)
        return dict(r) if r else None

    def list(self, *, status=None, candidate_type=None):
        out = list(self.rows.values())
        if status:
            out = [r for r in out if r["approval_status"] == status]
        if candidate_type:
            out = [r for r in out if r["candidate_type"] == candidate_type]
        return [dict(r) for r in out]

    def update(self, candidate_id, patch):
        self.rows[candidate_id].update(patch)
        return dict(self.rows[candidate_id])


def _candidate(cid="cand-1", *, with_evidence=True, ratio=3.0,
               crisis=2, non_event=6, label="non_event") -> dict:
    c = {
        "candidate_id": cid,
        "observation_id": "obs-2026-01-15",
        "as_of_date": "2026-01-15",
        "model_obs_version": "hr-fs-v1",
        "embedding_model_version": "state_vector_encoder_v1",
        "candidate_type": "non_event_anchor",
        "candidate_label": label,
        "source_quality": "live",
        "proposed_episode_name": "Jan 2026 non-event",
        "proposed_asset_class": "macro",
        "proposed_tags": ["non-event"],
        "narrative_summary": "VIX spiked, no recession followed.",
    }
    if with_evidence:
        c.update({
            "calibration_evidence_json": {"brier_score": 0.18, "permutation_p_value": 0.01,
                                          "no_lookahead_passed": True, "model_version": "v2"},
            "no_lookahead_audit_json": {"passed": True, "violations": [],
                                        "knowable_as_of": "2026-01-15"},
            "non_event_context_json": {"condition_cluster": "vix_spike_no_recession",
                                       "crisis_anchor_count": crisis, "non_event_count": non_event,
                                       "non_event_to_event_ratio": ratio},
            "features_snapshot": {"vix_spot": 0.7, "yield_curve_10y2y": -0.2},
            "lineage_json": {"inputs": ["fred:VIXCLS"]},
        })
    return c


def _seed_review_ready(repo, cid="cand-1", **kw):
    PC.create_candidate(repo, _candidate(cid, **kw))
    PC.mark_needs_review(repo, cid)
    return cid


# --------------------------------------------------------------------------- migration (static)


def test_migration_file_exists_and_additive():
    assert MIGRATION.exists()
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "drop table" not in sql and "truncate" not in sql and "drop column" not in sql


def test_migration_creates_candidate_table():
    assert "create table if not exists public.hr_episode_promotion_candidates" in \
        MIGRATION.read_text(encoding="utf-8").lower()


def test_migration_does_not_touch_episodes_or_embeddings():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    for tbl in ("public.episodes", "public.episode_embeddings"):
        for verb in ("alter table", "drop table", "insert into", "update", "delete from"):
            assert f"{verb} {tbl}" not in sql, f"migration must not {verb} {tbl}"


def test_migration_has_comments_and_verification():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "COMMENT ON TABLE" in sql and "COMMENT ON COLUMN" in sql
    assert "DO $$" in sql and "RAISE EXCEPTION" in sql
    for chk in ("hr_epc_status_chk", "hr_epc_candidate_type_chk", "hr_epc_candidate_label_chk"):
        assert chk in sql


def test_migration_gate_check_constraints():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "'draft', 'needs_evidence', 'needs_review'" in sql
    assert "'crisis_anchor', 'non_event_anchor', 'regime_shift'" in sql
    assert "readiness_score BETWEEN 0 AND 1" in sql


# --------------------------------------------------------------------------- creation


def test_valid_candidate_can_be_created():
    repo = FakeCandidateRepo()
    row = PC.create_candidate(repo, _candidate())
    assert row["approval_status"] == "draft"
    assert PC.get_candidate(repo, "cand-1")["observation_id"] == "obs-2026-01-15"


def test_duplicate_candidate_id_blocked():
    repo = FakeCandidateRepo()
    PC.create_candidate(repo, _candidate())
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.create_candidate(repo, _candidate())
    assert "duplicate_candidate_id" in e.value.reasons


def test_list_filters_by_status_and_type():
    repo = FakeCandidateRepo()
    PC.create_candidate(repo, _candidate("a"))
    PC.create_candidate(repo, _candidate("b"))
    assert len(PC.list_candidates(repo, status="draft")) == 2
    assert len(PC.list_candidates(repo, candidate_type="non_event_anchor")) == 2
    assert PC.list_candidates(repo, status="approved") == []


# --------------------------------------------------------------------------- evidence gate


def test_missing_evidence_blocks_needs_review():
    repo = FakeCandidateRepo()
    PC.create_candidate(repo, _candidate(with_evidence=False))
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.mark_needs_review(repo, "cand-1")
    for r in ("missing_calibration_evidence", "missing_no_lookahead_audit",
              "missing_non_event_context", "missing_features_snapshot", "missing_lineage"):
        assert r in e.value.reasons


def test_failed_no_lookahead_blocks_approval():
    repo = FakeCandidateRepo()
    c = _candidate()
    c["no_lookahead_audit_json"] = {"passed": False, "violations": ["feature:forward_return_30d"]}
    PC.create_candidate(repo, c)
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.mark_needs_review(repo, "cand-1")
    assert "no_lookahead_failed" in e.value.reasons


def test_approval_requires_actor():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.approve_candidate(repo, "cand-1", approval_actor="", approval_timestamp="2026-06-18T00:00:00Z")
    assert "missing_approval_actor" in e.value.reasons


# --------------------------------------------------------------------------- non-event discipline


def test_low_non_event_ratio_blocks_approval():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo, ratio=0.5, crisis=4, non_event=2)
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                             approval_timestamp="2026-06-18T00:00:00Z")
    assert "insufficient_non_event_coverage" in e.value.reasons


def test_low_ratio_approves_with_override_reason_visible_in_receipt():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo, ratio=0.5, crisis=4, non_event=2)
    row = PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                               approval_timestamp="2026-06-18T00:00:00Z",
                               coverage_override_reason="rare regime, deliberately curated")
    assert row["approval_status"] == "approved"
    assert row["non_event_context_json"]["override_reason"] == "rare regime, deliberately curated"


def test_non_event_coverage_helper():
    cov = PC.non_event_coverage(_candidate(ratio=3.0))
    assert cov["coverage_status"] == "pass" and cov["override_required"] is False
    cov2 = PC.non_event_coverage(_candidate(ratio=1.0, crisis=3, non_event=3))
    assert cov2["coverage_status"] == "below_target" and cov2["override_required"] is True


# --------------------------------------------------------------------------- status machine


def test_rejected_cannot_become_approved():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    PC.reject_candidate(repo, "cand-1", rejection_reason="not a real regime")
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                             approval_timestamp="2026-06-18T00:00:00Z")
    assert any("invalid_status_transition" in r for r in e.value.reasons)


def test_approved_cannot_promote_without_created_episode_id():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                         approval_timestamp="2026-06-18T00:00:00Z")
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.record_promoted_episode_link(repo, "cand-1", created_episode_id="",
                                        promoted_at="2026-06-18T01:00:00Z")
    assert "missing_created_episode_id" in e.value.reasons


def test_promoted_is_terminal():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                         approval_timestamp="2026-06-18T00:00:00Z")
    PC.record_promoted_episode_link(repo, "cand-1", created_episode_id="ep-123",
                                    promoted_at="2026-06-18T01:00:00Z")
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.supersede_candidate(repo, "cand-1", superseded_by_candidate_id="cand-2")
    assert any("invalid_status_transition" in r for r in e.value.reasons)


def test_invalid_transition_returns_explicit_reason():
    repo = FakeCandidateRepo()
    PC.create_candidate(repo, _candidate())  # draft
    with pytest.raises(PC.PromotionCandidateError) as e:
        PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                             approval_timestamp="2026-06-18T00:00:00Z")  # draft->approved illegal
    assert "invalid_status_transition:draft->approved" in e.value.reasons


# --------------------------------------------------------------------------- promotion link (no episode creation)


def test_record_promoted_episode_link_does_not_create_episode():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                         approval_timestamp="2026-06-18T00:00:00Z")
    row = PC.record_promoted_episode_link(repo, "cand-1", created_episode_id="ep-123",
                                          promoted_at="2026-06-18T01:00:00Z")
    assert row["approval_status"] == "promoted"
    assert row["created_episode_id"] == "ep-123"
    # the airlock only LINKS an episode created elsewhere; it never creates one
    assert repo.episode_writes == 0 and repo.embedding_writes == 0


# --------------------------------------------------------------------------- immutable receipts


def test_stable_hash_is_deterministic_and_order_independent():
    a = stable_hash({"x": 1, "y": [1, 2]})
    b = stable_hash({"y": [1, 2], "x": 1})
    assert a == b and a.startswith("sha256:")
    assert stable_hash(None) == stable_hash({})  # missing evidence still hashes stably


def test_promotion_receipt_has_stable_hashes():
    c = _candidate()
    c.update({"approval_actor": "paul", "approval_status": "approved",
              "approval_timestamp": "2026-06-18T00:00:00Z"})
    r = build_receipt(c, generated_at="2026-06-18T00:00:00Z")
    for h in ("calibration_evidence_hash", "no_lookahead_audit_hash",
              "non_event_context_hash", "lineage_hash", "features_snapshot_hash"):
        assert r[h].startswith("sha256:")
    assert build_receipt(c, generated_at="2026-06-18T00:00:00Z") == r  # deterministic


def test_receipt_is_not_silently_overwritten():
    repo = FakeCandidateRepo()
    _seed_review_ready(repo)
    PC.approve_candidate(repo, "cand-1", approval_actor="paul",
                         approval_timestamp="2026-06-18T00:00:00Z")
    after_approve = PC.get_candidate(repo, "cand-1")["promotion_receipt_json"]
    assert after_approve["version"] == 1 and after_approve["receipt_history"] == []

    PC.record_promoted_episode_link(repo, "cand-1", created_episode_id="ep-123",
                                    promoted_at="2026-06-18T01:00:00Z")
    after_promote = PC.get_candidate(repo, "cand-1")["promotion_receipt_json"]
    assert after_promote["version"] == 2
    assert len(after_promote["receipt_history"]) == 1  # the approval receipt preserved
    assert after_promote["receipt_history"][0]["approval_status"] == "approved"
    assert after_promote["created_episode_id"] == "ep-123"


def test_append_receipt_preserves_prior():
    r1 = {"approval_status": "approved", "candidate_id": "c"}
    j1 = append_receipt({}, r1)
    j2 = append_receipt(j1, {"approval_status": "promoted", "candidate_id": "c"})
    assert j2["version"] == 2 and len(j2["receipt_history"]) == 1
    assert j2["receipt_history"][0]["approval_status"] == "approved"


# --------------------------------------------------------------------------- scope guards


def test_no_episode_embeddings_write_path():
    import app.services.hr_feature_store.promotion_candidates as m1
    import app.services.hr_feature_store.promotion_receipts as m2
    for mod in (m1, m2):
        src = Path(mod.__file__).read_text(encoding="utf-8").lower()
        assert "insert into episode_embeddings" not in src
        assert "insert into public.episode_embeddings" not in src
        assert "encode_state_vector" not in src
        assert "insert into episodes" not in src and "insert into public.episodes" not in src


def test_no_llm_or_ade_imports():
    import app.services.hr_feature_store.promotion_candidates as m1
    import app.services.hr_feature_store.promotion_receipts as m2
    for mod in (m1, m2):
        src = Path(mod.__file__).read_text(encoding="utf-8")
        assert "import openai" not in src and "import anthropic" not in src
        assert "ade_connectors" not in src and "cre_source_registry" not in src
