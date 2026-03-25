from __future__ import annotations

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsInternalPortfolioConnector(BaseConnector):
    connector_key = "pds_internal_portfolio"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM pds_portfolio_snapshots
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND project_id IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(context.env_id), str(context.business_id)),
            )
            snapshot = cur.fetchone()
            if snapshot:
                records.append(
                    {
                        "record_type": "portfolio_snapshot",
                        "period": snapshot.get("period"),
                        "approved_budget": str(snapshot.get("approved_budget") or 0),
                        "eac": str(snapshot.get("eac") or 0),
                        "variance": str(snapshot.get("variance") or 0),
                        "top_risk_count": int(snapshot.get("top_risk_count") or 0),
                        "open_change_order_count": int(snapshot.get("open_change_order_count") or 0),
                        "pending_approval_count": int(snapshot.get("pending_approval_count") or 0),
                        "snapshot_hash": snapshot.get("snapshot_hash"),
                    }
                )

            cur.execute(
                """
                SELECT project_id, name, stage, status, project_manager,
                       approved_budget, forecast_at_completion, contingency_remaining,
                       pending_change_order_amount, next_milestone_date, risk_score
                FROM pds_projects
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                ORDER BY updated_at DESC
                LIMIT 200
                """,
                (str(context.env_id), str(context.business_id)),
            )
            project_rows = cur.fetchall()
            for row in project_rows:
                records.append(
                    {
                        "record_type": "project",
                        "project_id": str(row.get("project_id")),
                        "name": row.get("name"),
                        "stage": row.get("stage"),
                        "status": row.get("status"),
                        "project_manager": row.get("project_manager"),
                        "approved_budget": str(row.get("approved_budget") or 0),
                        "forecast_at_completion": str(row.get("forecast_at_completion") or 0),
                        "contingency_remaining": str(row.get("contingency_remaining") or 0),
                        "pending_change_order_amount": str(row.get("pending_change_order_amount") or 0),
                        "next_milestone_date": row.get("next_milestone_date"),
                        "risk_score": str(row.get("risk_score") or 0),
                    }
                )

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
        )


CONNECTOR = PdsInternalPortfolioConnector()
