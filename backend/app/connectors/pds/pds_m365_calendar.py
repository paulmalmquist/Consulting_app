from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import psycopg

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsM365CalendarConnector(BaseConnector):
    connector_key = "pds_m365_calendar"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []
        comm_items: list[dict] = []
        now = datetime.now(timezone.utc)

        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT milestone_id, project_id, milestone_name, current_date, owner_name
                    FROM pds_milestones
                    WHERE env_id = %s::uuid
                      AND business_id = %s::uuid
                      AND actual_date IS NULL
                    ORDER BY current_date ASC NULLS LAST, created_at DESC
                    LIMIT 40
                    """,
                    (str(context.env_id), str(context.business_id)),
                )
                milestone_rows = cur.fetchall()
        except psycopg.errors.UndefinedTable:
            milestone_rows = []

        for row in milestone_rows:
            due = row.get("current_date")
            if due is None:
                continue
            if isinstance(due, date):
                occurred_at = datetime.combine(due, datetime.min.time(), tzinfo=timezone.utc)
            else:
                occurred_at = now + timedelta(days=2)
            external_id = f"milestone-{row['milestone_id']}"
            title = f"Milestone review: {row.get('milestone_name') or 'Unnamed milestone'}"

            records.append(
                {
                    "record_type": "calendar_event",
                    "external_id": external_id,
                    "title": title,
                    "project_id": str(row.get("project_id")),
                    "occurred_at": occurred_at,
                    "decision_code": "D07",
                }
            )
            comm_items.append(
                {
                    "provider": "m365",
                    "external_id": external_id,
                    "thread_id": external_id,
                    "comm_type": "calendar_event",
                    "direction": "internal",
                    "subject": title,
                    "sender": "calendar@company.com",
                    "recipients_json": [row.get("owner_name") or "project-team@company.com"],
                    "occurred_at": occurred_at,
                    "body_text": "Upcoming milestone checkpoint for executive awareness.",
                    "summary_text": "Milestone checkpoint event detected.",
                    "classification": "status_update",
                    "decision_code": "D07",
                    "project_id": str(row.get("project_id")) if row.get("project_id") else None,
                    "metadata_json": {"owner_name": row.get("owner_name")},
                }
            )

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            comm_items=comm_items,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
            metadata={"comm_items": len(comm_items)},
        )


CONNECTOR = PdsM365CalendarConnector()
