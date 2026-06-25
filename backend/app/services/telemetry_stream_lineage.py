"""Telemetry stream lineage / provenance serving (Ticket 4).

Read-only contract over the 10034 Lakebase/Postgres serving slice (tel_stream_kafka_rows,
tel_stream_triage_events, tel_stream_consumer_offsets). Lets the frontend prove how a displayed
anomaly/triage flows: Kafka detection -> AI triage -> Databricks lake (where mapped) -> Postgres
serving row.

Honesty boundary (do not violate):
  - Postgres is the SERVING/PROVENANCE slice, not the raw lake. Databricks/Delta is the raw lake.
  - Every missing layer fails closed with an explicit status + null_reason. We never fabricate a
    Kafka offset, a triage record, or a Databricks pointer.

All reads go through get_telemetry_cursor (Lakebase pool; Supabase fallback locally) and are tenant
scoped by (env_id, business_id), validated via resolve_tenant_id (fail closed if the business is
unknown). Limits are bounded to avoid unbounded scans.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_telemetry_cursor as get_cursor
from app.services.reporting_common import resolve_tenant_id

# Canonical topics (kept equal to backend/app/services/stargate_bridge.py::StargateTopics).
ANOMALY_TOPIC = "stargate.printer.anomalies.v1"
TRIAGE_TOPIC = "stargate.printer.anomaly.triage.v1"

# Null reasons (explicit, fail-closed lineage).
TRIAGE_NOT_EMITTED = "triage_not_emitted"
KAFKA_PROVENANCE_UNAVAILABLE = "kafka_provenance_unavailable"
DATABRICKS_TABLE_MAPPING_NOT_CONFIGURED = "databricks_table_mapping_not_configured"

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

VALID_KINDS = {
    "telemetry_sample", "telemetry", "agg5s", "anomaly", "triage", "dlq", "execution", "signal",
}

# Columns surfaced by the rows endpoint (the full provenance contract).
_ROW_COLS = """
    id, record_kind, kafka_topic, kafka_partition, kafka_offset, kafka_timestamp,
    schema_id, schema_subject, schema_version,
    printer_id, print_job_id, run_id, anomaly_id, triage_id,
    decoded_payload, normalized_payload,
    databricks_catalog, databricks_schema, databricks_table, databricks_path,
    delta_version, delta_commit_timestamp,
    databricks_lineage_status, databricks_null_reason, ingested_at
"""

_TRIAGE_COLS = """
    triage_id, anomaly_id, printer_id, print_job_id, run_id,
    severity, status, incident_summary, likely_cause, leading_indicators,
    recommended_action, confidence, requires_human_review, null_reason,
    kafka_row_id, kafka_topic, kafka_partition, kafka_offset,
    databricks_catalog, databricks_schema, databricks_table, delta_version,
    databricks_lineage_status, databricks_null_reason, created_at
