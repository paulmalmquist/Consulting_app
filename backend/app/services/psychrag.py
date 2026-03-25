from __future__ import annotations

import json
import time
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException

from app.db import get_cursor
from app.services.psychrag_auth import PsychragActor, SupabaseIdentity
from app.services.psychrag_llm import build_crisis_response, generate_clinical_response, summarize_session
from app.services.psychrag_rag import ingest_document as ingest_kb_document, list_documents as list_kb_documents, retrieve_clinical_context
from app.services.psychrag_safety import assess_message_risk


def _iso(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _json(value) -> str:
    return json.dumps(value or {})


def _json_list(value) -> str:
    return json.dumps(value or [])


def get_default_practice_id() -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM psychrag_practices
            WHERE is_default = true
            ORDER BY created_at ASC
            LIMIT 1
            """
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("PsychRAG default practice is missing")
    return row["id"]


def log_access_event(
    *,
    actor: PsychragActor | None,
    event_type: str,
    target_type: str,
    target_id: str | None = None,
    metadata: dict | None = None,
    practice_id: str | None = None,
) -> None:
    if actor is None and practice_id is None:
        return
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_access_audit_log (practice_id, actor_id, actor_role, event_type, target_type, target_id, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                practice_id or str(actor.practice_id),
                str(actor.user_id) if actor else None,
                actor.role if actor else None,
                event_type,
                target_type,
                target_id,
                _json(metadata),
            ),
        )


def _serialize_profile(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "practice_id": str(row["practice_id"]),
        "role": row["role"],
        "display_name": row["display_name"],
        "email": row["email"],
        "license_number": row.get("license_number"),
        "license_state": row.get("license_state"),
        "specializations": row.get("specializations") or [],
        "onboarding_complete": bool(row.get("onboarding_complete")),
    }


def _serialize_connection(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "patient_id": str(row["patient_id"]),
        "therapist_id": str(row["therapist_id"]) if row.get("therapist_id") else None,
        "therapist_email": row["therapist_email"],
        "status": row["status"],
        "allow_therapist_feedback_to_ai": bool(row.get("allow_therapist_feedback_to_ai")),
        "consent_captured_at": _iso(row.get("consent_captured_at")),
    }


def _serialize_citation(row: dict) -> dict:
    return {
        "document_id": str(row["document_id"]),
        "chunk_id": str(row["id"]),
        "title": row.get("title") or "Clinical source",
        "chapter": row.get("chapter"),
        "section": row.get("section"),
        "page_start": row.get("page_start"),
        "page_end": row.get("page_end"),
        "score": float(row["score"]) if row.get("score") is not None else None,
        "excerpt": row.get("content", "")[:240],
    }


def _serialize_message(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "role": row["role"],
        "content": row["content"],
        "rag_sources": row.get("rag_sources") or [],
        "safety_flags": row.get("safety_flags") or None,
        "model_used": row.get("model_used"),
        "created_at": _iso(row["created_at"]),
    }


def _serialize_session(row: dict, messages: list[dict] | None = None) -> dict:
    return {
        "id": str(row["id"]),
        "title": row.get("title"),
        "session_type": row["session_type"],
        "mood_pre": row.get("mood_pre"),
        "mood_post": row.get("mood_post"),
        "techniques_used": row.get("techniques_used") or [],
        "ai_summary": row.get("ai_summary"),
        "crisis_level": row.get("crisis_level") or "none",
        "is_active": bool(row.get("is_active", True)),
        "created_at": _iso(row["created_at"]),
        "ended_at": _iso(row.get("ended_at")),
        "messages": messages or [],
    }


def _serialize_shared_session(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "session_id": str(row["session_id"]),
        "patient_id": str(row["patient_id"]),
        "therapist_id": str(row["therapist_id"]),
        "share_type": row["share_type"],
        "patient_note": row.get("patient_note"),
        "reviewed": bool(row.get("reviewed")),
        "reviewed_at": _iso(row.get("reviewed_at")),
        "therapist_notes": row.get("therapist_notes"),
        "risk_assessment": row.get("risk_assessment"),
        "follow_up_needed": bool(row.get("follow_up_needed")),
        "ai_clinical_summary": row.get("ai_clinical_summary"),
        "shared_at": _iso(row["shared_at"]),
    }


def _serialize_assessment(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "instrument": row["instrument"],
        "total_score": row["total_score"],
        "severity": row["severity"],
        "responses": row["responses"] or {},
        "session_id": str(row["session_id"]) if row.get("session_id") else None,
        "created_at": _iso(row["created_at"]),
    }


def get_me(user_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM psychrag_profiles WHERE id = %s", (str(user_id),))
        profile = cur.fetchone()
        if not profile:
            return {"profile": None, "relationships": []}

        cur.execute(
            """
            SELECT *
            FROM psychrag_patient_therapist
            WHERE patient_id = %s OR therapist_id = %s
            ORDER BY created_at DESC
            """,
            (str(user_id), str(user_id)),
        )
        rows = cur.fetchall()

    return {
        "profile": _serialize_profile(profile),
        "relationships": [_serialize_connection(row) for row in rows],
    }


def upsert_profile(identity: SupabaseIdentity, payload: dict) -> dict:
    practice_id = get_default_practice_id()
    therapist_email = (payload.get("therapist_email") or "").strip().lower() or None
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_profiles (
              id, practice_id, role, display_name, email, license_number, license_state,
              specializations, onboarding_complete
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true)
            ON CONFLICT (id) DO UPDATE
            SET role = EXCLUDED.role,
                display_name = EXCLUDED.display_name,
                email = EXCLUDED.email,
                license_number = EXCLUDED.license_number,
                license_state = EXCLUDED.license_state,
                specializations = EXCLUDED.specializations,
                onboarding_complete = true
            RETURNING *
            """,
            (
                str(identity.user_id),
                str(practice_id),
                payload["role"],
                payload["display_name"],
                identity.email,
                payload.get("license_number"),
                payload.get("license_state"),
                payload.get("specializations") or [],
            ),
        )
        cur.fetchone()

        cur.execute(
            """
            INSERT INTO psychrag_practice_memberships (practice_id, profile_id, membership_role, is_primary)
            VALUES (%s, %s, %s, true)
            ON CONFLICT (practice_id, profile_id) DO UPDATE
            SET membership_role = EXCLUDED.membership_role,
                is_primary = true
            """,
            (str(practice_id), str(identity.user_id), payload["role"]),
        )

        if payload["role"] == "patient" and therapist_email:
            cur.execute(
                """
                SELECT id, email
                FROM psychrag_profiles
                WHERE lower(email) = %s AND role IN ('therapist', 'admin')
                LIMIT 1
                """,
                (therapist_email,),
            )
            therapist = cur.fetchone()
            cur.execute(
                """
                INSERT INTO psychrag_patient_therapist (
                  practice_id, patient_id, therapist_id, therapist_email, status, connected_at
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (patient_id, therapist_email) DO UPDATE
                SET therapist_id = EXCLUDED.therapist_id,
                    status = EXCLUDED.status,
                    connected_at = EXCLUDED.connected_at
                """,
                (
                    str(practice_id),
                    str(identity.user_id),
                    str(therapist["id"]) if therapist else None,
                    therapist_email,
                    "active" if therapist else "pending",
                    datetime.utcnow() if therapist else None,
                ),
            )

        if payload["role"] in {"therapist", "admin"}:
            cur.execute(
                """
                UPDATE psychrag_patient_therapist
                SET therapist_id = %s,
                    status = 'active',
                    connected_at = COALESCE(connected_at, now())
                WHERE lower(therapist_email) = %s
                """,
                (str(identity.user_id), identity.email.lower()),
            )

    return get_me(identity.user_id)


