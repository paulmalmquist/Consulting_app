from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor


def create_or_update_signal(
    *,
    env_id: UUID,
    business_id: UUID,
    decision_code: str,
    signal_type: str,
    severity: str,
    correlation_key: str,
    payload_json: dict,
    project_id: UUID | None = None,
    source_key: str = "decision_engine",
    actor: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND decision_code = %s
              AND correlation_key = %s
              AND status IN ('open', 'acknowledged')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id), decision_code, correlation_key),
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """
                UPDATE pds_exec_signal_event
                SET severity = %s,
                    signal_time = now(),
                    payload_json = %s::jsonb,
                    source_key = %s,
                    project_id = COALESCE(%s::uuid, project_id),
                    updated_by = %s,
                    updated_at = now()
                WHERE signal_event_id = %s::uuid
                RETURNING *
                """,
                (
                    severity,
                    json.dumps(payload_json),
                    source_key,
                    str(project_id) if project_id else None,
                    actor,
                    str(existing["signal_event_id"]),
                ),
            )
            return cur.fetchone() or existing

        cur.execute(
            """
            INSERT INTO pds_exec_signal_event
            (env_id, business_id, decision_code, signal_type, severity, signal_time,
             project_id, source_key, correlation_key, status, payload_json, created_by, updated_by)
            VALUES
            (%s::uuid, %s::uuid, %s, %s, %s, now(),
             %s::uuid, %s, %s, 'open', %s::jsonb, %s, %s)
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                decision_code,
                signal_type,
                severity,
                str(project_id) if project_id else None,
                source_key,
                correlation_key,
                json.dumps(payload_json),
                actor,
                actor,
            ),
        )
        return cur.fetchone()


def list_open_signals(*, env_id: UUID, business_id: UUID, limit: int = 100) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'acknowledged')
            ORDER BY
              CASE severity
                WHEN 'critical' THEN 4
                WHEN 'high' THEN 3
                WHEN 'medium' THEN 2
                ELSE 1
              END DESC,
              signal_time DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), max(1, min(limit, 250))),
        )
        return cur.fetchall()
