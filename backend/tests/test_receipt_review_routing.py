"""Review queue routing — every unresolved condition produces a next_action."""
from __future__ import annotations

from uuid import uuid4

from app.services import receipt_review_queue


def test_new_review_item_inserts(fake_cursor):
    fake_cursor.push_result([])  # no existing open item
    new_id = uuid4()
    fake_cursor.push_result([{"id": new_id}])

    item_id = receipt_review_queue.build_review_item(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        reason="apple_ambiguous",
        next_action="Confirm the underlying vendor.",
    )
    assert item_id == str(new_id)


def test_idempotent_on_same_intake_reason(fake_cursor):
    existing_id = uuid4()
    fake_cursor.push_result([{"id": existing_id}])

    item_id = receipt_review_queue.build_review_item(
        env_id="env-1", business_id=str(uuid4()), intake_id=str(uuid4()),
        reason="apple_ambiguous",
        next_action="Confirm vendor.",
    )
    assert item_id == str(existing_id)


def test_resolve_review_item(fake_cursor):
    # UPDATE ... RETURNING id
    fake_cursor.push_result([{"id": uuid4()}])
    ok = receipt_review_queue.resolve_review_item(
        env_id="env-1", business_id=str(uuid4()), item_id=str(uuid4()),
    )
    assert ok is True


def test_defer_review_item_not_found(fake_cursor):
    fake_cursor.push_result([])  # RETURNING yields nothing
    ok = receipt_review_queue.defer_review_item(
        env_id="env-1", business_id=str(uuid4()), item_id=str(uuid4()),
    )
    assert ok is False
