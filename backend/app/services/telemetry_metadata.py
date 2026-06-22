"""Validated, telemetry-only metadata graph with bounded Postgres enrichment."""
from __future__ import annotations

import json
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID

from pydantic import ValidationError

from app.schemas.telemetry_metadata import (
    MetadataWarning,
    TelemetryMetadataCatalog,
    TelemetryMetadataEdge,
    TelemetryMetadataGraph,
    TelemetryMetadataNode,
    TelemetryMetadataStats,
)
from app.services.reporting_common import resolve_tenant_id


CATALOG_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "telemetry" / "metadata_catalog.json"
)

POSTGRES_ENRICHMENT_ALLOWLIST = frozenset({
    "tel_test_runs",
    "tel_telemetry_channels",
    "tel_model_runs",
    "tel_predictions",
    "tel_anomaly_events",
    "tel_drift_metrics",
    "tel_fused_state_vectors",
    "tel_feature_manifest",
    "tel_copilot_interactions",
    "tel_copilot_reports",
    "tel_stream_readings_bronze",
    "tel_stream_readings",
    "tel_stream_minute_agg",
    "tel_pipeline_status",
    "tel_dq_assertions",
    "tel_ncr_records",
    "tel_ncr_clusters",
    "tel_ncr_backlog_weekly",
})

# This is intentionally static. Catalog content never supplies SQL, identifiers, or clauses.
POSTGRES_ENRICHMENT_SQL = """
WITH scope AS (
    SELECT %s::text AS env_id, %s::uuid AS business_id
)
SELECT 'tel_test_runs' AS object_name, count(*)::bigint AS row_count,
       max(coalesce(t.ingest_at, t.created_at)) AS last_updated_at,
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END AS status
FROM tel_test_runs t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_telemetry_channels', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_telemetry_channels t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_model_runs', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_model_runs t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_predictions', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_predictions t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_anomaly_events', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_anomaly_events t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_drift_metrics', count(*)::bigint, max(t.computed_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_drift_metrics t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_fused_state_vectors', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_fused_state_vectors t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_feature_manifest', count(*)::bigint, NULL::timestamptz,
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_feature_manifest t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_copilot_interactions', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_copilot_interactions t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_copilot_reports', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_copilot_reports t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_stream_readings_bronze', count(*)::bigint, max(t.ts_ingest),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_stream_readings_bronze t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_stream_readings', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_stream_readings t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_stream_minute_agg', count(*)::bigint, max(t.updated_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_stream_minute_agg t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_pipeline_status', count(*)::bigint, max(t.as_of_ts),
       CASE
           WHEN count(*) = 0 THEN 'missing'
           WHEN bool_or(t.status = 'failed') THEN 'quarantined'
           WHEN bool_or(t.status = 'stale') THEN 'stale'
           ELSE 'fresh'
       END
FROM tel_pipeline_status t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_dq_assertions', count(*)::bigint, max(t.run_ts),
       CASE
           WHEN count(*) = 0 THEN 'missing'
           WHEN bool_or(t.passed = false) THEN 'quarantined'
           ELSE 'fresh'
       END
FROM tel_dq_assertions t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_ncr_records', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_ncr_records t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_ncr_clusters', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_ncr_clusters t, scope s WHERE t.env_id = s.env_id AND t.business_id = s.business_id
UNION ALL
SELECT 'tel_ncr_backlog_weekly', count(*)::bigint, max(t.created_at),
       CASE WHEN count(*) = 0 THEN 'missing' ELSE 'fresh' END
FROM tel_ncr_backlog_weekly t, scope s
WHERE t.env_id = s.env_id AND t.business_id = s.business_id
""".strip()

