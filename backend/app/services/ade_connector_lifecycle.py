"""Read-only connector lifecycle for the Automated Data Engineering surface.

PR 2 promotes the static declared inventory (`ade_connectors.py`,
`live|stub|script|missing`) into a lifecycle state machine. It is strictly
read-only and honest:

    declared -> discovered -> credential_pending -> validating
             -> read_validated -> degraded -> blocked -> retired

Hard rules (carried from PR 1, enforced here):
  - No live writes, no provider abstraction, no autonomous cloud setup.
  - A connector reaches `read_validated` ONLY when a real safe read-only
    validator actually ran and succeeded. There is no way to assert a healthy
    state without a validator producing a receipt.
  - Connectors with no safe validator stay at their declared-derived state and
    carry a `null_reason` explaining why no validation happened.
  - Every validation attempt leaves a receipt (no secrets; see ade_connectors
    redaction rules — nothing secret is read here in the first place).

The lifecycle is *derived*, not stored: state is computed from the declared
inventory plus the outcome of any validator that ran this request. Nothing is
persisted and no migration is introduced.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.services import ade_connectors
from app.services.ade_connector_validators import (
    ValidationOutcome,
    get_validator,
)


class LifecycleState(str, Enum):
    """The eight read-only lifecycle states.

    DECLARED          known to the inventory, no working code yet (was `missing`)
    DISCOVERED        code exists but is a placeholder / not wired (was `stub`)
    CREDENTIAL_PENDING a validator exists but required credentials are absent
    VALIDATING        a validator is mid-flight (transient; only seen if a
                      validator yields before resolving — not persisted)
    READ_VALIDATED    a safe read-only validator ran and succeeded
    DEGRADED          a validator ran but reported a partial / unhealthy result
    BLOCKED           a write/destructive path is declared and intentionally
                      not exercised, or validation is forbidden by policy
    RETIRED           declared terminal — the connector was withdrawn
    """

    DECLARED = "declared"
    DISCOVERED = "discovered"
    CREDENTIAL_PENDING = "credential_pending"
    VALIDATING = "validating"
    READ_VALIDATED = "read_validated"
    DEGRADED = "degraded"
    BLOCKED = "blocked"
    RETIRED = "retired"


# Risk tier is a static property of the connector's declared mode, not a probe.
# Read-only/in-process modes are low; write-capable or external modes are higher.
_RISK_BY_MODE = {
    "mcp_tools": "medium",        # can include write tools (git.commit)
    "service_layer": "low",
    "streaming": "medium",
    "background_service": "medium",
    "managed_model": "medium",
    "sql_connector": "medium",
    "import_file": "low",
    "planned": "low",
}


@dataclass
class ConnectorLifecycle:
    """A connector's derived lifecycle row. Pure data, no secrets."""

    provider: str
    declared_status: str            # live|stub|script|missing (unchanged source of truth)
    mode: str
    evidence_path: str | None
    reason: str
    risk_tier: str
    state: LifecycleState
    null_reason: str | None = None  # why validation did not produce read_validated
    receipt: dict | None = None     # the validation attempt receipt, if one ran

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "declared_status": self.declared_status,
            "mode": self.mode,
            "evidence_path": self.evidence_path,
            "reason": self.reason,
            "risk_tier": self.risk_tier,
            "state": self.state.value,
            "null_reason": self.null_reason,
            "receipt": self.receipt,
        }


@dataclass
class LifecycleReport:
    connectors: list[ConnectorLifecycle] = field(default_factory=list)
    null_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "connectors": [c.to_dict() for c in self.connectors],
            "null_reason": self.null_reason,
        }


def _base_state_from_declaration(status: str) -> tuple[LifecycleState, str | None]:
    """Map the static declared status to a lifecycle floor with no validation.

    This floor is what a connector sits at when no validator runs. A validator
    can only move it UP to read_validated/degraded or sideways to
    credential_pending/blocked — it never silently upgrades on its own.
    """
    if status == "missing":
        return LifecycleState.DECLARED, "no_implementation"
    if status == "stub":
        return LifecycleState.DISCOVERED, "implementation_is_stub"
    if status == "script":
        # Offline generator, nothing to validate at runtime.
        return LifecycleState.DISCOVERED, "offline_script_no_runtime_validator"
    if status == "live":
        # Code exists; whether it is read_validated depends on a validator.
        return LifecycleState.DISCOVERED, "no_validator_available"
    if status == "retired":
        return LifecycleState.RETIRED, "withdrawn"
    return LifecycleState.DECLARED, "unknown_declared_status"


def compute_lifecycle(run_validators: bool = True) -> LifecycleReport:
    """Derive the lifecycle state of every declared connector.

    Read-only end to end. For each connector we start from the declared floor,
    then — only if a safe validator is registered for it and run_validators is
    True — we run that validator and let its outcome move the state. A connector
    with no validator keeps its floor state and a null_reason.
    """
    rows: list[ConnectorLifecycle] = []
    for c in ade_connectors.CONNECTORS:
        status = c["status"]
        mode = c["mode"]
        floor, floor_reason = _base_state_from_declaration(status)
        risk = _RISK_BY_MODE.get(mode, "medium")

        row = ConnectorLifecycle(
            provider=c["provider"],
            declared_status=status,
            mode=mode,
            evidence_path=c.get("evidence_path"),
            reason=c["reason"],
            risk_tier=risk,
            state=floor,
            null_reason=floor_reason,
        )

        validator = get_validator(c["provider"]) if run_validators else None
        if validator is not None:
            try:
                result = validator()
            except Exception as exc:  # noqa: BLE001 — fail closed, never raise out
                # A validator that throws degrades the connector and records why.
                row.state = LifecycleState.DEGRADED
                row.null_reason = "validator_error"
                row.receipt = {
                    "validator": validator.name,
                    "outcome": ValidationOutcome.ERROR.value,
                    "detail": str(exc)[:200],
                    "checked": validator.description,
                }
                rows.append(row)
                continue

            row.receipt = result.to_receipt()
            if result.outcome is ValidationOutcome.OK:
                row.state = LifecycleState.READ_VALIDATED
                row.null_reason = None
            elif result.outcome is ValidationOutcome.CREDENTIAL_MISSING:
                row.state = LifecycleState.CREDENTIAL_PENDING
                row.null_reason = "credentials_not_configured"
            elif result.outcome is ValidationOutcome.DEGRADED:
                row.state = LifecycleState.DEGRADED
                row.null_reason = result.detail or "validator_reported_degraded"
            elif result.outcome is ValidationOutcome.BLOCKED:
                row.state = LifecycleState.BLOCKED
                row.null_reason = result.detail or "validation_blocked_by_policy"
            else:  # ERROR
                row.state = LifecycleState.DEGRADED
                row.null_reason = "validator_error"

        rows.append(row)

    return LifecycleReport(connectors=rows, null_reason=None)
