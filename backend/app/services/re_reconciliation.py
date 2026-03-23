"""Data quality reconciliation service.

Runs consistency checks across the financial data pipeline:
  GL balances → normalized NOI → quarter rollup → quarter state → graph values

Each check writes results to acct_validation_result for audit trail.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def _d(v: object | None) -> Decimal:
    return Decimal(str(v or 0))


def check_gl_normalized_match(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID,
    quarter: str,
) -> dict:
    """Verify GL balance totals match normalized NOI totals for a quarter."""
    year = int(quarter[:4])
    q = int(quarter[-1])
    start_month = (q - 1) * 3 + 1
    end_month = start_month + 2
    start_date = f"{year}-{start_month:02d}-01"
    import calendar
    last_day = calendar.monthrange(year, end_month)[1]
    end_date = f"{year}-{end_month:02d}-{last_day:02d}"

    with get_cursor() as cur:
        # Sum GL revenue accounts (using mapping rules)
        cur.execute(
            """
            SELECT
                SUM(CASE WHEN m.sign_multiplier = 1 THEN g.amount * m.sign_multiplier ELSE 0 END) AS gl_revenue,
                SUM(CASE WHEN m.sign_multiplier = -1 THEN g.amount * m.sign_multiplier ELSE 0 END) AS gl_expense,
                SUM(g.amount * m.sign_multiplier) AS gl_noi
            FROM acct_gl_balance_monthly g
            JOIN acct_mapping_rule m
                ON m.env_id = g.env_id AND m.business_id = g.business_id
                AND m.gl_account = g.gl_account AND m.target_statement = 'NOI'
            WHERE g.env_id = %s AND g.business_id = %s AND g.asset_id = %s
              AND g.period_month >= %s AND g.period_month <= %s
            """,
            (env_id, str(business_id), str(asset_id), start_date, end_date),
        )
        gl = cur.fetchone() or {}

        # Sum normalized NOI
        cur.execute(
            """
            SELECT
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS norm_revenue,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) AS norm_expense,
                SUM(amount) AS norm_noi
            FROM acct_normalized_noi_monthly
            WHERE env_id = %s AND business_id = %s AND asset_id = %s
              AND period_month >= %s AND period_month <= %s
            """,
            (env_id, str(business_id), str(asset_id), start_date, end_date),
        )
        norm = cur.fetchone() or {}

    gl_noi = _d(gl.get("gl_noi"))
    norm_noi = _d(norm.get("norm_noi"))
    delta = abs(gl_noi - norm_noi)
    passed = delta <= Decimal("0.01")

    result = {
        "check_type": "gl_normalized_match",
        "passed": passed,
        "gl_noi": float(gl_noi),
        "norm_noi": float(norm_noi),
        "delta": float(delta),
        "gl_revenue": float(_d(gl.get("gl_revenue"))),
        "norm_revenue": float(_d(norm.get("norm_revenue"))),
    }

    _record_result(
        env_id=env_id, business_id=business_id, asset_id=asset_id,
        check_type="gl_normalized_match", passed=passed,
        expected=float(gl_noi), actual=float(norm_noi), delta=float(delta),
        details=result,
    )

    return result


def check_rollup_match(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID,
    quarter: str,
) -> dict:
    """Verify normalized NOI totals match quarter rollup table."""
    year = int(quarter[:4])
    q = int(quarter[-1])
    start_month = (q - 1) * 3 + 1
    end_month = start_month + 2
    start_date = f"{year}-{start_month:02d}-01"
    import calendar
    last_day = calendar.monthrange(year, end_month)[1]
    end_date = f"{year}-{end_month:02d}-{last_day:02d}"

    with get_cursor() as cur:
        # Normalized totals
        cur.execute(
            """
            SELECT
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS revenue,
                SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS opex,
                SUM(amount) AS noi
            FROM acct_normalized_noi_monthly
            WHERE env_id = %s AND business_id = %s AND asset_id = %s
              AND period_month >= %s AND period_month <= %s
            """,
            (env_id, str(business_id), str(asset_id), start_date, end_date),
        )
        norm = cur.fetchone() or {}

        # Rollup values
        cur.execute(
            """
            SELECT revenue, opex, noi
            FROM re_asset_acct_quarter_rollup
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND asset_id = %s::uuid AND quarter = %s
            LIMIT 1
            """,
            (env_id, str(business_id), str(asset_id), quarter),
        )
        rollup = cur.fetchone() or {}

    norm_noi = _d(norm.get("noi"))
    rollup_noi = _d(rollup.get("noi"))
    delta = abs(norm_noi - rollup_noi)
    passed = delta <= Decimal("1.00")  # allow $1 tolerance for rounding

    result = {
        "check_type": "rollup_match",
        "passed": passed,
        "norm_noi": float(norm_noi),
        "rollup_noi": float(rollup_noi),
        "delta": float(delta),
    }

    _record_result(
        env_id=env_id, business_id=business_id, asset_id=asset_id,
        check_type="rollup_match", passed=passed,
        expected=float(norm_noi), actual=float(rollup_noi), delta=float(delta),
        details=result,
    )

    return result


def run_all_checks(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID,
    quarter: str,
) -> dict:
    """Run all reconciliation checks for an asset+quarter."""
    results = {
        "gl_normalized": check_gl_normalized_match(
            env_id=env_id, business_id=business_id,
            asset_id=asset_id, quarter=quarter,
        ),
        "rollup": check_rollup_match(
            env_id=env_id, business_id=business_id,
            asset_id=asset_id, quarter=quarter,
        ),
    }

    all_passed = all(r["passed"] for r in results.values())

    emit_log(
        level="info" if all_passed else "warn",
        service="backend",
        action="re.reconciliation.run_all",
        message=f"Reconciliation {'passed' if all_passed else 'FAILED'} for asset {asset_id} {quarter}",
        context={"env_id": env_id, "asset_id": str(asset_id), "quarter": quarter},
    )

    return {"all_passed": all_passed, "checks": results}


def _record_result(
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID | None = None,
    check_type: str,
    passed: bool,
    expected: float,
    actual: float,
    delta: float,
    details: dict | None = None,
    batch_id: UUID | None = None,
) -> None:
    """Write a validation result record."""
    import json
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO acct_validation_result
                (batch_id, env_id, business_id, asset_id, check_type,
                 passed, expected, actual, delta, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                str(batch_id) if batch_id else None,
                env_id, str(business_id),
                str(asset_id) if asset_id else None,
                check_type, passed, expected, actual, delta,
                json.dumps(details, default=str) if details else None,
            ),
        )
