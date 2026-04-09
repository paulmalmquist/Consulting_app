from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor


def _money_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")


def _row_to_str(row: dict, *keys: str) -> dict:
    """Convert Decimal values to strings for JSON-safe output."""
    out = dict(row)
    for k in keys:
        if k in out and out[k] is not None:
            out[k] = _money_to_string(out[k])
    return out


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

    # Weighted DSCR and LTV from fund quarter state
    weighted_dscr = None
    weighted_ltv = None
    pct_invested = None

    try:
        with get_cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  SUM(s.weighted_dscr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0) AS wtd_dscr,
                  SUM(s.weighted_ltv * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0) AS wtd_ltv,
                  CASE WHEN SUM(s.total_committed) > 0
                       THEN SUM(s.total_called) / SUM(s.total_committed)
                       ELSE NULL END AS pct_invested
                FROM (
                  SELECT DISTINCT ON (si.fund_id)
                    si.weighted_dscr, si.weighted_ltv, si.portfolio_nav,
                    si.total_committed, si.total_called
                  FROM re_fund_quarter_state si
                  JOIN repe_fund f ON f.fund_id = si.fund_id
                  WHERE f.business_id = %s::uuid
                    AND si.quarter = %s
                    AND {sc_clause}
                    AND si.portfolio_nav > 0
                  ORDER BY si.fund_id, si.created_at DESC
                ) s
                """,
                [business_text, quarter] + sc_params,
            )
            extra = cur.fetchone()
            if extra:
                weighted_dscr = extra.get("wtd_dscr")
                weighted_ltv = extra.get("wtd_ltv")
                pct_invested = extra.get("pct_invested")
    except Exception:
        pass  # Weighted metrics are best-effort — don't break the main response

    # Find the effective quarter (latest quarter with data if requested quarter has none)
    effective_quarter = quarter
    if row["portfolio_nav"] is None:
        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT s.quarter
                    FROM re_fund_quarter_state s
                    JOIN repe_fund f ON f.fund_id = s.fund_id
                    WHERE f.business_id = %s::uuid AND s.scenario_id IS NULL
                    ORDER BY s.quarter DESC LIMIT 1
                    """,
                    [business_text],
                )
                fallback = cur.fetchone()
                if fallback and "quarter" in fallback:
                    effective_quarter = fallback["quarter"]
        except Exception:
            pass  # Fallback is best-effort — don't break the main response

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
        "effective_quarter": effective_quarter,
        "scenario_id": scenario_text,
        "fund_count": row["fund_count"] or 0,
        "total_commitments": _money_to_string(row["total_commitments"]) or "0",
        "portfolio_nav": _money_to_string(row["portfolio_nav"]),
        "active_assets": row["active_assets"] or 0,
        "gross_irr": _money_to_string(row.get("gross_irr")) if row else None,
        "net_irr": _money_to_string(row.get("net_irr")) if row else None,
        "weighted_dscr": _money_to_string(weighted_dscr),
        "weighted_ltv": _money_to_string(weighted_ltv),
        "pct_invested": _money_to_string(pct_invested),
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


# =============================================================================
# Fund Table — enriched fund rows with quarter-state performance metrics
# =============================================================================

_DECIMAL_KEYS = (
    "target_size", "portfolio_nav", "total_committed", "total_called",
    "total_distributed", "dpi", "rvpi", "tvpi", "gross_irr", "net_irr",
    "weighted_dscr", "weighted_ltv", "pct_invested",
)


