"""OCR Parser — extracts structured data from invoice PDFs/images.

Uses pytesseract for OCR with regex-based field extraction.
Gracefully degrades when pytesseract is not installed.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

try:
    import pytesseract
    from PIL import Image
    HAS_OCR = True
except ModuleNotFoundError:
    HAS_OCR = False


@dataclass
class ExtractedInvoice:
    invoice_number: str | None = None
    invoice_date: str | None = None
    vendor_name: str | None = None
    total_amount: Decimal | None = None
    line_items: list[dict[str, Any]] = field(default_factory=list)
    raw_text: str = ""
    confidence: float = 0.0


def extract_from_pdf(file_bytes: bytes) -> ExtractedInvoice:
    """Extract structured invoice data from a PDF file."""
    if not HAS_OCR:
        return ExtractedInvoice(confidence=0.0, raw_text="OCR not available: pytesseract not installed")

    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(file_bytes, dpi=300)
    except (ImportError, Exception):
        # Fallback: treat as single-page image
        try:
            img = Image.open(io.BytesIO(file_bytes))
            images = [img]
        except Exception:
            return ExtractedInvoice(confidence=0.0, raw_text="Failed to open PDF as image")

    full_text = ""
    for img in images:
        text = pytesseract.image_to_string(img)
        full_text += text + "\n"

    return _parse_text(full_text)


def extract_from_image(file_bytes: bytes) -> ExtractedInvoice:
    """Extract structured invoice data from an image file."""
    if not HAS_OCR:
        return ExtractedInvoice(confidence=0.0, raw_text="OCR not available: pytesseract not installed")

    try:
        img = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(img)
        return _parse_text(text)
    except Exception as exc:
        return ExtractedInvoice(confidence=0.0, raw_text=f"OCR failed: {exc}")


def _parse_text(raw_text: str) -> ExtractedInvoice:
    """Parse raw OCR text to extract structured invoice fields."""
    result = ExtractedInvoice(raw_text=raw_text)

    # Invoice number patterns
    inv_match = re.search(r'(?:invoice|inv|inv\.|invoice\s*#|inv\s*#)\s*[:\-]?\s*([A-Z0-9\-]+)', raw_text, re.IGNORECASE)
    if inv_match:
        result.invoice_number = inv_match.group(1).strip()

    # Date patterns
    date_match = re.search(
        r'(?:date|invoice\s*date|dated)\s*[:\-]?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
        raw_text, re.IGNORECASE,
    )
    if date_match:
        result.invoice_date = date_match.group(1).strip()

    # Total amount patterns
    total_match = re.search(
        r'(?:total|amount\s*due|total\s*due|balance\s*due|grand\s*total)\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)',
        raw_text, re.IGNORECASE,
    )
    if total_match:
        try:
            result.total_amount = Decimal(total_match.group(1).replace(",", ""))
        except Exception:
            pass

    # Vendor name (first prominent text line, heuristic)
    lines = [l.strip() for l in raw_text.split("\n") if l.strip() and len(l.strip()) > 3]
    if lines:
        result.vendor_name = lines[0][:100]

    # Line items (look for tabular data with amounts)
    line_pattern = re.compile(
        r'(\d+)\s+(.{5,50}?)\s+(\d+\.?\d*)\s+\$?([\d,]+\.?\d*)\s+\$?([\d,]+\.?\d*)',
    )
    for match in line_pattern.finditer(raw_text):
        try:
            result.line_items.append({
                "line_number": int(match.group(1)),
                "description": match.group(2).strip(),
                "quantity": match.group(3),
                "unit_price": match.group(4).replace(",", ""),
                "amount": match.group(5).replace(",", ""),
            })
        except (ValueError, IndexError):
            pass

    # Confidence based on how many fields we extracted
    fields_found = sum([
        result.invoice_number is not None,
        result.invoice_date is not None,
        result.total_amount is not None,
        result.vendor_name is not None,
        len(result.line_items) > 0,
    ])
    result.confidence = fields_found / 5.0

    return result
