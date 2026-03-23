"""Semantic catalog service — DB-backed metric, entity, join, and lineage definitions.

Replaces static Python dicts with a live, versioned, governed catalog.
"""

from __future__ import annotations

from typing import Any

from app.db import get_cursor


# ── Metric definitions ──────────────────────────────────────────────


def list_metrics(*, business_id: str) -> list[dict[str, Any]]:
    """List all active metric definitions for a business."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_id, metric_key, display_name, description,
                   sql_template, unit, aggregation, format_hint,
                   entity_key, owner, version, created_at
            FROM semantic_metric_def
            WHERE business_id = %s AND is_active = true
            ORDER BY metric_key
            """,
            [business_id],
        )
        return cur.fetchall()


def get_metric(*, business_id: str, metric_key: str) -> dict[str, Any] | None:
    """Get a single metric definition by key."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_id, metric_key, display_name, description,
                   sql_template, unit, aggregation, format_hint,
                   entity_key, owner, version, created_at
            FROM semantic_metric_def
            WHERE business_id = %s AND metric_key = %s AND is_active = true
            ORDER BY version DESC
            LIMIT 1
            """,
            [business_id, metric_key],
        )
        return cur.fetchone()


def upsert_metric(
    *,
    business_id: str,
    metric_key: str,
    display_name: str,
    sql_template: str,
    unit: str = "number",
    aggregation: str = "sum",
    description: str | None = None,
    format_hint: str | None = None,
    entity_key: str | None = None,
    owner: str | None = None,
) -> dict[str, Any]:
    """Create or update a metric definition."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO semantic_metric_def
                (business_id, metric_key, display_name, description,
                 sql_template, unit, aggregation, format_hint,
                 entity_key, owner)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_id, metric_key, version) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                sql_template = EXCLUDED.sql_template,
                unit = EXCLUDED.unit,
                aggregation = EXCLUDED.aggregation,
                format_hint = EXCLUDED.format_hint,
                entity_key = EXCLUDED.entity_key,
                owner = EXCLUDED.owner,
                updated_at = now()
            RETURNING metric_id, metric_key, version
            """,
            [business_id, metric_key, display_name, description,
             sql_template, unit, aggregation, format_hint,
             entity_key, owner],
        )
        return cur.fetchone()


# ── Entity definitions ──────────────────────────────────────────────


def list_entities(*, business_id: str) -> list[dict[str, Any]]:
    """List all active entity definitions for a business."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT entity_id, entity_key, display_name, description,
                   table_name, pk_column, business_id_path,
                   parent_entity_key, parent_fk_column, created_at
            FROM semantic_entity_def
            WHERE business_id = %s AND is_active = true
            ORDER BY entity_key
            """,
            [business_id],
        )
        return cur.fetchall()


