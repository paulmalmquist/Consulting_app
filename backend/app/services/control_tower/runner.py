"""Go/No-Go orchestration — the LangGraph-free 'interrupt()' equivalent.

One run = score a telemetry window with the existing champion, then:
  * NOT_AVAILABLE -> persist a fail-closed decision (status='failed'); no gate, no triage.
  * GO            -> persist status='auto_pass'; no human review required.
  * REVIEW / NO_GO -> sensitivity-routed triage (routing.run_triage) + open an ENFORCED human gate
                      (status='pending_approval'); the run STOPS here and is resumed by approval.resolve.

Tenant scope is enforced in SQL (every query filters env_id + business_id), matching the tel_* pattern.
Abandoned gates are expired by a sweep (expire_stale), wired into the app lifespan.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.db import get_telemetry_cursor as get_cursor
from app.services import telemetry_serving
from app.services.control_tower import routing

DEFAULT_GATE_TTL_MINUTES = 1440  # abandoned pending_approval rows expire after 24h

# Open states a decision can be resolved from.
OPEN_STATES = ("pending_approval", "needs_more_evidence")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(row: dict) -> dict:
    out = dict(row)
    for k in ("id", "business_id", "tel_prediction_id", "signed_receipt_id"):
        if out.get(k) is not None:
            out[k] = str(out[k])
    for k in ("created_at", "resolved_at", "expires_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


_INSERT_COLS = (
    "env_id, business_id, run_key, channel_name, verdict, anomaly_score, threshold, "
    "tel_prediction_id, triage_summary, privacy, itar_tagged, dispatch_request_id, "
    "dispatch_provider, dispatch_model, dispatch_status, routing_reason, routing_rejected, "
    "status, expires_at, triage_cost_usd"
)


def _insert_decision(cur, **f) -> dict:
    cur.execute(
        f"""INSERT INTO tel_ct_decision ({_INSERT_COLS})
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)
            RETURNING *""",
        (
            f["env_id"], f["business_id"], f["run_key"], f["channel_name"], f["verdict"],
            f.get("anomaly_score"), f.get("threshold"), f.get("tel_prediction_id"),
            f.get("triage_summary"), f.get("privacy"), f.get("itar_tagged", False),
            f.get("dispatch_request_id"), f.get("dispatch_provider"), f.get("dispatch_model"),
            f.get("dispatch_status"), f.get("routing_reason"),
            json.dumps(f.get("routing_rejected") or {}), f["status"], f.get("expires_at"),
            f.get("triage_cost_usd"),
        ),
    )
    return _serialize(cur.fetchone())


def run_gonogo(
    *,
    env_id: str,
    business_id: str | UUID,
    run_key: str,
    channel_name: str,
    window: list[dict],
    itar_tagged: bool = False,
    execute_triage: bool = False,
    ttl_minutes: int = DEFAULT_GATE_TTL_MINUTES,
) -> dict:
    """Score a window and either auto-pass (GO), fail closed (NOT_AVAILABLE), or open a gate (REVIEW/NO_GO).

    Returns the persisted decision row (serialized). When a gate opens, status='pending_approval'.
    """
    business_id = str(business_id)
    score = telemetry_serving.score_window(
        env_id=env_id, business_id=business_id, run_key=run_key,
        channel_name=channel_name, window=window,
    )
    verdict = score.get("verdict")
    anomaly_score = score.get("anomaly_score")
    threshold = score.get("threshold")
    tel_prediction_id = score.get("receipt_id")

    with get_cursor() as cur:
        if verdict == "NOT_AVAILABLE":
            return _insert_decision(
                cur, env_id=env_id, business_id=business_id, run_key=run_key,
                channel_name=channel_name, verdict="NOT_AVAILABLE",
                anomaly_score=anomaly_score, threshold=threshold, tel_prediction_id=tel_prediction_id,
                routing_reason=f"score_unavailable: {score.get('null_reason')}",
                status="failed",
            )

        if verdict == "GO":
            return _insert_decision(
                cur, env_id=env_id, business_id=business_id, run_key=run_key,
                channel_name=channel_name, verdict="GO",
                anomaly_score=anomaly_score, threshold=threshold, tel_prediction_id=tel_prediction_id,
                routing_reason="verdict GO — within redline, no human review required",
                status="auto_pass",
            )

        # REVIEW or NO_GO → sensitivity-routed triage + enforced gate.
        triage = routing.run_triage(
            verdict=verdict, channel_name=channel_name, anomaly_score=anomaly_score,
            threshold=threshold, env_id=env_id, business_id=business_id,
            itar_tagged=itar_tagged, execute=execute_triage,
        )
        expires_at = _now() + timedelta(minutes=ttl_minutes)
        return _insert_decision(
            cur, env_id=env_id, business_id=business_id, run_key=run_key,
            channel_name=channel_name, verdict=verdict,
            anomaly_score=anomaly_score, threshold=threshold, tel_prediction_id=tel_prediction_id,
            triage_summary=triage.triage_summary, privacy=triage.privacy, itar_tagged=itar_tagged,
            dispatch_request_id=triage.dispatch_request_id, dispatch_provider=triage.selected_provider,
            dispatch_model=triage.selected_model, dispatch_status=triage.dispatch_status,
            routing_reason=triage.routing_reason, routing_rejected=triage.rejected,
            triage_cost_usd=triage.cost_estimate_usd,
            status="pending_approval", expires_at=expires_at,
        )


def get_decision(*, env_id: str, business_id: str | UUID, decision_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM tel_ct_decision WHERE id = %s AND env_id = %s AND business_id = %s",
            (decision_id, env_id, str(business_id)),
        )
        row = cur.fetchone()
        return _serialize(row) if row else None


def list_decisions(
    *, env_id: str, business_id: str | UUID, status: str | None = None, limit: int = 100,
) -> list[dict]:
    with get_cursor() as cur:
        if status:
            cur.execute(
                "SELECT * FROM tel_ct_decision WHERE env_id = %s AND business_id = %s AND status = %s "
                "ORDER BY created_at DESC LIMIT %s",
                (env_id, str(business_id), status, limit),
            )
        else:
            cur.execute(
                "SELECT * FROM tel_ct_decision WHERE env_id = %s AND business_id = %s "
                "ORDER BY created_at DESC LIMIT %s",
                (env_id, str(business_id), limit),
            )
        return [_serialize(r) for r in cur.fetchall()]


def expire_stale(*, now: datetime | None = None) -> int:
    """Mark abandoned pending_approval gates as expired. Returns the count expired. Used by the sweep."""
    now = now or _now()
    with get_cursor() as cur:
        cur.execute(
            "UPDATE tel_ct_decision SET status = 'expired' "
            "WHERE status = 'pending_approval' AND expires_at IS NOT NULL AND expires_at < %s",
            (now,),
        )
        return cur.rowcount or 0
