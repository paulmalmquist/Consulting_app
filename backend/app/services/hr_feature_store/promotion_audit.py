"""C8-A — platform audit for promotion-candidate actions.

Supplements (never replaces) the C4 immutable per-candidate receipt with a row in
the platform `ai_decision_audit_log`, using the new `decision_type` value
`history_rhymes_promotion_candidate_action` (widened in migration 10022).

Adds NO authority: it records what the C4 service already did/refused. It logs
both successful and BLOCKED actions, stores stable hashes (not raw bodies), and is
best-effort — an audit-write failure surfaces as `audit_status="failed"` and never
turns an action into a silent unaudited success, and never alters the C6 result.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.hr_feature_store.promotion_receipts import stable_hash

DECISION_TYPE = "history_rhymes_promotion_candidate_action"
EVENT_TYPE = "promotion_candidate_action"
DOMAIN = "history_rhymes"

# history_rhymes is a single-tenant hr_* module with no business_id; the audit
# table requires business_id NOT NULL, so promotion audit rows use this stable,
# documented sentinel rather than a real tenant id.
# 'd00d' marks the HR-domain sentinel; the rest is zeros (valid hex, fixed value).
HR_AUDIT_BUSINESS_ID = UUID("00000000-0000-0000-0000-00000000d00d")


def build_audit_payload(
    *,
    action: str,
    candidate_id: str,
    actor: str | None,
    old_status: str | None,
    new_status: str | None,
    source_route: str,
    request_payload: dict[str, Any] | None,
    candidate: dict[str, Any] | None,
    blocked_reasons: list[str] | None = None,
    allowed_actions: list[str] | None = None,
) -> dict[str, Any]:
    """Pure: the safe-metadata audit payload (hashes, not raw bodies)."""
    receipt = (candidate or {}).get("promotion_receipt_json")
    return {
        "domain": DOMAIN,
        "event_type": EVENT_TYPE,
        "candidate_id": candidate_id,
        "action": action,
        "actor": actor,
        "old_status": old_status,
        "new_status": new_status,
        "blocked_reasons": blocked_reasons or [],
        "allowed_actions": allowed_actions or [],
        "request_payload_hash": stable_hash(request_payload or {}),
        "candidate_receipt_hash": stable_hash(receipt) if receipt else None,
        "created_episode_id": (candidate or {}).get("created_episode_id"),
        "source_route": source_route,
    }


def record_promotion_audit(payload: dict[str, Any], *, success: bool,
                           writer: Any = None) -> str:
    """Write the audit row. Returns audit_status: "ok" | "failed".

    `writer` lets tests inject a fake; default uses governance.record_decision
    (best-effort, never raises). A None return ⇒ "failed" (visible, not hidden)."""
    if writer is None:
        from app.services.governance import record_decision as writer  # lazy

    try:
        decision_id = writer(
            business_id=str(HR_AUDIT_BUSINESS_ID),
            actor=payload.get("actor") or "anonymous",
            decision_type=DECISION_TYPE,
            tool_name=payload.get("action"),
            input_summary={
                "candidate_id": payload["candidate_id"],
                "source_route": payload["source_route"],
                "request_payload_hash": payload["request_payload_hash"],
                "old_status": payload["old_status"],
                "blocked_reasons": payload["blocked_reasons"],
                "allowed_actions": payload["allowed_actions"],
            },
            output_summary={
                "new_status": payload["new_status"],
                "candidate_receipt_hash": payload["candidate_receipt_hash"],
                "created_episode_id": payload["created_episode_id"],
            },
            success=success,
            tags=[DOMAIN, EVENT_TYPE, payload["action"]],
        )
    except Exception:
        return "failed"
    return "ok" if decision_id else "failed"
