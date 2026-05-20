"""EnvironmentContract + fail-closed verifier (Ticket 1 — read-only).

Scope: v2 environments only. Sidecar to app.environments via app.environment_contract.
Legacy envs (template_key IS NULL) are out of scope and never get a contract row.

Design constraints (user-directed, non-negotiable):

  * No over-derivation. Contract fields are derived ONLY from clearly existing repo
    sources: app.environments, app.environment_templates, environment_templates_v2,
    environment_seed_packs_v2. A field that cannot be derived with confidence is left
    null/default and the verifier marks the dependent check unknown/missing/not_available.
  * The verifier fails closed. status='pass' is the ONLY healthy status; 'fail',
    'missing', 'unknown', 'not_available' are all non-pass. eligible_for_promotion is
    True iff no BLOCKING check is non-pass.
  * No state transitions and NO writes to app.environment_promotion_event in Ticket 1.
    get_or_derive_contract upserts the contract row at promotion_state='draft' only;
    it never derives 'released' or any post-verified state.

Mirrors the re_trace_gate idiom: a typed result, or LookupError when the env is
unknown (the route maps LookupError -> HTTP 404).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.db import get_cursor
from app.observability.logger import emit_log
from app.schemas.lab_v2 import (
    ContractCheck,
    ContractVerificationReport,
    EnvironmentContractOut,
)
from app.services import environment_templates_v2
from app.services.environment_seed_packs_v2 import SEED_PACKS

SERVICE = "environment_contract_v2"

# Capability binding is a no-op in environment_pipeline_v2._apply_template_metadata
# and there is no app.environment_capabilities table yet (verified absent in prod).
# Until Phase 3 implements it, capability checks MUST report not_available/blocking —
# never a silent pass. This is the single most dangerous failure mode.
# (Phase 3a flips this to True once 10030 environment_capabilities lands.)
_CAPABILITY_BINDING_IMPLEMENTED = False

# Promotion state machine (DB-enforced by the promotion-guard migration's
# environment_contract_enforce_promotion trigger; mirrored here so the gate fails
# closed with a clean 4xx before the DB ever raises). Keep in lockstep with the migration.
_LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"seeded", "verified", "quarantined", "failed"},
    "seeded": {"verified", "quarantined", "failed"},
    "verified": {"staging", "quarantined", "failed"},
    "staging": {"verified", "released", "quarantined", "failed"},
    "released": set(),  # terminal — immutable
    "quarantined": {"verified"},
    "failed": {"draft", "quarantined"},
}

# Promotion into these states requires the env to be structurally healthy AND a
# fresh verification with eligible_for_promotion = True.
_STATES_REQUIRING_ELIGIBILITY: set[str] = {"staging", "released"}
_LIFECYCLE_OK_FOR_PROMOTION: set[str] = {"verified", "live"}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_json(obj: Any) -> str:
    return json.dumps(obj, default=str)


def _load_env_row(cur, env_id: str) -> dict[str, Any] | None:
    cur.execute(
        """SELECT env_id::text AS env_id, slug, template_key, template_version,
                  env_kind, lifecycle_state, default_home_route,
                  seed_pack_applied, seed_pack_version
             FROM app.environments
            WHERE env_id = %s::uuid""",
        (env_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _load_contract_row(cur, env_id: str) -> dict[str, Any] | None:
    cur.execute(
        """SELECT env_id::text AS env_id, template_key, template_version,
                  canonical_runtime_path, runtime_mode, deployment_target,
                  seed_pack_version, required_capabilities, required_smoke_tests,
                  required_eval_suite, authoritative_state_requirements,
                  compatibility_version, promotion_state
             FROM app.environment_contract
            WHERE env_id = %s::uuid""",
        (env_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _contract_out(row: dict[str, Any]) -> EnvironmentContractOut:
    return EnvironmentContractOut(
        env_id=str(row["env_id"]),
        template_key=row["template_key"],
        template_version=int(row["template_version"]),
        canonical_runtime_path=row.get("canonical_runtime_path"),
        runtime_mode=row.get("runtime_mode"),
        deployment_target=row.get("deployment_target") or "local",
        seed_pack_version=row.get("seed_pack_version"),
        required_capabilities=list(row.get("required_capabilities") or []),
        required_smoke_tests=list(row.get("required_smoke_tests") or []),
        required_eval_suite=row.get("required_eval_suite"),
        authoritative_state_requirements=row.get("authoritative_state_requirements")
        or {},
        compatibility_version=row.get("compatibility_version") or "env_contract_v1",
        promotion_state=row.get("promotion_state") or "draft",
    )


def _derive_contract_fields(env_row: dict[str, Any]) -> dict[str, Any]:
    """Derive contract fields from clearly existing sources ONLY.

    Anything not confidently derivable is left null/default so the verifier can
    mark the dependent check unknown/missing — never guessed.
    """
    template_key = env_row.get("template_key")
    template_version = env_row.get("template_version")
    if not template_key or template_version is None:
        # A v2 env without a pinned template is not contract-derivable. Caller
        # (get_or_derive_contract) treats this as "not a v2 contract env".
        raise LookupError(
            f"env {env_row.get('env_id')} has no template_key/version; "
            "not a v2 contract-governed environment"
        )

    # default_home_route on app.environments is the canonical runtime path for v2
    # envs (set by the v2 pipeline from the template). Null -> leave null -> verifier
    # marks runtime.canonical_path_known = unknown.
    canonical_runtime_path = env_row.get("default_home_route")

    # Seed pack version is authoritative on app.environments (written by the v2
    # pipeline's _run_seed_pack). Do NOT infer from anywhere else.
    seed_pack_version = env_row.get("seed_pack_version")

    # required_capabilities: the only confident source is the template's
    # enabled_modules advisory list. If the template can't be resolved, leave empty
    # rather than guess.
    required_capabilities: list[str] = []
    try:
        template = environment_templates_v2.get_template(
            template_key, template_version
        )
        required_capabilities = list(template.get("enabled_modules") or [])
    except LookupError:
        required_capabilities = []

    return {
        "template_key": template_key,
        "template_version": int(template_version),
        "canonical_runtime_path": canonical_runtime_path,
        # runtime_mode is NOT confidently derivable from existing sources -> null.
        "runtime_mode": None,
        "deployment_target": "local",
        "seed_pack_version": seed_pack_version,
        "required_capabilities": required_capabilities,
        # No confident source for required smoke tests / eval suite / authoritative
        # state requirements in Ticket 1 -> defaults; verifier reports missing.
        "required_smoke_tests": [],
        "required_eval_suite": None,
        "authoritative_state_requirements": {},
        "compatibility_version": "env_contract_v1",
        "promotion_state": "draft",
    }


def get_or_derive_contract(env_id: str) -> EnvironmentContractOut:
    """Return the stored contract; if none, derive from existing sources and upsert
    at promotion_state='draft'. Raises LookupError if env_id is unknown or is not a
    v2 contract-governed env (no template_key)."""
    with get_cursor() as cur:
        existing = _load_contract_row(cur, env_id)
        if existing:
            return _contract_out(existing)

        env_row = _load_env_row(cur, env_id)
        if env_row is None:
            raise LookupError(f"env_id not found: {env_id}")

        derived = _derive_contract_fields(env_row)
        cur.execute(
            """
            INSERT INTO app.environment_contract
              (env_id, template_key, template_version, canonical_runtime_path,
               runtime_mode, deployment_target, seed_pack_version,
               required_capabilities, required_smoke_tests, required_eval_suite,
               authoritative_state_requirements, compatibility_version,
               promotion_state)
            VALUES
              (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, 'draft')
            ON CONFLICT (env_id) DO NOTHING
            """,
            (
                env_id,
                derived["template_key"],
                derived["template_version"],
                derived["canonical_runtime_path"],
                derived["runtime_mode"],
                derived["deployment_target"],
                derived["seed_pack_version"],
                derived["required_capabilities"],
                derived["required_smoke_tests"],
                derived["required_eval_suite"],
                _serialize_json(derived["authoritative_state_requirements"]),
                derived["compatibility_version"],
            ),
        )
        # Re-read so we return exactly what's persisted (handles a concurrent insert
        # racing the ON CONFLICT DO NOTHING).
        row = _load_contract_row(cur, env_id)
        return _contract_out(row or {**derived, "env_id": env_id})


# ─────────────────────────────────────────────────────────────────────────────
# Verifier
# ─────────────────────────────────────────────────────────────────────────────


def _check(key: str, status: str, severity: str, message: str) -> ContractCheck:
    return ContractCheck(key=key, status=status, severity=severity, message=message)  # type: ignore[arg-type]


def _seed_checks(
    contract: EnvironmentContractOut, env_row: dict[str, Any]
) -> list[ContractCheck]:
    checks: list[ContractCheck] = []
    applied = env_row.get("seed_pack_applied")
    if applied:
        checks.append(
            _check(
                "seed.pack_present",
                "pass",
                "blocking",
                f"seed pack '{applied}' applied",
            )
        )
    else:
        checks.append(
            _check(
                "seed.pack_present",
                "fail",
                "blocking",
                "no seed pack applied (data_not_ingested)",
            )
        )

    pinned = contract.seed_pack_version
    if pinned is None:
        checks.append(
            _check(
                "seed.version_match",
                "unknown",
                "blocking",
                "contract has no pinned seed_pack_version; cannot confirm match",
            )
        )
    elif applied and applied in SEED_PACKS:
        registry_version = getattr(SEED_PACKS[applied], "VERSION", None)
        if registry_version == pinned:
            checks.append(
                _check(
                    "seed.version_match",
                    "pass",
                    "blocking",
                    f"seed pack '{applied}' v{pinned} matches registry",
                )
            )
        else:
            checks.append(
                _check(
                    "seed.version_match",
                    "fail",
                    "blocking",
                    f"seed pack '{applied}' contract v{pinned} != registry "
                    f"v{registry_version}",
                )
            )
    else:
        checks.append(
            _check(
                "seed.version_match",
                "fail",
                "blocking",
                "applied seed pack not resolvable in registry",
            )
        )
    return checks


def _capability_checks(contract: EnvironmentContractOut) -> list[ContractCheck]:
    # Hard fail-closed: binding is unimplemented and there is no capability table.
    # Reporting pass here would be the worst failure mode in the whole system.
    if not _CAPABILITY_BINDING_IMPLEMENTED:
        return [
            _check(
                "capability.binding_implemented",
                "not_available",
                "blocking",
                "capability binding not implemented "
                "(environment_pipeline_v2._apply_template_metadata is a no-op; "
                "no app.environment_capabilities table) — Phase 3",
            ),
            _check(
                "capability.required_resolvable",
                "unknown",
                "blocking",
                f"cannot resolve {len(contract.required_capabilities)} required "
                "capabilities while binding is not_available",
            ),
        ]
    # Unreachable in Ticket 1; kept so the flip in Phase 3 is a one-line change.
    return [
        _check(
            "capability.binding_implemented",
            "pass",
            "blocking",
            "capability binding implemented",
        )
    ]


def _runtime_checks(
    contract: EnvironmentContractOut, env_row: dict[str, Any]
) -> list[ContractCheck]:
    checks: list[ContractCheck] = []
    if contract.canonical_runtime_path:
        checks.append(
            _check(
                "runtime.canonical_path_known",
                "pass",
                "blocking",
                f"canonical runtime path: {contract.canonical_runtime_path}",
            )
        )
    else:
        checks.append(
            _check(
                "runtime.canonical_path_known",
                "unknown",
                "blocking",
                "no canonical_runtime_path (default_home_route unset on env)",
            )
        )

    if contract.runtime_mode:
        checks.append(
            _check(
                "runtime.mode_explicit",
                "pass",
                "blocking",
                f"runtime_mode={contract.runtime_mode}",
            )
        )
    else:
        checks.append(
            _check(
                "runtime.mode_explicit",
                "unknown",
                "blocking",
                "runtime_mode not declared on contract",
            )
        )
    return checks


def _runtime_backend_check(cur, contract: EnvironmentContractOut) -> ContractCheck:
    """Mirror the /v2/environments/health template-integrity semantics for this env:
    the env's pinned template (key, version) must still exist and be active."""
    cur.execute(
        """SELECT 1 FROM app.environment_templates
            WHERE template_key = %s AND version = %s AND is_active = true""",
        (contract.template_key, contract.template_version),
    )
    if cur.fetchone():
        return _check(
            "runtime.backend_reachable",
            "pass",
            "blocking",
            f"template {contract.template_key} v{contract.template_version} active",
        )
    return _check(
        "runtime.backend_reachable",
        "fail",
        "blocking",
        f"dangling template ref {contract.template_key} "
        f"v{contract.template_version} (out_of_scope_environment)",
    )


