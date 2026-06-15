"""Fail-closed object-storage seam for investigation-session artifacts (plan PR 6).

Large section bodies and generated reports live in object storage; Postgres holds
only a POINTER (bucket/key/bytes/sha256/status). Verifiable NUMBERS are never stored
as artifacts — they stay inline in the session row — so a storage outage drops prose,
never grounded numbers.

Honesty rules enforced here (per adversarial review):
  - FAIL CLOSED on missing credentials: raises ArtifactStorageNotConfigured, never a
    fabricated pointer/URL (mirrors scripts/export_audit_to_bq._require_config).
  - The repo's signed-upload-URL builder FAILS OPEN (returns a direct URL on error),
    so a 2xx PUT is NOT proof of a confirmed write. A pointer is only promoted to
    status='stored' after a real existence+byte-length confirmation (GET round-trip).
    sha256 is computed CLIENT-SIDE from the bytes we uploaded (Supabase does not return
    our sha), so it documents what we sent, not a server attestation.
  - No client construction or credential read at IMPORT time — only inside functions.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, asdict

import httpx

ADE_SESSION_BUCKET = "ade-analysis-sessions"


class ArtifactStorageNotConfigured(RuntimeError):
    """Raised when Supabase Storage credentials are not configured (fail closed)."""


class ArtifactUploadFailed(RuntimeError):
    """Raised when the upload or its confirmation did not succeed."""


@dataclass(frozen=True)
class ArtifactPointer:
    bucket: str
    key: str
    kind: str
    content_type: str
    bytes: int
    sha256: str
    artifact_status: str  # 'stored' | 'skipped_storage_unconfigured' | 'upload_failed'
    null_reason: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def storage_configured() -> bool:
    """True only when both Supabase URL and service-role key are present.

    Read lazily so import never requires credentials.
    """
    from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

    return bool(SUPABASE_URL) and bool(SUPABASE_SERVICE_ROLE_KEY)


def _require_config() -> tuple[str, dict]:
    from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise ArtifactStorageNotConfigured(
            "Artifact storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )
    base = f"{SUPABASE_URL}/storage/v1"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }
    return base, headers


def _confirm_object(base: str, headers: dict, bucket: str, key: str, expected_bytes: int) -> None:
    """Prove the object exists with the expected byte length. The ONLY thing that
    promotes a pointer to 'stored'. A returned upload URL (which may be the fail-open
    fallback) is not trusted; this GET is the real attestation."""
    try:
        resp = httpx.get(f"{base}/object/{bucket}/{key}", headers=headers, timeout=15)
    except httpx.HTTPError as exc:
        raise ArtifactUploadFailed(f"Could not confirm artifact {bucket}/{key}: {exc}") from exc
    if resp.status_code != 200:
        raise ArtifactUploadFailed(
            f"Artifact {bucket}/{key} not present after upload (status {resp.status_code})."
        )
    actual = len(resp.content)
    if actual != expected_bytes:
        raise ArtifactUploadFailed(
            f"Artifact {bucket}/{key} size mismatch: expected {expected_bytes}, got {actual}."
        )


def store_artifact(
    *,
    env_id: str,
    session_id: str,
    kind: str,
    name: str,
    body: bytes,
    content_type: str = "text/markdown",
) -> ArtifactPointer:
    """Upload an artifact and return a CONFIRMED pointer, or raise (fail closed).

    Raises ArtifactStorageNotConfigured (no creds) or ArtifactUploadFailed (PUT or
    confirmation failed). Callers decide whether to degrade to a 'skipped'/'upload_failed'
    pointer (see safe_store_artifact) — this function never invents a successful pointer.
    """
    base, headers = _require_config()
    key = f"{env_id}/{session_id}/{kind}/{name}"  # tenant-scoped prefix
    sha = hashlib.sha256(body).hexdigest()
    put_headers = {**headers, "Content-Type": content_type, "x-upsert": "true"}
    try:
        resp = httpx.put(f"{base}/object/{ADE_SESSION_BUCKET}/{key}", headers=put_headers,
                         content=body, timeout=30)
    except httpx.HTTPError as exc:
        raise ArtifactUploadFailed(f"Upload error for {key}: {exc}") from exc
    if resp.status_code not in (200, 201):
        raise ArtifactUploadFailed(f"Upload of {key} returned {resp.status_code}.")
    # The PUT 2xx may be against the fail-open fallback URL — confirm independently.
    _confirm_object(base, headers, ADE_SESSION_BUCKET, key, expected_bytes=len(body))
    return ArtifactPointer(
        bucket=ADE_SESSION_BUCKET, key=key, kind=kind, content_type=content_type,
        bytes=len(body), sha256=sha, artifact_status="stored",
    )


def safe_store_artifact(
    *,
    env_id: str,
    session_id: str,
    kind: str,
    name: str,
    body: bytes,
    content_type: str = "text/markdown",
) -> ArtifactPointer:
    """Best-effort wrapper for finalize: returns a truthful pointer either way.

    On unconfigured/failed storage, returns a pointer with artifact_status set to
    'skipped_storage_unconfigured' or 'upload_failed' and a null_reason — never a
    fabricated URL, never status='stored'. The inline numbers in the session are
    unaffected; only the prose body is dropped.
    """
    sha = hashlib.sha256(body).hexdigest()
    try:
        return store_artifact(env_id=env_id, session_id=session_id, kind=kind,
                              name=name, body=body, content_type=content_type)
    except ArtifactStorageNotConfigured as exc:
        return ArtifactPointer(
            bucket=ADE_SESSION_BUCKET, key=f"{env_id}/{session_id}/{kind}/{name}", kind=kind,
            content_type=content_type, bytes=len(body), sha256=sha,
            artifact_status="skipped_storage_unconfigured", null_reason=str(exc),
        )
    except ArtifactUploadFailed as exc:
        return ArtifactPointer(
            bucket=ADE_SESSION_BUCKET, key=f"{env_id}/{session_id}/{kind}/{name}", kind=kind,
            content_type=content_type, bytes=len(body), sha256=sha,
            artifact_status="upload_failed", null_reason=str(exc),
        )


def signed_read_url(pointer: ArtifactPointer, *, expires_in: int = 3600) -> str | None:
    """Mint a short-lived read URL on demand (never persisted). None if unconfigured
    or the pointer was never stored."""
    if pointer.artifact_status != "stored" or not storage_configured():
        return None
    from app.repos.supabase_storage_repo import SupabaseStorageRepository

    return SupabaseStorageRepository().generate_signed_download_url(
        pointer.bucket, pointer.key, expires_in=expires_in
    )
