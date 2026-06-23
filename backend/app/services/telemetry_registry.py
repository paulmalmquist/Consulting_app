"""Model Registry & Promotion Control console (RS Demo PR 2) — DISPLAY-ONLY serving read.

One payload for the registry page: every tel_model_runs row (champion + challengers, full metrics/gate
jsonb including the Track A honest_gate / affiliation / conformal keys), real PSI drift history from
tel_drift_metrics, and a lifecycle timeline derived from the rows themselves (created_at +
promotion_state + gate.decision). There are NO mutation routes — promotion is an alias update performed
through the governed Databricks flow (notebooks/promote_models.py), never from this console. Display-only
is enforced by API absence, not just disabled buttons.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_telemetry_cursor as get_cursor
from app.services.reporting_common import resolve_tenant_id


def _lifecycle_events(models: list[dict]) -> list[dict]:
    """Derive the registry timeline from real rows — never invented entries."""
    events: list[dict] = []
    for m in models:
        ts = m.get("created_at")
        gate = m.get("gate") or {}
        name_v = f"{m['model_name']} v{m.get('model_version') or '?'}"
        if m.get("promotion_state") == "promoted":
            over = gate.get("selected_over")
            text = f"{name_v} promoted to champion" + (f" · selected over {over}" if over else "")
        else:
            decision = gate.get("decision") or m.get("promotion_state") or "evaluated"
            text = f"{name_v} registered · {decision}"
        events.append({"ts": ts, "text": text, "model_kind": m.get("model_kind")})
    events.sort(key=lambda e: (e["ts"] is None, e["ts"]))
    return events


def registry_console(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """SELECT model_name, model_kind, model_version, model_alias, mlflow_run_id,
                      experiment_id, metrics, gate, promotion_state, created_at
               FROM tel_model_runs
               WHERE env_id = %s AND business_id = %s
               ORDER BY model_kind, created_at""",
            (env_id, str(business_id)))
        models = [dict(r) for r in cur.fetchall()]

        cur.execute(
            """SELECT model_name, metric_value, window_label, computed_at
               FROM tel_drift_metrics
               WHERE env_id = %s AND business_id = %s AND metric_name = 'psi'
               ORDER BY model_name, computed_at""",
            (env_id, str(business_id)))
        drift_rows = cur.fetchall()

    drift: dict[str, list[dict]] = {}
    for r in drift_rows:
        drift.setdefault(r["model_name"], []).append({
            "psi": float(r["metric_value"]) if r["metric_value"] is not None else None,
            "window_label": r["window_label"],
            "computed_at": r["computed_at"],
        })

    if not models:
        return {"models": [], "drift": {}, "lifecycle": [],
                "null_reason": "model_not_promoted"}

    return {
        "models": models,
        "drift": drift,
        "lifecycle": _lifecycle_events(models),
        "null_reason": None,
    }