def upsert_entity(
    *,
    business_id: str,
    entity_key: str,
    display_name: str,
    table_name: str,
    pk_column: str,
    business_id_path: str | None = None,
    parent_entity_key: str | None = None,
    parent_fk_column: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Create or update an entity definition."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO semantic_entity_def
                (business_id, entity_key, display_name, description,
                 table_name, pk_column, business_id_path,
                 parent_entity_key, parent_fk_column)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (business_id, entity_key) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                table_name = EXCLUDED.table_name,
                pk_column = EXCLUDED.pk_column,
                business_id_path = EXCLUDED.business_id_path,
                parent_entity_key = EXCLUDED.parent_entity_key,
                parent_fk_column = EXCLUDED.parent_fk_column,
                updated_at = now()
            RETURNING entity_id, entity_key
            """,
            [business_id, entity_key, display_name, description,
             table_name, pk_column, business_id_path,
             parent_entity_key, parent_fk_column],
        )
        return cur.fetchone()


# ── Join graph ──────────────────────────────────────────────────────


def list_joins(*, business_id: str) -> list[dict[str, Any]]:
    """List all active validated join paths."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT join_id, from_entity_key, to_entity_key,
                   join_sql, cardinality, is_safe, fan_out_warning,
                   validated_at, validated_by
            FROM semantic_join_def
            WHERE business_id = %s AND is_active = true
            ORDER BY from_entity_key, to_entity_key
            """,
            [business_id],
        )
        return cur.fetchall()


def validate_join(
    *, business_id: str, from_entity: str, to_entity: str
) -> dict[str, Any] | None:
    """Check whether a join path is validated. Returns None if not found."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT join_id, join_sql, cardinality, is_safe, fan_out_warning
            FROM semantic_join_def
            WHERE business_id = %s
              AND from_entity_key = %s
              AND to_entity_key = %s
              AND is_active = true
            """,
            [business_id, from_entity, to_entity],
        )
        return cur.fetchone()


def upsert_join(
    *,
    business_id: str,
    from_entity_key: str,
    to_entity_key: str,
    join_sql: str,
    cardinality: str = "many_to_one",
    is_safe: bool = True,
    fan_out_warning: str | None = None,
) -> dict[str, Any]:
    """Create or update a validated join path."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO semantic_join_def
                (business_id, from_entity_key, to_entity_key,
                 join_sql, cardinality, is_safe, fan_out_warning,
                 validated_at, validated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, now(), 'system')
            ON CONFLICT (business_id, from_entity_key, to_entity_key) DO UPDATE SET
                join_sql = EXCLUDED.join_sql,
                cardinality = EXCLUDED.cardinality,
                is_safe = EXCLUDED.is_safe,
                fan_out_warning = EXCLUDED.fan_out_warning,
                validated_at = now()
            RETURNING join_id
            """,
            [business_id, from_entity_key, to_entity_key,
             join_sql, cardinality, is_safe, fan_out_warning],
        )
        return cur.fetchone()


# ── Lineage ─────────────────────────────────────────────────────────


def get_lineage(
    *, business_id: str, table: str, column: str
) -> list[dict[str, Any]]:
    """Get upstream lineage edges for a given table.column."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT edge_id, source_table, source_column,
                   target_table, target_column,
                   transform_type, transform_sql
            FROM semantic_lineage_edge
            WHERE business_id = %s
              AND target_table = %s
              AND target_column = %s
            ORDER BY source_table, source_column
            """,
            [business_id, table, column],
        )
        return cur.fetchall()


# ── Data contracts ──────────────────────────────────────────────────


def list_contracts(*, business_id: str) -> list[dict[str, Any]]:
    """List all active data contracts."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT contract_id, table_name, freshness_sla_minutes,
                   completeness_threshold, owner, description,
                   last_checked_at, last_status
            FROM semantic_data_contract
            WHERE business_id = %s AND is_active = true
            ORDER BY table_name
            """,
            [business_id],
        )
        return cur.fetchall()


def check_data_contract(*, business_id: str, table_name: str) -> dict[str, Any] | None:
    """Check the SLA status for a specific table."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT contract_id, table_name, freshness_sla_minutes,
                   completeness_threshold, last_checked_at, last_status
            FROM semantic_data_contract
            WHERE business_id = %s AND table_name = %s AND is_active = true
            """,
            [business_id, table_name],
        )
        return cur.fetchone()


# ── Catalog versioning ──────────────────────────────────────────────


def publish_catalog_version(
    *, business_id: str, publisher: str, changelog: str | None = None
) -> dict[str, Any]:
    """Publish a new catalog version."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO semantic_catalog_version
                (business_id, version_number, publisher, changelog)
            VALUES (
                %s,
                COALESCE(
                    (SELECT MAX(version_number) + 1
                     FROM semantic_catalog_version
                     WHERE business_id = %s),
                    1
                ),
                %s, %s
            )
            RETURNING version_id, version_number, published_at
            """,
            [business_id, business_id, publisher, changelog],
        )
        return cur.fetchone()


# ── Catalog text for LLM prompts (dynamic replacement for static catalog) ──


def catalog_text_from_db(*, business_id: str) -> str | None:
    """Build a catalog prompt from DB definitions.

    Returns None if no entities are defined (caller should fall back
    to the static catalog).
    """
    entities = list_entities(business_id=business_id)
    if not entities:
        return None

    metrics = list_metrics(business_id=business_id)
    joins = list_joins(business_id=business_id)

    lines: list[str] = ["## Semantic Catalog (live)", ""]

    lines.append("### Entities")
    for e in entities:
        lines.append(f"- **{e['entity_key']}** → `{e['table_name']}` (PK: {e['pk_column']})")
        if e.get("description"):
            lines.append(f"  {e['description']}")

    lines.append("")
    lines.append("### Metrics")
    for m in metrics:
        hint = f" ({m['format_hint']})" if m.get("format_hint") else ""
        lines.append(f"- **{m['metric_key']}**: {m['display_name']} [{m['unit']}, {m['aggregation']}]{hint}")

    lines.append("")
    lines.append("### Valid Joins")
    for j in joins:
        warning = f" ⚠ {j['fan_out_warning']}" if not j["is_safe"] else ""
        lines.append(f"- {j['from_entity_key']} → {j['to_entity_key']} ({j['cardinality']}){warning}")

    return "\n".join(lines)
