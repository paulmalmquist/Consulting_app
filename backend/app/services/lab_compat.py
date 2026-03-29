from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services import audit as audit_svc
from app.services import lab as lab_svc
from app.services import winston_demo as demo_svc


def _environment_context(env_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, business_id, pipeline_stage_name
                   FROM app.environments
                  WHERE env_id = %s::uuid""",
            (str(env_id),),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Environment not found: {env_id}")
    return row


def _current_stage_from_board(board: dict[str, Any], preferred_stage_name: str | None = None) -> tuple[str | None, str | None]:
    stages = board.get("stages") or []
    cards = board.get("cards") or []
    if not stages:
        return None, None

    if preferred_stage_name:
        preferred = preferred_stage_name.strip().lower()
        for stage in stages:
            stage_name = str(stage.get("stage_name") or "").strip().lower()
            stage_key = str(stage.get("stage_key") or "").strip().lower()
            stage_id = str(stage.get("stage_id") or "").strip().lower()
            if preferred in {stage_name, stage_key, stage_id}:
                return str(stage.get("stage_id")), str(stage.get("stage_name"))

    stage_map = {str(stage.get("stage_id")): stage for stage in stages}
    occupied_ids = {
        str(card.get("stage_id"))
        for card in cards
        if card.get("stage_id") is not None and str(card.get("stage_id")) in stage_map
    }
    if occupied_ids:
        chosen = max(
            (stage_map[stage_id] for stage_id in occupied_ids),
            key=lambda stage: int(stage.get("order_index") or 0),
        )
        return str(chosen.get("stage_id")), str(chosen.get("stage_name"))

    chosen = min(stages, key=lambda stage: int(stage.get("order_index") or 0))
    return str(chosen.get("stage_id")), str(chosen.get("stage_name"))


def get_environment_pipeline(env_id: UUID) -> dict[str, Any]:
    board = lab_svc.get_pipeline_board(env_id)
    env_row = _environment_context(env_id)
    current_stage_id, current_stage_name = _current_stage_from_board(
        board,
        env_row.get("pipeline_stage_name"),
    )
    board["current_stage_id"] = current_stage_id
    board["current_stage_name"] = current_stage_name
    return board


def get_pipeline_global(env_id: UUID | None = None) -> dict[str, Any]:
    if env_id is not None:
        board = get_environment_pipeline(env_id)
        return {
            "env_id": board.get("env_id"),
            "client_name": board.get("client_name"),
            "industry": board.get("industry"),
            "industry_type": board.get("industry_type"),
            "current_stage_id": board.get("current_stage_id"),
            "current_stage_name": board.get("current_stage_name"),
            "stages": [
                {
                    "stage_id": stage.get("stage_id"),
                    "stage_name": stage.get("stage_name"),
                    "order_index": stage.get("order_index"),
                }
                for stage in board.get("stages", [])
            ],
        }

    items: list[dict[str, Any]] = []
    for env in lab_svc.list_environments():
        board = get_environment_pipeline(UUID(str(env["env_id"])))
        items.append(
            {
                "env_id": env.get("env_id"),
                "client_name": env.get("client_name"),
                "industry": env.get("industry"),
                "industry_type": env.get("industry_type"),
                "current_stage_name": board.get("current_stage_name"),
            }
        )
    return {"items": items}


def set_environment_pipeline_stage(env_id: UUID, stage_name: str, workbook_id: str | None = None) -> dict[str, Any]:
    normalized_stage_name = stage_name.strip()
    if not normalized_stage_name:
        raise ValueError("stage_name is required")

    board = lab_svc.get_pipeline_board(env_id)
    matched_stage_id = None
    matched_stage_name = None
    requested = normalized_stage_name.lower()
    for stage in board.get("stages") or []:
        stage_name_value = str(stage.get("stage_name") or "").strip()
        stage_key_value = str(stage.get("stage_key") or "").strip()
        stage_id_value = str(stage.get("stage_id") or "").strip()
        if requested in {stage_name_value.lower(), stage_key_value.lower(), stage_id_value.lower()}:
            matched_stage_id = stage_id_value or None
            matched_stage_name = stage_name_value or None
            break
    if not matched_stage_name:
        raise LookupError(f"Pipeline stage not found: {stage_name}")

    env_row = _environment_context(env_id)
    with get_cursor() as cur:
        cur.execute(
            "UPDATE app.environments SET pipeline_stage_name = %s, updated_at = now() WHERE env_id = %s::uuid",
            (matched_stage_name, str(env_id)),
        )
        cur.execute(
            "UPDATE v1.environments SET pipeline_stage_name = %s WHERE env_id = %s::uuid",
            (matched_stage_name, str(env_id)),
        )

    try:
        audit_svc.record_event(
            actor="excel_addin",
            action="excel.pipeline_stage.updated",
            tool_name="excel.pipeline_stage.update",
            success=True,
            latency_ms=0,
            business_id=UUID(str(env_row["business_id"])) if env_row.get("business_id") else None,
            object_type="environment",
            object_id=UUID(str(env_id)),
            input_data={"env_id": str(env_id), "stage_name": matched_stage_name, "workbook_id": workbook_id},
            output_data={"current_stage_id": matched_stage_id, "current_stage_name": matched_stage_name},
        )
    except Exception:
        pass

    return {
        "ok": True,
        "env_id": str(env_id),
        "current_stage_id": matched_stage_id,
        "current_stage_name": matched_stage_name,
        "pipeline_stage_name": matched_stage_name,
    }


def list_documents(env_id: UUID) -> dict[str, Any]:
    payload = demo_svc.list_documents(env_id)
    documents = []
    for item in payload:
        latest_version = item.get("latest_version") or {}
        documents.append(
            {
                "doc_id": item.get("document_id"),
                "filename": item.get("title") or item.get("virtual_path") or item.get("document_id"),
                "mime_type": latest_version.get("mime_type") or "application/octet-stream",
                "size_bytes": latest_version.get("size_bytes") or 0,
                "created_at": latest_version.get("created_at"),
            }
        )
    return {"documents": documents}


def upload_document(
    env_id: UUID,
    *,
    filename: str,
    raw_bytes: bytes,
    doc_type: str,
    author: str,
    verification_status: str,
    source_type: str,
    linked_entities: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = demo_svc.upload_document(
        env_id,
        filename=filename,
        raw_bytes=raw_bytes,
        doc_type=doc_type,
        author=author,
        verification_status=verification_status,
        source_type=source_type,
        linked_entities=linked_entities,
    )
    return {
        "doc_id": payload.get("document_id"),
        "chunks": payload.get("chunk_count", 0),
    }


def chat(
    env_id: UUID,
    *,
    message: str,
    limit: int,
    doc_type: str | None,
    asset_id: str | None,
    verified_only: bool,
) -> dict[str, Any]:
    payload = demo_svc.ask(
        env_id,
        question=message,
        doc_type=doc_type,
        asset_id=asset_id,
        verified_only=verified_only,
        limit=limit,
    )
    return {
        "answer": payload.get("answer", ""),
        "citations": [
            {
                "doc_id": item.get("document_id"),
                "filename": item.get("title"),
                "chunk_id": item.get("chunk_id"),
                "snippet": item.get("snippet"),
                "score": item.get("score"),
            }
            for item in payload.get("citations", [])
        ],
        "suggested_actions": [],
    }
