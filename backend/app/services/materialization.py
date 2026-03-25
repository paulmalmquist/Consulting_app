from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import normalize_key, resolve_tenant_id


METRIC_CATALOG = {
    "accounting_journal_debits": {
        "label": "Accounting Journal Debits",
        "description": "Total debits from posted journal lines.",
        "unit": "USD",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(SUM(jl.debit), 0)::numeric AS value
            FROM journal_line jl
            JOIN journal_entry je ON je.journal_entry_id = jl.journal_entry_id
            WHERE je.business_id = %s
              AND je.status = 'posted'
        """,
        "source_table": "journal_line",
    },
    "accounting_journal_credits": {
        "label": "Accounting Journal Credits",
        "description": "Total credits from posted journal lines.",
        "unit": "USD",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(SUM(jl.credit), 0)::numeric AS value
            FROM journal_line jl
            JOIN journal_entry je ON je.journal_entry_id = jl.journal_entry_id
            WHERE je.business_id = %s
              AND je.status = 'posted'
        """,
        "source_table": "journal_line",
    },
    "crm_open_opportunity_count": {
        "label": "CRM Open Opportunity Count",
        "description": "Count of open CRM opportunities.",
        "unit": "count",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(COUNT(*), 0)::numeric AS value
            FROM crm_opportunity
            WHERE business_id = %s
              AND status = 'open'
        """,
        "source_table": "crm_opportunity",
    },
    "crm_open_pipeline_amount": {
        "label": "CRM Open Pipeline Amount",
        "description": "Total open opportunity amount.",
        "unit": "USD",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(SUM(amount), 0)::numeric AS value
            FROM crm_opportunity
            WHERE business_id = %s
              AND status = 'open'
        """,
        "source_table": "crm_opportunity",
    },
    "repe_commitment_total": {
        "label": "REPE Commitment Total",
        "description": "Total commitments recorded across REPE funds.",
        "unit": "USD",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(SUM(committed_amount), 0)::numeric AS value
            FROM fin_commitment
            WHERE business_id = %s
        """,
        "source_table": "fin_commitment",
    },
    "repe_distribution_total": {
        "label": "REPE Distribution Total",
        "description": "Total distribution payouts across REPE funds.",
        "unit": "USD",
        "aggregation": "sum",
        "sql": """
            SELECT COALESCE(SUM(amount), 0)::numeric AS value
            FROM fin_distribution_payout
            WHERE business_id = %s
        """,
        "source_table": "fin_distribution_payout",
    },
}


def _date_key_now() -> int:
    today = datetime.now(timezone.utc).date()
    return int(today.strftime("%Y%m%d"))


def _ensure_lineage(cur, tenant_id: UUID) -> tuple[UUID, UUID]:
    cur.execute(
        """
        INSERT INTO dataset (tenant_id, key, label, description)
        VALUES (%s, 'reporting_runtime', 'Reporting Runtime Dataset', 'Near-real-time reporting snapshots')
        ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label
        RETURNING dataset_id
        """,
        (tenant_id,),
    )
    dataset_id = cur.fetchone()["dataset_id"]

    cur.execute(
        """
        SELECT dataset_version_id
        FROM dataset_version
        WHERE dataset_id = %s
        ORDER BY version DESC
        LIMIT 1
        """,
        (dataset_id,),
    )
    dataset_version = cur.fetchone()
    if dataset_version:
        dataset_version_id = dataset_version["dataset_version_id"]
    else:
        cur.execute(
            """
            INSERT INTO dataset_version (dataset_id, version, row_count, checksum)
            VALUES (%s, 1, 0, %s)
            RETURNING dataset_version_id
            """,
            (dataset_id, "reporting_runtime_v1"),
        )
        dataset_version_id = cur.fetchone()["dataset_version_id"]

    cur.execute(
        """
        INSERT INTO rule_set (tenant_id, key, label, description)
        VALUES (%s, 'metrics_semantic', 'Metrics Semantic Rules', 'Deterministic semantic metric definitions')
        ON CONFLICT (tenant_id, key) DO UPDATE SET label = EXCLUDED.label
        RETURNING rule_set_id
        """,
        (tenant_id,),
    )
    rule_set_id = cur.fetchone()["rule_set_id"]

    cur.execute(
        """
        SELECT rule_version_id
        FROM rule_version
        WHERE rule_set_id = %s
        ORDER BY version DESC
        LIMIT 1
        """,
        (rule_set_id,),
    )
    rule_version = cur.fetchone()
    if rule_version:
        rule_version_id = rule_version["rule_version_id"]
    else:
        cur.execute(
            """
            INSERT INTO rule_version (rule_set_id, version, definition_json, checksum)
            VALUES (%s, 1, %s::jsonb, %s)
            RETURNING rule_version_id
            """,
            (
                rule_set_id,
                json.dumps({"source": "materialization.py", "catalog": sorted(METRIC_CATALOG.keys())}),
                hashlib.sha256("metrics_semantic_v1".encode()).hexdigest(),
            ),
        )
        rule_version_id = cur.fetchone()["rule_version_id"]

    return dataset_version_id, rule_version_id


def _ensure_metric(cur, tenant_id: UUID, metric_key: str, config: dict) -> UUID:
    cur.execute(
        """
        INSERT INTO metric (tenant_id, key, label, description, unit, aggregation)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (tenant_id, key)
        DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description,
          unit = EXCLUDED.unit,
          aggregation = EXCLUDED.aggregation
        RETURNING metric_id
        """,
        (
            tenant_id,
            metric_key,
            config["label"],
            config["description"],
            config["unit"],
            config["aggregation"],
        ),
    )
    metric_id = cur.fetchone()["metric_id"]

    cur.execute(
        """
        INSERT INTO metric_version (metric_id, version, formula_json)
        SELECT %s, 1, %s::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM metric_version WHERE metric_id = %s AND version = 1
        )
        """,
        (metric_id, json.dumps({"sql": normalize_key(metric_key)}), metric_id),
    )
    return metric_id


def enqueue_materialization_job(
    *,
    business_id: UUID,
    event_type: str,
    event_payload: dict,
    idempotency_key: str,
) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        cur.execute(
            """
            INSERT INTO report_materialization_job
              (tenant_id, business_id, idempotency_key, event_type, event_payload, status)
            VALUES (%s, %s, %s, %s, %s::jsonb, 'queued')
            ON CONFLICT (tenant_id, business_id, idempotency_key)
            DO UPDATE SET event_payload = EXCLUDED.event_payload
            RETURNING *
            """,
            (tenant_id, str(business_id), idempotency_key, event_type, json.dumps(event_payload or {})),
        )
        return cur.fetchone()


def materialize_business_snapshot(*, business_id: UUID, job_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        date_key = _date_key_now()

        if job_id:
            cur.execute(
                """
                UPDATE report_materialization_job
                SET status = 'running', attempts = attempts + 1, started_at = now(), error_message = NULL
                WHERE report_materialization_job_id = %s
                """,
                (str(job_id),),
            )

        dataset_version_id, rule_version_id = _ensure_lineage(cur, tenant_id)

        cur.execute(
            """
            INSERT INTO run (tenant_id, business_id, dataset_version_id, rule_version_id, status, started_at, completed_at)
            VALUES (%s, %s, %s, %s, 'completed', now(), now())
            RETURNING run_id
            """,
            (tenant_id, str(business_id), dataset_version_id, rule_version_id),
        )
        run_id = cur.fetchone()["run_id"]

        inserted = 0
        for metric_key, config in METRIC_CATALOG.items():
            metric_id = _ensure_metric(cur, tenant_id, metric_key, config)
            cur.execute(config["sql"], (str(business_id),))
            value = cur.fetchone()["value"]

            cur.execute(
                """
                DELETE FROM fact_measurement
                WHERE tenant_id = %s
                  AND business_id = %s
                  AND metric_id = %s
                  AND date_key = %s
                """,
                (tenant_id, str(business_id), metric_id, date_key),
            )

            cur.execute(
                """
                INSERT INTO fact_measurement
                  (tenant_id, business_id, metric_id, dimension_key, dimension_value,
                   date_key, value, currency_code, dataset_version_id, rule_version_id, run_id)
                VALUES (%s, %s, %s, 'scope', 'business', %s, %s, 'USD', %s, %s, %s)
                """,
                (
                    tenant_id,
                    str(business_id),
                    metric_id,
                    date_key,
                    value,
                    dataset_version_id,
                    rule_version_id,
                    run_id,
                ),
            )
            inserted += 1

        if job_id:
            cur.execute(
                """
                UPDATE report_materialization_job
                SET status = 'completed', completed_at = now()
                WHERE report_materialization_job_id = %s
                """,
                (str(job_id),),
            )

        return {
            "run_id": run_id,
            "date_key": date_key,
            "rows_materialized": inserted,
            "dataset_version_id": dataset_version_id,
            "rule_version_id": rule_version_id,
        }