def _ai_runtime_checks(contract: EnvironmentContractOut) -> list[ContractCheck]:
    checks: list[ContractCheck] = []
    # No per-env AI behavior contract registry exists in code yet — report missing,
    # do not invent a pass.
    checks.append(
        _check(
            "ai_runtime.behavior_contract_present",
            "missing",
            "blocking",
            "no per-env AI behavior contract registry (Phase 3)",
        )
    )
    if contract.required_eval_suite:
        checks.append(
            _check(
                "ai_runtime.eval_suite_declared",
                "pass",
                "warning",
                f"required eval suite: {contract.required_eval_suite}",
            )
        )
    else:
        checks.append(
            _check(
                "ai_runtime.eval_suite_declared",
                "missing",
                "warning",
                "no required_eval_suite declared on contract",
            )
        )
    # MCP tool resolution per-env needs a request-scoped McpContext we don't have
    # here; cannot resolve with confidence -> not_available (not a guessed pass).
    checks.append(
        _check(
            "ai_runtime.tools_fail_closed",
            "not_available",
            "warning",
            "per-env MCP tool set not resolvable without request context "
            "(tool_not_available)",
        )
    )
    return checks


def _eval_checks(contract: EnvironmentContractOut) -> list[ContractCheck]:
    checks: list[ContractCheck] = []
    if not contract.required_smoke_tests:
        checks.append(
            _check(
                "eval.smoke_tests_discoverable",
                "pass",
                "warning",
                "no smoke tests required by contract (vacuous)",
            )
        )
    else:
        # No smoke-test registry to resolve declared ids against in Ticket 1.
        checks.append(
            _check(
                "eval.smoke_tests_discoverable",
                "missing",
                "warning",
                f"{len(contract.required_smoke_tests)} smoke tests declared but "
                "no resolution registry (Phase 3)",
            )
        )
    checks.append(
        _check(
            "eval.latest_result_recordable",
            "missing",
            "warning",
            "no eval/smoke result store yet (Phase 3)",
        )
    )
    return checks


