"""Budget / underwriting version management.

Manages UW versions and NOI budget line items for variance analysis baselines.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def create_uw_version(
    *,
    env_id: str,
    business_id: UUID,
    name: str,
    scenario_id: UUID | None = None,
    effective_from: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO uw_version (env_id, business_id, name, scenario_id, effective_from)
            VALUES (%s, %s, %s, %s, COALESCE(%s::date, CURRENT_DATE))
            RETURNING *
            """,
            (
                env_id,
                str(business_id),
                name,
                str(scenario_id) if scenario_id else None,
                effective_from,
            ),
        )
        row = cur.fetchone()
        emit_log(
            level="info",
            service="backend",
            action="re.budget.uw_version_created",
            message=f"UW version '{name}' created",
            context={"env_id": env_id, "business_id": str(business_id)},
        )
        return row


def create_noi_budget_monthly(
    *,
    env_id: str,
    business_id: UUID,
    items: list[dict],
) -> dict:
    """Bulk insert NOI budget monthly items.

    Each item: {asset_id, uw_version_id, period_month, line_code, amount, currency?}
    """
    rows_inserted = 0
    with get_cursor() as cur:
        for item in items:
            cur.execute(
                """
                INSERT INTO uw_noi_budget_monthly
                    (env_id, business_id, asset_id, uw_version_id, period_month, line_code, amount, currency)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id,
                    str(business_id),
                    str(item["asset_id"]),
                    str(item["uw_version_id"]),
                    item["period_month"],
                    item["line_code"],
                    item["amount"],
                    item.get("currency", "USD"),
                ),
            )
            if cur.fetchone():
                rows_inserted += 1
    return {"rows_inserted": rows_inserted}


def get_noi_budget_monthly(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID | None = None,
    uw_version_id: UUID | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["env_id = %s", "business_id = %s"]
        params: list = [env_id, str(business_id)]
        if asset_id:
            conditions.append("asset_id = %s")
            params.append(str(asset_id))
        if uw_version_id:
            conditions.append("uw_version_id = %s")
            params.append(str(uw_version_id))
        cur.execute(
            f"""
            SELECT * FROM uw_noi_budget_monthly
            WHERE {' AND '.join(conditions)}
            ORDER BY period_month, line_code
            """,
            params,
        )
        return cur.fetchall()


def list_uw_versions(
    *,
    env_id: str,
    business_id: UUID,
) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM uw_version
            WHERE env_id = %s AND business_id = %s
            ORDER BY created_at DESC
            """,
            (env_id, str(business_id)),
        )
        return cur.fetchall()
