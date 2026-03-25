import json
import uuid
from datetime import datetime
import re
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
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
    ensure_pipeline_seed,
    normalize_industry_type,
)
from .excel_api import router as excel_router
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

app.include_router(excel_router)


class EnvironmentCreate(BaseModel):
    client_name: str
    industry: str | None = None
    industry_type: str | None = None
    notes: str | None = None


class EnvironmentUpdate(BaseModel):
    client_name: str | None = None
    industry: str | None = None
    industry_type: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class ChatRequest(BaseModel):
    env_id: str
    session_id: str | None = None
    message: str


class QueueDecision(BaseModel):
    decision: str
    reason: str


class PipelineStageCreate(BaseModel):
    env_id: str
    stage_name: str
    order_index: int | None = None
    color_token: str | None = None


class PipelineStageUpdate(BaseModel):
    stage_name: str | None = None
    order_index: int | None = None
    color_token: str | None = None


class PipelineCardCreate(BaseModel):
    env_id: str
    stage_id: str | None = None
    title: str
    account_name: str | None = None
    owner: str | None = None
    value_cents: int | None = None
    priority: str | None = "medium"
    due_date: str | None = None
    notes: str | None = None
    rank: int | None = None


class PipelineCardUpdate(BaseModel):
    stage_id: str | None = None
    title: str | None = None
    account_name: str | None = None
    owner: str | None = None
    value_cents: int | None = None
    priority: str | None = None
    due_date: str | None = None
    notes: str | None = None
    rank: int | None = None


class EnvironmentPipelineStageUpdate(BaseModel):
    stage_name: str
    workbook_id: str | None = None


class EnvironmentPipelineItemCreate(BaseModel):
    stage_id: str | None = None
    title: str
    account_name: str | None = None
    owner: str | None = None
    value_cents: int | None = None
    priority: str | None = "medium"
    due_date: str | None = None
    notes: str | None = None
    rank: int | None = None


def _normalize_stage_key(raw_name: str) -> str:
    base = normalize_industry_type(raw_name)
    if not base:
        base = "stage"
    if re.match(r"^[0-9]", base):
        base = f"stage_{base}"
    return base[:64]


