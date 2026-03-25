from __future__ import annotations

from decimal import Decimal

import psycopg

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsInternalCrmConnector(BaseConnector):
    connector_key = "pds_internal_crm"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []
        open_count = 0
        won_last_90d = 0
        pipeline_value_open = Decimal("0")

        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      o.crm_opportunity_id,
                      o.name,
                      o.amount,
                      o.currency_code,
                      o.expected_close_date,
                      o.actual_close_date,
                      o.status,
                      a.name AS account_name,
                      s.key AS stage_key,
                      s.label AS stage_label,
                      s.win_probability
                    FROM crm_opportunity o
                    LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
                    LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                    WHERE o.business_id = %s::uuid
                    ORDER BY o.created_at DESC
                    LIMIT 300
                    """,
                    (str(context.business_id),),
                )
                rows = cur.fetchall()

            for row in rows:
                amount = Decimal(str(row.get("amount") or 0))
                status = str(row.get("status") or "open").lower()
                stage_key = (row.get("stage_key") or "").strip().lower()
                if status == "open":
                    open_count += 1
                    pipeline_value_open += amount
                if status == "won":
                    won_last_90d += 1

                records.append(
                    {
                        "record_type": "crm_opportunity",
                        "opportunity_id": str(row.get("crm_opportunity_id")),
                        "name": row.get("name"),
                        "account_name": row.get("account_name"),
                        "stage_key": stage_key,
                        "stage_label": row.get("stage_label"),
                        "win_probability": str(row.get("win_probability") or 0),
                        "status": status,
                        "amount": str(amount),
                        "currency_code": row.get("currency_code") or "USD",
                        "expected_close_date": row.get("expected_close_date"),
                        "actual_close_date": row.get("actual_close_date"),
                    }
                )
        except psycopg.errors.UndefinedTable:
            records = []

        records.append(
            {
                "record_type": "crm_pipeline_summary",
                "open_count": open_count,
                "won_last_90d": won_last_90d,
                "pipeline_value_open": str(pipeline_value_open),
            }
        )

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
            metadata={
                "open_count": open_count,
                "won_last_90d": won_last_90d,
                "pipeline_value_open": str(pipeline_value_open),
            },
        )


CONNECTOR = PdsInternalCrmConnector()
