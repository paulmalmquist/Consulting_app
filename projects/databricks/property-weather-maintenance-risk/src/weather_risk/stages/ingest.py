"""Stage 01 — ingest public sources.

Local path: the local contract does not download public sources; this stage
records that NOAA/FEMA ingestion is configured-but-not-run.
Spark path: registers the configured public-source URLs in source_status.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..config import WeatherRiskConfig

# Public, free-to-use hazard data sources. Not HappyCo data.
PUBLIC_SOURCES = [
    {
        "source_name": "NOAA Storm Events",
        "source_url": "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/",
    },
    {
        "source_name": "FEMA National Risk Index",
        "source_url": "https://www.fema.gov/about/openfema/data-sets/national-risk-index-data",
    },
]


def run(config: WeatherRiskConfig, run_id: str) -> list[dict[str, Any]]:
    """Local ingest: emit the source_status rows the local contract reports."""
    return [
        {
            "run_id": run_id,
            "source_name": "synthetic_property_ops",
            "source_url": "local deterministic generator",
            "source_year": None,
            "status": "generated",
            "http_status": None,
            "downloaded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "bytes_downloaded": None,
            "rows_read": None,  # filled by runner once the dataset exists
            "error_message": None,
            "source_modified_hint": None,
        },
        {
            "run_id": run_id,
            "source_name": "NOAA/FEMA public source ingestion",
            "source_url": "configured for Databricks notebooks",
            "source_year": f"{config.start_year}-{config.end_year}",
            "status": "not_run_local_contract",
            "http_status": None,
            "downloaded_at": None,
            "bytes_downloaded": None,
            "rows_read": None,
            "error_message": "Local contract does not download public sources.",
            "source_modified_hint": None,
        },
    ]


def run_spark(spark, dbutils) -> list[dict[str, Any]]:  # pragma: no cover - Databricks runtime
    """Databricks ingest: register configured public sources in source_status."""
    run_id = dbutils.jobs.taskValues.get(taskKey="setup", key="run_id", default="manual-run")
    now = datetime.now(timezone.utc).isoformat()
    source_rows = [
        {
            "run_id": run_id,
            "source_name": source["source_name"],
            "status": "configured",
            "error_message": "",
            "source_url": source["source_url"],
            "downloaded_at": now,
        }
        for source in PUBLIC_SOURCES
    ]
    spark.createDataFrame(source_rows).write.mode("overwrite").option(
        "overwriteSchema", "true"
    ).saveAsTable("source_status")
    return source_rows
