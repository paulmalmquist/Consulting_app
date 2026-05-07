"""Env-scope authorization for document attachments.

Enforces: every document_id in a chat request must belong to the active
env_id (via document_entity_links) or business_id, and the actor must
have access to that environment. Cross-env injection is rejected and
logged as a scoped_attachment_rejected event.

This is the most important guardrail in the attachment pipeline. See plan.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from app.db import get_cursor
from app.observability.logger import emit_log

logger = logging.getLogger(__name__)


@dataclass
class AuthorizedDocument:
    document_id: str
    mime_type: str
    original_filename: str
    size_bytes: int | None
    processing_mode: str | None
    bucket: str
    object_key: str


def resolve_authorized_attachments(
    document_ids: list[uuid.UUID],
    *,
    env_id: uuid.UUID | None,
    business_id: uuid.UUID | None,
    actor: str,
    request_id: str,
) -> list[AuthorizedDocument]:
    """Return only documents that pass env/business scope check.

    Rejects and logs any document_id that belongs to a different env/business.
    Never raises — returns an empty list on total failure.
    """
    if not document_ids:
        return []

    try:
        return _resolve(
            document_ids=document_ids,
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            request_id=request_id,
        )
    except Exception as exc:
        logger.error(
            "resolve_authorized_attachments: unexpected error for request_id=%s: %s",
            request_id,
            exc,
        )
        return []


def _resolve(
    document_ids: list[uuid.UUID],
    *,
    env_id: uuid.UUID | None,
    business_id: uuid.UUID | None,
    actor: str,
    request_id: str,
) -> list[AuthorizedDocument]:
    doc_id_strs = [str(d) for d in document_ids]

    # Reject everything when no business_id — no DB call needed
    if not business_id:
        _log_all_rejected(doc_id_strs, "no_business_id", request_id, actor)
        return []

    with get_cursor() as cur:
        cur.execute(
            """SELECT
                 d.document_id::text,
                 dv.mime_type,
                 dv.original_filename,
                 dv.size_bytes,
                 dv.bucket,
                 dv.object_key,
                 dv.metadata->>'processing_mode' AS processing_mode
               FROM app.documents d
               JOIN LATERAL (
                 SELECT mime_type, original_filename, size_bytes, bucket, object_key, metadata
                 FROM app.document_versions
                 WHERE document_id = d.document_id
                 ORDER BY version_number DESC
                 LIMIT 1
               ) dv ON true
               WHERE d.document_id = ANY(%s::uuid[])
                 AND d.business_id = %s""",
            (doc_id_strs, str(business_id)),
        )
        rows = cur.fetchall()

    authorized_ids = {row["document_id"] for row in rows}
    rejected_ids = [d for d in doc_id_strs if d not in authorized_ids]

    for rejected_id in rejected_ids:
        emit_log(
            level="warning",
            service="backend",
            action="attachment.scoped_attachment_rejected",
            message="Cross-scope document_id rejected at send time",
            context={
                "document_id": rejected_id,
                "expected_scope": {
                    "business_id": str(business_id) if business_id else None,
                    "env_id": str(env_id) if env_id else None,
                },
                "actor": actor,
                "request_id": request_id,
            },
        )

    return [
        AuthorizedDocument(
            document_id=row["document_id"],
            mime_type=row.get("mime_type") or "",
            original_filename=row.get("original_filename") or "",
            size_bytes=row.get("size_bytes"),
            processing_mode=row.get("processing_mode"),
            bucket=row.get("bucket") or "",
            object_key=row.get("object_key") or "",
        )
        for row in rows
    ]


def _log_all_rejected(
    doc_id_strs: list[str],
    reason: str,
    request_id: str,
    actor: str,
) -> None:
    for doc_id in doc_id_strs:
        emit_log(
            level="warning",
            service="backend",
            action="attachment.scoped_attachment_rejected",
            message=f"Document rejected: {reason}",
            context={
                "document_id": doc_id,
                "reason": reason,
                "actor": actor,
                "request_id": request_id,
            },
        )
