"""Gemma-on-Vertex adapter — real Vertex AI endpoint call; fail-closed without config.

Replaces the PR 1 stub. Calls a deployed Vertex AI endpoint (Model Garden Gemma) via the
endpoint ``:predict`` contract, authenticating with Application Default Credentials (ADC).

Fail-closed behavior (the supervisor maps these):
  * GEMMA_VERTEX_* env missing, or Google auth unavailable → ``ProviderUnavailable`` →
    ``UNAVAILABLE / provider_not_configured``.
  * Transport / timeout / HTTP error → ``ProviderCallError`` → ``DEGRADED / provider_call_failed``.
``complete()`` never raises out.

No secrets, service-account JSON, or raw prompts/answers are logged here — the supervisor records
only redacted summaries + usage.

NOTE: the exact request/response schema of a Vertex endpoint depends on its serving container.
This adapter uses the common ``{instances:[{prompt,max_tokens}]} -> {predictions:[...]}`` shape and
parses defensively; confirm/adjust against the deployed endpoint at provisioning time. This PR ships
the adapter only — it does NOT provision GCP, promote Gemma, or enable execution.
"""
from __future__ import annotations

from typing import Any

from app.services.ai_dispatch.models import (
    AIRequest,
    ProviderCompletion,
    ProviderName,
    Usage,
)
from app.services.ai_dispatch.providers.base import ProviderCallError, ProviderUnavailable

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
_VERTEX_TIMEOUT_S = 60.0


def _vertex_access_token() -> str:
    """Mint a short-lived OAuth token via Application Default Credentials. Monkeypatched in tests."""
    import google.auth
    from google.auth.transport.requests import Request as GoogleAuthRequest

    creds, _ = google.auth.default(scopes=_SCOPES)
    creds.refresh(GoogleAuthRequest())
    if not creds.token:
        raise RuntimeError("google auth returned no token")
    return creds.token


def _vertex_predict(
    url: str, token: str, payload: dict[str, Any], timeout: float = _VERTEX_TIMEOUT_S
) -> dict[str, Any]:
    """POST a prediction request to a Vertex endpoint. Monkeypatched in tests."""
    import httpx

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            url,
            headers={"Authorization": f"Bearer {token}", "content-type": "application/json"},
            json=payload,
        )
    if resp.status_code >= 400:
        raise ProviderCallError(f"vertex returned {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def _extract_text(data: dict[str, Any]) -> str:
    """Pull generated text out of common Vertex prediction response shapes."""
    preds = data.get("predictions")
    if isinstance(preds, list) and preds:
        first = preds[0]
        if isinstance(first, str):
            return first.strip()
        if isinstance(first, dict):
            for key in ("content", "generated_text", "text", "output"):
                value = first.get(key)
                if isinstance(value, str):
                    return value.strip()
    # generateContent-style fallback
    cands = data.get("candidates")
    if isinstance(cands, list) and cands:
        parts = (cands[0].get("content") or {}).get("parts") or []
        if parts and isinstance(parts[0], dict) and isinstance(parts[0].get("text"), str):
            return parts[0]["text"].strip()
    return ""


def _extract_usage(data: dict[str, Any]) -> Usage:
    meta = data.get("metadata") or data.get("usageMetadata") or {}
    if not isinstance(meta, dict):
        return Usage()
    return Usage(
        prompt_tokens=meta.get("promptTokenCount") or meta.get("prompt_tokens"),
        completion_tokens=meta.get("candidatesTokenCount") or meta.get("completion_tokens"),
    )


class GemmaVertexProvider:
    name = ProviderName.GEMMA_GCP

    def complete(self, req: AIRequest, model: str) -> ProviderCompletion:
        from app.config import (
            GEMMA_VERTEX_ENDPOINT_ID,
            GEMMA_VERTEX_LOCATION,
            GEMMA_VERTEX_PROJECT_ID,
        )

        if not (GEMMA_VERTEX_PROJECT_ID and GEMMA_VERTEX_LOCATION and GEMMA_VERTEX_ENDPOINT_ID):
            raise ProviderUnavailable("GEMMA_VERTEX_* is not fully configured")

        try:
            token = _vertex_access_token()
        except Exception as exc:  # noqa: BLE001 — missing/invalid ADC ⇒ fail closed
            raise ProviderUnavailable(f"google auth unavailable: {exc}") from exc

        url = (
            f"https://{GEMMA_VERTEX_LOCATION}-aiplatform.googleapis.com/v1/"
            f"projects/{GEMMA_VERTEX_PROJECT_ID}/locations/{GEMMA_VERTEX_LOCATION}/"
            f"endpoints/{GEMMA_VERTEX_ENDPOINT_ID}:predict"
        )
        payload = {"instances": [{"prompt": req.task, "max_tokens": req.max_tokens}]}

        try:
            data = _vertex_predict(url, token, payload)
        except ProviderCallError:
            raise
        except Exception as exc:  # noqa: BLE001 — transport/timeout ⇒ typed call error
            raise ProviderCallError(f"vertex request failed: {exc}") from exc

        return ProviderCompletion(
            text=_extract_text(data),
            model=model or "gemma",
            usage=_extract_usage(data),
            finish_reason=None,
        )
