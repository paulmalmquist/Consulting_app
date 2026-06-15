"""Safe read-only validators for ADE connectors + the validation receipt.

A validator answers one question for a single connector: "can a read-only check
confirm this connector is reachable right now?" It must be genuinely safe —
no writes, no mutations, no destructive calls, no credential creation, no
autonomous setup. If a connector has no such check available, it has NO
validator registered, and the lifecycle service keeps it at its declared floor.

This is the honesty boundary: a connector reaches `read_validated` only because
one of these validators ran and returned OK. We do not infer liveness from
env-var presence or from the declared status alone.

PR 2 registered one validator — the in-process MCP registry check.

PR 3 adds read-only *reachability* validators:
  - Postgres `SELECT 1` is promoted from opt-in into the wired set, gated
    per-environment by `ADE_ENABLE_POSTGRES_VALIDATOR` (default on).
  - GitHub / Vercel / Railway each get a read-only HTTP validator. These are
    the first ADE checks that make a real outbound call, so they obey strict
    rules: GET only, a hard per-request timeout, and — critically — a missing
    token yields `credential_missing` with NO outbound call. Env-var presence
    is never treated as validation; only a real 2xx read produces OK. Invalid
    token, timeout, or any non-2xx is DEGRADED, never OK. Tokens are never
    echoed into receipts.

No provider abstraction, no BYO-key plumbing, no writes, no autonomous setup.
"""
from __future__ import annotations

