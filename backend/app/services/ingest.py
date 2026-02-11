"""Service layer for Data Ingestion + Transformation module."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx

from app.db import get_cursor
from app.ingest.engine import (
    ENGINE_VERSION,
    TARGET_SCHEMAS,
    compute_run_hash,
    get_target_schema,
    list_stock_targets,
    profile_file,
    run_pipeline,
)
from app.repos.supabase_storage_repo import SupabaseStorageRepository

_storage = SupabaseStorageRepository()


CANONICAL_TARGETS: dict[str, dict[str, Any]] = {
    "vendor": {
        "table": "app.ingest_vendor",
        "label": "Vendor",
        "columns": ["name", "legal_name", "tax_id", "payment_terms", "email", "phone"],
        "numeric_columns": [],
        "date_columns": [],
    },
    "customer": {
        "table": "app.ingest_customer",
        "label": "Customer",
        "columns": ["name", "email", "phone", "status"],
        "numeric_columns": [],
        "date_columns": [],
    },
    "cashflow_event": {
        "table": "app.ingest_cashflow_event",
        "label": "Cash Flow Events",
        "columns": ["event_date", "event_type", "amount", "currency", "description"],
        "numeric_columns": ["amount"],
        "date_columns": ["event_date"],
    },
    "trial_balance": {
        "table": "app.trial_balance",
        "label": "Trial Balance",
        "columns": ["period", "account", "ending_balance", "debit", "credit"],
        "numeric_columns": ["ending_balance", "debit", "credit"],
        "date_columns": [],
    },
    "gl_transaction": {
        "table": "app.gl_transaction",
        "label": "GL Transactions",
        "columns": ["txn_date", "account", "description", "amount", "debit", "credit", "reference"],
        "numeric_columns": ["amount", "debit", "credit"],
        "date_columns": ["txn_date"],
    },
    "deal_pipeline_deal": {
        "table": "app.deal_pipeline_deal",
        "label": "Deal Pipeline",
        "columns": ["deal_name", "company", "stage", "owner", "value", "probability", "close_date"],
        "numeric_columns": ["value", "probability"],
        "date_columns": ["close_date"],
    },
}


METRIC_TEMPLATES: dict[str, list[dict[str, Any]]] = {
    "vendor": [
        {
            "data_point_key": "vendor.count",
            "source_table_key": "vendor",
            "aggregation": "count",
            "value_column": None,
        }
    ],
    "cashflow_event": [
        {
            "data_point_key": "cashflow_event.sum_by_month",
            "source_table_key": "cashflow_event",
            "aggregation": "sum_by_month",
            "value_column": "amount",
        }
    ],
    "trial_balance": [
        {
            "data_point_key": "trial_balance.ending_balance_by_account",
            "source_table_key": "trial_balance",
            "aggregation": "sum_by_group",
            "value_column": "ending_balance",
        }
    ],
    "gl_transaction": [
        {
            "data_point_key": "gl_transaction.sum_by_account_by_month",
            "source_table_key": "gl_transaction",
            "aggregation": "sum_by_group_by_month",
            "value_column": "amount",
        }
    ],
    "deal_pipeline_deal": [
        {
            "data_point_key": "deal_pipeline_deal.count",
            "source_table_key": "deal_pipeline_deal",
            "aggregation": "count",
            "value_column": None,
        }
    ],
}


def _infer_file_type(filename: str | None, mime_type: str | None, explicit: str | None = None) -> str:
    if explicit:
        ft = explicit.strip().lower()
        if ft in {"csv", "xlsx"}:
            return ft

    name = (filename or "").lower().strip()
    mime = (mime_type or "").lower().strip()

    if name.endswith(".csv") or "csv" in mime:
        return "csv"
    if name.endswith(".xlsx") or "spreadsheetml" in mime or "excel" in mime:
        return "xlsx"

    raise ValueError("File type must be csv or xlsx")


def _scope_where_clause(business_id: UUID | None, env_id: UUID | None) -> tuple[str, list[Any]]:
    return "business_id IS NOT DISTINCT FROM %s AND env_id IS NOT DISTINCT FROM %s", [
        str(business_id) if business_id else None,
        str(env_id) if env_id else None,
    ]


def create_source(
    *,
    business_id: UUID | None,
    env_id: UUID | None,
    name: str,
    description: str | None,
    document_id: UUID,
    document_version_id: UUID | None,
    file_type: str | None,
    uploaded_by: str | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        if document_version_id:
            cur.execute(
                """SELECT d.document_id, dv.version_id, dv.version_number, dv.original_filename, dv.mime_type
                   FROM app.documents d
                   JOIN app.document_versions dv ON dv.document_id = d.document_id
                   WHERE d.document_id = %s AND dv.version_id = %s""",
                (str(document_id), str(document_version_id)),
            )
        else:
            cur.execute(
                """SELECT d.document_id, dv.version_id, dv.version_number, dv.original_filename, dv.mime_type
                   FROM app.documents d
                   JOIN app.document_versions dv ON dv.document_id = d.document_id
                   WHERE d.document_id = %s
                   ORDER BY dv.version_number DESC
                   LIMIT 1""",
                (str(document_id),),
            )

        doc_version = cur.fetchone()
        if not doc_version:
            raise LookupError("Document version not found")

        normalized_file_type = _infer_file_type(
            filename=doc_version.get("original_filename"),
            mime_type=doc_version.get("mime_type"),
            explicit=file_type,
        )

        cur.execute(
            """INSERT INTO app.ingest_source (
                   business_id, env_id, name, description, document_id, file_type, status
               ) VALUES (%s, %s, %s, %s, %s, %s, 'draft')
               RETURNING id, business_id, env_id, name, description, document_id,
                         file_type, status, created_at, updated_at""",
            (
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
                name,
                description,
                str(document_id),
                normalized_file_type,
            ),
        )
        source = cur.fetchone()

        cur.execute(
            """INSERT INTO app.ingest_source_version (
                   ingest_source_id, document_version_id, version_num, uploaded_by
               ) VALUES (%s, %s, 1, %s)
               RETURNING id, document_version_id, version_num""",
            (str(source["id"]), str(doc_version["version_id"]), uploaded_by),
        )
        source_version = cur.fetchone()

        return {
            **source,
            "latest_version_num": source_version["version_num"],
            "latest_document_version_id": source_version["document_version_id"],
        }


def list_sources(*, business_id: UUID | None, env_id: UUID | None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        conditions: list[str] = []
        params: list[Any] = []

        if business_id is not None:
            conditions.append("s.business_id = %s")
            params.append(str(business_id))
        if env_id is not None:
            conditions.append("s.env_id = %s")
            params.append(str(env_id))

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        cur.execute(
            f"""SELECT s.id, s.business_id, s.env_id, s.name, s.description,
                      s.document_id, s.file_type, s.status::text AS status,
                      s.created_at, s.updated_at,
                      sv.version_num AS latest_version_num,
                      sv.document_version_id AS latest_document_version_id
               FROM app.ingest_source s
               LEFT JOIN LATERAL (
                 SELECT version_num, document_version_id
                 FROM app.ingest_source_version
                 WHERE ingest_source_id = s.id
                 ORDER BY version_num DESC
                 LIMIT 1
               ) sv ON TRUE
               {where}
               ORDER BY s.created_at DESC""",
            params,
        )
        return cur.fetchall()


def _get_source(cur, source_id: UUID) -> dict[str, Any]:
    cur.execute(
        """SELECT id, business_id, env_id, name, description, document_id,
                  file_type, status::text AS status, created_at, updated_at
           FROM app.ingest_source
           WHERE id = %s""",
        (str(source_id),),
    )
    source = cur.fetchone()
    if not source:
        raise LookupError("Ingest source not found")
    return source


def _resolve_source_version(
    cur,
    *,
    source_id: UUID,
    source_version_id: UUID | None = None,
    version_num: int | None = None,
) -> dict[str, Any]:
    if source_version_id:
        cur.execute(
            """SELECT id, ingest_source_id, document_version_id, version_num, uploaded_at, uploaded_by
               FROM app.ingest_source_version
               WHERE id = %s AND ingest_source_id = %s""",
            (str(source_version_id), str(source_id)),
        )
    elif version_num is not None:
        cur.execute(
            """SELECT id, ingest_source_id, document_version_id, version_num, uploaded_at, uploaded_by
               FROM app.ingest_source_version
               WHERE ingest_source_id = %s AND version_num = %s""",
            (str(source_id), int(version_num)),
        )
    else:
        cur.execute(
            """SELECT id, ingest_source_id, document_version_id, version_num, uploaded_at, uploaded_by
               FROM app.ingest_source_version
               WHERE ingest_source_id = %s
               ORDER BY version_num DESC
               LIMIT 1""",
            (str(source_id),),
        )

    source_version = cur.fetchone()
    if not source_version:
        raise LookupError("Ingest source version not found")
    return source_version


def _download_document_version(document_version_id: UUID) -> tuple[bytes, dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT version_id, document_id, bucket, object_key, state::text AS state,
                      original_filename, mime_type
               FROM app.document_versions
               WHERE version_id = %s""",
            (str(document_version_id),),
        )
        version = cur.fetchone()

    if not version:
        raise LookupError("Document version not found")

    signed_url = _storage.generate_signed_download_url(version["bucket"], version["object_key"])

    try:
        response = httpx.get(signed_url, timeout=30)
        response.raise_for_status()
        return response.content, version
    except httpx.HTTPError:
        # Best-effort fallback for private buckets with service-role credentials.
        if _storage.base_url and version.get("bucket") and version.get("object_key"):
            fallback_url = f"{_storage.base_url}/object/{version['bucket']}/{version['object_key']}"
            fallback = httpx.get(fallback_url, headers=_storage.headers, timeout=30)
            fallback.raise_for_status()
            return fallback.content, version
        raise


