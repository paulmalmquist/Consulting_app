"""Canonical receipt pipeline: ingest → extract → normalize → dedupe → detect
recurring → score review need → create occurrence/draft/review item.

The orchestrator is the single obvious default path. The 12 primitive MCP
tools remain for power users who want to run one stage at a time.
"""
from __future__ import annotations

from typing import Any

from app.services import (
    receipt_classification,
    receipt_intake,
    receipt_matching,
    receipt_review_queue,
    subscription_ledger,
)


class _Shim:
    pass


def process_intake(
    *,
    env_id: str,
    business_id: str,
    intake_id: str,
) -> dict[str, Any]:
    """Run the canonical chain for an existing intake. Safe to call repeatedly —
    every downstream step is idempotent (review items dedup on reason, ledger
    occurrences dedup on date, matching rewrites candidates).
    """
    detail = receipt_intake.get_intake_detail(
        env_id=env_id, business_id=business_id, intake_id=intake_id,
    )
    if not detail or not detail.get("parse"):
        return {"error": "no_parse", "intake_id": intake_id}

    p = detail["parse"]

    # Classification (rules → carry-forward → heuristics).
    classification = receipt_classification.classify(
        env_id=env_id, business_id=business_id,
        billing_platform=p.get("billing_platform"),
        service_name_guess=p.get("service_name_guess"),
        vendor_normalized=p.get("vendor_normalized"),
    )

    # Shim carries subtotal/renewal_language/spend_type → stability layer needs them.
    shim = _Shim()
    shim.service_name_guess = p.get("service_name_guess")
    shim.billing_platform = p.get("billing_platform")
    shim.vendor_normalized = p.get("vendor_normalized")
    shim.subtotal = p.get("subtotal")
    shim.total = p.get("total")
    shim.currency = p.get("currency") or "USD"
    shim.transaction_date = p.get("transaction_date")
    shim.merchant_raw = p.get("merchant_raw")
    shim.renewal_language = p.get("renewal_language")
    shim.spend_type = p.get("spend_type")

    ledger_result = subscription_ledger.update_ledger_on_new_receipt(
        env_id=env_id, business_id=business_id, intake_id=intake_id,
        parsed=shim, classification=classification,
    )

    match_candidates = receipt_matching.match_to_transactions(
        env_id=env_id, business_id=business_id,
        intake_id=intake_id, parsed=shim,
    )

    # Review scoring — the orchestrator is authoritative about what goes to
    # the queue. This centralizes the "why does this need a human?" decision.
    review_items: list[str] = []
    confidence = float(p.get("confidence_overall") or 0)
    billing_platform = (p.get("billing_platform") or "").lower()

    if confidence < 0.5:
        review_items.append(receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="low_confidence",
            next_action="Extracted fields have low confidence. Review or re-upload.",
        ))
    if billing_platform == "apple" and not p.get("vendor_normalized"):
        review_items.append(receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="apple_ambiguous",
            next_action="Apple is the billing platform. Confirm the underlying vendor.",
        ))
    if not classification.get("category"):
        review_items.append(receipt_review_queue.build_review_item(
            env_id=env_id, business_id=business_id, intake_id=intake_id,
            reason="uncategorized",
            next_action="Pick a category or add a classification rule.",
        ))

    return {
        "intake_id": intake_id,
        "parse": p,
        "classification": classification,
        "ledger": ledger_result,
        "match_candidates": match_candidates,
        "review_items": review_items,
        "spend_type": p.get("spend_type"),
    }


def backfill_occurrences(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Walk every parsed receipt and ensure the subscription ledger + its
    occurrence rows exist. Idempotent thanks to the UNIQUE index on
    (subscription_id, occurrence_date).
    """
    return subscription_ledger.detect_recurring(env_id=env_id, business_id=business_id)