def _require_session_for_patient(session_id: UUID, patient_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM psychrag_chat_sessions
            WHERE id = %s AND patient_id = %s
            """,
            (str(session_id), str(patient_id)),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="PsychRAG session not found")
    return row


def create_session(actor: PsychragActor, title: str | None = None, session_type: str = "therapy", mood_pre: int | None = None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_chat_sessions (practice_id, patient_id, title, session_type, mood_pre)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (str(actor.practice_id), str(actor.user_id), title, session_type, mood_pre),
        )
        row = cur.fetchone()
    return _serialize_session(row)


def list_sessions(actor: PsychragActor) -> list[dict]:
    query = """
        SELECT *
        FROM psychrag_chat_sessions
        WHERE patient_id = %s
        ORDER BY created_at DESC
    """
    params = (str(actor.user_id),)
    if actor.role in {"therapist", "admin"}:
        query = """
            SELECT DISTINCT s.*
            FROM psychrag_chat_sessions s
            JOIN psychrag_shared_sessions ss ON ss.session_id = s.id
            WHERE ss.therapist_id = %s
            ORDER BY s.created_at DESC
        """
    with get_cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    return [_serialize_session(row) for row in rows]


def get_session_detail(actor: PsychragActor, session_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.*
            FROM psychrag_chat_sessions s
            LEFT JOIN psychrag_shared_sessions ss ON ss.session_id = s.id
            WHERE s.id = %s
              AND (
                s.patient_id = %s
                OR ss.therapist_id = %s
                OR %s = 'admin'
              )
            LIMIT 1
            """,
            (str(session_id), str(actor.user_id), str(actor.user_id), actor.role),
        )
        session = cur.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="PsychRAG session not found")
        cur.execute(
            "SELECT * FROM psychrag_messages WHERE session_id = %s ORDER BY created_at ASC",
            (str(session_id),),
        )
        messages = cur.fetchall()
    log_access_event(actor=actor, event_type="session.read", target_type="chat_session", target_id=str(session_id))
    return _serialize_session(session, [_serialize_message(row) for row in messages])


