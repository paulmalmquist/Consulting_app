"""Safe read-only validators for ADE connectors + the validation receipt.

A validator answers one question for a single connector: "can a read-only check
confirm this connector is reachable right now?" It must be genuinely safe —
no writes, no mutations, no destructive calls, no credential creation, no
autonomous setup. If a connector has no such check available, it has NO
validator registered, and the lifecycle service keeps it at its declared floor.

This is the honesty boundary of PR 2: a connector reaches `read_validated`
only because one of these validators ran and returned OK. We do not infer
liveness from env-var presence or from the declared status alone.

PR 2 registers exactly one validator by default — the in-process MCP registry
check — because it is the only provider with a safe, credential-free, cloud-free
read already present in the codebase. The Postgres validator is implemented and
unit-tested but is opt-in (not registered by default) so that the lifecycle
endpoint never depends on a live DB connection in CI or in degraded
environments. No new cloud connector is implemented.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum


class ValidationOutcome(str, Enum):
    OK = "ok"                              # read-only check succeeded
    CREDENTIAL_MISSING = "credential_missing"  # required config absent; not an error
    DEGRADED = "degraded"                  # reachable but partial/unhealthy
    BLOCKED = "blocked"                    # validation forbidden by policy
    ERROR = "error"                        # check failed unexpectedly


@dataclass(frozen=True)
class ValidationResult:
    outcome: ValidationOutcome
    detail: str | None = None              # short, no secrets
    checked: str | None = None             # what was actually checked

    def to_receipt(self) -> dict:
        """A receipt for one validation attempt. No secrets, no raw payloads."""
        return {
            "outcome": self.outcome.value,
            "detail": self.detail,
            "checked": self.checked,
        }


@dataclass(frozen=True)
class Validator:
    """A named, safe, read-only validator for one connector provider."""

    name: str
    description: str                       # human-readable "what this checks"
    _fn: Callable[[], ValidationResult]

    def __call__(self) -> ValidationResult:
        return self._fn()


# ── Safe validators ──────────────────────────────────────────────────────────

def _validate_mcp_registry() -> ValidationResult:
    """In-process read: are git MCP tools actually registered?

    This touches nothing external — it reads the in-memory registry that
    app startup already populated. Count > 0 is a real, credential-free,
    cloud-free confirmation that the connector's tools are wired.
    """
    from app.services import ade_connectors

    module = ade_connectors._MCP_MODULE_BY_EVIDENCE.get(
        "backend/app/mcp/tools/git_tools.py"
    )
    if not module:
        return ValidationResult(
            ValidationOutcome.DEGRADED,
            detail="no_module_mapping",
            checked="mcp registry module mapping",
        )
    from app.mcp.registry import registry

    count = len(registry.list_by_module(module))
    if count > 0:
        return ValidationResult(
            ValidationOutcome.OK,
            detail=f"{count} tools registered under '{module}'",
            checked="in-process MCP registry tool count",
        )
    return ValidationResult(
        ValidationOutcome.DEGRADED,
        detail="no tools registered",
        checked="in-process MCP registry tool count",
    )


def _validate_postgres() -> ValidationResult:
    """Read-only DB reachability via SELECT 1. Opt-in (not registered by default).

    Implemented for completeness and tested via injection, but kept out of the
    default registry so the lifecycle endpoint never blocks on a live DB.
    """
    try:
        from app.db import get_cursor

        with get_cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return ValidationResult(
            ValidationOutcome.OK,
            detail="SELECT 1 returned",
            checked="read-only Postgres ping",
        )
    except Exception as exc:  # noqa: BLE001
        return ValidationResult(
            ValidationOutcome.DEGRADED,
            detail=str(exc)[:120],
            checked="read-only Postgres ping",
        )


# Provider -> Validator. ONLY providers with a genuinely safe read-only check
# appear here. Everything absent stays at its declared floor with a null_reason.
# Keyed by the exact provider string in ade_connectors.CONNECTORS.
_VALIDATORS: dict[str, Validator] = {
    "Git (local repo)": Validator(
        name="mcp_registry",
        description="counts git tools in the in-process MCP registry (no I/O)",
        _fn=_validate_mcp_registry,
    ),
}

# Opt-in validators not wired into the default lifecycle run. Exposed for tests
# and for environments that explicitly choose to enable a live DB ping.
OPTIONAL_VALIDATORS: dict[str, Validator] = {
    "Supabase/Postgres": Validator(
        name="postgres_ping",
        description="read-only SELECT 1 against the app database",
        _fn=_validate_postgres,
    ),
}


def get_validator(provider: str) -> Validator | None:
    """Return the safe validator for a provider, or None if there is no safe check."""
    return _VALIDATORS.get(provider)