_SAFE_ID = re.compile(r"^[a-z][a-z0-9_.:-]{0,127}$")
_SAFE_OBJECT_NAME = re.compile(r"^[a-z][a-z0-9_]{0,127}$")
_ALLOWED_SCHEMAS = {
    "public",
    "novendor_1.telemetry",
    "novendor_1.rs_factory",
    "rs_factory_seed",
}
_DATABRICKS_PREFIXES = ("bronze_", "silver_", "gold_", "ncr_", "tel_")
_FACTORY_SEED_PREFIXES = ("bridge_", "data_quality_", "dim_", "fact_", "gold_", "raw_")
_FACTORY_ML_PREFIXES = ("bronze_", "gold_", "silver_")
_FORBIDDEN_KEYS = {
    "api_key",
    "connection_string",
    "credential",
    "credentials",
    "database_url",
    "password",
    "query",
    "raw_row",
    "raw_rows",
    "secret",
    "service_role",
    "service_role_key",
    "sql",
    "token",
}
_FORBIDDEN_VALUE_PATTERNS = (
    re.compile(r"postgres(?:ql)?://", re.IGNORECASE),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bdapi[a-zA-Z0-9]{20,}\b"),
)

_SOURCE_REFERENCES_BY_NODE: dict[str, list[str]] = {
    "stream_iss_live": ["backend/app/services/telemetry_stream_ingest.py"],
    "stream_adsb_fallback": ["backend/app/services/telemetry_stream_ingest.py"],
    "pg_stream_bronze": ["repo-b/db/schema/10015_telemetry_streaming_slice.sql"],
    "pg_stream_silver": ["repo-b/db/schema/10015_telemetry_streaming_slice.sql"],
    "pg_stream_gold": ["repo-b/db/schema/10015_telemetry_streaming_slice.sql"],
    "pg_predictions": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_anomaly_events": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_fused_vectors": ["repo-b/db/schema/10009_telemetry_fused_vectors.sql"],
    "pg_feature_manifest": ["repo-b/db/schema/10009_telemetry_fused_vectors.sql"],
    "pg_test_runs": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_channels": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_model_runs": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_drift_metrics": ["repo-b/db/schema/10006_telemetry_serving.sql"],
    "pg_copilot_interactions": ["repo-b/db/schema/10010_telemetry_copilot.sql"],
    "pg_copilot_reports": ["repo-b/db/schema/10011_telemetry_copilot_reports.sql"],
    "pg_pipeline_status": ["repo-b/db/schema/10015_telemetry_streaming_slice.sql"],
    "pg_dq_assertions": ["repo-b/db/schema/10015_telemetry_streaming_slice.sql"],
    "metric_anomaly_score": [
        "telemetry-platform/docs/honest_metrics_result.json",
        "backend/app/services/telemetry_serving.py",
    ],
    "metric_rul": ["telemetry-platform/databricks/notebooks/train_rul.py"],
    "metric_drift": ["backend/app/services/telemetry_serving.py"],
    "metric_stream_health": ["backend/app/services/telemetry_stream_etl.py"],
    "model_anomaly_champion": [
        "telemetry-platform/databricks/notebooks/train_anomaly.py",
        "telemetry-platform/docs/honest_metrics_result.json",
    ],
    "model_rul_champion": ["telemetry-platform/databricks/notebooks/train_rul.py"],
    "dashboard_operations": ["repo-b/src/components/telemetry/TelemetryShell.tsx"],
    "dashboard_models": ["repo-b/src/components/telemetry/ModelPerformance.tsx"],
    "dashboard_governance": ["repo-b/src/components/telemetry/GovernanceDashboard.tsx"],
    "dashboard_metadata": [
        "repo-b/src/components/telemetry/metadata/TelemetryMetadataExplorer.tsx"
    ],
    "report_test_anomaly": ["backend/app/services/telemetry_copilot.py"],
    "ai_test_intelligence": ["backend/app/services/telemetry_copilot.py"],
}