"""


def _bound_limit(limit: int | None) -> int:
    if not limit or limit < 1:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def list_kafka_rows(*, env_id: str, business_id: UUID, kind: str | None = None,
                    limit: int | None = None) -> dict:
    """Recent rows from tel_stream_kafka_rows for the tenant, newest first. Optional record_kind
    filter; bounded limit. Returns {status, rows, count}."""
    n = _bound_limit(limit)
    if kind is not None and kind not in VALID_KINDS:
        raise ValueError(f"invalid kind: {kind}")
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        params: list = [env_id, str(business_id)]
        kind_clause = ""
        if kind is not None:
            kind_clause = " AND record_kind = %s"
            params.append(kind)
        params.append(n)
        cur.execute(
            f"""SELECT {_ROW_COLS}
                FROM tel_stream_kafka_rows
                WHERE env_id = %s AND business_id = %s{kind_clause}
                ORDER BY ingested_at DESC
                LIMIT %s""",
            tuple(params),
        )
        rows = cur.fetchall()
    return {"status": "ok", "rows": rows, "count": len(rows)}


def get_provenance(*, env_id: str, business_id: UUID, row_id: UUID) -> dict:
    """A single kafka row + its provenance layers. Fail closed if the row is absent."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            f"""SELECT {_ROW_COLS}, consumer_group
                FROM tel_stream_kafka_rows
                WHERE env_id = %s AND business_id = %s AND id = %s""",
            (env_id, str(business_id), str(row_id)),
        )
        row = cur.fetchone()
        if row is None:
            return {"status": "not_available", "row": None,
                    "null_reason": KAFKA_PROVENANCE_UNAVAILABLE}
        return {"status": "ok", "row": row, "layers": _layers_from_row(row)}


def latest_triage(*, env_id: str, business_id: UUID, limit: int | None = None) -> dict:
    """Latest triage records from tel_stream_triage_events, newest first."""
    n = _bound_limit(limit)
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            f"""SELECT {_TRIAGE_COLS}
                FROM tel_stream_triage_events
                WHERE env_id = %s AND business_id = %s
                ORDER BY created_at DESC
                LIMIT %s""",
            (env_id, str(business_id), n),
        )
        rows = cur.fetchall()
    return {"status": "ok", "triage": rows, "count": len(rows)}


def triage_for_anomaly(*, env_id: str, business_id: UUID, anomaly_id: str) -> dict:
    """Triage for one anomaly. Fail closed (triage_not_emitted) when none exists."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            f"""SELECT {_TRIAGE_COLS}
                FROM tel_stream_triage_events
                WHERE env_id = %s AND business_id = %s AND anomaly_id = %s
                ORDER BY created_at DESC
                LIMIT 1""",
            (env_id, str(business_id), anomaly_id),
        )
        row = cur.fetchone()
    if row is None:
        return {"status": "not_available", "triage": None, "null_reason": TRIAGE_NOT_EMITTED}
    return {"status": "ok", "triage": row}


def anomaly_lineage(*, env_id: str, business_id: UUID, anomaly_id: str) -> dict:
    """Combined lineage for one anomaly: kafka_detection -> agent_triage -> databricks_lake ->
    postgres_serving. Each layer fails closed with an explicit status + null_reason.

    Top-level status is 'ok' when the kafka detection row exists, else 'not_available' (the anomaly is
    unknown to the serving slice)."""
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)

        # Kafka detection row (the anomaly event on the anomalies topic).
        cur.execute(
            f"""SELECT {_ROW_COLS}
                FROM tel_stream_kafka_rows
                WHERE env_id = %s AND business_id = %s AND anomaly_id = %s
                  AND record_kind = 'anomaly'
                ORDER BY ingested_at DESC
                LIMIT 1""",
            (env_id, str(business_id), anomaly_id),
        )
        detection = cur.fetchone()

        # AI triage projection for the anomaly.
        cur.execute(
            f"""SELECT {_TRIAGE_COLS}
                FROM tel_stream_triage_events
                WHERE env_id = %s AND business_id = %s AND anomaly_id = %s
                ORDER BY created_at DESC
                LIMIT 1""",
            (env_id, str(business_id), anomaly_id),
        )
        triage = cur.fetchone()

    if detection is None and triage is None:
        return {
            "status": "not_available", "anomaly_id": anomaly_id,
            "null_reason": KAFKA_PROVENANCE_UNAVAILABLE,
            "layers": {
                "kafka_detection": {"status": "not_available",
                                    "null_reason": KAFKA_PROVENANCE_UNAVAILABLE},
                "agent_triage": {"status": "not_available", "null_reason": TRIAGE_NOT_EMITTED},
                "databricks_lake": _databricks_layer(None),
                "postgres_serving": {"status": "not_available",
                                     "null_reason": KAFKA_PROVENANCE_UNAVAILABLE},
            },
        }

    return {
        "status": "ok",
        "anomaly_id": anomaly_id,
        "layers": {
            "kafka_detection": _kafka_detection_layer(detection),
            "agent_triage": _agent_triage_layer(triage),
            "databricks_lake": _databricks_layer(detection or triage),
            "postgres_serving": _postgres_serving_layer(detection, triage),
        },
    }


# ── layer builders ────────────────────────────────────────────────────────────────────────────────────

def _kafka_detection_layer(row: dict | None) -> dict:
    if row is None:
        return {"status": "not_available", "null_reason": KAFKA_PROVENANCE_UNAVAILABLE}
    return {
        "status": "available",
        "topic": row["kafka_topic"],
        "partition": row["kafka_partition"],
        "offset": row["kafka_offset"],
        "schema_id": row["schema_id"],
        "schema_subject": row["schema_subject"],
        "schema_version": row["schema_version"],
        "row_id": str(row["id"]),
    }


def _agent_triage_layer(t: dict | None) -> dict:
    if t is None:
        return {"status": "not_available", "topic": TRIAGE_TOPIC, "null_reason": TRIAGE_NOT_EMITTED}
    return {
        "status": "available",
        "topic": t.get("kafka_topic") or TRIAGE_TOPIC,
        "partition": t.get("kafka_partition"),
        "offset": t.get("kafka_offset"),
        "triage_id": t["triage_id"],
        "severity": t.get("severity"),
        "summary": t.get("incident_summary"),
        "recommended_action": t.get("recommended_action"),
        "requires_human_review": t.get("requires_human_review"),
        "null_reason": t.get("null_reason"),
    }


def _databricks_layer(row: dict | None) -> dict:
    """Databricks/Delta pointer layer. Fails closed to not_available until a Stargate->Delta mapping
    exists. Never fabricates catalog/schema/table/version."""
    status = (row or {}).get("databricks_lineage_status") or "not_available"
    if status != "available":
        return {
            "status": "not_available",
            "catalog": None, "schema": None, "table": None, "delta_version": None,
            "null_reason": (row or {}).get("databricks_null_reason")
            or DATABRICKS_TABLE_MAPPING_NOT_CONFIGURED,
        }
    return {
        "status": "available",
        "catalog": row.get("databricks_catalog"),
        "schema": row.get("databricks_schema"),
        "table": row.get("databricks_table"),
        "path": row.get("databricks_path"),
        "delta_version": row.get("delta_version"),
        "delta_commit_timestamp": row.get("delta_commit_timestamp"),
        "null_reason": None,
    }


def _postgres_serving_layer(detection: dict | None, triage: dict | None) -> dict:
    if detection is None and triage is None:
        return {"status": "not_available", "null_reason": KAFKA_PROVENANCE_UNAVAILABLE}
    out: dict = {"status": "available", "table": "tel_stream_kafka_rows"}
    if detection is not None:
        out["row_id"] = str(detection["id"])
        out["ingested_at"] = detection["ingested_at"]
    if triage is not None:
        out["triage_id"] = triage["triage_id"]
    return out


def _layers_from_row(row: dict) -> dict:
    """Provenance layers for a single kafka row (used by the provenance-by-id endpoint)."""
    return {
        "kafka": _kafka_detection_layer(row),
        "databricks_lake": _databricks_layer(row),
        "postgres_serving": {
            "status": "available", "table": "tel_stream_kafka_rows",
            "row_id": str(row["id"]), "ingested_at": row["ingested_at"],
        },
    }