def get_fund_table_rows(
    *,
    business_id: UUID | str,
    quarter: str,
    model_id: UUID | str | None = None,
) -> list[dict]:
    """
    Returns enriched fund rows joining repe_fund with re_fund_quarter_state.

    When model_id is set, joins on scenario_id = model_id instead of
    scenario_id IS NULL, enabling model overlay from the same endpoint.

    Uses DISTINCT ON + ORDER BY created_at DESC (latest row wins).
    TODO: When period locking is added, prefer is_locked = true rows.
    """
    business_text = str(business_id)

    if model_id:
        scenario_clause = "sq.scenario_id = %s::uuid"
        scenario_params: list[Any] = [str(model_id)]
    else:
        scenario_clause = "sq.scenario_id IS NULL"
        scenario_params = []

    params: list[Any] = [quarter] + scenario_params + [business_text]

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              f.fund_id,
              f.business_id,
              f.name,
              f.vintage_year,
              f.fund_type,
              f.strategy,
              f.sub_strategy,
              f.target_size,
              f.status,
              f.base_currency,
              f.inception_date,
              f.created_at,
              s.portfolio_nav,
              s.total_committed,
              s.total_called,
              s.total_distributed,
              s.dpi,
              s.rvpi,
              s.tvpi,
              s.gross_irr,
              s.net_irr,
              s.weighted_dscr,
              s.weighted_ltv,
              CASE
                WHEN s.total_committed IS NOT NULL AND s.total_committed > 0
                THEN s.total_called / s.total_committed
                ELSE NULL
              END AS pct_invested
            FROM repe_fund f
            LEFT JOIN LATERAL (
              SELECT *
              FROM re_fund_quarter_state sq
              WHERE sq.fund_id = f.fund_id
                AND sq.quarter = %s
                AND {scenario_clause}
              ORDER BY sq.created_at DESC
              LIMIT 1
            ) s ON true
            WHERE f.business_id = %s::uuid
            ORDER BY f.name
            """,
            params,
        )
        rows = cur.fetchall()

    return [
        {
            **_row_to_str(dict(r), *_DECIMAL_KEYS),
            "fund_id": str(r["fund_id"]),
            "business_id": str(r["business_id"]),
            "inception_date": r["inception_date"].isoformat() if r.get("inception_date") else None,
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        }
        for r in rows
    ]


# =============================================================================
# Fund Comparison — bar-chart-ready metric values per fund
# =============================================================================

_COMPARISON_METRICS = {
    "gross_irr", "net_irr", "tvpi", "dpi", "rvpi",
    "portfolio_nav", "weighted_dscr", "weighted_ltv",
}


def get_fund_comparison(
    *,
    business_id: UUID | str,
    quarter: str,
    metric: str,
    model_id: UUID | str | None = None,
) -> list[dict]:
    """
    Returns [{fund_id, fund_name, value}] for a given metric across all funds.
    Metric must be a valid column in re_fund_quarter_state.
    """
    if metric not in _COMPARISON_METRICS:
        raise ValueError(f"Invalid comparison metric: {metric}")

    business_text = str(business_id)

    if model_id:
        scenario_clause = "sq.scenario_id = %s::uuid"
        scenario_params: list[Any] = [str(model_id)]
    else:
        scenario_clause = "sq.scenario_id IS NULL"
        scenario_params = []

    params: list[Any] = [quarter] + scenario_params + [business_text]

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              f.fund_id,
              f.name AS fund_name,
              s.{metric} AS value
            FROM repe_fund f
            LEFT JOIN LATERAL (
              SELECT *
              FROM re_fund_quarter_state sq
              WHERE sq.fund_id = f.fund_id
                AND sq.quarter = %s
                AND {scenario_clause}
              ORDER BY sq.created_at DESC
              LIMIT 1
            ) s ON true
            WHERE f.business_id = %s::uuid
              AND s.{metric} IS NOT NULL
            ORDER BY s.{metric} DESC
            """,
            params,
        )
        rows = cur.fetchall()

    return [
        {
            "fund_id": str(r["fund_id"]),
            "fund_name": r["fund_name"],
            "value": _money_to_string(r["value"]),
        }
        for r in rows
    ]


# =============================================================================
# Allocation Breakdown — sector or geography grouping
# =============================================================================

def get_allocation_breakdown(
    *,
    business_id: UUID | str,
    quarter: str,
    group_by: str = "sector",
    model_id: UUID | str | None = None,
) -> dict:
    """
    Returns allocation breakdown grouped by property_type (sector) or
    state (geography). Each group has name, total_nav, pct.
    """
    business_text = str(business_id)

    if model_id:
        scenario_clause = "aqs.scenario_id = %s::uuid"
        scenario_params: list[Any] = [str(model_id)]
    else:
        scenario_clause = "aqs.scenario_id IS NULL"
        scenario_params = []

    if group_by == "geography":
        group_col = "COALESCE(pa.state, 'Unknown')"
        group_label = "state"
    else:
        group_col = "COALESCE(pa.property_type, 'Unknown')"
        group_label = "sector"

    params: list[Any] = [business_text, quarter] + scenario_params

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH active_assets AS (
              SELECT a.asset_id
              FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE f.business_id = %s::uuid
                AND {_ACTIVE_STATUS_SQL}
            ),
            latest_state AS (
              SELECT DISTINCT ON (aqs.asset_id)
                aqs.asset_id,
                COALESCE(aqs.nav, aqs.asset_value, 0) AS nav_value
              FROM re_asset_quarter_state aqs
              WHERE aqs.asset_id IN (SELECT asset_id FROM active_assets)
                AND aqs.quarter = %s
                AND {scenario_clause}
              ORDER BY aqs.asset_id, aqs.created_at DESC
            )
            SELECT
              {group_col} AS group_name,
              SUM(ls.nav_value) AS total_nav,
              COUNT(*)::int AS asset_count
            FROM active_assets aa
            JOIN repe_property_asset pa ON pa.asset_id = aa.asset_id
            LEFT JOIN latest_state ls ON ls.asset_id = aa.asset_id
            GROUP BY {group_col}
            ORDER BY total_nav DESC NULLS LAST
            """,
            params,
        )
        rows = cur.fetchall()

    grand_total = sum(r["total_nav"] or 0 for r in rows)
    groups = []
    for r in rows:
        nav = r["total_nav"] or Decimal(0)
        groups.append({
            "name": r["group_name"],
            "total_nav": _money_to_string(nav),
            "asset_count": r["asset_count"],
            "pct": float(nav / grand_total * 100) if grand_total > 0 else 0.0,
        })

    return {
        "group_by": group_label,
        "quarter": quarter,
        "grand_total_nav": _money_to_string(Decimal(grand_total)) if grand_total else "0",
        "groups": groups,
    }
