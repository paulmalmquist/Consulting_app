"""The enforced human go/no-go gate — resume of a paused decision.

A REVIEW/NO_GO decision sits in ``pending_approval`` until a human resolves it. Three paths:
  * approve / reject       -> final; signs an Ed25519 hash-chained receipt (signing.sign_decision).
  * request_more_evidence  -> hold; records the requested evidence, keeps the decision open, NO receipt.

The UPDATE is guarded on the open states so two concurrent resolves can't both win (the loser sees 0
rows updated and is told the decision is no longer open).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.services.control_tower import runner, signing

VALID_DECISIONS = ("approve", "reject", "request_more_evidence")
_FINAL_STATUS = {"approve": "approved", "reject": "rejected"}


def resolve(
    *,
    env_id: str,
    business_id: str | UUID,
    decision_id: str,
    human_decision: str,
    resolved_by: str,
    rationale: str | None = None,
    requested_evidence: str | None = None,
) -> dict:
    """Resolve an open gate. Returns ``{"decision": <row>, "receipt": <row|None>}``.

    Raises ``ValueError`` for an unknown decision verb, ``LookupError`` if the decision doesn't exist,
    and ``ValueError`` if it is no longer open.
    """
    if human_decision not in VALID_DECISIONS:
        raise ValueError(f"human_decision must be one of {VALID_DECISIONS}, got '{human_decision}'")
    business_id = str(business_id)

    # Load + validate (read-only).
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM tel_ct_decision WHERE id = %s AND env_id = %s AND business_id = %s",
            (decision_id, env_id, business_id),
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError("decision not found")
    if row["status"] not in runner.OPEN_STATES:
        raise ValueError(f"decision is not open (status={row['status']})")

    if human_decision == "request_more_evidence":
        with get_cursor() as cur:
            cur.execute(
                """UPDATE tel_ct_decision
                      SET status = 'needs_more_evidence',
                          human_decision = %s, human_rationale = %s, requested_evidence = %s
                    WHERE id = %s AND env_id = %s AND business_id = %s AND status = ANY(%s)
                    RETURNING *""",
                (human_decision, rationale, requested_evidence,
                 decision_id, env_id, business_id, list(runner.OPEN_STATES)),
            )
            updated = cur.fetchone()
        if updated is None:
            raise ValueError("decision is no longer open")
        return {"decision": runner._serialize(updated), "receipt": None}

    # approve / reject — sign a receipt, then mark the decision resolved.
    resolved_at = datetime.now(timezone.utc)
    receipt = signing.sign_decision(
        env_id=env_id,
        business_id=business_id,
        decision_id=decision_id,
        run_key=row["run_key"],
        channel_name=row["channel_name"],
        verdict=row["verdict"],
        anomaly_score=row["anomaly_score"],
        threshold=row["threshold"],
        dispatch_provider=row["dispatch_provider"],
        dispatch_model=row["dispatch_model"],
        routing_reason=row["routing_reason"],
        dispatch_request_id=row["dispatch_request_id"],
        human_decision=human_decision,
        human_rationale=rationale,
        resolved_by=resolved_by,
        cost_estimate_usd=row.get("triage_cost_usd"),
        resolved_at_iso=resolved_at.isoformat(),
    )

    with get_cursor() as cur:
        cur.execute(
            """UPDATE tel_ct_decision
                  SET status = %s, human_decision = %s, human_rationale = %s,
                      resolved_by = %s, resolved_at = %s, signed_receipt_id = %s
                WHERE id = %s AND env_id = %s AND business_id = %s AND status = ANY(%s)
                RETURNING *""",
            (_FINAL_STATUS[human_decision], human_decision, rationale,
             resolved_by, resolved_at, receipt["id"],
             decision_id, env_id, business_id, list(runner.OPEN_STATES)),
        )
        updated = cur.fetchone()
    if updated is None:
        # Lost a race after the receipt was written — surface honestly (the receipt is harmless/orphan).
        raise ValueError("decision is no longer open (resolved concurrently); a receipt was written")
    return {"decision": runner._serialize(updated), "receipt": receipt}