def _create_notification(
    *,
    practice_id: str,
    therapist_id: str,
    patient_id: str | None,
    shared_session_id: str | None,
    crisis_event_id: str | None,
    notification_type: str,
    payload: dict,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_notifications (
              practice_id, therapist_id, patient_id, shared_session_id, crisis_event_id, notification_type, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                practice_id,
                therapist_id,
                patient_id,
                shared_session_id,
                crisis_event_id,
                notification_type,
                _json(payload),
            ),
        )


async def send_chat_message(actor: PsychragActor, message: str, session_id: UUID | None = None, session_type: str = "therapy", mood_pre: int | None = None) -> dict:
    if actor.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can start PsychRAG chat sessions")

    started = time.perf_counter()
    if session_id is None:
        session = create_session(actor, title=message[:100], session_type=session_type, mood_pre=mood_pre)
        session_id = UUID(session["id"])
    else:
        session = _serialize_session(_require_session_for_patient(session_id, actor.user_id))

    safety = assess_message_risk(message)
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_messages (session_id, role, content, safety_flags)
            VALUES (%s, 'user', %s, %s::jsonb)
            RETURNING *
            """,
            (str(session_id), message, _json(safety.as_dict())),
        )
        user_message_row = cur.fetchone()
        cur.execute(
            """
            SELECT role, content
            FROM psychrag_messages
            WHERE session_id = %s
            ORDER BY created_at ASC
            LIMIT 8
            """,
            (str(session_id),),
        )
        history_rows = cur.fetchall()

    citations_rows = retrieve_clinical_context(message)
    citations = [_serialize_citation(row) for row in citations_rows]
    if safety.risk_level in {"high", "crisis"}:
        response_content = build_crisis_response(safety.resources)
        response_meta = {
            "model_used": "psychrag-safety-protocol",
            "token_count_input": None,
            "token_count_output": None,
        }
    else:
        response_meta = await generate_clinical_response(
            patient_message=message,
            citations=citations_rows,
            history=[{"role": row["role"], "content": row["content"]} for row in history_rows if row["role"] in {"user", "assistant"}],
        )
        response_content = response_meta.pop("content")

    latency_ms = int((time.perf_counter() - started) * 1000)
    assistant_safety = safety.as_dict()
    assistant_safety["resources"] = safety.resources
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_messages (
              session_id, role, content, rag_sources, rag_query, safety_flags,
              model_used, token_count_input, token_count_output, latency_ms
            )
            VALUES (%s, 'assistant', %s, %s::jsonb, %s, %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(session_id),
                response_content,
                _json_list(citations),
                message,
                _json(assistant_safety),
                response_meta.get("model_used"),
                response_meta.get("token_count_input"),
                response_meta.get("token_count_output"),
                latency_ms,
            ),
        )
        assistant_row = cur.fetchone()
        cur.execute(
            """
            UPDATE psychrag_chat_sessions
            SET title = COALESCE(title, left(%s, 100)),
                crisis_level = CASE
                  WHEN crisis_level = 'crisis' THEN crisis_level
                  WHEN %s IN ('crisis', 'high') THEN %s
                  WHEN %s = 'moderate' AND crisis_level IN ('none', 'low') THEN 'moderate'
                  WHEN %s = 'low' AND crisis_level = 'none' THEN 'low'
                  ELSE crisis_level
                END
            WHERE id = %s
            """,
            (message, safety.risk_level, safety.risk_level, safety.risk_level, safety.risk_level, str(session_id)),
        )

    if safety.notify_therapist:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO psychrag_crisis_events (
                  practice_id, patient_id, session_id, message_id, risk_level, detection_sources,
                  requires_resources, therapist_notified, status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, false, 'open')
                RETURNING *
                """,
                (
                    str(actor.practice_id),
                    str(actor.user_id),
                    str(session_id),
                    str(user_message_row["id"]),
                    safety.risk_level,
                    safety.keywords,
                    bool(safety.resources),
                ),
            )
            event_row = cur.fetchone()
            cur.execute(
                """
                SELECT therapist_id
                FROM psychrag_patient_therapist
                WHERE patient_id = %s AND status = 'active' AND therapist_id IS NOT NULL
                ORDER BY connected_at ASC NULLS LAST
                """,
                (str(actor.user_id),),
            )
            therapist_rows = cur.fetchall()
            if therapist_rows:
                for therapist in therapist_rows:
                    _create_notification(
                        practice_id=str(actor.practice_id),
                        therapist_id=str(therapist["therapist_id"]),
                        patient_id=str(actor.user_id),
                        shared_session_id=None,
                        crisis_event_id=str(event_row["id"]),
                        notification_type="crisis_alert",
                        payload={
                            "session_id": str(session_id),
                            "risk_level": safety.risk_level,
                            "message_preview": message[:180],
                        },
                    )
                cur.execute(
                    "UPDATE psychrag_crisis_events SET therapist_notified = true WHERE id = %s",
                    (str(event_row["id"]),),
                )

    return {
        "session": get_session_detail(actor, session_id),
        "assistant_message": _serialize_message(assistant_row),
        "safety": safety.as_dict(),
    }