_PUBLIC_TABLE_METADATA: dict[str, dict[str, Any]] = {
    "tel_test_runs": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "run_key", "dataset", "unit_or_channel",
            "spacecraft", "row_count", "ingest_at", "status", "created_at",
        ],
    },
    "tel_telemetry_channels": {
        "primary_key": ["id"],
        "foreign_keys": {"run_id": "tel_test_runs.id"},
        "columns": [
            "env_id", "business_id", "run_id", "channel_name", "unit",
            "redline_low", "redline_high", "created_at",
        ],
    },
    "tel_model_runs": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "model_name", "model_kind", "model_version",
            "model_alias", "mlflow_run_id", "experiment_id", "metrics", "gate",
            "promotion_state", "created_at",
        ],
    },
    "tel_predictions": {
        "primary_key": ["id"],
        "foreign_keys": {"run_id": "tel_test_runs.id"},
        "columns": [
            "env_id", "business_id", "run_id", "channel_name", "window_start_t",
            "window_end_t", "anomaly_score", "threshold", "verdict", "null_reason",
            "model_name", "model_version", "mlflow_run_id", "created_at",
        ],
    },
    "tel_anomaly_events": {
        "primary_key": ["id"],
        "foreign_keys": {"run_id": "tel_test_runs.id"},
        "columns": [
            "env_id", "business_id", "run_id", "channel_name", "start_t", "end_t",
            "anomaly_class", "confidence", "source", "created_at",
        ],
    },
    "tel_drift_metrics": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "model_name", "metric_name", "metric_value",
            "window_label", "computed_at",
        ],
    },
    "tel_fused_state_vectors": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "vector_id", "dataset", "split", "window_index",
            "source_channels", "vector_dim", "label_any_anomaly", "created_at",
        ],
    },
    "tel_feature_manifest": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "feature_index", "chan_id", "feature_name",
            "source_table", "calc", "leakage_risk", "included",
        ],
    },
    "tel_copilot_interactions": {
        "primary_key": ["id"],
        "columns": [
            "request_id", "env_id", "business_id", "intent", "is_refusal",
            "null_reason", "answer_source", "prompt_version", "model",
            "evidence_count", "elapsed_ms", "created_at",
        ],
    },
    "tel_copilot_reports": {
        "primary_key": ["id"],
        "foreign_keys": {
            "run_id": "tel_test_runs.id",
            "receipt_id": "tel_predictions.id",
        },
        "columns": [
            "env_id", "business_id", "run_id", "run_key", "receipt_id", "verdict",
            "champion_model", "model_version", "prompt_version", "review_status",
            "null_reason", "created_at",
        ],
    },
    "tel_stream_readings_bronze": {
        "primary_key": ["id", "ts_ingest"],
        "columns": [
            "env_id", "business_id", "source", "channel_key", "ts_source",
            "ts_ingest", "value", "batch_id",
        ],
    },
    "tel_stream_readings": {
        "primary_key": ["id"],
        "foreign_keys": {"channel_id": "tel_telemetry_channels.id"},
        "columns": [
            "env_id", "business_id", "channel_id", "channel_name", "ts_source",
            "value", "quality_flag", "batch_id", "created_at",
        ],
    },
    "tel_stream_minute_agg": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "channel_id", "channel_name", "minute_start",
            "n", "v_min", "v_max", "v_avg", "anomaly_count", "restated_at",
            "restated_reason", "updated_at",
        ],
    },
    "tel_pipeline_status": {
        "primary_key": ["env_id", "surface"],
        "columns": ["env_id", "business_id", "surface", "status", "as_of_ts", "reason"],
    },
    "tel_dq_assertions": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "job_name", "table_name", "assertion_name",
            "passed", "observed", "threshold", "run_ts",
        ],
    },
    "tel_ncr_records": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "ncr_key", "defect_family", "workcell",
            "severity", "opened_at", "closed_at", "reopened", "cluster_id",
            "umap_x", "umap_y", "provenance", "batch_id", "created_at",
        ],
    },
    "tel_ncr_clusters": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "cluster_id", "label", "keywords", "exemplars",
            "n_records", "status", "trend", "median_ttc_days", "reopen_rate",
            "mlflow_run_id", "provenance", "batch_id", "created_at",
        ],
    },
    "tel_ncr_backlog_weekly": {
        "primary_key": ["id"],
        "columns": [
            "env_id", "business_id", "week_start", "kind", "opened", "closed",
            "backlog", "fc", "lo", "hi", "mlflow_run_id", "provenance",
            "batch_id", "created_at",
        ],
    },
}

