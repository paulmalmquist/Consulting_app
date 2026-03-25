"""Accounting ingestion and normalization service.

Handles GL balance import, mapping rules, and normalization to
standard NOI/BS line codes.
"""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def _source_hash(payload: list[dict]) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def import_accounting(
    *,
    env_id: str,
    business_id: UUID,
    source_name: str,
    payload: list[dict],
) -> dict:
    """Import GL balances and normalize using mapping rules.

    Each item in payload: {asset_id, period_month, gl_account, amount}
    """
    source = _source_hash(payload)
    rows_loaded = 0
    rows_normalized = 0

    with get_cursor() as cur:
        for row in payload:
            cur.execute(
                """
                INSERT INTO acct_gl_balance_monthly
                    (env_id, business_id, asset_id, period_month, gl_account, amount, source_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (
                    env_id,
                    str(business_id),
                    str(row["asset_id"]) if row.get("asset_id") else None,
                    row["period_month"],
                    row["gl_account"],
                    row["amount"],
                    source_name,
                ),
            )
            if cur.fetchone():
                rows_loaded += 1

        # Normalize: join GL balances with mapping rules → NOI monthly
        cur.execute(
            """
            INSERT INTO acct_normalized_noi_monthly
                (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
            SELECT
                g.env_id, g.business_id, g.asset_id, g.period_month,
                m.target_line_code,
                SUM(g.amount * m.sign_multiplier),
                %s
            FROM acct_gl_balance_monthly g
            JOIN acct_mapping_rule m
                ON m.env_id = g.env_id
                AND m.business_id = g.business_id
                AND m.gl_account = g.gl_account
                AND m.target_statement = 'NOI'
            WHERE g.env_id = %s AND g.business_id = %s AND g.source_id = %s
            GROUP BY g.env_id, g.business_id, g.asset_id, g.period_month, m.target_line_code
            ON CONFLICT DO NOTHING
            """,
            (source, env_id, str(business_id), source_name),
        )
        rows_normalized = cur.rowcount or 0

        # Also normalize BS items
        cur.execute(
            """
            INSERT INTO acct_normalized_bs_monthly
                (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
            SELECT
                g.env_id, g.business_id, g.asset_id, g.period_month,
                m.target_line_code,
                SUM(g.amount * m.sign_multiplier),
                %s
            FROM acct_gl_balance_monthly g
            JOIN acct_mapping_rule m
                ON m.env_id = g.env_id
                AND m.business_id = g.business_id
                AND m.gl_account = g.gl_account
                AND m.target_statement = 'BS'
            WHERE g.env_id = %s AND g.business_id = %s AND g.source_id = %s
            GROUP BY g.env_id, g.business_id, g.asset_id, g.period_month, m.target_line_code
            ON CONFLICT DO NOTHING
            """,
            (source, env_id, str(business_id), source_name),
        )

    emit_log(
        level="info",
        service="backend",
        action="re.accounting.import",
        message=f"Accounting import: {rows_loaded} loaded, {rows_normalized} normalized",
        context={"env_id": env_id, "business_id": str(business_id), "source_name": source_name},
    )

    return {
        "source_hash": source,
        "rows_loaded": rows_loaded,
        "rows_normalized": rows_normalized,
    }


def get_normalized_noi(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID,
    period_month: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s", "asset_id = %s"]
        params: list = [env_id, str(business_id), str(asset_id)]
        if period_month:
            conditions.append("period_month = %s")
            params.append(period_month)
        cur.execute(
            f"""
            SELECT * FROM acct_normalized_noi_monthly
            WHERE {' AND '.join(conditions)}
            ORDER BY period_month, line_code
            """,
            params,
        )
        return cur.fetchall()
