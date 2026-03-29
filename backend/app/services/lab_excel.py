from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.db import get_cursor
from app.services import audit as audit_svc


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

DISPLAY_FIELD_CANDIDATES = ["name", "title", "full_name", "client_name", "stage_name", "term"]

ENTITY_ALIASES: dict[str, str] = {
    "pipeline_card": "pipeline_items",
    "pipeline_cards": "pipeline_items",
    "pipeline_item": "pipeline_items",
}


@dataclass(frozen=True)
class ExcelEntityDefinition:
    entity: str
    actual_schema: str
    actual_table: str
    exposed_schema: str
    exposed_table: str
    scope: str
    field_aliases: dict[str, str] = field(default_factory=dict)
    writable: bool = False
    env_filter_column: str | None = None
    business_filter_column: str | None = None
    display_field: str | None = None


ENTITY_DEFINITIONS: list[ExcelEntityDefinition] = [
    ExcelEntityDefinition(
        entity="pipeline_items",
        actual_schema="v1",
        actual_table="pipeline_cards",
        exposed_schema="platform",
        exposed_table="pipeline_cards",
        scope="platform",
        writable=True,
        env_filter_column="env_id",
        display_field="title",
    ),
    ExcelEntityDefinition(
        entity="pipeline_stages",
        actual_schema="v1",
        actual_table="pipeline_stages",
        exposed_schema="platform",
        exposed_table="pipeline_stages",
        scope="platform",
        field_aliases={"stage_key": "key", "stage_name": "label", "order_index": "sort_order"},
        writable=True,
        env_filter_column="env_id",
        display_field="stage_name",
    ),
    ExcelEntityDefinition(
        entity="environments",
        actual_schema="app",
        actual_table="environments",
        exposed_schema="platform",
        exposed_table="environments",
        scope="platform",
        env_filter_column="env_id",
        display_field="client_name",
    ),
    ExcelEntityDefinition(
        entity="documents",
        actual_schema="public",
        actual_table="document_catalog",
        exposed_schema="environment",
        exposed_table="documents",
        scope="environment",
        env_filter_column="env_id",
        display_field="title",
    ),
    ExcelEntityDefinition(
        entity="document_catalog",
        actual_schema="public",
        actual_table="document_catalog",
        exposed_schema="public",
        exposed_table="document_catalog",
        scope="environment",
        env_filter_column="env_id",
        display_field="title",
    ),
    ExcelEntityDefinition(
        entity="definition_registry",
        actual_schema="public",
        actual_table="definition_registry",
        exposed_schema="public",
        exposed_table="definition_registry",
        scope="environment",
        env_filter_column="env_id",
        display_field="term",
    ),
    ExcelEntityDefinition(
        entity="fund_metrics_qtr",
        actual_schema="public",
        actual_table="fund_metrics_qtr",
        exposed_schema="public",
        exposed_table="fund_metrics_qtr",
        scope="environment",
        env_filter_column="env_id",
        display_field="fund_name",
    ),
    ExcelEntityDefinition(
        entity="asset_metrics_qtr",
        actual_schema="public",
        actual_table="asset_metrics_qtr",
        exposed_schema="public",
        exposed_table="asset_metrics_qtr",
        scope="environment",
        env_filter_column="env_id",
        display_field="asset_name",
    ),
    ExcelEntityDefinition(
        entity="tickets",
        actual_schema="app",
        actual_table="work_items",
        exposed_schema="environment",
        exposed_table="tickets",
        scope="environment",
        field_aliases={"ticket_id": "work_item_id"},
        business_filter_column="business_id",
        display_field="title",
    ),
]

ENTITY_REGISTRY = {definition.entity: definition for definition in ENTITY_DEFINITIONS}


class ExcelEnvironmentContext(dict):
    env_id: str
    business_id: str | None
    schema_name: str


def _configured_excel_api_key() -> str:
    return os.getenv("EXCEL_API_KEY", "").strip()