def _normalize_due_date(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        if "T" in value:
            return datetime.fromisoformat(value).date().isoformat()
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid due_date") from exc


def _serialize_stage(row: Any) -> dict[str, Any]:
    return {
        "stage_id": str(row[0]),
        "stage_key": row[1],
        "stage_name": row[2],
        "order_index": row[3],
        "color_token": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def _serialize_card(row: Any) -> dict[str, Any]:
    return {
        "card_id": str(row[0]),
        "stage_id": str(row[1]),
        "title": row[2],
        "account_name": row[3],
        "owner": row[4],
        "value_cents": row[5],
        "priority": row[6],
        "due_date": row[7].isoformat() if row[7] else None,
        "notes": row[8],
        "rank": row[9],
        "created_at": row[10].isoformat(),
        "updated_at": row[11].isoformat(),
    }


VALID_PIPELINE_PRIORITIES = {"low", "medium", "high", "critical"}


def _resolve_current_stage(conn, env_uuid: uuid.UUID) -> tuple[str | None, str | None]:
    stages = conn.execute(
        """
        SELECT stage_id, stage_name, order_index
        FROM platform.pipeline_stages
        WHERE env_id = %s AND is_deleted = false
        ORDER BY order_index, created_at
        """,
        (env_uuid,),
    ).fetchall()
    if not stages:
        return None, None

    env_stage_row = conn.execute(
        """
        SELECT pipeline_stage_name
        FROM platform.environments
        WHERE env_id = %s
        """,
        (env_uuid,),
    ).fetchone()
    stage_by_name = {str(stage[1]): stage for stage in stages}
    saved_stage_name = (env_stage_row[0] or "").strip() if env_stage_row else ""
    if saved_stage_name and saved_stage_name in stage_by_name:
        chosen = stage_by_name[saved_stage_name]
        return str(chosen[0]), str(chosen[1])

    with_cards = conn.execute(
        """
        SELECT s.stage_id, s.stage_name, s.order_index, COUNT(c.card_id) AS card_count
        FROM platform.pipeline_stages s
        LEFT JOIN platform.pipeline_cards c
          ON c.stage_id = s.stage_id
         AND c.is_deleted = false
        WHERE s.env_id = %s
          AND s.is_deleted = false
        GROUP BY s.stage_id, s.stage_name, s.order_index
        ORDER BY s.order_index DESC
        """,
        (env_uuid,),
    ).fetchall()

    non_empty = [row for row in with_cards if int(row[3] or 0) > 0]
    chosen = non_empty[0] if non_empty else stages[0]

    conn.execute(
        """
        UPDATE platform.environments
        SET pipeline_stage_name = %s
        WHERE env_id = %s
        """,
        (chosen[1], env_uuid),
    )
    return str(chosen[0]), str(chosen[1])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/v1/environments")
async def list_environments():
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        rows = conn.execute(
            """
            SELECT env_id, client_name, industry, industry_type, schema_name, is_active, pipeline_stage_name
            FROM platform.environments
            ORDER BY created_at DESC
            """
        ).fetchall()
    return {
        "environments": [
            {
                "env_id": str(row[0]),
                "client_name": row[1],
                "industry": row[2],
                "industry_type": row[3],
                "schema_name": row[4],
                "is_active": row[5],
                "pipeline_stage_name": row[6],
            }
            for row in rows
        ]
    }


@app.post("/v1/environments")
async def create_environment(payload: EnvironmentCreate):
    industry_type = normalize_industry_type(payload.industry_type or payload.industry)
    legacy_industry = (payload.industry or industry_type).strip() or "general"

    env_id = generate_env_id()
    schema_name = env_schema_name(env_id)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry_type)
        conn.execute(
            """
            INSERT INTO platform.environments
            (env_id, client_name, industry, industry_type, schema_name, is_active, pipeline_stage_name)
            VALUES (%s, %s, %s, %s, %s, true, NULL)
            """,
            (
                env_id,
                payload.client_name,
                legacy_industry,
                industry_type,
                schema_name,
            ),
        )
        ensure_pipeline_seed(conn, env_id, industry_type)
        _, stage_name = _resolve_current_stage(conn, env_id)
        insert_audit_log(
            conn,
            env_id,
            "Demo Lab",
            "create_environment",
            "environment",
            str(env_id),
            {
                "industry": legacy_industry,
                "industry_type": industry_type,
                "notes": payload.notes,
                "pipeline_stage_name": stage_name,
            },
        )
        conn.commit()

    return {
        "env_id": str(env_id),
        "schema_name": schema_name,
        "industry": legacy_industry,
        "industry_type": industry_type,
        "pipeline_stage_name": stage_name,
    }


@app.get("/v1/environments/{env_id}")
async def get_environment(env_id: str):
    """GET /v1/environments/{env_id} — returns a single environment by ID.

    Required by the RE workspace loader (ReEnvProvider) which fetches
    environment metadata via apiFetch('/v1/environments/{envId}').
    Without this handler FastAPI returns 405 Method Not Allowed because
    only PATCH/DELETE were registered for this path.
    """
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        row = conn.execute(
            """
            SELECT env_id, client_name, industry, industry_type, schema_name,
                   is_active, pipeline_stage_name
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Environment not found")

    return {
        "env_id": str(row[0]),
        "client_name": row[1],
        "industry": row[2],
        "industry_type": row[3],
        "schema_name": row[4],
        "is_active": row[5],
        "pipeline_stage_name": row[6],
    }


@app.patch("/v1/environments/{env_id}")
async def update_environment(env_id: str, payload: EnvironmentUpdate):
    env_uuid = uuid.UUID(env_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No update fields provided")

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        existing = conn.execute(
            """
            SELECT env_id, client_name, industry, industry_type, schema_name, is_active, pipeline_stage_name
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Environment not found")

        assignments: list[str] = []
        params: list[Any] = []

        if "client_name" in changes:
            client_name = str(changes["client_name"] or "").strip()
            if not client_name:
                raise HTTPException(status_code=400, detail="client_name cannot be empty")
            assignments.append("client_name = %s")
            params.append(client_name)

        if "industry" in changes:
            assignments.append("industry = %s")
            params.append(str(changes["industry"] or "").strip() or existing[2])

        if "industry_type" in changes or "industry" in changes:
            normalized = normalize_industry_type(
                str(changes.get("industry_type") or changes.get("industry") or existing[3])
            )
            assignments.append("industry_type = %s")
            params.append(normalized)

        if "is_active" in changes:
            assignments.append("is_active = %s")
            params.append(bool(changes["is_active"]))

        if not assignments:
            raise HTTPException(status_code=400, detail="No mutable update fields provided")

        params.append(env_uuid)
        updated = conn.execute(
            f"""
            UPDATE platform.environments
            SET {", ".join(assignments)}
            WHERE env_id = %s
            RETURNING env_id, client_name, industry, industry_type, schema_name, is_active, pipeline_stage_name
            """,
            params,
        ).fetchone()

        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "update_environment",
            "environment",
            env_id,
            {
                "changed_fields": sorted(changes.keys()),
                "notes": changes.get("notes"),
            },
        )
        conn.commit()

    return {
        "environment": {
            "env_id": str(updated[0]),
            "client_name": updated[1],
            "industry": updated[2],
            "industry_type": updated[3],
            "schema_name": updated[4],
            "is_active": updated[5],
            "pipeline_stage_name": updated[6],
        }
    }


@app.delete("/v1/environments/{env_id}")
async def delete_environment(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        row = conn.execute(
            """
            SELECT env_id, client_name, schema_name, industry_type
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")

        schema_name = str(row[2])
        if not re.match(r"^[a-z_][a-z0-9_]*$", schema_name):
            raise HTTPException(status_code=400, detail="Invalid environment schema")

        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "delete_environment",
            "environment",
            env_id,
            {
                "client_name": row[1],
                "industry_type": row[3],
            },
        )
        conn.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        conn.execute("DELETE FROM platform.environments WHERE env_id = %s", (env_uuid,))
        conn.commit()

    return {"ok": True, "env_id": env_id}


@app.post("/v1/environments/{env_id}/reset")
async def reset_environment(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        row = conn.execute(
            """
            SELECT schema_name, COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Environment not found")
        schema_name, industry_type = row
        conn.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        create_env_schema(conn, schema_name)
        seed_environment(conn, schema_name, industry_type)
        conn.execute(
            """
            UPDATE platform.pipeline_cards
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE env_id = %s AND is_deleted = false
            """,
            (env_uuid,),
        )
        conn.execute(
            """
            UPDATE platform.pipeline_stages
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE env_id = %s AND is_deleted = false
            """,
            (env_uuid,),
        )
        ensure_pipeline_seed(conn, env_uuid, industry_type)
        _, stage_name = _resolve_current_stage(conn, env_uuid)
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "reset_environment",
            "environment",
            env_id,
            {"industry_type": industry_type, "pipeline_stage_name": stage_name},
        )
        conn.commit()
    return {"status": "reset", "pipeline_stage_name": stage_name}


@app.get("/v1/pipeline")
async def get_pipeline(env_id: str):
    env_uuid = uuid.UUID(env_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_row = conn.execute(
            """
            SELECT env_id, client_name, industry, COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")

        industry_type = normalize_industry_type(env_row[3])
        ensure_pipeline_seed(conn, env_uuid, industry_type)

        stages = conn.execute(
            """
            SELECT stage_id, stage_key, stage_name, order_index, color_token, created_at, updated_at
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            ORDER BY order_index, created_at
            """,
            (env_uuid,),
        ).fetchall()
        cards = conn.execute(
            """
            SELECT card_id, stage_id, title, account_name, owner, value_cents,
                   priority, due_date, notes, rank, created_at, updated_at
            FROM platform.pipeline_cards
            WHERE env_id = %s AND is_deleted = false
            ORDER BY rank, created_at
            """,
            (env_uuid,),
        ).fetchall()
        current_stage_id, current_stage_name = _resolve_current_stage(conn, env_uuid)
        conn.commit()

    return {
        "env_id": str(env_row[0]),
        "client_name": env_row[1],
        "industry": env_row[2],
        "industry_type": industry_type,
        "current_stage_id": current_stage_id,
        "current_stage_name": current_stage_name,
        "stages": [_serialize_stage(stage) for stage in stages],
        "cards": [_serialize_card(card) for card in cards],
    }


@app.get("/v1/pipeline/global")
async def get_global_pipeline(env_id: str | None = Query(default=None)):
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        if env_id:
            env_uuid = uuid.UUID(env_id)
            env_row = conn.execute(
                """
                SELECT env_id, client_name, industry, COALESCE(industry_type, industry)
                FROM platform.environments
                WHERE env_id = %s AND is_active = true
                """,
                (env_uuid,),
            ).fetchone()
            if not env_row:
                raise HTTPException(status_code=404, detail="Environment not found")

            ensure_pipeline_seed(conn, env_uuid, normalize_industry_type(env_row[3]))
            current_stage_id, current_stage_name = _resolve_current_stage(conn, env_uuid)
            stages = conn.execute(
                """
                SELECT stage_id, stage_name, order_index
                FROM platform.pipeline_stages
                WHERE env_id = %s AND is_deleted = false
                ORDER BY order_index, created_at
                """,
                (env_uuid,),
            ).fetchall()
            conn.commit()
            return {
                "env_id": str(env_uuid),
                "client_name": env_row[1],
                "industry": env_row[2],
                "industry_type": normalize_industry_type(env_row[3]),
                "current_stage_id": current_stage_id,
                "current_stage_name": current_stage_name,
                "stages": [
                    {
                        "stage_id": str(stage[0]),
                        "stage_name": stage[1],
                        "order_index": stage[2],
                    }
                    for stage in stages
                ],
            }

        env_rows = conn.execute(
            """
            SELECT env_id, client_name, industry, COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE is_active = true
            ORDER BY created_at DESC
            """
        ).fetchall()

        items = []
        for env_row in env_rows:
            env_uuid = env_row[0]
            ensure_pipeline_seed(conn, env_uuid, normalize_industry_type(env_row[3]))
            _, current_stage_name = _resolve_current_stage(conn, env_uuid)
            items.append(
                {
                    "env_id": str(env_uuid),
                    "client_name": env_row[1],
                    "industry": env_row[2],
                    "industry_type": normalize_industry_type(env_row[3]),
                    "current_stage_name": current_stage_name,
                }
            )
        conn.commit()

    return {"items": items}


@app.get("/v1/environments/{env_id}/pipeline")
async def get_environment_pipeline(env_id: str):
    return await get_pipeline(env_id)


@app.patch("/v1/environments/{env_id}/pipeline-stage")
async def set_environment_pipeline_stage(env_id: str, payload: EnvironmentPipelineStageUpdate):
    env_uuid = uuid.UUID(env_id)
    stage_name = (payload.stage_name or "").strip()
    if not stage_name:
        raise HTTPException(status_code=400, detail="stage_name is required")

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_row = conn.execute(
            """
            SELECT COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s AND is_active = true
            """,
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")

        ensure_pipeline_seed(conn, env_uuid, normalize_industry_type(env_row[0]))
        stage_row = conn.execute(
            """
            SELECT stage_id, stage_name
            FROM platform.pipeline_stages
            WHERE env_id = %s
              AND stage_name = %s
              AND is_deleted = false
            LIMIT 1
            """,
            (env_uuid, stage_name),
        ).fetchone()
        if not stage_row:
            raise HTTPException(status_code=404, detail="Pipeline stage not found")

        conn.execute(
            """
            UPDATE platform.environments
            SET pipeline_stage_name = %s
            WHERE env_id = %s
            """,
            (stage_row[1], env_uuid),
        )
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "set_environment_pipeline_stage",
            "environment",
            env_id,
            {
                "stage_id": str(stage_row[0]),
                "stage_name": stage_row[1],
                "workbook_id": payload.workbook_id,
            },
        )
        conn.commit()

    return {
        "env_id": env_id,
        "stage_id": str(stage_row[0]),
        "stage_name": stage_row[1],
    }


@app.post("/v1/environments/{env_id}/pipeline/items")
async def create_environment_pipeline_item(env_id: str, payload: EnvironmentPipelineItemCreate):
    card_payload = PipelineCardCreate(
        env_id=env_id,
        stage_id=payload.stage_id,
        title=payload.title,
        account_name=payload.account_name,
        owner=payload.owner,
        value_cents=payload.value_cents,
        priority=payload.priority,
        due_date=payload.due_date,
        notes=payload.notes,
        rank=payload.rank,
    )
    return await create_pipeline_card(card_payload)


@app.patch("/v1/pipeline/items/{item_id}")
async def update_pipeline_item(item_id: str, payload: PipelineCardUpdate):
    return await update_pipeline_card(item_id, payload)


@app.post("/v1/pipeline/stages")
async def create_pipeline_stage(payload: PipelineStageCreate):
    env_uuid = uuid.UUID(payload.env_id)
    stage_name = payload.stage_name.strip()
    if not stage_name:
        raise HTTPException(status_code=400, detail="stage_name is required")

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_row = conn.execute(
            """
            SELECT COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")

        ensure_pipeline_seed(conn, env_uuid, normalize_industry_type(env_row[0]))

        base_key = _normalize_stage_key(stage_name)
        existing_keys = {
            row[0]
            for row in conn.execute(
                """
                SELECT stage_key
                FROM platform.pipeline_stages
                WHERE env_id = %s AND is_deleted = false
                """,
                (env_uuid,),
            ).fetchall()
        }
        stage_key = base_key
        suffix = 2
        while stage_key in existing_keys:
            stage_key = f"{base_key}_{suffix}"
            suffix += 1

        if payload.order_index is None:
            max_order_row = conn.execute(
                """
                SELECT COALESCE(MAX(order_index), 0)
                FROM platform.pipeline_stages
                WHERE env_id = %s AND is_deleted = false
                """,
                (env_uuid,),
            ).fetchone()
            order_index = int(max_order_row[0] or 0) + 10
        else:
            order_index = payload.order_index

        stage_id = uuid.uuid4()
        conn.execute(
            """
            INSERT INTO platform.pipeline_stages
            (stage_id, env_id, stage_key, stage_name, order_index, color_token)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (stage_id, env_uuid, stage_key, stage_name, order_index, payload.color_token),
        )
        stage_row = conn.execute(
            """
            SELECT stage_id, stage_key, stage_name, order_index, color_token, created_at, updated_at
            FROM platform.pipeline_stages
            WHERE stage_id = %s
            """,
            (stage_id,),
        ).fetchone()
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "create_pipeline_stage",
            "pipeline_stage",
            str(stage_id),
            {
                "stage_name": stage_name,
                "stage_key": stage_key,
                "order_index": order_index,
                "color_token": payload.color_token,
            },
        )
        conn.commit()

    return {"stage": _serialize_stage(stage_row)}


@app.patch("/v1/pipeline/stages/{stage_id}")
async def update_pipeline_stage(stage_id: str, payload: PipelineStageUpdate):
    stage_uuid = uuid.UUID(stage_id)
    changes = payload.model_dump(exclude_unset=True)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        existing_row = conn.execute(
            """
            SELECT env_id, stage_id, stage_key, stage_name, order_index, color_token, created_at, updated_at
            FROM platform.pipeline_stages
            WHERE stage_id = %s AND is_deleted = false
            """,
            (stage_uuid,),
        ).fetchone()
        if not existing_row:
            raise HTTPException(status_code=404, detail="Pipeline stage not found")

        assignments: list[str] = []
        params: list[Any] = []

        if "stage_name" in changes:
            next_name = str(changes["stage_name"] or "").strip()
            if not next_name:
                raise HTTPException(status_code=400, detail="stage_name cannot be empty")
            assignments.append("stage_name = %s")
            params.append(next_name)
        if "order_index" in changes:
            assignments.append("order_index = %s")
            params.append(changes["order_index"])
        if "color_token" in changes:
            assignments.append("color_token = %s")
            params.append(changes["color_token"])

        if assignments:
            assignments.append("updated_at = now()")
            params.append(stage_uuid)
            stage_row = conn.execute(
                f"""
                UPDATE platform.pipeline_stages
                SET {", ".join(assignments)}
                WHERE stage_id = %s AND is_deleted = false
                RETURNING stage_id, stage_key, stage_name, order_index, color_token, created_at, updated_at, env_id
                """,
                params,
            ).fetchone()
        else:
            stage_row = (
                existing_row[1],
                existing_row[2],
                existing_row[3],
                existing_row[4],
                existing_row[5],
                existing_row[6],
                existing_row[7],
                existing_row[0],
            )

        insert_audit_log(
            conn,
            stage_row[7],
            "Demo Lab",
            "update_pipeline_stage",
            "pipeline_stage",
            stage_id,
            {"changed_fields": sorted(changes.keys())},
        )
        conn.commit()

    return {
        "stage": _serialize_stage(
            (
                stage_row[0],
                stage_row[1],
                stage_row[2],
                stage_row[3],
                stage_row[4],
                stage_row[5],
                stage_row[6],
            )
        )
    }


@app.delete("/v1/pipeline/stages/{stage_id}")
async def delete_pipeline_stage(stage_id: str):
    stage_uuid = uuid.UUID(stage_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        stage_row = conn.execute(
            """
            SELECT env_id, stage_name
            FROM platform.pipeline_stages
            WHERE stage_id = %s AND is_deleted = false
            """,
            (stage_uuid,),
        ).fetchone()
        if not stage_row:
            raise HTTPException(status_code=404, detail="Pipeline stage not found")
        env_uuid = stage_row[0]

        target_stage = conn.execute(
            """
            SELECT stage_id, stage_name
            FROM platform.pipeline_stages
            WHERE env_id = %s AND stage_id <> %s AND is_deleted = false
            ORDER BY order_index, created_at
            LIMIT 1
            """,
            (env_uuid, stage_uuid),
        ).fetchone()

        if not target_stage:
            fallback_stage_id = uuid.uuid4()
            conn.execute(
                """
                INSERT INTO platform.pipeline_stages
                (stage_id, env_id, stage_key, stage_name, order_index, color_token)
                VALUES (%s, %s, 'inbox', 'Inbox', 10, 'slate')
                """,
                (fallback_stage_id, env_uuid),
            )
            target_stage = (fallback_stage_id, "Inbox")

        moved_cards = conn.execute(
            """
            UPDATE platform.pipeline_cards
            SET stage_id = %s, updated_at = now()
            WHERE stage_id = %s AND is_deleted = false
            RETURNING card_id
            """,
            (target_stage[0], stage_uuid),
        ).fetchall()

        conn.execute(
            """
            UPDATE platform.pipeline_stages
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE stage_id = %s
            """,
            (stage_uuid,),
        )
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "delete_pipeline_stage",
            "pipeline_stage",
            stage_id,
            {
                "stage_name": stage_row[1],
                "moved_cards": len(moved_cards),
                "target_stage_id": str(target_stage[0]),
                "target_stage_name": target_stage[1],
            },
        )
        conn.commit()

    return {
        "ok": True,
        "moved_cards": len(moved_cards),
        "target_stage_id": str(target_stage[0]),
    }


@app.post("/v1/pipeline/cards")
async def create_pipeline_card(payload: PipelineCardCreate):
    env_uuid = uuid.UUID(payload.env_id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    priority = (payload.priority or "medium").strip().lower()
    if priority not in VALID_PIPELINE_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    due_date = _normalize_due_date(payload.due_date)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_row = conn.execute(
            """
            SELECT COALESCE(industry_type, industry)
            FROM platform.environments
            WHERE env_id = %s
            """,
            (env_uuid,),
        ).fetchone()
        if not env_row:
            raise HTTPException(status_code=404, detail="Environment not found")
        ensure_pipeline_seed(conn, env_uuid, normalize_industry_type(env_row[0]))

        target_stage_id: uuid.UUID
        if payload.stage_id:
            target_stage_id = uuid.UUID(payload.stage_id)
            exists = conn.execute(
                """
                SELECT 1
                FROM platform.pipeline_stages
                WHERE stage_id = %s AND env_id = %s AND is_deleted = false
                """,
                (target_stage_id, env_uuid),
            ).fetchone()
            if not exists:
                raise HTTPException(status_code=404, detail="Pipeline stage not found")
        else:
            first_stage = conn.execute(
                """
                SELECT stage_id
                FROM platform.pipeline_stages
                WHERE env_id = %s AND is_deleted = false
                ORDER BY order_index, created_at
                LIMIT 1
                """,
                (env_uuid,),
            ).fetchone()
            if not first_stage:
                raise HTTPException(status_code=404, detail="No pipeline stage available")
            target_stage_id = first_stage[0]

        if payload.rank is None:
            max_rank_row = conn.execute(
                """
                SELECT COALESCE(MAX(rank), 0)
                FROM platform.pipeline_cards
                WHERE env_id = %s AND stage_id = %s AND is_deleted = false
                """,
                (env_uuid, target_stage_id),
            ).fetchone()
            rank = int(max_rank_row[0] or 0) + 10
        else:
            rank = payload.rank

        card_id = uuid.uuid4()
        card_row = conn.execute(
            """
            INSERT INTO platform.pipeline_cards
            (card_id, env_id, stage_id, title, account_name, owner, value_cents, priority, due_date, notes, rank)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::date, %s, %s)
            RETURNING card_id, stage_id, title, account_name, owner, value_cents,
                      priority, due_date, notes, rank, created_at, updated_at
            """,
            (
                card_id,
                env_uuid,
                target_stage_id,
                title,
                payload.account_name,
                payload.owner,
                payload.value_cents,
                priority,
                due_date,
                payload.notes,
                rank,
            ),
        ).fetchone()
        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "create_pipeline_card",
            "pipeline_card",
            str(card_id),
            {"stage_id": str(target_stage_id), "title": title},
        )
        conn.commit()

    return {"card": _serialize_card(card_row)}


@app.patch("/v1/pipeline/cards/{card_id}")
async def update_pipeline_card(card_id: str, payload: PipelineCardUpdate):
    card_uuid = uuid.UUID(card_id)
    changes = payload.model_dump(exclude_unset=True)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        existing = conn.execute(
            """
            SELECT env_id, stage_id, title, account_name, owner, value_cents, priority, due_date, notes, rank
            FROM platform.pipeline_cards
            WHERE card_id = %s AND is_deleted = false
            """,
            (card_uuid,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Pipeline card not found")

        env_uuid = existing[0]
        current_stage_id = existing[1]
        target_stage_id = current_stage_id
        stage_changed = False

        assignments: list[str] = []
        params: list[Any] = []

        if "stage_id" in changes:
            next_stage_raw = str(changes["stage_id"] or "").strip()
            if not next_stage_raw:
                raise HTTPException(status_code=400, detail="stage_id cannot be empty")
            target_stage_id = uuid.UUID(next_stage_raw)
            stage_exists = conn.execute(
                """
                SELECT 1
                FROM platform.pipeline_stages
                WHERE stage_id = %s AND env_id = %s AND is_deleted = false
                """,
                (target_stage_id, env_uuid),
            ).fetchone()
            if not stage_exists:
                raise HTTPException(status_code=404, detail="Pipeline stage not found")
            assignments.append("stage_id = %s")
            params.append(target_stage_id)
            stage_changed = target_stage_id != current_stage_id

        if "title" in changes:
            next_title = str(changes["title"] or "").strip()
            if not next_title:
                raise HTTPException(status_code=400, detail="title cannot be empty")
            assignments.append("title = %s")
            params.append(next_title)
        if "account_name" in changes:
            assignments.append("account_name = %s")
            params.append(changes["account_name"])
        if "owner" in changes:
            assignments.append("owner = %s")
            params.append(changes["owner"])
        if "value_cents" in changes:
            assignments.append("value_cents = %s")
            params.append(changes["value_cents"])
        if "priority" in changes:
            next_priority = str(changes["priority"] or "").strip().lower()
            if next_priority not in VALID_PIPELINE_PRIORITIES:
                raise HTTPException(status_code=400, detail="Invalid priority")
            assignments.append("priority = %s")
            params.append(next_priority)
        if "due_date" in changes:
            assignments.append("due_date = %s::date")
            params.append(_normalize_due_date(changes["due_date"]))
        if "notes" in changes:
            assignments.append("notes = %s")
            params.append(changes["notes"])
        if "rank" in changes:
            assignments.append("rank = %s")
            params.append(changes["rank"])
        elif stage_changed:
            max_rank_row = conn.execute(
                """
                SELECT COALESCE(MAX(rank), 0)
                FROM platform.pipeline_cards
                WHERE env_id = %s AND stage_id = %s AND card_id <> %s AND is_deleted = false
                """,
                (env_uuid, target_stage_id, card_uuid),
            ).fetchone()
            assignments.append("rank = %s")
            params.append(int(max_rank_row[0] or 0) + 10)

        if assignments:
            assignments.append("updated_at = now()")
            params.append(card_uuid)
            card_row = conn.execute(
                f"""
                UPDATE platform.pipeline_cards
                SET {", ".join(assignments)}
                WHERE card_id = %s AND is_deleted = false
                RETURNING card_id, stage_id, title, account_name, owner, value_cents,
                          priority, due_date, notes, rank, created_at, updated_at
                """,
                params,
            ).fetchone()
        else:
            card_row = conn.execute(
                """
                SELECT card_id, stage_id, title, account_name, owner, value_cents,
                       priority, due_date, notes, rank, created_at, updated_at
                FROM platform.pipeline_cards
                WHERE card_id = %s
                """,
                (card_uuid,),
            ).fetchone()

        insert_audit_log(
            conn,
            env_uuid,
            "Demo Lab",
            "move_pipeline_card" if stage_changed else "update_pipeline_card",
            "pipeline_card",
            card_id,
            {
                "changed_fields": sorted(changes.keys()),
                "from_stage_id": str(current_stage_id),
                "to_stage_id": str(card_row[1]),
            },
        )
        conn.commit()

    return {"card": _serialize_card(card_row)}


@app.delete("/v1/pipeline/cards/{card_id}")
async def delete_pipeline_card(card_id: str):
    card_uuid = uuid.UUID(card_id)
    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        row = conn.execute(
            """
            SELECT env_id, stage_id, title
            FROM platform.pipeline_cards
            WHERE card_id = %s AND is_deleted = false
            """,
            (card_uuid,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pipeline card not found")

        conn.execute(
            """
            UPDATE platform.pipeline_cards
            SET is_deleted = true, deleted_at = now(), updated_at = now()
            WHERE card_id = %s
            """,
            (card_uuid,),
        )
        insert_audit_log(
            conn,
            row[0],
            "Demo Lab",
            "delete_pipeline_card",
            "pipeline_card",
            card_id,
            {"title": row[2], "stage_id": str(row[1])},
        )
        conn.commit()

    return {"ok": True}


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
