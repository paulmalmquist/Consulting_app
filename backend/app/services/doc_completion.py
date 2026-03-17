"""
Document Completion Agent — Service Layer
==========================================

Core business logic for automated document collection:
  - Application intake & missing-doc detection
  - Borrower outreach (SMS + email)
  - Follow-up scheduling & escalation
  - Completeness checks (deterministic, not AI)
  - Upload processing
  - Dashboard aggregation
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services import messaging

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_upload_token(loan_file_id: UUID) -> str:
    """Generate a signed token for the borrower upload portal."""
    secret = os.environ.get("DC_UPLOAD_SECRET", "dev-secret-change-me")
    payload = f"{loan_file_id}:{int(time.time())}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{loan_file_id}-{sig}"


def _verify_upload_token(token: str) -> UUID | None:
    """Verify an upload token and return loan_file_id, or None if invalid."""
    try:
        file_id_str = token.rsplit("-", 1)[0]
        return UUID(file_id_str)
    except (ValueError, IndexError):
        return None


def _upload_url(token: str) -> str:
    """Build the public upload portal URL."""
    base = os.environ.get("DC_PORTAL_BASE_URL", "https://app.novendor.com")
    return f"{base}/upload/{token}"


def _audit(
    cur: Any,
    *,
    env_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action: str,
    actor_type: str = "system",
    actor_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Insert an immutable audit log entry."""
    cur.execute(
        """
        INSERT INTO dc_audit_log (env_id, entity_type, entity_id, action, actor_type, actor_id, metadata_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (str(env_id), entity_type, str(entity_id), action, actor_type, actor_id, json.dumps(metadata or {})),
    )


# ── Application Intake ──────────────────────────────────────────────

DOC_TYPE_DISPLAY: dict[str, str] = {
    "government_id": "Government-Issued ID",
    "pay_stub": "Recent Pay Stub",
    "bank_statement": "Bank Statement (Last 2 Months)",
    "tax_return": "Tax Return (Most Recent Year)",
    "w2": "W-2 Form",
    "proof_of_insurance": "Proof of Insurance",
    "employment_verification": "Employment Verification Letter",
    "proof_of_address": "Proof of Address",
    "credit_authorization": "Credit Authorization Form",
    "purchase_agreement": "Purchase Agreement",
    "gift_letter": "Gift Letter",
    "divorce_decree": "Divorce Decree",
}


def create_loan_file(
    *,
    env_id: UUID,
    business_id: UUID,
    external_application_id: str,
    borrower: dict[str, Any],
    loan_type: str = "mortgage",
    loan_stage: str = "processing",
    required_documents: list[str],
    submitted_documents: list[str] | None = None,
    assigned_processor_id: str | None = None,
    webhook_url: str | None = None,
    max_followups: int = 3,
    followup_cadence_hours: list[int] | None = None,
    allowed_send_start: int = 8,
    allowed_send_end: int = 20,
    send_initial_outreach: bool = True,
    created_by: str | None = None,
) -> dict:
    """Intake a new application: create borrower, loan file, and doc requirements."""
    submitted = set(submitted_documents or [])
    cadence = followup_cadence_hours or [24, 48, 72]

    with get_cursor() as cur:
        # 1. Create borrower
        cur.execute(
            """
            INSERT INTO dc_borrower (env_id, business_id, first_name, last_name, email, mobile,
                                     preferred_channel, timezone, consent_sms, consent_email, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING borrower_id, first_name, last_name, email, mobile
            """,
            (
                str(env_id), str(business_id),
                borrower["first_name"], borrower["last_name"],
                borrower.get("email"), borrower.get("mobile"),
                borrower.get("preferred_channel", "email"),
                borrower.get("timezone", "America/New_York"),
                bool(borrower.get("mobile")),  # auto-consent if mobile provided
                bool(borrower.get("email")),
                created_by,
            ),
        )
        b = cur.fetchone()
        borrower_id = b["borrower_id"]

        # 2. Generate upload token
        token_placeholder = str(UUID(int=0))  # temp, will update after file creation
        # 3. Create loan file
        cur.execute(
            """
            INSERT INTO dc_loan_file (env_id, business_id, borrower_id, external_application_id,
                                      loan_type, loan_stage, status, assigned_processor_id,
                                      max_followups, followup_cadence_json,
                                      allowed_send_start, allowed_send_end,
                                      webhook_url, source, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING loan_file_id, status, opened_at
            """,
            (
                str(env_id), str(business_id), str(borrower_id),
                external_application_id, loan_type, loan_stage,
                "awaiting_initial_outreach",
                assigned_processor_id,
                max_followups, json.dumps({"hours": cadence}),
                allowed_send_start, allowed_send_end,
                webhook_url, "api", created_by,
            ),
        )
        lf = cur.fetchone()
        loan_file_id = lf["loan_file_id"]

        # 4. Generate and set actual upload token
        token = _generate_upload_token(loan_file_id)
        expires = datetime.now(timezone.utc) + timedelta(hours=72)
        cur.execute(
            "UPDATE dc_loan_file SET upload_token = %s, upload_token_expires = %s WHERE loan_file_id = %s",
            (token, expires.isoformat(), str(loan_file_id)),
        )

        # 5. Create doc requirements
        requirements = []
        for doc_type in required_documents:
            status = "accepted" if doc_type in submitted else "required"
            display = DOC_TYPE_DISPLAY.get(doc_type, doc_type.replace("_", " ").title())
            cur.execute(
                """
                INSERT INTO dc_doc_requirement (loan_file_id, env_id, doc_type, display_name, is_required, status,
                                                accepted_at)
                VALUES (%s, %s, %s, %s, true, %s, %s)
                RETURNING requirement_id, doc_type, display_name, status
                """,
                (
                    str(loan_file_id), str(env_id), doc_type, display, status,
                    _now() if status == "accepted" else None,
                ),
            )
            requirements.append(cur.fetchone())

        # 6. Audit
        _audit(cur, env_id=env_id, entity_type="loan_file", entity_id=loan_file_id,
               action="file.created", actor_type="api", actor_id=created_by,
               metadata={"external_application_id": external_application_id,
                         "required_docs": required_documents,
                         "submitted_docs": list(submitted),
                         "loan_file_id": str(loan_file_id)})

        # 7. Check if already complete
        missing = [r for r in requirements if r["status"] not in ("accepted", "waived")]
        if not missing:
            cur.execute(
                "UPDATE dc_loan_file SET status = 'complete', completed_at = %s WHERE loan_file_id = %s",
                (_now(), str(loan_file_id)),
            )
            _audit(cur, env_id=env_id, entity_type="loan_file", entity_id=loan_file_id,
                   action="file.completed", metadata={"reason": "all_docs_submitted_at_intake",
                                                       "loan_file_id": str(loan_file_id)})

        result = {
            "loan_file_id": loan_file_id,
            "env_id": env_id,
            "business_id": business_id,
            "external_application_id": external_application_id,
            "borrower_id": borrower_id,
            "status": "complete" if not missing else "awaiting_initial_outreach",
            "upload_token": token,
            "upload_url": _upload_url(token),
            "requirements": requirements,
            "missing_count": len(missing),
        }

    # 8. Send initial outreach (outside transaction)
    if missing and send_initial_outreach:
        try:
            _send_outreach_for_file(
                loan_file_id=loan_file_id,
                env_id=env_id,
                message_type="initial_request",
            )
        except Exception as exc:
            logger.error("Initial outreach failed for %s: %s", loan_file_id, exc)

    return result


# ── File Retrieval ──────────────────────────────────────────────────

def get_loan_file(*, env_id: UUID, loan_file_id: UUID) -> dict | None:
    """Get a loan file with all nested data."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM dc_loan_file WHERE loan_file_id = %s AND env_id = %s",
            (str(loan_file_id), str(env_id)),
        )
        lf = cur.fetchone()
        if not lf:
            return None

        # Borrower
        cur.execute("SELECT * FROM dc_borrower WHERE borrower_id = %s", (str(lf["borrower_id"]),))
        lf["borrower"] = cur.fetchone()

        # Requirements
        cur.execute(
            "SELECT * FROM dc_doc_requirement WHERE loan_file_id = %s ORDER BY created_at",
            (str(loan_file_id),),
        )
        lf["requirements"] = cur.fetchall()

        # Messages (recent 50)
        cur.execute(
            "SELECT * FROM dc_message_event WHERE loan_file_id = %s ORDER BY created_at DESC LIMIT 50",
            (str(loan_file_id),),
        )
        lf["messages"] = cur.fetchall()

        # Uploads
        cur.execute(
            "SELECT * FROM dc_upload_event WHERE loan_file_id = %s ORDER BY created_at DESC",
            (str(loan_file_id),),
        )
        lf["uploads"] = cur.fetchall()

        # Escalations
        cur.execute(
            "SELECT * FROM dc_escalation_event WHERE loan_file_id = %s ORDER BY triggered_at DESC",
            (str(loan_file_id),),
        )
        lf["escalations"] = cur.fetchall()

        # Computed counts
        reqs = lf["requirements"]
        lf["total_required"] = len([r for r in reqs if r["is_required"]])
        lf["total_received"] = len([r for r in reqs if r["status"] in ("uploaded", "accepted")])
        lf["total_missing"] = len([r for r in reqs if r["is_required"] and r["status"] not in ("accepted", "waived", "uploaded")])

        return lf


def list_loan_files(
    *,
    env_id: UUID,
    business_id: UUID,
    status: str | None = None,
    assigned_processor_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """List loan files with summary info for the dashboard."""
    with get_cursor() as cur:
        conditions = ["lf.env_id = %s", "lf.business_id = %s"]
        params: list[Any] = [str(env_id), str(business_id)]

        if status:
            conditions.append("lf.status = %s")
            params.append(status)
        if assigned_processor_id:
            conditions.append("lf.assigned_processor_id = %s")
            params.append(assigned_processor_id)

        where = " AND ".join(conditions)
        params.extend([limit, offset])

        cur.execute(
            f"""
            SELECT lf.loan_file_id, lf.external_application_id,
                   b.first_name || ' ' || b.last_name AS borrower_name,
                   lf.loan_type, lf.status, lf.assigned_processor_id,
                   lf.last_activity_at, lf.last_outreach_at, lf.opened_at,
                   (SELECT count(*) FROM dc_doc_requirement r WHERE r.loan_file_id = lf.loan_file_id AND r.is_required) AS total_required,
                   (SELECT count(*) FROM dc_doc_requirement r WHERE r.loan_file_id = lf.loan_file_id AND r.status IN ('accepted','uploaded')) AS total_received,
                   (SELECT count(*) FROM dc_doc_requirement r WHERE r.loan_file_id = lf.loan_file_id AND r.is_required AND r.status NOT IN ('accepted','waived','uploaded')) AS total_missing,
                   (SELECT e.status FROM dc_escalation_event e WHERE e.loan_file_id = lf.loan_file_id ORDER BY e.triggered_at DESC LIMIT 1) AS escalation_status
            FROM dc_loan_file lf
            JOIN dc_borrower b ON b.borrower_id = lf.borrower_id
            WHERE {where}
            ORDER BY lf.last_activity_at DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )
        return cur.fetchall()


# ── Completeness Check ──────────────────────────────────────────────

def check_completeness(*, loan_file_id: UUID, env_id: UUID) -> dict:
    """Deterministic completeness check: required vs accepted/waived."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT doc_type, status, is_required
            FROM dc_doc_requirement
            WHERE loan_file_id = %s AND env_id = %s
            """,
            (str(loan_file_id), str(env_id)),
        )
        reqs = cur.fetchall()

    required = [r for r in reqs if r["is_required"]]
    satisfied = [r for r in required if r["status"] in ("accepted", "waived")]
    missing = [r for r in required if r["status"] not in ("accepted", "waived")]

    return {
        "is_complete": len(missing) == 0,
        "total_required": len(required),
        "total_satisfied": len(satisfied),
        "missing_doc_types": [r["doc_type"] for r in missing],
    }


def _mark_complete_if_done(cur: Any, *, loan_file_id: UUID, env_id: UUID) -> bool:
    """Check completeness and update status if all docs satisfied. Returns True if complete."""
    cur.execute(
        """
        SELECT count(*) AS missing
        FROM dc_doc_requirement
        WHERE loan_file_id = %s AND env_id = %s AND is_required = true
          AND status NOT IN ('accepted', 'waived')
        """,
        (str(loan_file_id), str(env_id)),
    )
    row = cur.fetchone()
    if row["missing"] == 0:
        cur.execute(
            """
            UPDATE dc_loan_file
            SET status = 'complete', completed_at = %s, updated_at = %s, last_activity_at = %s
            WHERE loan_file_id = %s AND status != 'complete'
            """,
            (_now(), _now(), _now(), str(loan_file_id)),
        )
        _audit(cur, env_id=env_id, entity_type="loan_file", entity_id=loan_file_id,
               action="file.completed", metadata={"loan_file_id": str(loan_file_id)})
        return True
    return False


# ── Document Actions ────────────────────────────────────────────────

def accept_doc(*, env_id: UUID, loan_file_id: UUID, requirement_id: UUID, actor_id: str | None = None) -> dict:
    """Accept a document requirement."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE dc_doc_requirement SET status = 'accepted', accepted_at = %s, updated_at = %s
            WHERE requirement_id = %s AND loan_file_id = %s AND env_id = %s
            RETURNING requirement_id, doc_type, status
            """,
            (_now(), _now(), str(requirement_id), str(loan_file_id), str(env_id)),
        )
        r = cur.fetchone()
        if not r:
            return {"error": "requirement_not_found"}

        _audit(cur, env_id=env_id, entity_type="doc_requirement", entity_id=requirement_id,
               action="doc.accepted", actor_type="staff", actor_id=actor_id,
               metadata={"loan_file_id": str(loan_file_id), "doc_type": r["doc_type"]})

        cur.execute(
            "UPDATE dc_loan_file SET last_activity_at = %s, updated_at = %s WHERE loan_file_id = %s",
            (_now(), _now(), str(loan_file_id)),
        )
        completed = _mark_complete_if_done(cur, loan_file_id=loan_file_id, env_id=env_id)
        return {**r, "file_completed": completed}


def reject_doc(*, env_id: UUID, loan_file_id: UUID, requirement_id: UUID, notes: str | None = None, actor_id: str | None = None) -> dict:
    """Reject a document — sets status back to 'required' so borrower re-uploads."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE dc_doc_requirement SET status = 'rejected', rejected_at = %s, notes = %s, updated_at = %s
            WHERE requirement_id = %s AND loan_file_id = %s AND env_id = %s
            RETURNING requirement_id, doc_type, status
            """,
            (_now(), notes, _now(), str(requirement_id), str(loan_file_id), str(env_id)),
        )
        r = cur.fetchone()
        if not r:
            return {"error": "requirement_not_found"}
        _audit(cur, env_id=env_id, entity_type="doc_requirement", entity_id=requirement_id,
               action="doc.rejected", actor_type="staff", actor_id=actor_id,
               metadata={"loan_file_id": str(loan_file_id), "doc_type": r["doc_type"], "notes": notes})
        return r


def waive_doc(*, env_id: UUID, loan_file_id: UUID, requirement_id: UUID, actor_id: str | None = None) -> dict:
    """Waive a document requirement."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE dc_doc_requirement SET status = 'waived', waived_at = %s, updated_at = %s
            WHERE requirement_id = %s AND loan_file_id = %s AND env_id = %s
            RETURNING requirement_id, doc_type, status
            """,
            (_now(), _now(), str(requirement_id), str(loan_file_id), str(env_id)),
        )
        r = cur.fetchone()
        if not r:
            return {"error": "requirement_not_found"}
        _audit(cur, env_id=env_id, entity_type="doc_requirement", entity_id=requirement_id,
               action="doc.waived", actor_type="staff", actor_id=actor_id,
               metadata={"loan_file_id": str(loan_file_id), "doc_type": r["doc_type"]})
        completed = _mark_complete_if_done(cur, loan_file_id=loan_file_id, env_id=env_id)
        return {**r, "file_completed": completed}


# ── Upload Processing ───────────────────────────────────────────────

def record_upload(
    *,
    env_id: UUID,
    loan_file_id: UUID,
    requirement_id: UUID,
    filename: str,
    file_type: str,
    file_size_bytes: int | None = None,
    storage_path: str | None = None,
    uploader_ip: str | None = None,
) -> dict:
    """Record a borrower upload and trigger completeness re-check."""
    with get_cursor() as cur:
        # Record upload event
        cur.execute(
            """
            INSERT INTO dc_upload_event (loan_file_id, requirement_id, env_id, filename, file_type,
                                         file_size_bytes, storage_path, upload_status, uploader_ip)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'stored', %s)
            RETURNING upload_event_id
            """,
            (str(loan_file_id), str(requirement_id), str(env_id),
             filename, file_type, file_size_bytes, storage_path, uploader_ip),
        )
        ue = cur.fetchone()

        # Update requirement status to 'uploaded'
        cur.execute(
            """
            UPDATE dc_doc_requirement SET status = 'uploaded', uploaded_at = %s, updated_at = %s
            WHERE requirement_id = %s AND loan_file_id = %s
              AND status IN ('required', 'requested', 'rejected')
            RETURNING requirement_id, doc_type, status
            """,
            (_now(), _now(), str(requirement_id), str(loan_file_id)),
        )
        req = cur.fetchone()

        # Update file activity
        cur.execute(
            """
            UPDATE dc_loan_file
            SET status = CASE WHEN status IN ('awaiting_initial_outreach','waiting_on_borrower','followup_scheduled') THEN 'partial_docs_received' ELSE status END,
                last_activity_at = %s, updated_at = %s
            WHERE loan_file_id = %s
            """,
            (_now(), _now(), str(loan_file_id)),
        )

        _audit(cur, env_id=env_id, entity_type="upload_event", entity_id=ue["upload_event_id"],
               action="doc.uploaded", actor_type="borrower",
               metadata={"loan_file_id": str(loan_file_id), "requirement_id": str(requirement_id),
                         "filename": filename})

        # Check completeness
        completed = _mark_complete_if_done(cur, loan_file_id=loan_file_id, env_id=env_id)

        return {
            "upload_event_id": ue["upload_event_id"],
            "requirement": req,
            "file_completed": completed,
        }


# ── Outreach ────────────────────────────────────────────────────────

def _send_outreach_for_file(
    *,
    loan_file_id: UUID,
    env_id: UUID,
    message_type: str = "initial_request",
    manual_message: str | None = None,
    channel: str = "both",
) -> list[dict]:
    """Send SMS and/or email outreach for a loan file."""
    results = []
    with get_cursor() as cur:
        # Get file + borrower + missing docs
        cur.execute(
            """
            SELECT lf.*, b.first_name, b.last_name, b.email, b.mobile,
                   b.consent_sms, b.consent_email, b.preferred_channel,
                   lf.upload_token, lf.followup_count
            FROM dc_loan_file lf
            JOIN dc_borrower b ON b.borrower_id = lf.borrower_id
            WHERE lf.loan_file_id = %s AND lf.env_id = %s
            """,
            (str(loan_file_id), str(env_id)),
        )
        lf = cur.fetchone()
        if not lf:
            return []

        cur.execute(
            """
            SELECT doc_type FROM dc_doc_requirement
            WHERE loan_file_id = %s AND is_required = true
              AND status NOT IN ('accepted', 'waived')
            """,
            (str(loan_file_id),),
        )
        missing = [r["doc_type"] for r in cur.fetchall()]
        if not missing:
            return []

        upload_url = _upload_url(lf["upload_token"]) if lf["upload_token"] else ""
        followup_num = lf["followup_count"]

        # SMS
        should_sms = channel in ("sms", "both") and lf["mobile"] and lf["consent_sms"]
        if should_sms:
            if manual_message:
                sms_body = manual_message
            elif message_type == "initial_request":
                sms_body = messaging.compose_initial_sms(
                    borrower_first_name=lf["first_name"],
                    missing_docs=missing,
                    upload_url=upload_url,
                )
            else:
                sms_body = messaging.compose_followup_sms(
                    borrower_first_name=lf["first_name"],
                    missing_docs=missing,
                    upload_url=upload_url,
                    followup_number=followup_num,
                )

            sms_result = messaging.send_sms(to=lf["mobile"], body=sms_body)
            cur.execute(
                """
                INSERT INTO dc_message_event (loan_file_id, borrower_id, env_id, channel, message_type,
                                              content_snapshot, external_message_id, sent_at, failed_at, failure_reason)
                VALUES (%s, %s, %s, 'sms', %s, %s, %s, %s, %s, %s)
                RETURNING message_event_id
                """,
                (
                    str(loan_file_id), str(lf["borrower_id"]), str(env_id), message_type,
                    sms_body, sms_result.get("external_message_id"),
                    _now() if sms_result["success"] else None,
                    _now() if not sms_result["success"] else None,
                    sms_result.get("error"),
                ),
            )
            results.append({"channel": "sms", **sms_result})

        # Email
        should_email = channel in ("email", "both") and lf["email"] and lf["consent_email"]
        if should_email:
            if message_type == "initial_request":
                subj, html = messaging.compose_initial_email(
                    borrower_first_name=lf["first_name"],
                    missing_docs=missing,
                    upload_url=upload_url,
                )
            else:
                subj, html = messaging.compose_followup_email(
                    borrower_first_name=lf["first_name"],
                    missing_docs=missing,
                    upload_url=upload_url,
                    followup_number=followup_num,
                )

            email_result = messaging.send_email(to=lf["email"], subject=subj, html_body=html)
            cur.execute(
                """
                INSERT INTO dc_message_event (loan_file_id, borrower_id, env_id, channel, message_type,
                                              subject, content_snapshot, external_message_id,
                                              sent_at, failed_at, failure_reason)
                VALUES (%s, %s, %s, 'email', %s, %s, %s, %s, %s, %s, %s)
                RETURNING message_event_id
                """,
                (
                    str(loan_file_id), str(lf["borrower_id"]), str(env_id), message_type,
                    subj, html[:2000], email_result.get("external_message_id"),
                    _now() if email_result["success"] else None,
                    _now() if not email_result["success"] else None,
                    email_result.get("error"),
                ),
            )
            results.append({"channel": "email", **email_result})

        # Update file status
        new_status = "waiting_on_borrower"
        if message_type != "initial_request":
            new_status = "followup_scheduled"
        cur.execute(
            """
            UPDATE dc_loan_file
            SET status = %s, last_outreach_at = %s, last_activity_at = %s, updated_at = %s,
                followup_count = followup_count + CASE WHEN %s != 'initial_request' THEN 1 ELSE 0 END
            WHERE loan_file_id = %s AND status NOT IN ('complete', 'closed_manually')
            """,
            (new_status, _now(), _now(), _now(), message_type, str(loan_file_id)),
        )

        _audit(cur, env_id=env_id, entity_type="loan_file", entity_id=loan_file_id,
               action=f"outreach.{message_type}", actor_type="system",
               metadata={"loan_file_id": str(loan_file_id), "channels": [r["channel"] for r in results],
                         "missing_docs": missing})

    return results


def send_manual_outreach(
    *,
    env_id: UUID,
    loan_file_id: UUID,
    channel: str = "both",
    message: str | None = None,
    sent_by: str | None = None,
) -> list[dict]:
    """Trigger a manual outreach from staff."""
    return _send_outreach_for_file(
        loan_file_id=loan_file_id,
        env_id=env_id,
        message_type="manual",
        manual_message=message,
        channel=channel,
    )


# ── Follow-Up Processor (called by pg_cron) ────────────────────────

def process_followups() -> dict:
    """Find files needing follow-up and send messages. Returns summary."""
    processed = 0
    errors = 0

    with get_cursor() as cur:
        # Find files that are waiting/followup_scheduled and need a follow-up
        cur.execute(
            """
            SELECT lf.loan_file_id, lf.env_id, lf.followup_count, lf.max_followups,
                   lf.followup_cadence_json, lf.last_outreach_at
            FROM dc_loan_file lf
            WHERE lf.status IN ('waiting_on_borrower', 'followup_scheduled', 'partial_docs_received')
              AND lf.followup_count < lf.max_followups
              AND lf.last_outreach_at IS NOT NULL
              AND lf.last_outreach_at < now() - interval '1 hour'
            ORDER BY lf.last_outreach_at ASC
            LIMIT 50
            """,
        )
        candidates = cur.fetchall()

    for c in candidates:
        try:
            cadence = json.loads(c["followup_cadence_json"]) if isinstance(c["followup_cadence_json"], str) else c["followup_cadence_json"]
            hours_list = cadence.get("hours", [24, 48, 72])
            idx = min(c["followup_count"], len(hours_list) - 1)
            threshold_hours = hours_list[idx]

            if c["last_outreach_at"]:
                last = c["last_outreach_at"]
                if isinstance(last, str):
                    last = datetime.fromisoformat(last)
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                hours_since = (datetime.now(timezone.utc) - last).total_seconds() / 3600
                if hours_since < threshold_hours:
                    continue

            _send_outreach_for_file(
                loan_file_id=c["loan_file_id"],
                env_id=UUID(str(c["env_id"])),
                message_type="followup",
            )
            processed += 1
        except Exception as exc:
            logger.error("Follow-up failed for %s: %s", c["loan_file_id"], exc)
            errors += 1

    return {"processed": processed, "errors": errors, "candidates": len(candidates)}


# ── Escalation Processor (called by pg_cron) ───────────────────────

def process_escalations() -> dict:
    """Find files that need escalation and create escalation events."""
    escalated = 0
    with get_cursor() as cur:
        # Files where followup_count >= max_followups and not yet escalated
        cur.execute(
            """
            SELECT lf.loan_file_id, lf.env_id, lf.followup_count, lf.max_followups,
                   lf.assigned_processor_id, lf.external_application_id
            FROM dc_loan_file lf
            WHERE lf.status IN ('waiting_on_borrower', 'followup_scheduled', 'partial_docs_received')
              AND lf.followup_count >= lf.max_followups
            ORDER BY lf.last_activity_at ASC
            LIMIT 50
            """,
        )
        candidates = cur.fetchall()

        for c in candidates:
            # Get missing docs for the escalation record
            cur.execute(
                """
                SELECT doc_type FROM dc_doc_requirement
                WHERE loan_file_id = %s AND is_required = true
                  AND status NOT IN ('accepted', 'waived')
                """,
                (str(c["loan_file_id"]),),
            )
            missing = [r["doc_type"] for r in cur.fetchall()]

            cur.execute(
                """
                INSERT INTO dc_escalation_event (loan_file_id, env_id, reason, priority, assigned_to,
                                                  metadata_json)
                VALUES (%s, %s, %s, 'high', %s, %s)
                RETURNING escalation_event_id
                """,
                (
                    str(c["loan_file_id"]), str(c["env_id"]),
                    f"no_response_after_{c['followup_count']}_followups",
                    c["assigned_processor_id"],
                    json.dumps({"missing_docs": missing, "application_id": c["external_application_id"]}),
                ),
            )
            esc = cur.fetchone()

            cur.execute(
                """
                UPDATE dc_loan_file
                SET status = 'escalated', escalated_at = %s, last_activity_at = %s, updated_at = %s
                WHERE loan_file_id = %s
                """,
                (_now(), _now(), _now(), str(c["loan_file_id"])),
            )

            _audit(cur, env_id=UUID(str(c["env_id"])), entity_type="escalation_event",
                   entity_id=esc["escalation_event_id"],
                   action="file.escalated", actor_type="cron",
                   metadata={"loan_file_id": str(c["loan_file_id"]), "missing_docs": missing})

            escalated += 1

    return {"escalated": escalated, "candidates": len(candidates)}


# ── Escalation Resolution ──────────────────────────────────────────

def resolve_escalation(
    *,
    env_id: UUID,
    escalation_event_id: UUID,
    resolution_note: str | None = None,
    status: str = "resolved",
    actor_id: str | None = None,
) -> dict:
    """Resolve an escalation event."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE dc_escalation_event
            SET status = %s, resolution_note = %s, resolved_at = %s
            WHERE escalation_event_id = %s AND env_id = %s
            RETURNING escalation_event_id, loan_file_id
            """,
            (status, resolution_note, _now(), str(escalation_event_id), str(env_id)),
        )
        r = cur.fetchone()
        if not r:
            return {"error": "escalation_not_found"}

        _audit(cur, env_id=env_id, entity_type="escalation_event", entity_id=escalation_event_id,
               action="escalation.resolved", actor_type="staff", actor_id=actor_id,
               metadata={"loan_file_id": str(r["loan_file_id"]), "resolution_note": resolution_note})

        return r


# ── Status Update ───────────────────────────────────────────────────

def update_loan_file_status(
    *,
    env_id: UUID,
    loan_file_id: UUID,
    status: str,
    updated_by: str | None = None,
) -> dict:
    """Manual status update."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE dc_loan_file SET status = %s, updated_by = %s, updated_at = %s, last_activity_at = %s
            WHERE loan_file_id = %s AND env_id = %s
            RETURNING loan_file_id, status
            """,
            (status, updated_by, _now(), _now(), str(loan_file_id), str(env_id)),
        )
        r = cur.fetchone()
        if not r:
            return {"error": "file_not_found"}
        _audit(cur, env_id=env_id, entity_type="loan_file", entity_id=loan_file_id,
               action=f"status.changed_to_{status}", actor_type="staff", actor_id=updated_by,
               metadata={"loan_file_id": str(loan_file_id)})
        return r


# ── Dashboard Stats ─────────────────────────────────────────────────

def get_dashboard_stats(*, env_id: UUID, business_id: UUID) -> dict:
    """Aggregate KPIs for the dashboard."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE status NOT IN ('complete','closed_manually')) AS total_active,
                count(*) FILTER (WHERE status = 'waiting_on_borrower') AS waiting_on_borrower,
                count(*) FILTER (WHERE status = 'escalated') AS escalated,
                count(*) FILTER (WHERE status = 'complete' AND completed_at >= CURRENT_DATE) AS completed_today,
                avg(EXTRACT(EPOCH FROM (completed_at - opened_at)) / 3600)
                    FILTER (WHERE status = 'complete' AND completed_at IS NOT NULL) AS avg_completion_hours
            FROM dc_loan_file
            WHERE env_id = %s AND business_id = %s
            """,
            (str(env_id), str(business_id)),
        )
        stats = cur.fetchone()

        cur.execute(
            """
            SELECT count(*) AS total_messages_sent
            FROM dc_message_event me
            JOIN dc_loan_file lf ON lf.loan_file_id = me.loan_file_id
            WHERE lf.env_id = %s AND lf.business_id = %s AND me.sent_at IS NOT NULL
            """,
            (str(env_id), str(business_id)),
        )
        msg_stats = cur.fetchone()

        return {
            "total_active": stats["total_active"] or 0,
            "waiting_on_borrower": stats["waiting_on_borrower"] or 0,
            "escalated": stats["escalated"] or 0,
            "completed_today": stats["completed_today"] or 0,
            "avg_completion_hours": round(float(stats["avg_completion_hours"]), 1) if stats["avg_completion_hours"] else None,
            "total_messages_sent": msg_stats["total_messages_sent"] or 0,
        }


# ── Borrower Portal ────────────────────────────────────────────────

def get_portal_file(*, token: str) -> dict | None:
    """Get borrower-facing file info from an upload token."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT lf.loan_file_id, lf.env_id, lf.external_application_id, lf.loan_type,
                   lf.upload_token_expires, lf.status,
                   b.first_name AS borrower_first_name
            FROM dc_loan_file lf
            JOIN dc_borrower b ON b.borrower_id = lf.borrower_id
            WHERE lf.upload_token = %s
            """,
            (token,),
        )
        lf = cur.fetchone()
        if not lf:
            return None

        # Check expiry
        if lf["upload_token_expires"]:
            expires = lf["upload_token_expires"]
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expires:
                return {"error": "token_expired"}

        # Get requirements
        cur.execute(
            """
            SELECT requirement_id, doc_type, display_name, status
            FROM dc_doc_requirement
            WHERE loan_file_id = %s
            ORDER BY created_at
            """,
            (str(lf["loan_file_id"]),),
        )
        lf["requirements"] = cur.fetchall()
        lf["lender_name"] = ""  # Would come from environment/business config
        return lf


# ── Audit Log Retrieval ─────────────────────────────────────────────

def get_file_audit_log(*, env_id: UUID, loan_file_id: UUID, limit: int = 100) -> list[dict]:
    """Get audit log entries for a loan file."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM dc_audit_log
            WHERE env_id = %s AND metadata_json->>'loan_file_id' = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(env_id), str(loan_file_id), limit),
        )
        return cur.fetchall()