import os
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
    """Read-only DB reachability via SELECT 1 (PR 3: wired, gated per-env).

    In-infra read, no outbound HTTP. Success -> OK; any connection/credential
    failure -> DEGRADED (never raises, never blocks the endpoint).
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


# ── Read-only outbound HTTP probe (GitHub / Vercel / Railway) ────────────────

# Hard ceiling on every outbound call. A provider that does not answer within
# this window is reported DEGRADED, never left hanging.
_HTTP_TIMEOUT_SECONDS = 5.0

# Only GET is ever issued. Asserted in tests and enforced here so a future edit
# cannot silently introduce a write.
_ALLOWED_HTTP_METHOD = "GET"


def http_probe(
    url: str,
    *,
    token_env: str,
    auth_header: Callable[[str], dict[str, str]],
    checked: str,
    ok_detail: str,
) -> ValidationResult:
    """Perform ONE read-only GET against a provider and map it to a ValidationResult.

    Safety + honesty rules enforced here:
      - Missing token env var -> CREDENTIAL_MISSING and NO outbound call. Env-var
        presence alone is never validation; absence is the fail-closed signal.
      - Only GET is issued, with a hard timeout.
      - 2xx -> OK (the only path that can make a connector read_validated).
      - 401/403 (token present but invalid) -> DEGRADED. Timeout -> DEGRADED.
        Any other non-2xx / transport error -> DEGRADED. Never OK on failure.
      - The token is never echoed into the receipt.
    """
    token = os.getenv(token_env)
    if not token:
        # Note: the detail deliberately does not echo the env-var name. Receipts
        # are asserted to contain no secret-shaped substrings (incl. the word
        # "token"), and the var name is irrelevant to the user — `checked` already
        # says which provider was probed.
        return ValidationResult(
            ValidationOutcome.CREDENTIAL_MISSING,
            detail="credential not configured",
            checked=checked,
        )

    if _ALLOWED_HTTP_METHOD != "GET":  # defensive: this module only reads
        return ValidationResult(
            ValidationOutcome.BLOCKED, detail="non-GET method blocked", checked=checked,
        )

    try:
        import httpx

        resp = httpx.request(
            _ALLOWED_HTTP_METHOD,
            url,
            headers={"Accept": "application/json", **auth_header(token)},
            timeout=_HTTP_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException:
        return ValidationResult(
            ValidationOutcome.DEGRADED,
            detail=f"timeout after {_HTTP_TIMEOUT_SECONDS}s",
            checked=checked,
        )
    except Exception as exc:  # noqa: BLE001 — transport/DNS/etc.
        return ValidationResult(
            ValidationOutcome.DEGRADED,
            detail=f"transport_error: {type(exc).__name__}",
            checked=checked,
        )

    if 200 <= resp.status_code < 300:
        return ValidationResult(ValidationOutcome.OK, detail=ok_detail, checked=checked)
    if resp.status_code in (401, 403):
        return ValidationResult(
            ValidationOutcome.DEGRADED,
            detail=f"auth rejected (HTTP {resp.status_code})",
            checked=checked,
        )
    return ValidationResult(
        ValidationOutcome.DEGRADED, detail=f"HTTP {resp.status_code}", checked=checked,
    )


def _validate_github() -> ValidationResult:
    """Read-only GitHub reachability: GET /user (cheapest authenticated read)."""
    return http_probe(
        "https://api.github.com/user",
        token_env="GITHUB_TOKEN",
        auth_header=lambda t: {"Authorization": f"Bearer {t}",
                               "X-GitHub-Api-Version": "2022-11-28"},
        checked="read-only GitHub API GET /user",
        ok_detail="GitHub API reachable, credential accepted",
    )


def _validate_vercel() -> ValidationResult:
    """Read-only Vercel reachability: GET the projects list (read scope)."""
    return http_probe(
        "https://api.vercel.com/v9/projects?limit=1",
        token_env="VERCEL_TOKEN",
        auth_header=lambda t: {"Authorization": f"Bearer {t}"},
        checked="read-only Vercel API GET /v9/projects",
        ok_detail="Vercel API reachable, credential accepted",
    )


def _validate_railway() -> ValidationResult:
    """Read-only Railway reachability: GET the GraphQL API endpoint (no mutation)."""
    return http_probe(
        "https://backboard.railway.app/graphql/v2",
        token_env="RAILWAY_TOKEN",
        auth_header=lambda t: {"Authorization": f"Bearer {t}"},
        checked="read-only Railway API GET /graphql/v2",
        ok_detail="Railway API reachable, credential accepted",
    )


def _env_on(name: str, default: bool = True) -> bool:
    """A per-env feature flag. Absent -> default; explicit 0/false/no/off -> off."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _build_validators() -> dict[str, Validator]:
    """Assemble the wired validator set. Per-env flags gate each addition.

    Built once at import. The MCP registry validator is always on (no I/O).
    Postgres is on unless ADE_ENABLE_POSTGRES_VALIDATOR is falsey. The three
    HTTP validators are always registered — they fail closed to
    credential_missing when their token is absent, which is the honest state, so
    there is no need to gate them off by default. With no token set (the CI /
    dev case) they make NO outbound call.
    """
    v: dict[str, Validator] = {
        "Git (local repo)": Validator(
            name="mcp_registry",
            description="counts git tools in the in-process MCP registry (no I/O)",
            _fn=_validate_mcp_registry,
        ),
        "GitHub (PRs/issues)": Validator(
            name="github_reachability",
            description="read-only GET api.github.com/user (GET-only, 5s timeout)",
            _fn=_validate_github,
        ),
        "Vercel": Validator(
            name="vercel_reachability",
            description="read-only GET api.vercel.com/v9/projects (GET-only, 5s timeout)",
            _fn=_validate_vercel,
        ),
        "Railway": Validator(
            name="railway_reachability",
            description="read-only GET backboard.railway.app/graphql/v2 (GET-only, 5s timeout)",
            _fn=_validate_railway,
        ),
    }
    if _env_on("ADE_ENABLE_POSTGRES_VALIDATOR", default=True):
        v["Supabase/Postgres"] = Validator(
            name="postgres_ping",
            description="read-only SELECT 1 against the app database",
            _fn=_validate_postgres,
        )
    return v


# Provider -> Validator. ONLY providers with a genuinely safe read-only check
# appear here. Everything absent stays at its declared floor with a null_reason.
# Keyed by the exact provider string in ade_connectors.CONNECTORS.
_VALIDATORS: dict[str, Validator] = _build_validators()

# Kept for back-compat with PR 2 tests / explicit opt-in references.
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
