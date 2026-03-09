from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

try:
    import numpy as np
    from sklearn.linear_model import LogisticRegression, Ridge
except Exception:  # pragma: no cover - deterministic fallback if sklearn is absent
    np = None
    LogisticRegression = None
    Ridge = None

from app.connectors.opportunity import load_market_signal_rows
from app.connectors.opportunity.base import THEME_CATALOG
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import re_deal_scoring

MODEL_VERSION = "opportunity_engine_v1"
DEFAULT_BUSINESS_LINES = ("consulting", "pds", "re_investment", "market_intel")
CONSULTING_HISTORY_THRESHOLD = 30
PDS_HISTORY_THRESHOLD = 50
RE_HISTORY_THRESHOLD = 20


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_str(value: UUID | str | None) -> str | None:
    if value is None:
        return None
    return str(value)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _log1p_metric(value: Any, scale: float = 1.0) -> float:
    return math.log1p(max(_safe_float(value), 0.0) / max(scale, 1e-6))


def _ordinal(value: str | None, mapping: dict[str, float], default: float = 0.0) -> float:
    if not value:
        return default
    return mapping.get(value, default)


def _hash_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _table_exists(table_name: str) -> bool:
    schema_name, bare_table = ("public", table_name)
    if "." in table_name:
        schema_name, bare_table = table_name.split(".", 1)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = %s
              AND table_name = %s
            """,
            (schema_name, bare_table),
        )
        return bool(cur.fetchone())


def _ensure_run_insert(
    *,
    run_id: UUID,
    env_id: UUID,
    business_id: UUID,
    run_type: str,
    mode: str,
    business_lines: list[str],
    triggered_by: str | None,
    input_hash: str,
    parameters_json: dict[str, Any],
    started_at: datetime,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO model_runs (
              run_id, env_id, business_id, run_type, mode, model_version, status,
              business_lines, triggered_by, input_hash, parameters_json, started_at, created_at, updated_at
            )
            VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, 'running', %s, %s, %s, %s::jsonb, %s, %s, %s)
            """,
            (
                str(run_id),
                str(env_id),
                str(business_id),
                run_type,
                mode,
                MODEL_VERSION,
                business_lines,
                triggered_by,
                input_hash,
                json.dumps(parameters_json),
                started_at,
                started_at,
                started_at,
            ),
        )


def _finish_run(
    *,
    run_id: UUID,
    status: str,
    metrics_json: dict[str, Any],
    error_summary: str | None = None,
) -> dict[str, Any]:
    finished_at = _utcnow()
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE model_runs
            SET status = %s,
                metrics_json = %s::jsonb,
                error_summary = %s,
                finished_at = %s,
                updated_at = %s
            WHERE run_id = %s::uuid
            """,
            (status, json.dumps(metrics_json), error_summary, finished_at, finished_at, str(run_id)),
        )
    return {
        "run_id": run_id,
        "status": status,
        "model_version": MODEL_VERSION,
        "metrics_json": metrics_json,
        "error_summary": error_summary,
        "finished_at": finished_at,
    }


def _latest_run_id(*, env_id: UUID, business_id: UUID, status: str | None = "success") -> str | None:
    conditions = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [str(env_id), str(business_id)]
    if status:
        conditions.append("status = %s")
        params.append(status)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT run_id::text AS run_id
            FROM model_runs
            WHERE {' AND '.join(conditions)}
            ORDER BY started_at DESC
            LIMIT 1
            """,
            tuple(params),
        )
        row = cur.fetchone()
    return row["run_id"] if row else None


def _market_feature_map(signals: list[dict[str, Any]]) -> dict[str, float]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for signal in signals:
        grouped[signal["canonical_topic"]].append(_safe_float(signal.get("probability"), 0.5))
    feature_map = {topic: round(sum(values) / len(values), 4) for topic, values in grouped.items()}
    feature_map["macro_tailwind"] = round(
        (
            feature_map.get("rates_easing", 0.5)
            + feature_map.get("inflation_cooling", 0.5)
            + (1 - feature_map.get("labor_tightness", 0.5))
        ) / 3,
        4,
    )
    return feature_map


def _explain_with_weights(
    *,
    feature_names: list[str],
    feature_values: list[float],
    weights: list[float],
    label_map: dict[str, str] | None = None,
    top_n: int = 4,
) -> list[dict[str, Any]]:
    drivers = []
    for index, name in enumerate(feature_names):
        contribution = feature_values[index] * weights[index]
        drivers.append(
            {
                "driver_key": name,
                "driver_label": label_map.get(name, name.replace("_", " ").title()) if label_map else name.replace("_", " ").title(),
                "driver_value": round(feature_values[index], 6),
                "contribution_score": round(contribution, 6),
            }
        )
    drivers.sort(key=lambda item: abs(item["contribution_score"]), reverse=True)
    return drivers[:top_n]


def _probability_to_score(probability: float, value_hint: float = 0.0) -> float:
    value_boost = 0.0 if value_hint <= 0 else min(math.log1p(value_hint) / 12, 0.25)
    return round(100 * _clamp((probability * 0.75) + value_boost), 4)


