"""Ticket 2 tests (Dispatch 0004) — promotion state machine + fail-closed gate.

Covers the gate (assert_environment_promotable), promote/quarantine transitions,
the append-only event write, and the drift guard. The DB trigger
(environment_contract_enforce_promotion, migration 10005) is exercised separately
by a rolled-back live-schema validation; these tests pin the Python-side
fail-closed gate that refuses BEFORE the DB ever raises.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.services import environment_contract_v2 as svc
from app.services import environment_templates_v2 as _tpl


@pytest.fixture(autouse=True)
def _prime_template_cache():
    """Pure cache hit for get_template so it issues no query mid-verify (keeps the
    FakeCursor sequence deterministic regardless of test order)."""
    _tpl._CACHE["templates"] = [
        {
            "template_key": "repe",
            "version": 1,
            "display_name": "REPE",
            "description": None,
            "env_kind_default": "client",
            "industry_type": "real_estate_pe",
            "default_home_route": "/lab/env/{env_id}/re",
            "default_auth_mode": "private",
            "enabled_modules": ["repe"],
            "theme_tokens": {},
            "login_copy": {},
            "default_seed_pack": "repe_starter",
            "available_seed_packs": ["repe_starter"],
            "is_active": True,
            "is_latest": True,
            "notes": None,
        }
    ]
    _tpl._CACHE["fetched_at"] = float("inf")
    yield
    _tpl.invalidate_cache()


def _env_row(**over):
    base = {
        "env_id": str(uuid.uuid4()),
        "slug": "acme-repe",
        "template_key": "repe",
        "template_version": 1,
        "env_kind": "client",
        "lifecycle_state": "verified",
        "default_home_route": "/lab/env/{env_id}/re",
        "seed_pack_applied": "repe_starter",
        "seed_pack_version": 1,
    }
    base.update(over)
    return base


def _contract_row(env_id, promotion_state="verified", **over):
    base = {
        "env_id": env_id,
        "template_key": "repe",
        "template_version": 1,
        "canonical_runtime_path": "/lab/env/{env_id}/re",
        "runtime_mode": "interactive",
        "deployment_target": "local",
        "seed_pack_version": 1,
        "required_capabilities": ["repe"],
        "required_smoke_tests": [],
        "required_eval_suite": None,
        "authoritative_state_requirements": {},
        "compatibility_version": "env_contract_v1",
        "promotion_state": promotion_state,
    }
    base.update(over)
    return base


def _queue_gate(cur, env_row, contract_row, *, template_active=True):
    """Queue the FakeCursor sequence for assert_environment_promotable:

    verify_environment_contract(materialize=True):
      get_or_derive_contract: contract HIT (return early)
      verify block: env row -> template active probe -> materialize UPDATE (no fetch)
    gate's own block: contract row -> env row
    """
    cur.push_result([contract_row])  # get_or_derive: contract hit
    cur.push_result([env_row])  # verify: _load_env_row
    cur.push_result([{"1": 1}] if template_active else [])  # template probe
    # materialize UPDATE: no fetch
    cur.push_result([contract_row])  # gate: _load_contract_row
    cur.push_result([env_row])  # gate: _load_env_row


# ── Gate fail-closed ─────────────────────────────────────────────────────────


def test_gate_blocks_release_when_capability_not_eligible(fake_cursor):
    """staging/released require eligible_for_promotion; capability binding is
    not_available/blocking in Ticket 1 (Phase 3a makes it data-driven), so the
    gate must refuse with 409 not_eligible."""
    env = _env_row(lifecycle_state="verified")
    contract = _contract_row(env["env_id"], promotion_state="staging")
    _queue_gate(fake_cursor, env, contract)

    with pytest.raises(HTTPException) as ei:
        svc.assert_environment_promotable(
            env["env_id"], target="released", actor="tester"
        )
    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "not_eligible"
    assert ei.value.detail["blocking_failures"]


def test_gate_blocks_illegal_transition(fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    with pytest.raises(HTTPException) as ei:
        svc.assert_environment_promotable(
            env["env_id"], target="released", actor="tester"
        )
    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "invalid_transition"
    assert "released" not in ei.value.detail["allowed"]


def test_gate_blocks_released_terminal(fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="released")
    _queue_gate(fake_cursor, env, contract)
    with pytest.raises(HTTPException) as ei:
        svc.assert_environment_promotable(
            env["env_id"], target="released", actor="tester"
        )
    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "released_is_terminal"


def test_gate_blocks_staging_when_lifecycle_not_ready(fake_cursor):
    env = _env_row(lifecycle_state="seeded")  # not verified/live
    contract = _contract_row(env["env_id"], promotion_state="verified")
    _queue_gate(fake_cursor, env, contract)
    with pytest.raises(HTTPException) as ei:
        svc.assert_environment_promotable(
            env["env_id"], target="staging", actor="tester"
        )
    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "lifecycle_not_ready"


def test_gate_allows_non_eligibility_transition(fake_cursor):
    """draft -> seeded does not require eligibility; gate should allow it even
    though capability binding is blocking."""
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    result = svc.assert_environment_promotable(
        env["env_id"], target="seeded", actor="tester"
    )
    assert result.from_state == "draft"
    assert result.to_state == "seeded"


# ── Transitions write exactly one event row ──────────────────────────────────


def test_promote_records_one_event_row(fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    # promote_environment then: UPDATE promotion_state + INSERT event (no fetches)

    svc.promote_environment(
        env["env_id"], target="seeded", actor="tester", reason="ready"
    )

    inserts = [
        q
        for q, _ in fake_cursor.queries
        if "INSERT INTO app.environment_promotion_event" in q
    ]
    assert len(inserts) == 1
    updates = [
        q
        for q, _ in fake_cursor.queries
        if "UPDATE app.environment_contract" in q
        and "promotion_state" in q
        and "last_verification" not in q
    ]
    assert len(updates) == 1


def test_blocked_promotion_writes_nothing(fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    with pytest.raises(HTTPException):
        svc.promote_environment(
            env["env_id"], target="released", actor="tester"
        )
    inserts = [
        q
        for q, _ in fake_cursor.queries
        if "INSERT INTO app.environment_promotion_event" in q
    ]
    state_updates = [
        q
        for q, _ in fake_cursor.queries
        if "UPDATE app.environment_contract" in q
        and "promotion_state = %s" in q
    ]
    assert inserts == []
    assert state_updates == []


def test_quarantine_requires_reason(fake_cursor):
    with pytest.raises(HTTPException) as ei:
        svc.quarantine_environment(
            str(uuid.uuid4()), actor="tester", reason="  "
        )
    assert ei.value.status_code == 422
    assert ei.value.detail["code"] == "reason_required"


def test_quarantine_records_event_with_reason(fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="verified")
    _queue_gate(fake_cursor, env, contract)

    svc.quarantine_environment(
        env["env_id"], actor="tester", reason="seed drift detected"
    )

    event_inserts = [
        params
        for q, params in fake_cursor.queries
        if "INSERT INTO app.environment_promotion_event" in q
    ]
    assert len(event_inserts) == 1
    # params: (env_id, from_state, to_state, actor, reason, verification_json)
    assert event_inserts[0][2] == "quarantined"
    assert event_inserts[0][4] == "seed drift detected"


# ── Drift guard ──────────────────────────────────────────────────────────────


def test_drift_guard_flags_released_env_that_no_longer_verifies(fake_cursor):
    env_id = str(uuid.uuid4())
    # 1) list promoted envs
    fake_cursor.push_result(
        [{"env_id": env_id, "promotion_state": "released"}]
    )
    # 2) verify_environment_contract(materialize=False) for that env:
    #    get_or_derive contract hit -> verify env row -> template probe
    fake_cursor.push_result([_contract_row(env_id, promotion_state="released")])
    fake_cursor.push_result([_env_row(env_id=env_id)])
    fake_cursor.push_result([{"1": 1}])  # template active

    result = svc.check_promotion_drift()

    assert result["ok"] is False
    assert result["promoted_envs_checked"] == 1
    assert result["drift"][0]["env_id"] == env_id
    assert result["drift"][0]["promotion_state"] == "released"
    # capability.binding_implemented blocking (Ticket 1) is why it drifts
    assert "capability.binding_implemented" in result["drift"][0][
        "blocking_failures"
    ]


def test_drift_guard_ok_when_no_promoted_envs(fake_cursor):
    fake_cursor.push_result([])  # no released/staging envs
    result = svc.check_promotion_drift()
    assert result["ok"] is True
    assert result["promoted_envs_checked"] == 0
    assert result["drift"] == []


# ── API surface ──────────────────────────────────────────────────────────────


def test_promote_endpoint_returns_409_when_blocked(client, fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    resp = client.post(
        f"/v2/environments/{env['env_id']}/promote",
        json={"target": "released", "actor": "tester"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "invalid_transition"


def test_promote_endpoint_success_returns_report(client, fake_cursor):
    env = _env_row()
    contract = _contract_row(env["env_id"], promotion_state="draft")
    _queue_gate(fake_cursor, env, contract)
    resp = client.post(
        f"/v2/environments/{env['env_id']}/promote",
        json={"target": "seeded", "actor": "tester", "reason": "go"},
    )
    assert resp.status_code == 200
    assert "eligible_for_promotion" in resp.json()


def test_quarantine_endpoint_rejects_missing_reason(client, fake_cursor):
    resp = client.post(
        f"/v2/environments/{uuid.uuid4()}/quarantine",
        json={"actor": "tester"},
    )
    # pydantic rejects missing required reason -> 422
    assert resp.status_code == 422


def test_promotion_drift_endpoint_503_on_drift(client, fake_cursor):
    env_id = str(uuid.uuid4())
    fake_cursor.push_result(
        [{"env_id": env_id, "promotion_state": "staging"}]
    )
    fake_cursor.push_result([_contract_row(env_id, promotion_state="staging")])
    fake_cursor.push_result([_env_row(env_id=env_id)])
    fake_cursor.push_result([{"1": 1}])
    resp = client.get("/v2/environments/promotion-drift")
    assert resp.status_code == 503
    assert resp.json()["ok"] is False