def end_session(actor: PsychragActor, session_id: UUID, mood_post: int | None = None) -> dict:
    session = _require_session_for_patient(session_id, actor.user_id)
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM psychrag_messages WHERE session_id = %s ORDER BY created_at ASC",
            (str(session_id),),
        )
        messages = cur.fetchall()
    summary, techniques = summarize_session(messages, session["crisis_level"])
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE psychrag_chat_sessions
            SET mood_post = COALESCE(%s, mood_post),
                is_active = false,
                ended_at = now(),
                ai_summary = %s,
                ai_summary_generated_at = now(),
                techniques_used = %s
            WHERE id = %s
            RETURNING *
            """,
            (mood_post, summary, techniques, str(session_id)),
        )
        updated = cur.fetchone()
    log_access_event(actor=actor, event_type="session.end", target_type="chat_session", target_id=str(session_id))
    return _serialize_session(updated, [_serialize_message(row) for row in messages])


def get_session_summary(actor: PsychragActor, session_id: UUID) -> dict:
    detail = get_session_detail(actor, session_id)
    return {
        "session_id": detail["id"],
        "summary": detail["ai_summary"],
        "techniques_used": detail["techniques_used"],
        "crisis_level": detail["crisis_level"],
    }


def share_session(actor: PsychragActor, session_id: UUID, share_type: str, patient_note: str | None = None) -> dict:
    session = _require_session_for_patient(session_id, actor.user_id)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM psychrag_patient_therapist
            WHERE patient_id = %s AND status = 'active' AND therapist_id IS NOT NULL
            ORDER BY connected_at ASC NULLS LAST
            LIMIT 1
            """,
            (str(actor.user_id),),
        )
        connection = cur.fetchone()
        if not connection:
            raise HTTPException(status_code=400, detail="No active therapist connection is available for sharing")

    summary = session.get("ai_summary")
    if not summary:
        end_session(actor, session_id)
        session = _require_session_for_patient(session_id, actor.user_id)
        summary = session.get("ai_summary")

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_shared_sessions (
              session_id, practice_id, patient_id, therapist_id, share_type, patient_note, ai_clinical_summary
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (session_id, therapist_id) DO UPDATE
            SET share_type = EXCLUDED.share_type,
                patient_note = EXCLUDED.patient_note,
                ai_clinical_summary = EXCLUDED.ai_clinical_summary
            RETURNING *
            """,
            (
                str(session_id),
                str(actor.practice_id),
                str(actor.user_id),
                str(connection["therapist_id"]),
                share_type,
                patient_note,
                summary,
            ),
        )
        shared = cur.fetchone()

    _create_notification(
        practice_id=str(actor.practice_id),
        therapist_id=str(connection["therapist_id"]),
        patient_id=str(actor.user_id),
        shared_session_id=str(shared["id"]),
        crisis_event_id=None,
        notification_type="shared_session",
        payload={
            "session_id": str(session_id),
            "share_type": share_type,
            "patient_note": patient_note,
        },
    )
    log_access_event(actor=actor, event_type="session.share", target_type="shared_session", target_id=str(shared["id"]))
    return _serialize_shared_session(shared)


def list_pending_shares(actor: PsychragActor) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ss.*, p.display_name AS patient_name, s.title AS session_title
            FROM psychrag_shared_sessions ss
            JOIN psychrag_profiles p ON p.id = ss.patient_id
            JOIN psychrag_chat_sessions s ON s.id = ss.session_id
            WHERE ss.therapist_id = %s
            ORDER BY ss.reviewed ASC, ss.shared_at DESC
            """,
            (str(actor.user_id),),
        )
        rows = cur.fetchall()
    return [
        {
            **_serialize_shared_session(row),
            "patient_name": row.get("patient_name"),
            "session_title": row.get("session_title"),
        }
        for row in rows
    ]


