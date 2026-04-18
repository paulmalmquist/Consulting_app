"""Receipt intake service — ingest → dedupe → persist → enqueue extraction.

File storage: Supabase Storage bucket 'receipt-intake' when SUPABASE_URL +
SUPABASE_SERVICE_ROLE_KEY are configured; falls back to storing the blob
reference only (no file bytes) if the bucket is unavailable. Dedupe by
SHA256 on file_hash scoped to (env_id, business_id).
"""
from __future__ import annotations

import hashlib
import os
from typing import Any

from psycopg.types.json import Json

from app.db import get_cursor
from app.services import (
    receipt_classification,
    receipt_extraction,
    receipt_matching,
    receipt_review_queue,
    subscription_ledger,
)


BUCKET = "receipt-intake"


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _upload_to_storage(file_hash: str, file_bytes: bytes, mime_type: str) -> str | None:
    """Upload to Supabase Storage. Returns storage_path on success, None otherwise.

    This is best-effort: if the bucket API is not configured we skip binary
    persistence — the hash and DB record are still written so ingestion and
    dedupe keep working.
    """
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        return None
    try:
        import requests  # type: ignore

        path = f"{file_hash[:2]}/{file_hash}"
        endpoint = f"{supabase_url.rstrip('/')}/storage/v1/object/{BUCKET}/{path}"
        resp = requests.post(
            endpoint,
            data=file_bytes,
            headers={
                "Authorization": f"Bearer {service_key}",
                "Content-Type": mime_type or "application/octet-stream",
                "x-upsert": "true",
            },
            timeout=15,
        )
        if resp.status_code in (200, 201):
            return f"{BUCKET}/{path}"
    except Exception:
        return None
    return None


def ingest_file(
    *,
    env_id: str,
    business_id: str,
    file_bytes: bytes,
    filename: str | None,
    mime_type: str,
    source_type: str = "upload",
    source_ref: str | None = None,
    uploaded_by: str | None = None,
) -> dict[str, Any]:
    """Ingest a single file. Returns {intake_id, status, duplicate, parse_result_id?}."""
    file_hash = _sha256(file_bytes)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, ingest_status
              FROM nv_receipt_intake
             WHERE env_id = %s AND business_id = %s::uuid AND file_hash = %s
             LIMIT 1
            """,
            (env_id, business_id, file_hash),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "intake_id": str(existing["id"]),
                "ingest_status": existing["ingest_status"],
                "duplicate": True,
            }

    storage_path = _upload_to_storage(file_hash, file_bytes, mime_type)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_receipt_intake
              (env_id, business_id, source_type, source_ref, file_hash,
               storage_path, original_filename, mime_type, file_size_bytes,
               ingest_status, uploaded_by)
            VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)
            RETURNING id
            """,
            (
                env_id, business_id, source_type, source_ref, file_hash,
                storage_path, filename, mime_type, len(file_bytes), uploaded_by,
            ),
        )
        intake_id = str(cur.fetchone()["id"])

    # Immediate synchronous parse (Phase 1). A future queue worker can replace
    # this when ingest volume grows; the contract stays the same.
    parse_result_id = parse_intake(
        env_id=env_id,
        business_id=business_id,
        intake_id=intake_id,
        file_bytes=file_bytes,
        mime_type=mime_type,
    )

    return {
        "intake_id": intake_id,
        "ingest_status": "parsed" if parse_result_id else "failed",
        "parse_result_id": parse_result_id,
        "duplicate": False,
    }


def parse_intake(
    *,
    env_id: str,
    business_id: str,
    intake_id: str,
    file_bytes: bytes,
    mime_type: str,
) -> str | None:
    """Run extraction → write parse_result → trigger downstream steps."""
    try:
        parsed = receipt_extraction.extract_receipt(file_bytes, mime_type)
    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE nv_receipt_intake SET ingest_status='failed' WHERE id=%s::uuid",
                (intake_id,),
            )
        receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="low_confidence",
            next_action=f"Extraction failed ({exc}). Re-upload or enter fields manually.",
        )
        return None

    parse_result_id = _insert_parse_result(env_id, business_id, intake_id, parsed)

    with get_cursor() as cur:
        cur.execute(
            "UPDATE nv_receipt_intake SET ingest_status='parsed' WHERE id=%s::uuid",
            (intake_id,),
        )

    # Apply classification rules + derive downstream artifacts.
    classification = receipt_classification.classify(
        env_id=env_id, business_id=business_id,
        billing_platform=parsed.billing_platform,
        service_name_guess=parsed.service_name_guess,
        vendor_normalized=parsed.vendor_normalized,
    )

    subscription_ledger.update_ledger_on_new_receipt(
        env_id=env_id, business_id=business_id,
        intake_id=intake_id, parsed=parsed, classification=classification,
    )

    # Always run the matcher — if there are no transactions yet, it still
    # writes an 'unmatched' review item so the UI has something to show.
    receipt_matching.match_to_transactions(
        env_id=env_id, business_id=business_id,
        intake_id=intake_id, parsed=parsed,
    )

    # Review routing based on Apple ambiguity / low confidence.
    if parsed.apple_ambiguous:
        receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="apple_ambiguous",
            next_action="Confirm the underlying vendor — Apple is the billing platform, not the service.",
        )
    elif parsed.confidence_overall < 0.5:
        receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="low_confidence",
            next_action="Review extracted fields — confidence is below threshold.",
        )

    if not classification.get("category"):
        receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="uncategorized",
            next_action="Pick a category or add a classification rule.",
        )

    # Auto-create a draft expense when confidence is high enough. Low-confidence
    # parses stay in review and the user confirms from the drawer.
    if parsed.confidence_overall >= 0.6 and parsed.total is not None:
        _create_expense_draft(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            parsed=parsed, classification=classification,
        )

    return parse_result_id


