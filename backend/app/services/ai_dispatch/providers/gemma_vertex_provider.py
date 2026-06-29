"""Gemma-on-Vertex adapter — real Vertex AI endpoint call; fail-closed without config.

WHAT THIS FILE DOES (in plain language)
    This is the backend "translator" that lets the app actually talk to the private Gemma model
    running on Google Cloud. Given a request, it builds the right web call to the deployed model,
    signs in with ambient Google credentials, sends the text, and reads the answer back out.
    If anything about the setup is missing or broken, it refuses safely instead of guessing.

WHERE YOU SEE THIS
    The Control Tower page uses this adapter to route SENSITIVE (ITAR-ish) triage to the private
    Gemma tier — so that sensitive text is handled by our own model on our own cloud and never
    sent to a public AI API.

INPUTS -> OUTPUT
    INPUT:  an AIRequest (the text to process) + which model name to report.
    OUTPUT: a ProviderCompletion (the generated text + token usage), OR a typed failure that the
            dispatch supervisor turns into UNAVAILABLE / DEGRADED.

HOW TO READ IT
    * Vertex AI endpoint = the deployed, callable Gemma model on Google Cloud.
    * ":predict" = the standard URL suffix you POST to in order to get a prediction from it.
    * ADC (Application Default Credentials) = ambient Google auth picked up from the environment;
      no pasted API keys. We trade it for a short-lived token to authorize each call.
    * fail-closed = if config is missing or auth fails, raise ProviderUnavailable rather than
      return a fake answer. -> the supervisor maps that to UNAVAILABLE, and the Control Tower
      shows its honest fail-closed state instead of a guessed result.

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


# Get a temporary Google sign-in token from the ambient credentials (ADC) so we can authorize a
# call to the endpoint. -> if no credentials are available, this raises and the caller fails closed.
def _vertex_access_token() -> str:
    """Mint a short-lived OAuth token via Application Default Credentials. Monkeypatched in tests."""
    import google.auth
    from google.auth.transport.requests import Request as GoogleAuthRequest

    creds, _ = google.auth.default(scopes=_SCOPES)
    creds.refresh(GoogleAuthRequest())
    if not creds.token:
        raise RuntimeError("google auth returned no token")
    return creds.token


# Send the text to the deployed model and return its raw JSON answer. Any HTTP error (e.g. the
# endpoint is down or unauthorized) becomes a typed ProviderCallError -> the supervisor maps that
# to DEGRADED rather than a guessed answer.
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


# Different serving containers wrap the generated text differently, so this digs the actual
# answer string out of whichever common response shape Vertex returned (and "" if none found).
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


# Pull token counts (how much input/output the model processed) out of the response, when the
# endpoint reports them. -> feeds the usage/cost numbers the dispatch receipts record.
def _extract_usage(data: dict[str, Any]) -> Usage:
    meta = data.get("metadata") or data.get("usageMetadata") or {}
    if not isinstance(meta, dict):
        return Usage()
    return Usage(
        prompt_tokens=meta.get("promptTokenCount") or meta.get("prompt_tokens"),
        completion_tokens=meta.get("candidatesTokenCount") or meta.get("completion_tokens"),
    )


# The provider object the dispatch registry calls. Its one job: turn an AIRequest into a real
# answer from the private Gemma endpoint, or fail closed.
class GemmaVertexProvider:
    name = ProviderName.GEMMA_GCP

    # The whole call, end to end: check config, get a token, build the URL, send the text, parse
    # the answer. Never raises out the top — it raises only the typed fail-closed errors above.
    def complete(self, req: AIRequest, model: str) -> ProviderCompletion:
        from app.config import (
            GEMMA_VERTEX_DEDICATED_DNS,
            GEMMA_VERTEX_ENDPOINT_ID,
            GEMMA_VERTEX_LOCATION,
            GEMMA_VERTEX_PROJECT_ID,
        )

        # Fail-closed gate #1: if the endpoint isn't fully wired (project/region/endpoint id all
        # set by deploy.py), refuse. -> Control Tower shows the fail-closed "not configured" state.
        if not (GEMMA_VERTEX_PROJECT_ID and GEMMA_VERTEX_LOCATION and GEMMA_VERTEX_ENDPOINT_ID):
            raise ProviderUnavailable("GEMMA_VERTEX_* is not fully configured")

        # Fail-closed gate #2: if we can't get Google credentials (no ADC in the environment),
        # refuse rather than attempt an unauthenticated call.
        try:
            token = _vertex_access_token()
        except Exception as exc:  # noqa: BLE001 — missing/invalid ADC ⇒ fail closed
            raise ProviderUnavailable(f"google auth unavailable: {exc}") from exc

        # Model Garden deployments create *dedicated* endpoints, which reject the shared
        # aiplatform.googleapis.com domain and must be hit via their dedicated DNS (the
        # endpoint resource's `dedicatedEndpointDns`). Set GEMMA_VERTEX_DEDICATED_DNS for
        # those; leave it empty for a regular (shared-domain) endpoint.
        resource = (
            f"projects/{GEMMA_VERTEX_PROJECT_ID}/locations/{GEMMA_VERTEX_LOCATION}/"
            f"endpoints/{GEMMA_VERTEX_ENDPOINT_ID}"
        )
        host = (
            GEMMA_VERTEX_DEDICATED_DNS
            if GEMMA_VERTEX_DEDICATED_DNS
            else f"{GEMMA_VERTEX_LOCATION}-aiplatform.googleapis.com"
        )
        # Final call URL = host + the endpoint's resource path + ":predict". The payload wraps the
        # request text and an output-length cap in the shape Vertex serving expects.
        url = f"https://{host}/v1/{resource}:predict"
        payload = {"instances": [{"prompt": req.task, "max_tokens": req.max_tokens}]}

        # Send it. A clean transport/timeout failure becomes a typed ProviderCallError so the
        # supervisor reports DEGRADED — again, never a fabricated answer.
        try:
            data = _vertex_predict(url, token, payload)
        except ProviderCallError:
            raise
        except Exception as exc:  # noqa: BLE001 — transport/timeout ⇒ typed call error
            raise ProviderCallError(f"vertex request failed: {exc}") from exc

        # Success: hand back the parsed answer text + token usage for the dispatch layer to record.
        return ProviderCompletion(
            text=_extract_text(data),
            model=model or "gemma",
            usage=_extract_usage(data),
            finish_reason=None,
        )
