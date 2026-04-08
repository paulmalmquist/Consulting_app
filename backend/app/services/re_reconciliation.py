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


# ── Portfolio-level integrity checks ─────────────────────────────────────────


def validate_environment(
    *,
    env_id: str,
    business_id: str,
    quarter: str,
) -> dict:
    """Run portfolio-level integrity checks for the validate endpoint.

    Returns structured results: {checks: [...], summary: {pass, fail, warn}}.
    """
    checks: list[dict] = []

    checks.append(_check_fund_nav_vs_asset_rollup(business_id, quarter))
    checks.append(_check_fund_called_vs_ledger(business_id, quarter))
    checks.append(_check_tvpi_formula(business_id, quarter))
    checks.append(_check_no_orphan_assets(business_id))
    checks.append(_check_dscr_range(business_id, quarter))
    checks.append(_check_irr_source(business_id, quarter))
    checks.append(_check_trend_variation(business_id))

    summary = {
        "pass": sum(1 for c in checks if c["status"] == "pass"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
        "warn": sum(1 for c in checks if c["status"] == "warn"),
    }

    # Write to reconciliation log if table exists
    try:
        with get_cursor() as cur:
            for c in checks:
                cur.execute(
                    """
                    INSERT INTO repe_reconciliation_log
                      (env_id, quarter, check_name, expected_value, actual_value,
                       discrepancy, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (env_id, quarter, c["name"], c.get("expected_num"),
                     c.get("actual_num"), c.get("discrepancy"), c["status"]),
                )
    except Exception:
        pass  # Table may not exist yet

    return {"checks": checks, "summary": summary, "quarter": quarter}


def _check_fund_nav_vs_asset_rollup(business_id: str, quarter: str) -> dict:
    """Fund portfolio_nav should equal SUM of child asset NAVs."""
    with get_cursor() as cur:
        cur.execute(
            """
            WITH fund_states AS (
                SELECT DISTINCT ON (fqs.fund_id)
                    f.name, fqs.fund_id, fqs.portfolio_nav
                FROM repe_fund f
                JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
                  AND fqs.quarter = %s AND fqs.scenario_id IS NULL
                WHERE f.business_id = %s
                ORDER BY fqs.fund_id, fqs.created_at DESC
            )
            SELECT fs.name, fs.portfolio_nav AS fund_nav,
                   (SELECT SUM(qs.nav)
                    FROM re_asset_quarter_state qs
                    JOIN repe_asset a ON a.asset_id = qs.asset_id
                    JOIN repe_deal d ON d.deal_id = a.deal_id
                    WHERE d.fund_id = fs.fund_id AND qs.quarter = %s AND qs.scenario_id IS NULL
                   ) AS asset_nav_sum
            FROM fund_states fs
            """,
            (quarter, business_id, quarter),
        )
        rows = cur.fetchall()

    mismatches = []
    for r in rows:
        fund_nav = _d(r["fund_nav"])
        asset_sum = _d(r["asset_nav_sum"])
        if fund_nav > 0 and asset_sum > 0 and abs(fund_nav - asset_sum) > Decimal("1"):
            mismatches.append(r["name"])

    return {
        "name": "fund_nav_vs_asset_rollup",
        "status": "fail" if mismatches else "pass",
        "expected": "fund NAV = SUM(asset NAV)",
        "actual": f"{len(mismatches)} mismatches" if mismatches else "all match",
        "discrepancy": len(mismatches),
    }


def _check_fund_called_vs_ledger(business_id: str, quarter: str) -> dict:
    """Fund total_called should equal SUM of contribution ledger entries."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (f.fund_id)
                f.name, fqs.total_called,
                (SELECT SUM(amount) FROM re_capital_ledger_entry
                 WHERE fund_id = f.fund_id AND entry_type = 'contribution' AND quarter <= %s) AS ledger_sum
            FROM repe_fund f
            JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
              AND fqs.quarter = %s AND fqs.scenario_id IS NULL
            WHERE f.business_id = %s
            ORDER BY f.fund_id, fqs.created_at DESC
            """,
            (quarter, quarter, business_id),
        )
        rows = cur.fetchall()

    mismatches = []
    for r in rows:
        called = _d(r["total_called"])
        ledger = _d(r["ledger_sum"])
        if called > 0 and ledger > 0 and abs(called - ledger) > Decimal("1"):
            mismatches.append(r["name"])

    return {
        "name": "fund_called_vs_ledger",
        "status": "fail" if mismatches else "pass",
        "expected": "total_called = SUM(contributions)",
        "actual": f"{len(mismatches)} mismatches" if mismatches else "all match",
        "discrepancy": len(mismatches),
    }


def _check_tvpi_formula(business_id: str, quarter: str) -> dict:
    """TVPI should equal (portfolio_nav + total_distributed) / total_called."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (f.fund_id)
                f.name, fqs.tvpi, fqs.portfolio_nav, fqs.total_distributed, fqs.total_called
            FROM repe_fund f
            JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
              AND fqs.quarter = %s AND fqs.scenario_id IS NULL
            WHERE f.business_id = %s AND fqs.total_called > 0 AND fqs.tvpi IS NOT NULL
            ORDER BY f.fund_id, fqs.created_at DESC
            """,
            (quarter, business_id),
        )
        rows = cur.fetchall()

    mismatches = []
    for r in rows:
        expected = (_d(r["portfolio_nav"]) + _d(r["total_distributed"])) / _d(r["total_called"])
        actual = _d(r["tvpi"])
        if abs(expected - actual) > Decimal("0.01"):
            mismatches.append(r["name"])

    return {
        "name": "tvpi_formula",
        "status": "fail" if mismatches else "pass",
        "expected": "TVPI = (NAV + dist) / called",
        "actual": f"{len(mismatches)} mismatches" if mismatches else "all correct",
        "discrepancy": len(mismatches),
    }


def _check_no_orphan_assets(business_id: str) -> dict:
    """Every repe_asset should have a valid deal->fund chain."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM repe_asset WHERE deal_id NOT IN (SELECT deal_id FROM repe_deal)",
        )
        orphans = cur.fetchone()["cnt"]
    return {
        "name": "no_orphan_assets",
        "status": "fail" if orphans > 0 else "pass",
        "expected": "0 orphan assets",
        "actual": f"{orphans} orphans",
        "expected_num": 0, "actual_num": orphans,
        "discrepancy": orphans,
    }


def _check_dscr_range(business_id: str, quarter: str) -> dict:
    """All DSCR values should be in [0.8, 3.0]."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM re_asset_quarter_state qs
            JOIN repe_asset a ON a.asset_id = qs.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s AND qs.quarter = %s AND qs.scenario_id IS NULL
              AND qs.dscr IS NOT NULL AND (qs.dscr < 0.8 OR qs.dscr > 3.0)
            """,
            (business_id, quarter),
        )
        outliers = cur.fetchone()["cnt"]
    return {
        "name": "dscr_range",
        "status": "warn" if outliers > 0 else "pass",
        "expected": "DSCR in [0.8, 3.0]",
        "actual": f"{outliers} outliers" if outliers else "all in range",
        "discrepancy": outliers,
    }


