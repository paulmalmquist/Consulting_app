from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.connectors.pds import get_connector, list_connector_keys
from app.connectors.pds.base import ConnectorContext, ConnectorResult
from app.db import get_cursor

DEFAULT_CONNECTOR_KEYS = [
    "pds_internal_portfolio",
    "pds_internal_crm",
    "pds_internal_finance",
    "pds_m365_mail",
    "pds_m365_calendar",
    "pds_market_external",
]


def _insert_comm_items(*, env_id: UUID, business_id: UUID, items: list[dict]) -> int:
    inserted = 0
    if not items:
        return inserted

    with get_cursor() as cur:
        for item in items:
            cur.execute(
                """
                INSERT INTO pds_exec_comm_item
                (env_id, business_id, provider, external_id, thread_id, comm_type, direction,
                 subject, sender, recipients_json, occurred_at, body_text, summary_text,
                 classification, decision_code, project_id, metadata_json)
                VALUES
                (%s::uuid, %s::uuid, %s, %s, %s, %s, %s,
                 %s, %s, %s::jsonb, %s, %s, %s,
                 %s, %s, %s::uuid, %s::jsonb)
                ON CONFLICT (provider, external_id) DO UPDATE
                  SET thread_id = EXCLUDED.thread_id,
                      subject = EXCLUDED.subject,
                      sender = EXCLUDED.sender,
                      recipients_json = EXCLUDED.recipients_json,
                      occurred_at = EXCLUDED.occurred_at,
                      body_text = EXCLUDED.body_text,
                      summary_text = EXCLUDED.summary_text,
                      classification = EXCLUDED.classification,
                      decision_code = EXCLUDED.decision_code,
                      project_id = EXCLUDED.project_id,
                      metadata_json = EXCLUDED.metadata_json,
                      updated_at = now()
                """,
                (
                    str(env_id),
                    str(business_id),
                    str(item.get("provider") or "m365"),
                    str(item.get("external_id") or f"comm-{uuid4()}"),
                    item.get("thread_id"),
                    str(item.get("comm_type") or "email"),
                    str(item.get("direction") or "inbound"),
                    item.get("subject"),
                    item.get("sender"),
                    json.dumps(item.get("recipients_json") or []),
                    item.get("occurred_at"),
                    item.get("body_text"),
                    item.get("summary_text"),
                    str(item.get("classification") or "unknown"),
                    item.get("decision_code"),
                    str(item.get("project_id")) if item.get("project_id") else None,
                    json.dumps(item.get("metadata_json") or {}),
                ),
            )
            inserted += 1

    return inserted


def _start_connector_run(*, env_id: UUID, business_id: UUID, connector_key: str, run_mode: str, actor: str | None) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO pds_exec_connector_run
            (env_id, business_id, connector_key, run_mode, status, started_at, created_by)
            VALUES (%s::uuid, %s::uuid, %s, %s, 'running', now(), %s)
            RETURNING connector_run_id
            """,
            (str(env_id), str(business_id), connector_key, run_mode, actor),
        )
        row = cur.fetchone() or {}
        return UUID(str(row["connector_run_id"]))


def _finish_connector_run(*, run_id: UUID, status: str, result: ConnectorResult | None = None, error: str | None = None) -> None:
    payload = {
        "records": (result.records if result else []),
        "metadata": (result.metadata if result else {}),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE pds_exec_connector_run
            SET status = %s,
                finished_at = now(),
                rows_read = %s,
                rows_written = %s,
                payload_json = %s::jsonb,
                raw_artifact_path = %s,
                token_cost = %s,
                error_summary = %s
            WHERE connector_run_id = %s::uuid
            """,
            (
                status,
                int(result.rows_read if result else 0),
                int(result.rows_written if result else 0),
                json.dumps(payload),
                result.raw_artifact_path if result else None,
                float(result.token_cost if result else 0.0),
                error,
                str(run_id),
            ),
        )


def run_connector(
    *,
    env_id: UUID,
    business_id: UUID,
    connector_key: str,
    run_mode: str = "live",
    force_refresh: bool = False,
    actor: str | None = None,
) -> dict:
    connector = get_connector(connector_key)
    connector_run_id = _start_connector_run(
        env_id=env_id,
        business_id=business_id,
        connector_key=connector_key,
        run_mode=run_mode,
        actor=actor,
    )

    context = ConnectorContext(
        env_id=env_id,
        business_id=business_id,
        run_id=str(connector_run_id),
        force_refresh=force_refresh,
    )

    try:
        result = connector.run(context)
        comm_items = _insert_comm_items(env_id=env_id, business_id=business_id, items=result.comm_items)
        _finish_connector_run(run_id=connector_run_id, status="success", result=result)
        return {
            "connector_run_id": str(connector_run_id),
            "connector_key": connector_key,
            "status": "success",
            "rows_read": result.rows_read,
            "rows_written": result.rows_written,
            "comm_items_written": comm_items,
            "metadata": result.metadata,
        }
    except Exception as exc:
        _finish_connector_run(run_id=connector_run_id, status="failed", error=str(exc))
        raise


def run_connectors(
    *,
    env_id: UUID,
    business_id: UUID,
    connector_keys: list[str] | None = None,
    run_mode: str = "live",
    force_refresh: bool = False,
    actor: str | None = None,
) -> dict:
    keys = connector_keys or DEFAULT_CONNECTOR_KEYS
    available = set(list_connector_keys())
    unknown = [key for key in keys if key not in available]
    if unknown:
        raise ValueError(f"Unknown connectors requested: {', '.join(sorted(unknown))}")

    runs: list[dict] = []
    for connector_key in keys:
        runs.append(
            run_connector(
                env_id=env_id,
                business_id=business_id,
                connector_key=connector_key,
                run_mode=run_mode,
                force_refresh=force_refresh,
                actor=actor,
            )
        )

    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "connector_keys": keys,
        "runs": runs,
    }


def list_runs(
    *,
    env_id: UUID,
    business_id: UUID,
    connector_key: str | None = None,
    limit: int = 50,
) -> list[dict]:
    where = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list = [str(env_id), str(business_id)]
    if connector_key:
        where.append("connector_key = %s")
        params.append(connector_key)
    params.append(max(1, min(int(limit), 250)))

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM pds_exec_connector_run
            WHERE {' AND '.join(where)}
            ORDER BY started_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return cur.fetchall()
