"""Durable store for ADE Ops approval escrow (PR 5A) — `ade_ops_approvals`.

Read-only-to-providers: this store persists approval *state*, never executes a
provider command. All rows are tenant-scoped by env_id + business_id. The table's
CHECK (executed = false) is the schema-level guard that PR 5A records no execution.
"""
from __future__ import annotations

import json

from app.db import get_cursor
from app.services.ade_ops.approvals import ApprovalRequest, ApprovalState, PreflightResult
from app.services.ade_ops.models import RiskTier

_COLS = (
    "id, env_id, business_id, recommendation_id, command_name, category, provider, "
    "target_ref, target_type, risk_tier, approval_token, state, requested_by, approver, "
    "approved_at, expires_at, rollback_plan, observation_window, preflight_passed, "
    "preflight_missing, executed, null_reason, evidence, created_at"
)


def insert(req: ApprovalRequest, *, env_id: str, business_id: str) -> str:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ade_ops_approvals
               (id, env_id, business_id, recommendation_id, command_name, category, provider,
                target_ref, target_type, risk_tier, approval_token, state, requested_by,
                expires_at, rollback_plan, observation_window, null_reason, evidence)
               VALUES (gen_random_uuid(), %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id""",
            (env_id, business_id, req.recommendation_id, req.command_name, req.category,
             req.provider, req.target_ref, req.target_type, int(req.risk_tier),
             req.approval_token, req.state.value, req.requested_by, req.expires_at,
             req.rollback_plan, req.observation_window, req.null_reason,
             json.dumps(req.evidence)),
        )
        return str(cur.fetchone()["id"])


def get(approval_id: str, *, env_id: str, business_id: str) -> ApprovalRequest | None:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM ade_ops_approvals "
            "WHERE id = %s AND env_id = %s AND business_id = %s",
            (approval_id, env_id, business_id))
        row = cur.fetchone()
    return _row_to_request(row) if row else None


def list_recent(*, env_id: str, business_id: str, limit: int = 50) -> list[ApprovalRequest]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM ade_ops_approvals "
            "WHERE env_id = %s AND business_id = %s ORDER BY created_at DESC LIMIT %s",
            (env_id, business_id, limit))
        rows = cur.fetchall()
    return [_row_to_request(r) for r in rows]


def update_state(req: ApprovalRequest, *, env_id: str, business_id: str) -> None:
    """Persist a state transition. Never sets executed=true (schema CHECK enforces)."""
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ade_ops_approvals
               SET state=%s, approver=%s, approved_at=%s, preflight_passed=%s,
                   preflight_missing=%s, null_reason=%s, updated_at=now()
               WHERE id=%s AND env_id=%s AND business_id=%s""",
            (req.state.value, req.approver, req.approved_at,
             bool(req.preflight and req.preflight.passed),
             json.dumps(req.preflight.missing if req.preflight else []),
             req.null_reason, req.approval_id, env_id, business_id))


def _row_to_request(row: dict) -> ApprovalRequest:
    pf = None
    if row.get("preflight_passed") is not None and (row.get("preflight_missing") is not None):
        missing = row["preflight_missing"]
        if isinstance(missing, str):
            missing = json.loads(missing)
        pf = PreflightResult(passed=bool(row["preflight_passed"]), missing=missing or [])
    ev = row.get("evidence") or []
    if isinstance(ev, str):
        ev = json.loads(ev)
    return ApprovalRequest(
        approval_id=str(row["id"]),
        recommendation_id=row["recommendation_id"],
        command_name=row["command_name"],
        category=row.get("category"),
        provider=row.get("provider"),
        target_ref=row.get("target_ref"),
        target_type=row.get("target_type"),
        risk_tier=RiskTier(row.get("risk_tier") or int(RiskTier.RECOMMENDATION)),
        approval_token=row["approval_token"],
        state=ApprovalState(row["state"]),
        requested_by=row.get("requested_by"),
        approver=row.get("approver"),
        approved_at=row["approved_at"].isoformat() if row.get("approved_at") else None,
        requested_at=(row["created_at"].isoformat() if row.get("created_at") else row["expires_at"].isoformat()),
        expires_at=row["expires_at"].isoformat(),
        rollback_plan=row.get("rollback_plan"),
        observation_window=row.get("observation_window"),
        evidence=ev,
        preflight=pf,
        executed=bool(row.get("executed")),
        null_reason=row.get("null_reason"),
    )
