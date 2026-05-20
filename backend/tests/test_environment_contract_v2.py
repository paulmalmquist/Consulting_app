"""Ticket 1 tests for the EnvironmentContract + fail-closed verifier.

Covers the service (derive + verify) and the API surface. The single most
important assertion: capability binding is not_available/blocking, so a
structurally healthy env is still NOT eligible for promotion (no silent pass).

No test asserts a write to app.environment_promotion_event — that table is dead
in Ticket 1 by design.
"""

from __future__ import annotations

import uuid

import pytest

from app.services import environment_contract_v2 as svc


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


def _queue_verify_sequence(
    cur,
    env_row,
    *,
    template_active=True,
    cap_table_present=True,
    bound_caps=("repe",),
):
    """Queue FakeCursor results for the verify path (post-Phase-3a):

    get_or_derive_contract: contract miss -> env row -> INSERT -> re-read contract
    verify block: env row
                  -> _capability_checks: to_regclass probe
                                         -> bound-capabilities SELECT (only when
                                            the table is present AND the contract
                                            requires capabilities; the derived
                                            contract requires
                                            template.enabled_modules = ['repe'])
                  -> runtime backend template active probe
                  -> UPDATE last_verification (no fetch, only when
                     materialize=True; default GET /verify uses materialize=False).
    """
    cur.push_result([])  # _load_contract_row miss
    cur.push_result([env_row])  # _load_env_row
    # INSERT consumes no result
    cur.push_result([])  # re-read _load_contract_row after insert (race fallback)
    cur.push_result([env_row])  # verify: _load_env_row
    cur.push_result(
        [{"t": "app.environment_capabilities"}]
        if cap_table_present
        else [{"t": None}]
    )  # to_regclass
    if cap_table_present:
        # bound-capabilities SELECT (required_capabilities derived from template
        # is non-empty for the repe fixture, so this query runs)
        cur.push_result([{"capability_key": c} for c in bound_caps])
    cur.push_result([{"1": 1}] if template_active else [])  # template active probe
    # UPDATE last_verification consumes no result


def test_derive_contract_when_no_row(fake_cursor):
    env = _env_row()
    fake_cursor.push_result([])  # contract miss
    fake_cursor.push_result([env])  # env row
    # INSERT (no result)
    fake_cursor.push_result([])  # re-read miss -> fallback to derived dict

    contract = svc.get_or_derive_contract(env["env_id"])

    assert contract.env_id == env["env_id"]
    assert contract.template_key == "repe"
    assert contract.template_version == 1
    assert contract.promotion_state == "draft"  # never derives anything past draft
    assert contract.canonical_runtime_path == "/lab/env/{env_id}/re"
    assert contract.seed_pack_version == 1
    assert contract.runtime_mode is None  # not over-derived
    assert contract.required_eval_suite is None


def test_unknown_env_raises_lookup_error(fake_cursor):
    fake_cursor.push_result([])  # contract miss
    fake_cursor.push_result([])  # env miss
    with pytest.raises(LookupError):
        svc.get_or_derive_contract(str(uuid.uuid4()))


def test_v2_env_without_template_is_not_contract_governed(fake_cursor):
    env = _env_row(template_key=None, template_version=None)
    fake_cursor.push_result([])  # contract miss
    fake_cursor.push_result([env])  # env row, but no template
    with pytest.raises(LookupError):
        svc.get_or_derive_contract(env["env_id"])


def test_capability_table_absent_is_not_available_blocking(fake_cursor):
    """Fail-closed: if app.environment_capabilities is not present (migration
    10006 not applied), binding cannot be proven — not_available/blocking, never
    silent pass."""
    env = _env_row()
    _queue_verify_sequence(
        fake_cursor, env, template_active=True, cap_table_present=False
    )

    report = svc.verify_environment_contract(env["env_id"])

    by_key = {c.key: c for c in report.checks}
    assert by_key["capability.binding_implemented"].status == "not_available"
    assert by_key["capability.binding_implemented"].severity == "blocking"
    assert by_key["capability.required_resolvable"].status == "unknown"
    assert "capability.binding_implemented" in report.blocking_failures
    assert report.eligible_for_promotion is False


def test_all_required_capabilities_bound_passes(fake_cursor):
    """Phase 3a happy path: binding table present and every required capability
    (derived from template.enabled_modules = ['repe']) is bound+enabled. AI
    behavior contract and runtime_mode are still blocking, so eligibility stays
    False — but capability checks themselves are NOT in blocking_failures."""
    env = _env_row()
    _queue_verify_sequence(
        fake_cursor, env, template_active=True, bound_caps=("repe",)
    )

    report = svc.verify_environment_contract(env["env_id"])

    by_key = {c.key: c for c in report.checks}
    assert by_key["capability.binding_implemented"].status == "pass"
    assert by_key["capability.required_resolvable"].status == "pass"
    assert "capability.binding_implemented" not in report.blocking_failures
    assert "capability.required_resolvable" not in report.blocking_failures
    assert by_key["seed.pack_present"].status == "pass"
    assert by_key["runtime.backend_reachable"].status == "pass"


