"""Idempotent loader for the gold model-observation table.

UPSERTs deterministic Phase A observations into
`hr_history_rhymes_model_observations` (idempotency key:
observation_id + as_of_date + model_obs_version). Preserves
source_quality/null_reason/provenance; NEVER coerces a missing value to zero
(None stays SQL NULL). Surfaces an unavailable DB/schema state clearly instead of
raising. No connectors, no external network.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .contract import MODEL_OBS_VERSION

logger = logging.getLogger(__name__)

_JSONB_FIELDS = (
    "features_raw", "features_normalized", "features_z_score_2y", "features_delta",
    "features_velocity", "features_acceleration", "staleness_seconds",
    "feature_family_coverage", "readiness_degrade_reasons", "lineage_json",
    "external_links_json", "provenance",
)

UPSERT_SQL = """
INSERT INTO public.hr_history_rhymes_model_observations (
    observation_id, as_of_date, model_obs_version,
    features_raw, features_normalized, features_z_score_2y, features_delta,
    features_velocity, features_acceleration, staleness_seconds,
    source_quality, null_reason, feature_family_coverage,
    feature_vector, text_embedding, narrative_text,
    forward_return_30d, risk_event_30d, theme, regime_label,
    is_crisis_anchor, is_non_event, model_readiness_score, readiness_degrade_reasons,
    lineage_json, external_links_json, provenance
) VALUES (
    %(observation_id)s, %(as_of_date)s, %(model_obs_version)s,
    %(features_raw)s::jsonb, %(features_normalized)s::jsonb, %(features_z_score_2y)s::jsonb, %(features_delta)s::jsonb,
    %(features_velocity)s::jsonb, %(features_acceleration)s::jsonb, %(staleness_seconds)s::jsonb,
    %(source_quality)s, %(null_reason)s, %(feature_family_coverage)s::jsonb,
    %(feature_vector)s::vector, %(text_embedding)s::vector, %(narrative_text)s,
    %(forward_return_30d)s, %(risk_event_30d)s, %(theme)s, %(regime_label)s,
    %(is_crisis_anchor)s, %(is_non_event)s, %(model_readiness_score)s, %(readiness_degrade_reasons)s::jsonb,
    %(lineage_json)s::jsonb, %(external_links_json)s::jsonb, %(provenance)s::jsonb
)
ON CONFLICT (observation_id, as_of_date, model_obs_version) DO UPDATE SET
    features_raw = EXCLUDED.features_raw,
    features_normalized = EXCLUDED.features_normalized,
    features_z_score_2y = EXCLUDED.features_z_score_2y,
    features_delta = EXCLUDED.features_delta,
    features_velocity = EXCLUDED.features_velocity,
    features_acceleration = EXCLUDED.features_acceleration,
    staleness_seconds = EXCLUDED.staleness_seconds,
    source_quality = EXCLUDED.source_quality,
    null_reason = EXCLUDED.null_reason,
    feature_family_coverage = EXCLUDED.feature_family_coverage,
    feature_vector = EXCLUDED.feature_vector,
    text_embedding = EXCLUDED.text_embedding,
    narrative_text = EXCLUDED.narrative_text,
    forward_return_30d = EXCLUDED.forward_return_30d,
    risk_event_30d = EXCLUDED.risk_event_30d,
    theme = EXCLUDED.theme,
    regime_label = EXCLUDED.regime_label,
    is_crisis_anchor = EXCLUDED.is_crisis_anchor,
    is_non_event = EXCLUDED.is_non_event,
    model_readiness_score = EXCLUDED.model_readiness_score,
    readiness_degrade_reasons = EXCLUDED.readiness_degrade_reasons,
    lineage_json = EXCLUDED.lineage_json,
    external_links_json = EXCLUDED.external_links_json,
    provenance = EXCLUDED.provenance,
    updated_at = now()
RETURNING (xmax = 0) AS inserted;
"""


def _vector_literal(vec: Any) -> str | None:
    if vec is None:
        return None
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def model_obs_to_params(obs: dict[str, Any]) -> dict[str, Any]:
    """Map a Phase A observation dict → SQL params. Missing values stay None (never 0)."""
    params: dict[str, Any] = {
        "observation_id": obs.get("observation_id"),
        "as_of_date": obs.get("as_of_date"),
        "model_obs_version": obs.get("model_obs_version", MODEL_OBS_VERSION),
        "source_quality": obs.get("source_quality", "synthetic"),
        "null_reason": obs.get("null_reason"),
        "feature_vector": _vector_literal(obs.get("feature_vector")),
        "text_embedding": _vector_literal(obs.get("text_embedding")),
        "narrative_text": obs.get("narrative_text"),
        "forward_return_30d": obs.get("forward_return_30d"),
        "risk_event_30d": obs.get("risk_event_30d"),
        "theme": obs.get("theme"),
        "regime_label": obs.get("regime_label"),
        "is_crisis_anchor": bool(obs.get("is_crisis_anchor", False)),
        "is_non_event": bool(obs.get("is_non_event", False)),
        "model_readiness_score": obs.get("model_readiness_score"),
    }
    for field in _JSONB_FIELDS:
        default: Any = [] if field in ("readiness_degrade_reasons", "external_links_json") else {}
        params[field] = json.dumps(obs.get(field, default))
    return params


SILVER_UPSERT_SQL = """
INSERT INTO public.hr_fs_readings (
    connector, series_key, ts_source, value, quality_flag, null_reason, source_quality, provenance
) VALUES (
    %(connector)s, %(series_key)s, %(ts_source)s, %(value)s, %(quality_flag)s,
    %(null_reason)s, %(source_quality)s, %(provenance)s::jsonb
)
ON CONFLICT (connector, series_key, ts_source) DO UPDATE SET
    value = EXCLUDED.value,
    quality_flag = EXCLUDED.quality_flag,
    null_reason = EXCLUDED.null_reason,
    source_quality = EXCLUDED.source_quality,
    provenance = EXCLUDED.provenance,
    updated_at = now()
