from __future__ import annotations

from datetime import datetime, timezone

import psycopg

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsM365MailConnector(BaseConnector):
    connector_key = "pds_m365_mail"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []
        comm_items: list[dict] = []

        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT config_json
                    FROM pds_exec_integration_config
                    WHERE env_id = %s::uuid
                      AND business_id = %s::uuid
                      AND provider_key = 'pds_m365_mail'
                    LIMIT 1
                    """,
                    (str(context.env_id), str(context.business_id)),
                )
                cfg_row = cur.fetchone() or {}
        except psycopg.errors.UndefinedTable:
            cfg_row = {}

        config_json = cfg_row.get("config_json") if isinstance(cfg_row.get("config_json"), dict) else {}
        seeded_messages = config_json.get("mock_messages") if isinstance(config_json.get("mock_messages"), list) else []

        if seeded_messages:
            for idx, msg in enumerate(seeded_messages):
                external_id = str(msg.get("external_id") or f"m365-mail-{context.run_id}-{idx}")
                subject = str(msg.get("subject") or "PDS Executive update")
                classification = str(msg.get("classification") or "status_update")
                decision_code = msg.get("decision_code")
                project_id = msg.get("project_id")
                occurred_at = msg.get("occurred_at") or datetime.now(timezone.utc)

                record = {
                    "record_type": "mail_event",
                    "external_id": external_id,
                    "subject": subject,
                    "classification": classification,
                    "decision_code": decision_code,
                    "project_id": project_id,
                }
                records.append(record)
                comm_items.append(
                    {
                        "provider": "m365",
                        "external_id": external_id,
                        "thread_id": str(msg.get("thread_id") or external_id),
                        "comm_type": "email",
                        "direction": str(msg.get("direction") or "inbound"),
                        "subject": subject,
                        "sender": str(msg.get("sender") or "unknown@company.com"),
                        "recipients_json": msg.get("recipients") if isinstance(msg.get("recipients"), list) else [],
                        "occurred_at": occurred_at,
                        "body_text": str(msg.get("body_text") or ""),
                        "summary_text": str(msg.get("summary_text") or ""),
                        "classification": classification,
                        "decision_code": decision_code,
                        "project_id": project_id,
                        "metadata_json": msg.get("metadata") if isinstance(msg.get("metadata"), dict) else {},
                    }
                )
        else:
            # Fallback pseudo-live behavior from internal claim/change-order backlog.
            try:
                with get_cursor() as cur:
                    cur.execute(
                        """
                        SELECT
                          contractor_claim_id,
                          project_id,
                          claim_ref,
                          exposure_amount,
                          created_at
                        FROM pds_contractor_claims
                        WHERE env_id = %s::uuid
                          AND business_id = %s::uuid
                          AND status NOT IN ('closed', 'resolved', 'withdrawn')
                        ORDER BY created_at DESC
                        LIMIT 25
                        """,
                        (str(context.env_id), str(context.business_id)),
                    )
                    claim_rows = cur.fetchall()
                for row in claim_rows:
                    external_id = f"claim-{row['contractor_claim_id']}"
                    subject = f"Claim escalation needed: {row.get('claim_ref') or 'unlabeled'}"
                    records.append(
                        {
                            "record_type": "mail_event",
                            "external_id": external_id,
                            "subject": subject,
                            "classification": "decision_request",
                            "decision_code": "D18",
                            "project_id": str(row.get("project_id")),
                        }
                    )
                    comm_items.append(
                        {
                            "provider": "m365",
                            "external_id": external_id,
                            "thread_id": external_id,
                            "comm_type": "email",
                            "direction": "inbound",
                            "subject": subject,
                            "sender": "claims@vendor.example",
                            "recipients_json": ["executive@company.com"],
                            "occurred_at": row.get("created_at"),
                            "body_text": f"Current exposure is {row.get('exposure_amount') or 0}.",
                            "summary_text": "Open contractor claim requires executive review.",
                            "classification": "decision_request",
                            "decision_code": "D18",
                            "project_id": str(row.get("project_id")) if row.get("project_id") else None,
                            "metadata_json": {},
                        }
                    )
            except psycopg.errors.UndefinedTable:
                pass

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            comm_items=comm_items,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
            metadata={"comm_items": len(comm_items)},
        )


CONNECTOR = PdsM365MailConnector()