def _insert_parse_result(
    env_id: str, business_id: str, intake_id: str,
    parsed: receipt_extraction.ExtractedReceipt,
) -> str:
    row = parsed.to_db_row()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_receipt_parse_result
              (env_id, business_id, intake_id, parser_source, parser_version,
               merchant_raw, billing_platform, service_name_guess, vendor_normalized,
               transaction_date, billing_period_start, billing_period_end,
               subtotal, tax, total, currency, apple_document_ref,
               line_items, payment_method_hints, renewal_language,
               confidence_overall, confidence_vendor, confidence_service,
               spend_type, raw_extraction)
            VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s)
            RETURNING id
            """,
            (
                env_id, business_id, intake_id,
                row["parser_source"], row["parser_version"],
                row["merchant_raw"], row["billing_platform"], row["service_name_guess"], row["vendor_normalized"],
                row["transaction_date"], row["billing_period_start"], row["billing_period_end"],
                row["subtotal"], row["tax"], row["total"], row["currency"], row["apple_document_ref"],
                Json(row["line_items"]), row["payment_method_hints"], row["renewal_language"],
                row["confidence_overall"], row["confidence_vendor"], row["confidence_service"],
                row.get("spend_type"), Json(row["raw_extraction"]),
            ),
        )
        return str(cur.fetchone()["id"])


def _create_expense_draft(
    *, env_id: str, business_id: str, intake_id: str,
    parsed: receipt_extraction.ExtractedReceipt,
    classification: dict[str, Any],
) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_expense_draft
              (env_id, business_id, source_receipt_id, vendor_normalized,
               service_name, category, amount, currency, transaction_date,
               is_recurring, entity_linkage, status)
            VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, 'draft')
            RETURNING id
            """,
            (
                env_id, business_id, intake_id,
                parsed.vendor_normalized, parsed.service_name_guess,
                classification.get("category"),
                parsed.total, parsed.currency, parsed.transaction_date,
                classification.get("is_recurring", False),
                classification.get("entity_linkage"),
            ),
        )
        return str(cur.fetchone()["id"])


def list_intake_queue(
    *, env_id: str, business_id: str, status: str | None = None, limit: int = 100,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        conditions = ["i.env_id = %s", "i.business_id = %s::uuid"]
        params: list[Any] = [env_id, business_id]
        if status:
            conditions.append("i.ingest_status = %s")
            params.append(status)
        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT i.id, i.source_type, i.ingest_status, i.original_filename,
                   i.created_at, i.file_hash,
                   p.merchant_raw, p.billing_platform, p.vendor_normalized,
                   p.service_name_guess, p.total, p.currency, p.transaction_date,
                   p.confidence_overall
              FROM nv_receipt_intake i
         LEFT JOIN LATERAL (
                SELECT * FROM nv_receipt_parse_result
                 WHERE intake_id = i.id
                 ORDER BY created_at DESC LIMIT 1
              ) p ON true
             WHERE {where}
             ORDER BY i.created_at DESC
             LIMIT %s
            """,
            params + [limit],
        )
        return [dict(r) for r in cur.fetchall()]


def get_intake_detail(*, env_id: str, business_id: str, intake_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, source_type, ingest_status, original_filename, mime_type,
                   storage_path, created_at, file_hash
              FROM nv_receipt_intake
             WHERE id = %s::uuid AND env_id = %s AND business_id = %s::uuid
            """,
            (intake_id, env_id, business_id),
        )
        intake = cur.fetchone()
        if not intake:
            return None

        cur.execute(
            """
            SELECT * FROM nv_receipt_parse_result
             WHERE intake_id = %s::uuid ORDER BY created_at DESC LIMIT 1
            """,
            (intake_id,),
        )
        parse = cur.fetchone()

        cur.execute(
            """
            SELECT id, transaction_id, match_score, match_reason, match_status, created_at
              FROM nv_receipt_match_candidate
             WHERE intake_id = %s::uuid
             ORDER BY match_score DESC LIMIT 10
            """,
            (intake_id,),
        )
        candidates = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, reason, next_action, status, created_at, resolved_at
              FROM nv_receipt_review_item
             WHERE intake_id = %s::uuid
             ORDER BY created_at DESC
            """,
            (intake_id,),
        )
        review_items = [dict(r) for r in cur.fetchall()]

    return {
        "intake": dict(intake),
        "parse": dict(parse) if parse else None,
        "match_candidates": candidates,
        "review_items": review_items,
    }
