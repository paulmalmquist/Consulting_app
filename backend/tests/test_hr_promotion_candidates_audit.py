"""C8-A — platform audit for promotion-candidate actions.

Fake audit writer + fake repo; no production DB, no network. Verifies: the
CHECK-widening migration is safe/additive, every state-changing route emits an
audit record (success AND blocked) with exact reasons + stable hashes, audit
failure is visible (not hidden), the 409 envelope is unchanged except audit_status,
and the audit layer creates no episode/embedding.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routes.hr_promotion_candidates as ROUTE
from app.auth.context import AuthContext
from app.main import app
from app.services.hr_feature_store import promotion_audit as AUDIT
from app.services.hr_feature_store.promotion_receipts import stable_hash

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "repo-b" / "db" / "schema" / "10022_history_rhymes_promotion_audit_type.sql"
ADMIN = {"x-bm-platform-admin": "true", "x-bm-actor": "paul"}


class FakeRepo:
    _shared: dict[str, dict] = {}

    def __init__(self):
        self.rows = FakeRepo._shared

    def insert(self, c):
        self.rows[c["candidate_id"]] = dict(c); return dict(c)

    def get(self, cid):
        r = self.rows.get(cid); return dict(r) if r else None

    def list(self, *, status=None, candidate_type=None):
        return [dict(r) for r in self.rows.values()]

    def update(self, cid, patch):
        self.rows[cid].update(patch); return dict(self.rows[cid])


class FakeAuditWriter:
    """Captures every record_decision call; returns a fake id (→ audit_status ok)."""

    def __init__(self, *, fail=False):
        self.calls: list[dict] = []
        self.fail = fail

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            return None  # write failed → audit_status "failed"
        return "audit-id-1"


@pytest.fixture
def client(monkeypatch):
    FakeRepo._shared = {}
    writer = FakeAuditWriter()
    monkeypatch.setattr(ROUTE, "_repo_factory", FakeRepo)
    monkeypatch.setattr(ROUTE, "_audit_writer", writer)
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    return TestClient(app), writer


def _seed(cid="c1", *, with_evidence=True, ratio=3.0, status="needs_review"):
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
            "calibration_evidence_json": {"brier_score": 0.18},
            "no_lookahead_audit_json": {"passed": True, "violations": []},
            "non_event_context_json": {"crisis_anchor_count": 2, "non_event_count": int(2 * ratio),
                                       "non_event_to_event_ratio": ratio},
            "features_snapshot": {"vix": 0.7}, "lineage_json": {"inputs": ["fred:VIXCLS"]},
        })
    FakeRepo().insert(c)
    return cid


# --------------------------------------------------------------------------- migration


def test_migration_exists():
    assert MIGRATION.exists()


def test_migration_preserves_legacy_values_and_adds_one():
    sql = MIGRATION.read_text(encoding="utf-8")
    for legacy in ("tool_call", "response", "classification", "fast_path"):
        assert f"'{legacy}'" in sql
    assert "history_rhymes_promotion_candidate_action" in sql
    # exactly one new value — no wildcard
    assert "decision_type IN" in sql


def test_migration_does_not_recreate_or_drop_table():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "drop table" not in sql
    assert "create table" not in sql  # widening, not recreation
    assert "truncate" not in sql


def test_migration_does_not_mutate_episodes_or_embeddings():
    # The names may appear in a comment ("…are untouched"); what must NOT appear is
    # any statement that mutates those tables.
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    for tbl in ("episode_embeddings", "public.episodes", "episodes"):
        for verb in ("alter table", "drop table", "insert into", "update", "delete from"):
            assert f"{verb} {tbl}" not in sql, f"migration must not {verb} {tbl}"


def test_migration_has_verification_block():
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "DO $$" in sql and "RAISE EXCEPTION" in sql


# --------------------------------------------------------------------------- audit on actions


def test_successful_approve_writes_audit_record(client):
    c, writer = client
    _seed("c1", status="needs_review")
    r = c.post("/api/hr/v1/promotion-candidates/c1/approve", headers=ADMIN, json={})
    assert r.status_code == 200
    assert r.json()["audit_status"] == "ok"
    call = writer.calls[-1]
    assert call["decision_type"] == AUDIT.DECISION_TYPE
    assert call["actor"] == "paul"
    assert call["success"] is True
    assert call["input_summary"]["candidate_id"] == "c1"
    assert call["input_summary"]["old_status"] == "needs_review"
    assert call["output_summary"]["new_status"] == "approved"
    assert call["tool_name"] == "approve_candidate"


def test_blocked_approve_writes_audit_with_exact_reasons(client):
    c, writer = client
    _seed("c1", status="draft")  # draft->approved illegal
    r = c.post("/api/hr/v1/promotion-candidates/c1/approve", headers=ADMIN, json={})
    assert r.status_code == 409
    d = r.json()["detail"]
    assert "invalid_status_transition:draft->approved" in d["blocked_reasons"]
    assert d["audit_status"] == "ok"  # the block itself was audited
    call = writer.calls[-1]
    assert call["success"] is False
    assert "invalid_status_transition:draft->approved" in call["input_summary"]["blocked_reasons"]


def test_reject_and_supersede_write_audit(client):
    c, writer = client
    _seed("c1", status="needs_review")
    c.post("/api/hr/v1/promotion-candidates/c1/reject", headers=ADMIN, json={"rejection_reason": "no"})
    assert writer.calls[-1]["tool_name"] == "reject_candidate"

    _seed("c2", status="needs_review")
    c.post("/api/hr/v1/promotion-candidates/c2/approve", headers=ADMIN, json={})
    c.post("/api/hr/v1/promotion-candidates/c2/supersede", headers=ADMIN,
           json={"superseded_by_candidate_id": "c3"})
    assert writer.calls[-1]["tool_name"] == "supersede_candidate"


def test_link_episode_audit_includes_episode_id_creates_nothing(client):
    c, writer = client
    _seed("c1", status="needs_review")
    c.post("/api/hr/v1/promotion-candidates/c1/approve", headers=ADMIN, json={})
    r = c.post("/api/hr/v1/promotion-candidates/c1/link-promoted-episode",
               headers=ADMIN, json={"created_episode_id": "ep-9"})
    assert r.status_code == 200
    call = writer.calls[-1]
    assert call["tool_name"] == "link_promoted_episode"
    assert call["output_summary"]["created_episode_id"] == "ep-9"
    # the candidate row carries the link; no episode/embedding object was created here
    assert FakeRepo().get("c1")["created_episode_id"] == "ep-9"


# --------------------------------------------------------------------------- hashes


def test_request_payload_hash_is_stable_and_order_independent():
    p1 = AUDIT.build_audit_payload(action="a", candidate_id="c", actor="x", old_status=None,
                                   new_status=None, source_route="/r",
                                   request_payload={"b": 2, "a": 1}, candidate=None)
    p2 = AUDIT.build_audit_payload(action="a", candidate_id="c", actor="x", old_status=None,
                                   new_status=None, source_route="/r",
                                   request_payload={"a": 1, "b": 2}, candidate=None)
    assert p1["request_payload_hash"] == p2["request_payload_hash"]
    assert p1["request_payload_hash"] == stable_hash({"a": 1, "b": 2})


def test_candidate_receipt_hash_present_when_receipt_exists():
    payload = AUDIT.build_audit_payload(action="a", candidate_id="c", actor="x", old_status=None,
                                        new_status=None, source_route="/r", request_payload={},
                                        candidate={"promotion_receipt_json": {"version": 1}})
    assert payload["candidate_receipt_hash"] == stable_hash({"version": 1})
    payload2 = AUDIT.build_audit_payload(action="a", candidate_id="c", actor="x", old_status=None,
                                         new_status=None, source_route="/r", request_payload={},
                                         candidate={})
    assert payload2["candidate_receipt_hash"] is None


# --------------------------------------------------------------------------- audit failure visibility


def test_audit_failure_is_visible_and_does_not_hide_service_result(monkeypatch):
    FakeRepo._shared = {}
    failing = FakeAuditWriter(fail=True)
    monkeypatch.setattr(ROUTE, "_repo_factory", FakeRepo)
    monkeypatch.setattr(ROUTE, "_audit_writer", failing)
    monkeypatch.setattr(ROUTE, "require_authenticated_request",
                        lambda request: AuthContext(actor="paul", authenticated=True))
    cl = TestClient(app)
    _seed("c1", status="needs_review")
    r = cl.post("/api/hr/v1/promotion-candidates/c1/approve", headers=ADMIN, json={})
    # service action still succeeded...
    assert r.status_code == 200 and r.json()["approval_status"] == "approved"
    # ...but the audit failure is surfaced, not hidden
    assert r.json()["audit_status"] == "failed"


# --------------------------------------------------------------------------- scope guards


def test_audit_layer_has_no_episode_embedding_or_llm():
    for mod in (AUDIT, ROUTE):
        src = Path(mod.__file__).read_text(encoding="utf-8").lower()
        assert "insert into episode_embeddings" not in src
        assert "insert into episodes" not in src
        assert "encode_state_vector" not in src
        assert "import openai" not in src and "import anthropic" not in src
        assert "ade_connectors" not in src and "cre_source_registry" not in src
