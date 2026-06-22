"""C6 — protected promotion-candidate API.

Exercises the route layer over an in-memory fake repo (no production DB, no
network). Asserts: admin gate, actor requirement, list filters/envelope, detail
packet, exact blocked-reason 409 envelope, route→C4 mapping, and that
link-promoted-episode creates no episode/embedding.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app

ADMIN_HEADERS = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}


class FakeRepo:
    _shared: dict[str, dict] = {}

    def __init__(self):
        self.rows = FakeRepo._shared

    def insert(self, c):
        self.rows[c["candidate_id"]] = dict(c)
        return dict(c)

    def get(self, cid):
        r = self.rows.get(cid)
        return dict(r) if r else None

    def list(self, *, status=None, candidate_type=None):
        out = list(self.rows.values())
        if status:
            out = [r for r in out if r["approval_status"] == status]
        if candidate_type:
            out = [r for r in out if r["candidate_type"] == candidate_type]
        return [dict(r) for r in out]

    def update(self, cid, patch):
        self.rows[cid].update(patch)
        return dict(self.rows[cid])


@pytest.fixture
def client(monkeypatch):
    FakeRepo._shared = {}
    monkeypatch.setattr(ROUTE, "_repo_factory", FakeRepo)
    # authenticated context (the admin header is still required separately)
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    return TestClient(app)


def _seed(client, cid="cand-1", *, with_evidence=True, ratio=3.0, status="draft"):
    repo = FakeRepo()
    c = {
        "candidate_id": cid, "observation_id": "obs-1", "as_of_date": "2026-01-15",
        "model_obs_version": "hr-fs-v1", "embedding_model_version": "state_vector_encoder_v1",
        "candidate_type": "non_event_anchor", "candidate_label": "non_event",
        "source_quality": "live", "proposed_episode_name": "n", "proposed_asset_class": "macro",
        "proposed_tags": [], "narrative_summary": "x", "approval_status": status,
        "promotion_receipt_json": {},
    }
    if with_evidence:
        c.update({
            "calibration_evidence_json": {"brier_score": 0.18, "permutation_p_value": 0.01},
            "no_lookahead_audit_json": {"passed": True, "violations": []},
            "non_event_context_json": {"crisis_anchor_count": 2, "non_event_count": int(2 * ratio),
                                       "non_event_to_event_ratio": ratio},
            "features_snapshot": {"vix": 0.7}, "lineage_json": {"inputs": ["fred:VIXCLS"]},
        })
    repo.insert(c)
    return cid


# --------------------------------------------------------------------------- auth


def test_routes_require_admin_header(client):
    # authenticated but NOT admin → 403
    r = client.get("/api/hr/v1/promotion-candidates")
    assert r.status_code == 403


def test_routes_require_authentication(client, monkeypatch):
    from fastapi import HTTPException
    def _unauth(request):
        raise HTTPException(status_code=401, detail="Authentication required")
    monkeypatch.setattr(ROUTE, "require_authenticated_request", _unauth)
    r = client.get("/api/hr/v1/promotion-candidates", headers=ADMIN_HEADERS)
    assert r.status_code == 401


# --------------------------------------------------------------------------- list / get


def test_list_returns_stable_envelope(client):
    _seed(client, "a")
    _seed(client, "b")
    r = client.get("/api/hr/v1/promotion-candidates", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"items", "count", "limit", "offset"}
    assert body["count"] == 2 and body["limit"] == 50 and body["offset"] == 0


def test_list_filters(client):
    _seed(client, "a", ratio=3.0)
    _seed(client, "b", ratio=0.5)  # below coverage target
    r = client.get("/api/hr/v1/promotion-candidates?coverage_status=pass", headers=ADMIN_HEADERS)
    assert {c["candidate_id"] for c in r.json()["items"]} == {"a"}
    r2 = client.get("/api/hr/v1/promotion-candidates?approval_status=approved", headers=ADMIN_HEADERS)
    assert r2.json()["count"] == 0


def test_get_returns_detail_packet(client):
    _seed(client, "a")
    r = client.get("/api/hr/v1/promotion-candidates/a", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "a"
    assert "allowed_actions" in body and "blocked_reasons" in body and "coverage" in body


def test_get_unknown_is_404_with_reason(client):
    r = client.get("/api/hr/v1/promotion-candidates/nope", headers=ADMIN_HEADERS)
    assert r.status_code == 404
    assert r.json()["detail"]["blocked_reasons"] == ["candidate_not_found"]


# --------------------------------------------------------------------------- transitions → C4


def test_needs_review_maps_to_service(client):
    _seed(client, "a")
    r = client.post("/api/hr/v1/promotion-candidates/a/needs-review", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["approval_status"] == "needs_review"


def test_approve_maps_to_service_and_records_actor(client):
    _seed(client, "a", status="needs_review")
    r = client.post("/api/hr/v1/promotion-candidates/a/approve",
                    headers=ADMIN_HEADERS, json={"reviewer_notes": "ok"})
    assert r.status_code == 200
    c = r.json()["candidate"]
    assert c["approval_status"] == "approved"
    assert c["approval_actor"] == "paul"
    assert c["promotion_receipt_json"]["version"] == 1


def test_reject_supersede_map_to_service(client):
    _seed(client, "a", status="needs_review")
    r = client.post("/api/hr/v1/promotion-candidates/a/reject",
                    headers=ADMIN_HEADERS, json={"rejection_reason": "no"})
    assert r.json()["approval_status"] == "rejected"

    _seed(client, "b", status="needs_review")
    client.post("/api/hr/v1/promotion-candidates/b/approve", headers=ADMIN_HEADERS, json={})
    r2 = client.post("/api/hr/v1/promotion-candidates/b/supersede",
                     headers=ADMIN_HEADERS, json={"superseded_by_candidate_id": "c"})
    assert r2.json()["approval_status"] == "superseded"


def test_needs_evidence_maps_to_service(client):
    _seed(client, "a")
    r = client.post("/api/hr/v1/promotion-candidates/a/needs-evidence", headers=ADMIN_HEADERS)
    assert r.status_code == 200 and r.json()["approval_status"] == "needs_evidence"


# --------------------------------------------------------------------------- blocked envelope


def test_actor_required_for_approve(client, monkeypatch):
    _seed(client, "a", status="needs_review")
    # admin header without an actor
    r = client.post("/api/hr/v1/promotion-candidates/a/approve",
                    headers={"x-bm-platform-admin": "true"}, json={})
    assert r.status_code == 409
    d = r.json()["detail"]
    assert d["status"] == "blocked" and d["blocked_reasons"] == ["missing_approval_actor"]


def test_missing_evidence_blocks_needs_review_with_exact_reasons(client):
    _seed(client, "a", with_evidence=False)
    r = client.post("/api/hr/v1/promotion-candidates/a/needs-review", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    d = r.json()["detail"]
    assert d["status"] == "blocked"
    for reason in ("missing_calibration_evidence", "missing_no_lookahead_audit",
                   "missing_non_event_context", "missing_features_snapshot", "missing_lineage"):
        assert reason in d["blocked_reasons"]
    # exact reasons, never a generic banner
    for bad in ("validation_failed", "request_failed", "not_allowed"):
        assert bad not in d["blocked_reasons"]


def test_invalid_transition_returns_409_exact_reason(client):
    _seed(client, "a")  # draft
    r = client.post("/api/hr/v1/promotion-candidates/a/approve",
                    headers=ADMIN_HEADERS, json={})
    assert r.status_code == 409
    d = r.json()["detail"]
    assert "invalid_status_transition:draft->approved" in d["blocked_reasons"]
    assert d["current_status"] == "draft"
    assert "allowed_actions" in d


def test_low_coverage_blocks_then_override(client):
    _seed(client, "a", status="needs_review", ratio=0.5)
    r = client.post("/api/hr/v1/promotion-candidates/a/approve", headers=ADMIN_HEADERS, json={})
    assert r.status_code == 409
    assert "insufficient_non_event_coverage" in r.json()["detail"]["blocked_reasons"]
    r2 = client.post("/api/hr/v1/promotion-candidates/a/approve", headers=ADMIN_HEADERS,
                     json={"override_reason": "rare regime"})
    assert r2.status_code == 200
    assert r2.json()["candidate"]["non_event_context_json"]["override_reason"] == "rare regime"


# --------------------------------------------------------------------------- link promoted episode


def test_link_promoted_episode_links_only_no_creation(client):
    _seed(client, "a", status="needs_review")
    client.post("/api/hr/v1/promotion-candidates/a/approve", headers=ADMIN_HEADERS, json={})
    r = client.post("/api/hr/v1/promotion-candidates/a/link-promoted-episode",
                    headers=ADMIN_HEADERS, json={"created_episode_id": "ep-123"})
    assert r.status_code == 200
    c = r.json()["candidate"]
    assert c["approval_status"] == "promoted" and c["created_episode_id"] == "ep-123"
    assert c["promotion_receipt_json"]["version"] == 2  # approval + promotion receipts


def test_create_route_maps_to_service(client):
    payload = {
        "candidate_id": "new-1", "observation_id": "obs-9", "as_of_date": "2026-02-01",
        "model_obs_version": "hr-fs-v1", "embedding_model_version": "state_vector_encoder_v1",
        "candidate_type": "regime_shift", "candidate_label": "regime_shift",
        "source_quality": "live", "proposed_episode_name": "n", "proposed_asset_class": "macro",
        "narrative_summary": "x",
    }
    r = client.post("/api/hr/v1/promotion-candidates", headers=ADMIN_HEADERS, json=payload)
    assert r.status_code == 200 and r.json()["approval_status"] == "draft"


# --------------------------------------------------------------------------- scope guards


def test_route_has_no_episode_or_embedding_or_llm_imports():
    src = Path(ROUTE.__file__).read_text(encoding="utf-8").lower()
    assert "insert into episode_embeddings" not in src
    assert "insert into episodes" not in src
    assert "encode_state_vector" not in src
    assert "import openai" not in src and "import anthropic" not in src
    assert "ade_connectors" not in src and "cre_source_registry" not in src


def test_route_prefix_is_hr_v1():
    assert ROUTE.router.prefix == "/api/hr/v1/promotion-candidates"
