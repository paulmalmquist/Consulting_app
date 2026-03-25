from __future__ import annotations

import json
from typing import Any, AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.schemas.psychrag import (
    AlertOut,
    AssessmentOut,
    AssessmentSubmitRequest,
    ChatMessageRequest,
    ChatSessionOut,
    EndSessionRequest,
    OnboardingRequest,
    PsychragMeResponse,
    RagDocumentIngestRequest,
    RagDocumentOut,
    ReviewSharedSessionRequest,
    SessionSummaryResponse,
    ShareSessionRequest,
    SharedSessionOut,
    TherapistPatientOut,
    TherapistPatientOverview,
)
from app.services import psychrag as psychrag_svc
from app.services.psychrag_auth import (
    authenticate_supabase_user,
    require_admin_actor,
    require_patient_actor,
    require_psychrag_actor,
    require_therapist_actor,
)

router = APIRouter(prefix="/api/psychrag/v1", tags=["psychrag"])


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/me", response_model=PsychragMeResponse)
async def psychrag_me(identity=Depends(authenticate_supabase_user)):
    return psychrag_svc.get_me(identity.user_id)


@router.post("/profile/onboarding", response_model=PsychragMeResponse)
async def psychrag_onboarding(req: OnboardingRequest, identity=Depends(authenticate_supabase_user)):
    return psychrag_svc.upsert_profile(identity, req.model_dump())


@router.post("/chat/sessions/start", response_model=ChatSessionOut)
async def start_session(req: dict[str, Any] | None = None, actor=Depends(require_patient_actor)):
    payload = req or {}
    return psychrag_svc.create_session(
        actor,
        title=payload.get("title"),
        session_type=payload.get("session_type", "therapy"),
        mood_pre=payload.get("mood_pre"),
    )


@router.get("/chat/sessions", response_model=list[ChatSessionOut])
async def list_sessions(actor=Depends(require_psychrag_actor)):
    return psychrag_svc.list_sessions(actor)


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionOut)
async def get_session(session_id: UUID, actor=Depends(require_psychrag_actor)):
    return psychrag_svc.get_session_detail(actor, session_id)


@router.post("/chat/stream")
async def chat_stream(req: ChatMessageRequest, actor=Depends(require_patient_actor)):
    result = await psychrag_svc.send_chat_message(
        actor,
        message=req.message,
        session_id=req.session_id,
        session_type=req.session_type,
        mood_pre=req.mood_pre,
    )

    async def event_stream() -> AsyncGenerator[str, None]:
        session = result["session"]
        assistant = result["assistant_message"]
        safety = result["safety"]
        yield _sse("session", {"session_id": session["id"]})
        yield _sse("safety", safety)
        for citation in assistant.get("rag_sources") or []:
            yield _sse("citation", citation)
        for chunk in assistant["content"].split(" "):
            if chunk:
                yield _sse("token", {"text": chunk + " "})
        yield _sse(
            "done",
            {
                "session": session,
                "assistant_message": assistant,
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/sessions/{session_id}/end", response_model=ChatSessionOut)
async def end_session(session_id: UUID, req: EndSessionRequest, actor=Depends(require_patient_actor)):
    return psychrag_svc.end_session(actor, session_id, req.mood_post)


@router.get("/chat/sessions/{session_id}/summary", response_model=SessionSummaryResponse)
async def session_summary(session_id: UUID, actor=Depends(require_psychrag_actor)):
    return psychrag_svc.get_session_summary(actor, session_id)


@router.post("/share/session", response_model=SharedSessionOut)
async def share_session(req: ShareSessionRequest, actor=Depends(require_patient_actor)):
    return psychrag_svc.share_session(actor, req.session_id, req.share_type, req.patient_note)


@router.get("/share/pending", response_model=list[dict[str, Any]])
async def pending_shares(actor=Depends(require_therapist_actor)):
    return psychrag_svc.list_pending_shares(actor)


@router.put("/share/{shared_session_id}/review", response_model=SharedSessionOut)
async def review_share(shared_session_id: UUID, req: ReviewSharedSessionRequest, actor=Depends(require_therapist_actor)):
    return psychrag_svc.review_shared_session(actor, shared_session_id, req.model_dump())


@router.get("/therapist/patients", response_model=list[TherapistPatientOut])
async def therapist_patients(actor=Depends(require_therapist_actor)):
    return psychrag_svc.list_therapist_patients(actor)


@router.get("/therapist/patients/{patient_id}/overview", response_model=TherapistPatientOverview)
async def therapist_patient_overview(patient_id: UUID, actor=Depends(require_therapist_actor)):
    return psychrag_svc.get_patient_overview(actor, patient_id)


@router.post("/assessments/submit", response_model=AssessmentOut)
async def submit_assessment(req: AssessmentSubmitRequest, actor=Depends(require_psychrag_actor)):
    return psychrag_svc.submit_assessment(actor, req.model_dump())


@router.get("/assessments/history", response_model=list[AssessmentOut])
async def assessment_history(actor=Depends(require_psychrag_actor)):
    return psychrag_svc.assessment_history(actor)


@router.get("/alerts", response_model=list[AlertOut])
async def alerts(actor=Depends(require_therapist_actor)):
    return psychrag_svc.list_alerts(actor)


@router.get("/rag/documents", response_model=list[RagDocumentOut])
async def rag_documents(actor=Depends(require_admin_actor)):
    return psychrag_svc.list_documents(actor)


@router.post("/rag/ingest", response_model=RagDocumentOut)
async def rag_ingest(req: RagDocumentIngestRequest, actor=Depends(require_admin_actor)):
    return psychrag_svc.ingest_document(actor, req.model_dump())
