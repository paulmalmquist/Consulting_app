"""Orchestrator chain: ensure it classifies → writes ledger+occurrence → matches → scores review."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services import receipt_orchestrator


def _fake_detail(**overrides):
    base = {
        "intake": {
            "id": "intake-1", "source_type": "upload", "ingest_status": "parsed",
            "original_filename": "apple_one.pdf", "mime_type": "application/pdf",
            "storage_path": None, "created_at": "2026-03-15T10:00:00Z", "file_hash": "h1",
        },
        "parse": {
            "id": "parse-1", "parser_source": "hybrid", "parser_version": "v",
            "merchant_raw": "Apple Services",
            "billing_platform": "Apple",
            "service_name_guess": "Apple One",
            "vendor_normalized": "Apple",
            "transaction_date": date(2026, 3, 15),
            "billing_period_start": None, "billing_period_end": None,
            "subtotal": Decimal("16.95"), "tax": None, "total": Decimal("16.95"),
            "currency": "USD", "apple_document_ref": None, "line_items": [],
            "payment_method_hints": None, "renewal_language": "Auto-renews",
            "confidence_overall": 0.92, "confidence_vendor": 0.95, "confidence_service": 0.95,
            "spend_type": "subscription_fixed",
        },
        "match_candidates": [],
        "review_items": [],
    }
    base.update(overrides)
    return base


def test_orchestrator_on_confident_apple_subscription(monkeypatch):
    calls = {"classify": 0, "update_ledger": 0, "match": 0, "review": []}

    def fake_get_intake_detail(**kwargs):
        return _fake_detail()

    def fake_classify(**kwargs):
        calls["classify"] += 1
        return {"category": "Software subscription", "business_relevance": "medium"}

    def fake_update_ledger(**kwargs):
        calls["update_ledger"] += 1
        return {"subscription_id": "sub-1", "occurrence_id": "occ-1", "new": False, "price_changed": False}

    def fake_match(**kwargs):
        calls["match"] += 1
        return []

    def fake_review(**kwargs):
        calls["review"].append(kwargs.get("reason"))
        return f"rev-{len(calls['review'])}"

    monkeypatch.setattr("app.services.receipt_intake.get_intake_detail", fake_get_intake_detail)
    monkeypatch.setattr("app.services.receipt_classification.classify", fake_classify)
    monkeypatch.setattr(
        "app.services.subscription_ledger.update_ledger_on_new_receipt", fake_update_ledger,
    )
    monkeypatch.setattr(
        "app.services.receipt_matching.match_to_transactions", fake_match,
    )
    monkeypatch.setattr(
        "app.services.receipt_review_queue.build_review_item", fake_review,
    )

    result = receipt_orchestrator.process_intake(
        env_id="env-1", business_id=str(uuid4()), intake_id="intake-1",
    )

    assert calls["classify"] == 1
    assert calls["update_ledger"] == 1
    assert calls["match"] == 1
    # High-confidence, categorized, non-ambiguous Apple vendor → no review items.
    assert calls["review"] == []
    assert result["ledger"]["subscription_id"] == "sub-1"
    assert result["spend_type"] == "subscription_fixed"


def test_orchestrator_flags_apple_ambiguous_when_vendor_null(monkeypatch):
    detail = _fake_detail()
    detail["parse"]["vendor_normalized"] = None
    detail["parse"]["service_name_guess"] = None
    detail["parse"]["confidence_overall"] = 0.35

    monkeypatch.setattr("app.services.receipt_intake.get_intake_detail", lambda **k: detail)
    monkeypatch.setattr(
        "app.services.receipt_classification.classify",
        lambda **k: {"category": None, "business_relevance": "unknown"},
    )
    monkeypatch.setattr(
        "app.services.subscription_ledger.update_ledger_on_new_receipt", lambda **k: None,
    )
    monkeypatch.setattr(
        "app.services.receipt_matching.match_to_transactions", lambda **k: [],
    )
    reviewed: list[str] = []
    monkeypatch.setattr(
        "app.services.receipt_review_queue.build_review_item",
        lambda **k: (reviewed.append(k["reason"]) or f"r-{len(reviewed)}"),
    )

    result = receipt_orchestrator.process_intake(
        env_id="env-1", business_id=str(uuid4()), intake_id="intake-1",
    )
    # Apple + null vendor + no category + low confidence → all three reasons fired.
    assert "low_confidence" in reviewed
    assert "apple_ambiguous" in reviewed
    assert "uncategorized" in reviewed
    assert len(result["review_items"]) == 3


def test_orchestrator_missing_parse_returns_error(monkeypatch):
    monkeypatch.setattr(
        "app.services.receipt_intake.get_intake_detail", lambda **k: None,
    )
    result = receipt_orchestrator.process_intake(
        env_id="env-1", business_id=str(uuid4()), intake_id="intake-1",
    )
    assert result == {"error": "no_parse", "intake_id": "intake-1"}
