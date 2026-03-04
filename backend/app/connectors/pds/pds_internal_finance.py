from __future__ import annotations

from decimal import Decimal

import psycopg

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsInternalFinanceConnector(BaseConnector):
    connector_key = "pds_internal_finance"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []
        total_budget = Decimal("0")
        total_forecast = Decimal("0")
        total_committed = Decimal("0")

        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      fp.fin_construction_project_id,
                      fp.code,
                      fp.name,
                      fp.status,
                      fs.as_of_date,
                      fs.total_budget,
                      fs.total_committed,
                      fs.total_actual,
                      fs.total_remaining,
                      fs.forecast_at_completion
                    FROM fin_forecast_snapshot fs
                    JOIN fin_construction_project fp
                      ON fp.fin_construction_project_id = fs.fin_construction_project_id
                    WHERE fs.business_id = %s::uuid
                    ORDER BY fs.as_of_date DESC, fs.created_at DESC
                    LIMIT 250
                    """,
                    (str(context.business_id),),
                )
                rows = cur.fetchall()

            for row in rows:
                budget = Decimal(str(row.get("total_budget") or 0))
                committed = Decimal(str(row.get("total_committed") or 0))
                forecast = Decimal(str(row.get("forecast_at_completion") or 0))
                total_budget += budget
                total_committed += committed
                total_forecast += forecast

                records.append(
                    {
                        "record_type": "finance_forecast",
                        "fin_construction_project_id": str(row.get("fin_construction_project_id")),
                        "project_code": row.get("code"),
                        "project_name": row.get("name"),
                        "status": row.get("status"),
                        "as_of_date": row.get("as_of_date"),
                        "total_budget": str(budget),
                        "total_committed": str(committed),
                        "total_actual": str(row.get("total_actual") or 0),
                        "total_remaining": str(row.get("total_remaining") or 0),
                        "forecast_at_completion": str(forecast),
                    }
                )
        except psycopg.errors.UndefinedTable:
            records = []

        records.append(
            {
                "record_type": "finance_summary",
                "total_budget": str(total_budget),
                "total_committed": str(total_committed),
                "total_forecast": str(total_forecast),
                "variance": str(total_budget - total_forecast),
            }
        )

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
            metadata={
                "total_budget": str(total_budget),
                "total_forecast": str(total_forecast),
                "variance": str(total_budget - total_forecast),
            },
        )


CONNECTOR = PdsInternalFinanceConnector()