def review_shared_session(actor: PsychragActor, shared_session_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM psychrag_shared_sessions
            WHERE id = %s AND therapist_id = %s
            """,
            (str(shared_session_id), str(actor.user_id)),
        )
        shared = cur.fetchone()
        if not shared:
            raise HTTPException(status_code=404, detail="Shared PsychRAG session not found")

        cur.execute(
            """
            UPDATE psychrag_shared_sessions
            SET reviewed = true,
                reviewed_at = now(),
                therapist_notes = %s,
                risk_assessment = %s,
                follow_up_needed = %s
            WHERE id = %s
            RETURNING *
            """,
            (
                payload.get("therapist_notes"),
                payload.get("risk_assessment"),
                payload.get("follow_up_needed", False),
                str(shared_session_id),
            ),
        )
        updated = cur.fetchone()
        cur.execute("DELETE FROM psychrag_annotations WHERE shared_session_id = %s", (str(shared_session_id),))
        for annotation in payload.get("annotations") or []:
            cur.execute(
                """
                INSERT INTO psychrag_annotations (shared_session_id, therapist_id, message_id, annotation_type, content)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    str(shared_session_id),
                    str(actor.user_id),
                    annotation.get("message_id"),
                    annotation["annotation_type"],
                    annotation["content"],
                ),
            )

    log_access_event(actor=actor, event_type="shared_session.review", target_type="shared_session", target_id=str(shared_session_id))
    return _serialize_shared_session(updated)