def test_missing_required_capability_blocks_fail_closed(fake_cursor):
    """Required 'repe' (from template) not among bound capabilities -> blocking
    fail. Bound rows present but the required one absent."""
    env = _env_row()
    _queue_verify_sequence(
        fake_cursor, env, template_active=True, bound_caps=("some_other_cap",)
    )

    report = svc.verify_environment_contract(env["env_id"])

    by_key = {c.key: c for c in report.checks}
    assert by_key["capability.binding_implemented"].status == "pass"
    assert by_key["capability.required_resolvable"].status == "fail"
    assert "repe" in by_key["capability.required_resolvable"].message
    assert "capability.required_resolvable" in report.blocking_failures
    assert report.eligible_for_promotion is False


def test_eligible_property_matches_blocking_failures(fake_cursor):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    assert report.eligible_for_promotion == (report.blocking_failures == [])


def test_missing_seed_pack_is_blocking_fail(fake_cursor):
    env = _env_row(seed_pack_applied=None)
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["seed.pack_present"].status == "fail"
    assert by_key["seed.pack_present"].severity == "blocking"
    assert "seed.pack_present" in report.blocking_failures
    assert report.eligible_for_promotion is False


def test_seed_version_mismatch_is_blocking_fail(fake_cursor):
    # contract derives seed_pack_version from env row; force a mismatch vs registry
    env = _env_row(seed_pack_applied="repe_starter", seed_pack_version=999)
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["seed.version_match"].status == "fail"
    assert "seed.version_match" in report.blocking_failures


def test_seed_version_unpinned_is_blocking_unknown_not_pass(fake_cursor):
    env = _env_row(seed_pack_version=None)
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["seed.version_match"].status == "unknown"
    assert by_key["seed.version_match"].status != "pass"
    assert "seed.version_match" in report.blocking_failures


def test_runtime_canonical_path_null_is_unknown_blocking(fake_cursor):
    env = _env_row(default_home_route=None)
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["runtime.canonical_path_known"].status == "unknown"
    assert by_key["runtime.canonical_path_known"].status != "pass"
    assert "runtime.canonical_path_known" in report.blocking_failures


def test_dangling_template_is_runtime_backend_fail(fake_cursor):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env, template_active=False)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["runtime.backend_reachable"].status == "fail"
    assert "runtime.backend_reachable" in report.blocking_failures


def test_ai_behavior_contract_absent_is_missing_blocking(fake_cursor):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["ai_runtime.behavior_contract_present"].status == "missing"
    assert by_key["ai_runtime.behavior_contract_present"].severity == "blocking"


def test_eval_checks_are_warning_not_blocking(fake_cursor):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env)
    report = svc.verify_environment_contract(env["env_id"])
    by_key = {c.key: c for c in report.checks}
    assert by_key["eval.latest_result_recordable"].severity == "warning"
    assert "eval.latest_result_recordable" in report.warnings
    assert "eval.latest_result_recordable" not in report.blocking_failures


# ── API surface ─────────────────────────────────────────────────────────────


def test_verify_endpoint_returns_report_and_preserves_health_ok(
    client, fake_cursor
):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env)
    resp = client.get(f"/v2/environments/{env['env_id']}/verify")
    assert resp.status_code == 200
    body = resp.json()
    assert "health_ok" in body
    assert body["eligible_for_promotion"] is False
    assert any(c["key"] == "capability.binding_implemented" for c in body["checks"])


def test_verify_strict_fails_closed_with_503(client, fake_cursor):
    env = _env_row()
    _queue_verify_sequence(fake_cursor, env)
    resp = client.get(f"/v2/environments/{env['env_id']}/verify?strict=1")
    assert resp.status_code == 503
    assert resp.json()["eligible_for_promotion"] is False


def test_contract_endpoint_returns_contract(client, fake_cursor):
    env = _env_row()
    fake_cursor.push_result([])  # contract miss
    fake_cursor.push_result([env])  # env row
    fake_cursor.push_result([])  # re-read miss -> derived fallback
    resp = client.get(f"/v2/environments/{env['env_id']}/contract")
    assert resp.status_code == 200
    body = resp.json()
    assert body["template_key"] == "repe"
    assert body["promotion_state"] == "draft"


def test_contract_endpoint_unknown_env_404(client, fake_cursor):
    fake_cursor.push_result([])  # contract miss
    fake_cursor.push_result([])  # env miss
    resp = client.get(f"/v2/environments/{uuid.uuid4()}/contract")
    assert resp.status_code == 404
