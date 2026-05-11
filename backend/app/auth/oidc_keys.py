"""OIDC discovery + JWKS resolver.

In-process singleton with TTL caching. JWKS is small (~5 KB) and hot;
Redis would add a round-trip without buying anything.

Public surface:
    - ``OidcKeyResolver.discover(issuer_or_url)`` returns the discovery doc.
    - ``OidcKeyResolver.get_signing_key(issuer_or_url, kid)`` returns a PyJWK.
    - ``oidc_keys`` module-level singleton.

Refresh-on-kid-miss: if a token's ``kid`` is not in the cached JWKS, we
refresh once. This handles IdP key rotation without forcing every request
to revalidate.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWK

_DISCOVERY_SUFFIX = "/.well-known/openid-configuration"
_DEFAULT_TTL_SECONDS = 3600
_HTTP_TIMEOUT_SECONDS = 5.0


@dataclass
class _CachedJwks:
    keys_by_kid: dict[str, PyJWK]
    fetched_at: float


@dataclass
class _CachedDiscovery:
    document: dict[str, Any]
    fetched_at: float


class OidcKeyResolver:
    def __init__(self, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._discovery: dict[str, _CachedDiscovery] = {}
        self._jwks: dict[str, _CachedJwks] = {}

    def _is_fresh(self, fetched_at: float) -> bool:
        return (time.monotonic() - fetched_at) < self._ttl

    def discover(self, issuer_or_url: str) -> dict[str, Any]:
        """Fetch and cache the OIDC discovery document.

        Accepts either a bare issuer (the ``/.well-known/openid-configuration``
        suffix is appended) or a full discovery URL.
        """
        url = (
            issuer_or_url
            if issuer_or_url.endswith(_DISCOVERY_SUFFIX)
            else issuer_or_url.rstrip("/") + _DISCOVERY_SUFFIX
        )
        with self._lock:
            cached = self._discovery.get(url)
            if cached and self._is_fresh(cached.fetched_at):
                return cached.document
        response = httpx.get(url, timeout=_HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        document = response.json()
        with self._lock:
            self._discovery[url] = _CachedDiscovery(document=document, fetched_at=time.monotonic())
        return document

    def _fetch_jwks(self, jwks_uri: str) -> _CachedJwks:
        response = httpx.get(jwks_uri, timeout=_HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
        keys_by_kid: dict[str, PyJWK] = {}
        for key_dict in payload.get("keys", []):
            kid = key_dict.get("kid")
            if not kid:
                continue
            try:
                keys_by_kid[kid] = PyJWK(key_dict)
            except (jwt.InvalidKeyError, Exception):
                # Skip keys we cannot parse rather than fail the whole refresh.
                continue
        return _CachedJwks(keys_by_kid=keys_by_kid, fetched_at=time.monotonic())

    def get_signing_key(
        self,
        *,
        jwks_uri: str | None = None,
        issuer: str | None = None,
        discovery_url: str | None = None,
        kid: str,
    ) -> PyJWK:
        """Return the signing key for the given kid.

        Resolution order for the JWKS URI:
        1. Explicit ``jwks_uri`` argument.
        2. ``jwks_uri`` from the cached discovery document at ``discovery_url``.
        3. ``jwks_uri`` from the cached discovery document at ``issuer``.

        Refreshes the JWKS once if ``kid`` is missing.
        """
        resolved_jwks_uri = jwks_uri
        if not resolved_jwks_uri:
            source = discovery_url or issuer
            if not source:
                raise ValueError("oidc_keys: need jwks_uri, discovery_url, or issuer")
            document = self.discover(source)
            resolved_jwks_uri = document.get("jwks_uri")
            if not resolved_jwks_uri:
                raise ValueError("oidc_keys: discovery document missing jwks_uri")

        with self._lock:
            cached = self._jwks.get(resolved_jwks_uri)

        if cached is None or not self._is_fresh(cached.fetched_at) or kid not in cached.keys_by_kid:
            refreshed = self._fetch_jwks(resolved_jwks_uri)
            with self._lock:
                self._jwks[resolved_jwks_uri] = refreshed
            cached = refreshed

        key = cached.keys_by_kid.get(kid)
        if key is None:
            raise KeyError(f"oidc_keys: kid {kid!r} not found at {resolved_jwks_uri}")
        return key

    def invalidate(self) -> None:
        """Drop all cached state. Test hook."""
        with self._lock:
            self._discovery.clear()
            self._jwks.clear()


oidc_keys = OidcKeyResolver()
