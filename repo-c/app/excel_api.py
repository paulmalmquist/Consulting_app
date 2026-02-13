import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from psycopg.rows import dict_row

from .db import ensure_extensions, ensure_platform_tables, get_conn, insert_audit_log

router = APIRouter()

INDUSTRY_ENUM_VALUES = [
    "real_estate_private_equity",
    "construction_project_management",
    "media_planning_buying",
    "professional_services_consulting_firms",
    "healthcare_operator",
    "manufacturing_industrial",
    "saas_technology_company",
    "family_office",
    "hospitality_senior_housing_operator",
    "custom",
    "general",
]

PRIORITY_ENUM_VALUES = ["low", "medium", "high", "critical"]

ENTITY_ALIASES: dict[str, str] = {
    "pipeline_items": "pipeline_cards",
    "pipeline_item": "pipeline_cards",
    "queue_items": "hitl_queue",
}

DISPLAY_FIELD_CANDIDATES = ["name", "title", "full_name", "client_name", "stage_name", "filename"]


class ExcelSessionCompleteRequest(BaseModel):
    api_key: str | None = None
    code: str | None = None


class ExcelQueryRequest(BaseModel):
    env_id: str | None = None
    entity: str
    filters: dict[str, Any] | None = None
    select: list[str] | None = None
    limit: int | None = 200
    order_by: list[str] | None = None


class ExcelUpsertRequest(BaseModel):
    env_id: str | None = None
    entity: str
    rows: list[dict[str, Any]]
    key_fields: list[str] | None = None
    workbook_id: str | None = None


class ExcelDeleteRequest(BaseModel):
    env_id: str | None = None
    entity: str
    key_fields: list[str]
    keys: list[dict[str, Any]]
    workbook_id: str | None = None


class ExcelMetricRequest(BaseModel):
    env_id: str
    metric_name: str
    params: dict[str, Any] | None = None


class ExcelAuditWriteRequest(BaseModel):
    env_id: str
    workbook_id: str
    action: str
    entity_type: str
    entity_id: str
    details: dict[str, Any] | None = None


class EntityRef(BaseModel):
    entity: str
    schema_name: str
    table: str
    scope: str
    env_uuid: uuid.UUID | None = None


def _configured_excel_api_key() -> str:
    return os.getenv("EXCEL_API_KEY", "").strip()


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return ""
    return auth_header[7:].strip()


def _require_excel_actor(request: Request) -> str:
    required_key = _configured_excel_api_key()
    token = _extract_bearer_token(request)

    if required_key:
        if token != required_key:
            raise HTTPException(status_code=401, detail="Invalid Excel add-in token")

    if token:
        return os.getenv("EXCEL_DEFAULT_USER", "Excel Add-in User")
    return "Excel Add-in Demo User"


def _is_safe_identifier(value: str) -> bool:
    return bool(re.match(r"^[a-z_][a-z0-9_]*$", value))


def _quote_identifier(value: str) -> str:
    if not _is_safe_identifier(value):
        raise HTTPException(status_code=400, detail=f"Invalid identifier: {value}")
    return f'"{value}"'


