import io
import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader

from .actions import assess_risk, execute_action
from .config import get_settings
from .db import (
    get_conn,
    ensure_extensions,
    ensure_platform_tables,
    generate_env_id,
    env_schema_name,
    create_env_schema,
    seed_environment,
    insert_audit_log,
)
from .llm import embed_texts, chat_completion
from .storage import get_storage_client
from .text import chunk_text

app = FastAPI(title="Demo Lab API", version="0.1.0")

settings = get_settings()

if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )


class EnvironmentCreate(BaseModel):
    client_name: str
    industry: str
    notes: str | None = None


class ChatRequest(BaseModel):
    env_id: str
    session_id: str | None = None
    message: str


class QueueDecision(BaseModel):
    decision: str
    reason: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/v1/environments")
async def list_environments():
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        rows = conn.execute(
            "SELECT env_id, client_name, industry, schema_name, is_active FROM platform.environments ORDER BY created_at DESC"
        ).fetchall()
    return {
        "environments": [
            {
                "env_id": str(row[0]),
                "client_name": row[1],
                "industry": row[2],
                "schema_name": row[3],
                "is_active": row[4],
            }
            for row in rows
        ]
    }


@app.post("/v1/environments")
async def create_environment(payload: EnvironmentCreate):
    env_id = generate_env_id()
    schema_name = env_schema_name(env_id)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, payload.industry)
        conn.execute(
            """
            INSERT INTO platform.environments
            (env_id, client_name, industry, schema_name, is_active)
            VALUES (%s, %s, %s, %s, true)
            """,
            (env_id, payload.client_name, payload.industry, schema_name),
        )
        insert_audit_log(
            conn,
            env_id,
            "Demo Lab",
            "create_environment",
            "environment",
            str(env_id),
            {"industry": payload.industry, "notes": payload.notes},
        )
        conn.commit()

    return {"env_id": str(env_id), "schema_name": schema_name}


@app.post("/v1/environments/{env_id}/reset")
async def reset_environment(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        row = conn.execute(
            "SELECT schema_name, industry FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name, industry = row
        conn.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry)
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "reset_environment",
            "environment",
            env_id,
            {},
        )
        conn.commit()
    return {"status": "reset"}


@app.get("/v1/environments/{env_id}/documents")
async def list_documents(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name = row[0]
        docs = conn.execute(
            f"SELECT doc_id, filename, mime_type, size_bytes, created_at FROM {schema_name}.documents ORDER BY created_at DESC"
        ).fetchall()
    return {
        "documents": [
            {
                "doc_id": str(doc[0]),
                "filename": doc[1],
                "mime_type": doc[2],
                "size_bytes": doc[3],
                "created_at": doc[4].isoformat(),
            }
            for doc in docs
        ]
    }


def _extract_text(file: UploadFile) -> str:
    if file.content_type in ["text/plain", "text/markdown"]:
        return file.file.read().decode("utf-8")
    if file.content_type == "application/pdf":
        reader = PdfReader(file.file)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    raise HTTPException(status_code=400, detail="Unsupported file type")


@app.post("/v1/environments/{env_id}/upload")
async def upload_document(env_id: str, file: UploadFile = File(...)):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name = row[0]

        text = _extract_text(file)
        if not text.strip():
            raise HTTPException(status_code=400, detail="No text extracted")

        storage = get_storage_client()
        storage_path = f"{env_id}/{file.filename}"
        file.file.seek(0)
        storage.storage.from_(settings.supabase_storage_bucket).upload(
            storage_path, file.file, {"content-type": file.content_type}
        )

        doc_id = uuid.uuid4()
        size_bytes = file.size or len(text.encode("utf-8"))
        conn.execute(
            f"""
            INSERT INTO {schema_name}.documents
            (doc_id, filename, storage_path, mime_type, size_bytes)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (doc_id, file.filename, storage_path, file.content_type, size_bytes),
        )

        chunks = chunk_text(text)
        embeddings = embed_texts(chunks)
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = uuid.uuid4()
            embedding_str = "[" + ",".join(f"{value:.6f}" for value in embedding) + "]"
            conn.execute(
                f"""
                INSERT INTO {schema_name}.doc_chunks
                (chunk_id, doc_id, chunk_index, content, embedding, metadata)
                VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb)
                """,
                (
                    chunk_id,
                    doc_id,
                    index,
                    chunk,
                    embedding_str,
                    json.dumps({"source": file.filename}),
                ),
            )

        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "upload_document",
            "document",
            str(doc_id),
            {"filename": file.filename},
        )
        conn.commit()

    return {"doc_id": str(doc_id), "chunks": len(chunks)}


@app.post("/v1/chat")
async def chat(payload: ChatRequest):
    env_uuid = uuid.UUID(payload.env_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name = row[0]

        query_embedding = embed_texts([payload.message])[0]
        embedding_str = "[" + ",".join(f"{value:.6f}" for value in query_embedding) + "]"
        results = conn.execute(
            f"""
            SELECT c.chunk_id, c.content, d.filename, d.doc_id
            FROM {schema_name}.doc_chunks c
            JOIN {schema_name}.documents d ON c.doc_id = d.doc_id
            ORDER BY c.embedding <-> %s::vector
            LIMIT 4
            """,
            (embedding_str,),
        ).fetchall()

        citations = [
            {
                "doc_id": str(row[3]),
                "filename": row[2],
                "chunk_id": str(row[0]),
                "snippet": row[1][:200],
            }
            for row in results
        ]
        context = "\n\n".join(
            f"[{idx+1}] {row[1]}" for idx, row in enumerate(results)
        )

        system_prompt = (
            "You are Demo Lab AI. Use only the provided context. "
            "If information is missing, say so. Cite sources as [1], [2], etc."
        )
        answer = chat_completion(system_prompt + "\n" + context, payload.message)

        suggested_actions: list[dict[str, Any]] = []
        risk = assess_risk(payload.message)
        if any(keyword in payload.message.lower() for keyword in ["ticket", "note"]):
            action = {
                "type": "create_ticket",
                "title": "Follow-up request",
                "body": payload.message,
                "intent": "user_request",
                "risk": risk,
            }
            if risk in ["medium", "high"]:
                queue_id = uuid.uuid4()
                conn.execute(
                    """
                    INSERT INTO platform.hitl_queue
                    (id, env_id, status, requested_action, risk_level)
                    VALUES (%s, %s, 'pending', %s::jsonb, %s)
                    """,
                    (
                        queue_id,
                        env_uuid,
                        json.dumps(action),
                        risk,
                    ),
                )
                insert_audit_log(
                    conn,
                    env_uuid,
                    "Demo Lab",
                    "enqueue_action",
                    "hitl_queue",
                    str(queue_id),
                    {"risk": risk},
                )
                suggested_actions.append({"queue_id": str(queue_id), **action})
            else:
                execute_action(conn, schema_name, env_uuid, action)
                suggested_actions.append(action)
        conn.commit()

    return {
        "answer": answer,
        "citations": citations,
        "suggested_actions": suggested_actions,
    }


@app.get("/v1/queue")
async def get_queue(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, status, risk_level, requested_action
            FROM platform.hitl_queue
            WHERE env_id = %s AND status = 'pending'
            ORDER BY created_at DESC
            """,
            (env_uuid,),
        ).fetchall()
    return {
        "items": [
            {
                "id": str(row[0]),
                "created_at": row[1].isoformat(),
                "status": row[2],
                "risk_level": row[3],
                "requested_action": row[4],
            }
            for row in rows
        ]
    }


