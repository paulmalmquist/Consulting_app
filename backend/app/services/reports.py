from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.db import get_cursor
from app.services import metrics_semantic
from app.services import materialization
from app.services.reporting_common import normalize_key, resolve_tenant_id


def _next_report_key(cur, tenant_id: UUID, title: str) -> str:
    base = normalize_key(title) or "report"
    for i in range(0, 100):
        key = base if i == 0 else f"{base}_{i+1}"
        cur.execute("SELECT 1 FROM report WHERE tenant_id = %s AND key = %s", (tenant_id, key))
        if not cur.fetchone():
            return key
    raise ValueError("Could not allocate unique report key")


def create_report(
    *,
    business_id: UUID,
    title: str,
    description: str | None,
    query: dict,
    is_draft: bool,
) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        key = _next_report_key(cur, tenant_id, title)

        cur.execute(
            """
            INSERT INTO report (tenant_id, key, label, description)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (tenant_id, key, title, description),
        )
        report = cur.fetchone()

        config = {
            "business_id": str(business_id),
            "query": query,
            "is_draft": is_draft,
        }
        cur.execute(
            """
            INSERT INTO report_version (report_id, version, config_json)
            VALUES (%s, 1, %s::jsonb)
            RETURNING *
            """,
            (report["report_id"], json.dumps(config)),
        )
        version = cur.fetchone()

        return {
            "report_id": str(report["report_id"]),
            "key": report["key"],
            "label": report["label"],
            "description": report["description"],
            "version": version["version"],
            "config": version["config_json"],
            "created_at": str(report["created_at"]),
        }


def list_reports(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT r.report_id,
                   r.key,
                   r.label,
                   r.description,
                   rv.version,
                   rv.config_json,
                   r.created_at
            FROM report r
            JOIN LATERAL (
              SELECT report_version_id, version, config_json
              FROM report_version
              WHERE report_id = r.report_id
              ORDER BY version DESC
              LIMIT 1
            ) rv ON true
            WHERE r.tenant_id = %s
              AND COALESCE(rv.config_json->>'business_id', '') = %s
            ORDER BY r.created_at DESC
            """,
            (tenant_id, str(business_id)),
        )
        rows = cur.fetchall()

    return [
        {
            "report_id": str(r["report_id"]),
            "key": r["key"],
            "label": r["label"],
            "description": r["description"],
            "version": r["version"],
            "config": r["config_json"],
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]


def get_report(*, business_id: UUID, report_id: UUID) -> dict | None:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT r.report_id,
                   r.key,
                   r.label,
                   r.description,
                   rv.report_version_id,
                   rv.version,
                   rv.config_json,
                   r.created_at
            FROM report r
            JOIN LATERAL (
              SELECT report_version_id, version, config_json
              FROM report_version
              WHERE report_id = r.report_id
              ORDER BY version DESC
              LIMIT 1
            ) rv ON true
            WHERE r.tenant_id = %s
              AND r.report_id = %s
              AND COALESCE(rv.config_json->>'business_id', '') = %s
            """,
            (tenant_id, str(report_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            return None

    return {
        "report_id": str(row["report_id"]),
        "key": row["key"],
        "label": row["label"],
        "description": row["description"],
        "report_version_id": str(row["report_version_id"]),
        "version": row["version"],
        "config": row["config_json"],
        "created_at": str(row["created_at"]),
    }


def run_report(*, business_id: UUID, report_id: UUID, refresh: bool = True) -> dict:
    report = get_report(business_id=business_id, report_id=report_id)
    if not report:
        raise LookupError("Report not found")

    query = report["config"].get("query") or {}
    metrics = query.get("metric_keys") or []
    if not metrics:
        raise ValueError("Report query is missing metric_keys")

    job = materialization.enqueue_materialization_job(
        business_id=business_id,
        event_type="report_run",
        event_payload={"report_id": str(report_id)},
        idempotency_key=f"report_run_{report_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
    )
    mat = materialization.materialize_business_snapshot(
        business_id=business_id,
        job_id=job["report_materialization_job_id"],
    ) if refresh else {"run_id": None, "dataset_version_id": None, "rule_version_id": None}

    result = metrics_semantic.query_metrics(
        business_id=business_id,
        metric_keys=metrics,
        dimension=query.get("dimension"),
        date_from=None,
        date_to=None,
        refresh=False,
    )

    now = datetime.now(timezone.utc)
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            INSERT INTO report_run
              (tenant_id, business_id, report_id, report_version_id, run_id, status, query_hash, started_at, completed_at)
            VALUES (%s, %s, %s, %s, %s, 'completed', %s, %s, %s)
            RETURNING report_run_id
            """,
            (
                tenant_id,
                str(business_id),
                str(report_id),
                report["report_version_id"],
                mat.get("run_id"),
                result["query_hash"],
                now,
                now,
            ),
        )
        report_run_id = cur.fetchone()["report_run_id"]

        expires_at = now + timedelta(minutes=5)
        cur.execute(
            """
            INSERT INTO report_result_cache
              (tenant_id, business_id, report_id, report_run_id, query_hash, result_json, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                tenant_id,
                str(business_id),
                str(report_id),
                report_run_id,
                result["query_hash"],
                json.dumps(result),
                expires_at,
            ),
        )

        for point in result["points"]:
            cur.execute(
                """
                INSERT INTO number_trace
                  (tenant_id, business_id, report_run_id, metric_id, dimension_key, dimension_value,
                   grain, date_key, value, dataset_version_id, rule_version_id, run_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, %s)
                RETURNING number_trace_id
                """,
                (
                    tenant_id,
                    str(business_id),
                    report_run_id,
                    point["metric_id"],
                    point["dimension"],
                    point["dimension_value"],
                    "snapshot",
                    point["value"],
                    mat.get("dataset_version_id"),
                    mat.get("rule_version_id"),
                    mat.get("run_id"),
                ),
            )
            number_trace_id = cur.fetchone()["number_trace_id"]

            for source_fact_id in point.get("source_fact_ids", []):
                cur.execute(
                    """
                    INSERT INTO number_trace_row
                      (number_trace_id, source_table, source_row_id, source_ref, contribution_value)
                    VALUES (%s, 'fact_measurement', %s, %s, %s)
                    """,
                    (
                        number_trace_id,
                        source_fact_id,
                        point["metric_key"],
                        point["value"],
                    ),
                )

    return {
        "report_run_id": str(report_run_id),
        "run_id": str(mat.get("run_id")) if mat.get("run_id") else None,
        "query_hash": result["query_hash"],
        "points": result["points"],
    }


def explain_report_run(*, business_id: UUID, report_id: UUID, report_run_id: UUID) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT rr.report_run_id
            FROM report_run rr
            WHERE rr.report_run_id = %s
              AND rr.report_id = %s
              AND rr.business_id = %s
              AND rr.tenant_id = %s
            """,
            (str(report_run_id), str(report_id), str(business_id), tenant_id),
        )
        if not cur.fetchone():
            raise LookupError("Report run not found")

        cur.execute(
            """
            SELECT nt.number_trace_id,
                   nt.metric_id,
                   m.key AS metric_key,
                   m.label AS metric_label,
                   nt.dimension_key,
                   nt.dimension_value,
                   nt.value,
                   nt.run_id,
                   nt.dataset_version_id,
                   nt.rule_version_id
            FROM number_trace nt
            JOIN metric m ON m.metric_id = nt.metric_id
            WHERE nt.report_run_id = %s
            ORDER BY nt.created_at
            """,
            (str(report_run_id),),
        )
        traces = cur.fetchall()

        explanation: list[dict] = []
        for trace in traces:
            cur.execute(
                """
                SELECT source_table, source_row_id, source_ref, contribution_value
                FROM number_trace_row
                WHERE number_trace_id = %s
                ORDER BY created_at
                """,
                (trace["number_trace_id"],),
            )
            rows = cur.fetchall()
            explanation.append(
                {
                    "number_trace_id": str(trace["number_trace_id"]),
                    "metric_id": str(trace["metric_id"]),
                    "metric_key": trace["metric_key"],
                    "metric_label": trace["metric_label"],
                    "dimension_key": trace["dimension_key"],
                    "dimension_value": trace["dimension_value"],
                    "value": str(trace["value"]),
                    "run_id": str(trace["run_id"]) if trace["run_id"] else None,
                    "dataset_version_id": str(trace["dataset_version_id"]) if trace["dataset_version_id"] else None,
                    "rule_version_id": str(trace["rule_version_id"]) if trace["rule_version_id"] else None,
                    "rows": [
                        {
                            "source_table": r["source_table"],
                            "source_row_id": str(r["source_row_id"]) if r["source_row_id"] else None,
                            "source_ref": r["source_ref"],
                            "contribution_value": str(r["contribution_value"]) if r["contribution_value"] is not None else None,
                        }
                        for r in rows
                    ],
                }
            )

    return {
        "report_id": str(report_id),
        "report_run_id": str(report_run_id),
        "explanation": explanation,
    }