def _json_ready(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    return value


def _resolve_environment_schema(
    conn,
    env_id: str | None,
    *,
    required: bool = False,
) -> tuple[uuid.UUID | None, str | None]:
    if not env_id:
        if required:
            raise HTTPException(status_code=400, detail="env_id is required")
        return None, None

    try:
        env_uuid = uuid.UUID(env_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid env_id") from exc

    env_row = conn.execute(
        """
        SELECT schema_name
        FROM platform.environments
        WHERE env_id = %s AND is_active = true
        """,
        (env_uuid,),
    ).fetchone()
    if not env_row:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env_uuid, str(env_row[0])


def _canonical_entity(entity: str) -> str:
    normalized = (entity or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="entity is required")
    normalized = ENTITY_ALIASES.get(normalized, normalized)
    if not _is_safe_identifier(normalized):
        raise HTTPException(status_code=400, detail="Invalid entity")
    return normalized


def _get_columns(conn, schema_name: str, table_name: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            column_name,
            data_type,
            is_nullable,
            udt_name,
            column_default
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (schema_name, table_name),
    ).fetchall()

    return [
        {
            "name": row[0],
            "data_type": row[1],
            "is_nullable": row[2] == "YES",
            "udt_name": row[3],
            "column_default": row[4],
        }
        for row in rows
    ]


def _get_primary_keys(conn, schema_name: str, table_name: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT a.attname
        FROM pg_class t
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid AND ix.indisprimary
        JOIN unnest(ix.indkey) WITH ORDINALITY AS cols(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
        WHERE ns.nspname = %s
          AND t.relname = %s
        ORDER BY cols.ord
        """,
        (schema_name, table_name),
    ).fetchall()
    return [row[0] for row in rows]


def _detect_display_field(columns: list[dict[str, Any]]) -> str | None:
    names = {column["name"] for column in columns}
    for candidate in DISPLAY_FIELD_CANDIDATES:
        if candidate in names:
            return candidate
    for column in columns:
        if column["data_type"] in {"text", "character varying"}:
            return str(column["name"])
    return columns[0]["name"] if columns else None


def _enum_values_for_field(
    *,
    field_name: str,
    schema_name: str,
    table_name: str,
    conn,
    env_uuid: uuid.UUID | None,
) -> list[str]:
    if field_name == "industry_type":
        return INDUSTRY_ENUM_VALUES
    if field_name == "priority" and table_name == "pipeline_cards":
        return PRIORITY_ENUM_VALUES
    if field_name == "stage_id" and table_name == "pipeline_cards" and env_uuid:
        rows = conn.execute(
            """
            SELECT stage_id
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            ORDER BY order_index, created_at
            """,
            (env_uuid,),
        ).fetchall()
        return [str(row[0]) for row in rows]
    if field_name == "stage_name" and table_name == "pipeline_stages" and env_uuid:
        rows = conn.execute(
            """
            SELECT stage_name
            FROM platform.pipeline_stages
            WHERE env_id = %s AND is_deleted = false
            ORDER BY order_index, created_at
            """,
            (env_uuid,),
        ).fetchall()
        return [str(row[0]) for row in rows]
    return []


def _resolve_entity_ref(conn, entity: str, env_id: str | None) -> EntityRef:
    canonical = _canonical_entity(entity)
    env_uuid, env_schema = _resolve_environment_schema(conn, env_id, required=False)

    if canonical in {"environments", "audit_log", "pipeline_stages", "pipeline_cards", "hitl_queue"}:
        return EntityRef(
            entity=entity,
            schema_name="platform",
            table=canonical,
            scope="platform",
            env_uuid=env_uuid,
        )

    if canonical in {"documents", "doc_chunks", "tickets", "crm_notes"}:
        if not env_schema:
            raise HTTPException(status_code=400, detail=f"env_id is required for entity {entity}")
        return EntityRef(
            entity=entity,
            schema_name=env_schema,
            table=canonical,
            scope="environment",
            env_uuid=env_uuid,
        )

    schemas_to_check = ["platform"]
    if env_schema:
        schemas_to_check.insert(0, env_schema)

    row = conn.execute(
        """
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_name = %s
          AND table_schema = ANY(%s)
        ORDER BY CASE WHEN table_schema = 'platform' THEN 1 ELSE 0 END
        LIMIT 1
        """,
        (canonical, schemas_to_check),
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Unknown entity: {entity}")

    return EntityRef(
        entity=entity,
        schema_name=row[0],
        table=row[1],
        scope="platform" if row[0] == "platform" else "environment",
        env_uuid=env_uuid,
    )


def _coerce_value(raw: Any, udt_name: str) -> Any:
    if raw is None:
        return None
    if udt_name == "uuid":
        if isinstance(raw, uuid.UUID):
            return raw
        return uuid.UUID(str(raw))
    if udt_name in {"int2", "int4", "int8"}:
        return int(raw)
    if udt_name in {"float4", "float8", "numeric"}:
        return float(raw)
    if udt_name == "bool":
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            return raw.strip().lower() in {"1", "true", "yes", "y"}
    if udt_name in {"json", "jsonb"} and isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return None
        try:
            import json

            return json.loads(raw)
        except Exception:
            return {"value": raw}
    return raw


def _build_filter_sql(
    filters: dict[str, Any],
    *,
    allowed_columns: dict[str, dict[str, Any]],
) -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    for field, raw_value in (filters or {}).items():
        if field not in allowed_columns:
            raise HTTPException(status_code=400, detail=f"Unknown filter field: {field}")
        udt_name = str(allowed_columns[field]["udt_name"])
        quoted = _quote_identifier(field)

        if isinstance(raw_value, dict):
            for operator, operand in raw_value.items():
                if operator == "eq":
                    clauses.append(f"{quoted} = %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "ne":
                    clauses.append(f"{quoted} <> %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "gt":
                    clauses.append(f"{quoted} > %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "gte":
                    clauses.append(f"{quoted} >= %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "lt":
                    clauses.append(f"{quoted} < %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "lte":
                    clauses.append(f"{quoted} <= %s")
                    params.append(_coerce_value(operand, udt_name))
                elif operator == "contains":
                    clauses.append(f"{quoted}::text ILIKE %s")
                    params.append(f"%{operand}%")
                elif operator == "in":
                    if not isinstance(operand, list) or not operand:
                        raise HTTPException(status_code=400, detail=f"Filter 'in' requires list for {field}")
                    placeholders = ", ".join(["%s"] * len(operand))
                    clauses.append(f"{quoted} IN ({placeholders})")
                    params.extend([_coerce_value(item, udt_name) for item in operand])
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported filter operator: {operator}")
            continue

        if isinstance(raw_value, list):
            if not raw_value:
                raise HTTPException(status_code=400, detail=f"Filter list cannot be empty for {field}")
            placeholders = ", ".join(["%s"] * len(raw_value))
            clauses.append(f"{quoted} IN ({placeholders})")
            params.extend([_coerce_value(item, udt_name) for item in raw_value])
            continue

        clauses.append(f"{quoted} = %s")
        params.append(_coerce_value(raw_value, udt_name))

    return clauses, params


def _build_order_sql(order_by: list[str] | None, allowed_columns: set[str]) -> str:
    if not order_by:
        return ""

    clauses: list[str] = []
    for token in order_by:
        raw = (token or "").strip()
        if not raw:
            continue

        if ":" in raw:
            field, direction = raw.split(":", 1)
        else:
            field, direction = raw, "asc"

        field = field.strip()
        direction = direction.strip().lower()

        if field not in allowed_columns:
            raise HTTPException(status_code=400, detail=f"Unknown order_by field: {field}")
        if direction not in {"asc", "desc"}:
            raise HTTPException(status_code=400, detail=f"Invalid order direction for {field}")

        clauses.append(f"{_quote_identifier(field)} {direction.upper()}")

    if not clauses:
        return ""
    return f"ORDER BY {', '.join(clauses)}"


def _pk_id_value(pk_fields: list[str], row: dict[str, Any] | tuple[Any, ...]) -> str:
    if isinstance(row, dict):
        if len(pk_fields) == 1:
            return str(_json_ready(row.get(pk_fields[0])))
        return str({_field: _json_ready(row.get(_field)) for _field in pk_fields})
    if len(pk_fields) == 1:
        return str(_json_ready(row[0]))
    return str({_field: _json_ready(row[idx]) for idx, _field in enumerate(pk_fields)})


def _log_excel_write(
    conn,
    *,
    env_uuid: uuid.UUID | None,
    actor: str,
    action: str,
    entity: str,
    workbook_id: str | None,
    details: dict[str, Any],
) -> None:
    if not env_uuid:
        return
    payload = dict(details)
    if workbook_id:
        payload["workbook_id"] = workbook_id

    insert_audit_log(
        conn,
        env_uuid,
        actor,
        action,
        "excel",
        entity,
        payload,
    )


@router.post("/v1/excel/session/init")
async def excel_session_init():
    required_key = _configured_excel_api_key()
    return {
        "mode": "api_key",
        "requires_api_key": bool(required_key),
        "auth_url": None,
    }


@router.post("/v1/excel/session/complete")
async def excel_session_complete(payload: ExcelSessionCompleteRequest):
    required_key = _configured_excel_api_key()
    candidate = (payload.api_key or "").strip()

    if required_key and candidate != required_key:
        raise HTTPException(status_code=401, detail="Invalid Excel API key")

    token = candidate or "demo-excel-token"
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": 24 * 60 * 60,
    }


@router.get("/v1/excel/me")
async def excel_me(request: Request):
    _require_excel_actor(request)
    return {
        "user_id": "excel-user",
        "email": os.getenv("EXCEL_DEFAULT_EMAIL", "excel.user@business-machine.local"),
        "org_name": os.getenv("EXCEL_DEFAULT_ORG", "Business Machine"),
        "permissions": [
            "excel:read",
            "excel:write",
            "environments:read",
            "environments:write",
            "pipeline:read",
            "pipeline:write",
        ],
    }


@router.get("/v1/excel/schema")
async def excel_schema(
    request: Request,
    env_id: str | None = Query(default=None),
):
    _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_uuid, env_schema = _resolve_environment_schema(conn, env_id, required=False)

        target_schemas = ["platform"]
        if env_schema:
            target_schemas.append(env_schema)

        rows = conn.execute(
            """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema = ANY(%s)
            ORDER BY table_schema, table_name
            """,
            (target_schemas,),
        ).fetchall()

        entities: list[dict[str, Any]] = []
        seen: set[str] = set()

        for schema_name, table_name in rows:
            entity_name = str(table_name)
            if schema_name == "platform" and table_name == "pipeline_cards":
                entity_name = "pipeline_items"
            if schema_name == "platform" and table_name == "hitl_queue":
                entity_name = "queue_items"

            if entity_name in seen:
                continue
            seen.add(entity_name)

            columns = _get_columns(conn, schema_name, table_name)
            primary_keys = _get_primary_keys(conn, schema_name, table_name)
            display_field = _detect_display_field(columns)

            entities.append(
                {
                    "entity": entity_name,
                    "schema": schema_name,
                    "table": table_name,
                    "display_field": display_field,
                    "primary_keys": primary_keys,
                    "scope": "platform" if schema_name == "platform" else "environment",
                }
            )

    return {
        "env_id": str(env_uuid) if env_uuid else None,
        "entities": entities,
    }


@router.get("/v1/excel/schema/{entity}")
async def excel_schema_entity(
    entity: str,
    request: Request,
    env_id: str | None = Query(default=None),
):
    _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        ref = _resolve_entity_ref(conn, entity, env_id)
        columns = _get_columns(conn, ref.schema_name, ref.table)
        if not columns:
            raise HTTPException(status_code=404, detail=f"No columns found for entity: {entity}")

        primary_keys = _get_primary_keys(conn, ref.schema_name, ref.table)
        display_field = _detect_display_field(columns)

        fields = [
            {
                "name": column["name"],
                "type": column["data_type"],
                "required": not column["is_nullable"] and column["column_default"] is None,
                "primary_key": column["name"] in primary_keys,
                "enum_values": _enum_values_for_field(
                    field_name=column["name"],
                    schema_name=ref.schema_name,
                    table_name=ref.table,
                    conn=conn,
                    env_uuid=ref.env_uuid,
                ),
                "display_name": str(column["name"]).replace("_", " ").title(),
            }
            for column in columns
        ]

    return {
        "entity": entity,
        "schema": ref.schema_name,
        "table": ref.table,
        "display_field": display_field,
        "primary_keys": primary_keys,
        "fields": fields,
    }


@router.post("/v1/excel/query")
async def excel_query(payload: ExcelQueryRequest, request: Request):
    _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        ref = _resolve_entity_ref(conn, payload.entity, payload.env_id)
        columns = _get_columns(conn, ref.schema_name, ref.table)
        if not columns:
            raise HTTPException(status_code=404, detail=f"No columns found for entity: {payload.entity}")

        columns_by_name = {column["name"]: column for column in columns}
        available = set(columns_by_name.keys())

        selected_columns = payload.select or list(available)
        for selected in selected_columns:
            if selected not in available:
                raise HTTPException(status_code=400, detail=f"Unknown selected field: {selected}")

        where_clauses, params = _build_filter_sql(payload.filters or {}, allowed_columns=columns_by_name)

        if ref.env_uuid and "env_id" in available and "env_id" not in (payload.filters or {}):
            where_clauses.append(f"{_quote_identifier('env_id')} = %s")
            params.append(ref.env_uuid)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        order_sql = _build_order_sql(payload.order_by, available)
        limit = min(max(int(payload.limit or 200), 1), 1000)

        select_sql = ", ".join(_quote_identifier(column) for column in selected_columns)
        table_ref = f"{_quote_identifier(ref.schema_name)}.{_quote_identifier(ref.table)}"

        query = f"SELECT {select_sql} FROM {table_ref} {where_sql} {order_sql} LIMIT %s"
        params.append(limit)

        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return {
        "entity": payload.entity,
        "rows": [{key: _json_ready(value) for key, value in row.items()} for row in rows],
        "count": len(rows),
    }


@router.post("/v1/excel/upsert")
async def excel_upsert(payload: ExcelUpsertRequest, request: Request):
    actor = _require_excel_actor(request)

    if not payload.rows:
        return {
            "inserted_count": 0,
            "updated_count": 0,
            "ids": [],
            "row_errors": [],
        }

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        ref = _resolve_entity_ref(conn, payload.entity, payload.env_id)
        columns = _get_columns(conn, ref.schema_name, ref.table)
        if not columns:
            raise HTTPException(status_code=404, detail=f"No columns found for entity: {payload.entity}")

        columns_by_name = {column["name"]: column for column in columns}
        available = set(columns_by_name.keys())
        primary_keys = _get_primary_keys(conn, ref.schema_name, ref.table)
        key_fields = payload.key_fields or primary_keys

        if not key_fields:
            raise HTTPException(status_code=400, detail="key_fields required (or table must expose primary key)")

        for field in key_fields:
            if field not in available:
                raise HTTPException(status_code=400, detail=f"Unknown key field: {field}")

        table_ref = f"{_quote_identifier(ref.schema_name)}.{_quote_identifier(ref.table)}"

        inserted_count = 0
        updated_count = 0
        ids: list[str] = []
        row_errors: list[dict[str, Any]] = []

        with conn.cursor(row_factory=dict_row) as cur:
            for idx, raw_row in enumerate(payload.rows):
                try:
                    row_data = {
                        key: _coerce_value(value, str(columns_by_name[key]["udt_name"]))
                        for key, value in raw_row.items()
                        if key in available
                    }

                    if ref.env_uuid and "env_id" in available and "env_id" not in row_data:
                        row_data["env_id"] = ref.env_uuid

                    if not row_data:
                        raise HTTPException(status_code=422, detail="Row has no known fields")

                    for key_field in key_fields:
                        if key_field not in row_data or row_data[key_field] in {None, ""}:
                            raise HTTPException(status_code=422, detail=f"Missing key field: {key_field}")

                    where_parts = [f"{_quote_identifier(field)} = %s" for field in key_fields]
                    where_values = [row_data[field] for field in key_fields]
                    if ref.env_uuid and "env_id" in available and "env_id" not in key_fields:
                        where_parts.append(f"{_quote_identifier('env_id')} = %s")
                        where_values.append(ref.env_uuid)

                    existing_sql = (
                        f"SELECT {', '.join(_quote_identifier(pk) for pk in primary_keys)} "
                        f"FROM {table_ref} WHERE {' AND '.join(where_parts)} LIMIT 1"
                        if primary_keys
                        else None
                    )

                    existing = None
                    if existing_sql:
                        cur.execute(existing_sql, where_values)
                        existing = cur.fetchone()

                    if existing:
                        update_fields = [field for field in row_data.keys() if field not in key_fields]
                        if update_fields:
                            assignments = [f"{_quote_identifier(field)} = %s" for field in update_fields]
                            update_values = [row_data[field] for field in update_fields]
                            if "updated_at" in available and "updated_at" not in update_fields:
                                assignments.append(f"{_quote_identifier('updated_at')} = now()")

                            update_sql = (
                                f"UPDATE {table_ref} SET {', '.join(assignments)} "
                                f"WHERE {' AND '.join(where_parts)}"
                            )
                            cur.execute(update_sql, [*update_values, *where_values])

                        updated_count += 1
                        ids.append(_pk_id_value(primary_keys, existing))
                        continue

                    for pk in primary_keys:
                        if pk not in row_data and str(columns_by_name[pk]["udt_name"]) == "uuid":
                            row_data[pk] = uuid.uuid4()

                    insert_fields = list(row_data.keys())
                    placeholders = ", ".join(["%s"] * len(insert_fields))
                    insert_sql = (
                        f"INSERT INTO {table_ref} ({', '.join(_quote_identifier(field) for field in insert_fields)}) "
                        f"VALUES ({placeholders})"
                    )
                    cur.execute(insert_sql, [row_data[field] for field in insert_fields])

                    if primary_keys:
                        pk_data = {pk: row_data.get(pk) for pk in primary_keys}
                        ids.append(_pk_id_value(primary_keys, pk_data))

                    inserted_count += 1
                except HTTPException as exc:
                    row_errors.append(
                        {
                            "row_index": idx,
                            "code": "VALIDATION",
                            "message": str(exc.detail),
                        }
                    )
                except Exception as exc:
                    row_errors.append(
                        {
                            "row_index": idx,
                            "code": "ERROR",
                            "message": str(exc),
                        }
                    )

        _log_excel_write(
            conn,
            env_uuid=ref.env_uuid,
            actor=actor,
            action="excel_upsert",
            entity=payload.entity,
            workbook_id=payload.workbook_id,
            details={
                "inserted_count": inserted_count,
                "updated_count": updated_count,
                "row_errors": len(row_errors),
            },
        )
        conn.commit()

    return {
        "inserted_count": inserted_count,
        "updated_count": updated_count,
        "ids": ids,
        "row_errors": row_errors,
    }


@router.post("/v1/excel/delete")
async def excel_delete(payload: ExcelDeleteRequest, request: Request):
    actor = _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        ref = _resolve_entity_ref(conn, payload.entity, payload.env_id)
        columns = _get_columns(conn, ref.schema_name, ref.table)
        if not columns:
            raise HTTPException(status_code=404, detail=f"No columns found for entity: {payload.entity}")

        columns_by_name = {column["name"]: column for column in columns}
        available = set(columns_by_name.keys())
        for field in payload.key_fields:
            if field not in available:
                raise HTTPException(status_code=400, detail=f"Unknown key field: {field}")

        table_ref = f"{_quote_identifier(ref.schema_name)}.{_quote_identifier(ref.table)}"
        row_errors: list[dict[str, Any]] = []
        deleted_count = 0

        with conn.cursor() as cur:
            for idx, key_map in enumerate(payload.keys):
                try:
                    where_parts = []
                    where_values = []
                    for key_field in payload.key_fields:
                        if key_field not in key_map:
                            raise HTTPException(status_code=422, detail=f"Missing key field: {key_field}")
                        where_parts.append(f"{_quote_identifier(key_field)} = %s")
                        udt_name = str(columns_by_name[key_field]["udt_name"])
                        where_values.append(_coerce_value(key_map[key_field], udt_name))

                    if ref.env_uuid and "env_id" in available and "env_id" not in payload.key_fields:
                        where_parts.append(f"{_quote_identifier('env_id')} = %s")
                        where_values.append(ref.env_uuid)

                    if not where_parts:
                        raise HTTPException(status_code=422, detail="At least one key field is required")

                    if "is_deleted" in available:
                        sql = (
                            f"UPDATE {table_ref} SET is_deleted = true, deleted_at = now(), updated_at = now() "
                            f"WHERE {' AND '.join(where_parts)} AND COALESCE(is_deleted, false) = false"
                        )
                    else:
                        sql = f"DELETE FROM {table_ref} WHERE {' AND '.join(where_parts)}"

                    cur.execute(sql, where_values)
                    deleted_count += int(cur.rowcount or 0)
                except HTTPException as exc:
                    row_errors.append(
                        {
                            "row_index": idx,
                            "code": "VALIDATION",
                            "message": str(exc.detail),
                        }
                    )
                except Exception as exc:
                    row_errors.append(
                        {
                            "row_index": idx,
                            "code": "ERROR",
                            "message": str(exc),
                        }
                    )

        _log_excel_write(
            conn,
            env_uuid=ref.env_uuid,
            actor=actor,
            action="excel_delete",
            entity=payload.entity,
            workbook_id=payload.workbook_id,
            details={
                "deleted_count": deleted_count,
                "row_errors": len(row_errors),
            },
        )
        conn.commit()

    return {
        "deleted_count": deleted_count,
        "row_errors": row_errors,
    }


@router.post("/v1/excel/metric")
async def excel_metric(payload: ExcelMetricRequest, request: Request):
    _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)
        env_uuid, env_schema = _resolve_environment_schema(conn, payload.env_id, required=True)

        metric = payload.metric_name.strip().lower()

        if metric == "pipeline_total_value":
            row = conn.execute(
                """
                SELECT COALESCE(SUM(value_cents), 0)
                FROM platform.pipeline_cards
                WHERE env_id = %s AND is_deleted = false
                """,
                (env_uuid,),
            ).fetchone()
            value = float(row[0] or 0) / 100.0
            return {
                "metric_name": metric,
                "value": value,
                "metadata": {"currency": "USD", "method": "sum(value_cents)"},
            }

        if metric == "pipeline_weighted_value":
            rows = conn.execute(
                """
                SELECT COALESCE(c.value_cents, 0), COALESCE(s.order_index, 0)
                FROM platform.pipeline_cards c
                JOIN platform.pipeline_stages s ON s.stage_id = c.stage_id
                WHERE c.env_id = %s
                  AND c.is_deleted = false
                  AND s.is_deleted = false
                """,
                (env_uuid,),
            ).fetchall()
            if not rows:
                return {
                    "metric_name": metric,
                    "value": 0,
                    "metadata": {"cards": 0, "method": "weighted_by_stage_order"},
                }

            max_order = max(int(row[1] or 0) for row in rows) or 1
            weighted_total = sum((float(row[0] or 0) / 100.0) * (float(row[1] or 0) / max_order) for row in rows)
            return {
                "metric_name": metric,
                "value": weighted_total,
                "metadata": {
                    "cards": len(rows),
                    "max_order_index": max_order,
                    "method": "sum(value * stage_order/max_stage_order)",
                },
            }

        if metric == "pipeline_items_count":
            row = conn.execute(
                """
                SELECT COUNT(*)
                FROM platform.pipeline_cards
                WHERE env_id = %s AND is_deleted = false
                """,
                (env_uuid,),
            ).fetchone()
            return {
                "metric_name": metric,
                "value": int(row[0] or 0),
                "metadata": {},
            }

        if metric == "documents_count":
            row = conn.execute(f"SELECT COUNT(*) FROM {_quote_identifier(env_schema)}.{_quote_identifier('documents')}").fetchone()
            return {
                "metric_name": metric,
                "value": int(row[0] or 0),
                "metadata": {},
            }

        if metric == "tickets_count":
            row = conn.execute(f"SELECT COUNT(*) FROM {_quote_identifier(env_schema)}.{_quote_identifier('tickets')}").fetchone()
            return {
                "metric_name": metric,
                "value": int(row[0] or 0),
                "metadata": {},
            }

        if metric == "pending_approvals":
            row = conn.execute(
                """
                SELECT COUNT(*)
                FROM platform.hitl_queue
                WHERE env_id = %s AND status = 'pending'
                """,
                (env_uuid,),
            ).fetchone()
            return {
                "metric_name": metric,
                "value": int(row[0] or 0),
                "metadata": {},
            }

    raise HTTPException(status_code=400, detail=f"Unknown metric: {payload.metric_name}")


@router.get("/v1/excel/audit")
async def excel_audit(
    request: Request,
    workbook_id: str | None = Query(default=None),
    env_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        clauses: list[str] = []
        params: list[Any] = []

        if env_id:
            env_uuid, _ = _resolve_environment_schema(conn, env_id, required=True)
            clauses.append("env_id = %s")
            params.append(env_uuid)

        if workbook_id:
            clauses.append("details ->> 'workbook_id' = %s")
            params.append(workbook_id)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        rows = conn.execute(
            f"""
            SELECT id, env_id, at, actor, action, entity_type, entity_id, details
            FROM platform.audit_log
            {where_sql}
            ORDER BY at DESC
            LIMIT %s
            """,
            (*params, limit),
        ).fetchall()

    return {
        "items": [
            {
                "id": str(row[0]),
                "env_id": str(row[1]),
                "at": row[2].isoformat(),
                "actor": row[3],
                "action": row[4],
                "entity_type": row[5],
                "entity_id": row[6],
                "details": _json_ready(row[7]),
            }
            for row in rows
        ]
    }


@router.post("/v1/excel/audit")
async def excel_audit_write(payload: ExcelAuditWriteRequest, request: Request):
    actor = _require_excel_actor(request)

    with get_conn() as conn:
        ensure_extensions(conn)
        ensure_platform_tables(conn)

        env_uuid, _ = _resolve_environment_schema(conn, payload.env_id, required=True)
        details = payload.details or {}
        details["workbook_id"] = payload.workbook_id

        insert_audit_log(
            conn,
            env_uuid,
            actor,
            payload.action,
            payload.entity_type,
            payload.entity_id,
            details,
        )
        conn.commit()

    return {"ok": True}
