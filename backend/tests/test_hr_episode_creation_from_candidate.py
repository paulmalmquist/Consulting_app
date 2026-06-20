"""C10 — approved-candidate episode creation API.

Fake episode repo + fake audit writer; no production DB, no network. Verifies
admin/actor/confirm gating, eligibility blocks, exact per-field reasons,
placeholder rejection, one-episode creation, searchable=false, audit, and that
C10 never writes an embedding, seals the candidate, or calls an encoder.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app
from app.services.hr_feature_store import episode_creation as EC

ADMIN = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}

AUTHORED = {
    "name": "Jan 2026 vol spike (no recession)",
    "asset_class": "macro",
    "macro_conditions_entering": "Elevated VIX, tight credit, late-cycle.",
    "catalyst_trigger": "A sharp but contained risk-off episode.",
    "timeline_narrative": "Spike over two weeks, mean-reverted without a recession.",
    "start_date": "2026-01-05",
}


class FakeEpisodeRepo:
    last_inserted: dict | None = None
    insert_count = 0

    def __init__(self, candidate):
        self._candidate = candidate

    def get_candidate(self, candidate_id):
        return dict(self._candidate) if self._candidate and self._candidate["candidate_id"] == candidate_id else None

    def insert_episode(self, episode):
        FakeEpisodeRepo.last_inserted = dict(episode)
        FakeEpisodeRepo.insert_count += 1
        return "ep-created-1"


class FakeAuditWriter:
    def __init__(self):
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return "audit-id"


def _candidate(**over):
    c = {
        "candidate_id": "c1", "approval_status": "approved", "approval_actor": "paul",
        "approval_timestamp": "2026-06-18T00:00:00Z", "promotion_receipt_json": {"version": 1},
        "calibration_evidence_json": {"brier_score": 0.18},
        "no_lookahead_audit_json": {"passed": True, "violations": []},
        "non_event_context_json": {"crisis_anchor_count": 2, "non_event_count": 6},
        "features_snapshot": {"vix": 0.7}, "lineage_json": {"inputs": ["fred:VIXCLS"]},
        "narrative_summary": "x", "candidate_label": "non_event",
        "proposed_episode_name": None, "proposed_asset_class": None,
    }
    c.update(over)
    return c


@pytest.fixture
def client(monkeypatch):
    FakeEpisodeRepo.last_inserted = None
    FakeEpisodeRepo.insert_count = 0
    writer = FakeAuditWriter()
    monkeypatch.setattr(ROUTE, "_audit_writer", writer)
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    def _set(candidate):
        monkeypatch.setattr(ROUTE, "_episode_repo_factory", lambda: FakeEpisodeRepo(candidate))
    return TestClient(app), writer, _set


# --------------------------------------------------------------------------- auth / gating


def test_create_requires_admin(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                json={"confirm": True, "episode": AUTHORED})  # no admin header
    assert r.status_code == 403


def test_create_requires_actor(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers={"x-bm-platform-admin": "true"}, json={"confirm": True, "episode": AUTHORED})
    assert r.status_code == 409
    assert "missing_actor" in r.json()["detail"]["blocked_reasons"]


def test_create_requires_confirm(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": False, "episode": AUTHORED})
    assert r.status_code == 409
    assert "confirmation_required" in r.json()["detail"]["blocked_reasons"]
    assert FakeEpisodeRepo.insert_count == 0


# --------------------------------------------------------------------------- eligibility


@pytest.mark.parametrize("status,reason", [
    ("draft", "candidate_not_approved"),
    ("needs_review", "candidate_not_approved"),
    ("rejected", "candidate_rejected"),
    ("superseded", "candidate_superseded"),
    ("promoted", "candidate_already_promoted"),
])
def test_non_approved_status_blocks(client, status, reason):
    cl, _, setc = client
    setc(_candidate(approval_status=status))
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": AUTHORED})
    assert r.status_code == 409
    assert reason in r.json()["detail"]["blocked_reasons"]
    assert FakeEpisodeRepo.insert_count == 0


def test_no_lookahead_failed_blocks(client):
    cl, _, setc = client
    setc(_candidate(no_lookahead_audit_json={"passed": False, "violations": ["feature:forward_return_30d"]}))
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": AUTHORED})
    assert "no_lookahead_failed" in r.json()["detail"]["blocked_reasons"]


def test_missing_evidence_blocks(client):
    cl, _, setc = client
    setc(_candidate(calibration_evidence_json={}, non_event_context_json={}))
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": AUTHORED})
    reasons = r.json()["detail"]["blocked_reasons"]
    assert "missing_calibration_evidence" in reasons and "missing_non_event_context" in reasons


# --------------------------------------------------------------------------- required fields


@pytest.mark.parametrize("drop,reason", [
    ("name", "missing_episode_name"),
    ("asset_class", "missing_asset_class"),
    ("macro_conditions_entering", "missing_macro_conditions_entering"),
    ("catalyst_trigger", "missing_catalyst_trigger"),
    ("timeline_narrative", "missing_timeline_narrative"),
    ("start_date", "missing_start_date"),
])
def test_missing_required_field_blocks(client, drop, reason):
    cl, _, setc = client
    setc(_candidate())
    epi = {k: v for k, v in AUTHORED.items() if k != drop}
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": epi})
    assert r.status_code == 409
    assert reason in r.json()["detail"]["blocked_reasons"]
    assert FakeEpisodeRepo.insert_count == 0


def test_all_missing_fields_returned_together(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": {}})
    reasons = r.json()["detail"]["blocked_reasons"]
    for expect in ("missing_episode_name", "missing_asset_class", "missing_macro_conditions_entering",
                   "missing_catalyst_trigger", "missing_timeline_narrative", "missing_start_date"):
        assert expect in reasons


@pytest.mark.parametrize("placeholder", ["TBD", "Unknown", "N/A", "Auto-generated", "Generated from observation"])
def test_placeholder_values_block(client, placeholder):
    cl, _, setc = client
    setc(_candidate())
    epi = {**AUTHORED, "timeline_narrative": placeholder}
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": epi})
    assert r.status_code == 409
    assert "missing_timeline_narrative" in r.json()["detail"]["blocked_reasons"]


# --------------------------------------------------------------------------- validate route


def test_validate_route_eligible(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/validate-episode",
                headers=ADMIN, json={"episode": AUTHORED})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "eligible" and body["blocked_reasons"] == []
    assert body["episode_preview"]["source"] == "promotion"
    assert FakeEpisodeRepo.insert_count == 0  # validation never writes


def test_validate_route_blocked_writes_audit(client):
    cl, writer, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/validate-episode",
                headers=ADMIN, json={"episode": {}})
    assert r.status_code == 409
    assert writer.calls[-1]["tool_name"] == "episode_validation_blocked"
    assert writer.calls[-1]["success"] is False


# --------------------------------------------------------------------------- creation


def test_valid_candidate_creates_one_episode(client):
    cl, _, setc = client
    setc(_candidate())
    r = cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
                headers=ADMIN, json={"confirm": True, "episode": AUTHORED})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "created"
    assert body["episode_id"] == "ep-created-1"
    assert body["searchable"] is False
    assert body["embedding_status"] == "not_created"
    assert body["next_required_step"] == "create_episode_embedding"
    assert FakeEpisodeRepo.insert_count == 1
    # only real episodes columns + source='promotion'
    assert FakeEpisodeRepo.last_inserted["source"] == "promotion"
    assert FakeEpisodeRepo.last_inserted["name"] == AUTHORED["name"]


def test_create_writes_audit_record(client):
    cl, writer, setc = client
    setc(_candidate())
    cl.post("/api/hr/v1/promotion-candidates/c1/create-episode",
            headers=ADMIN, json={"confirm": True, "episode": AUTHORED})
    call = writer.calls[-1]
    assert call["tool_name"] == "episode_created_from_candidate"
    assert call["success"] is True
    assert call["output_summary"]["created_episode_id"] == "ep-created-1"


# --------------------------------------------------------------------------- forbidden behavior


def test_create_does_not_seal_or_embed():
    # service-level: create_episode returns episode_id and never seals/embeds
    cand = _candidate()

    class R:
        seal_calls = 0

        def get_candidate(self, cid):
            return dict(cand)

        def insert_episode(self, e):
            return "ep-x"
    out = EC.create_episode(R(), "c1", AUTHORED)
    assert out["episode_id"] == "ep-x"
    assert out["searchable"] is False
    assert "record_promoted_episode_link" not in str(out)


def test_service_has_no_embedding_or_llm_or_seal():
    src = Path(EC.__file__).read_text(encoding="utf-8").lower()
    assert "insert into episode_embeddings" not in src
    assert "encode_state_vector(" not in src
    # may be NAMED in a docstring ("does NOT seal … record_promoted_episode_link"),
    # but must never be CALLED.
    assert "record_promoted_episode_link(" not in src
    assert "import openai" not in src and "import anthropic" not in src
    assert "ade_connectors" not in src and "cre_source_registry" not in src