_NODE_METADATA: dict[str, dict[str, Any]] = {
    "metric_anomaly_score": {
        "definition": "Share and severity of model-flagged telemetry windows.",
        "formula": "flagged windows / scored windows; verdict from score versus frozen threshold",
        "grain": "prediction window and rolling serving period",
        "source_table": "public.tel_predictions",
        "downstream_consumers": ["Telemetry Operations", "Test Intelligence Copilot"],
    },
    "metric_rul": {
        "definition": "Predicted remaining cycles for a held-out C-MAPSS unit.",
        "formula": "regressor output evaluated with RMSE and NASA PHM asymmetric score",
        "grain": "unit-cycle",
        "source_table": "novendor_1.telemetry.gold_cmapss_features",
        "downstream_consumers": ["Model Performance"],
    },
    "metric_drift": {
        "definition": "Population stability and rolling anomaly-rate monitoring.",
        "formula": "stored metric_value by model_name, metric_name, and window_label",
        "grain": "model monitoring window",
        "source_table": "public.tel_drift_metrics",
        "downstream_consumers": ["Monitoring", "Model Registry"],
    },
    "metric_stream_health": {
        "definition": "Freshness, ingest lag, throughput, watermark, and DQ assertion health.",
        "formula": "latest timestamps, rows/minute, lag percentiles, and failed assertion counts",
        "grain": "channel and pipeline surface",
        "source_table": "public.tel_stream_readings",
        "downstream_consumers": ["Mission Control"],
    },
    "model_anomaly_champion": {
        "model_version": "champion alias; concrete version mirrored in public.tel_model_runs",
        "training_data_window": "SMAP/MSL train split; blocked per-channel calibration tail",
        "input_tables": ["novendor_1.telemetry.gold_smap_msl_windows"],
        "features": [
            "value", "value_rmean50", "value_rstd50", "value_roc",
        ],
        "output_destination": "public.tel_predictions and public.tel_anomaly_events",
        "model_card": "Rolling-MAD K=4.0 with honest pointwise, event, and affiliation evaluation.",
        "eval_metrics": {
            "f1_pointwise": 0.312953,
            "event_recall": 0.769231,
            "alarm_precision": 0.3279,
            "affiliation_f1": 0.474634,
        },
        "downstream_operational_decision": "GO or NO_GO telemetry verdict",
    },
    "model_rul_champion": {
        "model_version": "champion alias; concrete version mirrored in public.tel_model_runs",
        "training_data_window": "C-MAPSS FD001 train units; held-out test units",
        "input_tables": ["novendor_1.telemetry.gold_cmapss_features"],
        "features": [
            "cycle", "sensor rolling means", "sensor rolling standard deviations",
            "sensor rates of change",
        ],
        "output_destination": "model performance and remaining-useful-life metric",
        "model_card": "Linear baseline and gradient-boosted regressor compared by RMSE and PHM score.",
        "eval_metrics": {"promotion_gate": "RMSE <= 35"},
        "downstream_operational_decision": "Maintenance horizon review",
    },
}


class MetadataCatalogError(RuntimeError):
    """The committed base catalog is invalid and must not be served."""


@contextmanager
def _get_cursor() -> Iterator[Any]:
    # Lazy import keeps the shared app.db.get_cursor test patch effective.
    from app.db import get_cursor

    with get_cursor() as cur:
        yield cur