def list_therapist_patients(actor: PsychragActor) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.id AS patient_id, p.display_name, p.email,
                   COUNT(*) FILTER (WHERE ss.reviewed = false) AS pending_reviews,
                   COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'open') AS crisis_alerts,
                   MAX(ss.shared_at) AS last_shared_at
            FROM psychrag_patient_therapist pt
            JOIN psychrag_profiles p ON p.id = pt.patient_id
            LEFT JOIN psychrag_shared_sessions ss ON ss.patient_id = p.id AND ss.therapist_id = pt.therapist_id
            LEFT JOIN psychrag_crisis_events ce ON ce.patient_id = p.id
            WHERE pt.therapist_id = %s AND pt.status = 'active'
            GROUP BY p.id, p.display_name, p.email
            ORDER BY p.display_name ASC
            """,
            (str(actor.user_id),),
        )
        rows = cur.fetchall()
    return [
        {
            "patient_id": str(row["patient_id"]),
            "display_name": row["display_name"],
            "email": row["email"],
            "pending_reviews": int(row.get("pending_reviews") or 0),
            "crisis_alerts": int(row.get("crisis_alerts") or 0),
            "last_shared_at": _iso(row.get("last_shared_at")),
        }
        for row in rows
    ]


def get_patient_overview(actor: PsychragActor, patient_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM psychrag_patient_therapist
            WHERE therapist_id = %s AND patient_id = %s AND status = 'active'
            """,
            (str(actor.user_id), str(patient_id)),
        )
        if cur.fetchone() is None and actor.role != "admin":
            raise HTTPException(status_code=404, detail="PsychRAG patient relationship not found")

        cur.execute("SELECT * FROM psychrag_profiles WHERE id = %s", (str(patient_id),))
        patient = cur.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="PsychRAG patient profile not found")

        cur.execute(
            """
            SELECT *
            FROM psychrag_shared_sessions
            WHERE therapist_id = %s AND patient_id = %s
            ORDER BY shared_at DESC
            """,
            (str(actor.user_id), str(patient_id)),
        )
        shared = cur.fetchall()
        cur.execute(
            """
            SELECT *
            FROM psychrag_assessments
            WHERE patient_id = %s
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (str(patient_id),),
        )
        assessments = cur.fetchall()
        cur.execute(
            """
            SELECT *
            FROM psychrag_crisis_events
            WHERE patient_id = %s
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (str(patient_id),),
        )
        alerts = cur.fetchall()

    log_access_event(actor=actor, event_type="patient.overview.read", target_type="patient", target_id=str(patient_id))
    return {
        "patient": _serialize_profile(patient),
        "shared_sessions": [_serialize_shared_session(row) for row in shared],
        "recent_assessments": [_serialize_assessment(row) for row in assessments],
        "crisis_alerts": [
            {
                "id": str(row["id"]),
                "risk_level": row["risk_level"],
                "status": row["status"],
                "created_at": _iso(row["created_at"]),
            }
            for row in alerts
        ],
    }


def _score_phq9(total: int) -> str:
    if total <= 4:
        return "minimal"
    if total <= 9:
        return "mild"
    if total <= 14:
        return "moderate"
    if total <= 19:
        return "moderately_severe"
    return "severe"


