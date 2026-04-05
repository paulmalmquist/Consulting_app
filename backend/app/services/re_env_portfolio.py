from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _money_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")


# Active asset statuses — NULL means status was never set (pre-migration row), treat as active.
# Disposed assets require an explicit status ('disposed', 'realized', 'written_off', 'pipeline').
_ACTIVE_STATUSES = ("active", "held", "lease_up", "operating")
# SQL fragment reused across all active-asset filters in this module.
_ACTIVE_STATUS_SQL = f"(a.asset_status IS NULL OR a.asset_status IN ({', '.join(repr(s) for s in _ACTIVE_STATUSES)}))"


def get_portfolio_kpis(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
    scenario_id: UUID | str | None = None,
) -> dict:
    env_text = str(env_id)
    business_text = str(business_id)
    scenario_text = str(scenario_id) if scenario_id else None

    # Build scenario filter once — reused across all sub-queries that reference
    # re_fund_quarter_state. "s" is the alias in each subquery.
    if scenario_text:
        sc_clause = "s.scenario_id = %s::uuid"
        sc_params: list[str] = [scenario_text]
    else:
        sc_clause = "s.scenario_id IS NULL"
        sc_params = []

    # Parameter list for the full query (positional %s, left to right):
    # 1. CTE latest_nav    : business_id, quarter  [+ scenario if set]
    # 2. fund_count        : business_id
    # 3. total_commitments : business_id
    # 4. active_assets     : business_id
    # 5. gross_irr subq    : business_id, quarter  (no scenario filter — include all scenarios)
    # 6. net_irr subq      : business_id, quarter  (no scenario filter — include all scenarios)
    params: list[str] = (
        [business_text, quarter] + sc_params          # CTE
        + [business_text]                              # fund_count
        + [business_text]                              # total_commitments
        + [business_text]                              # active_assets
        + [business_text, quarter]                     # gross_irr (base scenario only, no extra param)
        + [business_text, quarter]                     # net_irr   (base scenario only, no extra param)
    )

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH latest_nav AS (
              SELECT DISTINCT ON (s.fund_id)
                s.fund_id,
                s.portfolio_nav
              FROM re_fund_quarter_state s
              JOIN repe_fund f ON f.fund_id = s.fund_id
              WHERE f.business_id = %s::uuid
                AND s.quarter = %s
                AND {sc_clause}
              ORDER BY s.fund_id, s.created_at DESC
            )
            SELECT
              (
                SELECT COUNT(*)::int
                FROM repe_fund f
                WHERE f.business_id = %s::uuid
              ) AS fund_count,
              (
                SELECT COALESCE(SUM(pc.committed_amount), 0)
                FROM re_partner_commitment pc
                JOIN repe_fund f ON f.fund_id = pc.fund_id
                WHERE f.business_id = %s::uuid
                  AND pc.status IN ('active', 'fully_called')
              ) AS total_commitments,
              (
                SELECT CASE
                  WHEN COUNT(*) = 0 THEN NULL
                  ELSE COALESCE(SUM(portfolio_nav), 0)
                END
                FROM latest_nav
              ) AS portfolio_nav,
              (
                SELECT COUNT(*)::int
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE f.business_id = %s::uuid
                  AND a.asset_type = 'property'
                  -- NULL = never assigned a status (legacy rows); treated as active.
                  -- Explicit 'disposed', 'realized', 'written_off', 'pipeline' are excluded.
                  AND {_ACTIVE_STATUS_SQL}
              ) AS active_assets,
              (
                -- NAV-weighted gross IRR across all funds for this quarter (base scenario)
                SELECT
                  SUM(s.gross_irr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0)
                FROM (
                  SELECT DISTINCT ON (si.fund_id)
                    si.gross_irr,
                    si.portfolio_nav
                  FROM re_fund_quarter_state si
                  JOIN repe_fund f ON f.fund_id = si.fund_id
                  WHERE f.business_id = %s::uuid
                    AND si.quarter = %s
                    AND si.scenario_id IS NULL
                    AND si.gross_irr IS NOT NULL
                    AND si.portfolio_nav > 0
                  ORDER BY si.fund_id, si.created_at DESC
                ) s
              ) AS gross_irr,
              (
                -- NAV-weighted net IRR across all funds for this quarter (base scenario)
                SELECT
                  SUM(s.net_irr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0)
                FROM (
                  SELECT DISTINCT ON (si.fund_id)
                    si.net_irr,
                    si.portfolio_nav
                  FROM re_fund_quarter_state si
                  JOIN repe_fund f ON f.fund_id = si.fund_id
                  WHERE f.business_id = %s::uuid
                    AND si.quarter = %s
                    AND si.scenario_id IS NULL
                    AND si.net_irr IS NOT NULL
                    AND si.portfolio_nav > 0
                  ORDER BY si.fund_id, si.created_at DESC
                ) s
              ) AS net_irr
            """,
            params,
        )
        row = cur.fetchone()

    warnings: list[str] = []
    if row["portfolio_nav"] is None:
        scope = scenario_text or "base"
        warnings.append(
            f"No fund quarter state rows found for quarter {quarter} and scenario {scope}. "
            "Run a quarter close to compute portfolio NAV."
        )

    return {
        "env_id": env_text,
        "business_id": business_text,
        "quarter": quarter,
        "scenario_id": scenario_text,
        "fund_count": row["fund_count"] or 0,
        "total_commitments": _money_to_string(row["total_commitments"]) or "0",
        "portfolio_nav": _money_to_string(row["portfolio_nav"]),
        "active_assets": row["active_assets"] or 0,
        "gross_irr": _money_to_string(row["gross_irr"]),
        "net_irr": _money_to_string(row["net_irr"]),
        "warnings": warnings,
    }


def get_portfolio_readiness(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
    scenario_id: UUID | str | None = None,
) -> dict:
    """
    Returns data-completeness counts for the portfolio at a given quarter.
    Surfaces which assets are missing geocoding, valuation, operating data, or debt data
    so the UI can show a readiness panel instead of silent blanks.
    """
    business_text = str(business_id)
    scenario_text = str(scenario_id) if scenario_id else None
    scenario_clause = "aqs.scenario_id = %s::uuid" if scenario_text else "aqs.scenario_id IS NULL"
    params: list = [business_text, quarter]
    if scenario_text:
        params.append(scenario_text)

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH active_assets AS (
              SELECT a.asset_id, a.name, a.asset_status
              FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE f.business_id = %s::uuid
                AND {_ACTIVE_STATUS_SQL}
            ),
            latest_state AS (
              SELECT DISTINCT ON (aqs.asset_id)
                aqs.asset_id,
                aqs.nav,
                aqs.asset_value,
                aqs.noi,
                aqs.occupancy,
                aqs.debt_balance,
                aqs.ltv,
                aqs.dscr,
                aqs.value_source
              FROM re_asset_quarter_state aqs
              WHERE aqs.asset_id IN (SELECT asset_id FROM active_assets)
                AND aqs.quarter = %s
                AND {scenario_clause}
              ORDER BY aqs.asset_id, aqs.created_at DESC
            )
            SELECT
              COUNT(aa.asset_id)::int                                       AS total_assets,
              COUNT(pa.latitude)::int                                       AS assets_geocoded,
              COUNT(pa.market)::int                                         AS assets_with_market,
              COUNT(CASE WHEN ls.noi IS NOT NULL AND ls.noi != 0 THEN 1 END)::int AS assets_with_noi,
              COUNT(CASE WHEN ls.asset_value IS NOT NULL AND ls.asset_value > 0 THEN 1 END)::int AS assets_with_valuation,
              COUNT(CASE WHEN ls.nav IS NOT NULL THEN 1 END)::int           AS assets_valued_for_rollup,
              COUNT(CASE WHEN ls.debt_balance IS NOT NULL AND ls.debt_balance > 0 THEN 1 END)::int AS assets_with_debt,
              COUNT(CASE WHEN ls.ltv IS NOT NULL THEN 1 END)::int           AS assets_with_ltv,
              COUNT(ls.asset_id)::int                                       AS assets_with_quarter_state,
              COUNT(aa.asset_id) - COUNT(ls.asset_id)                      AS assets_missing_quarter_state,
              COUNT(aa.asset_id) - COUNT(pa.latitude)                      AS assets_missing_geocode,
              COUNT(aa.asset_id) - COUNT(CASE WHEN ls.noi IS NOT NULL AND ls.noi != 0 THEN 1 END) AS assets_missing_noi,
              COUNT(aa.asset_id) - COUNT(CASE WHEN ls.asset_value IS NOT NULL AND ls.asset_value > 0 THEN 1 END) AS assets_missing_valuation
            FROM active_assets aa
            LEFT JOIN repe_property_asset pa ON pa.asset_id = aa.asset_id
            LEFT JOIN latest_state ls ON ls.asset_id = aa.asset_id
            """,
            params,
        )
        counts = cur.fetchone() or {}

        # Fetch the list of unvalued assets for drill-down
        cur.execute(
            f"""
            WITH active_assets AS (
              SELECT a.asset_id, a.name
              FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE f.business_id = %s::uuid
                AND {_ACTIVE_STATUS_SQL}
            )
            SELECT aa.asset_id, aa.name,
              CASE WHEN pa.latitude IS NULL THEN true ELSE false END AS missing_geocode,
              CASE WHEN aqs.asset_id IS NULL THEN true ELSE false END AS missing_quarter_state,
              CASE WHEN aqs.asset_value IS NULL OR aqs.asset_value = 0 THEN true ELSE false END AS missing_valuation,
              CASE WHEN aqs.noi IS NULL OR aqs.noi = 0 THEN true ELSE false END AS missing_noi,
              CASE WHEN aqs.debt_balance IS NOT NULL AND aqs.ltv IS NULL THEN true ELSE false END AS missing_ltv
            FROM active_assets aa
            LEFT JOIN repe_property_asset pa ON pa.asset_id = aa.asset_id
            LEFT JOIN LATERAL (
              SELECT asset_id, asset_value, noi, debt_balance, ltv
              FROM re_asset_quarter_state
              WHERE asset_id = aa.asset_id AND quarter = %s AND {scenario_clause.replace('aqs.', '')}
              ORDER BY created_at DESC LIMIT 1
            ) aqs ON true
            WHERE
              pa.latitude IS NULL
              OR aqs.asset_id IS NULL
              OR aqs.asset_value IS NULL OR aqs.asset_value = 0
            ORDER BY aa.name
            LIMIT 50
            """,
            [business_text, quarter] + ([scenario_text] if scenario_text else []),
        )
        incomplete = cur.fetchall() or []

    total = counts.get("total_assets") or 0
    valued = counts.get("assets_with_valuation") or 0
    geocoded = counts.get("assets_geocoded") or 0
    with_noi = counts.get("assets_with_noi") or 0
    with_state = counts.get("assets_with_quarter_state") or 0

    readiness_score = round(
        (valued + geocoded + with_noi + with_state) / (total * 4) * 100
    ) if total > 0 else 0

    return {
        "quarter": quarter,
        "scenario_id": scenario_text,
        "total_active_assets": total,
        "assets_geocoded": geocoded,
        "assets_with_market": counts.get("assets_with_market") or 0,
        "assets_with_noi": with_noi,
        "assets_with_valuation": valued,
        "assets_valued_for_rollup": counts.get("assets_valued_for_rollup") or 0,
        "assets_with_debt": counts.get("assets_with_debt") or 0,
        "assets_with_ltv": counts.get("assets_with_ltv") or 0,
        "assets_with_quarter_state": with_state,
        "assets_missing_quarter_state": counts.get("assets_missing_quarter_state") or 0,
        "assets_missing_geocode": counts.get("assets_missing_geocode") or 0,
        "assets_missing_noi": counts.get("assets_missing_noi") or 0,
        "assets_missing_valuation": counts.get("assets_missing_valuation") or 0,
        "readiness_score_pct": readiness_score,
        "incomplete_assets": [
            {
                "asset_id": str(r["asset_id"]),
                "name": r["name"],
                "missing_geocode": r["missing_geocode"],
                "missing_quarter_state": r["missing_quarter_state"],
                "missing_valuation": r["missing_valuation"],
                "missing_noi": r["missing_noi"],
                "missing_ltv": r["missing_ltv"],
            }
            for r in incomplete
        ],
    }
