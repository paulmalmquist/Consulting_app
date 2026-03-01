from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.irr_engine import xirr
from app.services import re_scenario
from app.services import re_sustainability_connectors as connectors
from app.services import re_sustainability_validation as validation


ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _d(value: object | None) -> Decimal:
    return Decimal(str(value or 0))


def _q(value: Decimal | None) -> Decimal | None:
    return Decimal(value).quantize(Decimal("0.000000000001")) if value is not None else None


def _quarter_to_year(quarter: str) -> int:
    return int(str(quarter)[:4])


def _quarter_end_date(quarter: str) -> date:
    year = _quarter_to_year(quarter)
    q = int(str(quarter)[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def _compute_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _upsert_issue(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    asset_id: UUID | None,
    utility_monthly_id: UUID | None,
    source_table: str,
    source_row_ref: str,
    severity: str,
    issue_code: str,
    message: str,
    blocked: bool,
) -> None:
    cur.execute(
        """
        SELECT data_quality_issue_id
        FROM sus_data_quality_issue
        WHERE COALESCE(asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(utility_monthly_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
          AND source_table = %s
          AND issue_code = %s
          AND source_row_ref = %s
          AND resolved_at IS NULL
        LIMIT 1
        """,
        (
            str(asset_id) if asset_id else None,
            str(utility_monthly_id) if utility_monthly_id else None,
            source_table,
            issue_code,
            source_row_ref,
        ),
    )
    if cur.fetchone():
        return

    cur.execute(
        """
        INSERT INTO sus_data_quality_issue (
          env_id, business_id, asset_id, utility_monthly_id, source_table, source_row_ref,
          severity, issue_code, message, blocked
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            env_id,
            str(business_id),
            str(asset_id) if asset_id else None,
            str(utility_monthly_id) if utility_monthly_id else None,
            source_table,
            source_row_ref,
            severity,
            issue_code,
            message,
            blocked,
        ),
    )


def _resolve_asset_context(cur, *, asset_id: UUID) -> dict:
    cur.execute(
        """
        SELECT
          a.asset_id::text,
          a.asset_type,
          a.name AS asset_name,
          a.deal_id::text AS investment_id,
          d.name AS investment_name,
          d.fund_id::text AS fund_id,
          f.name AS fund_name,
          f.business_id::text AS business_id,
          COALESCE(ebb.env_id::text, f.business_id::text) AS env_id,
          pa.property_type,
          COALESCE(sp.square_feet, pa.gross_sf) AS square_feet
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
        LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
        LEFT JOIN sus_asset_profile sp ON sp.asset_id = a.asset_id
        WHERE a.asset_id = %s
        LIMIT 1
        """,
        (str(asset_id),),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"Asset {asset_id} not found")
    return row


def _resolve_investment_context(cur, *, investment_id: UUID) -> dict:
    cur.execute(
        """
        SELECT
          d.deal_id::text AS investment_id,
          d.name AS investment_name,
          d.deal_type,
          d.fund_id::text AS fund_id,
          f.name AS fund_name,
          f.business_id::text AS business_id,
          COALESCE(ebb.env_id::text, f.business_id::text) AS env_id
        FROM repe_deal d
        JOIN repe_fund f ON f.fund_id = d.fund_id
        LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
        WHERE d.deal_id = %s
        LIMIT 1
        """,
        (str(investment_id),),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"Investment {investment_id} not found")
    return row


def _resolve_fund_context(cur, *, fund_id: UUID) -> dict:
    cur.execute(
        """
        SELECT
          f.fund_id::text,
          f.name AS fund_name,
          f.business_id::text AS business_id,
          COALESCE(ebb.env_id::text, f.business_id::text) AS env_id
        FROM repe_fund f
        LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
        WHERE f.fund_id = %s
        LIMIT 1
        """,
        (str(fund_id),),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"Fund {fund_id} not found")
    return row


def _assert_scope(context: dict, *, env_id: str, business_id: UUID) -> None:
    if str(context["business_id"]) != str(business_id):
        raise ValueError("Asset/fund ownership does not match the active business.")
    if str(context["env_id"]) != str(env_id):
        raise ValueError("Asset/fund ownership does not match the active environment.")


def _ensure_property_asset(context: dict) -> None:
    if context.get("asset_type") != "property":
        raise ValueError("Sustainability is only applicable to property assets.")


def _latest_profile_row(cur, asset_id: UUID) -> dict | None:
    cur.execute("SELECT * FROM sus_asset_profile WHERE asset_id = %s", (str(asset_id),))
    return cur.fetchone()


def _refresh_profile_status(cur, *, asset_id: UUID) -> str | None:
    cur.execute(
        """
        SELECT blocked, severity
        FROM sus_data_quality_issue
        WHERE asset_id = %s AND resolved_at IS NULL
        """,
        (str(asset_id),),
    )
    issues = cur.fetchall()
    if not issues:
        status = "complete"
    elif any(bool(row["blocked"]) for row in issues):
        status = "blocked"
    else:
        status = "review"
    cur.execute(
        """
        UPDATE sus_asset_profile
        SET data_quality_status = %s,
            last_calculated_at = now()
        WHERE asset_id = %s
        """,
        (status, str(asset_id)),
    )
    return status


def _refresh_profile_certification_summary(cur, *, asset_id: UUID) -> None:
    cur.execute(
        """
        SELECT certification_type, level, score
        FROM sus_asset_certification
        WHERE asset_id = %s AND status = 'active'
        ORDER BY COALESCE(issued_on, DATE '1900-01-01') DESC, created_at DESC
        LIMIT 1
        """,
        (str(asset_id),),
    )
    row = cur.fetchone()
    if not row:
        return
    cert_type = row.get("certification_type")
    cur.execute(
        """
        UPDATE sus_asset_profile
        SET building_certification = %s,
            leed_level = CASE WHEN upper(%s) = 'LEED' THEN %s ELSE leed_level END,
            energy_star_score = CASE WHEN upper(%s) = 'ENERGY_STAR' THEN %s ELSE energy_star_score END
        WHERE asset_id = %s
        """,
        (
            cert_type.lower() if cert_type else None,
            cert_type,
            row.get("level"),
            cert_type,
            row.get("score"),
            str(asset_id),
        ),
    )


def _lookup_emission_factor(cur, *, utility_type: str, year: int, asset_name: str | None) -> dict | None:
    region_code = connectors.default_region_for_asset(asset_name)
    country_code = connectors.default_country_for_asset(asset_name)
    cur.execute(
        """
        SELECT f.*, s.source_name, s.version_label
        FROM sus_emission_factor f
        JOIN sus_emission_factor_set s ON s.factor_set_id = f.factor_set_id
        WHERE f.utility_type = %s
          AND f.year = %s
          AND (
            (f.region_code = %s AND COALESCE(f.country_code, %s) = %s)
            OR (f.region_code = %s)
            OR f.region_code IS NULL
          )
        ORDER BY
          CASE
            WHEN f.region_code = %s THEN 0
            WHEN f.region_code = %s THEN 1
            WHEN f.region_code IS NULL THEN 2
            ELSE 3
          END,
          s.published_at DESC NULLS LAST,
          f.created_at DESC
        LIMIT 1
        """,
        (
            utility_type,
            year,
            region_code,
            country_code,
            country_code,
            country_code,
            region_code,
            country_code,
        ),
    )
    return cur.fetchone()


def ensure_asset_profile(*, asset_id: UUID) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        cur.execute("SELECT * FROM sus_asset_profile WHERE asset_id = %s", (str(asset_id),))
        row = cur.fetchone()
        if row:
            return row

        cur.execute(
            """
            INSERT INTO sus_asset_profile (
              asset_id, env_id, business_id, property_type, square_feet, year_built,
              data_quality_status, last_calculated_at
            )
            VALUES (%s, %s, %s, %s, %s, NULL, 'review', now())
            RETURNING *
            """,
            (
                str(asset_id),
                context["env_id"],
                context["business_id"],
                context.get("property_type"),
                context.get("square_feet"),
            ),
        )
        row = cur.fetchone()
        return row


def get_asset_profile(*, asset_id: UUID) -> dict:
    return ensure_asset_profile(asset_id=asset_id)


def upsert_asset_profile(*, asset_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        _assert_scope(context, env_id=payload["env_id"], business_id=UUID(str(payload["business_id"])))
        ensure_asset_profile(asset_id=asset_id)
        fields = {
            key: payload.get(key)
            for key in (
                "property_type",
                "square_feet",
                "year_built",
                "last_renovation_year",
                "hvac_type",
                "primary_heating_fuel",
                "primary_cooling_type",
                "lighting_type",
                "roof_type",
                "onsite_generation",
                "solar_kw_installed",
                "battery_storage_kwh",
                "ev_chargers_count",
                "building_certification",
                "energy_star_score",
                "leed_level",
                "wired_score",
                "fitwel_score",
                "last_audit_date",
            )
        }
        assignments = ", ".join(f"{key} = %s" for key in fields.keys())
        cur.execute(
            f"""
            UPDATE sus_asset_profile
            SET {assignments},
                env_id = %s,
                business_id = %s,
                last_calculated_at = now()
            WHERE asset_id = %s
            RETURNING *
            """,
            list(fields.values())
            + [payload["env_id"], str(payload["business_id"]), str(asset_id)],
        )
        row = cur.fetchone()
        square_feet_issue = validation.missing_square_feet_issue(_d(row.get("square_feet")) if row.get("square_feet") is not None else None)
        if square_feet_issue:
            _upsert_issue(
                cur,
                env_id=row["env_id"],
                business_id=UUID(str(row["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=None,
                source_table="sus_asset_profile",
                source_row_ref=str(asset_id),
                severity=square_feet_issue["severity"],
                issue_code=square_feet_issue["issue_code"],
                message=square_feet_issue["message"],
                blocked=square_feet_issue["blocked"],
            )
        _refresh_profile_status(cur, asset_id=asset_id)
        cur.execute("SELECT * FROM sus_asset_profile WHERE asset_id = %s", (str(asset_id),))
        return cur.fetchone()


def list_utility_accounts(*, asset_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        cur.execute(
            """
            SELECT *
            FROM sus_utility_account
            WHERE asset_id = %s
            ORDER BY utility_type, provider_name, account_number
            """,
            (str(asset_id),),
        )
        return cur.fetchall()


def create_utility_account(*, asset_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        _assert_scope(context, env_id=payload["env_id"], business_id=UUID(str(payload["business_id"])))
        cur.execute(
            """
            SELECT utility_account_id
            FROM sus_utility_account
            WHERE asset_id = %s
              AND utility_type = %s
              AND provider_name = %s
              AND account_number = %s
              AND COALESCE(meter_id, '') = COALESCE(%s, '')
            LIMIT 1
            """,
            (
                str(asset_id),
                payload["utility_type"],
                payload["provider_name"],
                payload["account_number"],
                payload.get("meter_id"),
            ),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                UPDATE sus_utility_account
                SET billing_frequency = %s,
                    rate_structure = %s,
                    demand_charge_applicable = %s,
                    is_active = %s
                WHERE utility_account_id = %s
                RETURNING *
                """,
                (
                    payload.get("billing_frequency"),
                    payload.get("rate_structure"),
                    payload.get("demand_charge_applicable", False),
                    payload.get("is_active", True),
                    existing["utility_account_id"],
                ),
            )
            return cur.fetchone()

        cur.execute(
            """
            INSERT INTO sus_utility_account (
              asset_id, env_id, business_id, utility_type, provider_name, account_number,
              meter_id, billing_frequency, rate_structure, demand_charge_applicable, is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(asset_id),
                payload["env_id"],
                str(payload["business_id"]),
                payload["utility_type"],
                payload["provider_name"],
                payload["account_number"],
                payload.get("meter_id"),
                payload.get("billing_frequency"),
                payload.get("rate_structure"),
                payload.get("demand_charge_applicable", False),
                payload.get("is_active", True),
            ),
        )
        return cur.fetchone()


def list_utility_monthly(*, asset_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        cur.execute(
            """
            SELECT *
            FROM sus_utility_monthly
            WHERE asset_id = %s
            ORDER BY year DESC, month DESC, utility_type, created_at DESC
            LIMIT 120
            """,
            (str(asset_id),),
        )
        return cur.fetchall()


def _rebuild_asset_emissions_for_year(cur, *, asset_id: UUID, year: int, strict: bool) -> dict | None:
    context = _resolve_asset_context(cur, asset_id=asset_id)
    _ensure_property_asset(context)
    cur.execute(
        """
        SELECT *
        FROM sus_utility_monthly
        WHERE asset_id = %s AND year = %s
        ORDER BY month ASC, created_at ASC
        """,
        (str(asset_id), year),
    )
    rows = cur.fetchall()
    if not rows:
        return None

    factor_set_id: str | None = None
    scope_1 = Decimal("0")
    scope_2 = Decimal("0")
    scope_3 = Decimal("0")
    energy_kwh_equiv = Decimal("0")

    for row in rows:
        usage_kwh_equiv = _d(row.get("usage_kwh_equiv"))
        energy_kwh_equiv += usage_kwh_equiv
        utility_type = row["utility_type"]
        factor_row = None
        if row.get("emission_factor_id"):
            cur.execute(
                """
                SELECT ef.*, efs.factor_set_id::text AS factor_set_id
                FROM sus_emission_factor ef
                JOIN sus_emission_factor_set efs ON efs.factor_set_id = ef.factor_set_id
                WHERE ef.emission_factor_id = %s
                LIMIT 1
                """,
                (str(row["emission_factor_id"]),),
            )
            factor_row = cur.fetchone()
        elif utility_type in ("electric", "gas", "steam", "district"):
            issue = {
                "severity": "error",
                "issue_code": "MISSING_EMISSION_FACTOR",
                "message": "Missing emission factor blocks annual emissions aggregation.",
                "blocked": True,
            }
            _upsert_issue(
                cur,
                env_id=context["env_id"],
                business_id=UUID(str(context["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=UUID(str(row["utility_monthly_id"])),
                source_table="sus_utility_monthly",
                source_row_ref=str(row["utility_monthly_id"]),
                severity=issue["severity"],
                issue_code=issue["issue_code"],
                message=issue["message"],
                blocked=issue["blocked"],
            )
            if strict:
                raise ValueError("Missing emission factor blocks annual emissions aggregation.")

        if factor_row:
            factor_set_id = factor_row["factor_set_id"]
            if utility_type == "electric":
                location = _d(row.get("location_based_emissions")) or (_d(row.get("usage_kwh")) * _d(factor_row.get("location_based_factor")))
                market = _d(row.get("market_based_emissions")) or (_d(row.get("usage_kwh")) * _d(factor_row.get("market_based_factor") or factor_row.get("location_based_factor")))
                scope_2 += location
                # keep market-based value in the monthly row; annual stays location-based total
                if market and row.get("market_based_emissions") is None:
                    cur.execute(
                        """
                        UPDATE sus_utility_monthly
                        SET market_based_emissions = %s,
                            location_based_emissions = %s,
                            emission_factor_used = %s
                        WHERE utility_monthly_id = %s
                        """,
                        (
                            _q(market),
                            _q(location),
                            _q(_d(factor_row.get("location_based_factor"))),
                            str(row["utility_monthly_id"]),
                        ),
                    )
            elif utility_type in ("gas", "steam", "district"):
                scope_1 += _d(row.get("scope_1_emissions_tons")) or (_d(row.get("usage_therms")) * _d(factor_row.get("location_based_factor")))
        else:
            scope_1 += _d(row.get("scope_1_emissions_tons"))
            scope_2 += _d(row.get("scope_2_emissions_tons")) or _d(row.get("location_based_emissions"))

    total = scope_1 + scope_2 + scope_3
    profile = _latest_profile_row(cur, asset_id) or {}
    square_feet = _d(profile.get("square_feet")) if profile.get("square_feet") is not None else None
    intensity = None
    if square_feet and square_feet > 0:
        intensity = (total / square_feet).quantize(Decimal("0.000000000001"))
    else:
        issue = validation.missing_square_feet_issue(square_feet)
        if issue:
            _upsert_issue(
                cur,
                env_id=context["env_id"],
                business_id=UUID(str(context["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=None,
                source_table="sus_asset_profile",
                source_row_ref=str(asset_id),
                severity=issue["severity"],
                issue_code=issue["issue_code"],
                message=issue["message"],
                blocked=issue["blocked"],
            )

    band_issue = validation.intensity_band_issue(
        property_type=profile.get("property_type") or context.get("property_type"),
        emissions_intensity_per_sf=intensity,
    )
    if band_issue:
        _upsert_issue(
            cur,
            env_id=context["env_id"],
            business_id=UUID(str(context["business_id"])),
            asset_id=asset_id,
            utility_monthly_id=None,
            source_table="sus_asset_emissions_annual",
            source_row_ref=f"{asset_id}:{year}",
            severity=band_issue["severity"],
            issue_code=band_issue["issue_code"],
            message=band_issue["message"],
            blocked=band_issue["blocked"],
        )

    source_hash = _compute_hash(
        {
            "asset_id": str(asset_id),
            "year": year,
            "rows": [str(row["utility_monthly_id"]) for row in rows],
            "factor_set_id": factor_set_id,
        }
    )
    factor_set_id = factor_set_id or "28700000-0000-0000-0000-000000000001"
    cur.execute(
        """
        INSERT INTO sus_asset_emissions_annual (
          asset_id, env_id, business_id, year, factor_set_id,
          scope_1, scope_2, scope_3, total_emissions,
          emissions_intensity_per_sf, emissions_intensity_per_revenue, source_hash
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s)
        ON CONFLICT (asset_id, year, factor_set_id)
        DO UPDATE SET
          scope_1 = EXCLUDED.scope_1,
          scope_2 = EXCLUDED.scope_2,
          scope_3 = EXCLUDED.scope_3,
          total_emissions = EXCLUDED.total_emissions,
          emissions_intensity_per_sf = EXCLUDED.emissions_intensity_per_sf,
          source_hash = EXCLUDED.source_hash,
          created_at = now()
        RETURNING *
        """,
        (
            str(asset_id),
            context["env_id"],
            context["business_id"],
            year,
            factor_set_id,
            _q(scope_1),
            _q(scope_2),
            _q(scope_3),
            _q(total),
            _q(intensity),
            source_hash,
        ),
    )
    return cur.fetchone()


def upsert_utility_monthly(*, asset_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        _assert_scope(context, env_id=payload["env_id"], business_id=UUID(str(payload["business_id"])))
        ensure_asset_profile(asset_id=asset_id)

        base_issues = validation.non_negative_issues(payload)
        for issue in base_issues:
            _upsert_issue(
                cur,
                env_id=payload["env_id"],
                business_id=UUID(str(payload["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=None,
                source_table="sus_utility_monthly",
                source_row_ref=f"{asset_id}:{payload['year']}-{payload['month']}",
                severity=issue["severity"],
                issue_code=issue["issue_code"],
                message=issue["message"],
                blocked=issue["blocked"],
            )
        if any(issue["blocked"] for issue in base_issues):
            raise ValueError("Negative usage or cost values are not allowed.")

        usage_kwh = _d(payload.get("usage_kwh"))
        usage_therms = _d(payload.get("usage_therms"))
        usage_kwh_equiv = usage_kwh + (usage_therms * Decimal("29.3001"))

        cur.execute(
            """
            SELECT usage_kwh_equiv
            FROM sus_utility_monthly
            WHERE asset_id = %s
              AND utility_type = %s
              AND (year < %s OR (year = %s AND month < %s))
            ORDER BY year DESC, month DESC, created_at DESC
            LIMIT 1
            """,
            (
                str(asset_id),
                payload["utility_type"],
                payload["year"],
                payload["year"],
                payload["month"],
            ),
        )
        previous_row = cur.fetchone()
        spike_issue = validation.eui_spike_issue(
            previous_usage_kwh_equiv=_d(previous_row["usage_kwh_equiv"]) if previous_row and previous_row.get("usage_kwh_equiv") is not None else None,
            current_usage_kwh_equiv=usage_kwh_equiv,
        )

        factor_row = None
        emission_factor_id = payload.get("emission_factor_id")
        if emission_factor_id:
            cur.execute(
                """
                SELECT ef.*, efs.factor_set_id::text AS factor_set_id
                FROM sus_emission_factor ef
                JOIN sus_emission_factor_set efs ON efs.factor_set_id = ef.factor_set_id
                WHERE ef.emission_factor_id = %s
                LIMIT 1
                """,
                (str(emission_factor_id),),
            )
            factor_row = cur.fetchone()
        else:
            factor_row = _lookup_emission_factor(
                cur,
                utility_type=payload["utility_type"],
                year=payload["year"],
                asset_name=context.get("asset_name"),
            )
            emission_factor_id = factor_row.get("emission_factor_id") if factor_row else None

        location_emissions = payload.get("location_based_emissions")
        market_emissions = payload.get("market_based_emissions")
        scope_1 = payload.get("scope_1_emissions_tons")
        scope_2 = payload.get("scope_2_emissions_tons")
        emission_factor_used = payload.get("emission_factor_used")
        if factor_row:
            if payload["utility_type"] == "electric":
                if location_emissions is None:
                    location_emissions = (usage_kwh * _d(factor_row.get("location_based_factor"))).quantize(Decimal("0.000001"))
                if market_emissions is None:
                    market_emissions = (usage_kwh * _d(factor_row.get("market_based_factor") or factor_row.get("location_based_factor"))).quantize(Decimal("0.000001"))
                if scope_2 is None:
                    scope_2 = location_emissions
            elif payload["utility_type"] in ("gas", "steam", "district"):
                if scope_1 is None:
                    scope_1 = (usage_therms * _d(factor_row.get("location_based_factor"))).quantize(Decimal("0.000001"))
            if emission_factor_used is None:
                emission_factor_used = _d(factor_row.get("location_based_factor"))

        cur.execute(
            """
            SELECT utility_monthly_id
            FROM sus_utility_monthly
            WHERE asset_id = %s
              AND utility_type = %s
              AND year = %s
              AND month = %s
              AND COALESCE(utility_account_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  = COALESCE(%s, '00000000-0000-0000-0000-000000000000'::uuid)
            LIMIT 1
            """,
            (
                str(asset_id),
                payload["utility_type"],
                payload["year"],
                payload["month"],
                str(payload["utility_account_id"]) if payload.get("utility_account_id") else None,
            ),
        )
        existing = cur.fetchone()

        params = (
            str(asset_id),
            str(payload["utility_account_id"]) if payload.get("utility_account_id") else None,
            payload["env_id"],
            str(payload["business_id"]),
            payload["utility_type"],
            payload["year"],
            payload["month"],
            payload.get("usage_kwh"),
            payload.get("usage_therms"),
            payload.get("usage_gallons"),
            payload.get("peak_kw"),
            payload.get("cost_total"),
            payload.get("demand_charges"),
            payload.get("supply_charges"),
            payload.get("taxes_fees"),
            scope_1,
            scope_2,
            market_emissions,
            location_emissions,
            emission_factor_used,
            str(emission_factor_id) if emission_factor_id else None,
            str(payload.get("ingestion_run_id")) if payload.get("ingestion_run_id") else None,
            payload.get("data_source", "manual"),
            _q(usage_kwh_equiv),
            payload.get("renewable_pct"),
            "review" if spike_issue else "complete",
        )
        if existing:
            cur.execute(
                """
                UPDATE sus_utility_monthly
                SET utility_account_id = %s,
                    env_id = %s,
                    business_id = %s,
                    usage_kwh = %s,
                    usage_therms = %s,
                    usage_gallons = %s,
                    peak_kw = %s,
                    cost_total = %s,
                    demand_charges = %s,
                    supply_charges = %s,
                    taxes_fees = %s,
                    scope_1_emissions_tons = %s,
                    scope_2_emissions_tons = %s,
                    market_based_emissions = %s,
                    location_based_emissions = %s,
                    emission_factor_used = %s,
                    emission_factor_id = %s,
                    ingestion_run_id = %s,
                    data_source = %s,
                    usage_kwh_equiv = %s,
                    renewable_pct = %s,
                    quality_status = %s,
                    created_at = now()
                WHERE utility_monthly_id = %s
                RETURNING *
                """,
                (
                    params[1],
                    params[2],
                    params[3],
                    params[7],
                    params[8],
                    params[9],
                    params[10],
                    params[11],
                    params[12],
                    params[13],
                    params[14],
                    params[15],
                    params[16],
                    params[17],
                    params[18],
                    params[19],
                    params[20],
                    params[21],
                    params[22],
                    params[23],
                    params[24],
                    params[25],
                    params[26],
                    str(existing["utility_monthly_id"]),
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO sus_utility_monthly (
                  asset_id, utility_account_id, env_id, business_id, utility_type, year, month,
                  usage_kwh, usage_therms, usage_gallons, peak_kw, cost_total, demand_charges,
                  supply_charges, taxes_fees, scope_1_emissions_tons, scope_2_emissions_tons,
                  market_based_emissions, location_based_emissions, emission_factor_used,
                  emission_factor_id, ingestion_run_id, data_source, usage_kwh_equiv, renewable_pct,
                  quality_status
                )
                VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  %s
                )
                RETURNING *
                """,
                params,
            )
        row = cur.fetchone()

        if spike_issue:
            _upsert_issue(
                cur,
                env_id=row["env_id"],
                business_id=UUID(str(row["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=UUID(str(row["utility_monthly_id"])),
                source_table="sus_utility_monthly",
                source_row_ref=str(row["utility_monthly_id"]),
                severity=spike_issue["severity"],
                issue_code=spike_issue["issue_code"],
                message=spike_issue["message"],
                blocked=spike_issue["blocked"],
            )

        if not factor_row and payload["utility_type"] in ("electric", "gas", "steam", "district"):
            _upsert_issue(
                cur,
                env_id=row["env_id"],
                business_id=UUID(str(row["business_id"])),
                asset_id=asset_id,
                utility_monthly_id=UUID(str(row["utility_monthly_id"])),
                source_table="sus_utility_monthly",
                source_row_ref=str(row["utility_monthly_id"]),
                severity="error",
                issue_code="MISSING_EMISSION_FACTOR",
                message="Missing emission factor blocks annual emissions aggregation.",
                blocked=True,
            )

        try:
            _rebuild_asset_emissions_for_year(cur, asset_id=asset_id, year=int(payload["year"]), strict=False)
        except ValueError:
            pass
        _refresh_profile_status(cur, asset_id=asset_id)
        return row


def list_certifications(*, asset_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        cur.execute(
            """
            SELECT *
            FROM sus_asset_certification
            WHERE asset_id = %s
            ORDER BY COALESCE(issued_on, DATE '1900-01-01') DESC, created_at DESC
            """,
            (str(asset_id),),
        )
        return cur.fetchall()


def create_certification(*, asset_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        _assert_scope(context, env_id=payload["env_id"], business_id=UUID(str(payload["business_id"])))
        cur.execute(
            """
            SELECT asset_certification_id
            FROM sus_asset_certification
            WHERE asset_id = %s
              AND certification_type = %s
              AND COALESCE(issued_on, DATE '1900-01-01') = COALESCE(%s, DATE '1900-01-01')
            LIMIT 1
            """,
            (str(asset_id), payload["certification_type"], payload.get("issued_on")),
        )
        existing = cur.fetchone()
        if existing:
            raise ValueError("Duplicate certification type for the same issue date is not allowed.")
        cur.execute(
            """
            INSERT INTO sus_asset_certification (
              asset_id, env_id, business_id, certification_type, level, score,
              issued_on, expires_on, status, evidence_document_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(asset_id),
                payload["env_id"],
                str(payload["business_id"]),
                payload["certification_type"],
                payload.get("level"),
                payload.get("score"),
                payload.get("issued_on"),
                payload.get("expires_on"),
                payload.get("status", "active"),
                str(payload.get("evidence_document_id")) if payload.get("evidence_document_id") else None,
            ),
        )
        row = cur.fetchone()
        _refresh_profile_certification_summary(cur, asset_id=asset_id)
        return row


def list_regulatory_exposure(*, asset_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        cur.execute(
            """
            SELECT *
            FROM sus_regulatory_exposure
            WHERE asset_id = %s
            ORDER BY target_year NULLS LAST, created_at DESC
            """,
            (str(asset_id),),
        )
        return cur.fetchall()


def create_regulatory_exposure(*, asset_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        _ensure_property_asset(context)
        _assert_scope(context, env_id=payload["env_id"], business_id=UUID(str(payload["business_id"])))
        cur.execute(
            """
            INSERT INTO sus_regulatory_exposure (
              asset_id, env_id, business_id, regulation_id, regulation_name,
              compliance_status, target_year, estimated_penalty, estimated_upgrade_cost,
              assessed_at, methodology_note
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (asset_id, regulation_name, target_year)
            DO UPDATE SET
              regulation_id = EXCLUDED.regulation_id,
              compliance_status = EXCLUDED.compliance_status,
              estimated_penalty = EXCLUDED.estimated_penalty,
              estimated_upgrade_cost = EXCLUDED.estimated_upgrade_cost,
              assessed_at = EXCLUDED.assessed_at,
              methodology_note = EXCLUDED.methodology_note,
              created_at = now()
            RETURNING *
            """,
            (
                str(asset_id),
                payload["env_id"],
                str(payload["business_id"]),
                str(payload["regulation_id"]) if payload.get("regulation_id") else None,
                payload["regulation_name"],
                payload["compliance_status"],
                payload.get("target_year"),
                payload.get("estimated_penalty"),
                payload.get("estimated_upgrade_cost"),
                payload.get("assessed_at"),
                payload.get("methodology_note"),
            ),
        )
        return cur.fetchone()


def list_emission_factor_sets() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM sus_emission_factor_set
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            """
        )
        return cur.fetchall()


def create_emission_factor_set(*, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO sus_emission_factor_set (
              source_name, version_label, methodology, published_at, effective_from, effective_to
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_name, version_label)
            DO UPDATE SET
              methodology = EXCLUDED.methodology,
              published_at = EXCLUDED.published_at,
              effective_from = EXCLUDED.effective_from,
              effective_to = EXCLUDED.effective_to
            RETURNING *
            """,
            (
                payload["source_name"],
                payload["version_label"],
                payload.get("methodology"),
                payload.get("published_at"),
                payload.get("effective_from"),
                payload.get("effective_to"),
            ),
        )
        return cur.fetchone()


def list_open_issues(*, env_id: str, business_id: UUID, asset_id: UUID | None = None) -> list[dict]:
    with get_cursor() as cur:
        params: list[str] = [env_id, str(business_id)]
        where = ["env_id = %s", "business_id = %s", "resolved_at IS NULL"]
        if asset_id:
            where.append("asset_id = %s")
            params.append(str(asset_id))
        cur.execute(
            f"""
            SELECT *
            FROM sus_data_quality_issue
            WHERE {' AND '.join(where)}
            ORDER BY blocked DESC, detected_at DESC
            """,
            params,
        )
        return cur.fetchall()


def get_overview(*, env_id: str, business_id: UUID, quarter: str, scenario_id: UUID | None = None) -> dict:
    year = _quarter_to_year(quarter)
    with get_cursor() as cur:
        if scenario_id:
            cur.execute(
                """
                SELECT
                  COALESCE(sum(total_energy_kwh_equiv), 0) AS total_energy_kwh_equiv,
                  COALESCE(sum(total_emissions), 0) AS total_emissions,
                  COALESCE(sum(total_utility_cost), 0) AS total_utility_cost,
                  avg(renewable_pct) FILTER (WHERE renewable_pct IS NOT NULL) AS renewable_pct,
                  avg(emissions_intensity_per_sf) FILTER (WHERE emissions_intensity_per_sf IS NOT NULL) AS emissions_intensity_per_sf,
                  max(last_calculated_at) AS last_calculated_at,
                  count(*) AS row_count
                FROM sus_portfolio_footprint_v
                WHERE env_id = %s AND business_id = %s AND year = %s AND scenario_id = %s
                """,
                (env_id, str(business_id), year, str(scenario_id)),
            )
        else:
            cur.execute(
                """
                SELECT
                  COALESCE(sum(total_energy_kwh_equiv), 0) AS total_energy_kwh_equiv,
                  COALESCE(sum(total_emissions), 0) AS total_emissions,
                  COALESCE(sum(total_utility_cost), 0) AS total_utility_cost,
                  avg(renewable_pct) FILTER (WHERE renewable_pct IS NOT NULL) AS renewable_pct,
                  avg(emissions_intensity_per_sf) FILTER (WHERE emissions_intensity_per_sf IS NOT NULL) AS emissions_intensity_per_sf,
                  max(last_calculated_at) AS last_calculated_at,
                  count(*) AS row_count
                FROM sus_portfolio_footprint_v
                WHERE env_id = %s AND business_id = %s AND year = %s AND scenario_id IS NULL
                """,
                (env_id, str(business_id), year),
            )
        summary = cur.fetchone() or {}
        cur.execute(
            """
            SELECT count(*) AS open_issue_count,
                   count(*) FILTER (WHERE blocked = true) AS blocked_issue_count
            FROM sus_data_quality_issue
            WHERE env_id = %s AND business_id = %s AND resolved_at IS NULL
            """,
            (env_id, str(business_id)),
        )
        issues = cur.fetchone() or {}
        cur.execute(
            """
            SELECT count(*) AS assets_with_solar
            FROM sus_asset_profile
            WHERE env_id = %s AND business_id = %s AND onsite_generation = true
            """,
            (env_id, str(business_id)),
        )
        solar = cur.fetchone() or {}
        return {
            "quarter": quarter,
            "year": year,
            "top_cards": {
                "total_annual_energy_kwh_equiv": summary.get("total_energy_kwh_equiv") or 0,
                "total_emissions_tons": summary.get("total_emissions") or 0,
                "emissions_intensity_per_sf": summary.get("emissions_intensity_per_sf"),
                "total_utility_cost": summary.get("total_utility_cost") or 0,
                "renewable_pct": summary.get("renewable_pct"),
                "assets_with_solar": solar.get("assets_with_solar") or 0,
            },
            "audit_timestamp": summary.get("last_calculated_at"),
            "open_issues": int(issues.get("open_issue_count") or 0),
            "context": {
                "env_id": env_id,
                "business_id": str(business_id),
                "blocked_issue_count": int(issues.get("blocked_issue_count") or 0),
                "scenario_id": str(scenario_id) if scenario_id else None,
                "footprint_rows": int(summary.get("row_count") or 0),
            },
        }


def get_fund_portfolio_footprint(*, fund_id: UUID, year: int, scenario_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        context = _resolve_fund_context(cur, fund_id=fund_id)
        params: list[str] = [context["env_id"], context["business_id"], str(fund_id), str(year)]
        scenario_filter = "scenario_id IS NULL"
        if scenario_id:
            scenario_filter = "scenario_id = %s"
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT
              COALESCE(sum(total_energy_kwh_equiv), 0) AS total_energy_kwh_equiv,
              COALESCE(sum(total_emissions), 0) AS total_emissions,
              COALESCE(sum(total_utility_cost), 0) AS total_utility_cost,
              avg(renewable_pct) FILTER (WHERE renewable_pct IS NOT NULL) AS renewable_pct,
              avg(emissions_intensity_per_sf) FILTER (WHERE emissions_intensity_per_sf IS NOT NULL) AS emissions_intensity_per_sf,
              max(last_calculated_at) AS last_calculated_at,
              count(*) AS investment_rows
            FROM sus_portfolio_footprint_v
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND fund_id = %s::uuid
              AND year = %s
              AND {scenario_filter}
            """,
            params,
        )
        summary = cur.fetchone() or {}
        cur.execute(
            f"""
            SELECT
              investment_id::text,
              total_energy_kwh_equiv,
              total_emissions,
              total_utility_cost,
              renewable_pct,
              emissions_intensity_per_sf,
              asset_count,
              last_calculated_at
            FROM sus_portfolio_footprint_v
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND fund_id = %s::uuid
              AND year = %s
              AND {scenario_filter}
            ORDER BY total_emissions DESC, investment_id
            """,
            params,
        )
        investment_rows = cur.fetchall()
        cur.execute(
            """
            SELECT
              a.asset_id::text,
              a.asset_name,
              a.investment_id::text,
              a.energy_kwh_equiv,
              a.total_emissions,
              a.utility_cost_total,
              a.renewable_pct,
              a.emissions_intensity_per_sf,
              a.data_quality_status,
              a.last_calculated_at,
              COALESCE(r.compliance_status, 'compliant') AS compliance_status
            FROM sus_asset_footprint_annual_v a
            LEFT JOIN LATERAL (
              SELECT compliance_status
              FROM sus_regulatory_exposure re
              WHERE re.asset_id = a.asset_id
              ORDER BY assessed_at DESC NULLS LAST, created_at DESC
              LIMIT 1
            ) r ON true
            WHERE a.env_id = %s
              AND a.business_id = %s::uuid
              AND a.fund_id = %s::uuid
              AND a.year = %s
              AND (
                (%s::uuid IS NULL AND a.scenario_id IS NULL)
                OR a.scenario_id = %s::uuid
              )
            ORDER BY a.total_emissions DESC, a.asset_name
            """,
            (
                context["env_id"],
                context["business_id"],
                str(fund_id),
                year,
                str(scenario_id) if scenario_id else None,
                str(scenario_id) if scenario_id else None,
            ),
        )
        asset_rows = cur.fetchall()
        cur.execute(
            """
            SELECT issue_code, message, blocked, detected_at
            FROM sus_data_quality_issue
            WHERE env_id = %s AND business_id = %s::uuid AND resolved_at IS NULL
            ORDER BY blocked DESC, detected_at DESC
            LIMIT 20
            """,
            (context["env_id"], context["business_id"]),
        )
        issues = cur.fetchall()
        return {
            "scope": "fund",
            "summary": {
                "fund_id": str(fund_id),
                "fund_name": context["fund_name"],
                "year": year,
                "scenario_id": str(scenario_id) if scenario_id else None,
                "total_energy_kwh_equiv": summary.get("total_energy_kwh_equiv") or 0,
                "total_emissions": summary.get("total_emissions") or 0,
                "total_utility_cost": summary.get("total_utility_cost") or 0,
                "renewable_pct": summary.get("renewable_pct"),
                "emissions_intensity_per_sf": summary.get("emissions_intensity_per_sf"),
                "last_calculated_at": summary.get("last_calculated_at"),
                "investment_rows": int(summary.get("investment_rows") or 0),
            },
            "investment_rows": investment_rows,
            "asset_rows": asset_rows,
            "issues": issues,
        }


def get_investment_footprint(*, investment_id: UUID, year: int, scenario_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        context = _resolve_investment_context(cur, investment_id=investment_id)
        cur.execute(
            """
            SELECT
              COALESCE(sum(energy_kwh_equiv), 0) AS total_energy_kwh_equiv,
              COALESCE(sum(total_emissions), 0) AS total_emissions,
              COALESCE(sum(utility_cost_total), 0) AS total_utility_cost,
              avg(renewable_pct) FILTER (WHERE renewable_pct IS NOT NULL) AS renewable_pct,
              avg(emissions_intensity_per_sf) FILTER (WHERE emissions_intensity_per_sf IS NOT NULL) AS emissions_intensity_per_sf,
              max(last_calculated_at) AS last_calculated_at,
              count(*) AS asset_rows
            FROM sus_asset_footprint_annual_v
            WHERE investment_id = %s::uuid
              AND year = %s
              AND ((%s::uuid IS NULL AND scenario_id IS NULL) OR scenario_id = %s::uuid)
            """,
            (
                str(investment_id),
                year,
                str(scenario_id) if scenario_id else None,
                str(scenario_id) if scenario_id else None,
            ),
        )
        summary = cur.fetchone() or {}
        cur.execute(
            """
            SELECT
              asset_id::text,
              asset_name,
              energy_kwh_equiv,
              total_emissions,
              utility_cost_total,
              renewable_pct,
              emissions_intensity_per_sf,
              data_quality_status,
              last_calculated_at
            FROM sus_asset_footprint_annual_v
            WHERE investment_id = %s::uuid
              AND year = %s
              AND ((%s::uuid IS NULL AND scenario_id IS NULL) OR scenario_id = %s::uuid)
            ORDER BY total_emissions DESC, asset_name
            """,
            (
                str(investment_id),
                year,
                str(scenario_id) if scenario_id else None,
                str(scenario_id) if scenario_id else None,
            ),
        )
        asset_rows = cur.fetchall()
        return {
            "scope": "investment",
            "summary": {
                "investment_id": str(investment_id),
                "investment_name": context["investment_name"],
                "fund_id": context["fund_id"],
                "fund_name": context["fund_name"],
                "year": year,
                "scenario_id": str(scenario_id) if scenario_id else None,
                "total_energy_kwh_equiv": summary.get("total_energy_kwh_equiv") or 0,
                "total_emissions": summary.get("total_emissions") or 0,
                "total_utility_cost": summary.get("total_utility_cost") or 0,
                "renewable_pct": summary.get("renewable_pct"),
                "emissions_intensity_per_sf": summary.get("emissions_intensity_per_sf"),
                "last_calculated_at": summary.get("last_calculated_at"),
                "asset_rows": int(summary.get("asset_rows") or 0),
            },
            "investment_rows": [],
            "asset_rows": asset_rows,
            "issues": [],
        }


def get_asset_dashboard(*, asset_id: UUID, year: int | None = None, scenario_id: UUID | None = None) -> dict:
    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        if context.get("asset_type") != "property":
            return {
                "asset_id": str(asset_id),
                "not_applicable": True,
                "reason": "Sustainability metrics are only calculated for physical property assets.",
                "cards": {},
                "trends": {},
                "utility_rows": [],
                "issues": [],
                "profile": {},
                "audit_timestamp": None,
            }
        profile = ensure_asset_profile(asset_id=asset_id)
        if year is None:
            cur.execute(
                """
                SELECT COALESCE(max(year), EXTRACT(YEAR FROM now())::int) AS max_year
                FROM sus_asset_footprint_annual_v
                WHERE asset_id = %s
                  AND ((%s::uuid IS NULL AND scenario_id IS NULL) OR scenario_id = %s::uuid)
                """,
                (
                    str(asset_id),
                    str(scenario_id) if scenario_id else None,
                    str(scenario_id) if scenario_id else None,
                ),
            )
            row = cur.fetchone() or {}
            year = int(row.get("max_year") or date.today().year)
        cur.execute(
            """
            SELECT *
            FROM sus_asset_footprint_annual_v
            WHERE asset_id = %s
              AND year = %s
              AND ((%s::uuid IS NULL AND scenario_id IS NULL) OR scenario_id = %s::uuid)
            ORDER BY row_type DESC
            LIMIT 1
            """,
            (
                str(asset_id),
                year,
                str(scenario_id) if scenario_id else None,
                str(scenario_id) if scenario_id else None,
            ),
        )
        annual = cur.fetchone() or {}
        cur.execute(
            """
            SELECT
              year,
              month,
              usage_kwh_equiv,
              COALESCE(location_based_emissions, scope_2_emissions_tons, 0) + COALESCE(scope_1_emissions_tons, 0) AS emissions_total,
              cost_total,
              peak_kw,
              quality_status
            FROM sus_utility_monthly
            WHERE asset_id = %s
            ORDER BY year DESC, month DESC
            LIMIT 36
            """,
            (str(asset_id),),
        )
        monthly = cur.fetchall()
        cur.execute(
            """
            SELECT *
            FROM sus_utility_monthly
            WHERE asset_id = %s
            ORDER BY year DESC, month DESC, utility_type, created_at DESC
            LIMIT 24
            """,
            (str(asset_id),),
        )
        utility_rows = cur.fetchall()
        cur.execute(
            """
            SELECT *
            FROM sus_data_quality_issue
            WHERE asset_id = %s AND resolved_at IS NULL
            ORDER BY blocked DESC, detected_at DESC
            """,
            (str(asset_id),),
        )
        issues = cur.fetchall()
        energy_star = connectors.build_energy_star_snapshot(profile)
        square_feet = _d(profile.get("square_feet")) if profile.get("square_feet") is not None else None
        energy_cost_per_sf = None
        if square_feet and square_feet > 0 and annual.get("utility_cost_total") is not None:
            energy_cost_per_sf = (_d(annual.get("utility_cost_total")) / square_feet).quantize(Decimal("0.000000000001"))
        return {
            "asset_id": str(asset_id),
            "not_applicable": False,
            "reason": None,
            "cards": {
                "total_annual_energy_kwh_equiv": annual.get("energy_kwh_equiv") or 0,
                "total_emissions_tons": annual.get("total_emissions") or 0,
                "emissions_intensity_per_sf": annual.get("emissions_intensity_per_sf"),
                "energy_cost_per_sf": energy_cost_per_sf,
                "renewable_pct": annual.get("renewable_pct"),
                "energy_star_score": profile.get("energy_star_score"),
                "data_quality_status": profile.get("data_quality_status"),
                "compliance_status": next((row.get("compliance_status") for row in list_regulatory_exposure(asset_id=asset_id)), None),
            },
            "trends": {
                "monthly_energy": [
                    {"period": f"{row['year']}-{int(row['month']):02d}", "value": row.get("usage_kwh_equiv") or 0}
                    for row in reversed(monthly)
                ],
                "monthly_emissions": [
                    {"period": f"{row['year']}-{int(row['month']):02d}", "value": row.get("emissions_total") or 0}
                    for row in reversed(monthly)
                ],
                "monthly_costs": [
                    {"period": f"{row['year']}-{int(row['month']):02d}", "value": row.get("cost_total") or 0}
                    for row in reversed(monthly)
                ],
                "energy_star": energy_star,
            },
            "utility_rows": utility_rows,
            "issues": issues,
            "profile": profile,
            "audit_timestamp": annual.get("last_calculated_at") or profile.get("last_calculated_at"),
        }


def compute_asset_adjustments(
    *,
    asset_id: UUID,
    quarter: str,
    scenario_id: UUID | None,
) -> dict:
    zero = {
        "utility_opex_delta": Decimal("0"),
        "carbon_penalty_delta": Decimal("0"),
        "regulatory_penalty_delta": Decimal("0"),
        "project_capex_delta": Decimal("0"),
        "stabilized_noi_delta": Decimal("0"),
        "exit_cap_rate_delta_bps": Decimal("0"),
        "sustainability_inputs_hash": None,
    }
    if not scenario_id:
        return zero

    with get_cursor() as cur:
        context = _resolve_asset_context(cur, asset_id=asset_id)
        if context.get("asset_type") != "property":
            return zero

        assumptions, assumptions_hash = re_scenario.resolve_assumptions(
            scenario_id=scenario_id,
            node_path={
                "fund_id": context.get("fund_id"),
                "investment_id": context.get("investment_id"),
                "asset_id": asset_id,
            },
        )
        year = _quarter_to_year(quarter)
        cur.execute(
            """
            SELECT total_emissions
            FROM sus_asset_footprint_annual_v
            WHERE asset_id = %s
              AND year <= %s
              AND scenario_id IS NULL
            ORDER BY year DESC
            LIMIT 1
            """,
            (str(asset_id), year),
        )
        annual = cur.fetchone() or {}
        total_emissions = _d(annual.get("total_emissions"))
        cur.execute(
            """
            SELECT COALESCE(sum(cost_total), 0) AS annual_cost
            FROM sus_utility_monthly
            WHERE asset_id = %s AND year = %s
            """,
            (str(asset_id), year),
        )
        annual_cost_row = cur.fetchone() or {}
        annual_cost = _d(annual_cost_row.get("annual_cost"))
        cur.execute(
            """
            SELECT COALESCE(sum(capex_amount), 0) AS total_capex
            FROM sus_decarbonization_project
            WHERE asset_id = %s
              AND implementation_status IN ('approved', 'in_progress')
              AND (
                start_date IS NULL OR start_date <= %s
              )
              AND (
                completion_date IS NULL OR completion_date >= %s
              )
            """,
            (str(asset_id), _quarter_end_date(quarter), _quarter_end_date(quarter)),
        )
        project_row = cur.fetchone() or {}
        cur.execute(
            """
            SELECT COALESCE(sum(estimated_penalty), 0) AS penalty
            FROM sus_regulatory_exposure
            WHERE asset_id = %s
              AND compliance_status IN ('at_risk', 'non_compliant')
            """,
            (str(asset_id),),
        )
        reg_row = cur.fetchone() or {}

        utility_inflation = _d(assumptions.get("sus.utility_inflation_rate"))
        energy_efficiency = _d(assumptions.get("sus.energy_efficiency_reduction_pct"))
        solar_generation_kwh = _d(assumptions.get("sus.solar_generation_kwh"))
        carbon_tax = _d(assumptions.get("sus.carbon_tax_per_ton"))
        transition_penalty = _d(assumptions.get("sus.transition_risk_penalty_pct"))
        green_premium_bps = _d(assumptions.get("sus.green_premium_bps"))
        regulatory_override = _d(assumptions.get("sus.regulatory_penalty_override"))

        utility_opex_delta = (annual_cost * utility_inflation / Decimal("4")).quantize(Decimal("0.01"))
        utility_savings = (annual_cost * energy_efficiency / Decimal("4")).quantize(Decimal("0.01"))
        solar_savings = (solar_generation_kwh * Decimal("0.12") / Decimal("4")).quantize(Decimal("0.01"))
        carbon_penalty_delta = (total_emissions * carbon_tax / Decimal("4")).quantize(Decimal("0.01"))
        regulatory_penalty_delta = (
            (regulatory_override if regulatory_override > 0 else _d(reg_row.get("penalty"))) * (Decimal("1") + transition_penalty) / Decimal("4")
        ).quantize(Decimal("0.01"))
        project_capex_delta = (_d(project_row.get("total_capex")) / Decimal("4")).quantize(Decimal("0.01"))
        stabilized_noi_delta = (utility_savings + solar_savings).quantize(Decimal("0.01"))
        exit_cap_rate_delta_bps = (transition_penalty * Decimal("100") - green_premium_bps).quantize(Decimal("0.01"))
        return {
            "utility_opex_delta": utility_opex_delta,
            "carbon_penalty_delta": carbon_penalty_delta,
            "regulatory_penalty_delta": regulatory_penalty_delta,
            "project_capex_delta": project_capex_delta,
            "stabilized_noi_delta": stabilized_noi_delta,
            "exit_cap_rate_delta_bps": exit_cap_rate_delta_bps,
            "sustainability_inputs_hash": _compute_hash(
                {
                    "assumptions_hash": assumptions_hash,
                    "asset_id": str(asset_id),
                    "quarter": quarter,
                    "total_emissions": str(total_emissions),
                    "annual_cost": str(annual_cost),
                    "project_capex": str(project_capex_delta),
                }
            ),
        }


def _historical_cashflows(cur, *, fund_id: UUID) -> list[tuple[date, Decimal]]:
    cur.execute(
        """
        SELECT entry_type, amount_base, effective_date
        FROM re_capital_ledger_entry
        WHERE fund_id = %s
        ORDER BY effective_date, created_at
        """,
        (str(fund_id),),
    )
    rows = cur.fetchall()
    cashflows: list[tuple[date, Decimal]] = []
    for row in rows:
        amt = _d(row.get("amount_base"))
        dt = row["effective_date"]
        if row["entry_type"] in ("contribution", "commitment", "fee"):
            cashflows.append((dt, -abs(amt)))
        elif row["entry_type"] in ("distribution", "recallable_dist"):
            cashflows.append((dt, abs(amt)))
        elif row["entry_type"] == "reversal":
            cashflows.append((dt, amt))
    return cashflows


def run_projection(*, fund_id: UUID, scenario_id: UUID, base_quarter: str, horizon_years: int, projection_mode: str) -> dict:
    with get_cursor() as cur:
        context = _resolve_fund_context(cur, fund_id=fund_id)
        assumptions, assumptions_hash = re_scenario.resolve_assumptions(
            scenario_id=scenario_id,
            node_path={"fund_id": fund_id},
        )
        cur.execute(
            """
            SELECT factor_set_id
            FROM sus_emission_factor_set
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """
        )
        factor_row = cur.fetchone()
        factor_set_id = str(factor_row["factor_set_id"]) if factor_row else None
        cur.execute(
            """
            INSERT INTO sus_scenario_projection_run (
              env_id, business_id, scenario_id, fund_id, base_quarter,
              horizon_years, inputs_hash, factor_set_id, status, projection_mode
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'running', %s)
            RETURNING *
            """,
            (
                context["env_id"],
                context["business_id"],
                str(scenario_id),
                str(fund_id),
                base_quarter,
                horizon_years,
                assumptions_hash,
                factor_set_id,
                projection_mode,
            ),
        )
        run = cur.fetchone()
        projection_run_id = UUID(str(run["projection_run_id"]))
        base_year = _quarter_to_year(base_quarter)

        cur.execute(
            """
            SELECT a.asset_id::text, d.deal_id::text AS investment_id, a.name AS asset_name
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s AND a.asset_type = 'property'
            ORDER BY a.created_at
            """,
            (str(fund_id),),
        )
        assets = cur.fetchall()
        asset_rows: list[dict] = []

        utility_inflation = _d(assumptions.get("sus.utility_inflation_rate") or Decimal("0.02"))
        energy_efficiency = _d(assumptions.get("sus.energy_efficiency_reduction_pct") or Decimal("0.03"))
        carbon_tax = _d(assumptions.get("sus.carbon_tax_per_ton"))
        transition_penalty = _d(assumptions.get("sus.transition_risk_penalty_pct"))
        green_premium_bps = _d(assumptions.get("sus.green_premium_bps"))

        for asset in assets:
            cur.execute(
                """
                SELECT *
                FROM sus_asset_footprint_annual_v
                WHERE asset_id = %s AND scenario_id IS NULL
                ORDER BY year DESC
                LIMIT 1
                """,
                (asset["asset_id"],),
            )
            baseline = cur.fetchone() or {}
            base_energy = _d(baseline.get("energy_kwh_equiv") or Decimal("0"))
            base_emissions = _d(baseline.get("total_emissions") or Decimal("0"))
            base_cost = _d(baseline.get("utility_cost_total") or Decimal("0"))
            cur.execute(
                """
                SELECT COALESCE(sum(capex_amount), 0) AS capex
                FROM sus_decarbonization_project
                WHERE asset_id = %s AND implementation_status IN ('planned', 'approved', 'in_progress')
                """,
                (asset["asset_id"],),
            )
            project_capex = _d((cur.fetchone() or {}).get("capex"))

            running_energy = base_energy
            running_emissions = base_emissions
            running_cost = base_cost
            for offset in range(horizon_years):
                projection_year = base_year + offset
                running_energy = (running_energy * (Decimal("1") - energy_efficiency)).quantize(Decimal("0.01"))
                running_emissions = (running_emissions * (Decimal("1") - energy_efficiency)).quantize(Decimal("0.01"))
                running_cost = (running_cost * (Decimal("1") + utility_inflation)).quantize(Decimal("0.01"))
                carbon_penalty_total = (running_emissions * carbon_tax).quantize(Decimal("0.01"))
                regulatory_penalty_total = (running_cost * transition_penalty).quantize(Decimal("0.01"))
                project_capex_total = (project_capex / Decimal(str(horizon_years))).quantize(Decimal("0.01"))
                noi_delta = (base_cost - running_cost - carbon_penalty_total - regulatory_penalty_total).quantize(Decimal("0.01"))
                terminal_value_delta = Decimal("0")
                if offset == horizon_years - 1:
                    terminal_value_delta = (noi_delta * Decimal("4") * (Decimal("10000") - green_premium_bps) / Decimal("550")).quantize(Decimal("0.01"))
                cur.execute(
                    """
                    INSERT INTO sus_asset_projection_year (
                      projection_run_id, asset_id, env_id, business_id, projection_year,
                      energy_kwh_equiv, emissions_total, utility_cost_total,
                      carbon_penalty_total, regulatory_penalty_total, project_capex_total,
                      noi_delta, terminal_value_delta, data_quality_status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'review')
                    RETURNING *
                    """,
                    (
                        str(projection_run_id),
                        asset["asset_id"],
                        context["env_id"],
                        context["business_id"],
                        projection_year,
                        _q(running_energy),
                        _q(running_emissions),
                        _q(running_cost),
                        _q(carbon_penalty_total),
                        _q(regulatory_penalty_total),
                        _q(project_capex_total),
                        _q(noi_delta),
                        _q(terminal_value_delta),
                    ),
                )
                asset_rows.append(cur.fetchone())

        cur.execute(
            """
            SELECT DISTINCT d.deal_id::text AS investment_id
            FROM repe_deal d
            WHERE d.fund_id = %s
            ORDER BY d.deal_id
            """,
            (str(fund_id),),
        )
        investments = cur.fetchall()
        investment_rows: list[dict] = []
        for inv in investments:
            for offset in range(horizon_years):
                projection_year = base_year + offset
                cur.execute(
                    """
                    SELECT
                      COALESCE(sum(energy_kwh_equiv), 0) AS energy_kwh_equiv,
                      COALESCE(sum(emissions_total), 0) AS emissions_total,
                      COALESCE(sum(utility_cost_total), 0) AS utility_cost_total,
                      COALESCE(sum(carbon_penalty_total), 0) AS carbon_penalty_total,
                      COALESCE(sum(regulatory_penalty_total), 0) AS regulatory_penalty_total,
                      COALESCE(sum(project_capex_total), 0) AS project_capex_total,
                      COALESCE(sum(noi_delta), 0) AS noi_delta,
                      COALESCE(sum(terminal_value_delta), 0) AS terminal_value_delta
                    FROM sus_asset_projection_year ap
                    JOIN repe_asset a ON a.asset_id = ap.asset_id
                    WHERE ap.projection_run_id = %s
                      AND a.deal_id = %s
                      AND ap.projection_year = %s
                    """,
                    (str(projection_run_id), inv["investment_id"], projection_year),
                )
                agg = cur.fetchone() or {}
                cur.execute(
                    """
                    INSERT INTO sus_investment_projection_year (
                      projection_run_id, investment_id, env_id, business_id, projection_year,
                      energy_kwh_equiv, emissions_total, utility_cost_total, carbon_penalty_total,
                      regulatory_penalty_total, project_capex_total, noi_delta, projected_nav_delta
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        str(projection_run_id),
                        inv["investment_id"],
                        context["env_id"],
                        context["business_id"],
                        projection_year,
                        agg.get("energy_kwh_equiv"),
                        agg.get("emissions_total"),
                        agg.get("utility_cost_total"),
                        agg.get("carbon_penalty_total"),
                        agg.get("regulatory_penalty_total"),
                        agg.get("project_capex_total"),
                        agg.get("noi_delta"),
                        agg.get("terminal_value_delta"),
                    ),
                )
                investment_rows.append(cur.fetchone())

        fund_rows: list[dict] = []
        cashflows = _historical_cashflows(cur, fund_id=fund_id)
        carry_rate = Decimal("0.20")
        cur.execute(
            """
            SELECT carry_rate
            FROM repe_fund_term
            WHERE fund_id = %s
            ORDER BY effective_from DESC
            LIMIT 1
            """,
            (str(fund_id),),
        )
        term = cur.fetchone()
        if term and term.get("carry_rate") is not None:
            carry_rate = _d(term.get("carry_rate"))

        cumulative_forecast: list[tuple[date, Decimal]] = []
        final_terminal_value = Decimal("0")
        for offset in range(horizon_years):
            projection_year = base_year + offset
            cur.execute(
                """
                SELECT
                  COALESCE(sum(energy_kwh_equiv), 0) AS energy_kwh_equiv,
                  COALESCE(sum(emissions_total), 0) AS emissions_total,
                  COALESCE(sum(utility_cost_total), 0) AS utility_cost_total,
                  COALESCE(sum(carbon_penalty_total), 0) AS carbon_penalty_total,
                  COALESCE(sum(regulatory_penalty_total), 0) AS regulatory_penalty_total,
                  COALESCE(sum(project_capex_total), 0) AS project_capex_total,
                  COALESCE(sum(noi_delta), 0) AS noi_delta,
                  COALESCE(sum(projected_nav_delta), 0) AS projected_nav_delta
                FROM sus_investment_projection_year
                WHERE projection_run_id = %s AND projection_year = %s
                """,
                (str(projection_run_id), projection_year),
            )
            agg = cur.fetchone() or {}
            annual_cf = (_d(agg.get("noi_delta")) - _d(agg.get("project_capex_total"))).quantize(Decimal("0.01"))
            terminal_value = _d(agg.get("projected_nav_delta"))
            if annual_cf != 0:
                cumulative_forecast.append((date(projection_year, 12, 31), annual_cf))
            if offset == horizon_years - 1 and terminal_value != 0:
                cumulative_forecast.append((date(projection_year, 12, 31), terminal_value))
                final_terminal_value = terminal_value

            projected_fund_irr = xirr(cashflows + cumulative_forecast)
            projected_lp_net_irr = (projected_fund_irr - Decimal("0.015")).quantize(Decimal("0.000000000001")) if projected_fund_irr is not None else None
            projected_carry = (max(final_terminal_value, Decimal("0")) * carry_rate).quantize(Decimal("0.01"))
            cur.execute(
                """
                INSERT INTO sus_fund_projection_year (
                  projection_run_id, fund_id, env_id, business_id, projection_year,
                  energy_kwh_equiv, emissions_total, utility_cost_total, carbon_penalty_total,
                  regulatory_penalty_total, project_capex_total, noi_delta,
                  projected_fund_irr, projected_lp_net_irr, projected_carry, carbon_budget_delta
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    str(projection_run_id),
                    str(fund_id),
                    context["env_id"],
                    context["business_id"],
                    projection_year,
                    agg.get("energy_kwh_equiv"),
                    agg.get("emissions_total"),
                    agg.get("utility_cost_total"),
                    agg.get("carbon_penalty_total"),
                    agg.get("regulatory_penalty_total"),
                    agg.get("project_capex_total"),
                    agg.get("noi_delta"),
                    _q(projected_fund_irr) if projected_fund_irr is not None else None,
                    _q(projected_lp_net_irr) if projected_lp_net_irr is not None else None,
                    _q(projected_carry),
                    _q(Decimal("0") - _d(agg.get("emissions_total"))),
                ),
            )
            fund_rows.append(cur.fetchone())

        cur.execute(
            """
            UPDATE sus_scenario_projection_run
            SET status = 'success'
            WHERE projection_run_id = %s
            RETURNING *
            """,
            (str(projection_run_id),),
        )
        run = cur.fetchone()
        latest_fund_row = fund_rows[-1] if fund_rows else {}
        return {
            "projection_run_id": str(projection_run_id),
            "fund_id": str(fund_id),
            "scenario_id": str(scenario_id),
            "status": run["status"],
            "summary": {
                "asset_count": len(assets),
                "horizon_years": horizon_years,
                "projected_fund_irr": latest_fund_row.get("projected_fund_irr"),
                "projected_lp_net_irr": latest_fund_row.get("projected_lp_net_irr"),
                "projected_carry": latest_fund_row.get("projected_carry"),
            },
            "created_at": run["created_at"],
        }


def get_projection(*, projection_run_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM sus_scenario_projection_run WHERE projection_run_id = %s",
            (str(projection_run_id),),
        )
        run = cur.fetchone()
        if not run:
            raise LookupError(f"Projection run {projection_run_id} not found")
        cur.execute(
            """
            SELECT * FROM sus_asset_projection_year
            WHERE projection_run_id = %s
            ORDER BY projection_year, asset_id
            """,
            (str(projection_run_id),),
        )
        asset_rows = cur.fetchall()
        cur.execute(
            """
            SELECT * FROM sus_investment_projection_year
            WHERE projection_run_id = %s
            ORDER BY projection_year, investment_id
            """,
            (str(projection_run_id),),
        )
        investment_rows = cur.fetchall()
        cur.execute(
            """
            SELECT * FROM sus_fund_projection_year
            WHERE projection_run_id = %s
            ORDER BY projection_year
            """,
            (str(projection_run_id),),
        )
        fund_rows = cur.fetchall()
        return {
            "run": run,
            "asset_rows": asset_rows,
            "investment_rows": investment_rows,
            "fund_rows": fund_rows,
        }
