"""Fund data pipeline diagnostic service.

Runs four lightweight COUNT queries to determine exactly where the data
pipeline has stalled for a given fund + quarter + environment.

Returned failure_reason codes:
  NO_FUND       — no repe_fund row with this fund_id
  NO_ASSETS     — fund exists but no assets are linked via repe_deal
  NO_SNAPSHOT   — assets exist but re_fund_quarter_state has no row for this quarter
  None          — all checks pass
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def get_fund_pipeline_status(
    *,
    fund_id: UUID,
    env_id: str,
    quarter: str,
) -> dict:
    """Return a structured diagnostic payload for the given fund/quarter."""
    with get_cursor() as cur:
        # 1. Fund exists?
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM repe_fund WHERE fund_id = %s",
            (str(fund_id),),
        )
        fund_exists = (cur.fetchone()["cnt"] or 0) > 0

        # 2. Investment count
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_investment WHERE fund_id = %s",
            (str(fund_id),),
        )
        investment_count = int(cur.fetchone()["cnt"] or 0)

        # 3. Asset count (via deal join)
        cur.execute(
            """
            SELECT COUNT(a.asset_id) AS cnt
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s
            """,
            (str(fund_id),),
        )
        asset_count = int(cur.fetchone()["cnt"] or 0)

        # 4. Snapshot exists for this quarter?
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            """,
            (str(fund_id), quarter),
        )
        snapshot_count = int(cur.fetchone()["cnt"] or 0)
        snapshot_exists = snapshot_count > 0

        # 5. Time-series points (IRR timeline rows)
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_fund_quarter_state WHERE fund_id = %s",
            (str(fund_id),),
        )
        time_series_points = int(cur.fetchone()["cnt"] or 0)

    # Determine failure reason (first failure wins)
    failure_reason: str | None = None
    if not fund_exists:
        failure_reason = "NO_FUND"
    elif asset_count == 0:
        failure_reason = "NO_ASSETS"
    elif not snapshot_exists:
        failure_reason = "NO_SNAPSHOT"

    result = {
        "fund_id": str(fund_id),
        "env_id": env_id,
        "quarter": quarter,
        "fund_exists": fund_exists,
        "investment_count": investment_count,
        "asset_count": asset_count,
        "snapshot_exists": snapshot_exists,
        "time_series_points": time_series_points,
        "failure_reason": failure_reason,
        "status": "FAIL" if failure_reason else "PASS",
    }

    emit_log(
        level="warning" if failure_reason else "info",
        service="backend",
        action="re.pipeline_diagnostic.checked",
        message=f"Fund pipeline status: {result['status']}",
        context={
            "fund_id": str(fund_id),
            "env_id": env_id,
            "quarter": quarter,
            "asset_count": asset_count,
            "snapshot_exists": snapshot_exists,
            "failure_reason": failure_reason,
        },
    )

    return result