def _check_irr_source(business_id: str, quarter: str) -> dict:
    """Non-NULL gross_irr should have irr_source = 'computed_xirr'."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM repe_fund f
            JOIN re_fund_quarter_state fqs ON fqs.fund_id = f.fund_id
              AND fqs.quarter = %s AND fqs.scenario_id IS NULL
            WHERE f.business_id = %s
              AND fqs.gross_irr IS NOT NULL
              AND (fqs.irr_source IS NULL OR fqs.irr_source != 'computed_xirr')
            """,
            (quarter, business_id),
        )
        bad = cur.fetchone()["cnt"]
    return {
        "name": "irr_source_xirr",
        "status": "warn" if bad > 0 else "pass",
        "expected": "all non-NULL IRR from xirr",
        "actual": f"{bad} funds with formula IRR" if bad else "all correct",
        "discrepancy": bad,
    }


def _check_trend_variation(business_id: str) -> dict:
    """Assets should have NOI variation across quarters."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS cnt FROM (
                SELECT a.asset_id
                FROM re_asset_quarter_state qs
                JOIN repe_asset a ON a.asset_id = qs.asset_id
                JOIN repe_deal d ON d.deal_id = a.deal_id
                JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE f.business_id = %s AND qs.scenario_id IS NULL AND qs.noi IS NOT NULL
                GROUP BY a.asset_id
                HAVING COUNT(*) >= 3 AND COUNT(DISTINCT qs.noi) <= 1
            ) flat_assets
            """,
            (business_id,),
        )
        flat = cur.fetchone()["cnt"]
    return {
        "name": "trend_variation",
        "status": "warn" if flat > 0 else "pass",
        "expected": "NOI varies across quarters",
        "actual": f"{flat} assets with flat NOI" if flat else "all have variation",
        "discrepancy": flat,
    }


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
