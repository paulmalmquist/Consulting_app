import json
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, Request

from app.services import winston_demo as svc

router = APIRouter(prefix="/api/winston-demo", tags=["winston-demo"])


@router.post("/environments/{env_id}/ensure")
def ensure_environment(env_id: UUID, payload: dict | None = Body(default=None)):
    try:
        selected_env = payload.get("selected_env") if isinstance(payload, dict) else payload
        return svc.ensure_environment(env_id, selected_env=selected_env)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/environments/{env_id}/seed-meridian")
def seed_meridian(env_id: UUID):
    try:
        return svc.seed_meridian_demo(env_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/documents")
def list_documents(
    env_id: UUID,
    doc_type: str | None = Query(default=None),
    asset_id: str | None = Query(default=None),
    verification_status: str | None = Query(default=None),
):
    try:
        return svc.list_documents(
            env_id,
            doc_type=doc_type,
            asset_id=asset_id,
            verification_status=verification_status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/environments/{env_id}/documents/upload")
async def upload_document(env_id: UUID, request: Request):
    try:
        form = await request.form()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    file = form.get("file")
    if file is None or not hasattr(file, "read"):
        raise HTTPException(status_code=400, detail="file is required")

    doc_type = str(form.get("doc_type") or "").strip()
    if not doc_type:
        raise HTTPException(status_code=400, detail="doc_type is required")

    author = str(form.get("author") or "Winston Demo User")
    verification_status = str(form.get("verification_status") or "draft")
    source_type = str(form.get("source_type") or "upload")
    linked_entities_json = str(form.get("linked_entities_json") or "[]")

    try:
        linked_entities = json.loads(linked_entities_json) if linked_entities_json else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="linked_entities_json must be valid JSON")

    try:
        raw_bytes = await file.read()
        return svc.upload_document(
            env_id,
            filename=getattr(file, "filename", None) or "uploaded-document.txt",
            raw_bytes=raw_bytes,
            doc_type=doc_type,
            author=author,
            verification_status=verification_status,
            source_type=source_type,
            linked_entities=linked_entities if isinstance(linked_entities, list) else [],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/documents/search")
def search_documents(
    env_id: UUID,
    query: str = Query(...),
    doc_type: str | None = Query(default=None),
    asset_id: str | None = Query(default=None),
    verified_only: bool = Query(default=False),
    limit: int = Query(default=8),
):
    try:
        return svc.search_documents(
            env_id,
            query,
            doc_type=doc_type,
            asset_id=asset_id,
            verified_only=verified_only,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/environments/{env_id}/documents/{document_id}")
def get_document_detail(env_id: UUID, document_id: UUID):
    try:
        return svc.get_document_detail(env_id, document_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/documents/{document_id}/chunks")
def get_document_chunks(env_id: UUID, document_id: UUID):
    try:
        return svc.get_document_chunks(env_id, document_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/definitions")
def list_definitions(env_id: UUID):
    try:
        return svc.list_definitions(env_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/environments/{env_id}/definitions/{definition_id}")
def get_definition_detail(env_id: UUID, definition_id: UUID):
    try:
        return svc.get_definition_detail(env_id, definition_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/environments/{env_id}/definitions/{definition_id}/change-requests")
def create_change_request(env_id: UUID, definition_id: UUID, payload: dict = Body(...)):
    try:
        return svc.create_change_request(
            env_id,
            definition_id,
            proposed_definition_text=str(payload.get("proposed_definition_text") or "").strip(),
            proposed_formula_text=payload.get("proposed_formula_text"),
            created_by=str(payload.get("created_by") or "winston_demo_user"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/change-requests/{change_request_id}/approve")
def approve_change_request(change_request_id: UUID, payload: dict | None = Body(default=None)):
    try:
        approved_by = "winston_demo_approver"
        if isinstance(payload, dict) and payload.get("approved_by"):
            approved_by = str(payload["approved_by"])
        return svc.approve_change_request(change_request_id, approved_by=approved_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/change-requests/{change_request_id}/reject")
def reject_change_request(change_request_id: UUID, payload: dict | None = Body(default=None)):
    try:
        rejected_by = "winston_demo_approver"
        if isinstance(payload, dict) and payload.get("rejected_by"):
            rejected_by = str(payload["rejected_by"])
        return svc.reject_change_request(change_request_id, rejected_by=rejected_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/environments/{env_id}/assistant/ask")
def ask(env_id: UUID, payload: dict = Body(...)):
    try:
        return svc.ask(
            env_id,
            question=str(payload.get("question") or "").strip(),
            doc_type=payload.get("doc_type"),
            asset_id=payload.get("asset_id"),
            verified_only=bool(payload.get("verified_only", False)),
            limit=int(payload.get("limit") or 5),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/environments/{env_id}/assistant/scenario/apply")
def apply_scenario(env_id: UUID, payload: dict = Body(...)):
    try:
        fund_id_raw = payload.get("fund_id")
        base_scenario_raw = payload.get("base_scenario_id")
        if not fund_id_raw or not base_scenario_raw:
            raise ValueError("fund_id and base_scenario_id are required")
        return svc.apply_scenario(
            env_id,
            fund_id=UUID(str(fund_id_raw)),
            base_scenario_id=UUID(str(base_scenario_raw)),
            change_type=str(payload.get("change_type") or "assistant_scenario"),
            lever_patch=payload.get("lever_patch") or {},
            quarter=payload.get("quarter"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/audit")
def list_audit(env_id: UUID, limit: int = Query(default=100)):
    try:
        return svc.list_audit(env_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