def _scan_unsafe(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower().replace("-", "_")
            if normalized in _FORBIDDEN_KEYS:
                raise MetadataCatalogError("Unsafe metadata field in telemetry catalog.")
            _scan_unsafe(child)
        return
    if isinstance(value, list):
        for child in value:
            _scan_unsafe(child)
        return
    if isinstance(value, str):
        if any(pattern.search(value) for pattern in _FORBIDDEN_VALUE_PATTERNS):
            raise MetadataCatalogError("Sensitive value in telemetry catalog.")


def validate_catalog(raw: dict[str, Any]) -> TelemetryMetadataCatalog:
    """Validate safety, telemetry scope, uniqueness, and lineage integrity."""
    _scan_unsafe(raw)
    try:
        catalog = TelemetryMetadataCatalog.model_validate(raw)
    except ValidationError as exc:
        raise MetadataCatalogError("Telemetry catalog schema validation failed.") from exc

    node_ids: set[str] = set()
    object_keys: set[tuple[str, str]] = set()
    for node in catalog.nodes:
        if not _SAFE_ID.fullmatch(node.id):
            raise MetadataCatalogError("Telemetry catalog contains an invalid node id.")
        if node.id in node_ids:
            raise MetadataCatalogError("Telemetry catalog contains duplicate node ids.")
        node_ids.add(node.id)

        if bool(node.schema_name) != bool(node.object_name):
            raise MetadataCatalogError("Catalog objects require both schema and object_name.")
        if not node.schema_name:
            continue

        schema = node.schema_name.lower()
        if schema not in _ALLOWED_SCHEMAS:
            raise MetadataCatalogError("Catalog contains a non-telemetry schema.")
        if not _SAFE_OBJECT_NAME.fullmatch(node.object_name or ""):
            raise MetadataCatalogError("Catalog contains an unsafe object name.")
        if schema == "public" and not node.object_name.startswith("tel_"):
            raise MetadataCatalogError("Public catalog objects must use the telemetry prefix.")
        if schema == "novendor_1.telemetry" and not node.object_name.startswith(
            _DATABRICKS_PREFIXES
        ):
            raise MetadataCatalogError("Catalog contains a non-telemetry lakehouse object.")
        if schema == "novendor_1.rs_factory" and not node.object_name.startswith(
            _FACTORY_ML_PREFIXES
        ):
            raise MetadataCatalogError("Catalog contains a non-factory ML object.")
        if schema == "rs_factory_seed" and not node.object_name.startswith(
            _FACTORY_SEED_PREFIXES
        ):
            raise MetadataCatalogError("Catalog contains a non-factory seed object.")

        object_key = (schema, node.object_name.lower())
        if object_key in object_keys:
            raise MetadataCatalogError("Telemetry catalog contains duplicate object definitions.")
        object_keys.add(object_key)

    edge_ids: set[str] = set()
    edge_definitions: set[tuple[str, str, str]] = set()
    connected_node_ids: set[str] = set()
    for edge in catalog.edges:
        if not _SAFE_ID.fullmatch(edge.id):
            raise MetadataCatalogError("Telemetry catalog contains an invalid edge id.")
        if edge.id in edge_ids:
            raise MetadataCatalogError("Telemetry catalog contains duplicate edge ids.")
        edge_ids.add(edge.id)
        if edge.source not in node_ids or edge.target not in node_ids:
            raise MetadataCatalogError("Telemetry catalog contains dangling lineage.")
        if edge.source == edge.target:
            raise MetadataCatalogError("Telemetry catalog contains self-referential lineage.")
        edge_definition = (edge.source, edge.target, edge.relationship)
        if edge_definition in edge_definitions:
            raise MetadataCatalogError(
                "Telemetry catalog contains duplicate lineage definitions."
            )
        edge_definitions.add(edge_definition)
        connected_node_ids.update((edge.source, edge.target))

    if connected_node_ids != node_ids:
        raise MetadataCatalogError("Telemetry catalog contains unconnected nodes.")

    return catalog


def load_catalog(path: Path | None = None) -> TelemetryMetadataCatalog:
    catalog_path = path or CATALOG_PATH
    try:
        raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MetadataCatalogError("Telemetry catalog could not be loaded.") from exc
    if not isinstance(raw, dict):
        raise MetadataCatalogError("Telemetry catalog root must be an object.")
    return validate_catalog(raw)


def _public_nodes(catalog: TelemetryMetadataCatalog) -> list[TelemetryMetadataNode]:
    nodes: list[TelemetryMetadataNode] = []
    for catalog_node in catalog.nodes:
        node = TelemetryMetadataNode.model_validate(
            catalog_node.model_dump(exclude={"domain"})
        )
        metadata = {
            **_PUBLIC_TABLE_METADATA.get(node.object_name or "", {}),
            **_NODE_METADATA.get(node.id, {}),
            **node.metadata,
        }
        references = metadata.get("source_references")
        if not references:
            asset_path = metadata.get("asset_path")
            references = [asset_path] if asset_path else _SOURCE_REFERENCES_BY_NODE.get(node.id)
        if (
            not isinstance(references, list)
            or not references
            or not all(isinstance(ref, str) and ref.strip() for ref in references)
        ):
            raise MetadataCatalogError(
                "Telemetry catalog node is missing committed source references."
            )
        metadata["source_references"] = references
        node.metadata = metadata
        nodes.append(node)
    return nodes


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _apply_postgres_enrichment(
    nodes: list[TelemetryMetadataNode],
    *,
    env_id: str,
    business_id: UUID,
) -> list[MetadataWarning]:
    try:
        with _get_cursor() as cur:
            resolve_tenant_id(cur, business_id)
            cur.execute(POSTGRES_ENRICHMENT_SQL, (env_id, str(business_id)))
            rows = cur.fetchall()
    except Exception:  # noqa: BLE001 - sanitized partial response is the contract
        return [
            MetadataWarning(
                code="RUNTIME_ENRICHMENT_UNAVAILABLE",
                message="Optional telemetry metadata enrichment was unavailable.",
                severity="warning",
            )
        ]

    by_object: dict[str, dict[str, Any]] = {}
    for row in rows:
        object_name = str(row.get("object_name") or "")
        if object_name in POSTGRES_ENRICHMENT_ALLOWLIST:
            by_object[object_name] = dict(row)

    for node in nodes:
        if node.schema_name != "public" or node.object_name not in POSTGRES_ENRICHMENT_ALLOWLIST:
            continue
        row = by_object.get(node.object_name)
        if row is None:
            continue
        row_count = int(row.get("row_count") or 0)
        status = row.get("status")
        if status not in {"fresh", "stale", "missing", "quarantined", "unknown"}:
            status = "unknown"
        node.status = status
        node.metadata = {
            **node.metadata,
            "available": row_count > 0,
            "row_count": row_count,
            "last_updated_at": _iso(row.get("last_updated_at")),
            "enrichment": "postgres_allowlist",
        }
    return []


def derive_stats(
    nodes: list[TelemetryMetadataNode],
    edges: list[TelemetryMetadataEdge],
) -> TelemetryMetadataStats:
    def unavailable(node: TelemetryMetadataNode) -> bool:
        return (
            node.status in {"missing", "quarantined"}
            or node.metadata.get("available") is False
        )

    return TelemetryMetadataStats(
        source_count=sum(
            1 for node in nodes if node.layer == "source" or node.kind in {"source", "stream"}
        ),
        bronze_count=sum(1 for node in nodes if node.layer == "bronze"),
        silver_count=sum(1 for node in nodes if node.layer == "silver"),
        gold_count=sum(1 for node in nodes if node.layer == "gold"),
        metric_count=sum(1 for node in nodes if node.kind == "metric"),
        model_count=sum(1 for node in nodes if node.kind == "model"),
        dashboard_count=sum(1 for node in nodes if node.kind in {"dashboard", "report"}),
        edge_count=len(edges),
        unavailable_count=sum(1 for node in nodes if unavailable(node)),
    )


def build_metadata_graph(
    *,
    env_id: str,
    business_id: UUID,
    enrich_postgres: bool = True,
    catalog_path: Path | None = None,
) -> dict[str, Any]:
    catalog = load_catalog(catalog_path)
    nodes = _public_nodes(catalog)
    edges = [TelemetryMetadataEdge.model_validate(edge.model_dump()) for edge in catalog.edges]
    warnings: list[MetadataWarning] = []
    if enrich_postgres:
        warnings.extend(
            _apply_postgres_enrichment(
                nodes,
                env_id=env_id,
                business_id=business_id,
            )
        )

    graph = TelemetryMetadataGraph(
        generated_at=datetime.now(timezone.utc),
        env_id=env_id,
        environment=catalog.environment,
        status="partial" if warnings else "ok",
        warnings=warnings,
        nodes=nodes,
        edges=edges,
        stats=derive_stats(nodes, edges),
    )
    return graph.model_dump(mode="json", by_alias=True)


def get_metadata_graph(
    *,
    env_id: str,
    business_id: UUID,
) -> dict[str, Any]:
    return build_metadata_graph(env_id=env_id, business_id=business_id)
