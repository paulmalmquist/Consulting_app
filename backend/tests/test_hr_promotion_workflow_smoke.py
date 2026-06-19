"""C15 — end-to-end protected promotion-workflow smoke.

Walks the whole flow through the protected C6 routes against in-memory fakes (no DB,
no network): create candidate → needs-review → approve → validate-episode →
create-episode (NOT searchable) → create-episode-embedding (searchable) →
seal-promoted-episode (promoted). Asserts the safety invariants:
  - no automatic episode creation
  - no embedding before the explicit step
  - no searchability before the embedding
  - candidate seal only after the embedding
  - Feature Foundry cannot promote (its client never hits these routes)
  - platform audit records present at each step

All routes require admin + actor; state-changing episode/embedding/seal require
explicit confirm.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app
from app.services.hr_feature_store import episode_embedding_creation as EEC
from app.services.hr_feature_store import episode_seal as ESEAL

ADMIN = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}
VEC = [0.01] * 256
AUTHORED = {
    "name": "Jan 2026 vol spike (no recession)", "asset_class": "macro",
    "macro_conditions_entering": "Late-cycle, tight credit, elevated VIX.",
    "catalyst_trigger": "Sharp but contained risk-off.",
    "timeline_narrative": "Spiked two weeks, mean-reverted, no recession.",
    "start_date": "2026-01-05",
}


class WorldRepo:
    """One shared world: candidate store + episodes + episode_embeddings, all in
    memory, implementing the C4/C10/C12/C13 repo contracts. Tracks writes so the
    smoke can assert nothing happens out of order."""

    def __init__(self):
        self.candidates: dict[str, dict] = {}
        self.episodes: dict[str, dict] = {}
        self.embeddings: set[tuple] = set()
        self._eid = 0

    # ---- C4 candidate store ----
    def insert(self, c):
        self.candidates[c["candidate_id"]] = dict(c); return dict(c)

    def get(self, cid):
        c = self.candidates.get(cid); return dict(c) if c else None

    def list(self, *, status=None, candidate_type=None):
        return [dict(c) for c in self.candidates.values()
                if (status is None or c["approval_status"] == status)]

    def update(self, cid, patch):
        self.candidates[cid].update(patch); return dict(self.candidates[cid])

    def existing_model_versions(self):
        return set()

    # ---- C10 episode store ----
    def get_candidate(self, cid):
        return self.get(cid)

    def insert_episode(self, episode):
        self._eid += 1
        eid = f"ep-{self._eid}"
        self.episodes[eid] = {"id": eid, **episode}
        return eid

    # ---- C12 embedding store ----
    def get_episode(self, eid):
        return dict(self.episodes[eid]) if eid in self.episodes else None

    def existing_embedding(self, episode_id, embedding_type, model_version):
        return (episode_id, embedding_type, model_version) in self.embeddings

    def insert_episode_embedding(self, row):
        key = (row["episode_id"], row["embedding_type"], row["model_version"])
        if key in self.embeddings:
            return None  # ON CONFLICT DO NOTHING
        self.embeddings.add(key)
        return f"emb-{len(self.embeddings)}"

    # ---- C13 seal store ----
    def episode_exists(self, episode_id):
        return episode_id in self.episodes

    def embedding_exists(self, episode_id, embedding_type, model_version):
        return (episode_id, embedding_type, model_version) in self.embeddings


def _approved_candidate(cid="sc1"):
    return {
        "candidate_id": cid, "observation_id": "obs-1", "as_of_date": "2026-01-05",
        "model_obs_version": "hr-fs-v1", "embedding_model_version": "concat-l2-v1",
        "candidate_type": "non_event_anchor", "candidate_label": "non_event",
        "source_quality": "live", "proposed_episode_name": "n", "proposed_asset_class": "macro",
        "narrative_summary": "x", "approval_status": "needs_review", "feature_vector": VEC,
        "promotion_receipt_json": {},
        "calibration_evidence_json": {"brier_score": 0.18, "permutation_p_value": 0.01},
        "no_lookahead_audit_json": {"passed": True, "violations": []},
        "non_event_context_json": {"crisis_anchor_count": 2, "non_event_count": 6, "non_event_to_event_ratio": 3.0},
        "features_snapshot": {"vix": 0.7}, "lineage_json": {"inputs": ["fred:VIXCLS"]},
    }


@pytest.fixture
def world(monkeypatch):
    w = WorldRepo()
    audit = []
    monkeypatch.setattr(ROUTE, "_repo_factory", lambda: w)
    monkeypatch.setattr(ROUTE, "_episode_repo_factory", lambda: w)
    monkeypatch.setattr(ROUTE, "_embedding_repo_factory", lambda: w)
    monkeypatch.setattr(ROUTE, "_seal_repo_factory", lambda: w)
    monkeypatch.setattr(ROUTE, "_audit_writer", lambda **k: (audit.append(k), "aid")[1])
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    return TestClient(app), w, audit


def test_full_protected_promotion_flow(world):
    cl, w, audit = world
    w.insert(_approved_candidate())
    P = "/api/hr/v1/promotion-candidates/sc1"

    # 1. approve (needs_review → approved)
    assert cl.post(f"{P}/approve", headers=ADMIN, json={}).json()["approval_status"] == "approved"

    # 2. cannot create an embedding yet (no episode) — no searchability shortcut
    r = cl.post(f"{P}/create-episode-embedding", headers=ADMIN,
                json={"confirm": True, "episode_id": "ep-1", "feature_vector": VEC})
    assert r.status_code == 409 and "episode_not_found" in r.json()["detail"]["blocked_reasons"]
    assert w.embeddings == set()  # nothing written

    # 3. validate then create episode (NOT searchable)
    assert cl.post(f"{P}/validate-episode", headers=ADMIN, json={"episode": AUTHORED}).json()["status"] == "eligible"
    created = cl.post(f"{P}/create-episode", headers=ADMIN, json={"confirm": True, "episode": AUTHORED}).json()
    assert created["status"] == "created" and created["searchable"] is False
    eid = created["episode_id"]
    assert eid in w.episodes
    # episode carries promotion origin (C11)
    assert w.episodes[eid]["origin_candidate_id"] == "sc1"
    assert w.episodes[eid]["source"] == "promotion"

    # 4. cannot seal before embedding
    r = cl.post(f"{P}/seal-promoted-episode", headers=ADMIN, json={"confirm": True, "episode_id": eid})
    assert r.status_code == 409 and "episode_embedding_missing" in r.json()["detail"]["blocked_reasons"]
    assert w.candidates["sc1"]["approval_status"] == "approved"  # not sealed

    # 5. create embedding → searchable
    emb = cl.post(f"{P}/create-episode-embedding", headers=ADMIN,
                  json={"confirm": True, "episode_id": eid, "feature_vector": VEC}).json()
    assert emb["searchable"] is True and emb["embedding_status"] == "created"
    assert (eid, "full_state", "concat-l2-v1") in w.embeddings

    # 6. seal → promoted (terminal), via the C4 service (receipt advances)
    sealed = cl.post(f"{P}/seal-promoted-episode", headers=ADMIN, json={"confirm": True, "episode_id": eid}).json()
    assert sealed["status"] == "sealed" and sealed["approval_status"] == "promoted"
    assert sealed["created_episode_id"] == eid
    assert w.candidates["sc1"]["approval_status"] == "promoted"

    # 7. promoted is terminal — no further approval transition
    assert cl.post(f"{P}/approve", headers=ADMIN, json={}).status_code == 409

    # safety: audit recorded across the flow
    tools = [c["tool_name"] for c in audit]
    for step in ("approve_candidate", "episode_created_from_candidate",
                 "episode_embedding_created", "candidate_promoted_sealed"):
        assert step in tools


def test_confirmation_required_each_write_step(world):
    cl, w, _ = world
    c = _approved_candidate("sc2"); c["approval_status"] = "approved"
    w.insert(c)
    P = "/api/hr/v1/promotion-candidates/sc2"
    # create-episode without confirm
    assert "confirmation_required" in cl.post(f"{P}/create-episode", headers=ADMIN,
        json={"confirm": False, "episode": AUTHORED}).json()["detail"]["blocked_reasons"]
    # create-embedding without confirm
    assert "confirmation_required" in cl.post(f"{P}/create-episode-embedding", headers=ADMIN,
        json={"confirm": False, "episode_id": "ep-x", "feature_vector": VEC}).json()["detail"]["blocked_reasons"]
    # seal without confirm
    assert "confirmation_required" in cl.post(f"{P}/seal-promoted-episode", headers=ADMIN,
        json={"confirm": False, "episode_id": "ep-x"}).json()["detail"]["blocked_reasons"]
    assert w.episodes == {} and w.embeddings == set()


def test_admin_required_for_all_workflow_routes(world):
    cl, w, _ = world
    w.insert(_approved_candidate("sc3"))
    P = "/api/hr/v1/promotion-candidates/sc3"
    for route, body in [
        ("validate-episode", {"episode": AUTHORED}),
        ("create-episode", {"confirm": True, "episode": AUTHORED}),
        ("create-episode-embedding", {"confirm": True, "episode_id": "ep-1", "feature_vector": VEC}),
        ("seal-promoted-episode", {"confirm": True, "episode_id": "ep-1"}),
    ]:
        assert cl.post(f"{P}/{route}", json=body).status_code == 403  # no admin header


def test_retrieval_contract_constants_unchanged():
    # Feature-Foundry/search must keep seeing the same contract
    assert EEC.EMBEDDING_TYPE == "full_state" and EEC.FEATURE_VECTOR_DIM == 256


def test_feature_foundry_client_does_not_call_promotion_routes():
    # the Feature Foundry frontend client must remain read-only wrt promotion
    ff = Path(__file__).resolve().parents[2] / "repo-b" / "src" / "lib" / "historyrhymes" / "featureStore.ts"
    if ff.exists():
        src = ff.read_text(encoding="utf-8")
        assert "promotion-candidates" not in src
        assert "create-episode" not in src and "seal-promoted" not in src
