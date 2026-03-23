from __future__ import annotations

from uuid import UUID

from app.db import get_cursor


def _placeholder_asset_name(investment_name: str) -> str:
    return f"{investment_name} - Placeholder Asset"


def ensure_investment_has_asset(
    *,
    deal_id: UUID,
    deal_name: str,
    asset_type: str = "property",
) -> dict | None:
    with get_cursor() as cur:
        return _ensure_investment_has_asset(cur=cur, deal_id=deal_id, deal_name=deal_name, asset_type=asset_type)


def _ensure_investment_has_asset(
    *,
    cur,
    deal_id: UUID,
    deal_name: str,
    asset_type: str = "property",
) -> dict | None:
    cur.execute(
        "SELECT asset_id FROM repe_asset WHERE deal_id = %s ORDER BY created_at ASC LIMIT 1",
        (str(deal_id),),
    )
    existing = cur.fetchone()
    if existing:
        return None

    placeholder_name = _placeholder_asset_name(deal_name)
    cur.execute(
        """
        INSERT INTO repe_asset (deal_id, asset_type, name)
        VALUES (%s, %s, %s)
        RETURNING *
        """,
        (str(deal_id), asset_type, placeholder_name),
    )
    asset = cur.fetchone()

    if asset_type == "property":
        cur.execute(
            """
            INSERT INTO repe_property_asset (
                asset_id, property_type, units, market, current_noi, occupancy
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (str(asset["asset_id"]), "unspecified", 1, "TBD", 0, 0),
        )
    else:
        cur.execute(
            """
            INSERT INTO repe_cmbs_asset (
                asset_id, tranche, rating, coupon, collateral_summary_json
            )
            VALUES (%s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (str(asset["asset_id"]), "TBD", "NR", 0, "{}"),
        )

    return asset


def backfill_missing_investment_assets(*, fund_id: UUID | None = None) -> dict:
    created: list[dict] = []
    with get_cursor() as cur:
        params: list[str] = []
        fund_clause = ""
        if fund_id:
            fund_clause = "AND d.fund_id = %s"
            params.append(str(fund_id))
        cur.execute(
            f"""
            SELECT d.deal_id, d.name, d.deal_type
            FROM repe_deal d
            LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
            WHERE a.asset_id IS NULL {fund_clause}
            ORDER BY d.created_at
            """,
            params,
        )
        missing = cur.fetchall()
        for row in missing:
            asset_type = "cmbs" if row.get("deal_type") == "debt" else "property"
            asset = _ensure_investment_has_asset(
                cur=cur,
                deal_id=UUID(str(row["deal_id"])),
                deal_name=row["name"],
                asset_type=asset_type,
            )
            if asset:
                created.append(asset)
    return {
        "created_count": len(created),
        "created_asset_ids": [str(row["asset_id"]) for row in created],
        "fund_id": str(fund_id) if fund_id else None,
    }


def check_budget_proforma_integrity(
    *,
    env_id: str,
    business_id: UUID,
    required_quarters: list[str] | None = None,
) -> dict:
    """Validate budget/proforma/actuals coverage for all assets in an env.

    Returns structured results with per-asset pass/fail detail.
    Fails (passed=False) if any asset is missing budget or actuals coverage.
    """
    if required_quarters is None:
        required_quarters = ["2026Q1"]

    with get_cursor() as cur:
        # Get all assets in the environment
        cur.execute(
            """
            SELECT a.asset_id::text, a.name
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s
            ORDER BY a.name
            """,
            (str(business_id),),
        )
        all_assets = {r["asset_id"]: r["name"] for r in cur.fetchall()}

        if not all_assets:
            return {
                "total_assets": 0,
                "assets_with_budget": 0,
                "assets_with_proforma": 0,
                "assets_with_actuals": 0,
                "assets_with_variance": 0,
                "missing_budget": [],
                "missing_proforma": [],
                "missing_actuals": [],
                "missing_variance": [],
                "passed": True,
            }

        # Get UW versions
        cur.execute(
            """
            SELECT id::text, name FROM uw_version
            WHERE env_id = %s AND business_id = %s
            ORDER BY effective_from DESC
            """,
            (env_id, str(business_id)),
        )
        uw_versions = cur.fetchall()
        budget_version_id = uw_versions[0]["id"] if uw_versions else None
        proforma_version_id = uw_versions[1]["id"] if len(uw_versions) > 1 else None

        # Convert quarters to month ranges
        month_dates: list[str] = []
        for q in required_quarters:
            year = int(q[:4])
            qn = int(q[-1])
            start_month = (qn - 1) * 3 + 1
            for i in range(3):
                month_dates.append(f"{year}-{start_month + i:02d}-01")

        # Check budget coverage
        bud_set: set[str] = set()
        if budget_version_id:
            cur.execute(
                """
                SELECT DISTINCT asset_id::text
                FROM uw_noi_budget_monthly
                WHERE env_id = %s AND business_id = %s
                    AND uw_version_id = %s
                    AND period_month = ANY(%s::date[])
                """,
                (env_id, str(business_id), budget_version_id, month_dates),
            )
            bud_set = {r["asset_id"] for r in cur.fetchall()}

        # Check proforma coverage
        pf_set: set[str] = set()
        if proforma_version_id:
            cur.execute(
                """
                SELECT DISTINCT asset_id::text
                FROM uw_noi_budget_monthly
                WHERE env_id = %s AND business_id = %s
                    AND uw_version_id = %s
                    AND period_month = ANY(%s::date[])
                """,
                (env_id, str(business_id), proforma_version_id, month_dates),
            )
            pf_set = {r["asset_id"] for r in cur.fetchall()}

        # Check actuals coverage
        cur.execute(
            """
            SELECT DISTINCT asset_id::text
            FROM acct_normalized_noi_monthly
            WHERE env_id = %s AND business_id = %s
                AND period_month = ANY(%s::date[])
            """,
            (env_id, str(business_id), month_dates),
        )
        act_set = {r["asset_id"] for r in cur.fetchall()}

        # Check variance coverage
        cur.execute(
            """
            SELECT DISTINCT asset_id::text
            FROM re_asset_variance_qtr
            WHERE env_id = %s AND business_id = %s
                AND quarter = ANY(%s::text[])
            """,
            (env_id, str(business_id), required_quarters),
        )
        var_set = {r["asset_id"] for r in cur.fetchall()}

        all_ids = set(all_assets.keys())
        missing_budget = sorted(all_assets[a] for a in all_ids - bud_set)
        missing_proforma = sorted(all_assets[a] for a in all_ids - pf_set)
        missing_actuals = sorted(all_assets[a] for a in all_ids - act_set)
        missing_variance = sorted(all_assets[a] for a in all_ids - var_set)

        return {
            "total_assets": len(all_assets),
            "assets_with_budget": len(bud_set),
            "assets_with_proforma": len(pf_set),
            "assets_with_actuals": len(act_set),
            "assets_with_variance": len(var_set),
            "missing_budget": missing_budget,
            "missing_proforma": missing_proforma,
            "missing_actuals": missing_actuals,
            "missing_variance": missing_variance,
            "passed": len(missing_budget) == 0 and len(missing_actuals) == 0,
        }


def inspect_repe_integrity(*, fund_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        deal_params: list[str] = [str(fund_id)] if fund_id else []
        if fund_id:
            cur.execute(
                """
                SELECT d.deal_id, d.name, d.fund_id, COUNT(a.asset_id) AS asset_count
                FROM repe_deal d
                LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
                WHERE d.fund_id = %s
                GROUP BY d.deal_id, d.name, d.fund_id
                HAVING COUNT(a.asset_id) = 0
                ORDER BY d.created_at
                """,
                deal_params,
            )
        else:
            cur.execute(
                """
                SELECT d.deal_id, d.name, d.fund_id, COUNT(a.asset_id) AS asset_count
                FROM repe_deal d
                LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
                GROUP BY d.deal_id, d.name, d.fund_id
                HAVING COUNT(a.asset_id) = 0
                ORDER BY d.created_at
                """
            )
        no_asset_rows = cur.fetchall()

        cur.execute(
            """
            SELECT a.asset_id, a.name, a.deal_id
            FROM repe_asset a
            LEFT JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.deal_id IS NULL
            ORDER BY a.created_at
            """
        )
        orphan_asset_rows = cur.fetchall()

        if fund_id:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM repe_deal d
                LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE d.fund_id = %s AND f.fund_id IS NULL
                """,
                deal_params,
            )
        else:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM repe_deal d
                LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE f.fund_id IS NULL
                """
            )
        orphan_investment_count = cur.fetchone()["count"]

    return {
        "status": "ok" if not no_asset_rows and not orphan_asset_rows and orphan_investment_count == 0 else "error",
        "fund_id": str(fund_id) if fund_id else None,
        "orphan_investments": {
            "count": int(orphan_investment_count),
        },
        "orphan_assets": {
            "count": len(orphan_asset_rows),
            "asset_ids": [str(row["asset_id"]) for row in orphan_asset_rows],
        },
        "investments_without_assets": {
            "count": len(no_asset_rows),
            "investment_ids": [str(row["deal_id"]) for row in no_asset_rows],
        },
    }
