from __future__ import annotations

from datetime import date

import psycopg

from app.connectors.pds.base import BaseConnector, ConnectorContext, ConnectorResult
from app.db import get_cursor


class PdsMarketExternalConnector(BaseConnector):
    connector_key = "pds_market_external"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        records: list[dict] = []

        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT config_json
                    FROM pds_exec_integration_config
                    WHERE env_id = %s::uuid
                      AND business_id = %s::uuid
                      AND provider_key = 'pds_market_external'
                    LIMIT 1
                    """,
                    (str(context.env_id), str(context.business_id)),
                )
                cfg_row = cur.fetchone() or {}
        except psycopg.errors.UndefinedTable:
            cfg_row = {}

        config_json = cfg_row.get("config_json") if isinstance(cfg_row.get("config_json"), dict) else {}
        snapshots = config_json.get("snapshots") if isinstance(config_json.get("snapshots"), list) else []

        if snapshots:
            for entry in snapshots:
                records.append(
                    {
                        "record_type": "market_snapshot",
                        "as_of_date": entry.get("as_of_date") or date.today().isoformat(),
                        "interest_rate": str(entry.get("interest_rate") or "0"),
                        "steel_index": str(entry.get("steel_index") or "0"),
                        "lumber_index": str(entry.get("lumber_index") or "0"),
                        "labor_tightness": str(entry.get("labor_tightness") or "0"),
                        "source": entry.get("source") or "config",
                    }
                )
        else:
            records.append(
                {
                    "record_type": "market_snapshot",
                    "as_of_date": date.today().isoformat(),
                    "interest_rate": "5.25",
                    "steel_index": "118.4",
                    "lumber_index": "107.2",
                    "labor_tightness": "0.62",
                    "source": "default",
                }
            )

        return ConnectorResult(
            connector_key=self.connector_key,
            rows_read=len(records),
            rows_written=0,
            records=records,
            raw_artifact_path=f"pds-executive/raw/{self.connector_key}/{context.run_id}.json",
            metadata={"snapshot_count": len(records)},
        )


CONNECTOR = PdsMarketExternalConnector()
