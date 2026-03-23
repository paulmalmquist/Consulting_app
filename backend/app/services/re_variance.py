"""NOI Variance Analysis service.

Computes actual-vs-plan variance at the asset level, then rolls up
to investment and fund level.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def _quarter_months(quarter: str) -> list[str]:
    """Return the 3 month-start dates for a quarter, e.g. 2026Q1 → [2026-01-01, 2026-02-01, 2026-03-01]."""
    year = int(quarter[:4])
    q = int(quarter[-1])
    start_month = (q - 1) * 3 + 1
    return [f"{year}-{start_month + i:02d}-01" for i in range(3)]


def _safe_pct(actual: Decimal, plan: Decimal) -> Decimal | None:
    if plan == 0:
        return None
    return ((actual - plan) / abs(plan)).quantize(Decimal("0.0001"))


def compute_noi_variance(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    uw_version_id: UUID,
    run_id: UUID,
) -> list[dict]:
    """Compute per-asset, per-line-code NOI variance for a quarter.

    Joins acct_normalized_noi_monthly (actuals) with uw_noi_budget_monthly (plan)
    and writes results to re_asset_variance_qtr.
    """
    months = _quarter_months(quarter)
    results = []

    with get_cursor() as cur:
        # Get all assets for the fund (through deals)
        cur.execute(
            """
            SELECT a.asset_id, d.deal_id AS investment_id
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s
            """,
            (str(fund_id),),
        )
        assets = cur.fetchall()

        for asset in assets:
            asset_id = asset["asset_id"]
            investment_id = asset.get("investment_id")

            # Get actual NOI by line_code for the quarter
            cur.execute(
                """
                SELECT line_code, SUM(amount) AS actual_amount
                FROM acct_normalized_noi_monthly
                WHERE env_id = %s AND business_id = %s AND asset_id = %s
                    AND period_month = ANY(%s::date[])
                GROUP BY line_code
                """,
                (env_id, str(business_id), str(asset_id), months),
            )
            actuals = {r["line_code"]: Decimal(str(r["actual_amount"])) for r in cur.fetchall()}

            # Get plan NOI by line_code for the quarter
            cur.execute(
                """
                SELECT line_code, SUM(amount) AS plan_amount
                FROM uw_noi_budget_monthly
                WHERE env_id = %s AND business_id = %s AND asset_id = %s
                    AND uw_version_id = %s
                    AND period_month = ANY(%s::date[])
                GROUP BY line_code
                """,
                (env_id, str(business_id), str(asset_id), str(uw_version_id), months),
            )
            plans = {r["line_code"]: Decimal(str(r["plan_amount"])) for r in cur.fetchall()}

            # Union all line codes
            all_codes = sorted(set(actuals.keys()) | set(plans.keys()))
            for code in all_codes:
                actual = actuals.get(code, Decimal("0"))
                plan = plans.get(code, Decimal("0"))
                variance = actual - plan
                variance_pct = _safe_pct(actual, plan)

                cur.execute(
                    """
                    INSERT INTO re_asset_variance_qtr
                        (run_id, env_id, business_id, fund_id, investment_id,
                         asset_id, quarter, line_code, actual_amount, plan_amount,
                         variance_amount, variance_pct)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        str(run_id), env_id, str(business_id), str(fund_id),
                        str(investment_id) if investment_id else None,
                        str(asset_id), quarter, code,
                        str(actual), str(plan), str(variance),
                        str(variance_pct) if variance_pct is not None else None,
                    ),
                )
                row = cur.fetchone()
                if row:
                    results.append(row)

    emit_log(
        level="info",
        service="backend",
        action="re.variance.computed",
        message=f"NOI variance computed: {len(results)} line items",
        context={"fund_id": str(fund_id), "quarter": quarter, "run_id": str(run_id)},
    )
    return results


def get_variance(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    run_id: UUID | None = None,
) -> dict:
    """Retrieve stored variance results with rollups."""
    with get_cursor() as cur:
        conditions = [
            "env_id = %s",
            "business_id = %s",
            "fund_id = %s",
            "quarter = %s",
        ]
        params: list = [env_id, str(business_id), str(fund_id), quarter]
        if run_id:
            conditions.append("run_id = %s")
            params.append(str(run_id))

        cur.execute(
            f"""
            SELECT * FROM re_asset_variance_qtr
            WHERE {' AND '.join(conditions)}
            ORDER BY asset_id, line_code
            """,
            params,
        )
        items = cur.fetchall()

        # Compute rollups
        total_actual = sum(Decimal(str(r["actual_amount"])) for r in items)
        total_plan = sum(Decimal(str(r["plan_amount"])) for r in items)
        total_variance = total_actual - total_plan

        return {
            "items": items,
            "rollup": {
                "total_actual": str(total_actual),
                "total_plan": str(total_plan),
                "total_variance": str(total_variance),
                "total_variance_pct": str(_safe_pct(total_actual, total_plan)) if total_plan != 0 else None,
            },
        }
