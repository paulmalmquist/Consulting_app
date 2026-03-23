from __future__ import annotations

import csv
import hashlib
import io
from uuid import UUID

from app.db import get_cursor
from app.services import re_sustainability


def import_utility_csv(
    *,
    env_id: str,
    business_id: UUID,
    filename: str,
    csv_text: str,
    import_mode: str,
    created_by: str | None = None,
) -> dict:
    sha256 = hashlib.sha256(csv_text.encode()).hexdigest()
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = list(reader)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO sus_ingestion_run (
              env_id, business_id, source_type, connector_mode, filename,
              sha256, row_count, status, created_by
            )
            VALUES (%s, %s, 'utility_csv', %s, %s, %s, %s, 'running', %s)
            RETURNING *
            """,
            (env_id, str(business_id), import_mode, filename, sha256, len(rows), created_by),
        )
        run = cur.fetchone()

    rows_written = 0
    rows_blocked = 0
    for row in rows:
        try:
            payload = {
                "env_id": env_id,
                "business_id": business_id,
                "utility_type": row.get("utility_type") or "electric",
                "year": int(row["year"]),
                "month": int(row["month"]),
                "utility_account_id": row.get("utility_account_id") or None,
                "usage_kwh": row.get("usage_kwh") or None,
                "usage_therms": row.get("usage_therms") or None,
                "usage_gallons": row.get("usage_gallons") or None,
                "peak_kw": row.get("peak_kw") or None,
                "cost_total": row.get("cost_total") or None,
                "demand_charges": row.get("demand_charges") or None,
                "supply_charges": row.get("supply_charges") or None,
                "taxes_fees": row.get("taxes_fees") or None,
                "scope_1_emissions_tons": row.get("scope_1_emissions_tons") or None,
                "scope_2_emissions_tons": row.get("scope_2_emissions_tons") or None,
                "market_based_emissions": row.get("market_based_emissions") or None,
                "location_based_emissions": row.get("location_based_emissions") or None,
                "emission_factor_used": row.get("emission_factor_used") or None,
                "emission_factor_id": row.get("emission_factor_id") or None,
                "data_source": "csv",
                "renewable_pct": row.get("renewable_pct") or None,
                "ingestion_run_id": run["ingestion_run_id"],
            }
            re_sustainability.upsert_utility_monthly(
                asset_id=UUID(str(row["asset_id"])),
                payload=payload,
            )
            rows_written += 1
        except Exception:
            rows_blocked += 1

    status = "success" if rows_blocked == 0 else ("failed" if rows_written == 0 else "success")
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE sus_ingestion_run
            SET status = %s,
                row_count = %s,
                error_summary = %s
            WHERE ingestion_run_id = %s
            RETURNING *
            """,
            (
                status,
                len(rows),
                None if rows_blocked == 0 else f"{rows_blocked} row(s) blocked during import.",
                str(run["ingestion_run_id"]),
            ),
        )
        updated = cur.fetchone()
        cur.execute(
            """
            SELECT count(*) AS issue_count
            FROM sus_data_quality_issue
            WHERE env_id = %s AND business_id = %s AND resolved_at IS NULL
            """,
            (env_id, str(business_id)),
        )
        issue_row = cur.fetchone() or {}

    return {
        "ingestion_run_id": updated["ingestion_run_id"],
        "filename": filename,
        "rows_read": len(rows),
        "rows_written": rows_written,
        "rows_blocked": rows_blocked,
        "issue_count": int(issue_row.get("issue_count") or 0),
        "sha256": sha256,
        "status": updated["status"],
    }
