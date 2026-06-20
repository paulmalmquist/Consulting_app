"""Tests for ADE PR 3 read-only provider reachability validators.

Run with: cd backend && python -m pytest tests/test_ade_provider_reachability.py -x -q

Covers (ADO #589 Postgres, #590 HTTP):
  - Postgres validator wired into the default set, gated per-env
  - HTTP probe: missing token -> credential_missing with NO outbound call
  - invalid token (401/403) -> degraded
  - timeout -> degraded
  - provider unavailable (5xx / transport error) -> degraded
  - successful 2xx -> ok (the only read_validated path)
  - only GET is ever issued (no-write-method enforcement)
  - tokens never appear in receipts

All HTTP is mocked; CI makes no live network call.
"""
import os

os.environ.setdefault("BM_MCP_DRY_RUN", "1")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
os.environ.setdefault("MCP_API_TOKEN", "test-token")

import httpx  # noqa: E402

from app.services import ade_connector_validators as v  # noqa: E402
from app.services.ade_connector_validators import ValidationOutcome  # noqa: E402


# ── Postgres (Story #589) ────────────────────────────────────────────────────

def test_postgres_wired_by_default():
    """The Postgres validator is now in the default wired set (was opt-in in PR 2)."""
    assert v.get_validator("Supabase/Postgres") is not None


def test_postgres_disabled_by_env_flag(monkeypatch):
    """ADE_ENABLE_POSTGRES_VALIDATOR=false drops it from a freshly built set."""
    monkeypatch.setenv("ADE_ENABLE_POSTGRES_VALIDATOR", "false")
    wired = v._build_validators()
    assert "Supabase/Postgres" not in wired
    # the HTTP validators are unaffected by the Postgres flag
    assert "GitHub (PRs/issues)" in wired


def test_postgres_degrades_without_db():
    """No DB in tests -> DEGRADED, never raises."""
    result = v._validate_postgres()
    assert result.outcome in {ValidationOutcome.OK, ValidationOutcome.DEGRADED}
    assert result.checked == "read-only Postgres ping"


# ── HTTP probe state matrix (Story #590) ─────────────────────────────────────

def test_missing_token_makes_no_call(monkeypatch):
    """Absent token -> credential_missing and the HTTP client is never touched."""
    called = {"n": 0}

    def spy(*a, **k):
        called["n"] += 1
        raise AssertionError("no outbound call must happen without a token")

    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setattr(httpx, "request", spy)
    r = v._validate_github()
    assert r.outcome is ValidationOutcome.CREDENTIAL_MISSING
    assert called["n"] == 0
    # the receipt must not echo a secret-shaped string
    assert "token" not in (r.detail or "").lower()


def test_success_2xx_is_ok(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "x-fake-not-a-real-token")
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(200))
    r = v._validate_github()
    assert r.outcome is ValidationOutcome.OK
    assert r.detail == "GitHub API reachable, credential accepted"


def test_invalid_token_401_is_degraded(monkeypatch):
    monkeypatch.setenv("VERCEL_TOKEN", "bad")
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(401))
    r = v._validate_vercel()
    assert r.outcome is ValidationOutcome.DEGRADED
    assert "401" in r.detail


def test_403_is_degraded(monkeypatch):
    monkeypatch.setenv("RAILWAY_TOKEN", "bad")
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(403))
    r = v._validate_railway()
    assert r.outcome is ValidationOutcome.DEGRADED


def test_timeout_is_degraded(monkeypatch):
    def boom(*a, **k):
        raise httpx.TimeoutException("slow")

    monkeypatch.setenv("GITHUB_TOKEN", "x")
    monkeypatch.setattr(httpx, "request", boom)
    r = v._validate_github()
    assert r.outcome is ValidationOutcome.DEGRADED
    assert "timeout" in r.detail.lower()


def test_provider_unavailable_5xx_is_degraded(monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "x")
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(503))
    r = v._validate_github()
    assert r.outcome is ValidationOutcome.DEGRADED
    assert "503" in r.detail


def test_transport_error_is_degraded(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("dns")

    monkeypatch.setenv("VERCEL_TOKEN", "x")
    monkeypatch.setattr(httpx, "request", boom)
    r = v._validate_vercel()
    assert r.outcome is ValidationOutcome.DEGRADED
    assert "transport_error" in r.detail


def test_only_get_is_issued(monkeypatch):
    """No-write-method enforcement: the probe must call httpx.request with GET."""
    seen = {}

    def capture(method, url, **k):
        seen["method"] = method
        seen["url"] = url
        return httpx.Response(200)

    monkeypatch.setenv("GITHUB_TOKEN", "x")
    monkeypatch.setattr(httpx, "request", capture)
    v._validate_github()
    assert seen["method"] == "GET"
    assert seen["url"].startswith("https://api.github.com/")


def test_token_never_in_receipt(monkeypatch):
    """Even on success, the bearer token must not leak into the receipt."""
    secret = "ghp_supersecretvalue123"
    monkeypatch.setenv("GITHUB_TOKEN", secret)
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(200))
    r = v._validate_github()
    blob = str(r.to_receipt()).lower()
    assert secret.lower() not in blob
    for needle in ("password", "secret", "token", "apikey", "api_key"):
        assert needle not in blob


def test_all_three_http_validators_registered():
    for provider in ("GitHub (PRs/issues)", "Vercel", "Railway"):
        assert v.get_validator(provider) is not None


def test_http_validators_credential_pending_in_clean_env(monkeypatch):
    """With no tokens (the CI/dev default) every HTTP validator fails closed."""
    for env in ("GITHUB_TOKEN", "VERCEL_TOKEN", "RAILWAY_TOKEN"):
        monkeypatch.delenv(env, raising=False)
    for fn in (v._validate_github, v._validate_vercel, v._validate_railway):
        assert fn().outcome is ValidationOutcome.CREDENTIAL_MISSING