def verify_environment_contract(env_id: str) -> ContractVerificationReport:
    """Fail-closed structured verification of an environment's contract.

    Raises LookupError if env_id is unknown / not a v2 contract env.
    """
    contract = get_or_derive_contract(env_id)

    with get_cursor() as cur:
        env_row = _load_env_row(cur, env_id) or {}
        checks: list[ContractCheck] = []
        checks += _seed_checks(contract, env_row)
        checks += _capability_checks(contract)
        checks += _runtime_checks(contract, env_row)
        checks.append(_runtime_backend_check(cur, contract))
        checks += _ai_runtime_checks(contract)
        checks += _eval_checks(contract)

        blocking_failures = [
            c.key
            for c in checks
            if c.severity == "blocking" and c.status != "pass"
        ]
        warnings = [
            c.key for c in checks if c.severity == "warning" and c.status != "pass"
        ]
        eligible = len(blocking_failures) == 0
        verified_at = _utcnow_iso()

        report = ContractVerificationReport(
            env_id=env_id,
            checks=checks,
            blocking_failures=blocking_failures,
            warnings=warnings,
            eligible_for_promotion=eligible,
            promotion_state=contract.promotion_state,
            verified_at=verified_at,
            health_ok=eligible,
        )

        # Persist the verification snapshot for operator visibility. This does NOT
        # transition promotion_state and does NOT write environment_promotion_event
        # (both are Ticket 2). It only records the latest report + timestamp.
        cur.execute(
            """UPDATE app.environment_contract
                  SET last_verification = %s::jsonb, last_verified_at = now()
                WHERE env_id = %s::uuid""",
            (_serialize_json(report.model_dump()), env_id),
        )

    emit_log(
        level="info" if eligible else "warning",
        service=SERVICE,
        action="verify_contract",
        message=(
            "environment contract verified: "
            f"{'eligible' if eligible else 'NOT eligible'} for promotion"
        ),
        context={
            "env_id": env_id,
            "eligible_for_promotion": eligible,
            "blocking": blocking_failures,
            "warnings": warnings,
        },
    )
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Promotion gate + transitions (Dispatch 0004 — Ticket 2)
#
# Mirrors the re_trace_gate idiom: assert_environment_promotable returns a typed
# result or raises HTTPException; the route must call the gate first and never
# reach the transition write otherwise. The gate ALWAYS re-runs verification fresh
# (materialize=True) — it must never promote on a stale/cached report.
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class PromotableContract:
    """Returned by the gate when a transition is permitted."""

    env_id: str
    from_state: str
    to_state: str
    lifecycle_state: str | None
    report: ContractVerificationReport


