"""Receipt extraction — pytesseract + optional Claude for structured fields.

Pipeline:
    1. pytesseract extracts raw_text (reuses ocr_parser).
    2. If AI_GATEWAY_ENABLED and a receipt-extraction Claude helper is available,
       call it with the raw_text to return strict JSON fields.
    3. Otherwise fall back to the tesseract-based regex parse.
    4. Always pipe results through receipt_normalization for billing-platform
       vs vendor separation.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services import ocr_parser, receipt_normalization


PARSER_VERSION = "2026-04-18.1"


@dataclass
class ExtractedReceipt:
    parser_source: str = "tesseract"
    parser_version: str = PARSER_VERSION
    merchant_raw: str | None = None
    billing_platform: str | None = None
    service_name_guess: str | None = None
    vendor_normalized: str | None = None
    transaction_date: date | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    subtotal: Decimal | None = None
    tax: Decimal | None = None
    total: Decimal | None = None
    currency: str = "USD"
    apple_document_ref: str | None = None
    line_items: list[dict[str, Any]] = field(default_factory=list)
    payment_method_hints: str | None = None
    renewal_language: str | None = None
    confidence_overall: float = 0.0
    confidence_vendor: float = 0.0
    confidence_service: float = 0.0
    raw_text: str = ""
    apple_ambiguous: bool = False
    spend_type: str | None = None
    notes: list[str] = field(default_factory=list)
    raw_extraction: dict[str, Any] = field(default_factory=dict)

    def to_db_row(self) -> dict[str, Any]:
        return {
            "parser_source": self.parser_source,
            "parser_version": self.parser_version,
            "merchant_raw": self.merchant_raw,
            "billing_platform": self.billing_platform,
            "service_name_guess": self.service_name_guess,
            "vendor_normalized": self.vendor_normalized,
            "transaction_date": self.transaction_date,
            "billing_period_start": self.billing_period_start,
            "billing_period_end": self.billing_period_end,
            "subtotal": self.subtotal,
            "tax": self.tax,
            "total": self.total,
            "currency": self.currency,
            "apple_document_ref": self.apple_document_ref,
            "line_items": self.line_items,
            "payment_method_hints": self.payment_method_hints,
            "renewal_language": self.renewal_language,
            "confidence_overall": self.confidence_overall,
            "confidence_vendor": self.confidence_vendor,
            "confidence_service": self.confidence_service,
            "spend_type": self.spend_type,
            "raw_extraction": self.raw_extraction,
        }


APPLE_DOC_RE = re.compile(r"(document\s*no\.?|order\s*id|invoice)[:\s#]*([A-Z0-9\-]{6,})", re.IGNORECASE)
PERIOD_RE = re.compile(
    r"(\d{1,2}/\d{1,2}/\d{2,4})\s*(?:-|–|to)\s*(\d{1,2}/\d{1,2}/\d{2,4})"
)
SUBTOTAL_RE = re.compile(r"subtotal[:\s]*\$?\s*([\d,]+\.\d{2})", re.IGNORECASE)
TAX_RE = re.compile(r"(?:tax|vat)[:\s]*\$?\s*([\d,]+\.\d{2})", re.IGNORECASE)
CURRENCY_RE = re.compile(r"\b(USD|EUR|GBP|CAD|AUD)\b")


def _dec(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value.replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def _parse_date_str(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _extract_apple_fields(raw_text: str, out: ExtractedReceipt) -> None:
    m = APPLE_DOC_RE.search(raw_text)
    if m:
        out.apple_document_ref = m.group(2).strip()

    m = PERIOD_RE.search(raw_text)
    if m:
        out.billing_period_start = _parse_date_str(m.group(1))
        out.billing_period_end = _parse_date_str(m.group(2))

    m = SUBTOTAL_RE.search(raw_text)
    if m:
        out.subtotal = _dec(m.group(1))

    m = TAX_RE.search(raw_text)
    if m:
        out.tax = _dec(m.group(1))

    m = CURRENCY_RE.search(raw_text)
    if m:
        out.currency = m.group(1)


def _ai_gateway_enabled() -> bool:
    # Respect the repo convention (see memory/feedback_openai_key.md).
    return os.environ.get("AI_GATEWAY_ENABLED", "").lower() in {"1", "true", "yes", "on"}


def _claude_receipt_extract(raw_text: str) -> dict[str, Any] | None:
    """Optional Claude call — returns strict JSON or None on any failure."""
    if not _ai_gateway_enabled() or not raw_text.strip():
        return None
    try:
        from app.services import ai_gateway  # noqa: WPS433 (runtime-optional)
    except Exception:
        return None
    # Best-effort: look for a small synchronous helper. If the gateway exposes
    # only async streaming, skip Claude extraction — tesseract parse still runs.
    helper = getattr(ai_gateway, "extract_receipt_json", None)
    if helper is None:
        return None
    try:
        result = helper(raw_text=raw_text, parser_version=PARSER_VERSION)
        if isinstance(result, dict):
            return result
        if isinstance(result, str):
            return json.loads(result)
    except Exception:
        return None
    return None


def _merge_claude_fields(out: ExtractedReceipt, claude: dict[str, Any]) -> None:
    """Overlay trustworthy Claude fields onto the tesseract-derived output."""
    out.parser_source = "hybrid" if out.raw_text else "claude"
    out.raw_extraction = {**out.raw_extraction, "claude": claude}

    # Merchant / service hints — prefer Claude when provided.
    if claude.get("merchant_raw"):
        out.merchant_raw = claude["merchant_raw"]
    if claude.get("service_name_guess"):
        out.service_name_guess = claude["service_name_guess"]
    if claude.get("vendor_normalized"):
        out.vendor_normalized = claude["vendor_normalized"]
    if claude.get("billing_platform"):
        out.billing_platform = claude["billing_platform"]
    if claude.get("apple_document_ref") and not out.apple_document_ref:
        out.apple_document_ref = claude["apple_document_ref"]
    if claude.get("renewal_language") and not out.renewal_language:
        out.renewal_language = claude["renewal_language"]

    for field_name in ("transaction_date", "billing_period_start", "billing_period_end"):
        raw = claude.get(field_name)
        if raw:
            parsed = _parse_date_str(raw) if isinstance(raw, str) else raw
            if parsed:
                setattr(out, field_name, parsed)

    for field_name in ("subtotal", "tax", "total"):
        raw = claude.get(field_name)
        dec = _dec(str(raw)) if raw is not None else None
        if dec is not None:
            setattr(out, field_name, dec)

    if claude.get("currency"):
        out.currency = claude["currency"]

    if isinstance(claude.get("line_items"), list):
        out.line_items = claude["line_items"]

    for key in ("confidence_overall", "confidence_vendor", "confidence_service"):
        val = claude.get(key)
        if val is not None:
            try:
                setattr(out, key, float(val))
            except (ValueError, TypeError):
                pass


def _extract_from_bytes(file_bytes: bytes, mime_type: str) -> ocr_parser.ExtractedInvoice:
    if mime_type == "application/pdf" or mime_type.endswith("/pdf"):
        return ocr_parser.extract_from_pdf(file_bytes)
    return ocr_parser.extract_from_image(file_bytes)


def extract_receipt(file_bytes: bytes, mime_type: str) -> ExtractedReceipt:
    """Main entrypoint: pytesseract → (optional) Claude → normalization.

    Plain-text inputs (used by seed fixtures and tests) skip OCR and parse the
    decoded body directly via extract_receipt_from_text, then carry on through
    the normalization pipeline below.
    """
    if mime_type.startswith("text/"):
        text = file_bytes.decode("utf-8", errors="replace") if file_bytes else ""
        # Reuse the ocr_parser regex layer on the decoded body — it gives us
        # vendor_name / invoice_date / total / line_items for free.
        invoice = ocr_parser._parse_text(text)  # type: ignore[attr-defined]
        out = ExtractedReceipt(raw_text=text, parser_source="text-fixture")
    else:
        invoice = _extract_from_bytes(file_bytes, mime_type)
        out = ExtractedReceipt(raw_text=invoice.raw_text or "")

    # Lift basic fields from the regex parse.
    out.merchant_raw = invoice.vendor_name
    out.transaction_date = _parse_date_str(invoice.invoice_date)
    out.total = invoice.total_amount
    out.line_items = invoice.line_items or []
    out.confidence_overall = float(invoice.confidence)
    out.raw_extraction = {"tesseract": {"raw_text_len": len(out.raw_text)}}

    _extract_apple_fields(out.raw_text, out)

    # Try Claude overlay.
    claude = _claude_receipt_extract(out.raw_text)
    if claude:
        _merge_claude_fields(out, claude)

    # Deterministic normalization always runs last (Apple-rules layer).
    norm = receipt_normalization.normalize(
        merchant_raw=out.merchant_raw,
        service_hint=out.service_name_guess,
        raw_text=out.raw_text,
    )
    if norm.billing_platform and not out.billing_platform:
        out.billing_platform = norm.billing_platform
    if norm.service_name_guess and not out.service_name_guess:
        out.service_name_guess = norm.service_name_guess
    if norm.vendor_normalized and not out.vendor_normalized:
        out.vendor_normalized = norm.vendor_normalized
    if not out.renewal_language and norm.renewal_language:
        out.renewal_language = norm.renewal_language

    # Confidence is the max of any source (so AI-extracted vendors aren't nuked
    # by the rules layer when it found the same thing).
    out.confidence_vendor = max(out.confidence_vendor, norm.confidence_vendor)
    out.confidence_service = max(out.confidence_service, norm.confidence_service)
    out.apple_ambiguous = norm.apple_ambiguous
    out.notes.extend(norm.notes)

    # Derive spend_type last so it sees normalized service_name_guess.
    out.spend_type = receipt_normalization.infer_spend_type(
        service_name_guess=out.service_name_guess,
        raw_text=out.raw_text,
        renewal_language=out.renewal_language,
    )
    if out.apple_ambiguous:
        out.spend_type = "ambiguous"

    if out.confidence_overall == 0.0:
        # Derive overall from per-field presence when tesseract gave us nothing.
        present = sum([
            out.merchant_raw is not None,
            out.total is not None,
            out.transaction_date is not None,
            out.vendor_normalized is not None,
            len(out.line_items) > 0,
        ])
        out.confidence_overall = present / 5.0

    return out


def extract_receipt_from_text(raw_text: str) -> ExtractedReceipt:
    """Used by tests and the recurring-carry-forward path (no file bytes)."""
    out = ExtractedReceipt(raw_text=raw_text)
    _extract_apple_fields(raw_text, out)
    norm = receipt_normalization.normalize(
        merchant_raw=None, service_hint=None, raw_text=raw_text,
    )
    out.billing_platform = norm.billing_platform
    out.service_name_guess = norm.service_name_guess
    out.vendor_normalized = norm.vendor_normalized
    out.confidence_vendor = norm.confidence_vendor
    out.confidence_service = norm.confidence_service
    out.renewal_language = norm.renewal_language
    out.apple_ambiguous = norm.apple_ambiguous
    out.notes.extend(norm.notes)
    out.spend_type = receipt_normalization.infer_spend_type(
        service_name_guess=out.service_name_guess,
        raw_text=out.raw_text,
        renewal_language=out.renewal_language,
    )
    if out.apple_ambiguous:
        out.spend_type = "ambiguous"
    return out
