"""C13 — seal promoted episode candidate.

Fake repo combining the C4 candidate store + episode/embedding existence. No DB,
no network. Verifies: cannot seal before embedding, cannot seal non-approved/
terminal candidates, valid seal goes through the C4 service (status=promoted,
created_episode_id, receipt advances), audit written, promoted terminal, no extra
episode/embedding writes.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app
from app.services.hr_feature_store import episode_seal as ESEAL

ADMIN = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}


class FakeSealRepo:
    """C4 candidate store (get/update/existing_model_versions/insert_episode_embeddings)
    + episode/embedding existence. Tracks any episode/embedding writes (must stay 0)."""

    def __init__(self, candidate, *, episode=True, embedding=True):
        self.candidate = dict(candidate)
        self._episode = episode
        self._embedding = embedding
        self.embedding_writes = 0
        self.episode_writes = 0

    # C4 CandidateRepository contract
    def get(self, cid):
        return dict(self.candidate) if self.candidate["candidate_id"] == cid else None

    def update(self, cid, patch):
        self.candidate.update(patch)
        return dict(self.candidate)

    def existing_model_versions(self):
        return set()

    def insert_episode_embeddings(self, rows):  # must never be called by seal
        self.embedding_writes += len(rows)
        return len(rows)

    # C13 existence checks
    def episode_exists(self, episode_id):
        return self._episode

    def embedding_exists(self, episode_id, embedding_type, model_version):
        return self._embedding


def _candidate(**over):
    c = {"candidate_id": "c1", "approval_status": "approved", "approval_actor": "paul",
         "approval_timestamp": "2026-06-18T00:00:00Z",
         "promotion_receipt_json": {"version": 1, "candidate_id": "c1"}}
    c.update(over)
    return c


@pytest.fixture
def client(monkeypatch):
    calls = []
    monkeypatch.setattr(ROUTE, "_audit_writer", lambda **k: (calls.append(k), "aid")[1])
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    state = {}

    def _set(candidate, **kw):
        repo = FakeSealRepo(candidate, **kw)
        state["repo"] = repo
        monkeypatch.setattr(ROUTE, "_seal_repo_factory", lambda: repo)
        # the C6 _repo() (used for before-status) shares the same candidate
        monkeypatch.setattr(ROUTE, "_repo_factory", lambda: repo)
    return TestClient(app), _set, calls, state


def _seal(cl, **body):
    payload = {"confirm": True, "episode_id": "ep-1", "model_version": "concat-l2-v1"}
    payload.update(body)
    return cl.post("/api/hr/v1/promotion-candidates/c1/seal-promoted-episode", headers=ADMIN, json=payload)


# --------------------------------------------------------------------------- gating


def test_requires_admin(client):
    cl, setc, _, _ = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/seal-promoted-episode",
                json={"confirm": True, "episode_id": "ep-1"})
    assert r.status_code == 403


def test_requires_confirm(client):
    cl, setc, _, st = client
    setc(_candidate())
    r = _seal(cl, confirm=False)
    assert r.status_code == 409 and "confirmation_required" in r.json()["detail"]["blocked_reasons"]
    assert st["repo"].candidate["approval_status"] == "approved"  # not sealed


def test_requires_actor(client):
    cl, setc, _, _ = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/seal-promoted-episode",
                headers={"x-bm-platform-admin": "true"}, json={"confirm": True, "episode_id": "ep-1"})
    assert "missing_actor" in r.json()["detail"]["blocked_reasons"]


# --------------------------------------------------------------------------- preconditions


def test_cannot_seal_before_embedding(client):
    cl, setc, _, st = client
    setc(_candidate(), embedding=False)
    r = _seal(cl)
    assert r.status_code == 409
    assert "episode_embedding_missing" in r.json()["detail"]["blocked_reasons"]
    assert st["repo"].candidate["approval_status"] == "approved"  # not sealed


def test_cannot_seal_without_episode(client):
    cl, setc, _, _ = client
    setc(_candidate(), episode=False)
    r = _seal(cl)
    assert "episode_not_found" in r.json()["detail"]["blocked_reasons"]


@pytest.mark.parametrize("status,reason", [
    ("needs_review", "candidate_not_approved"),
    ("rejected", "candidate_not_approved"),
    ("promoted", "candidate_already_promoted"),
])
def test_non_approved_blocks(client, status, reason):
    cl, setc, _, _ = client
    setc(_candidate(approval_status=status))
    r = _seal(cl)
    assert reason in r.json()["detail"]["blocked_reasons"]


# --------------------------------------------------------------------------- success


def test_valid_seal_promotes_via_c4(client):
    cl, setc, calls, st = client
    setc(_candidate())
    r = _seal(cl)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "sealed"
    assert body["approval_status"] == "promoted"
    assert body["created_episode_id"] == "ep-1"
    assert body["receipt_version"] == 2          # C4 advanced the receipt
    assert body["searchable"] is True
    # candidate updated only through the C4 service; no episode/embedding writes here
    assert st["repo"].embedding_writes == 0 and st["repo"].episode_writes == 0
    assert calls[-1]["tool_name"] == "candidate_promoted_sealed" and calls[-1]["success"] is True


def test_seal_preserves_receipt_history(client):
    cl, setc, _, st = client
    setc(_candidate())
    _seal(cl)
    receipt = st["repo"].candidate["promotion_receipt_json"]
    assert receipt["version"] == 2
    assert len(receipt.get("receipt_history", [])) == 1  # prior v1 preserved


def test_promoted_is_terminal_after_seal(client):
    cl, setc, _, _ = client
    setc(_candidate())
    _seal(cl)
    # a second seal now sees promoted → blocked
    r2 = _seal(cl)
    assert r2.status_code == 409
    assert "candidate_already_promoted" in r2.json()["detail"]["blocked_reasons"]


# --------------------------------------------------------------------------- scope


def test_seal_service_does_no_episode_or_embedding_writes():
    src = Path(ESEAL.__file__).read_text(encoding="utf-8").lower()
    assert "insert into episode_embeddings" not in src
    assert "insert into episodes" not in src
    assert "encode_state_vector(" not in src
    # it MUST call the C4 link (that's the whole point), but write nothing else
    assert "record_promoted_episode_link(" in src