def _extract_bearer_token(headers: dict[str, str] | Any) -> str:
    auth_header = headers.get("authorization", "") if hasattr(headers, "get") else ""
    if not auth_header.lower().startswith("bearer "):
        return ""
    return auth_header[7:].strip()


def require_excel_actor(headers: dict[str, str] | Any) -> str:
    required_key = _configured_excel_api_key()
    token = _extract_bearer_token(headers)

    if required_key and token != required_key:
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
    if isinstance(value, UUID):
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


def _canonical_entity(entity: str) -> str:
    normalized = (entity or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="entity is required")
    normalized = ENTITY_ALIASES.get(normalized, normalized)
    if normalized not in ENTITY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown entity: {entity}")
    return normalized


def _environment_context(env_id: str | None, *, required: bool = False) -> ExcelEnvironmentContext | None:
    if not env_id:
        if required:
            raise HTTPException(status_code=400, detail="env_id is required")
        return None

    try:
        env_uuid = UUID(env_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid env_id") from exc

    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id::text AS env_id, business_id::text AS business_id, schema_name
                   FROM app.environments
                  WHERE env_id = %s::uuid AND is_active = true""",
            (str(env_uuid),),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Environment not found")
    return ExcelEnvironmentContext(row)


def _inverse_aliases(definition: ExcelEntityDefinition) -> dict[str, str]:
    return {actual: exposed for exposed, actual in definition.field_aliases.items()}


def _get_columns(schema_name: str, table_name: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT column_name, data_type, is_nullable, udt_name, column_default
                   FROM information_schema.columns
                  WHERE table_schema = %s AND table_name = %s
               ORDER BY ordinal_position""",
            (schema_name, table_name),
        )
        rows = cur.fetchall()
    return [
        {
            "name": row["column_name"],
            "data_type": row["data_type"],
            "is_nullable": row["is_nullable"] == "YES",
            "udt_name": row["udt_name"],
            "column_default": row["column_default"],
        }
        for row in rows
    ]