def profile_source(*, source_id: UUID, version_num: int | None = None) -> dict[str, Any]:
    with get_cursor() as cur:
        source = _get_source(cur, source_id)
        source_version = _resolve_source_version(cur, source_id=source_id, version_num=version_num)

    raw_bytes, _version_meta = _download_document_version(UUID(str(source_version["document_version_id"])))
    profile = profile_file(raw_bytes, source["file_type"], settings={})

    return {
        "source_id": source["id"],
        "source_version_id": source_version["id"],
        "file_type": source["file_type"],
        "version_num": source_version["version_num"],
        "sheets": profile["sheets"],
        "detected_tables": profile["detected_tables"],
    }


def create_recipe(*, source_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        _get_source(cur, source_id)

        cur.execute(
            """INSERT INTO app.ingest_recipe (
                   ingest_source_id, target_table_key, mode, primary_key_fields, settings_json
               ) VALUES (%s, %s, %s, %s, %s)
               RETURNING id""",
            (
                str(source_id),
                payload["target_table_key"],
                payload.get("mode", "upsert"),
                payload.get("primary_key_fields") or [],
                json.dumps(payload.get("settings_json") or {}),
            ),
        )
        recipe_id = cur.fetchone()["id"]

        for mapping in payload.get("mappings") or []:
            cur.execute(
                """INSERT INTO app.ingest_recipe_mapping (
                       ingest_recipe_id, source_column, target_column,
                       transform_json, required, mapping_order
                   ) VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    str(recipe_id),
                    mapping.get("source_column"),
                    mapping.get("target_column"),
                    json.dumps(mapping.get("transform_json") or {}),
                    bool(mapping.get("required", False)),
                    int(mapping.get("mapping_order", 0)),
                ),
            )

        for step in payload.get("transform_steps") or []:
            cur.execute(
                """INSERT INTO app.ingest_recipe_transform_step (
                       ingest_recipe_id, step_order, step_type, config_json
                   ) VALUES (%s, %s, %s, %s)""",
                (
                    str(recipe_id),
                    int(step.get("step_order", 0)),
                    step.get("step_type"),
                    json.dumps(step.get("config_json") or {}),
                ),
            )

    return get_recipe(recipe_id=UUID(str(recipe_id)))


def get_recipe(*, recipe_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, ingest_source_id, target_table_key, mode,
                      primary_key_fields, settings_json,
                      created_at, updated_at
               FROM app.ingest_recipe
               WHERE id = %s""",
            (str(recipe_id),),
        )
        recipe = cur.fetchone()
        if not recipe:
            raise LookupError("Ingest recipe not found")

        cur.execute(
            """SELECT id, ingest_recipe_id, source_column, target_column,
                      transform_json, required, mapping_order
               FROM app.ingest_recipe_mapping
               WHERE ingest_recipe_id = %s
               ORDER BY mapping_order ASC, id ASC""",
            (str(recipe_id),),
        )
        mappings = cur.fetchall()

        cur.execute(
            """SELECT id, ingest_recipe_id, step_order, step_type, config_json
               FROM app.ingest_recipe_transform_step
               WHERE ingest_recipe_id = %s
               ORDER BY step_order ASC""",
            (str(recipe_id),),
        )
        steps = cur.fetchall()

    return {
        **recipe,
        "mappings": mappings,
        "transform_steps": steps,
    }


def _recipe_payload_for_hash(recipe: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_table_key": recipe.get("target_table_key"),
        "mode": recipe.get("mode"),
        "primary_key_fields": recipe.get("primary_key_fields") or [],
        "settings_json": recipe.get("settings_json") or {},
        "mappings": [
            {
                "source_column": m.get("source_column"),
                "target_column": m.get("target_column"),
                "transform_json": m.get("transform_json") or {},
                "required": bool(m.get("required", False)),
                "mapping_order": int(m.get("mapping_order", 0)),
            }
            for m in recipe.get("mappings") or []
        ],
        "transform_steps": [
            {
                "step_order": int(s.get("step_order", 0)),
                "step_type": s.get("step_type"),
                "config_json": s.get("config_json") or {},
            }
            for s in recipe.get("transform_steps") or []
        ],
    }


def _resolve_recipe_with_source(
    *,
    recipe_id: UUID,
    source_version_id: UUID | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    with get_cursor() as cur:
        recipe = get_recipe(recipe_id=recipe_id)
        source = _get_source(cur, UUID(str(recipe["ingest_source_id"])))
        source_version = _resolve_source_version(
            cur,
            source_id=UUID(str(recipe["ingest_source_id"])),
            source_version_id=source_version_id,
        )

    return recipe, source, source_version


def validate_recipe(*, recipe_id: UUID, source_version_id: UUID | None, preview_rows: int) -> dict[str, Any]:
    recipe, source, source_version = _resolve_recipe_with_source(
        recipe_id=recipe_id,
        source_version_id=source_version_id,
    )

    raw_bytes, _doc_meta = _download_document_version(UUID(str(source_version["document_version_id"])))

    recipe_payload = _recipe_payload_for_hash(recipe)
    run_hash = compute_run_hash(str(source_version["id"]), recipe_payload)

    pipeline = run_pipeline(
        raw_bytes=raw_bytes,
        file_type=source["file_type"],
        recipe=recipe,
        mappings=recipe["mappings"],
        transform_steps=recipe["transform_steps"],
        preview_rows=preview_rows,
    )

    return {
        "run_hash": run_hash,
        "rows_read": pipeline["rows_read"],
        "rows_valid": pipeline["rows_valid"],
        "rows_rejected": pipeline["rows_rejected"],
        "preview_rows": pipeline["preview_rows"],
        "errors": pipeline["errors"],
        "lineage": pipeline["lineage"],
        "source_version_id": source_version["id"],
    }


def _natural_key(row: dict[str, Any], primary_key_fields: list[str]) -> str | None:
    if row.get("_natural_key"):
        return str(row["_natural_key"])
    if not primary_key_fields:
        return None

    values: list[str] = []
    for field in primary_key_fields:
        value = row.get(field)
        if value is None or (isinstance(value, str) and value.strip() == ""):
            return None
        values.append(str(value).strip().lower())

    return "|".join(values)


def _row_extras(row: dict[str, Any], allowed_columns: list[str]) -> dict[str, Any]:
    return {
        key: value
        for key, value in row.items()
        if not key.startswith("_") and key not in allowed_columns
    }


def _write_canonical_rows(
    cur,
    *,
    target_table_key: str,
    mode: str,
    business_id: UUID | None,
    env_id: UUID | None,
    source_run_id: UUID,
    primary_key_fields: list[str],
    rows: list[dict[str, Any]],
) -> tuple[int, int]:
    target = CANONICAL_TARGETS[target_table_key]
    table = target["table"]
    cols = target["columns"]

    inserted = 0
    updated = 0

    if mode == "replace":
        scope_sql, scope_params = _scope_where_clause(business_id, env_id)
        cur.execute(f"DELETE FROM {table} WHERE {scope_sql}", scope_params)

    for row in rows:
        natural_key = None if mode == "append" else _natural_key(row, primary_key_fields)

        payload_values = [row.get(column) for column in cols]
        metadata_json = json.dumps(_row_extras(row, cols))

        if mode == "upsert" and natural_key is not None:
            cur.execute(
                f"""SELECT id
                    FROM {table}
                    WHERE business_id IS NOT DISTINCT FROM %s
                      AND env_id IS NOT DISTINCT FROM %s
                      AND natural_key = %s
                    LIMIT 1""",
                (
                    str(business_id) if business_id else None,
                    str(env_id) if env_id else None,
                    natural_key,
                ),
            )
            existing = cur.fetchone()
            if existing:
                assignments = ", ".join(f"{column} = %s" for column in cols)
                cur.execute(
                    f"""UPDATE {table}
                        SET {assignments},
                            metadata_json = %s,
                            source_run_id = %s,
                            updated_at = now()
                        WHERE id = %s""",
                    [
                        *payload_values,
                        metadata_json,
                        str(source_run_id),
                        str(existing["id"]),
                    ],
                )
                updated += 1
                continue

        insert_columns = [
            "business_id",
            "env_id",
            "source_run_id",
            "natural_key",
            *cols,
            "metadata_json",
        ]
        placeholders = ", ".join(["%s"] * len(insert_columns))
        cur.execute(
            f"""INSERT INTO {table} ({', '.join(insert_columns)})
                VALUES ({placeholders})""",
            [
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
                str(source_run_id),
                natural_key,
                *payload_values,
                metadata_json,
            ],
        )
        inserted += 1

    return inserted, updated


def _write_custom_rows(
    cur,
    *,
    table_key: str,
    mode: str,
    business_id: UUID | None,
    env_id: UUID | None,
    source_run_id: UUID,
    primary_key_fields: list[str],
    rows: list[dict[str, Any]],
) -> tuple[int, int]:
    inserted = 0
    updated = 0

    cur.execute(
        """SELECT id, schema_json
           FROM app.ingested_table
           WHERE table_key = %s
             AND business_id IS NOT DISTINCT FROM %s
             AND env_id IS NOT DISTINCT FROM %s
           LIMIT 1""",
        (
            table_key,
            str(business_id) if business_id else None,
            str(env_id) if env_id else None,
        ),
    )
    table = cur.fetchone()

    if not table:
        if rows:
            schema_json = {
                "columns": [
                    {
                        "name": key,
                        "type": "string",
                    }
                    for key in rows[0].keys()
                    if not key.startswith("_")
                ]
            }
        else:
            schema_json = {"columns": []}

        cur.execute(
            """INSERT INTO app.ingested_table (
                   table_key, business_id, env_id, name, schema_json
               ) VALUES (%s, %s, %s, %s, %s)
               RETURNING id, schema_json""",
            (
                table_key,
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
                table_key.replace("_", " ").title(),
                json.dumps(schema_json),
            ),
        )
        table = cur.fetchone()

    table_id = table["id"]

    if mode == "replace":
        cur.execute("DELETE FROM app.ingested_row WHERE ingested_table_id = %s", (str(table_id),))

    for row in rows:
        data_json = {k: v for k, v in row.items() if not k.startswith("_")}
        natural_key = None if mode == "append" else _natural_key(row, primary_key_fields)

        if mode == "upsert" and natural_key:
            cur.execute(
                """SELECT id
                   FROM app.ingested_row
                   WHERE ingested_table_id = %s AND natural_key = %s
                   LIMIT 1""",
                (str(table_id), natural_key),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    """UPDATE app.ingested_row
                       SET data_json = %s,
                           source_run_id = %s,
                           updated_at = now()
                       WHERE id = %s""",
                    (json.dumps(data_json), str(source_run_id), str(existing["id"])),
                )
                updated += 1
                continue

        cur.execute(
            """INSERT INTO app.ingested_row (
                   ingested_table_id, natural_key, data_json, source_run_id
               ) VALUES (%s, %s, %s, %s)""",
            (
                str(table_id),
                natural_key,
                json.dumps(data_json),
                str(source_run_id),
            ),
        )
        inserted += 1

    return inserted, updated


def _metric_rows_and_columns(
    cur,
    *,
    source_table_key: str,
    business_id: UUID | None,
    env_id: UUID | None,
) -> tuple[int, list[str]]:
    if source_table_key in CANONICAL_TARGETS:
        target = CANONICAL_TARGETS[source_table_key]
        table = target["table"]
        scope_sql, params = _scope_where_clause(business_id, env_id)
        cur.execute(f"SELECT COUNT(*)::int AS row_count FROM {table} WHERE {scope_sql}", params)
        row_count = int(cur.fetchone()["row_count"])
        return row_count, list(target["columns"])

    if source_table_key == "ap_bills":
        if business_id is None:
            return 0, ["amount_total"]
        cur.execute(
            "SELECT COUNT(*)::int AS row_count FROM app.invoices WHERE business_id = %s",
            (str(business_id),),
        )
        row_count = int(cur.fetchone()["row_count"])
        return row_count, ["amount_total"]

    # Custom ingested table key.
    cur.execute(
        """SELECT id, schema_json
           FROM app.ingested_table
           WHERE table_key = %s
             AND business_id IS NOT DISTINCT FROM %s
             AND env_id IS NOT DISTINCT FROM %s
           LIMIT 1""",
        (
            source_table_key,
            str(business_id) if business_id else None,
            str(env_id) if env_id else None,
        ),
    )
    table = cur.fetchone()
    if not table:
        return 0, []

    cur.execute(
        "SELECT COUNT(*)::int AS row_count FROM app.ingested_row WHERE ingested_table_id = %s",
        (str(table["id"]),),
    )
    row_count = int(cur.fetchone()["row_count"])

    columns = [
        str(col.get("name"))
        for col in ((table.get("schema_json") or {}).get("columns") or [])
        if col.get("name")
    ]
    return row_count, columns


def _upsert_registry_row(
    cur,
    *,
    business_id: UUID | None,
    env_id: UUID | None,
    data_point_key: str,
    source_table_key: str,
    aggregation: str,
    value_column: str | None,
    row_count: int,
    columns_json: list[str],
    metadata_json: dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """SELECT id
           FROM app.metrics_data_point_registry
           WHERE business_id IS NOT DISTINCT FROM %s
             AND env_id IS NOT DISTINCT FROM %s
             AND data_point_key = %s
           LIMIT 1""",
        (
            str(business_id) if business_id else None,
            str(env_id) if env_id else None,
            data_point_key,
        ),
    )
    existing = cur.fetchone()

    payload = json.dumps(metadata_json or {})
    columns_payload = json.dumps(columns_json)

    if existing:
        cur.execute(
            """UPDATE app.metrics_data_point_registry
               SET source_table_key = %s,
                   aggregation = %s,
                   value_column = %s,
                   last_updated_at = now(),
                   row_count = %s,
                   columns_json = %s,
                   metadata_json = %s,
                   updated_at = now()
               WHERE id = %s""",
            (
                source_table_key,
                aggregation,
                value_column,
                row_count,
                columns_payload,
                payload,
                str(existing["id"]),
            ),
        )
        return

    cur.execute(
        """INSERT INTO app.metrics_data_point_registry (
               business_id, env_id, data_point_key,
               source_table_key, aggregation, value_column,
               last_updated_at, row_count, columns_json, metadata_json
           ) VALUES (%s, %s, %s, %s, %s, %s, now(), %s, %s, %s)""",
        (
            str(business_id) if business_id else None,
            str(env_id) if env_id else None,
            data_point_key,
            source_table_key,
            aggregation,
            value_column,
            row_count,
            columns_payload,
            payload,
        ),
    )


def _refresh_metrics_registry(
    cur,
    *,
    target_table_key: str,
    business_id: UUID | None,
    env_id: UUID | None,
) -> None:
    templates = METRIC_TEMPLATES.get(target_table_key, [])
    for template in templates:
        row_count, columns = _metric_rows_and_columns(
            cur,
            source_table_key=template["source_table_key"],
            business_id=business_id,
            env_id=env_id,
        )
        _upsert_registry_row(
            cur,
            business_id=business_id,
            env_id=env_id,
            data_point_key=template["data_point_key"],
            source_table_key=template["source_table_key"],
            aggregation=template["aggregation"],
            value_column=template.get("value_column"),
            row_count=row_count,
            columns_json=columns,
            metadata_json={"auto": True, "target_table": target_table_key},
        )

    # Keep AP bill total available for metrics if invoices exist.
    if business_id is not None:
        row_count, columns = _metric_rows_and_columns(
            cur,
            source_table_key="ap_bills",
            business_id=business_id,
            env_id=env_id,
        )
        _upsert_registry_row(
            cur,
            business_id=business_id,
            env_id=env_id,
            data_point_key="ap.bills.total",
            source_table_key="ap_bills",
            aggregation="sum",
            value_column="amount_total",
            row_count=row_count,
            columns_json=columns,
            metadata_json={"auto": True, "source_table": "app.invoices"},
        )


def run_recipe(*, recipe_id: UUID, source_version_id: UUID | None = None) -> dict[str, Any]:
    recipe, source, source_version = _resolve_recipe_with_source(
        recipe_id=recipe_id,
        source_version_id=source_version_id,
    )

    raw_bytes, _doc_meta = _download_document_version(UUID(str(source_version["document_version_id"])))

    recipe_payload = _recipe_payload_for_hash(recipe)
    run_hash = compute_run_hash(str(source_version["id"]), recipe_payload)

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.ingest_run (
                   ingest_recipe_id, source_version_id, run_hash, engine_version,
                   status, started_at, lineage_json
               ) VALUES (%s, %s, %s, %s, 'started', now(), %s)
               RETURNING id, started_at""",
            (
                str(recipe_id),
                str(source_version["id"]),
                run_hash,
                ENGINE_VERSION,
                json.dumps({"phase": "started"}),
            ),
        )
        run_row = cur.fetchone()
        run_id = UUID(str(run_row["id"]))

    try:
        pipeline = run_pipeline(
            raw_bytes=raw_bytes,
            file_type=source["file_type"],
            recipe=recipe,
            mappings=recipe["mappings"],
            transform_steps=recipe["transform_steps"],
            preview_rows=200,
        )

        with get_cursor() as cur:
            for err in pipeline["errors"]:
                cur.execute(
                    """INSERT INTO app.ingest_run_error (
                           ingest_run_id, row_number, column_name, error_code, message, raw_value
                       ) VALUES (%s, %s, %s, %s, %s, %s)""",
                    (
                        str(run_id),
                        err.get("row_number"),
                        err.get("column_name"),
                        err.get("error_code", "validation_error"),
                        err.get("message", "Unknown error"),
                        err.get("raw_value"),
                    ),
                )

            mode = str(recipe.get("mode") or "upsert").lower()
            target_key = str(recipe.get("target_table_key") or "custom")

            if target_key in CANONICAL_TARGETS:
                rows_inserted, rows_updated = _write_canonical_rows(
                    cur,
                    target_table_key=target_key,
                    mode=mode,
                    business_id=UUID(str(source["business_id"])) if source.get("business_id") else None,
                    env_id=UUID(str(source["env_id"])) if source.get("env_id") else None,
                    source_run_id=run_id,
                    primary_key_fields=recipe.get("primary_key_fields") or [],
                    rows=pipeline["valid_rows"],
                )
                _refresh_metrics_registry(
                    cur,
                    target_table_key=target_key,
                    business_id=UUID(str(source["business_id"])) if source.get("business_id") else None,
                    env_id=UUID(str(source["env_id"])) if source.get("env_id") else None,
                )
            else:
                rows_inserted, rows_updated = _write_custom_rows(
                    cur,
                    table_key=target_key,
                    mode=mode,
                    business_id=UUID(str(source["business_id"])) if source.get("business_id") else None,
                    env_id=UUID(str(source["env_id"])) if source.get("env_id") else None,
                    source_run_id=run_id,
                    primary_key_fields=recipe.get("primary_key_fields") or [],
                    rows=pipeline["valid_rows"],
                )

            error_summary = None
            if pipeline["errors"]:
                first_error = pipeline["errors"][0]
                error_summary = f"{first_error.get('error_code')}: {first_error.get('message')}"

            cur.execute(
                """UPDATE app.ingest_run
                   SET status = 'completed',
                       rows_read = %s,
                       rows_valid = %s,
                       rows_inserted = %s,
                       rows_updated = %s,
                       rows_rejected = %s,
                       completed_at = now(),
                       error_summary = %s,
                       lineage_json = %s
                   WHERE id = %s""",
                (
                    pipeline["rows_read"],
                    pipeline["rows_valid"],
                    rows_inserted,
                    rows_updated,
                    pipeline["rows_rejected"],
                    error_summary,
                    json.dumps(pipeline["lineage"]),
                    str(run_id),
                ),
            )

    except Exception as exc:
        with get_cursor() as cur:
            cur.execute(
                """UPDATE app.ingest_run
                   SET status = 'failed',
                       completed_at = now(),
                       error_summary = %s
                   WHERE id = %s""",
                (str(exc), str(run_id)),
            )
        raise

    return get_run(run_id=run_id)


def get_run(*, run_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, ingest_recipe_id, source_version_id, run_hash, engine_version,
                      status::text AS status,
                      rows_read, rows_valid, rows_inserted, rows_updated, rows_rejected,
                      started_at, completed_at, error_summary, lineage_json
               FROM app.ingest_run
               WHERE id = %s""",
            (str(run_id),),
        )
        run = cur.fetchone()
        if not run:
            raise LookupError("Ingest run not found")

        cur.execute(
            """SELECT row_number, column_name, error_code, message, raw_value
               FROM app.ingest_run_error
               WHERE ingest_run_id = %s
               ORDER BY row_number NULLS LAST, id ASC
               LIMIT 1000""",
            (str(run_id),),
        )
        errors = cur.fetchall()

    return {**run, "errors": errors}


def list_tables(*, business_id: UUID | None, env_id: UUID | None) -> list[dict[str, Any]]:
    tables: list[dict[str, Any]] = []

    with get_cursor() as cur:
        for key, target in CANONICAL_TARGETS.items():
            table = target["table"]
            scope_sql, params = _scope_where_clause(business_id, env_id)
            cur.execute(
                f"""SELECT COUNT(*)::int AS row_count, MAX(updated_at) AS last_updated_at
                    FROM {table}
                    WHERE {scope_sql}""",
                params,
            )
            stats = cur.fetchone()
            tables.append(
                {
                    "table_key": key,
                    "name": target["label"],
                    "kind": "canonical",
                    "business_id": business_id,
                    "env_id": env_id,
                    "row_count": int(stats["row_count"]),
                    "columns": target["columns"],
                    "last_updated_at": stats["last_updated_at"],
                }
            )

        cur.execute(
            """SELECT t.table_key, t.name, t.business_id, t.env_id, t.schema_json,
                      COALESCE(COUNT(r.id), 0)::int AS row_count,
                      MAX(r.updated_at) AS last_updated_at
               FROM app.ingested_table t
               LEFT JOIN app.ingested_row r ON r.ingested_table_id = t.id
               WHERE t.business_id IS NOT DISTINCT FROM %s
                 AND t.env_id IS NOT DISTINCT FROM %s
               GROUP BY t.table_key, t.name, t.business_id, t.env_id, t.schema_json
               ORDER BY t.table_key ASC""",
            (
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
            ),
        )
        custom_rows = cur.fetchall()

    for row in custom_rows:
        columns = [
            str(col.get("name"))
            for col in ((row.get("schema_json") or {}).get("columns") or [])
            if col.get("name")
        ]
        tables.append(
            {
                "table_key": row["table_key"],
                "name": row["name"],
                "kind": "custom",
                "business_id": row["business_id"],
                "env_id": row["env_id"],
                "row_count": row["row_count"],
                "columns": columns,
                "last_updated_at": row["last_updated_at"],
            }
        )

    tables.sort(key=lambda t: (t["kind"], t["table_key"]))
    return tables


def _coerce_filters(filters: dict[str, str] | None) -> dict[str, str]:
    if not filters:
        return {}
    return {
        str(k): str(v)
        for k, v in filters.items()
        if v is not None and str(v).strip() != ""
    }


def get_table_rows(
    *,
    table_key: str,
    business_id: UUID | None,
    env_id: UUID | None,
    filters: dict[str, str] | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    filters = _coerce_filters(filters)

    with get_cursor() as cur:
        if table_key in CANONICAL_TARGETS:
            target = CANONICAL_TARGETS[table_key]
            table = target["table"]
            allowed_cols = set(target["columns"]) | {"id", "natural_key", "created_at", "updated_at"}

            where_parts = ["business_id IS NOT DISTINCT FROM %s", "env_id IS NOT DISTINCT FROM %s"]
            params: list[Any] = [str(business_id) if business_id else None, str(env_id) if env_id else None]

            for key, value in filters.items():
                if key not in allowed_cols:
                    continue
                where_parts.append(f"CAST({key} AS text) ILIKE %s")
                params.append(f"%{value}%")

            where_sql = " AND ".join(where_parts)

            cur.execute(f"SELECT COUNT(*)::int AS c FROM {table} WHERE {where_sql}", params)
            total_rows = int(cur.fetchone()["c"])

            cur.execute(
                f"""SELECT *
                    FROM {table}
                    WHERE {where_sql}
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                    LIMIT %s OFFSET %s""",
                [*params, int(limit), int(offset)],
            )
            rows = cur.fetchall()
            for row in rows:
                row.pop("business_id", None)
                row.pop("env_id", None)

            return {
                "table_key": table_key,
                "total_rows": total_rows,
                "rows": rows,
            }

        # Custom table rows
        cur.execute(
            """SELECT id
               FROM app.ingested_table
               WHERE table_key = %s
                 AND business_id IS NOT DISTINCT FROM %s
                 AND env_id IS NOT DISTINCT FROM %s
               LIMIT 1""",
            (
                table_key,
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
            ),
        )
        table = cur.fetchone()
        if not table:
            return {
                "table_key": table_key,
                "total_rows": 0,
                "rows": [],
            }

        where_parts = ["ingested_table_id = %s"]
        params = [str(table["id"])]

        for key, value in filters.items():
            where_parts.append("data_json ->> %s ILIKE %s")
            params.append(key)
            params.append(f"%{value}%")

        where_sql = " AND ".join(where_parts)

        cur.execute(f"SELECT COUNT(*)::int AS c FROM app.ingested_row WHERE {where_sql}", params)
        total_rows = int(cur.fetchone()["c"])

        cur.execute(
            f"""SELECT data_json
                FROM app.ingested_row
                WHERE {where_sql}
                ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                LIMIT %s OFFSET %s""",
            [*params, int(limit), int(offset)],
        )
        rows = [row["data_json"] for row in cur.fetchall()]

    return {
        "table_key": table_key,
        "total_rows": total_rows,
        "rows": rows,
    }


def list_targets() -> list[dict[str, Any]]:
    return list_stock_targets()


def list_data_points(*, business_id: UUID | None, env_id: UUID | None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, business_id, env_id, data_point_key, source_table_key,
                      aggregation, value_column, last_updated_at, row_count,
                      columns_json, metadata_json, created_at, updated_at
               FROM app.metrics_data_point_registry
               WHERE business_id IS NOT DISTINCT FROM %s
                 AND env_id IS NOT DISTINCT FROM %s
               ORDER BY data_point_key ASC""",
            (
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
            ),
        )
        return cur.fetchall()


def suggest_metrics_for_table(
    *,
    table_key: str,
    business_id: UUID | None,
    env_id: UUID | None,
) -> dict[str, Any]:
    suggestions: list[dict[str, Any]] = [
        {
            "data_point_key": f"{table_key}.count",
            "source_table_key": table_key,
            "aggregation": "count",
            "value_column": None,
            "rationale": "Count of ingested rows.",
        }
    ]

    if table_key in CANONICAL_TARGETS:
        target = CANONICAL_TARGETS[table_key]
        for col in target["numeric_columns"]:
            suggestions.append(
                {
                    "data_point_key": f"{table_key}.{col}.sum",
                    "source_table_key": table_key,
                    "aggregation": "sum",
                    "value_column": col,
                    "rationale": f"Sum of {col} for quick totals.",
                }
            )
            suggestions.append(
                {
                    "data_point_key": f"{table_key}.{col}.avg",
                    "source_table_key": table_key,
                    "aggregation": "avg",
                    "value_column": col,
                    "rationale": f"Average of {col}.",
                }
            )

            if target["date_columns"]:
                suggestions.append(
                    {
                        "data_point_key": f"{table_key}.{col}.sum_by_month",
                        "source_table_key": table_key,
                        "aggregation": "sum_by_month",
                        "value_column": col,
                        "rationale": "Monthly trend from date + numeric value.",
                    }
                )
    else:
        with get_cursor() as cur:
            _row_count, columns = _metric_rows_and_columns(
                cur,
                source_table_key=table_key,
                business_id=business_id,
                env_id=env_id,
            )
        for col in columns:
            lowered = col.lower()
            if any(token in lowered for token in ("amount", "total", "balance", "value", "count")):
                suggestions.append(
                    {
                        "data_point_key": f"{table_key}.{col}.sum",
                        "source_table_key": table_key,
                        "aggregation": "sum",
                        "value_column": col,
                        "rationale": "Likely numeric column based on name.",
                    }
                )

    # Deduplicate by data_point_key.
    deduped: dict[str, dict[str, Any]] = {}
    for item in suggestions:
        deduped[item["data_point_key"]] = item

    return {
        "table_key": table_key,
        "suggestions": list(deduped.values()),
    }


def create_data_point(payload: dict[str, Any]) -> dict[str, Any]:
    business_id = UUID(str(payload["business_id"])) if payload.get("business_id") else None
    env_id = UUID(str(payload["env_id"])) if payload.get("env_id") else None

    with get_cursor() as cur:
        row_count, columns = _metric_rows_and_columns(
            cur,
            source_table_key=payload["source_table_key"],
            business_id=business_id,
            env_id=env_id,
        )
        _upsert_registry_row(
            cur,
            business_id=business_id,
            env_id=env_id,
            data_point_key=payload["data_point_key"],
            source_table_key=payload["source_table_key"],
            aggregation=payload["aggregation"],
            value_column=payload.get("value_column"),
            row_count=row_count,
            columns_json=payload.get("columns_json") or columns,
            metadata_json=payload.get("metadata_json") or {},
        )

        cur.execute(
            """SELECT id, business_id, env_id, data_point_key, source_table_key,
                      aggregation, value_column, last_updated_at, row_count,
                      columns_json, metadata_json, created_at, updated_at
               FROM app.metrics_data_point_registry
               WHERE business_id IS NOT DISTINCT FROM %s
                 AND env_id IS NOT DISTINCT FROM %s
                 AND data_point_key = %s
               LIMIT 1""",
            (
                str(business_id) if business_id else None,
                str(env_id) if env_id else None,
                payload["data_point_key"],
            ),
        )
        row = cur.fetchone()

    if not row:
        raise RuntimeError("Failed to create data point")
    return row


# Public exports for routes/tests
__all__ = [
    "ENGINE_VERSION",
    "TARGET_SCHEMAS",
    "CANONICAL_TARGETS",
    "create_source",
    "list_sources",
    "profile_source",
    "create_recipe",
    "get_recipe",
    "validate_recipe",
    "run_recipe",
    "get_run",
    "list_tables",
    "get_table_rows",
    "list_targets",
    "list_data_points",
    "suggest_metrics_for_table",
    "create_data_point",
]
