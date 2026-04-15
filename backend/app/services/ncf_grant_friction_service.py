"""NCF Grant Friction service — reads from `ncf_grant_friction_prediction`.

Produced by the `ncf_grant_friction` MLflow model (Databricks), synced nightly
from `novendor_1.ncf_ml.gold_grant_friction_preds` into Supabase. This module
is the read path consumed by the FastAPI route and by the NCF Executive view.

This service is NOT an authoritative-state read — it surfaces a new governed
signal, not a released financial snapshot. It does not go through
`re_authoritative_snapshots` and does not interact with the authoritative-state
lockdown invariants.

Fail-closed contract:
    - missing row for a (env_id, grant_id) => GrantFrictionScore with
      risk_score=None, risk_band=None, null_reason='model_not_available'
    - never fabricate a score; the UI renders "Not available in current
      context" when null_reason is set
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any

from app.db import get_cursor


@dataclass
class GrantFrictionScore:
    grant_id: str
    risk_score: float | None
    risk_band: str | None
    top_drivers: list[dict[str, Any]] = field(default_factory=list)
    prediction_timestamp: str | None = None
    model_version: str | None = None
    calibration_brier: float | None = None
    confidence_note: str | None = None
    null_reason: str | None = None


@dataclass
class GrantFrictionSummary:
    env_id: str
    count_high: int
    count_watch: int
    count_low: int
    count_scored: int
    latest_prediction_at: str | None
    model_version: str | None


_SELECT_COLS = """
    grant_id, risk_score, risk_band, top_drivers,
    prediction_timestamp, model_version, calibration_brier,
    confidence_note, null_reason
"""


def _parse_drivers(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, (str, bytes, bytearray)):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, TypeError):
            return []
    return []


def _row_to_score(row: tuple) -> GrantFrictionScore:
    (
        grant_id, risk_score, risk_band, top_drivers,
        prediction_timestamp, model_version, calibration_brier,
        confidence_note, null_reason,
    ) = row
    return GrantFrictionScore(
        grant_id=str(grant_id),
        risk_score=float(risk_score) if risk_score is not None else None,
        risk_band=risk_band,
        top_drivers=_parse_drivers(top_drivers),
        prediction_timestamp=(
            prediction_timestamp.isoformat()
            if isinstance(prediction_timestamp, datetime)
            else prediction_timestamp
        ),
        model_version=model_version,
        calibration_brier=float(calibration_brier) if calibration_brier is not None else None,
        confidence_note=confidence_note,
        null_reason=null_reason,
    )


def get_grant_friction_score(env_id: str, grant_id: str) -> GrantFrictionScore:
    """Return the risk score for a single grant.

    Fail-closed: if no row exists, returns a GrantFrictionScore with
    null_reason='model_not_available'. Never fabricates a score.
    """
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_SELECT_COLS}
            FROM ncf_grant_friction_prediction
            WHERE env_id = %s::uuid AND grant_id = %s::uuid
            LIMIT 1
            """,
            (env_id, grant_id),
        )
        row = cur.fetchone()

    if row is None:
        return GrantFrictionScore(
            grant_id=grant_id,
            risk_score=None,
            risk_band=None,
            null_reason="model_not_available",
        )
    return _row_to_score(row)


def list_grants_at_risk(
    env_id: str,
    band: str | None = "high",
    limit: int = 50,
) -> list[GrantFrictionScore]:
    """List scored grants in the given band, highest risk first.

    `band=None` returns all scored grants (risk_band IS NOT NULL). Rows with
    null_reason set are excluded — they are not "at risk", they are unscored.
    """
    if band is not None and band not in ("low", "watch", "high"):
        raise ValueError(f"invalid band: {band!r}")

    filters = ["env_id = %s::uuid", "risk_band IS NOT NULL", "null_reason IS NULL"]
    params: list[Any] = [env_id]
    if band is not None:
        filters.append("risk_band = %s")
        params.append(band)
    params.append(int(limit))

    query = f"""
        SELECT {_SELECT_COLS}
        FROM ncf_grant_friction_prediction
        WHERE {' AND '.join(filters)}
        ORDER BY risk_score DESC NULLS LAST, prediction_timestamp DESC
        LIMIT %s
    """

    with get_cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [_row_to_score(r) for r in rows]


def get_summary(env_id: str) -> GrantFrictionSummary:
    """Aggregate counts per band + freshness for the Executive view KPI tile."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE risk_band = 'high')  AS n_high,
                COUNT(*) FILTER (WHERE risk_band = 'watch') AS n_watch,
                COUNT(*) FILTER (WHERE risk_band = 'low')   AS n_low,
                COUNT(*) FILTER (WHERE risk_band IS NOT NULL) AS n_scored,
                MAX(prediction_timestamp)                   AS latest_at,
                MAX(model_version)                          AS model_version
            FROM ncf_grant_friction_prediction
            WHERE env_id = %s::uuid AND null_reason IS NULL
            """,
            (env_id,),
        )
        row = cur.fetchone()

    if row is None:
        return GrantFrictionSummary(
            env_id=env_id,
            count_high=0, count_watch=0, count_low=0, count_scored=0,
            latest_prediction_at=None, model_version=None,
        )

    n_high, n_watch, n_low, n_scored, latest_at, model_version = row
    return GrantFrictionSummary(
        env_id=env_id,
        count_high=int(n_high or 0),
        count_watch=int(n_watch or 0),
        count_low=int(n_low or 0),
        count_scored=int(n_scored or 0),
        latest_prediction_at=latest_at.isoformat() if isinstance(latest_at, datetime) else None,
        model_version=model_version,
    )


def score_to_dict(score: GrantFrictionScore) -> dict[str, Any]:
    return asdict(score)
