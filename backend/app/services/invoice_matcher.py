"""Invoice Matcher — multi-strategy matching engine for invoice line items.

Matches invoice line items to draw line items using a cascade of strategies:
  1. Exact cost code match → 0.95 confidence
  2. Fuzzy cost code (prefix/contains) → 0.85 confidence
  3. Description similarity (SequenceMatcher) → 0.60-0.85 confidence
  4. Vendor history (same vendor matched to same code in prior invoices) → 0.88 confidence

Auto-match threshold: 0.85 — matches at or above are auto-accepted.
All match decisions are logged to cp_draw_audit_log.
"""
from __future__ import annotations

import difflib
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services import draw_audit


AUTO_MATCH_THRESHOLD = Decimal("0.85")


@dataclass
class MatchCandidate:
    draw_line_item_id: str
    cost_code: str
    description: str
    confidence: Decimal
    strategy: str


def _d(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    return Decimal(str(val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def match_invoice_to_draw(
    *,
    invoice_id: UUID,
    draw_request_id: UUID,
    env_id: UUID,
    business_id: UUID,
    project_id: UUID,
    actor: str = "system",
) -> dict[str, Any]:
    """Match all line items of an invoice to draw line items.

    Returns a summary with per-line match results.
    """
    with get_cursor() as cur:
        # Fetch invoice line items
        cur.execute(
            "SELECT * FROM cp_invoice_line_item WHERE invoice_id = %s::uuid ORDER BY line_number",
            (str(invoice_id),),
        )
        inv_lines = cur.fetchall()

        # Fetch draw line items (candidates)
        cur.execute(
            "SELECT * FROM cp_draw_line_item WHERE draw_request_id = %s::uuid ORDER BY cost_code",
            (str(draw_request_id),),
        )
        draw_lines = cur.fetchall()

        # Fetch vendor history for strategy 4
        cur.execute(
            """
            SELECT ili.cost_code, dli.line_item_id AS draw_line_item_id, dli.cost_code AS draw_cost_code
            FROM cp_invoice_line_item ili
            JOIN cp_invoice inv ON inv.invoice_id = ili.invoice_id
            JOIN cp_draw_line_item dli ON dli.line_item_id = ili.matched_draw_line_id
            WHERE inv.project_id = %s::uuid
              AND inv.vendor_id = (SELECT vendor_id FROM cp_invoice WHERE invoice_id = %s::uuid)
              AND ili.match_status IN ('auto_matched','manual_matched')
            """,
            (str(project_id), str(invoice_id)),
        )
        vendor_history = cur.fetchall()

    vendor_code_map: dict[str, str] = {}
    for vh in vendor_history:
        if vh.get("cost_code"):
            vendor_code_map[vh["cost_code"]] = str(vh["draw_line_item_id"])

    results: list[dict[str, Any]] = []
    auto_matched = 0
    needs_review = 0

    for inv_line in inv_lines:
        best = _find_best_match(inv_line, draw_lines, vendor_code_map)

        if best and best.confidence >= AUTO_MATCH_THRESHOLD:
            match_status = "auto_matched"
            auto_matched += 1
        elif best:
            match_status = "unmatched"
            needs_review += 1
        else:
            match_status = "unmatched"
            needs_review += 1

        # Update invoice line item
        with get_cursor() as cur:
            if best:
                cur.execute(
                    """
                    UPDATE cp_invoice_line_item SET
                      match_confidence = %s, matched_draw_line_id = %s::uuid,
                      match_strategy = %s, match_status = %s
                    WHERE invoice_line_id = %s::uuid
                    """,
                    (
                        str(best.confidence), best.draw_line_item_id,
                        best.strategy, match_status,
                        str(inv_line["invoice_line_id"]),
                    ),
                )
            else:
                cur.execute(
                    "UPDATE cp_invoice_line_item SET match_status = 'unmatched' WHERE invoice_line_id = %s::uuid",
                    (str(inv_line["invoice_line_id"]),),
                )

        results.append({
            "invoice_line_id": str(inv_line["invoice_line_id"]),
            "line_number": inv_line["line_number"],
            "description": inv_line.get("description"),
            "cost_code": inv_line.get("cost_code"),
            "amount": str(_d(inv_line.get("amount"))),
            "match": {
                "draw_line_item_id": best.draw_line_item_id if best else None,
                "matched_cost_code": best.cost_code if best else None,
                "confidence": str(best.confidence) if best else "0",
                "strategy": best.strategy if best else None,
                "status": match_status,
            },
        })

    # Update invoice-level match status
    overall_status = "auto_matched" if needs_review == 0 and auto_matched > 0 else "unmatched"
    overall_confidence = (
        min(_d(r["match"]["confidence"]) for r in results) if results else Decimal("0")
    )

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cp_invoice SET
              match_status = %s, match_confidence = %s,
              draw_request_id = %s::uuid, updated_at = now()
            WHERE invoice_id = %s::uuid
            """,
            (overall_status, str(overall_confidence), str(draw_request_id), str(invoice_id)),
        )

    draw_audit.log_draw_event(
        env_id=env_id, business_id=business_id, project_id=project_id,
        draw_request_id=draw_request_id, invoice_id=invoice_id,
        entity_type="invoice", entity_id=invoice_id,
        action="invoice_matched", actor=actor,
        new_state={
            "match_status": overall_status,
            "auto_matched": auto_matched,
            "needs_review": needs_review,
        },
    )

    return {
        "invoice_id": str(invoice_id),
        "draw_request_id": str(draw_request_id),
        "total_lines": len(inv_lines),
        "auto_matched": auto_matched,
        "needs_review": needs_review,
        "overall_status": overall_status,
        "overall_confidence": str(overall_confidence),
        "line_results": results,
    }


def _find_best_match(
    inv_line: dict[str, Any],
    draw_lines: list[dict[str, Any]],
    vendor_history: dict[str, str],
) -> MatchCandidate | None:
    """Find the best matching draw line item for an invoice line item."""
    inv_code = (inv_line.get("cost_code") or "").strip()
    inv_desc = (inv_line.get("description") or "").strip().lower()
    candidates: list[MatchCandidate] = []

    for dl in draw_lines:
        dl_code = (dl.get("cost_code") or "").strip()
        dl_desc = (dl.get("description") or "").strip().lower()
        dl_id = str(dl["line_item_id"])

        # Strategy 1: Exact cost code match
        if inv_code and inv_code == dl_code:
            candidates.append(MatchCandidate(
                draw_line_item_id=dl_id, cost_code=dl_code,
                description=dl.get("description", ""),
                confidence=Decimal("0.9500"), strategy="exact_cost_code",
            ))
            continue

        # Strategy 2: Fuzzy cost code (prefix or contains)
        if inv_code and dl_code and (dl_code.startswith(inv_code[:5]) or inv_code[:5] in dl_code):
            candidates.append(MatchCandidate(
                draw_line_item_id=dl_id, cost_code=dl_code,
                description=dl.get("description", ""),
                confidence=Decimal("0.8500"), strategy="fuzzy_cost_code",
            ))
            continue

        # Strategy 3: Description similarity
        if inv_desc and dl_desc:
            ratio = difflib.SequenceMatcher(None, inv_desc, dl_desc).ratio()
            if ratio >= 0.5:
                conf = Decimal(str(0.60 + ratio * 0.25)).quantize(Decimal("0.0001"))
                candidates.append(MatchCandidate(
                    draw_line_item_id=dl_id, cost_code=dl_code,
                    description=dl.get("description", ""),
                    confidence=conf, strategy="description_similarity",
                ))

    # Strategy 4: Vendor history
    if inv_code and inv_code in vendor_history:
        hist_id = vendor_history[inv_code]
        # Boost existing candidate or add new
        existing = next((c for c in candidates if c.draw_line_item_id == hist_id), None)
        if existing:
            existing.confidence = max(existing.confidence, Decimal("0.8800"))
        else:
            dl = next((d for d in draw_lines if str(d["line_item_id"]) == hist_id), None)
            if dl:
                candidates.append(MatchCandidate(
                    draw_line_item_id=hist_id, cost_code=dl.get("cost_code", ""),
                    description=dl.get("description", ""),
                    confidence=Decimal("0.8800"), strategy="vendor_history",
                ))

    if not candidates:
        return None

    # Return highest confidence
    return max(candidates, key=lambda c: c.confidence)


def override_match(
    *,
    invoice_line_id: UUID,
    draw_line_item_id: UUID,
    invoice_id: UUID,
    env_id: UUID,
    business_id: UUID,
    project_id: UUID,
    draw_request_id: UUID | None = None,
    actor: str = "system",
) -> dict[str, Any]:
    """Manually override an invoice line item match (HITL action)."""
    with get_cursor() as cur:
        # Get previous match
        cur.execute(
            "SELECT * FROM cp_invoice_line_item WHERE invoice_line_id = %s::uuid",
            (str(invoice_line_id),),
        )
        prev = cur.fetchone()
        if not prev:
            raise LookupError(f"Invoice line item {invoice_line_id} not found")

        cur.execute(
            """
            UPDATE cp_invoice_line_item SET
              matched_draw_line_id = %s::uuid,
              match_confidence = 1.0000,
              match_strategy = 'manual_override',
              match_status = 'manual_matched'
            WHERE invoice_line_id = %s::uuid
            RETURNING *
            """,
            (str(draw_line_item_id), str(invoice_line_id)),
        )
        updated = cur.fetchone()

    draw_audit.log_draw_event(
        env_id=env_id, business_id=business_id, project_id=project_id,
        draw_request_id=draw_request_id, invoice_id=invoice_id,
        entity_type="invoice_line_item", entity_id=invoice_line_id,
        action="match_override", actor=actor,
        hitl_approval=True,
        previous_state={
            "matched_draw_line_id": str(prev.get("matched_draw_line_id")) if prev.get("matched_draw_line_id") else None,
            "match_status": prev.get("match_status"),
        },
        new_state={
            "matched_draw_line_id": str(draw_line_item_id),
            "match_status": "manual_matched",
        },
    )

    return updated