def _persist_market_signals(
    *,
    run_id: UUID,
    env_id: UUID,
    business_id: UUID,
    mode: str,
    as_of_date: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    raw_rows, connector_stats = load_market_signal_rows(
        run_id=str(run_id),
        mode=mode,
        as_of_date=as_of_date,
    )
    persisted: list[dict[str, Any]] = []
    forecast_rows: list[dict[str, Any]] = []
    observed_at_default = datetime.combine(as_of_date, datetime.min.time(), tzinfo=timezone.utc)

    with get_cursor() as cur:
        for row in raw_rows:
            market_signal_id = uuid4()
            probability = _safe_float(row.get("probability"), 0.5)
            signal_strength = round(abs(probability - 0.5) * 2, 6)
            observed_at = row.get("observed_at") or observed_at_default
            cur.execute(
                """
                INSERT INTO market_signals (
                  market_signal_id, run_id, env_id, business_id, signal_source, source_market_id,
                  signal_key, signal_name, canonical_topic, business_line, sector, geography,
                  signal_direction, probability, signal_strength, confidence, observed_at,
                  metadata_json, explanation_json, created_at
                )
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, 'market_intel',
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
                """,
                (
                    str(market_signal_id),
                    str(run_id),
                    str(env_id),
                    str(business_id),
                    row["signal_source"],
                    row["source_market_id"],
                    row["signal_key"],
                    row["signal_name"],
                    row["canonical_topic"],
                    row.get("sector"),
                    row.get("geography"),
                    row.get("signal_direction"),
                    probability,
                    signal_strength,
                    _safe_float(row.get("confidence"), 0.6),
                    observed_at,
                    json.dumps(row.get("metadata_json", {})),
                    json.dumps(row.get("explanation_json", {})),
                    _utcnow(),
                ),
            )
            forecast_snapshot_id = uuid4()
            cur.execute(
                """
                INSERT INTO forecast_snapshots (
                  forecast_snapshot_id, run_id, env_id, business_id, business_line, forecast_key,
                  entity_type, entity_id, entity_key, signal_source, as_of_date, event_date,
                  probability, metadata_json, explanation_json, created_at
                )
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'market_intel', %s,
                        'signal_theme', NULL, %s, %s, %s, NULL, %s, %s::jsonb, %s::jsonb, %s)
                """,
                (
                    str(forecast_snapshot_id),
                    str(run_id),
                    str(env_id),
                    str(business_id),
                    row["canonical_topic"],
                    row["signal_key"],
                    row["signal_source"],
                    as_of_date,
                    probability,
                    json.dumps({"topic": row["canonical_topic"], "signal_source": row["signal_source"]}),
                    json.dumps(row.get("explanation_json", {})),
                    _utcnow(),
                ),
            )
            persisted_row = {
                **row,
                "market_signal_id": str(market_signal_id),
                "signal_strength": signal_strength,
            }
            persisted.append(persisted_row)
            forecast_rows.append(
                {
                    "forecast_snapshot_id": str(forecast_snapshot_id),
                    "business_line": "market_intel",
                    "forecast_key": row["canonical_topic"],
                    "entity_type": "signal_theme",
                    "entity_key": row["signal_key"],
                    "signal_source": row["signal_source"],
                    "probability": probability,
                    "as_of_date": as_of_date,
                }
            )
    return persisted, connector_stats, forecast_rows


def _fetch_consulting_rows(*, env_id: UUID, business_id: UUID, status_filter: list[str]) -> list[dict[str, Any]]:
    required = {
        "crm_opportunity",
        "crm_pipeline_stage",
        "crm_account",
        "cro_lead_profile",
        "cro_proposal",
        "cro_revenue_metrics_snapshot",
    }
    if not all(_table_exists(table) for table in required):
        return []

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              o.crm_opportunity_id::text AS entity_id,
              o.name AS title,
              coalesce(a.industry, lp.pain_category, 'consulting') AS sector,
              NULL::text AS geography,
              coalesce(lp.lead_score, 0) AS lead_score,
              coalesce(o.amount, 0) AS amount,
              coalesce(ps.win_probability, 0) AS stage_probability,
              coalesce(lp.estimated_budget, 0) AS estimated_budget,
              coalesce(prop.total_value, 0) AS proposal_value,
              coalesce(prop.margin_pct, 0) AS proposal_margin_pct,
              coalesce(hist.stage_changes, 0) AS stage_changes,
              coalesce(metrics.outreach_count_30d, 0) AS outreach_count_30d,
              coalesce(metrics.meetings_30d, 0) AS meetings_30d,
              coalesce(extract(day from (coalesce(o.actual_close_date, o.expected_close_date, current_date) - o.created_at::date)), 0) AS cycle_days,
              o.status,
              lp.ai_maturity,
              lp.company_size,
              lp.pain_category,
              coalesce(a.name, 'Account') AS account_name
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage ps ON ps.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            LEFT JOIN cro_lead_profile lp
              ON lp.crm_account_id = o.crm_account_id
             AND lp.env_id = %s
             AND lp.business_id = %s::uuid
            LEFT JOIN LATERAL (
              SELECT p.total_value, p.margin_pct
              FROM cro_proposal p
              WHERE p.crm_opportunity_id = o.crm_opportunity_id
                AND p.env_id = %s
                AND p.business_id = %s::uuid
              ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
              LIMIT 1
            ) prop ON true
            LEFT JOIN LATERAL (
              SELECT count(*) AS stage_changes
              FROM crm_opportunity_stage_history sh
              WHERE sh.crm_opportunity_id = o.crm_opportunity_id
            ) hist ON true
            LEFT JOIN LATERAL (
              SELECT outreach_count_30d, meetings_30d
              FROM cro_revenue_metrics_snapshot rms
              WHERE rms.env_id = %s
                AND rms.business_id = %s::uuid
              ORDER BY rms.snapshot_date DESC
              LIMIT 1
            ) metrics ON true
            WHERE o.business_id = %s::uuid
              AND o.status = ANY(%s)
            ORDER BY o.created_at DESC
            """,
            (
                str(env_id),
                str(business_id),
                str(env_id),
                str(business_id),
                str(env_id),
                str(business_id),
                str(business_id),
                status_filter,
            ),
        )
        return [dict(row) for row in cur.fetchall()]


def _consulting_feature_vector(row: dict[str, Any], market_map: dict[str, float]) -> tuple[list[str], list[float]]:
    names = [
        "lead_score",
        "amount_log",
        "stage_probability",
        "proposal_margin_pct",
        "estimated_budget_log",
        "stage_changes",
        "cycle_days",
        "ai_maturity",
        "company_size",
        "outreach_count_30d",
        "macro_tailwind",
        "construction_cost_pressure",
    ]
    values = [
        _safe_float(row.get("lead_score")) / 100,
        _log1p_metric(row.get("amount"), 1_000),
        _safe_float(row.get("stage_probability")),
        _safe_float(row.get("proposal_margin_pct")) / 100,
        _log1p_metric(row.get("estimated_budget"), 1_000),
        min(_safe_float(row.get("stage_changes")) / 10, 1.5),
        min(_safe_float(row.get("cycle_days")) / 180, 2.0),
        _ordinal(row.get("ai_maturity"), {"none": 0.0, "exploring": 0.25, "piloting": 0.5, "scaling": 0.75, "embedded": 1.0}),
        _ordinal(row.get("company_size"), {"1_10": 0.1, "10_50": 0.25, "50_200": 0.5, "200_1000": 0.75, "1000_plus": 1.0}),
        min(_safe_float(row.get("outreach_count_30d")) / 30, 1.5),
        market_map.get("macro_tailwind", 0.5),
        market_map.get("construction_cost_pressure", 0.5),
    ]
    return names, values


def score_consulting_rows(
    *,
    open_rows: list[dict[str, Any]],
    closed_rows: list[dict[str, Any]],
    market_map: dict[str, float],
    as_of_date: date,
) -> dict[str, Any]:
    if not open_rows:
        return {"scores": [], "recommendations": [], "metrics": {"sample_size": len(closed_rows), "mode": "empty"}}

    feature_names, _ = _consulting_feature_vector(open_rows[0], market_map)
    labels = [1 if str(row.get("status")).lower() == "won" else 0 for row in closed_rows]
    ml_ready = (
        len(closed_rows) >= CONSULTING_HISTORY_THRESHOLD
        and len(set(labels)) > 1
        and np is not None
        and LogisticRegression is not None
    )
    model = None
    coefficients: list[float] = []
    mode = "fallback_scorecard"

    if ml_ready:
        X = np.array([_consulting_feature_vector(row, market_map)[1] for row in closed_rows], dtype=float)
        y = np.array(labels, dtype=int)
        model = LogisticRegression(max_iter=300, random_state=0, class_weight="balanced")
        model.fit(X, y)
        coefficients = [float(value) for value in model.coef_[0]]
        mode = "ml_logistic"
    else:
        coefficients = [0.26, 0.12, 0.22, 0.10, 0.06, 0.05, -0.08, 0.07, 0.04, 0.03, 0.08, -0.09]

    scored: list[dict[str, Any]] = []
    for row in open_rows:
        _, values = _consulting_feature_vector(row, market_map)
        if model is not None:
            probability = float(model.predict_proba(np.array([values], dtype=float))[0][1])
        else:
            weighted = sum(value * weight for value, weight in zip(values, coefficients, strict=True))
            probability = _clamp(0.35 + (weighted / 3.0))
        amount = _safe_float(row.get("amount"))
        score = _probability_to_score(probability, amount)
        drivers = _explain_with_weights(
            feature_names=feature_names,
            feature_values=values,
            weights=coefficients,
            top_n=4,
        )
        entity_key = str(row["entity_id"])
        priority = "high" if score >= 70 else ("medium" if score >= 50 else "low")
        linked_topics = ["macro_tailwind", "construction_cost_pressure"]
        scored.append(
            {
                "business_line": "consulting",
                "entity_type": "crm_opportunity",
                "entity_id": row["entity_id"],
                "entity_key": entity_key,
                "title": row["title"],
                "sector": row.get("sector"),
                "geography": row.get("geography"),
                "as_of_date": as_of_date,
                "score": score,
                "probability": round(probability, 6),
                "expected_value": round(probability * amount, 6),
                "fallback_mode": None if mode == "ml_logistic" else mode,
                "features_json": {"feature_names": feature_names, "feature_values": values},
                "drivers": drivers,
                "linked_topics": linked_topics,
                "recommendation": {
                    "recommendation_type": "pipeline_action",
                    "title": f"Advance {row['title']}",
                    "summary": f"{row.get('account_name', 'Account')} shows strong upside for a consulting push.",
                    "suggested_action": "Prepare proposal refinement and executive sponsor outreach.",
                    "action_owner": "consulting_operator",
                    "priority": priority,
                    "confidence": round(probability, 6),
                },
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    for index, row in enumerate(scored, start=1):
        row["rank_position"] = index
    return {
        "scores": scored,
        "recommendations": [row["recommendation"] | {"entity_key": row["entity_key"]} for row in scored[:10]],
        "metrics": {
            "sample_size": len(closed_rows),
            "mode": mode,
            "open_candidates": len(open_rows),
        },
    }


def _fetch_pds_current_rows(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    required = {"pds_project_health_snapshot", "pds_projects", "pds_markets", "pds_accounts", "pds_forecast_snapshot"}
    if not all(_table_exists(table) for table in required):
        return []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              ph.project_id::text AS entity_id,
              p.name AS title,
              p.sector,
              coalesce(m.market_name, a.account_name) AS geography,
              coalesce(ph.risk_score, 0) AS risk_score,
              coalesce(ph.schedule_slip_days, 0) AS schedule_slip_days,
              coalesce(ph.labor_overrun_pct, 0) AS labor_overrun_pct,
              coalesce(ph.claims_exposure, 0) AS claims_exposure,
              coalesce(ph.change_order_exposure, 0) AS change_order_exposure,
              coalesce(ph.closeout_aging_days, 0) AS closeout_aging_days,
              coalesce(ph.timecard_delinquent_count, 0) AS timecard_delinquent_count,
              coalesce(ph.permit_exposure, 0) AS permit_exposure,
              coalesce(ph.satisfaction_score, 0) AS satisfaction_score,
              coalesce(ph.fee_variance, 0) AS fee_variance,
              coalesce(ph.gaap_variance, 0) AS gaap_variance,
              coalesce(ph.ci_variance, 0) AS ci_variance,
              coalesce(fs.delta_value, 0) AS forecast_delta_value,
              ph.recommended_action,
              ph.severity
            FROM pds_project_health_snapshot ph
            JOIN pds_projects p ON p.project_id = ph.project_id
            LEFT JOIN pds_markets m ON m.market_id = p.market_id
            LEFT JOIN pds_accounts a ON a.account_id = p.account_id
            LEFT JOIN LATERAL (
              SELECT delta_value
              FROM pds_forecast_snapshot fs
              WHERE fs.env_id = ph.env_id
                AND fs.business_id = ph.business_id
                AND fs.entity_type = 'project'
                AND fs.entity_id = ph.project_id
              ORDER BY fs.snapshot_date DESC, fs.forecast_month DESC
              LIMIT 1
            ) fs ON true
            WHERE ph.env_id = %s::uuid
              AND ph.business_id = %s::uuid
              AND ph.snapshot_date = (
                SELECT max(snapshot_date)
                FROM pds_project_health_snapshot
                WHERE env_id = ph.env_id
                  AND business_id = ph.business_id
              )
            ORDER BY ph.risk_score DESC, ph.snapshot_date DESC
            """,
            (str(env_id), str(business_id)),
        )
        return [dict(row) for row in cur.fetchall()]


