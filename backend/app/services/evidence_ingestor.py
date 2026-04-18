"""Ingestion abstraction for accounting evidence payloads.

Receipts are one source among several (API invoices, Apple IAP confirmations,
provider webhooks, raw card charges). The ``EvidenceIngestor`` protocol lets
Track A inject a deterministic stub today and swap to a vision/LLM parser
later via ``ACCOUNTING_INGESTOR=vision`` (or similar) env toggle.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass
class EvidencePayload:
    source: str  # receipt | api_invoice | apple_iap | provider_webhook | card_charge
    raw_vendor_string: str | None = None
    amount_hint: float | None = None
    filename: str | None = None
    received_at: str | None = None
    bytes_b64: str | None = None


@dataclass
class ParsedEvidence:
    vendor: str
    amount: float
    date: str
    confidence: int
    raw_text: str | None = None


class EvidenceIngestor(Protocol):
    def parse(self, payload: EvidencePayload) -> ParsedEvidence: ...


class DeterministicEvidenceIngestor:
    """Seeded by payload hash — stable output for demos and tests.

    Swap for a vision/LLM ingestor by implementing the same protocol.
    """

    _CANNED_VENDORS = [
        "Figma Inc",
        "Notion Labs",
        "Datadog",
        "OpenAI",
        "Anthropic",
        "Uber",
        "Hilton SF",
        "Ramp",
        "WeWork",
        "Best Buy",
    ]

    def parse(self, payload: EvidencePayload) -> ParsedEvidence:
        seed = (payload.filename or payload.raw_vendor_string or "unknown").strip().lower()
        h = hashlib.sha256(seed.encode("utf-8")).hexdigest()
        idx = int(h[:4], 16) % len(self._CANNED_VENDORS)
        vendor = (
            payload.raw_vendor_string
            or self._CANNED_VENDORS[idx]
        )
        amount = payload.amount_hint if payload.amount_hint is not None else round(
            10 + (int(h[4:8], 16) % 2400), 2
        )
        # Confidence derived from seed; filename hints with "_lowconf" → low.
        if payload.filename and "_lowconf" in payload.filename.lower():
            confidence = 62
        else:
            confidence = 80 + int(h[8], 16) % 18  # 80..97
        return ParsedEvidence(
            vendor=vendor,
            amount=float(amount),
            date=payload.received_at or date.today().isoformat(),
            confidence=confidence,
            raw_text=None,
        )


def get_evidence_ingestor() -> EvidenceIngestor:
    """Factory — swap on ``ACCOUNTING_INGESTOR`` env var (future injection point)."""
    mode = os.getenv("ACCOUNTING_INGESTOR", "deterministic").lower()
    if mode in ("vision", "llm"):
        # Placeholder — real implementations would live in a sibling module.
        return DeterministicEvidenceIngestor()
    return DeterministicEvidenceIngestor()
