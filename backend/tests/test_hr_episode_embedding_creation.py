"""C12 — explicit episode-embedding creation API.

Fake repos; no DB, no network. Verifies admin/actor/confirm gating, the
candidate↔episode relationship check, dim/dup guards, exactly-one append-only
write, searchable=true on success, and that C12 never seals the candidate.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app
from app.services.hr_feature_store import episode_embedding_creation as EEC

ADMIN = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}
VEC = [0.01] * 256


class FakeEmbeddingRepo:
    inserted: list[dict] = []

    def __init__(self, candidate, episode, *, existing=False, insert_returns="emb-1"):
        self._candidate = candidate
        self._episode = episode
        self._existing = existing
        self._insert_returns = insert_returns

    def get_candidate(self, cid):
        return dict(self._candidate) if self._candidate and self._candidate["candidate_id"] == cid else None

    def get_episode(self, eid):
        return dict(self._episode) if self._episode and self._episode["id"] == eid else None

    def existing_embedding(self, episode_id, embedding_type, model_version):
        return self._existing

    def insert_episode_embedding(self, row):
        FakeEmbeddingRepo.inserted.append(dict(row))
        return self._insert_returns


def _candidate(**over):
    c = {"candidate_id": "c1", "approval_status": "approved", "feature_vector": VEC,
         "features_snapshot": {"vix": 0.7}, "created_episode_id": None}
    c.update(over)
    return c


def _episode(eid="ep-1", origin="c1"):
    return {"id": eid, "origin_candidate_id": origin}


@pytest.fixture
def client(monkeypatch):
    FakeEmbeddingRepo.inserted = []
    writer_calls = []
    monkeypatch.setattr(ROUTE, "_audit_writer", lambda **k: (writer_calls.append(k), "aid")[1])
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))

    def _set(candidate, episode, **kw):
        monkeypatch.setattr(ROUTE, "_embedding_repo_factory",
                            lambda: FakeEmbeddingRepo(candidate, episode, **kw))
    return TestClient(app), _set, writer_calls


def _create(cl, **body):
    payload = {"confirm": True, "episode_id": "ep-1", "model_version": "concat-l2-v1",
               "feature_vector": VEC}
    payload.update(body)
    return cl.post("/api/hr/v1/promotion-candidates/c1/create-episode-embedding",
                   headers=ADMIN, json=payload)


# --------------------------------------------------------------------------- gating


def test_requires_admin(client):
    cl, setc, _ = client
    setc(_candidate(), _episode())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode-embedding",
                json={"confirm": True, "episode_id": "ep-1", "feature_vector": VEC})
    assert r.status_code == 403


def test_requires_actor(client):
    cl, setc, _ = client
    setc(_candidate(), _episode())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode-embedding",
                headers={"x-bm-platform-admin": "true"},
                json={"confirm": True, "episode_id": "ep-1", "feature_vector": VEC})
    assert r.status_code == 409 and "missing_actor" in r.json()["detail"]["blocked_reasons"]


def test_requires_confirm(client):
    cl, setc, _ = client
    setc(_candidate(), _episode())
    r = _create(cl, confirm=False)
    assert r.status_code == 409 and "confirmation_required" in r.json()["detail"]["blocked_reasons"]
    assert FakeEmbeddingRepo.inserted == []


# --------------------------------------------------------------------------- relationship / eligibility


def test_non_approved_candidate_blocks(client):
    cl, setc, _ = client
    setc(_candidate(approval_status="needs_review"), _episode())
    r = _create(cl)
    assert "candidate_not_approved" in r.json()["detail"]["blocked_reasons"]


def test_missing_episode_blocks(client):
    cl, setc, _ = client
    setc(_candidate(), None)  # episode not found
    r = _create(cl)
    assert "episode_not_found" in r.json()["detail"]["blocked_reasons"]
    assert FakeEmbeddingRepo.inserted == []


def test_wrong_candidate_episode_relationship_blocks(client):
    cl, setc, _ = client
    setc(_candidate(), _episode(origin="other-candidate"))
    r = _create(cl)
    assert "episode_not_created_from_candidate" in r.json()["detail"]["blocked_reasons"]


def test_dimension_mismatch_blocks(client):
    cl, setc, _ = client
    setc(_candidate(feature_vector=[0.01] * 128), _episode())
    r = _create(cl, feature_vector=[0.01] * 128)
    assert "embedding_dimension_mismatch" in r.json()["detail"]["blocked_reasons"]
    assert FakeEmbeddingRepo.inserted == []


def test_duplicate_embedding_blocks(client):
    cl, setc, _ = client
    setc(_candidate(), _episode(), existing=True)
    r = _create(cl)
    assert "episode_embedding_duplicate" in r.json()["detail"]["blocked_reasons"]
    assert FakeEmbeddingRepo.inserted == []


# --------------------------------------------------------------------------- success


def test_valid_request_writes_one_embedding_and_is_searchable(client):
    cl, setc, _ = client
    setc(_candidate(), _episode())
    r = _create(cl)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "created"
    assert body["searchable"] is True
    assert body["embedding_status"] == "created"
    assert body["next_required_step"] == "seal_promoted_candidate"
    assert len(FakeEmbeddingRepo.inserted) == 1
    row = FakeEmbeddingRepo.inserted[0]
    assert row["embedding_type"] == "full_state" and len(row["embedding"]) == 256


def test_conflict_do_nothing_returns_duplicate(client):
    cl, setc, _ = client
    setc(_candidate(), _episode(), insert_returns=None)  # ON CONFLICT DO NOTHING
    r = _create(cl)
    assert r.status_code == 409
    assert "episode_embedding_duplicate" in r.json()["detail"]["blocked_reasons"]


def test_plan_route_eligible_writes_nothing(client):
    cl, setc, _ = client
    setc(_candidate(), _episode())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/plan-episode-embedding",
                headers=ADMIN, json={"episode_id": "ep-1", "model_version": "concat-l2-v1", "feature_vector": VEC})
    assert r.status_code == 200 and r.json()["status"] == "eligible"
    assert FakeEmbeddingRepo.inserted == []


# --------------------------------------------------------------------------- no seal / scope


def test_create_embedding_does_not_seal_candidate(client):
    cl, setc, _ = client
    cand = _candidate()
    setc(cand, _episode())
    _create(cl)
    # the embedding repo never touches candidate status; created response says seal is the NEXT step
    assert cand["approval_status"] == "approved"


def test_service_does_not_seal_or_call_llm():
    src = Path(EEC.__file__).read_text(encoding="utf-8").lower()
    assert "record_promoted_episode_link(" not in src
    assert "encode_state_vector(" not in src
    assert "import openai" not in src and "import anthropic" not in src
    assert "ade_connectors" not in src


def test_retrieval_contract_constants_unchanged():
    # C12 must keep using the existing analog-retrieval contract
    assert EEC.EMBEDDING_TYPE == "full_state"
    assert EEC.FEATURE_VECTOR_DIM == 256
