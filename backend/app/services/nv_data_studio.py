from __future__ import annotations

from uuid import UUID

from app.db import get_cursor


# ---------------------------------------------------------------------------
# Source Artifacts
# ---------------------------------------------------------------------------

def list_artifacts(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_source_artifacts WHERE account_id = %s::uuid ORDER BY created_at DESC",
            (str(account_id),),
        )
        return cur.fetchall()


def create_artifact(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_source_artifacts
               (account_id, system_id, env_id, business_id, filename,
                mime_type, size_bytes, storage_key, file_type, notes)
               VALUES (%s::uuid, %s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(payload["account_id"]),
                str(payload["system_id"]) if payload.get("system_id") else None,
                str(env_id), str(business_id),
                payload["filename"],
                payload.get("mime_type"),
                payload.get("size_bytes"),
                payload.get("storage_key"),
                payload.get("file_type", "other"),
                payload.get("notes"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Ingestion Jobs
# ---------------------------------------------------------------------------

def list_jobs(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT j.* FROM nv_ingestion_jobs j
               JOIN nv_source_artifacts a ON a.artifact_id = j.artifact_id
               WHERE a.account_id = %s::uuid
               ORDER BY j.created_at DESC""",
            (str(account_id),),
        )
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Canonical Entities
# ---------------------------------------------------------------------------

def list_entities(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_canonical_entities WHERE account_id = %s::uuid ORDER BY entity_name",
            (str(account_id),),
        )
        return cur.fetchall()


def create_entity(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_canonical_entities
               (account_id, env_id, business_id, entity_name, description)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s)
               RETURNING *""",
            (
                str(payload["account_id"]),
                str(env_id), str(business_id),
                payload["entity_name"],
                payload.get("description"),
            ),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# Entity Mappings
# ---------------------------------------------------------------------------

def list_entity_mappings(*, account_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT m.* FROM nv_entity_mappings m
               JOIN nv_canonical_entities e ON e.entity_id = m.entity_id
               WHERE e.account_id = %s::uuid
               ORDER BY m.created_at DESC""",
            (str(account_id),),
        )
        return cur.fetchall()


def create_entity_mapping(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_entity_mappings
               (entity_id, system_id, env_id, business_id,
                source_table, source_description, confidence_score, notes)
               VALUES (%s::uuid, %s, %s::uuid, %s::uuid, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(payload["entity_id"]),
                str(payload["system_id"]) if payload.get("system_id") else None,
                str(env_id), str(business_id),
                payload.get("source_table"),
                payload.get("source_description"),
                payload.get("confidence_score", 0.50),
                payload.get("notes"),
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """UPDATE nv_canonical_entities SET source_count = (
                 SELECT count(*) FROM nv_entity_mappings WHERE entity_id = %s::uuid
               ), updated_at = now()
               WHERE entity_id = %s::uuid""",
            (str(payload["entity_id"]), str(payload["entity_id"])),
        )
        return row


# ---------------------------------------------------------------------------
# Field Mappings
# ---------------------------------------------------------------------------

def list_field_mappings(*, mapping_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM nv_field_mappings WHERE mapping_id = %s::uuid ORDER BY target_field",
            (str(mapping_id),),
        )
        return cur.fetchall()


def create_field_mapping(*, env_id: UUID, business_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO nv_field_mappings
               (mapping_id, env_id, business_id, source_field, target_field,
                data_type, transformation_rule, confidence_score, notes)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                str(payload["mapping_id"]),
                str(env_id), str(business_id),
                payload["source_field"],
                payload["target_field"],
                payload.get("data_type"),
                payload.get("transformation_rule"),
                payload.get("confidence_score", 0.50),
                payload.get("notes"),
            ),
        )
        return cur.fetchone()