def _fetch_pds_training_rows(*, env_id: UUID, business_id: UUID) -> list[dict[str, Any]]:
    if not _table_exists("pds_project_health_snapshot"):
        return []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              project_id::text AS entity_id,
              coalesce(risk_score, 0) AS risk_score,
              coalesce(schedule_slip_days, 0) AS schedule_slip_days,
              coalesce(labor_overrun_pct, 0) AS labor_overrun_pct,
              coalesce(claims_exposure, 0) AS claims_exposure,
              coalesce(change_order_exposure, 0) AS change_order_exposure,
              coalesce(closeout_aging_days, 0) AS closeout_aging_days,
              coalesce(timecard_delinquent_count, 0) AS timecard_delinquent_count,
              coalesce(permit_exposure, 0) AS permit_exposure,
              coalesce(satisfaction_score, 0) AS satisfaction_score,
              coalesce(fee_variance, 0) AS fee_variance,
              coalesce(gaap_variance, 0) AS gaap_variance,
              coalesce(ci_variance, 0) AS ci_variance,
              coalesce(lead(risk_score) OVER (PARTITION BY project_id ORDER BY snapshot_date), risk_score) AS next_risk_score
            FROM pds_project_health_snapshot
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            ORDER BY project_id, snapshot_date
            """,
            (str(env_id), str(business_id)),
        )
        rows = [dict(row) for row in cur.fetchall()]
    for row in rows:
        row["improvement_label"] = max(_safe_float(row.get("risk_score")) - _safe_float(row.get("next_risk_score")), 0.0)
    return [row for row in rows if row["improvement_label"] > 0 or _safe_float(row.get("risk_score")) > 0]


def _pds_feature_vector(row: dict[str, Any], market_map: dict[str, float]) -> tuple[list[str], list[float]]:
    names = [
        "risk_score",
        "schedule_slip_days",
        "labor_overrun_pct",
        "claims_exposure_log",
        "change_order_exposure_log",
        "closeout_aging_days",
        "timecard_delinquent_count",
        "permit_exposure",
        "satisfaction_gap",
        "forecast_delta_log",
        "construction_cost_pressure",
        "labor_tightness",
    ]
    values = [
        _safe_float(row.get("risk_score")),
        min(_safe_float(row.get("schedule_slip_days")) / 60, 2.0),
        _safe_float(row.get("labor_overrun_pct")),
        _log1p_metric(row.get("claims_exposure"), 1_000),
        _log1p_metric(row.get("change_order_exposure"), 1_000),
        min(_safe_float(row.get("closeout_aging_days")) / 180, 2.0),
        min(_safe_float(row.get("timecard_delinquent_count")) / 20, 2.0),
        min(_safe_float(row.get("permit_exposure")) / 10, 2.0),
        max(0.0, 1 - _safe_float(row.get("satisfaction_score"))),
        _log1p_metric(abs(_safe_float(row.get("forecast_delta_value"))), 1_000),
        market_map.get("construction_cost_pressure", 0.5),
        market_map.get("labor_tightness", 0.5),
    ]
    return names, values


def score_pds_rows(
    *,
    current_rows: list[dict[str, Any]],
    historical_rows: list[dict[str, Any]],
    market_map: dict[str, float],
    as_of_date: date,
) -> dict[str, Any]:
    if not current_rows:
        return {"scores": [], "recommendations": [], "metrics": {"sample_size": len(historical_rows), "mode": "empty"}}

    feature_names, _ = _pds_feature_vector(current_rows[0], market_map)
    ml_ready = len(historical_rows) >= PDS_HISTORY_THRESHOLD and np is not None and Ridge is not None
    model = None
    coefficients: list[float] = []
    mode = "fallback_scorecard"

    if ml_ready:
        X = np.array([_pds_feature_vector(row, market_map)[1] for row in historical_rows], dtype=float)
        y = np.array([_safe_float(row.get("improvement_label")) for row in historical_rows], dtype=float)
        model = Ridge(alpha=1.0)
        model.fit(X, y)
        coefficients = [float(value) for value in model.coef_]
        mode = "ml_ridge"
    else:
        coefficients = [0.30, 0.16, 0.12, 0.12, 0.10, 0.08, 0.06, 0.05, 0.08, 0.06, 0.10, 0.07]

    scored: list[dict[str, Any]] = []
    for row in current_rows:
        _, values = _pds_feature_vector(row, market_map)
        current_pressure = _clamp(sum(value * weight for value, weight in zip(values, coefficients, strict=True)) / 3.5, 0.0, 1.0)
        predicted_improvement = 0.0
        if model is not None:
            predicted_improvement = max(float(model.predict(np.array([values], dtype=float))[0]), 0.0)
        improvement_component = _clamp(predicted_improvement / 5.0, 0.0, 1.0)
        score = round(100 * _clamp((current_pressure * 0.7) + (improvement_component * 0.3)), 4)
        probability = round(_clamp((score / 100) * 0.92), 6)
        exposure_value = _safe_float(row.get("claims_exposure")) + _safe_float(row.get("change_order_exposure"))
        drivers = _explain_with_weights(feature_names=feature_names, feature_values=values, weights=coefficients, top_n=4)
        suggested_action = row.get("recommended_action") or "Launch project recovery review and owner escalation."
        scored.append(
            {
                "business_line": "pds",
                "entity_type": "pds_project",
                "entity_id": row["entity_id"],
                "entity_key": row["entity_id"],
                "title": row["title"],
                "sector": row.get("sector"),
                "geography": row.get("geography"),
                "as_of_date": as_of_date,
                "score": score,
                "probability": probability,
                "expected_value": round(exposure_value * probability, 6),
                "fallback_mode": None if mode == "ml_ridge" else mode,
                "features_json": {"feature_names": feature_names, "feature_values": values},
                "drivers": drivers,
                "linked_topics": ["construction_cost_pressure", "labor_tightness"],
                "recommendation": {
                    "recommendation_type": "project_intervention",
                    "title": f"Intervene on {row['title']}",
                    "summary": "Project signals point to recoverable schedule and exposure pressure.",
                    "suggested_action": suggested_action,
                    "action_owner": "pds_operator",
                    "priority": "high" if score >= 70 or str(row.get("severity")).lower() == "red" else "medium",
                    "confidence": probability,
                },
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    for index, row in enumerate(scored, start=1):
        row["rank_position"] = index
    return {
        "scores": scored,
        "recommendations": [row["recommendation"] | {"entity_key": row["entity_key"]} for row in scored[:10]],
        "metrics": {
            "sample_size": len(historical_rows),
            "mode": mode,
            "current_candidates": len(current_rows),
        },
    }


def _fetch_re_rows(*, env_id: UUID) -> list[dict[str, Any]]:
    if not all(_table_exists(table) for table in ("re_pipeline_deal", "re_pipeline_property")):
        return []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              d.deal_id::text AS entity_id,
              d.deal_name AS title,
              d.status,
              coalesce(d.strategy, p.property_type, 'real_estate') AS sector,
              trim(both ', ' from concat_ws(', ', p.city, p.state)) AS geography,
              coalesce(d.target_irr, 0) AS target_irr,
              coalesce(d.target_moic, 0) AS target_moic,
              coalesce(d.headline_price, 0) AS headline_price,
              coalesce(p.occupancy, 0) AS occupancy,
              coalesce(p.asking_cap_rate, 0) AS asking_cap_rate,
              coalesce(p.property_type, d.property_type) AS property_type
            FROM re_pipeline_deal d
            LEFT JOIN re_pipeline_property p ON p.deal_id = d.deal_id
            WHERE d.env_id = %s::uuid
            ORDER BY d.created_at DESC
            """,
            (str(env_id),),
        )
        return [dict(row) for row in cur.fetchall()]