@app.post("/v1/queue/{queue_id}/decision")
async def decide_queue(queue_id: str, payload: QueueDecision):
    if payload.decision not in {"approve", "deny"}:
        raise HTTPException(status_code=400, detail="Invalid decision")

    with get_conn() as conn:
        row = conn.execute(
            "SELECT env_id, requested_action FROM platform.hitl_queue WHERE id = %s",
            (uuid.UUID(queue_id),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Queue item not found")
        env_uuid, requested_action = row
        env_row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name = env_row[0]

        decision_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE platform.hitl_queue
            SET status = %s,
                decision_reason = %s,
                decided_at = %s,
                decided_by = 'Demo Approver'
            WHERE id = %s
            """,
            (
                payload.decision,
                payload.reason,
                decision_at,
                uuid.UUID(queue_id),
            ),
        )

        if payload.decision == "approve":
            execute_action(conn, schema_name, env_uuid, requested_action)
            insert_audit_log(
                conn,
                env_uuid,
                "Demo Approver",
                "approve_action",
                "hitl_queue",
                queue_id,
                {"reason": payload.reason},
            )
        else:
            insert_audit_log(
                conn,
                env_uuid,
                "Demo Approver",
                "deny_action",
                "hitl_queue",
                queue_id,
                {"reason": payload.reason},
            )
        conn.commit()

    return {"status": payload.decision}


@app.get("/v1/audit")
async def get_audit(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, at, actor, action, entity_type, entity_id, details
            FROM platform.audit_log
            WHERE env_id = %s
            ORDER BY at DESC
            LIMIT 200
            """,
            (env_uuid,),
        ).fetchall()
    return {
        "items": [
            {
                "id": str(row[0]),
                "at": row[1].isoformat(),
                "actor": row[2],
                "action": row[3],
                "entity_type": row[4],
                "entity_id": row[5],
                "details": row[6],
            }
            for row in rows
        ]
    }


@app.get("/v1/metrics")
async def get_metrics(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        env_row = conn.execute(
            "SELECT schema_name FROM platform.environments WHERE env_id = %s",
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name = env_row[0]

        uploads_count = conn.execute(
            f"SELECT COUNT(*) FROM {schema_name}.documents"
        ).fetchone()[0]
        tickets_count = conn.execute(
            f"SELECT COUNT(*) FROM {schema_name}.tickets"
        ).fetchone()[0]
        pending_approvals = conn.execute(
            "SELECT COUNT(*) FROM platform.hitl_queue WHERE env_id = %s AND status = 'pending'",
            (env_uuid,),
        ).fetchone()[0]
        decisions = conn.execute(
            """
            SELECT status, created_at, decided_at
            FROM platform.hitl_queue
            WHERE env_id = %s AND status IN ('approved', 'denied')
            """,
            (env_uuid,),
        ).fetchall()

    approval_rate = (
        len([d for d in decisions if d[0] == "approved"]) / len(decisions)
        if decisions
        else 0
    )
    override_rate = (
        len([d for d in decisions if d[0] == "denied"]) / len(decisions)
        if decisions
        else 0
    )
    avg_time = 0
    if decisions:
        durations = [
            (d[2] - d[1]).total_seconds() for d in decisions if d[2] and d[1]
        ]
        avg_time = sum(durations) / len(durations) if durations else 0

    return {
        "uploads_count": uploads_count,
        "tickets_count": tickets_count,
        "pending_approvals": pending_approvals,
        "approval_rate": approval_rate,
        "override_rate": override_rate,
        "avg_time_to_decision_sec": avg_time,
    }
