"""Extraction write-back service.

Compares extracted financial data from documents against current asset data,
generates a diff preview, and writes approved fields to the asset record.
"""
from __future__ import annotations

import json
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def preview_writeback(
    *,
    extracted_document_id: UUID,
    asset_id: UUID,
    env_id: str,
    business_id: str,
) -> dict:
    """Compare extracted values against current asset data.

    Returns a diff with current vs. extracted values and anomaly flags.
    """
    with get_cursor() as cur:
        # Get extracted fields
        cur.execute(
            "SELECT field_key, field_value_json, confidence FROM app.extracted_field WHERE extracted_document_id = %s",
            (str(extracted_document_id),),
        )
        extracted_fields = cur.fetchall()

        # Get current asset quarter state (most recent)
        cur.execute(
            """
            SELECT * FROM re_asset_quarter_state
            WHERE asset_id = %s
            ORDER BY quarter DESC LIMIT 1
            """,
            (str(asset_id),),
        )
        current_state = cur.fetchone()

    # Build field map from extracted data
    field_map = {}
    for f in extracted_fields:
        key = f["field_key"]
        value = f["field_value_json"]
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                pass
        field_map[key] = {
            "extracted": value,
            "confidence": float(f.get("confidence", 0)),
        }

    # Map extracted fields to asset columns and compute diffs
    preview_rows = []
    column_mapping = _get_column_mapping()

    for field_key, info in field_map.items():
        extracted_value = info["extracted"]
        if extracted_value is None:
            continue

        asset_column = column_mapping.get(field_key)
        current_value = None
        if current_state and asset_column:
            current_value = current_state.get(asset_column)

        # Compute variance
        pct_change = None
        anomaly = False
        if current_value is not None and extracted_value is not None:
            try:
                cv = float(current_value)
                ev = float(extracted_value)
                if cv != 0:
                    pct_change = round((ev - cv) / abs(cv) * 100, 1)
                    anomaly = abs(pct_change) > 20
            except (TypeError, ValueError):
                pass

        preview_rows.append({
            "field_key": field_key,
            "asset_column": asset_column,
            "extracted_value": extracted_value,
            "current_value": _serialize_value(current_value),
            "confidence": info["confidence"],
            "pct_change": pct_change,
            "anomaly": anomaly,
            "needs_review": anomaly or info["confidence"] < 0.6,
        })

    return {
        "extracted_document_id": str(extracted_document_id),
        "asset_id": str(asset_id),
        "total_fields": len(preview_rows),
        "anomalies": sum(1 for r in preview_rows if r["anomaly"]),
        "needs_review": sum(1 for r in preview_rows if r["needs_review"]),
        "fields": preview_rows,
    }


def confirm_writeback(
    *,
    extracted_document_id: UUID,
    asset_id: UUID,
    approved_fields: list[str],
) -> None:
    """Write approved extracted fields to the asset record.

    Only writes fields that the user has explicitly approved.
    """
    with get_cursor() as cur:
        # Get extracted fields
        cur.execute(
            "SELECT field_key, field_value_json FROM app.extracted_field WHERE extracted_document_id = %s",
            (str(extracted_document_id),),
        )
        all_fields = {r["field_key"]: r["field_value_json"] for r in cur.fetchall()}

        column_mapping = _get_column_mapping()
        updates = {}

        for field_key in approved_fields:
            if field_key not in all_fields:
                continue
            asset_column = column_mapping.get(field_key)
            if not asset_column:
                continue
            value = all_fields[field_key]
            if isinstance(value, str):
                try:
                    value = json.loads(value)
                except (json.JSONDecodeError, TypeError):
                    pass
            updates[asset_column] = value

        if not updates:
            return

        # Update the most recent quarter state row
        set_clauses = ", ".join(f"{col} = %s" for col in updates)
        values = list(updates.values()) + [str(asset_id)]
        cur.execute(
            f"""
            UPDATE re_asset_quarter_state
            SET {set_clauses}
            WHERE id = (
                SELECT id FROM re_asset_quarter_state
                WHERE asset_id = %s
                ORDER BY quarter DESC LIMIT 1
            )
            """,
            values,
        )

    emit_log(
        level="info",
        service="backend",
        action="extraction.writeback",
        message=f"Wrote {len(updates)} fields to asset {asset_id}",
        context={"asset_id": str(asset_id), "fields": list(updates.keys())},
    )


def _get_column_mapping() -> dict[str, str]:
    """Map extraction field keys to re_asset_quarter_state columns."""
    return {
        "noi": "noi",
        "income.total_income": "revenue",
        "income.gross_potential_rent": "revenue",
        "income.net_rental_income": "revenue",
        "expenses.total_expenses": "opex",
        "property_summary.physical_occupancy": "occupancy",
        "property_summary.occupancy": "occupancy",
        "property_summary.economic_occupancy": "occupancy",
        "capex": "capex",
    }


def _serialize_value(value):
    """Convert DB values to JSON-safe types."""
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return str(value)
    return value