def _score_gad7(total: int) -> str:
    if total <= 4:
        return "minimal"
    if total <= 9:
        return "mild"
    if total <= 14:
        return "moderate"
    return "severe"


def submit_assessment(actor: PsychragActor, payload: dict) -> dict:
    total = sum(int(value) for value in (payload.get("responses") or {}).values())
    severity = _score_phq9(total) if payload["instrument"] == "phq9" else _score_gad7(total)
    administered_by = payload.get("administered_by") or ("therapist" if actor.role in {"therapist", "admin"} else "self")
    patient_id = actor.user_id
    if actor.role in {"therapist", "admin"} and payload.get("patient_id"):
        patient_id = UUID(payload["patient_id"])

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO psychrag_assessments (
              practice_id, patient_id, instrument, responses, total_score, severity, administered_by, session_id
            )
            VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(actor.practice_id),
                str(patient_id),
                payload["instrument"],
                _json(payload.get("responses")),
                total,
                severity,
                administered_by,
                payload.get("session_id"),
            ),
        )
        row = cur.fetchone()

    log_access_event(actor=actor, event_type="assessment.submit", target_type="assessment", target_id=str(row["id"]))
    return _serialize_assessment(row)


def assessment_history(actor: PsychragActor) -> list[dict]:
    with get_cursor() as cur:
        if actor.role in {"therapist", "admin"}:
            cur.execute(
                """
                SELECT a.*
                FROM psychrag_assessments a
                JOIN psychrag_patient_therapist pt ON pt.patient_id = a.patient_id
                WHERE pt.therapist_id = %s AND pt.status = 'active'
                ORDER BY a.created_at DESC
                LIMIT 50
                """,
                (str(actor.user_id),),
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM psychrag_assessments
                WHERE patient_id = %s
                ORDER BY created_at DESC
                LIMIT 50
                """,
                (str(actor.user_id),),
            )
        rows = cur.fetchall()
    return [_serialize_assessment(row) for row in rows]


def list_alerts(actor: PsychragActor) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM psychrag_notifications
            WHERE therapist_id = %s
            ORDER BY status ASC, created_at DESC
            """,
            (str(actor.user_id),),
        )
        rows = cur.fetchall()
    return [
        {
            "id": str(row["id"]),
            "notification_type": row["notification_type"],
            "status": row["status"],
            "payload": row.get("payload") or {},
            "created_at": _iso(row["created_at"]),
        }
        for row in rows
    ]


def list_documents(actor: PsychragActor) -> list[dict]:
    if actor.role != "admin":
        raise HTTPException(status_code=403, detail="Only PsychRAG admins can browse ingest metadata")
    return [
        {
            "id": str(row["id"]),
            "title": row["title"],
            "document_type": row["document_type"],
            "source_license": row["source_license"],
            "approved_for_rag": bool(row["approved_for_rag"]),
            "total_chunks": int(row.get("total_chunks") or 0),
            "ingested_at": _iso(row["ingested_at"]),
        }
        for row in list_kb_documents()
    ]


def ingest_document(actor: PsychragActor, payload: dict) -> dict:
    if actor.role != "admin":
        raise HTTPException(status_code=403, detail="Only PsychRAG admins can ingest new clinical documents")
    document = ingest_kb_document(actor_id=str(actor.user_id), practice_id=str(actor.practice_id), payload=payload)
    log_access_event(actor=actor, event_type="kb.ingest", target_type="kb_document", target_id=str(document["id"]))
    return {
        "id": str(document["id"]),
        "title": document["title"],
        "document_type": document["document_type"],
        "source_license": document["source_license"],
        "approved_for_rag": bool(document["approved_for_rag"]),
        "total_chunks": int(document.get("total_chunks") or 0),
        "ingested_at": _iso(document["ingested_at"]),
    }