def _gate_409(code: str, message: str, **ctx: Any) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={"code": code, "message": message, **ctx},
    )


def assert_environment_promotable(
    env_id: str, *, target: str, actor: str
) -> PromotableContract:
    """Fail-closed gate. Raises HTTPException (404/409) unless the transition to
    `target` is legal AND, when target requires it, the env is structurally healthy
    AND a FRESH verification says eligible_for_promotion.

    The route must call this before any transition write; the transition write must
    be unreachable when this raises.
    """
    if target not in _LEGAL_TRANSITIONS and target not in {
        s for v in _LEGAL_TRANSITIONS.values() for s in v
    }:
        raise _gate_409(
            "invalid_target_state",
            f"unknown target promotion_state '{target}'",
            target=target,
        )

    # Fresh verification — never trust a cached/stale report for a promotion.
    report = verify_environment_contract(env_id, materialize=True)

    with get_cursor() as cur:
        contract = _load_contract_row(cur, env_id)
        if contract is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "contract_not_found",
                    "message": f"no environment contract for env_id {env_id}",
                },
            )
        env_row = _load_env_row(cur, env_id) or {}

    current = contract["promotion_state"]
    lifecycle = env_row.get("lifecycle_state")

    if current == "released":
        raise _gate_409(
            "released_is_terminal",
            "released environment contracts are immutable",
            env_id=env_id,
            promotion_state=current,
        )

    allowed = _LEGAL_TRANSITIONS.get(current, set())
    if target != current and target not in allowed:
        raise _gate_409(
            "invalid_transition",
            f"illegal promotion transition {current} -> {target}",
            env_id=env_id,
            from_state=current,
            to_state=target,
            allowed=sorted(allowed),
        )

    if target in _STATES_REQUIRING_ELIGIBILITY:
        if lifecycle not in _LIFECYCLE_OK_FOR_PROMOTION:
            raise _gate_409(
                "lifecycle_not_ready",
                f"target '{target}' requires lifecycle_state in "
                f"{sorted(_LIFECYCLE_OK_FOR_PROMOTION)}; env is "
                f"'{lifecycle}'",
                env_id=env_id,
                lifecycle_state=lifecycle,
                to_state=target,
            )
        if not report.eligible_for_promotion:
            raise _gate_409(
                "not_eligible",
                f"target '{target}' requires a passing verification; "
                f"{len(report.blocking_failures)} blocking check(s) failing",
                env_id=env_id,
                to_state=target,
                blocking_failures=report.blocking_failures,
            )

    return PromotableContract(
        env_id=env_id,
        from_state=current,
        to_state=target,
        lifecycle_state=lifecycle,
        report=report,
    )


