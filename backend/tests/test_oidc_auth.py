"""OIDC token validation tests.

Mints synthetic JWTs signed with a test RSA key, monkeypatches the JWKS
resolver so the validator picks up the test key without hitting the
network, and exercises every fail-closed branch.
"""

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt import PyJWK

from app.auth import oidc_keys, oidc_token
from app.auth.oidc_token import (
    OidcValidationError,
    resolve_app_role,
    validate_oidc_token,
)

_TEST_KID = "test-kid"
_TEST_ALG = "RS256"
_OKTA_ISSUER = "https://test.okta.com"
_OKTA_AUD = "okta-aud"
_ENTRA_ISSUER = "https://login.microsoftonline.com/tenant-a/v2.0"
_ENTRA_AUD = "entra-aud"


@pytest.fixture(scope="module")
def rsa_keypair() -> dict[str, Any]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    # Build a JWK manually so PyJWKClient can hand it back.
    from base64 import urlsafe_b64encode

    def _b64(n: int) -> str:
        length = (n.bit_length() + 7) // 8
        return urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode("ascii")

    jwk = {
        "kty": "RSA",
        "kid": _TEST_KID,
        "alg": _TEST_ALG,
        "use": "sig",
        "n": _b64(public_numbers.n),
        "e": _b64(public_numbers.e),
    }
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return {"private_pem": pem, "jwk": jwk, "py_jwk": PyJWK(jwk)}


@pytest.fixture(autouse=True)
def patch_jwks(monkeypatch, rsa_keypair):
    def _fake_get_signing_key(*, jwks_uri=None, issuer=None, discovery_url=None, kid: str):
        if kid != _TEST_KID:
            raise KeyError(f"unknown kid {kid}")
        return rsa_keypair["py_jwk"]

    monkeypatch.setattr(oidc_keys.oidc_keys, "get_signing_key", _fake_get_signing_key)
    monkeypatch.setattr(oidc_token.oidc_keys, "get_signing_key", _fake_get_signing_key)
    yield


def _mint(rsa_keypair, **claims) -> str:
    payload = {
        "iss": _OKTA_ISSUER,
        "aud": _OKTA_AUD,
        "sub": "okta-sub-123",
        "email": "alice@example.com",
        "name": "Alice",
        "iat": int(time.time()) - 5,
        "exp": int(time.time()) + 300,
        "groups": ["00gFinance", "00gOps"],
    }
    payload.update(claims)
    return jwt.encode(
        payload,
        rsa_keypair["private_pem"],
        algorithm=_TEST_ALG,
        headers={"kid": _TEST_KID},
    )


def _okta_provider(**overrides) -> dict[str, Any]:
    base = {
        "provider_name": "okta",
        "kind": "okta",
        "issuer": _OKTA_ISSUER,
        "client_id": "okta-client",
        "audience": _OKTA_AUD,
        "discovery_url": None,
        "jwks_uri": "https://test.okta.com/.well-known/jwks.json",
        "enabled": True,
        "claim_mapping": {},
        "group_role_mapping": {
            "00gFinance": {"app_role": "finance_admin"},
            "00gViewer": {"app_role": "viewer"},
        },
        "default_role": "viewer",
    }
    base.update(overrides)
    return base


def test_valid_okta_token_accepted(rsa_keypair):
    token = _mint(rsa_keypair)
    claims = validate_oidc_token(token, _okta_provider())
    assert claims.sub == "okta-sub-123"
    assert claims.email == "alice@example.com"
    assert "00gFinance" in claims.groups
    assert "sub" in claims.sanitized
    assert "groups" in claims.sanitized


def test_valid_entra_token_accepted(rsa_keypair):
    token = _mint(
        rsa_keypair,
        iss=_ENTRA_ISSUER,
        aud=_ENTRA_AUD,
        tid="tenant-a",
        preferred_username="alice@example.com",
        groups=["entra-group-1"],
    )
    provider = _okta_provider(
        provider_name="entra",
        kind="azure_ad",
        issuer=_ENTRA_ISSUER,
        audience=_ENTRA_AUD,
    )
    claims = validate_oidc_token(token, provider)
    assert claims.tenant_id == "tenant-a"


def test_expired_token_rejected(rsa_keypair):
    token = _mint(rsa_keypair, exp=int(time.time()) - 60)
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider())
    assert excinfo.value.code == "token_expired"


def test_wrong_audience_rejected(rsa_keypair):
    token = _mint(rsa_keypair, aud="someone-else")
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider())
    assert excinfo.value.code == "invalid_audience"


def test_wrong_issuer_rejected(rsa_keypair):
    token = _mint(rsa_keypair, iss="https://imposter.example.com")
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider())
    assert excinfo.value.code == "invalid_issuer"


def test_missing_sub_rejected(rsa_keypair):
    # PyJWT enforces required claims at decode time.
    payload = {
        "iss": _OKTA_ISSUER,
        "aud": _OKTA_AUD,
        "email": "alice@example.com",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
    }
    token = jwt.encode(
        payload,
        rsa_keypair["private_pem"],
        algorithm=_TEST_ALG,
        headers={"kid": _TEST_KID},
    )
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider())
    assert excinfo.value.code == "missing_claim"


def test_disabled_provider_rejected(rsa_keypair):
    token = _mint(rsa_keypair)
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider(enabled=False))
    assert excinfo.value.code == "provider_disabled"


def test_nonce_mismatch_rejected(rsa_keypair):
    token = _mint(rsa_keypair, nonce="abc")
    with pytest.raises(OidcValidationError) as excinfo:
        validate_oidc_token(token, _okta_provider(), expected_nonce="xyz")
    assert excinfo.value.code == "nonce_mismatch"


def test_entra_overage_detected(rsa_keypair):
    token = _mint(rsa_keypair, hasgroups=True)
    claims = validate_oidc_token(token, _okta_provider())
    assert claims.overage is True
    assert claims.groups == []  # overage suppresses partial groups


def test_resolve_app_role_mapped():
    role, reason = resolve_app_role(
        groups=["00gFinance"],
        group_role_mapping={"00gFinance": {"app_role": "finance_admin"}},
        default_role="viewer",
        overage=False,
    )
    assert role == "finance_admin"
    assert reason == "mapped"


def test_resolve_app_role_unknown_group_falls_to_default():
    role, reason = resolve_app_role(
        groups=["00gMystery"],
        group_role_mapping={"00gFinance": {"app_role": "finance_admin"}},
        default_role="viewer",
        overage=False,
    )
    assert role == "viewer"
    assert reason == "default"


def test_resolve_app_role_unknown_group_no_default_denied():
    role, reason = resolve_app_role(
        groups=["00gMystery"],
        group_role_mapping={"00gFinance": {"app_role": "finance_admin"}},
        default_role=None,
        overage=False,
    )
    assert role is None
    assert reason == "no_match"


def test_resolve_app_role_overage_does_not_elevate():
    role, reason = resolve_app_role(
        groups=[],
        group_role_mapping={"00gFinance": {"app_role": "finance_admin"}},
        default_role="viewer",
        overage=True,
    )
    assert role == "viewer"
    assert reason == "overage"


def test_resolve_app_role_scope_mismatch_skips_rule():
    role, reason = resolve_app_role(
        groups=["00gFinance"],
        group_role_mapping={
            "00gFinance": {"environment_slug": "other-env", "app_role": "finance_admin"}
        },
        default_role="viewer",
        overage=False,
        environment_slug="my-env",
    )
    assert role == "viewer"
    assert reason == "default"