def _get_primary_keys(schema_name: str, table_name: str) -> list[str]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT a.attname
                   FROM pg_class t
                   JOIN pg_namespace ns ON ns.oid = t.relnamespace
                   JOIN pg_index ix ON t.oid = ix.indrelid AND ix.indisprimary
                   JOIN unnest(ix.indkey) WITH ORDINALITY AS cols(attnum, ord) ON true
                   JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
                  WHERE ns.nspname = %s
                    AND t.relname = %s
               ORDER BY cols.ord""",
            (schema_name, table_name),
        )
        rows = cur.fetchall()
    return [row["attname"] for row in rows]


def _detect_display_field(columns: list[dict[str, Any]]) -> str | None:
    names = {column["name"] for column in columns}
    for candidate in DISPLAY_FIELD_CANDIDATES:
        if candidate in names:
            return candidate
    for column in columns:
        if column["data_type"] in {"text", "character varying"}:
            return str(column["name"])
    return columns[0]["name"] if columns else None


def _enum_values_for_field(*, field_name: str, table_name: str) -> list[str]:
    if field_name == "industry_type":
        return INDUSTRY_ENUM_VALUES
    if field_name == "priority" and table_name in {"pipeline_cards", "work_items"}:
        return PRIORITY_ENUM_VALUES
    return []


def _coerce_value(raw: Any, udt_name: str) -> Any:
    if raw is None:
        return None
    if udt_name == "uuid":
        if isinstance(raw, UUID):
            return raw
        return UUID(str(raw))
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
    actual_columns: dict[str, dict[str, Any]],
    aliases: dict[str, str],
) -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    for field_name, raw_value in (filters or {}).items():
        actual_field = aliases.get(field_name, field_name)
        if actual_field not in actual_columns:
            raise HTTPException(status_code=400, detail=f"Unknown filter field: {field_name}")
        udt_name = str(actual_columns[actual_field]["udt_name"])
        quoted = _quote_identifier(actual_field)

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


def _build_order_sql(order_by: list[str] | None, aliases: dict[str, str], allowed_columns: set[str]) -> str:
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

        actual_field = aliases.get(field.strip(), field.strip())
        direction = direction.strip().lower()
        if actual_field not in allowed_columns:
            raise HTTPException(status_code=400, detail=f"Unknown order_by field: {field}")
        if direction not in {"asc", "desc"}:
            raise HTTPException(status_code=400, detail=f"Invalid order direction for {field}")
        clauses.append(f"{_quote_identifier(actual_field)} {direction.upper()}")

    return f"ORDER BY {', '.join(clauses)}" if clauses else ""


def _pk_id_value(pk_fields: list[str], row: dict[str, Any] | tuple[Any, ...]) -> str:
    if isinstance(row, dict):
        if len(pk_fields) == 1:
            return str(_json_ready(row.get(pk_fields[0])))
        return str({_field: _json_ready(row.get(_field)) for _field in pk_fields})
    if len(pk_fields) == 1:
        return str(_json_ready(row[0]))
    return str({_field: _json_ready(row[idx]) for idx, _field in enumerate(pk_fields)})


def _entity_columns(definition: ExcelEntityDefinition) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, str], dict[str, str]]:
    columns = _get_columns(definition.actual_schema, definition.actual_table)
    if not columns:
        raise HTTPException(status_code=404, detail=f"No columns found for entity: {definition.entity}")
    actual_columns = {column["name"]: column for column in columns}
    actual_to_exposed = _inverse_aliases(definition)
    actual_to_exposed.update({name: actual_to_exposed.get(name, name) for name in actual_columns})
    exposed_to_actual = {exposed: actual for actual, exposed in actual_to_exposed.items()}
    exposed_columns = []
    for actual_name, meta in actual_columns.items():
        exposed_meta = dict(meta)
        exposed_meta["name"] = actual_to_exposed.get(actual_name, actual_name)
        exposed_columns.append(exposed_meta)
    return exposed_columns, actual_columns, actual_to_exposed, exposed_to_actual


def _definition_for(entity: str, env_id: str | None = None) -> tuple[ExcelEntityDefinition, ExcelEnvironmentContext | None]:
    canonical = _canonical_entity(entity)
    definition = ENTITY_REGISTRY[canonical]
    env_context = _environment_context(env_id, required=definition.scope == "environment")
    return definition, env_context


def list_schema_entities(env_id: str | None) -> dict[str, Any]:
    env_context = _environment_context(env_id, required=False) if env_id else None
    entities: list[dict[str, Any]] = []
    for definition in ENTITY_DEFINITIONS:
        if definition.scope == "environment" and env_context is None:
            continue
        exposed_columns, _, _, _ = _entity_columns(definition)
        primary_keys = [
            _inverse_aliases(definition).get(primary_key, primary_key)
            for primary_key in _get_primary_keys(definition.actual_schema, definition.actual_table)
        ]
        display_field = definition.display_field or _detect_display_field(exposed_columns)
        entities.append(
            {
                "entity": definition.entity,
                "schema": definition.exposed_schema,
                "table": definition.exposed_table,
                "display_field": display_field,
                "primary_keys": primary_keys,
                "scope": definition.scope,
            }
        )
    return {"env_id": env_context.get("env_id") if env_context else None, "entities": entities}


def get_schema_entity(entity: str, env_id: str | None) -> dict[str, Any]:
    definition, _ = _definition_for(entity, env_id)
    exposed_columns, _, _, _ = _entity_columns(definition)
    primary_keys = [
        _inverse_aliases(definition).get(primary_key, primary_key)
        for primary_key in _get_primary_keys(definition.actual_schema, definition.actual_table)
    ]
    display_field = definition.display_field or _detect_display_field(exposed_columns)
    fields = [
        {
            "name": column["name"],
            "type": column["data_type"],
            "required": not column["is_nullable"] and column["column_default"] is None,
            "primary_key": column["name"] in primary_keys,
            "enum_values": _enum_values_for_field(field_name=column["name"], table_name=definition.actual_table),
            "display_name": str(column["name"]).replace("_", " ").title(),
        }
        for column in exposed_columns
    ]
    return {
        "entity": definition.entity,
        "schema": definition.exposed_schema,
        "table": definition.exposed_table,
        "display_field": display_field,
        "primary_keys": primary_keys,
        "fields": fields,
    }


def query_rows(payload) -> dict[str, Any]:
    definition, env_context = _definition_for(payload.entity, payload.env_id)
    exposed_columns, actual_columns, _, aliases = _entity_columns(definition)
    available_exposed = {column["name"] for column in exposed_columns}
    selected_columns = payload.select or [column["name"] for column in exposed_columns]
    for selected in selected_columns:
        if selected not in available_exposed:
            raise HTTPException(status_code=400, detail=f"Unknown selected field: {selected}")

    where_clauses, params = _build_filter_sql(payload.filters or {}, actual_columns=actual_columns, aliases=aliases)
    if definition.env_filter_column and env_context and definition.env_filter_column not in {aliases.get(k, k) for k in (payload.filters or {})}:
        where_clauses.append(f"{_quote_identifier(definition.env_filter_column)} = %s")
        params.append(UUID(env_context["env_id"]))
    if definition.business_filter_column and env_context:
        business_id = env_context.get("business_id")
        if not business_id:
            return {"entity": definition.entity, "rows": [], "count": 0}
        if definition.business_filter_column not in {aliases.get(k, k) for k in (payload.filters or {})}:
            where_clauses.append(f"{_quote_identifier(definition.business_filter_column)} = %s::uuid")
            params.append(str(business_id))

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    order_sql = _build_order_sql(payload.order_by, aliases, set(actual_columns))
    limit = min(max(int(payload.limit or 200), 1), 1000)

    select_sql = ", ".join(
        f"{_quote_identifier(aliases.get(column, column))} AS {_quote_identifier(column)}"
        for column in selected_columns
    )
    table_ref = f"{_quote_identifier(definition.actual_schema)}.{_quote_identifier(definition.actual_table)}"

    with get_cursor() as cur:
        cur.execute(
            f"SELECT {select_sql} FROM {table_ref} {where_sql} {order_sql} LIMIT %s",
            (*params, limit),
        )
        rows = cur.fetchall()

    return {
        "entity": definition.entity,
        "rows": [{key: _json_ready(value) for key, value in row.items()} for row in rows],
        "count": len(rows),
    }


def _record_excel_write(
    *,
    env_context: ExcelEnvironmentContext | None,
    actor: str,
    action: str,
    entity: str,
    workbook_id: str | None,
    details: dict[str, Any],
) -> None:
    try:
        audit_svc.record_event(
            actor=actor,
            action=action,
            tool_name="excel.compat",
            success=True,
            latency_ms=0,
            business_id=UUID(str(env_context["business_id"])) if env_context and env_context.get("business_id") else None,
            input_data={**details, "workbook_id": workbook_id, "entity": entity, "entity_id": details.get("entity_id")},
            output_data={"ok": True},
        )
    except Exception:
        pass


def upsert_rows(payload, headers) -> dict[str, Any]:
    actor = require_excel_actor(headers)
    if not payload.rows:
        return {"inserted_count": 0, "updated_count": 0, "ids": [], "row_errors": []}

    definition, env_context = _definition_for(payload.entity, payload.env_id)
    if not definition.writable:
        raise HTTPException(status_code=400, detail=f"Entity {payload.entity} is read-only in backend compatibility mode")

    exposed_columns, actual_columns, _, aliases = _entity_columns(definition)
    del exposed_columns
    primary_keys = _get_primary_keys(definition.actual_schema, definition.actual_table)
    key_fields = [aliases.get(field, field) for field in (payload.key_fields or [_inverse_aliases(definition).get(pk, pk) for pk in primary_keys])]
    if not key_fields:
        raise HTTPException(status_code=400, detail="key_fields required (or table must expose primary key)")
    for key_field_name in key_fields:
        if key_field_name not in actual_columns:
            raise HTTPException(status_code=400, detail=f"Unknown key field: {key_field_name}")

    table_ref = f"{_quote_identifier(definition.actual_schema)}.{_quote_identifier(definition.actual_table)}"
    inserted_count = 0
    updated_count = 0
    ids: list[str] = []
    row_errors: list[dict[str, Any]] = []

    with get_cursor() as cur:
        for idx, raw_row in enumerate(payload.rows):
            try:
                row_data = {
                    aliases.get(key, key): _coerce_value(value, str(actual_columns[aliases.get(key, key)]["udt_name"]))
                    for key, value in raw_row.items()
                    if aliases.get(key, key) in actual_columns
                }
                if definition.env_filter_column and env_context and definition.env_filter_column not in row_data:
                    row_data[definition.env_filter_column] = UUID(env_context["env_id"])
                if definition.business_filter_column and env_context and definition.business_filter_column not in row_data and env_context.get("business_id"):
                    row_data[definition.business_filter_column] = UUID(str(env_context["business_id"]))
                if not row_data:
                    raise HTTPException(status_code=422, detail="Row has no known fields")
                for key_field in key_fields:
                    if key_field not in row_data or row_data[key_field] in {None, ""}:
                        raise HTTPException(status_code=422, detail=f"Missing key field: {key_field}")

                where_parts = [f"{_quote_identifier(field)} = %s" for field in key_fields]
                where_values = [row_data[field] for field in key_fields]
                if definition.env_filter_column and env_context and definition.env_filter_column not in key_fields:
                    where_parts.append(f"{_quote_identifier(definition.env_filter_column)} = %s")
                    where_values.append(UUID(env_context["env_id"]))

                existing = None
                if primary_keys:
                    cur.execute(
                        f"SELECT {', '.join(_quote_identifier(pk) for pk in primary_keys)} FROM {table_ref} WHERE {' AND '.join(where_parts)} LIMIT 1",
                        where_values,
                    )
                    existing = cur.fetchone()

                if existing:
                    update_fields = [field for field in row_data if field not in key_fields]
                    if update_fields:
                        assignments = [f"{_quote_identifier(field)} = %s" for field in update_fields]
                        update_values = [row_data[field] for field in update_fields]
                        if "updated_at" in actual_columns and "updated_at" not in update_fields:
                            assignments.append(f"{_quote_identifier('updated_at')} = now()")
                        cur.execute(
                            f"UPDATE {table_ref} SET {', '.join(assignments)} WHERE {' AND '.join(where_parts)}",
                            [*update_values, *where_values],
                        )
                    updated_count += 1
                    ids.append(_pk_id_value(primary_keys, existing))
                    continue

                for pk in primary_keys:
                    if pk not in row_data and str(actual_columns[pk]["udt_name"]) == "uuid":
                        row_data[pk] = uuid.uuid4()
                insert_fields = list(row_data.keys())
                cur.execute(
                    f"INSERT INTO {table_ref} ({', '.join(_quote_identifier(field) for field in insert_fields)}) VALUES ({', '.join(['%s'] * len(insert_fields))})",
                    [row_data[field] for field in insert_fields],
                )
                ids.append(_pk_id_value(primary_keys, {pk: row_data.get(pk) for pk in primary_keys}))
                inserted_count += 1
            except HTTPException as exc:
                row_errors.append({"row_index": idx, "code": "VALIDATION", "message": str(exc.detail)})
            except Exception as exc:
                row_errors.append({"row_index": idx, "code": "ERROR", "message": str(exc)})

    _record_excel_write(
        env_context=env_context,
        actor=actor,
        action="excel_upsert",
        entity=payload.entity,
        workbook_id=payload.workbook_id,
        details={"inserted_count": inserted_count, "updated_count": updated_count, "row_errors": len(row_errors)},
    )
    return {"inserted_count": inserted_count, "updated_count": updated_count, "ids": ids, "row_errors": row_errors}


def delete_rows(payload, headers) -> dict[str, Any]:
    actor = require_excel_actor(headers)
    definition, env_context = _definition_for(payload.entity, payload.env_id)
    if not definition.writable:
        raise HTTPException(status_code=400, detail=f"Entity {payload.entity} is read-only in backend compatibility mode")

    _, actual_columns, _, aliases = _entity_columns(definition)
    actual_key_fields = [aliases.get(field, field) for field in payload.key_fields]
    for key_field_name in actual_key_fields:
        if key_field_name not in actual_columns:
            raise HTTPException(status_code=400, detail=f"Unknown key field: {key_field_name}")

    table_ref = f"{_quote_identifier(definition.actual_schema)}.{_quote_identifier(definition.actual_table)}"
    row_errors: list[dict[str, Any]] = []
    deleted_count = 0

    with get_cursor() as cur:
        for idx, key_map in enumerate(payload.keys):
            try:
                where_parts = []
                where_values = []
                for key_field in actual_key_fields:
                    exposed_key = _inverse_aliases(definition).get(key_field, key_field)
                    if exposed_key not in key_map and key_field not in key_map:
                        raise HTTPException(status_code=422, detail=f"Missing key field: {exposed_key}")
                    raw_value = key_map.get(exposed_key, key_map.get(key_field))
                    where_parts.append(f"{_quote_identifier(key_field)} = %s")
                    where_values.append(_coerce_value(raw_value, str(actual_columns[key_field]["udt_name"])))
                if definition.env_filter_column and env_context and definition.env_filter_column not in actual_key_fields:
                    where_parts.append(f"{_quote_identifier(definition.env_filter_column)} = %s")
                    where_values.append(UUID(env_context["env_id"]))
                cur.execute(f"DELETE FROM {table_ref} WHERE {' AND '.join(where_parts)}", where_values)
                deleted_count += int(cur.rowcount or 0)
            except HTTPException as exc:
                row_errors.append({"row_index": idx, "code": "VALIDATION", "message": str(exc.detail)})
            except Exception as exc:
                row_errors.append({"row_index": idx, "code": "ERROR", "message": str(exc)})

    _record_excel_write(
        env_context=env_context,
        actor=actor,
        action="excel_delete",
        entity=payload.entity,
        workbook_id=payload.workbook_id,
        details={"deleted_count": deleted_count, "row_errors": len(row_errors)},
    )
    return {"deleted_count": deleted_count, "row_errors": row_errors}


def metric(payload, headers) -> dict[str, Any]:
    require_excel_actor(headers)
    env_context = _environment_context(payload.env_id, required=True)
    env_id = str(env_context["env_id"])
    metric_name = payload.metric_name.strip().lower()

    with get_cursor() as cur:
        if metric_name == "pipeline_total_value":
            cur.execute(
                "SELECT COALESCE(SUM(value_cents), 0) AS total FROM v1.pipeline_cards WHERE env_id = %s::uuid",
                (env_id,),
            )
            row = cur.fetchone() or {}
            return {"metric_name": metric_name, "value": float(row.get("total") or 0) / 100.0, "metadata": {"currency": "USD", "method": "sum(value_cents)"}}

        if metric_name == "pipeline_weighted_value":
            cur.execute(
                """SELECT COALESCE(c.value_cents, 0) AS value_cents, COALESCE(s.sort_order, 0) AS sort_order
                       FROM v1.pipeline_cards c
                       JOIN v1.pipeline_stages s ON s.stage_id = c.stage_id
                      WHERE c.env_id = %s::uuid""",
                (env_id,),
            )
            rows = cur.fetchall()
            if not rows:
                return {"metric_name": metric_name, "value": 0, "metadata": {"cards": 0, "method": "weighted_by_stage_order"}}
            max_order = max(int(row.get("sort_order") or 0) for row in rows) or 1
            weighted_total = sum((float(row.get("value_cents") or 0) / 100.0) * (float(row.get("sort_order") or 0) / max_order) for row in rows)
            return {"metric_name": metric_name, "value": weighted_total, "metadata": {"cards": len(rows), "max_order_index": max_order, "method": "sum(value * stage_order/max_stage_order)"}}

        if metric_name == "pipeline_items_count":
            cur.execute("SELECT COUNT(*) AS cnt FROM v1.pipeline_cards WHERE env_id = %s::uuid", (env_id,))
            row = cur.fetchone() or {}
            return {"metric_name": metric_name, "value": int(row.get("cnt") or 0), "metadata": {}}

        if metric_name == "documents_count":
            cur.execute("SELECT COUNT(*) AS cnt FROM document_catalog WHERE env_id = %s::uuid", (env_id,))
            row = cur.fetchone() or {}
            return {"metric_name": metric_name, "value": int(row.get("cnt") or 0), "metadata": {}}

        business_id = env_context.get("business_id")
        if metric_name == "tickets_count":
            if not business_id:
                return {"metric_name": metric_name, "value": 0, "metadata": {}}
            cur.execute("SELECT COUNT(*) AS cnt FROM app.work_items WHERE business_id = %s::uuid", (str(business_id),))
            row = cur.fetchone() or {}
            return {"metric_name": metric_name, "value": int(row.get("cnt") or 0), "metadata": {}}

        if metric_name == "pending_approvals":
            if not business_id:
                return {"metric_name": metric_name, "value": 0, "metadata": {}}
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM app.work_items WHERE business_id = %s::uuid AND status IN ('open', 'waiting')",
                (str(business_id),),
            )
            row = cur.fetchone() or {}
            return {"metric_name": metric_name, "value": int(row.get("cnt") or 0), "metadata": {}}

    raise HTTPException(status_code=400, detail=f"Unknown metric: {payload.metric_name}")


def list_audit(env_id: str | None, workbook_id: str | None, limit: int, headers) -> dict[str, Any]:
    require_excel_actor(headers)
    env_context = _environment_context(env_id, required=bool(env_id)) if env_id else None
    params: list[Any] = []
    clauses: list[str] = []
    if env_context and env_context.get("business_id"):
        clauses.append("business_id = %s::uuid")
        params.append(str(env_context["business_id"]))
    elif env_id:
        return {"items": []}
    if workbook_id:
        clauses.append("input_redacted ->> 'workbook_id' = %s")
        params.append(workbook_id)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT audit_event_id AS id,
                         created_at AS at,
                         actor,
                         action,
                         COALESCE(object_type, 'system') AS entity_type,
                         COALESCE(object_id::text, input_redacted ->> 'entity_id', '') AS entity_id,
                         input_redacted AS details
                    FROM app.audit_events
                    {where_sql}
                ORDER BY created_at DESC
                   LIMIT %s""",
            (*params, limit),
        )
        rows = cur.fetchall()
    return {
        "items": [
            {
                "id": str(row.get("id")),
                "env_id": env_context.get("env_id") if env_context else None,
                "at": row.get("at").isoformat() if row.get("at") else None,
                "actor": row.get("actor"),
                "action": row.get("action"),
                "entity_type": row.get("entity_type"),
                "entity_id": row.get("entity_id"),
                "details": _json_ready(row.get("details") or {}),
            }
            for row in rows
        ]
    }


def write_audit(payload, headers) -> dict[str, Any]:
    actor = require_excel_actor(headers)
    env_context = _environment_context(payload.env_id, required=True)
    business_id = env_context.get("business_id")
    details = dict(payload.details or {})
    details["workbook_id"] = payload.workbook_id
    details["entity_id"] = payload.entity_id
    audit_svc.record_event(
        actor=actor,
        action=payload.action,
        tool_name="excel.audit",
        success=True,
        latency_ms=0,
        business_id=UUID(str(business_id)) if business_id else None,
        object_type=payload.entity_type,
        input_data=details,
        output_data={"ok": True},
    )
    return {"ok": True}