def _re_feature_vector(row: dict[str, Any], market_map: dict[str, float], composite_score: float) -> tuple[list[str], list[float]]:
    names = [
        "target_irr",
        "target_moic",
        "headline_price_log",
        "occupancy",
        "asking_cap_rate",
        "composite_score",
        "rates_easing",
        "housing_demand_sunbelt",
        "commercial_distress",
    ]
    values = [
        _safe_float(row.get("target_irr")),
        _safe_float(row.get("target_moic")) / 3,
        _log1p_metric(row.get("headline_price"), 10_000),
        _safe_float(row.get("occupancy")),
        _safe_float(row.get("asking_cap_rate")) * 10,
        composite_score / 100,
        market_map.get("rates_easing", 0.5),
        market_map.get("housing_demand_sunbelt", 0.5),
        market_map.get("commercial_distress", 0.5),
    ]
    return names, values


def score_re_rows(
    *,
    all_rows: list[dict[str, Any]],
    market_map: dict[str, float],
    as_of_date: date,
) -> dict[str, Any]:
    if not all_rows:
        return {"scores": [], "recommendations": [], "metrics": {"sample_size": 0, "mode": "empty"}}

    try:
        scored_lookup = {
            str(row["deal_id"]): row
            for row in re_deal_scoring.batch_score_deals(
                env_id=str(all_rows[0].get("env_id")) if all_rows and all_rows[0].get("env_id") else "",
                business_id="",
            )
        }
    except Exception:
        scored_lookup = {}

    open_rows = [row for row in all_rows if str(row.get("status")).lower() not in {"closed", "dead"}]
    closed_rows = [row for row in all_rows if str(row.get("status")).lower() in {"closed", "dead"}]
    labels = [1 if str(row.get("status")).lower() == "closed" else 0 for row in closed_rows]
    ml_ready = len(closed_rows) >= RE_HISTORY_THRESHOLD and len(set(labels)) > 1 and np is not None and LogisticRegression is not None
    model = None
    coefficients: list[float] = []
    mode = "fallback_scorecard"

    if open_rows:
        sample_lookup_key = open_rows[0]["entity_id"]
    else:
        sample_lookup_key = all_rows[0]["entity_id"]
    sample_composite = _safe_float(scored_lookup.get(str(sample_lookup_key), {}).get("composite_score"), 55.0)
    feature_names, _ = _re_feature_vector(all_rows[0], market_map, sample_composite)

    if ml_ready:
        X = []
        for row in closed_rows:
            composite_score = _safe_float(scored_lookup.get(str(row["entity_id"]), {}).get("composite_score"), 55.0)
            X.append(_re_feature_vector(row, market_map, composite_score)[1])
        y = np.array(labels, dtype=int)
        model = LogisticRegression(max_iter=250, random_state=0, class_weight="balanced")
        model.fit(np.array(X, dtype=float), y)
        coefficients = [float(value) for value in model.coef_[0]]
        mode = "ml_logistic"
    else:
        coefficients = [0.28, 0.14, 0.08, 0.12, 0.06, 0.24, 0.10, 0.10, -0.12]

    scored: list[dict[str, Any]] = []
    for row in open_rows:
        composite_score = _safe_float(scored_lookup.get(str(row["entity_id"]), {}).get("composite_score"), 55.0)
        _, values = _re_feature_vector(row, market_map, composite_score)
        if model is not None:
            probability = float(model.predict_proba(np.array([values], dtype=float))[0][1])
        else:
            weighted = sum(value * weight for value, weight in zip(values, coefficients, strict=True))
            probability = _clamp(0.32 + (weighted / 4.0))
        price = _safe_float(row.get("headline_price"))
        score = round(100 * _clamp((probability * 0.65) + ((composite_score / 100) * 0.35)), 4)
        drivers = _explain_with_weights(feature_names=feature_names, feature_values=values, weights=coefficients, top_n=4)
        scored.append(
            {
                "business_line": "re_investment",
                "entity_type": "re_pipeline_deal",
                "entity_id": row["entity_id"],
                "entity_key": row["entity_id"],
                "title": row["title"],
                "sector": row.get("sector"),
                "geography": row.get("geography"),
                "as_of_date": as_of_date,
                "score": score,
                "probability": round(probability, 6),
                "expected_value": round(price * probability * max(_safe_float(row.get("target_irr"), 0.08), 0.01), 6),
                "fallback_mode": None if mode == "ml_logistic" else mode,
                "features_json": {
                    "feature_names": feature_names,
                    "feature_values": values,
                    "composite_score": composite_score,
                },
                "drivers": drivers,
                "linked_topics": ["rates_easing", "housing_demand_sunbelt", "commercial_distress"],
                "recommendation": {
                    "recommendation_type": "deal_screen",
                    "title": f"Advance {row['title']} into deeper underwriting",
                    "summary": "Pipeline and market signals support a higher-priority underwriting pass.",
                    "suggested_action": "Refresh comps, debt sizing, and downside cases before IC prep.",
                    "action_owner": "re_analyst",
                    "priority": "high" if score >= 70 else "medium",
                    "confidence": round(probability, 6),
                },
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    for index, row in enumerate(scored, start=1):
        row["rank_position"] = index
    return {
        "scores": scored,
        "recommendations": [row["recommendation"] | {"entity_key": row["entity_key"]} for row in scored[:10]],
        "metrics": {
            "sample_size": len(closed_rows),
            "mode": mode,
            "open_candidates": len(open_rows),
        },
    }


def build_market_signal_recommendations(*, signals: list[dict[str, Any]], as_of_date: date) -> dict[str, Any]:
    scored: list[dict[str, Any]] = []
    actions = {
        "rates_easing": "Refresh debt and valuation scenarios for rate-sensitive deals.",
        "construction_cost_pressure": "Stress test PDS budgets and escalation clauses against cost inflation.",
        "labor_tightness": "Review staffing plans and PM bandwidth for high-risk projects.",
        "housing_demand_sunbelt": "Expand multifamily screens in Sun Belt migration markets.",
        "commercial_distress": "Research distressed office repositioning and rescue-capital screens.",
        "inflation_cooling": "Revisit margin assumptions for consulting and construction workstreams.",
        "storm_risk": "Flag coastal asset plans for insurance and capex review.",
    }
    for signal in sorted(signals, key=lambda item: item.get("signal_strength", 0), reverse=True)[:8]:
        topic = signal["canonical_topic"]
        score = round(_safe_float(signal.get("signal_strength")) * 100, 4)
        confidence = round(_safe_float(signal.get("probability"), 0.5), 6)
        drivers = [
            {
                "driver_key": topic,
                "driver_label": THEME_CATALOG.get(topic, {}).get("label", topic.replace("_", " ").title()),
                "driver_value": confidence,
                "contribution_score": round(_safe_float(signal.get("signal_strength")), 6),
            }
        ]
        scored.append(
            {
                "business_line": "market_intel",
                "entity_type": "signal_theme",
                "entity_id": None,
                "entity_key": signal["signal_key"],
                "title": THEME_CATALOG.get(topic, {}).get("label", signal["signal_name"]),
                "sector": signal.get("sector"),
                "geography": signal.get("geography"),
                "as_of_date": as_of_date,
                "score": score,
                "probability": confidence,
                "expected_value": None,
                "fallback_mode": "deterministic_signal_engine",
                "features_json": {"signal_key": signal["signal_key"], "signal_source": signal["signal_source"]},
                "drivers": drivers,
                "linked_topics": [topic],
                "recommendation": {
                    "recommendation_type": "research_project",
                    "title": f"Research: {THEME_CATALOG.get(topic, {}).get('label', topic)}",
                    "summary": signal["signal_name"],
                    "suggested_action": actions.get(topic, "Capture analyst notes and scenario implications."),
                    "action_owner": "market_analyst",
                    "priority": "high" if score >= 35 else "medium",
                    "confidence": confidence,
                },
            }
        )
    for index, row in enumerate(scored, start=1):
        row["rank_position"] = index
    return {
        "scores": scored,
        "recommendations": [row["recommendation"] | {"entity_key": row["entity_key"]} for row in scored],
        "metrics": {"sample_size": len(signals), "mode": "deterministic_signal_engine"},
    }


def _persist_scoring_bundle(
    *,
    run_id: UUID,
    env_id: UUID,
    business_id: UUID,
    bundle: dict[str, Any],
    signal_lookup: dict[str, list[dict[str, Any]]],
) -> tuple[int, int]:
    score_id_by_entity: dict[str, str] = {}
    inserted_scores = 0
    inserted_recommendations = 0
    now = _utcnow()
    with get_cursor() as cur:
        for row in bundle.get("scores", []):
            opportunity_score_id = str(uuid4())
            linked_signal_ids = [
                signal["market_signal_id"]
                for topic in row.get("linked_topics", [])
                for signal in signal_lookup.get(topic, [])
            ]
            explanation_json = {
                "top_drivers": row.get("drivers", []),
                "linked_topics": row.get("linked_topics", []),
                "linked_signal_ids": linked_signal_ids,
            }
            cur.execute(
                """
                INSERT INTO opportunity_scores (
                  opportunity_score_id, run_id, env_id, business_id, business_line, entity_type,
                  entity_id, entity_key, title, sector, geography, as_of_date, score, probability,
                  expected_value, rank_position, model_version, fallback_mode, features_json,
                  explanation_json, created_at
                )
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s::uuid, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
                """,
                (
                    opportunity_score_id,
                    str(run_id),
                    str(env_id),
                    str(business_id),
                    row["business_line"],
                    row["entity_type"],
                    row["entity_id"] if row.get("entity_id") else None,
                    row["entity_key"],
                    row["title"],
                    row.get("sector"),
                    row.get("geography"),
                    row["as_of_date"],
                    row["score"],
                    row.get("probability"),
                    row.get("expected_value"),
                    row.get("rank_position"),
                    MODEL_VERSION,
                    row.get("fallback_mode"),
                    json.dumps(row.get("features_json", {})),
                    json.dumps(explanation_json),
                    now,
                ),
            )
            score_id_by_entity[row["entity_key"]] = opportunity_score_id
            inserted_scores += 1

            probability = row.get("probability")
            if probability is not None:
                forecast_snapshot_id = str(uuid4())
                cur.execute(
                    """
                    INSERT INTO forecast_snapshots (
                      forecast_snapshot_id, run_id, env_id, business_id, business_line, forecast_key,
                      entity_type, entity_id, entity_key, signal_source, as_of_date,
                      probability, metadata_json, explanation_json, created_at
                    )
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s::uuid, %s,
                            'opportunity_engine', %s, %s, %s::jsonb, %s::jsonb, %s)
                    """,
                    (
                        forecast_snapshot_id,
                        str(run_id),
                        str(env_id),
                        str(business_id),
                        row["business_line"],
                        f"{row['business_line']}_probability",
                        row["entity_type"],
                        row["entity_id"] if row.get("entity_id") else None,
                        row["entity_key"],
                        row["as_of_date"],
                        probability,
                        json.dumps({"rank_position": row.get("rank_position")}),
                        json.dumps(explanation_json),
                        now,
                    ),
                )

            for rank, driver in enumerate(row.get("drivers", []), start=1):
                cur.execute(
                    """
                    INSERT INTO signal_explanations (
                      signal_explanation_id, run_id, opportunity_score_id, explanation_type,
                      driver_key, driver_label, driver_value, contribution_score,
                      rank_position, explanation_text, metadata_json, created_at
                    )
                    VALUES (%s::uuid, %s::uuid, %s::uuid, 'driver', %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        str(uuid4()),
                        str(run_id),
                        opportunity_score_id,
                        driver["driver_key"],
                        driver["driver_label"],
                        driver.get("driver_value"),
                        driver.get("contribution_score"),
                        rank,
                        f"{driver['driver_label']} contributed to the score.",
                        json.dumps({}),
                        now,
                    ),
                )

        for recommendation in bundle.get("recommendations", []):
            entity_key = recommendation["entity_key"]
            recommendation_id = str(uuid4())
            score_id = score_id_by_entity.get(entity_key)
            source_score = next((row for row in bundle.get("scores", []) if row["entity_key"] == entity_key), None)
            drivers = []
            if score_id:
                drivers = source_score.get("drivers", []) if source_score else []
                linked_topics = source_score.get("linked_topics", []) if source_score else []
            else:
                linked_topics = []
            linked_signal_ids = [
                signal["market_signal_id"]
                for topic in linked_topics
                for signal in signal_lookup.get(topic, [])
            ]
            cur.execute(
                """
                INSERT INTO project_recommendations (
                  recommendation_id, run_id, opportunity_score_id, env_id, business_id, business_line,
                  entity_type, entity_id, entity_key, recommendation_type, title, summary,
                  suggested_action, action_owner, priority, sector, geography, confidence, why_json,
                  driver_summary, created_at, updated_at
                )
                VALUES (
                  %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s,
                  %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                  %s::jsonb, %s, %s, %s
                )
                """,
                (
                    recommendation_id,
                    str(run_id),
                    score_id,
                    str(env_id),
                    str(business_id),
                    source_score["business_line"] if source_score else "market_intel",
                    source_score["entity_type"] if source_score else "signal_theme",
                    source_score.get("entity_id") if source_score and source_score.get("entity_id") else None,
                    entity_key,
                    recommendation["recommendation_type"],
                    recommendation["title"],
                    recommendation.get("summary"),
                    recommendation.get("suggested_action"),
                    recommendation.get("action_owner"),
                    recommendation.get("priority", "medium"),
                    source_score.get("sector") if source_score else None,
                    source_score.get("geography") if source_score else None,
                    recommendation.get("confidence", 0.5),
                    json.dumps({
                        "top_drivers": drivers,
                        "linked_topics": linked_topics,
                        "linked_signal_ids": linked_signal_ids,
                    }),
                    ", ".join(driver["driver_label"] for driver in drivers[:3]) if drivers else None,
                    now,
                    now,
                ),
            )
            inserted_recommendations += 1
            for rank, driver in enumerate(drivers, start=1):
                cur.execute(
                    """
                    INSERT INTO signal_explanations (
                      signal_explanation_id, run_id, recommendation_id, opportunity_score_id, explanation_type,
                      driver_key, driver_label, driver_value, contribution_score, rank_position,
                      explanation_text, metadata_json, created_at
                    )
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, 'recommendation_driver',
                            %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        str(uuid4()),
                        str(run_id),
                        recommendation_id,
                        score_id,
                        driver["driver_key"],
                        driver["driver_label"],
                        driver.get("driver_value"),
                        driver.get("contribution_score"),
                        rank,
                        f"{driver['driver_label']} is one of the strongest recommendation drivers.",
                        json.dumps({}),
                        now,
                    ),
                )
            for rank, signal_id in enumerate(linked_signal_ids, start=1):
                cur.execute(
                    """
                    INSERT INTO signal_explanations (
                      signal_explanation_id, run_id, recommendation_id, opportunity_score_id, market_signal_id,
                      explanation_type, driver_key, driver_label, rank_position, explanation_text,
                      metadata_json, created_at
                    )
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid, 'linked_signal',
                            %s, %s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        str(uuid4()),
                        str(run_id),
                        recommendation_id,
                        score_id,
                        signal_id,
                        f"signal_{rank}",
                        "Linked Market Signal",
                        rank,
                        "Prediction-market signal was linked into this recommendation.",
                        json.dumps({}),
                        now,
                    ),
                )
    return inserted_scores, inserted_recommendations


def create_run(
    *,
    env_id: UUID,
    business_id: UUID,
    mode: str = "fixture",
    run_type: str = "manual",
    business_lines: list[str] | None = None,
    triggered_by: str | None = None,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    selected_lines = [line for line in (business_lines or list(DEFAULT_BUSINESS_LINES)) if line in DEFAULT_BUSINESS_LINES]
    if not selected_lines:
        raise ValueError("At least one supported business line must be requested")

    run_id = uuid4()
    started_at = _utcnow()
    as_of_date = as_of_date or started_at.date()
    parameters_json = {
        "mode": mode,
        "run_type": run_type,
        "business_lines": selected_lines,
        "as_of_date": as_of_date.isoformat(),
    }
    input_hash = _hash_payload(
        {
            "env_id": str(env_id),
            "business_id": str(business_id),
            **parameters_json,
        }
    )
    _ensure_run_insert(
        run_id=run_id,
        env_id=env_id,
        business_id=business_id,
        run_type=run_type,
        mode=mode,
        business_lines=selected_lines,
        triggered_by=triggered_by,
        input_hash=input_hash,
        parameters_json=parameters_json,
        started_at=started_at,
    )

    metrics_json: dict[str, Any] = {
        "business_line_metrics": {},
        "connector_stats": [],
        "totals": {
            "signals": 0,
            "scores": 0,
            "recommendations": 0,
        },
    }

    try:
        signals, connector_stats, _forecast_rows = _persist_market_signals(
            run_id=run_id,
            env_id=env_id,
            business_id=business_id,
            mode=mode,
            as_of_date=as_of_date,
        )
        signal_lookup: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for signal in signals:
            signal_lookup[signal["canonical_topic"]].append(signal)
        market_map = _market_feature_map(signals)
        metrics_json["connector_stats"] = connector_stats
        metrics_json["totals"]["signals"] = len(signals)

        score_total = 0
        recommendation_total = 0

        if "consulting" in selected_lines:
            consulting_bundle = score_consulting_rows(
                open_rows=_fetch_consulting_rows(env_id=env_id, business_id=business_id, status_filter=["open"]),
                closed_rows=_fetch_consulting_rows(env_id=env_id, business_id=business_id, status_filter=["won", "lost"]),
                market_map=market_map,
                as_of_date=as_of_date,
            )
            inserted_scores, inserted_recommendations = _persist_scoring_bundle(
                run_id=run_id,
                env_id=env_id,
                business_id=business_id,
                bundle=consulting_bundle,
                signal_lookup=signal_lookup,
            )
            score_total += inserted_scores
            recommendation_total += inserted_recommendations
            metrics_json["business_line_metrics"]["consulting"] = consulting_bundle.get("metrics", {})

        if "pds" in selected_lines:
            pds_bundle = score_pds_rows(
                current_rows=_fetch_pds_current_rows(env_id=env_id, business_id=business_id),
                historical_rows=_fetch_pds_training_rows(env_id=env_id, business_id=business_id),
                market_map=market_map,
                as_of_date=as_of_date,
            )
            inserted_scores, inserted_recommendations = _persist_scoring_bundle(
                run_id=run_id,
                env_id=env_id,
                business_id=business_id,
                bundle=pds_bundle,
                signal_lookup=signal_lookup,
            )
            score_total += inserted_scores
            recommendation_total += inserted_recommendations
            metrics_json["business_line_metrics"]["pds"] = pds_bundle.get("metrics", {})

        if "re_investment" in selected_lines:
            re_rows = _fetch_re_rows(env_id=env_id)
            for row in re_rows:
                row["env_id"] = str(env_id)
            re_bundle = score_re_rows(
                all_rows=re_rows,
                market_map=market_map,
                as_of_date=as_of_date,
            )
            inserted_scores, inserted_recommendations = _persist_scoring_bundle(
                run_id=run_id,
                env_id=env_id,
                business_id=business_id,
                bundle=re_bundle,
                signal_lookup=signal_lookup,
            )
            score_total += inserted_scores
            recommendation_total += inserted_recommendations
            metrics_json["business_line_metrics"]["re_investment"] = re_bundle.get("metrics", {})

        if "market_intel" in selected_lines:
            market_bundle = build_market_signal_recommendations(signals=signals, as_of_date=as_of_date)
            inserted_scores, inserted_recommendations = _persist_scoring_bundle(
                run_id=run_id,
                env_id=env_id,
                business_id=business_id,
                bundle=market_bundle,
                signal_lookup=signal_lookup,
            )
            score_total += inserted_scores
            recommendation_total += inserted_recommendations
            metrics_json["business_line_metrics"]["market_intel"] = market_bundle.get("metrics", {})

        metrics_json["totals"]["scores"] = score_total
        metrics_json["totals"]["recommendations"] = recommendation_total
        emit_log(
            level="info",
            service="backend",
            action="opportunity_engine.run.complete",
            message="Opportunity Engine run completed",
            context={
                "run_id": str(run_id),
                "env_id": str(env_id),
                "business_id": str(business_id),
                "scores": score_total,
                "recommendations": recommendation_total,
            },
        )
        result = _finish_run(run_id=run_id, status="success", metrics_json=metrics_json)
    except Exception as exc:
        metrics_json["error"] = str(exc)
        _finish_run(run_id=run_id, status="failed", metrics_json=metrics_json, error_summary=str(exc))
        emit_log(
            level="error",
            service="backend",
            action="opportunity_engine.run.failed",
            message=str(exc),
            context={"run_id": str(run_id), "env_id": str(env_id), "business_id": str(business_id)},
            error=exc,
        )
        raise

    return {
        "run_id": str(run_id),
        "env_id": str(env_id),
        "business_id": str(business_id),
        "run_type": run_type,
        "mode": mode,
        "model_version": MODEL_VERSION,
        "status": result["status"],
        "business_lines": selected_lines,
        "triggered_by": triggered_by,
        "input_hash": input_hash,
        "parameters_json": parameters_json,
        "metrics_json": metrics_json,
        "error_summary": None,
        "started_at": started_at,
        "finished_at": result["finished_at"],
        "created_at": started_at,
        "updated_at": result["finished_at"],
    }


def list_runs(
    *,
    env_id: UUID,
    business_id: UUID,
    status: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    conditions = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [str(env_id), str(business_id)]
    if status:
        conditions.append("status = %s")
        params.append(status)
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT run_id::text AS run_id, env_id::text AS env_id, business_id::text AS business_id,
                   run_type, mode, model_version, status, business_lines, triggered_by, input_hash,
                   parameters_json, metrics_json, error_summary, started_at, finished_at, created_at, updated_at
            FROM model_runs
            WHERE {' AND '.join(conditions)}
            ORDER BY started_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]


def list_recommendations(
    *,
    env_id: UUID,
    business_id: UUID,
    business_line: str | None = None,
    sector: str | None = None,
    geography: str | None = None,
    as_of_date: date | None = None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    run_id = _latest_run_id(env_id=env_id, business_id=business_id)
    if not run_id:
        return []
    conditions = ["pr.run_id = %s::uuid", "pr.env_id = %s::uuid", "pr.business_id = %s::uuid"]
    params: list[Any] = [run_id, str(env_id), str(business_id)]
    if business_line:
        conditions.append("pr.business_line = %s")
        params.append(business_line)
    if sector:
        conditions.append("coalesce(pr.sector, '') ILIKE %s")
        params.append(f"%{sector}%")
    if geography:
        conditions.append("coalesce(pr.geography, '') ILIKE %s")
        params.append(f"%{geography}%")
    if as_of_date:
        conditions.append("os.as_of_date = %s")
        params.append(as_of_date)
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              pr.recommendation_id::text AS recommendation_id,
              pr.run_id::text AS run_id,
              pr.opportunity_score_id::text AS opportunity_score_id,
              pr.business_line,
              pr.entity_type,
              pr.entity_id::text AS entity_id,
              pr.entity_key,
              pr.recommendation_type,
              pr.title,
              pr.summary,
              pr.suggested_action,
              pr.action_owner,
              pr.priority,
              pr.sector,
              pr.geography,
              pr.confidence,
              pr.why_json,
              pr.driver_summary,
              pr.created_at,
              pr.updated_at,
              os.score,
              os.probability,
              os.expected_value,
              os.rank_position,
              os.model_version,
              os.fallback_mode
            FROM project_recommendations pr
            LEFT JOIN opportunity_scores os ON os.opportunity_score_id = pr.opportunity_score_id
            WHERE {' AND '.join(conditions)}
            ORDER BY coalesce(os.rank_position, 999), pr.created_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]


def get_recommendation_detail(
    *,
    recommendation_id: UUID,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              pr.recommendation_id::text AS recommendation_id,
              pr.run_id::text AS run_id,
              pr.opportunity_score_id::text AS opportunity_score_id,
              pr.business_line,
              pr.entity_type,
              pr.entity_id::text AS entity_id,
              pr.entity_key,
              pr.recommendation_type,
              pr.title,
              pr.summary,
              pr.suggested_action,
              pr.action_owner,
              pr.priority,
              pr.sector,
              pr.geography,
              pr.confidence,
              pr.why_json,
              pr.driver_summary,
              pr.created_at,
              pr.updated_at,
              os.score,
              os.probability,
              os.expected_value,
              os.rank_position,
              os.model_version,
              os.fallback_mode
            FROM project_recommendations pr
            LEFT JOIN opportunity_scores os ON os.opportunity_score_id = pr.opportunity_score_id
            WHERE pr.recommendation_id = %s::uuid
              AND pr.env_id = %s::uuid
              AND pr.business_id = %s::uuid
            """,
            (str(recommendation_id), str(env_id), str(business_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Recommendation {recommendation_id} not found")

        cur.execute(
            """
            SELECT driver_key, driver_label, driver_value, contribution_score, rank_position, explanation_text
            FROM signal_explanations
            WHERE recommendation_id = %s::uuid
            ORDER BY rank_position ASC, created_at ASC
            """,
            (str(recommendation_id),),
        )
        drivers = [dict(item) for item in cur.fetchall()]

        cur.execute(
            """
            SELECT as_of_date, score, probability
            FROM opportunity_scores
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND business_line = %s
              AND entity_type = %s
              AND entity_key = %s
            ORDER BY as_of_date ASC
            LIMIT 24
            """,
            (str(env_id), str(business_id), row["business_line"], row["entity_type"], row["entity_key"]),
        )
        history = [dict(item) for item in cur.fetchall()]

        linked_signal_ids = []
        why_json = row.get("why_json") or {}
        if isinstance(why_json, str):
            try:
                why_json = json.loads(why_json)
            except json.JSONDecodeError:
                why_json = {}
        linked_signal_ids = why_json.get("linked_signal_ids", [])
        linked_signals: list[dict[str, Any]] = []
        if linked_signal_ids:
            cur.execute(
                """
                SELECT market_signal_id::text AS market_signal_id, run_id::text AS run_id, signal_source,
                       source_market_id, signal_key, signal_name, canonical_topic, business_line, sector,
                       geography, signal_direction, probability, signal_strength, confidence, observed_at,
                       expires_at, metadata_json, explanation_json, created_at
                FROM market_signals
                WHERE market_signal_id = ANY(%s)
                ORDER BY observed_at DESC
                """,
                (linked_signal_ids,),
            )
            linked_signals = [dict(item) for item in cur.fetchall()]

    return {
        **dict(row),
        "drivers": drivers,
        "score_history": history,
        "linked_signals": linked_signals,
        "linked_forecasts": [],
    }


def list_signals(
    *,
    env_id: UUID,
    business_id: UUID,
    canonical_topic: str | None = None,
    geography: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    run_id = _latest_run_id(env_id=env_id, business_id=business_id)
    if not run_id:
        return []
    conditions = ["run_id = %s::uuid", "env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [run_id, str(env_id), str(business_id)]
    if canonical_topic:
        conditions.append("canonical_topic = %s")
        params.append(canonical_topic)
    if geography:
        conditions.append("coalesce(geography, '') ILIKE %s")
        params.append(f"%{geography}%")
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT market_signal_id::text AS market_signal_id, run_id::text AS run_id, signal_source,
                   source_market_id, signal_key, signal_name, canonical_topic, business_line, sector,
                   geography, signal_direction, probability, signal_strength, confidence, observed_at,
                   expires_at, metadata_json, explanation_json, created_at
            FROM market_signals
            WHERE {' AND '.join(conditions)}
            ORDER BY signal_strength DESC, observed_at DESC
            LIMIT %s
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]


def get_dashboard(
    *,
    env_id: UUID,
    business_id: UUID,
    business_line: str | None = None,
    sector: str | None = None,
    geography: str | None = None,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    runs = list_runs(env_id=env_id, business_id=business_id, limit=10)
    latest_run = next((run for run in runs if run["status"] == "success"), runs[0] if runs else None)
    recommendations = list_recommendations(
        env_id=env_id,
        business_id=business_id,
        business_line=business_line,
        sector=sector,
        geography=geography,
        as_of_date=as_of_date,
        limit=8,
    )
    signals = list_signals(env_id=env_id, business_id=business_id, geography=geography, limit=6)
    counts: dict[str, int] = defaultdict(int)
    for rec in recommendations:
        counts[rec["business_line"]] += 1
    return {
        "latest_run": latest_run,
        "recommendation_counts": counts,
        "top_recommendations": recommendations,
        "top_signals": signals,
        "run_history": runs,
    }