def _record_event(
    cur,
    *,
    env_id: str,
    from_state: str,
    to_state: str,
    actor: str,
    reason: str | None,
    report: ContractVerificationReport | None,
) -> None:
    """Append-only audit row. Every transition (promote AND quarantine) writes
    exactly one of these."""
    cur.execute(
        """
        INSERT INTO app.environment_promotion_event
          (env_id, from_state, to_state, actor, reason, verification)
        VALUES (%s::uuid, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            env_id,
            from_state,
            to_state,
            actor,
            reason,
            _serialize_json(report.model_dump()) if report is not None else None,
        ),
    )


def promote_environment(
    env_id: str, *, target: str, actor: str, reason: str | None = None
) -> ContractVerificationReport:
    """Gate, then perform the single legal transition and write one event row.

    Returns the fresh verification report the decision was made on. Raises
    HTTPException (from the gate) when the transition is not permitted — in which
    case NO transition and NO event row are written.
    """
    gate = assert_environment_promotable(env_id, target=target, actor=actor)

    with get_cursor() as cur:
        # released needs its provenance columns; the trigger only lets these +
        # promotion_state change on a row entering/at released.
        if target == "released":
            cur.execute(
                """UPDATE app.environment_contract
                      SET promotion_state = %s,
                          released_at = now(), released_by = %s
                    WHERE env_id = %s::uuid""",
                (target, actor, env_id),
            )
        elif target == "verified":
            cur.execute(
                """UPDATE app.environment_contract
                      SET promotion_state = %s,
                          verified_by = %s
                    WHERE env_id = %s::uuid""",
                (target, actor, env_id),
            )
        else:
            cur.execute(
                """UPDATE app.environment_contract
                      SET promotion_state = %s
                    WHERE env_id = %s::uuid""",
                (target, env_id),
            )
        _record_event(
            cur,
            env_id=env_id,
            from_state=gate.from_state,
            to_state=target,
            actor=actor,
            reason=reason,
            report=gate.report,
        )

    emit_log(
        level="info",
        service=SERVICE,
        action="promote_environment",
        message=f"environment promoted {gate.from_state} -> {target}",
        context={"env_id": env_id, "from": gate.from_state, "to": target,
                 "actor": actor},
    )
    return gate.report


def quarantine_environment(
    env_id: str, *, actor: str, reason: str
) -> ContractVerificationReport:
    """Operator fail-closed action. Always records an event row with the reason.

    quarantine is reachable from every non-released state; a released contract is
    terminal and cannot be quarantined (the gate enforces this fail-closed). reason
    is required — a quarantine without a recorded reason is not auditable.
    """
    if not reason or not reason.strip():
        raise HTTPException(
            status_code=422,
            detail={"code": "reason_required",
                    "message": "quarantine requires a non-empty reason"},
        )
    gate = assert_environment_promotable(
        env_id, target="quarantined", actor=actor
    )

    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.environment_contract
                  SET promotion_state = 'quarantined'
                WHERE env_id = %s::uuid""",
            (env_id,),
        )
        _record_event(
            cur,
            env_id=env_id,
            from_state=gate.from_state,
            to_state="quarantined",
            actor=actor,
            reason=reason,
            report=gate.report,
        )

    emit_log(
        level="warning",
        service=SERVICE,
        action="quarantine_environment",
        message=f"environment quarantined ({gate.from_state} -> quarantined)",
        context={"env_id": env_id, "from": gate.from_state, "actor": actor,
                 "reason": reason},
    )
    return gate.report


def check_promotion_drift() -> dict[str, Any]:
    """Drift guard: any env in a promoted state (released/staging) that no longer
    passes verification is drift. Mirrors the /v2/environments/health 503 idiom —
    the route returns 503 when `drift` is non-empty.

    Read-only: verifies with materialize=False so a drift probe never mutates
    last_verification or promotion_state.
    """
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id::text AS env_id, promotion_state
                 FROM app.environment_contract
                WHERE promotion_state IN ('released','staging')"""
        )
        promoted = [dict(r) for r in cur.fetchall()]

    drift: list[dict[str, Any]] = []
    for row in promoted:
        report = verify_environment_contract(row["env_id"], materialize=False)
        if not report.eligible_for_promotion:
            drift.append(
                {
                    "env_id": row["env_id"],
                    "promotion_state": row["promotion_state"],
                    "blocking_failures": report.blocking_failures,
                }
            )

    return {
        "promoted_envs_checked": len(promoted),
        "drift": drift,
        "ok": not drift,
    }
