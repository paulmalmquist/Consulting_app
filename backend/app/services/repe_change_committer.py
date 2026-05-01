"""Transactional REPE change-set commit and rollback helpers."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from app.db import get_cursor
from psycopg.types.json import Json

APPROVAL_PATTERNS = ("approve and apply", "commit", "yes, push it")
FORBIDDEN_CANONICAL_TABLES = {
    "re_authoritative_fund_state_qtr",
    "re_authoritative_investment_state_qtr",
    "re_authoritative_asset_state_qtr",
}


def prompt_contains_explicit_approval(prompt: str) -> bool:
    lowered = prompt.lower()
    return any(pattern in lowered for pattern in APPROVAL_PATTERNS)


def _hash_row(row: Any) -> str:
    encoded = json.dumps(row, sort_keys=True, default=str, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def approve_change(*, change_set_id: str | UUID, approver_user_id: str | UUID | None, decision: str, comment: str | None = None) -> dict[str, Any]:
    if decision not in {"approved", "rejected"}:
        raise ValueError("decision must be approved or rejected")

    with get_cursor() as cur:
        cur.execute(
            "SELECT env_id, business_id FROM re_change_sets WHERE change_set_id = %s",
            (str(change_set_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Unknown change_set_id: {change_set_id}")

        cur.execute(
            """
            INSERT INTO re_change_approvals (
              env_id, business_id, change_set_id, approver_user_id, decision, comment
            ) VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (row["env_id"], row["business_id"], str(change_set_id), str(approver_user_id) if approver_user_id else None, decision, comment),
        )
        approval = cur.fetchone()
        next_status = "approved" if decision == "approved" else "rejected"
        cur.execute(
            "UPDATE re_change_sets SET status = %s, approved_by = %s, updated_at = now() WHERE change_set_id = %s",
            (next_status, str(approver_user_id) if approver_user_id else None, str(change_set_id)),
        )

    return {"change_set_id": str(change_set_id), "approval_id": str(approval["id"]), "status": next_status}


def commit_change(*, change_set_id: str | UUID, committed_by: str | UUID | None = None) -> dict[str, Any]:
    """Commit an approved staged change set and write an audit receipt.

    The current v1 committer only applies configured staging/draft target
    tables. Canonical tables remain guarded by DB triggers unless an explicit
    app.change_set_committing GUC is set in this transaction.
    """

    previous_hashes: list[dict[str, Any]] = []
    new_hashes: list[dict[str, Any]] = []
    rows_updated = 0

    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.change_set_committing', %s, true)", (str(change_set_id),))
        cur.execute(
            "SELECT * FROM re_change_sets WHERE change_set_id = %s",
            (str(change_set_id),),
        )
        change_set = cur.fetchone()
        if not change_set:
            raise LookupError(f"Unknown change_set_id: {change_set_id}")
        if change_set["status"] not in {"approved", "impact_computed", "validated"}:
            raise ValueError(f"Change set is not committable from status {change_set['status']}")

        if change_set["target_table"] in FORBIDDEN_CANONICAL_TABLES:
            raise PermissionError("forbidden_direct_write_canonical_table")

        cur.execute(
            "SELECT * FROM re_change_items WHERE change_set_id = %s ORDER BY created_at",
            (str(change_set_id),),
        )
        items = list(cur.fetchall())

        # v1 records an auditable receipt and marks committed. Physical apply is
        # intentionally narrow until target-table adapters are registered.
        for item in items:
            previous_hashes.append(
                {
                    "change_item_id": str(item["change_item_id"]),
                    "target_pk": item["target_pk"],
                    "target_column": item["target_column"],
                    "hash": _hash_row(item["old_value"]),
                }
            )
            new_hashes.append(
                {
                    "change_item_id": str(item["change_item_id"]),
                    "target_pk": item["target_pk"],
                    "target_column": item["target_column"],
                    "hash": _hash_row(item["new_value"]),
                }
            )

        cur.execute(
            """
            INSERT INTO re_change_audit_receipts (
              env_id, business_id, change_set_id, committed_by,
              previous_row_hashes, new_row_hashes, downstream_recalculation_ids
            ) VALUES (%s, %s, %s, %s, %s, %s, '[]'::jsonb)
            RETURNING id, rollback_token
            """,
            (
                change_set["env_id"],
                change_set["business_id"],
                str(change_set_id),
                str(committed_by) if committed_by else None,
                Json(previous_hashes),
                Json(new_hashes),
            ),
        )
        receipt = cur.fetchone()
        cur.execute(
            """
            UPDATE re_change_sets
            SET status = 'committed', committed_at = now(), updated_at = now()
            WHERE change_set_id = %s
            """,
            (str(change_set_id),),
        )

    return {
        "change_set_id": str(change_set_id),
        "status": "committed",
        "audit_receipt_id": str(receipt["id"]),
        "rollback_token": receipt["rollback_token"],
        "rows_updated": rows_updated,
    }


def rollback_change(*, change_set_id: str | UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM re_change_audit_receipts WHERE change_set_id = %s ORDER BY committed_at DESC LIMIT 1",
            (str(change_set_id),),
        )
        receipt = cur.fetchone()
        if not receipt:
            raise LookupError(f"No audit receipt for change_set_id: {change_set_id}")
        cur.execute(
            """
            UPDATE re_change_sets
            SET status = 'rolled_back', rolled_back_at = now(), updated_at = now()
            WHERE change_set_id = %s
            """,
            (str(change_set_id),),
        )

    return {"change_set_id": str(change_set_id), "status": "rolled_back", "audit_receipt_id": str(receipt["id"])}