RETURNING (xmax = 0) AS inserted;
"""

_STATUS_UPSERT_SQL = """
INSERT INTO public.hr_fs_pipeline_status (
    connector, surface, status, expected_cadence, as_of_ts, lag_seconds, reason, updated_at
) VALUES (
    %(connector)s, %(surface)s, %(status)s, %(expected_cadence)s, %(as_of_ts)s, %(lag_seconds)s, %(reason)s, now()
)
ON CONFLICT (connector, surface) DO UPDATE SET
    status = EXCLUDED.status,
    expected_cadence = EXCLUDED.expected_cadence,
    as_of_ts = EXCLUDED.as_of_ts,
    lag_seconds = EXCLUDED.lag_seconds,
    reason = EXCLUDED.reason,
    updated_at = now();
"""


def silver_reading_to_params(reading: dict[str, Any]) -> dict[str, Any]:
    """Map a normalized reading → silver SQL params. Missing value stays None (never 0)."""
    return {
        "connector": reading.get("connector"),
        "series_key": reading.get("series_key"),
        "ts_source": reading.get("ts_source"),
        "value": reading.get("value"),
        "quality_flag": reading.get("quality_flag", "ok"),
        "null_reason": reading.get("null_reason"),
        "source_quality": reading.get("source_quality", "fixture"),
        "provenance": json.dumps(reading.get("provenance", {})),
    }


def upsert_silver_readings(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Idempotent UPSERT of normalized readings into SILVER. Never raises on DB issues."""
    counts = {"inserted": 0, "updated": 0, "skipped": 0, "unavailable": 0}
    valid: list[dict[str, Any]] = []
    for r in rows:
        if not r.get("connector") or not r.get("series_key") or not r.get("ts_source"):
            counts["skipped"] += 1
        else:
            valid.append(r)
    if not valid:
        return counts
    try:
        from app.db import get_cursor  # lazy so tests can patch app.db.get_cursor

        with get_cursor() as cur:
            for r in valid:
                cur.execute(SILVER_UPSERT_SQL, silver_reading_to_params(r))
                row = cur.fetchone()
                inserted = bool(row["inserted"]) if row and "inserted" in row else True
                counts["inserted" if inserted else "updated"] += 1
    except Exception as exc:  # noqa: BLE001 — surface unavailable, never raise
        logger.warning("hr_feature_store silver upsert unavailable: %s", exc)
        counts["unavailable"] = len(valid) - (counts["inserted"] + counts["updated"])
    return counts


def update_pipeline_status(
    connector: str,
    surface: str,
    status: str,
    *,
    expected_cadence: str | None = None,
    as_of_ts: str | None = None,
    lag_seconds: float | None = None,
    reason: str | None = None,
) -> bool:
    """Fail-closed freshness write. Returns False if the DB is unavailable."""
    try:
        from app.db import get_cursor  # lazy

        with get_cursor() as cur:
            cur.execute(_STATUS_UPSERT_SQL, {
                "connector": connector, "surface": surface, "status": status,
                "expected_cadence": expected_cadence, "as_of_ts": as_of_ts,
                "lag_seconds": lag_seconds, "reason": reason,
            })
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("hr_feature_store pipeline status update unavailable: %s", exc)
        return False


def upsert_model_observations(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Idempotent UPSERT of gold rows. Returns counts; never raises on DB issues."""
    counts = {"inserted": 0, "updated": 0, "skipped": 0, "unavailable": 0}
    valid: list[dict[str, Any]] = []
    for r in rows:
        if not r.get("observation_id") or not r.get("as_of_date"):
            counts["skipped"] += 1
        else:
            valid.append(r)
    if not valid:
        return counts

    try:
        from app.db import get_cursor  # lazy so tests can patch app.db.get_cursor

        with get_cursor() as cur:
            for r in valid:
                cur.execute(UPSERT_SQL, model_obs_to_params(r))
                row = cur.fetchone()
                inserted = bool(row["inserted"]) if row and "inserted" in row else True
                counts["inserted" if inserted else "updated"] += 1
    except Exception as exc:  # noqa: BLE001 — surface unavailable, never raise
        logger.warning("hr_feature_store gold upsert unavailable: %s", exc)
        counts["unavailable"] = len(valid) - (counts["inserted"] + counts["updated"])
    return counts
