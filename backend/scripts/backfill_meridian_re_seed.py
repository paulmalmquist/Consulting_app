#!/usr/bin/env python3
"""Deterministic backfill for Meridian demo RE seed data.

This patch repairs the Meridian seeded portfolio by:
- filling missing property metadata on seeded assets
- removing future "actual" NOI rows and filling the missing 2025 operating gap
- seeding missing debt detail and amortization schedules
- rebuilding asset, investment, and fund quarter states from the reconstructed facts

Safe to re-run: deletes and re-inserts only seed-source rows for the Meridian demo
business and uses deterministic IDs for new seeded debt rows.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Iterable
from uuid import UUID

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.re_fi_seed_v2 import (  # noqa: E402
    PROPERTY_PROFILES as IGF7_PROPERTY_PROFILES,
    _compute_budget_items,
    _make_comps,
    _make_loans,
    _v2_id,
)
from app.services.re_math import generate_amortization_schedule  # noqa: E402


TENANT_BUSINESS_ID = UUID("a1b2c3d4-0001-0001-0001-000000000001")
ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"

CURRENT_MONTH = date(2026, 3, 1)
AS_OF_DATE = date(2026, 3, 31)
BACKFILL_SOURCE = "seed_backfill_v3"
BACKFILL_GL_SOURCE = "seed_backfill_v3"
BACKFILL_RUN_ID = _v2_id("run:meridian_seed_backfill_v3")

GL_CODE_MAP = {
    "RENT": "4000",
    "VACANCY": "4100",
    "OTHER_INCOME": "4200",
    "PAYROLL": "5000",
    "TAXES": "5100",
    "INSURANCE": "5200",
    "UTILITIES": "5300",
    "REPAIRS": "5400",
    "MGMT_FEE_PROP": "5500",
    "ADMIN": "5600",
}

PROPERTY_CAPEX_RATE = {
    "multifamily": Decimal("0.025"),
    "student_housing": Decimal("0.030"),
    "senior_housing": Decimal("0.035"),
    "medical_office": Decimal("0.022"),
    "industrial": Decimal("0.018"),
    "retail": Decimal("0.020"),
    "office": Decimal("0.024"),
    "mixed_use": Decimal("0.026"),
    "hospitality": Decimal("0.030"),
}

CITY_TO_MSA = {
    ("Denver", "CO"): "Denver-Aurora-Lakewood",
    ("Dallas", "TX"): "Dallas-Fort Worth-Arlington",
    ("Aurora", "CO"): "Denver-Aurora-Lakewood",
    ("Tampa", "FL"): "Tampa-St. Petersburg-Clearwater",
    ("Phoenix", "AZ"): "Phoenix-Mesa-Chandler",
    ("Scottsdale", "AZ"): "Phoenix-Mesa-Chandler",
    ("Atlanta", "GA"): "Atlanta-Sandy Springs-Alpharetta",
    ("Chicago", "IL"): "Chicago-Naperville-Elgin",
    ("Tempe", "AZ"): "Phoenix-Mesa-Chandler",
}

DEFAULT_CAP_RATES = {
    "multifamily": Decimal("0.048"),
    "student_housing": Decimal("0.058"),
    "senior_housing": Decimal("0.067"),
    "medical_office": Decimal("0.057"),
    "industrial": Decimal("0.051"),
    "retail": Decimal("0.068"),
    "office": Decimal("0.061"),
    "mixed_use": Decimal("0.058"),
    "hospitality": Decimal("0.072"),
}

DEBT_MARK_BY_RATING = {
    "Investment Grade": Decimal("0.9925"),
    "Watch": Decimal("0.9650"),
}

SECTOR_PROFILES = [
    {
        "name": "Parkview Residences",
        "fund_name": "Institutional Growth Fund VII",
        "address": "1155 North Halsted Street",
        "city": "Chicago",
        "state": "IL",
        "submarket": "River North",
        "property_type": "multifamily",
        "size_sf": 255_000,
        "units": 280,
        "year_built": 2018,
        "purchase_price": 55_000_000,
        "noi_monthly": 238_000,
        "occupancy": 0.945,
        "cap_rate": 0.050,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-04-01",
        "avg_rent_per_unit": 1850,
    },
    {
        "name": "Heritage Senior Living",
        "fund_name": "Institutional Growth Fund VII",
        "address": "7380 North Scottsdale Road",
        "city": "Scottsdale",
        "state": "AZ",
        "submarket": "Central Scottsdale",
        "property_type": "senior_housing",
        "size_sf": 68_000,
        "units": 120,
        "year_built": 2008,
        "purchase_price": 54_000_000,
        "noi_monthly": 306_000,
        "occupancy": 0.895,
        "cap_rate": 0.065,
        "loan_type": "senior_mezz",
        "distressed": False,
        "acq_date": "2025-04-15",
        "beds": 120,
        "licensed_beds": 120,
        "revenue_per_occupied_bed": 7500,
    },
    {
        "name": "Campus Edge Apartments",
        "fund_name": "Institutional Growth Fund VII",
        "address": "2400 Rio Grande Street",
        "city": "Austin",
        "state": "TX",
        "submarket": "West Campus",
        "property_type": "student_housing",
        "size_sf": 195_000,
        "units": 150,
        "year_built": 2016,
        "purchase_price": 39_000_000,
        "noi_monthly": 170_000,
        "occupancy": 0.955,
        "cap_rate": 0.050,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-05-01",
        "beds_student": 450,
        "preleased_pct": 0.94,
        "university_name": "University of Texas at Austin",
    },
    {
        "name": "Meridian Medical Plaza",
        "fund_name": "Institutional Growth Fund VII",
        "address": "2000 Peachtree Road NE",
        "city": "Atlanta",
        "state": "GA",
        "submarket": "Buckhead/Peachtree",
        "property_type": "medical_office",
        "size_sf": 85_000,
        "units": None,
        "year_built": 2012,
        "purchase_price": 56_000_000,
        "noi_monthly": 289_000,
        "occupancy": 0.935,
        "cap_rate": 0.060,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-05-15",
        "leasable_sf": 85_000,
        "leased_sf": 79_500,
        "walt_years": 6.2,
        "anchor_tenant": "Piedmont Healthcare",
        "health_system_affiliation": "Piedmont Healthcare System",
    },
    {
        "name": "Gateway Distribution Center",
        "fund_name": "Institutional Growth Fund VII",
        "address": "8200 Irving Boulevard",
        "city": "Dallas",
        "state": "TX",
        "submarket": "West Brookhollow",
        "property_type": "industrial",
        "size_sf": 380_000,
        "units": None,
        "year_built": 2019,
        "purchase_price": 105_000_000,
        "noi_monthly": 408_000,
        "occupancy": 0.975,
        "cap_rate": 0.045,
        "loan_type": "senior_mezz",
        "distressed": False,
        "acq_date": "2025-06-01",
        "warehouse_sf": 340_000,
        "office_sf": 40_000,
        "clear_height_ft": 36,
        "dock_doors": 42,
        "rail_served": True,
    },
]

MREF3_PROFILES = [
    {
        "name": "Meridian Park Multifamily – Dallas",
        "fund_name": "Meridian Real Estate Fund III",
        "address": "2800 Commerce Street",
        "city": "Dallas",
        "state": "TX",
        "submarket": "Deep Ellum",
        "property_type": "multifamily",
        "size_sf": 260_000,
        "units": 285,
        "year_built": 2018,
        "purchase_price": 68_000_000,
        "noi_monthly": 340_000,
        "occupancy": 0.945,
        "cap_rate": 0.060,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-01-15",
        "avg_rent_per_unit": 2250,
    },
    {
        "name": "Ellipse Senior Living – Dallas",
        "fund_name": "Meridian Real Estate Fund III",
        "address": "7601 Preston Road",
        "city": "Dallas",
        "state": "TX",
        "submarket": "Preston Hollow",
        "property_type": "senior_housing",
        "size_sf": 78_000,
        "units": 120,
        "year_built": 2012,
        "purchase_price": 17_500_000,
        "noi_monthly": 95_000,
        "occupancy": 0.920,
        "cap_rate": 0.067,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-02-01",
        "beds": 120,
        "licensed_beds": 120,
        "revenue_per_occupied_bed": 5400,
    },
    {
        "name": "Phoenix Gateway Medical Office",
        "fund_name": "Meridian Real Estate Fund III",
        "address": "8011 East Osborn Road",
        "city": "Scottsdale",
        "state": "AZ",
        "submarket": "Scottsdale Medical District",
        "property_type": "medical_office",
        "size_sf": 89_000,
        "units": None,
        "year_built": 2011,
        "purchase_price": 39_500_000,
        "noi_monthly": 190_000,
        "occupancy": 0.880,
        "cap_rate": 0.057,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-03-15",
        "leasable_sf": 89_000,
        "leased_sf": 78_320,
        "walt_years": 5.8,
        "anchor_tenant": "HonorHealth",
        "health_system_affiliation": "HonorHealth",
    },
    {
        "name": "Westgate Student Housing – Tempe",
        "fund_name": "Meridian Real Estate Fund III",
        "address": "950 South Forest Avenue",
        "city": "Tempe",
        "state": "AZ",
        "submarket": "ASU Campus",
        "property_type": "student_housing",
        "size_sf": 172_000,
        "units": 220,
        "year_built": 2015,
        "purchase_price": 24_000_000,
        "noi_monthly": 135_000,
        "occupancy": 0.960,
        "cap_rate": 0.066,
        "loan_type": "senior",
        "distressed": False,
        "acq_date": "2025-05-01",
        "beds_student": 220,
        "preleased_pct": 0.96,
        "university_name": "Arizona State University",
    },
]


@dataclass(frozen=True)
class AssetContext:
    asset_id: UUID
    asset_name: str
    deal_id: UUID
    deal_name: str
    fund_id: UUID
    fund_name: str
    asset_type: str
    jv_id: UUID | None


def d(value: object | None) -> Decimal:
    return Decimal(str(value or 0))


def q12(value: Decimal | float | int | str | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal("0.000000000001"))


def q2(value: Decimal | float | int | str | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value)).quantize(Decimal("0.01"), ROUND_HALF_UP)


def add_months(dt: date, months: int) -> date:
    year = dt.year + (dt.month - 1 + months) // 12
    month = (dt.month - 1 + months) % 12 + 1
    day = min(dt.day, _month_last_day(year, month))
    return date(year, month, day)


def _month_last_day(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def first_of_month(dt: date) -> date:
    return date(dt.year, dt.month, 1)


def iter_months(start: date, end: date) -> Iterable[date]:
    cur = first_of_month(start)
    final = first_of_month(end)
    while cur <= final:
        yield cur
        cur = add_months(cur, 1)


def quarter_key(dt: date) -> str:
    return f"{dt.year}Q{((dt.month - 1) // 3) + 1}"


def quarter_end(quarter: str) -> date:
    year = int(quarter[:4])
    qtr = int(quarter[-1])
    month = qtr * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def quarter_sequence(start_quarter: str, end_quarter: str) -> list[str]:
    items: list[str] = []
    year = int(start_quarter[:4])
    qtr = int(start_quarter[-1])
    end_year = int(end_quarter[:4])
    end_qtr = int(end_quarter[-1])
    while (year, qtr) <= (end_year, end_qtr):
        items.append(f"{year}Q{qtr}")
        qtr += 1
        if qtr == 5:
            qtr = 1
            year += 1
    return items


def hash_payload(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def month_index(start: date, current: date) -> int:
    return (current.year - start.year) * 12 + (current.month - start.month)


def stable_seed(name: str) -> int:
    return int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)


def build_property_profiles() -> dict[str, dict]:
    profiles: dict[str, dict] = {}

    for raw in IGF7_PROPERTY_PROFILES:
        profile = dict(raw)
        profile["fund_name"] = "Institutional Growth Fund VII"
        profile["msa"] = CITY_TO_MSA.get((profile["city"], profile["state"]), profile["submarket"])
        profile["market"] = profile["submarket"]
        profiles[profile["name"]] = profile

    for raw in SECTOR_PROFILES + MREF3_PROFILES:
        profile = dict(raw)
        profile["msa"] = CITY_TO_MSA.get((profile["city"], profile["state"]), profile["submarket"])
        profile["market"] = profile["submarket"]
        profiles[profile["name"]] = profile

    return profiles


def ensure_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS re_asset_operating_qtr (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_id uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
          quarter text NOT NULL,
          scenario_id uuid,
          revenue numeric(28,12),
          other_income numeric(28,12),
          opex numeric(28,12),
          capex numeric(28,12),
          debt_service numeric(28,12),
          leasing_costs numeric(28,12),
          tenant_improvements numeric(28,12),
          free_rent numeric(28,12),
          occupancy numeric(18,12),
          cash_balance numeric(28,12),
          source_type text NOT NULL DEFAULT 'manual'
            CHECK (source_type IN ('manual', 'seed', 'imported_gl', 'derived')),
          inputs_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_re_asset_operating_qtr_unique
          ON re_asset_operating_qtr(asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        """
    )
    cur.execute(
        """
        ALTER TABLE IF EXISTS re_asset_quarter_state
          ADD COLUMN IF NOT EXISTS other_income numeric(28,12),
          ADD COLUMN IF NOT EXISTS leasing_costs numeric(28,12),
          ADD COLUMN IF NOT EXISTS tenant_improvements numeric(28,12),
          ADD COLUMN IF NOT EXISTS free_rent numeric(28,12),
          ADD COLUMN IF NOT EXISTS net_cash_flow numeric(28,12),
          ADD COLUMN IF NOT EXISTS implied_equity_value numeric(28,12),
          ADD COLUMN IF NOT EXISTS ltv numeric(18,12),
          ADD COLUMN IF NOT EXISTS dscr numeric(18,12),
          ADD COLUMN IF NOT EXISTS debt_yield numeric(18,12),
          ADD COLUMN IF NOT EXISTS value_source text
        """
    )
    cur.execute(
        """
        ALTER TABLE IF EXISTS re_investment_quarter_state
          ADD COLUMN IF NOT EXISTS gross_asset_value numeric(28,12),
          ADD COLUMN IF NOT EXISTS debt_balance numeric(28,12),
          ADD COLUMN IF NOT EXISTS cash_balance numeric(28,12),
          ADD COLUMN IF NOT EXISTS effective_ownership_percent numeric(18,12),
          ADD COLUMN IF NOT EXISTS fund_nav_contribution numeric(28,12)
        """
    )


def load_assets(cur) -> dict[str, AssetContext]:
    cur.execute(
        """
        SELECT
          a.asset_id,
          a.name AS asset_name,
          a.asset_type,
          a.jv_id,
          d.deal_id,
          d.name AS deal_name,
          f.fund_id,
          f.name AS fund_name
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE f.business_id = %s
        """,
        (str(TENANT_BUSINESS_ID),),
    )
    assets: dict[str, AssetContext] = {}
    for row in cur.fetchall():
        assets[row["asset_name"]] = AssetContext(
            asset_id=UUID(str(row["asset_id"])),
            asset_name=row["asset_name"],
            deal_id=UUID(str(row["deal_id"])),
            deal_name=row["deal_name"],
            fund_id=UUID(str(row["fund_id"])),
            fund_name=row["fund_name"],
            asset_type=row["asset_type"],
            jv_id=UUID(str(row["jv_id"])) if row["jv_id"] else None,
        )
    return assets


def load_funds(cur) -> dict[str, UUID]:
    cur.execute(
        "SELECT fund_id, name FROM repe_fund WHERE business_id = %s",
        (str(TENANT_BUSINESS_ID),),
    )
    return {row["name"]: UUID(str(row["fund_id"])) for row in cur.fetchall()}


def occupancy_for_month(profile: dict, current_month: date) -> Decimal:
    start = first_of_month(date.fromisoformat(profile["acq_date"]))
    idx = month_index(start, current_month)
    base_occ = Decimal(str(profile["occupancy"]))
    season = Decimal(str(math.sin((current_month.month - 1) * math.tau / 12))) * Decimal("0.006")
    glide = Decimal(str(min(idx, 12))) * Decimal("0.0008")
    distressed_drag = Decimal("0")
    if profile.get("distressed"):
        if current_month < date(2025, 10, 1):
            distressed_drag = Decimal("0.060")
        elif current_month < date(2026, 1, 1):
            distressed_drag = Decimal("0.030")
    student_bump = Decimal("0.010") if profile["property_type"] == "student_housing" and current_month.month in (8, 9) else Decimal("0")
    occ = base_occ - Decimal("0.008") + glide + season + student_bump - distressed_drag
    return max(Decimal("0.6000"), min(Decimal("0.9900"), occ)).quantize(Decimal("0.0001"))


def monthly_line_items(profile: dict, current_month: date) -> tuple[dict[str, Decimal], Decimal]:
    budget = _compute_budget_items(profile["noi_monthly"], profile["property_type"])
    start = first_of_month(date.fromisoformat(profile["acq_date"]))
    idx = month_index(start, current_month)
    occ = occupancy_for_month(profile, current_month)
    base_occ = Decimal(str(profile["occupancy"]))
    occ_ratio = occ / base_occ if base_occ > 0 else Decimal("1")
    trend = Decimal(str(math.pow(1.0006, max(idx, 0))))
    season = Decimal(str(math.sin((current_month.month - 1) * math.tau / 12)))
    utilities_season = Decimal(str(abs(math.sin((current_month.month - 1) * math.tau / 6))))
    seed = stable_seed(profile["name"])
    repair_spike = Decimal("1.30") if (seed + idx) % 6 == 0 else Decimal("1.00")
    distress = Decimal("1.00")
    vacancy_drag = Decimal("1.00")
    if profile.get("distressed"):
        if current_month < date(2025, 7, 1):
            distress = Decimal("0.90")
            vacancy_drag = Decimal("1.35")
        elif current_month < date(2026, 1, 1):
            distress = Decimal("0.95")
            vacancy_drag = Decimal("1.15")

    rent = q2(d(budget["RENT"]) * trend * (Decimal("1.00") + season * Decimal("0.006")) * occ_ratio * distress) or Decimal("0")
    vacancy_base = d(budget["VACANCY"]) * trend * (Decimal("1.00") + abs(season) * Decimal("0.12"))
    vacancy = q2(vacancy_base * vacancy_drag * max(Decimal("0.30"), (Decimal("1.00") - occ) / max(Decimal("0.02"), Decimal("1.00") - base_occ))) or Decimal("0")
    other_income = q2(d(budget["OTHER_INCOME"]) * trend * (Decimal("0.96") + occ_ratio * Decimal("0.06"))) or Decimal("0")
    payroll = q2(d(budget["PAYROLL"]) * trend * (Decimal("1.00") + (Decimal("1.00") - occ) * Decimal("0.15"))) or Decimal("0")
    taxes = q2(d(budget["TAXES"]) * (Decimal("1.0003") ** max(idx, 0))) or Decimal("0")
    insurance = q2(d(budget["INSURANCE"]) * (Decimal("1.0004") ** max(idx, 0))) or Decimal("0")
    utilities = q2(d(budget["UTILITIES"]) * trend * (Decimal("0.96") + utilities_season * Decimal("0.18"))) or Decimal("0")
    repairs = q2(d(budget["REPAIRS"]) * trend * repair_spike) or Decimal("0")
    mgmt = q2(d(budget["MGMT_FEE_PROP"]) * trend) or Decimal("0")
    admin = q2(d(budget["ADMIN"]) * trend * (Decimal("0.98") + abs(season) * Decimal("0.05"))) or Decimal("0")

    return {
        "RENT": rent,
        "VACANCY": vacancy,
        "OTHER_INCOME": other_income,
        "PAYROLL": payroll,
        "TAXES": taxes,
        "INSURANCE": insurance,
        "UTILITIES": utilities,
        "REPAIRS": repairs,
        "MGMT_FEE_PROP": mgmt,
        "ADMIN": admin,
    }, occ


def infer_msa(profile: dict) -> str:
    return profile.get("msa") or CITY_TO_MSA.get((profile["city"], profile["state"]), profile.get("submarket", ""))


def ensure_property_metadata(cur, ctx: AssetContext, profile: dict) -> None:
    cur.execute(
        """
        UPDATE repe_asset
        SET cost_basis = %s,
            acquisition_date = %s,
            asset_status = 'active'
        WHERE asset_id = %s
        """,
        (q12(profile["purchase_price"]), profile["acq_date"], str(ctx.asset_id)),
    )

    cur.execute(
        """
        INSERT INTO repe_property_asset (
          asset_id, property_type, units, market, current_noi, occupancy,
          address, gross_sf, year_built, city, state, msa, square_feet, status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
        ON CONFLICT (asset_id) DO UPDATE SET
          property_type = EXCLUDED.property_type,
          units = EXCLUDED.units,
          market = EXCLUDED.market,
          current_noi = EXCLUDED.current_noi,
          occupancy = EXCLUDED.occupancy,
          address = EXCLUDED.address,
          gross_sf = EXCLUDED.gross_sf,
          year_built = EXCLUDED.year_built,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          msa = EXCLUDED.msa,
          square_feet = EXCLUDED.square_feet,
          status = 'active'
        """,
        (
            str(ctx.asset_id),
            profile["property_type"],
            profile.get("units"),
            profile.get("market") or profile.get("submarket") or f"{profile['city']}, {profile['state']}",
            q12(Decimal(str(profile["noi_monthly"])) * Decimal("12")),
            q12(profile["occupancy"]),
            f"{profile['address']}, {profile['city']}, {profile['state']}",
            profile.get("size_sf"),
            profile.get("year_built"),
            profile["city"],
            profile["state"],
            infer_msa(profile),
            profile.get("size_sf"),
        ),
    )

    extra_updates = {
        "avg_rent_per_unit": profile.get("avg_rent_per_unit"),
        "beds": profile.get("beds"),
        "licensed_beds": profile.get("licensed_beds"),
        "revenue_per_occupied_bed": profile.get("revenue_per_occupied_bed"),
        "beds_student": profile.get("beds_student"),
        "preleased_pct": profile.get("preleased_pct"),
        "university_name": profile.get("university_name"),
        "leasable_sf": profile.get("leasable_sf"),
        "leased_sf": profile.get("leased_sf"),
        "walt_years": profile.get("walt_years"),
        "anchor_tenant": profile.get("anchor_tenant"),
        "health_system_affiliation": profile.get("health_system_affiliation"),
        "warehouse_sf": profile.get("warehouse_sf"),
        "office_sf": profile.get("office_sf"),
        "clear_height_ft": profile.get("clear_height_ft"),
        "dock_doors": profile.get("dock_doors"),
        "rail_served": profile.get("rail_served"),
    }
    sets = []
    params: list[object] = []
    for column, value in extra_updates.items():
        if value is not None:
            sets.append(f"{column} = %s")
            params.append(value)
    if sets:
        params.append(str(ctx.asset_id))
        cur.execute(
            f"UPDATE repe_property_asset SET {', '.join(sets)} WHERE asset_id = %s",
            params,
        )


def delete_existing_property_seed_rows(cur, asset_ids: list[UUID]) -> None:
    id_list = [str(asset_id) for asset_id in asset_ids]
    cur.execute(
        """
        DELETE FROM acct_gl_balance_monthly
        WHERE env_id = %s
          AND business_id = %s
          AND asset_id = ANY(%s)
          AND source_id IN ('seed', 'seed_v2', %s)
        """,
        (ENV_ID, str(TENANT_BUSINESS_ID), id_list, BACKFILL_GL_SOURCE),
    )
    cur.execute(
        """
        DELETE FROM acct_normalized_noi_monthly
        WHERE env_id = %s
          AND business_id = %s
          AND asset_id = ANY(%s)
          AND source_hash IN ('seed', 'seed_v2', %s)
        """,
        (ENV_ID, str(TENANT_BUSINESS_ID), id_list, BACKFILL_SOURCE),
    )
    cur.execute(
        """
        DELETE FROM re_asset_operating_qtr
        WHERE asset_id = ANY(%s)
          AND scenario_id IS NULL
          AND source_type IN ('seed', 'derived')
        """,
        (id_list,),
    )


def upsert_monthly_rows(cur, ctx: AssetContext, profile: dict) -> dict[str, dict[str, Decimal]]:
    start_month = max(first_of_month(date.fromisoformat(profile["acq_date"])), date(2024, 1, 1))
    quarter_rollups: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    quarter_occ: dict[str, list[Decimal]] = defaultdict(list)

    for period_month in iter_months(start_month, CURRENT_MONTH):
        amounts, occ = monthly_line_items(profile, period_month)
        for code, amount in amounts.items():
            sign = Decimal("-1") if code not in ("RENT", "OTHER_INCOME") else Decimal("1")
            if code == "VACANCY":
                sign = Decimal("-1")
            cur.execute(
                """
                INSERT INTO acct_gl_balance_monthly
                  (env_id, business_id, asset_id, period_month, gl_account, amount, source_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ENV_ID,
                    str(TENANT_BUSINESS_ID),
                    str(ctx.asset_id),
                    period_month,
                    GL_CODE_MAP[code],
                    q12(amount),
                    BACKFILL_GL_SOURCE,
                ),
            )
            cur.execute(
                """
                INSERT INTO acct_normalized_noi_monthly
                  (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ENV_ID,
                    str(TENANT_BUSINESS_ID),
                    str(ctx.asset_id),
                    period_month,
                    code,
                    q12(amount * sign),
                    BACKFILL_SOURCE,
                ),
            )

        quarter = quarter_key(period_month)
        quarter_rollups[quarter]["revenue"] += amounts["RENT"]
        quarter_rollups[quarter]["other_income"] += amounts["OTHER_INCOME"] - amounts["VACANCY"]
        quarter_rollups[quarter]["opex"] += (
            amounts["PAYROLL"]
            + amounts["TAXES"]
            + amounts["INSURANCE"]
            + amounts["UTILITIES"]
            + amounts["REPAIRS"]
            + amounts["MGMT_FEE_PROP"]
            + amounts["ADMIN"]
        )
        quarter_occ[quarter].append(occ)

    for quarter, values in quarter_rollups.items():
        revenue = values["revenue"]
        other_income = values["other_income"]
        opex = values["opex"]
        capex = (revenue * PROPERTY_CAPEX_RATE.get(profile["property_type"], Decimal("0.025"))).quantize(Decimal("0.01"))
        occ = (sum(quarter_occ[quarter]) / Decimal(len(quarter_occ[quarter]))).quantize(Decimal("0.0001"))
        values["capex"] = capex
        values["occupancy"] = occ
        values["noi"] = (revenue + other_income - opex).quantize(Decimal("0.01"))

        cur.execute(
            """
            INSERT INTO re_asset_operating_qtr (
              asset_id, quarter, scenario_id, revenue, other_income, opex, capex,
              debt_service, leasing_costs, tenant_improvements, free_rent, occupancy,
              cash_balance, source_type, inputs_hash
            )
            VALUES (%s, %s, NULL, %s, %s, %s, %s, 0, 0, 0, 0, %s, 0, 'derived', %s)
            ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              revenue = EXCLUDED.revenue,
              other_income = EXCLUDED.other_income,
              opex = EXCLUDED.opex,
              capex = EXCLUDED.capex,
              occupancy = EXCLUDED.occupancy,
              cash_balance = 0,
              source_type = 'derived',
              inputs_hash = EXCLUDED.inputs_hash,
              created_at = now()
            """,
            (
                str(ctx.asset_id),
                quarter,
                q12(revenue),
                q12(other_income),
                q12(opex),
                q12(capex),
                q12(occ),
                hash_payload(
                    {
                        "asset_id": str(ctx.asset_id),
                        "quarter": quarter,
                        "source": BACKFILL_SOURCE,
                        "revenue": str(revenue),
                        "other_income": str(other_income),
                        "opex": str(opex),
                        "capex": str(capex),
                        "occupancy": str(occ),
                    }
                ),
            ),
        )

    return quarter_rollups


def cap_rate_for_quarter(profile: dict, quarter: str, final_quarter: str) -> Decimal:
    base = Decimal(str(profile.get("cap_rate") or DEFAULT_CAP_RATES[profile["property_type"]]))
    quarters = quarter_sequence(quarter, final_quarter)
    lag = len(quarters) - 1
    adj = Decimal("0.0004") * Decimal(str(lag))
    if profile.get("distressed"):
        adj += Decimal("0.0015") if lag >= 2 else Decimal("0.0007")
    return max(Decimal("0.0350"), (base + adj).quantize(Decimal("0.0001")))


def upsert_property_comps(cur, ctx: AssetContext, profile: dict) -> int:
    cur.execute("SELECT COUNT(*) AS cnt FROM re_property_comp WHERE asset_id = %s", (str(ctx.asset_id),))
    if int(cur.fetchone()["cnt"]) > 0:
        return 0
    cur.execute("DELETE FROM re_property_comp WHERE asset_id = %s AND source = %s", (str(ctx.asset_id), BACKFILL_SOURCE))
    created = 0
    for comp in _make_comps(stable_seed(ctx.asset_name) % 97, profile):
        cur.execute(
            """
            INSERT INTO re_property_comp (
              env_id, business_id, asset_id, comp_type, address, submarket, close_date,
              sale_price, cap_rate, size_sf, price_per_sf, source
            )
            VALUES (%s, %s, %s, 'sale', %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                ENV_ID,
                str(TENANT_BUSINESS_ID),
                str(ctx.asset_id),
                comp["address"],
                comp["submarket"],
                comp["close_date"],
                q2(comp["sale_price"]),
                q12(comp["cap_rate"]),
                q2(comp["size_sf"]),
                q2(comp["price_per_sf"]),
                BACKFILL_SOURCE,
            ),
        )
        created += 1
    return created


def fetch_existing_loans(cur, asset_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT id, upb, rate, spread, rate_type, maturity, amort_type,
               amortization_period_years, term_years, io_period_months,
               balloon_flag, payment_frequency, asset_id, investment_id, loan_name
        FROM re_loan
        WHERE asset_id = %s
        ORDER BY id
        """,
        (str(asset_id),),
    )
    return cur.fetchall()


def ensure_property_loans(cur, ctx: AssetContext, profile: dict) -> list[dict]:
    existing = fetch_existing_loans(cur, ctx.asset_id)
    if existing:
        return existing

    created: list[dict] = []
    for loan in _make_loans(profile, ctx.asset_id, ctx.deal_id):
        cur.execute(
            """
            INSERT INTO re_loan (
              id, env_id, business_id, fund_id, investment_id, asset_id, loan_name, upb,
              rate_type, rate, spread, maturity, amort_type, amortization_period_years,
              term_years, io_period_months, balloon_flag, payment_frequency
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
              upb = EXCLUDED.upb,
              rate_type = EXCLUDED.rate_type,
              rate = EXCLUDED.rate,
              spread = EXCLUDED.spread,
              maturity = EXCLUDED.maturity,
              amort_type = EXCLUDED.amort_type,
              amortization_period_years = EXCLUDED.amortization_period_years,
              term_years = EXCLUDED.term_years,
              io_period_months = EXCLUDED.io_period_months,
              balloon_flag = EXCLUDED.balloon_flag,
              payment_frequency = EXCLUDED.payment_frequency
            """,
            (
                str(loan["id"]),
                ENV_ID,
                str(TENANT_BUSINESS_ID),
                str(ctx.fund_id),
                str(ctx.deal_id),
                str(ctx.asset_id),
                loan["loan_name"],
                q12(loan["upb"]),
                loan["rate_type"],
                q12(loan["rate"]),
                q12(loan["spread"]) if loan["spread"] is not None else None,
                loan["maturity"],
                loan["amort_type"],
                loan["amortization_period_years"],
                loan["term_years"],
                loan["io_period_months"],
                loan["balloon_flag"],
                loan["payment_frequency"],
            ),
        )
        created.append(
            {
                **loan,
                "id": loan["id"],
                "asset_id": ctx.asset_id,
                "investment_id": ctx.deal_id,
            }
        )
    return created


def loan_origination_date(profile: dict | None, fallback: date, maturity: date | None, term_years: int | None) -> date:
    if profile is not None:
        return date.fromisoformat(profile["acq_date"])
    if maturity and term_years:
        return add_months(maturity, -(term_years * 12))
    return fallback


def regenerate_schedule(cur, loan: dict, origination_date: date) -> None:
    cur.execute("DELETE FROM re_loan_amortization_schedule WHERE loan_id = %s", (str(loan["id"]),))

    maturity = loan.get("maturity")
    maturity_date = maturity if isinstance(maturity, date) else (date.fromisoformat(str(maturity)) if maturity else None)

    if loan["amort_type"] == "interest_only":
        if maturity_date:
            term_months = max(1, month_index(origination_date, maturity_date))
        elif loan.get("term_years"):
            term_months = int(loan["term_years"]) * 12
        else:
            term_months = 60
        balance = q2(loan["upb"]) or Decimal("0")
        rate = d(loan["rate"])
        monthly_interest = q2(balance * rate / Decimal("12")) or Decimal("0")
        for period in range(1, term_months + 1):
            payment_date = add_months(origination_date, period)
            principal = balance if period == term_months and loan.get("balloon_flag") else Decimal("0")
            ending = (balance - principal).quantize(Decimal("0.01"))
            cur.execute(
                """
                INSERT INTO re_loan_amortization_schedule (
                  loan_id, period_number, payment_date, beginning_balance,
                  scheduled_principal, interest_payment, total_payment, ending_balance
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(loan["id"]),
                    period,
                    payment_date,
                    q2(balance),
                    q2(principal),
                    q2(monthly_interest),
                    q2(monthly_interest + principal),
                    q2(ending),
                ),
            )
            balance = ending
        return

    schedule = generate_amortization_schedule(
        loan_balance=d(loan["upb"]),
        annual_rate=d(loan["rate"]),
        amortization_years=int(loan["amortization_period_years"]),
        term_years=int(loan["term_years"]),
        io_period_months=int(loan.get("io_period_months") or 0),
    )
    for row in schedule:
        payment_date = add_months(origination_date, int(row["period_number"]))
        cur.execute(
            """
            INSERT INTO re_loan_amortization_schedule (
              loan_id, period_number, payment_date, beginning_balance,
              scheduled_principal, interest_payment, total_payment, ending_balance
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(loan["id"]),
                row["period_number"],
                payment_date,
                q2(row["beginning_balance"]),
                q2(row["scheduled_principal"]),
                q2(row["interest_payment"]),
                q2(row["total_payment"]),
                q2(row["ending_balance"]),
            ),
        )


def refresh_loan_schedules(cur, ctx: AssetContext, profile: dict | None, loans: list[dict]) -> None:
    fallback = date(2024, 1, 1)
    for loan in loans:
        maturity_value = loan.get("maturity")
        maturity = maturity_value if isinstance(maturity_value, date) else (date.fromisoformat(str(maturity_value)) if maturity_value else None)
        origination = loan_origination_date(profile, fallback, maturity, loan.get("term_years"))
        regenerate_schedule(cur, loan, origination)


def load_schedule_summary(cur, loan_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT payment_date, total_payment, ending_balance
        FROM re_loan_amortization_schedule
        WHERE loan_id = %s
        ORDER BY period_number
        """,
        (str(loan_id),),
    )
    return cur.fetchall()


def debt_summary_for_quarter(cur, loans: list[dict], quarter: str) -> tuple[Decimal, Decimal]:
    q_end = quarter_end(quarter)
    q_start = add_months(first_of_month(q_end), -2)
    total_debt_service = Decimal("0")
    total_balance = Decimal("0")

    for loan in loans:
        schedule = load_schedule_summary(cur, UUID(str(loan["id"])))
        if schedule:
            quarter_rows = [
                row for row in schedule
                if row["payment_date"] and q_start <= row["payment_date"] <= q_end
            ]
            if quarter_rows:
                total_debt_service += sum(d(row["total_payment"]) for row in quarter_rows)
                total_balance += d(quarter_rows[-1]["ending_balance"])
            else:
                last_row = None
                for row in schedule:
                    if row["payment_date"] and row["payment_date"] <= q_end:
                        last_row = row
                if last_row:
                    total_balance += d(last_row["ending_balance"])
                else:
                    total_balance += d(loan["upb"])
        else:
            balance = d(loan["upb"])
            total_balance += balance
            monthly_rate = d(loan["rate"]) / Decimal("12")
            total_debt_service += (balance * monthly_rate * Decimal("3")).quantize(Decimal("0.01"))

    return total_debt_service.quantize(Decimal("0.01")), total_balance.quantize(Decimal("0.01"))


def upsert_property_asset_quarter_states(
    cur,
    ctx: AssetContext,
    profile: dict,
    quarter_rollups: dict[str, dict[str, Decimal]],
    loans: list[dict],
) -> dict[str, dict[str, Decimal]]:
    results: dict[str, dict[str, Decimal]] = {}
    final_quarter = max(quarter_rollups)

    for quarter in sorted(quarter_rollups):
        debt_service, debt_balance = debt_summary_for_quarter(cur, loans, quarter)
        revenue = quarter_rollups[quarter]["revenue"]
        other_income = quarter_rollups[quarter]["other_income"]
        opex = quarter_rollups[quarter]["opex"]
        capex = quarter_rollups[quarter]["capex"]
        occupancy = quarter_rollups[quarter]["occupancy"]
        noi = quarter_rollups[quarter]["noi"]
        cap_rate = cap_rate_for_quarter(profile, quarter, final_quarter)
        asset_value = ((noi * Decimal("4")) / cap_rate).quantize(Decimal("0.01")) if cap_rate > 0 else d(profile["purchase_price"])
        implied_equity = (asset_value - debt_balance).quantize(Decimal("0.01"))
        nav = implied_equity
        ltv = (debt_balance / asset_value).quantize(Decimal("0.0001")) if asset_value > 0 else None
        dscr = (noi / debt_service).quantize(Decimal("0.0001")) if debt_service > 0 else None
        debt_yield = (noi / debt_balance).quantize(Decimal("0.0001")) if debt_balance > 0 else None
        net_cash_flow = (noi - capex - debt_service).quantize(Decimal("0.01"))
        inputs_hash = hash_payload(
            {
                "asset_id": str(ctx.asset_id),
                "quarter": quarter,
                "source": BACKFILL_SOURCE,
                "revenue": str(revenue),
                "other_income": str(other_income),
                "opex": str(opex),
                "capex": str(capex),
                "debt_service": str(debt_service),
                "occupancy": str(occupancy),
                "asset_value": str(asset_value),
                "debt_balance": str(debt_balance),
                "cap_rate": str(cap_rate),
            }
        )
        cur.execute(
            """
            INSERT INTO re_asset_quarter_state (
              asset_id, quarter, scenario_id, run_id, accounting_basis,
              noi, revenue, other_income, opex, capex, debt_service,
              leasing_costs, tenant_improvements, free_rent, net_cash_flow,
              occupancy, debt_balance, cash_balance, asset_value,
              implied_equity_value, nav, ltv, dscr, debt_yield,
              valuation_method, value_source, inputs_hash
            )
            VALUES (
              %s, %s, NULL, %s, 'accrual',
              %s, %s, %s, %s, %s, %s,
              0, 0, 0, %s,
              %s, %s, 0, %s,
              %s, %s, %s, %s, %s,
              'cap_rate', 'reconstructed_actuals', %s
            )
            ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              run_id = EXCLUDED.run_id,
              accounting_basis = 'accrual',
              noi = EXCLUDED.noi,
              revenue = EXCLUDED.revenue,
              other_income = EXCLUDED.other_income,
              opex = EXCLUDED.opex,
              capex = EXCLUDED.capex,
              debt_service = EXCLUDED.debt_service,
              leasing_costs = 0,
              tenant_improvements = 0,
              free_rent = 0,
              net_cash_flow = EXCLUDED.net_cash_flow,
              occupancy = EXCLUDED.occupancy,
              debt_balance = EXCLUDED.debt_balance,
              cash_balance = 0,
              asset_value = EXCLUDED.asset_value,
              implied_equity_value = EXCLUDED.implied_equity_value,
              nav = EXCLUDED.nav,
              ltv = EXCLUDED.ltv,
              dscr = EXCLUDED.dscr,
              debt_yield = EXCLUDED.debt_yield,
              valuation_method = 'cap_rate',
              value_source = 'reconstructed_actuals',
              inputs_hash = EXCLUDED.inputs_hash,
              created_at = now()
            """,
            (
                str(ctx.asset_id),
                quarter,
                str(BACKFILL_RUN_ID),
                q12(noi),
                q12(revenue),
                q12(other_income),
                q12(opex),
                q12(capex),
                q12(debt_service),
                q12(net_cash_flow),
                q12(occupancy),
                q12(debt_balance),
                q12(asset_value),
                q12(implied_equity),
                q12(nav),
                q12(ltv) if ltv is not None else None,
                q12(dscr) if dscr is not None else None,
                q12(debt_yield) if debt_yield is not None else None,
                inputs_hash,
            ),
        )
        results[quarter] = {
            "asset_value": asset_value,
            "nav": nav,
            "debt_balance": debt_balance,
            "debt_service": debt_service,
            "noi": noi,
            "ltv": ltv or Decimal("0"),
            "dscr": dscr or Decimal("0"),
        }

    latest = results[max(results)]
    cur.execute(
        """
        UPDATE repe_property_asset
        SET current_noi = %s,
            occupancy = %s
        WHERE asset_id = %s
        """,
        (
            q12(latest["noi"] * Decimal("4")),
            q12(quarter_rollups[max(quarter_rollups)]["occupancy"]),
            str(ctx.asset_id),
        ),
    )
    return results


def upsert_property_loan_detail(cur, ctx: AssetContext, asset_states: dict[str, dict[str, Decimal]], loans: list[dict]) -> None:
    latest_quarter = max(asset_states)
    latest_state = asset_states[latest_quarter]
    cur.execute(
        """
        SELECT maturity
        FROM re_loan
        WHERE asset_id = %s
        ORDER BY maturity DESC NULLS LAST
        LIMIT 1
        """,
        (str(ctx.asset_id),),
    )
    maturity_row = cur.fetchone()
    maturity = maturity_row["maturity"] if maturity_row else None
    weighted_rate_num = sum(d(loan["upb"]) * d(loan["rate"]) for loan in loans)
    original_balance = sum(d(loan["upb"]) for loan in loans)
    coupon = (weighted_rate_num / original_balance).quantize(Decimal("0.000001")) if original_balance > 0 else None
    cur.execute(
        """
        INSERT INTO re_loan_detail (
          asset_id, original_balance, current_balance, coupon,
          maturity_date, rating, ltv, dscr
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (asset_id) DO UPDATE SET
          original_balance = EXCLUDED.original_balance,
          current_balance = EXCLUDED.current_balance,
          coupon = EXCLUDED.coupon,
          maturity_date = EXCLUDED.maturity_date,
          rating = EXCLUDED.rating,
          ltv = EXCLUDED.ltv,
          dscr = EXCLUDED.dscr,
          created_at = now()
        """,
        (
            str(ctx.asset_id),
            q12(original_balance),
            q12(latest_state["debt_balance"]),
            q12(coupon) if coupon is not None else None,
            maturity,
            "Performing" if (latest_state["dscr"] or Decimal("0")) >= Decimal("1.15") else "Watch",
            q12(latest_state["ltv"]) if latest_state["ltv"] else None,
            q12(latest_state["dscr"]) if latest_state["dscr"] else None,
        ),
    )


def ensure_debt_loans(
    cur,
    assets: dict[str, AssetContext],
    deal_inputs: dict[UUID, dict[str, Decimal]],
) -> tuple[int, dict[UUID, dict[str, Decimal]]]:
    cur.execute(
        """
        SELECT
          a.asset_id,
          a.name AS asset_name,
          d.deal_id,
          d.name AS deal_name,
          d.fund_id,
          f.name AS fund_name,
          c.rating,
          c.coupon,
          c.maturity_date,
          c.collateral_summary_json
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        JOIN repe_cmbs_asset c ON c.asset_id = a.asset_id
        WHERE f.name = 'Meridian Credit Opportunities Fund I'
        ORDER BY a.name
        """
    )
    rows = cur.fetchall()
    count = 0
    latest_asset_state: dict[UUID, dict[str, Decimal]] = {}

    for row in rows:
        ctx = assets[row["asset_name"]]
        collateral = row["collateral_summary_json"] or {}
        upb = d(collateral.get("upb"))
        coupon = d(row["coupon"])
        ltv = d(collateral.get("ltv"))
        dscr = d(collateral.get("dscr"))
        annual_debt_service = d(collateral.get("annual_debt_service"))
        collateral_value = (upb / ltv).quantize(Decimal("0.01")) if ltv > 0 else upb
        realized = (upb * (Decimal("0.010") if row["rating"] == "Investment Grade" else Decimal("0.006")) * Decimal("4")).quantize(Decimal("0.01"))
        deal_inputs[ctx.deal_id]["committed_capital"] += upb
        deal_inputs[ctx.deal_id]["invested_capital"] += upb
        deal_inputs[ctx.deal_id]["realized_distributions"] += realized

        loan_id = _v2_id(f"credit-loan:{ctx.asset_name}")
        cur.execute(
            """
            INSERT INTO re_loan (
              id, env_id, business_id, fund_id, investment_id, asset_id, loan_name, upb,
              rate_type, rate, spread, maturity, amort_type, amortization_period_years,
              term_years, io_period_months, balloon_flag, payment_frequency
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'fixed', %s, NULL, %s,
                    'interest_only', NULL, NULL, NULL, true, 'quarterly')
            ON CONFLICT (id) DO UPDATE SET
              upb = EXCLUDED.upb,
              rate = EXCLUDED.rate,
              maturity = EXCLUDED.maturity
            """,
            (
                str(loan_id),
                ENV_ID,
                str(TENANT_BUSINESS_ID),
                str(ctx.fund_id),
                str(ctx.deal_id),
                str(ctx.asset_id),
                f"Held Note - {ctx.asset_name[:60]}",
                q12(upb),
                q12(coupon),
                row["maturity_date"],
            ),
        )
        cur.execute(
            """
            INSERT INTO re_loan_detail (
              asset_id, original_balance, current_balance, coupon,
              maturity_date, rating, ltv, dscr
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (asset_id) DO UPDATE SET
              original_balance = EXCLUDED.original_balance,
              current_balance = EXCLUDED.current_balance,
              coupon = EXCLUDED.coupon,
              maturity_date = EXCLUDED.maturity_date,
              rating = EXCLUDED.rating,
              ltv = EXCLUDED.ltv,
              dscr = EXCLUDED.dscr,
              created_at = now()
            """,
            (
                str(ctx.asset_id),
                q12(upb),
                q12(upb),
                q12(coupon),
                row["maturity_date"],
                row["rating"],
                q12(ltv),
                q12(dscr),
            ),
        )

        cur.execute("DELETE FROM re_loan_amortization_schedule WHERE loan_id = %s", (str(loan_id),))
        for period, payment_date in enumerate(
            [date(2024, 3, 31), date(2024, 6, 30), date(2024, 9, 30), date(2024, 12, 31),
             date(2025, 3, 31), date(2025, 6, 30), date(2025, 9, 30), date(2025, 12, 31),
             date(2026, 3, 31), date(2026, 6, 30)],
            start=1,
        ):
            total_payment = (annual_debt_service / Decimal("4")).quantize(Decimal("0.01"))
            cur.execute(
                """
                INSERT INTO re_loan_amortization_schedule (
                  loan_id, period_number, payment_date, beginning_balance,
                  scheduled_principal, interest_payment, total_payment, ending_balance
                )
                VALUES (%s, %s, %s, %s, 0, %s, %s, %s)
                """,
                (
                    str(loan_id),
                    period,
                    payment_date,
                    q2(upb),
                    q2(total_payment),
                    q2(total_payment),
                    q2(upb),
                ),
            )

        start_quarter = "2024Q4"
        for quarter in quarter_sequence(start_quarter, "2026Q1"):
            q_idx = quarter_sequence(start_quarter, quarter).index(quarter)
            watchlist = bool(collateral.get("watchlist"))
            occ = d(collateral.get("occupancy"))
            if watchlist:
                occ -= Decimal("0.015") * Decimal(str(max(0, 2 - q_idx)))  # older quarters slightly weaker
            else:
                occ += Decimal("0.002") * Decimal(str(q_idx))
            occ = max(Decimal("0.7000"), min(Decimal("0.9800"), occ)).quantize(Decimal("0.0001"))

            revenue = (upb * coupon / Decimal("4")).quantize(Decimal("0.01"))
            opex = (revenue * Decimal("0.03")).quantize(Decimal("0.01"))
            noi = (revenue - opex).quantize(Decimal("0.01"))
            debt_service = (annual_debt_service / Decimal("4")).quantize(Decimal("0.01"))
            mark = DEBT_MARK_BY_RATING.get(row["rating"], Decimal("0.9800"))
            if watchlist:
                mark -= Decimal("0.015")
            mark += Decimal("0.0010") * Decimal(str(q_idx))
            nav = (upb * mark).quantize(Decimal("0.01"))
            inputs_hash = hash_payload(
                {
                    "asset_id": str(ctx.asset_id),
                    "quarter": quarter,
                    "upb": str(upb),
                    "coupon": str(coupon),
                    "ltv": str(ltv),
                    "dscr": str(dscr),
                    "mark": str(mark),
                }
            )
            cur.execute(
                """
                INSERT INTO re_asset_operating_qtr (
                  asset_id, quarter, scenario_id, revenue, other_income, opex, capex,
                  debt_service, leasing_costs, tenant_improvements, free_rent, occupancy,
                  cash_balance, source_type, inputs_hash
                )
                VALUES (%s, %s, NULL, %s, 0, %s, 0, %s, 0, 0, 0, %s, 0, 'derived', %s)
                ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
                DO UPDATE SET
                  revenue = EXCLUDED.revenue,
                  opex = EXCLUDED.opex,
                  debt_service = EXCLUDED.debt_service,
                  occupancy = EXCLUDED.occupancy,
                  cash_balance = 0,
                  source_type = 'derived',
                  inputs_hash = EXCLUDED.inputs_hash,
                  created_at = now()
                """,
                (
                    str(ctx.asset_id),
                    quarter,
                    q12(revenue),
                    q12(opex),
                    q12(debt_service),
                    q12(occ),
                    inputs_hash,
                ),
            )
            cur.execute(
                """
                INSERT INTO re_asset_quarter_state (
                  asset_id, quarter, scenario_id, run_id, accounting_basis,
                  noi, revenue, other_income, opex, capex, debt_service,
                  leasing_costs, tenant_improvements, free_rent, net_cash_flow,
                  occupancy, debt_balance, cash_balance, asset_value,
                  implied_equity_value, nav, ltv, dscr, debt_yield,
                  valuation_method, value_source, inputs_hash
                )
                VALUES (
                  %s, %s, NULL, %s, 'accrual',
                  %s, %s, 0, %s, 0, %s,
                  0, 0, 0, %s,
                  %s, %s, 0, %s,
                  %s, %s, %s, %s, %s,
                  'loan_mark', 'reconstructed_collateral', %s
                )
                ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
                DO UPDATE SET
                  run_id = EXCLUDED.run_id,
                  noi = EXCLUDED.noi,
                  revenue = EXCLUDED.revenue,
                  other_income = 0,
                  opex = EXCLUDED.opex,
                  capex = 0,
                  debt_service = EXCLUDED.debt_service,
                  net_cash_flow = EXCLUDED.net_cash_flow,
                  occupancy = EXCLUDED.occupancy,
                  debt_balance = EXCLUDED.debt_balance,
                  cash_balance = 0,
                  asset_value = EXCLUDED.asset_value,
                  implied_equity_value = EXCLUDED.implied_equity_value,
                  nav = EXCLUDED.nav,
                  ltv = EXCLUDED.ltv,
                  dscr = EXCLUDED.dscr,
                  debt_yield = EXCLUDED.debt_yield,
                  valuation_method = 'loan_mark',
                  value_source = 'reconstructed_collateral',
                  inputs_hash = EXCLUDED.inputs_hash,
                  created_at = now()
                """,
                (
                    str(ctx.asset_id),
                    quarter,
                    str(BACKFILL_RUN_ID),
                    q12(noi),
                    q12(revenue),
                    q12(opex),
                    q12(debt_service),
                    q12(noi - debt_service),
                    q12(occ),
                    q12(upb),
                    q12(collateral_value),
                    q12(collateral_value - upb),
                    q12(nav),
                    q12(ltv),
                    q12(dscr),
                    q12((noi / upb).quantize(Decimal("0.0001")) if upb > 0 else None),
                    inputs_hash,
                ),
            )
            latest_asset_state[ctx.asset_id] = {
                "asset_value": collateral_value,
                "nav": nav,
                "debt_balance": upb,
                "ltv": ltv,
                "dscr": dscr,
            }
        cur.execute(
            """
            UPDATE repe_asset
            SET cost_basis = %s
            WHERE asset_id = %s AND cost_basis IS NULL
            """,
            (q12(upb), str(ctx.asset_id)),
        )
        count += 1
    return count, latest_asset_state


def deal_age_quarters(acq_quarter: str, quarter: str) -> int:
    seq = quarter_sequence(acq_quarter, quarter)
    return max(0, len(seq) - 1)


def update_deal_rollups(cur, deal_rollup_inputs: dict[UUID, dict[str, Decimal]], assets: dict[str, AssetContext]) -> None:
    for deal_id, payload in deal_rollup_inputs.items():
        cur.execute(
            """
            UPDATE repe_deal
            SET committed_capital = %s,
                invested_capital = %s,
                realized_distributions = %s
            WHERE deal_id = %s
            """,
            (
                q12(payload["committed_capital"]),
                q12(payload["invested_capital"]),
                q12(payload["realized_distributions"]),
                str(deal_id),
            ),
        )


def upsert_rollups(cur, fund_ids: dict[str, UUID]) -> tuple[int, int, int]:
    cur.execute(
        """
        SELECT
          d.deal_id,
          d.fund_id,
          d.committed_capital,
          d.invested_capital,
          d.realized_distributions,
          aqs.quarter,
          SUM(COALESCE(aqs.nav, 0)) AS nav,
          SUM(COALESCE(aqs.asset_value, 0)) AS gross_asset_value,
          SUM(COALESCE(aqs.debt_balance, 0)) AS debt_balance,
          SUM(COALESCE(aqs.cash_balance, 0)) AS cash_balance,
          SUM(COALESCE(aqs.asset_value, 0) * COALESCE(aqs.ltv, 0)) AS weighted_ltv_num,
          SUM(COALESCE(aqs.asset_value, 0) * COALESCE(aqs.dscr, 0)) AS weighted_dscr_num
        FROM repe_deal d
        JOIN repe_asset a ON a.deal_id = d.deal_id
        JOIN re_asset_quarter_state aqs ON aqs.asset_id = a.asset_id AND aqs.scenario_id IS NULL
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE f.business_id = %s
        GROUP BY d.deal_id, d.fund_id, d.committed_capital, d.invested_capital, d.realized_distributions, aqs.quarter
        ORDER BY aqs.quarter, d.deal_id
        """,
        (str(TENANT_BUSINESS_ID),),
    )
    deal_rows = cur.fetchall()

    investment_count = 0
    fund_state_count = 0
    fund_metric_count = 0
    fund_accum: dict[tuple[UUID, str], dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

    for row in deal_rows:
        committed = d(row["committed_capital"])
        invested = d(row["invested_capital"])
        realized = d(row["realized_distributions"])
        nav = d(row["nav"])
        gross_asset_value = d(row["gross_asset_value"])
        debt_balance = d(row["debt_balance"])
        cash_balance = d(row["cash_balance"])
        equity_multiple = ((realized + nav) / invested).quantize(Decimal("0.0001")) if invested > 0 else None
        inputs_hash = hash_payload(
            {
                "deal_id": str(row["deal_id"]),
                "quarter": row["quarter"],
                "nav": str(nav),
                "gross_asset_value": str(gross_asset_value),
                "debt_balance": str(debt_balance),
                "committed": str(committed),
                "invested": str(invested),
                "realized": str(realized),
            }
        )
        cur.execute(
            """
            INSERT INTO re_investment_quarter_state (
              investment_id, quarter, scenario_id, run_id, nav,
              committed_capital, invested_capital, realized_distributions,
              unrealized_value, gross_irr, net_irr, equity_multiple,
              inputs_hash, gross_asset_value, debt_balance, cash_balance,
              effective_ownership_percent, fund_nav_contribution
            )
            VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, NULL, NULL, %s, %s, %s, %s, %s, 1.0, %s)
            ON CONFLICT (investment_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              run_id = EXCLUDED.run_id,
              nav = EXCLUDED.nav,
              committed_capital = EXCLUDED.committed_capital,
              invested_capital = EXCLUDED.invested_capital,
              realized_distributions = EXCLUDED.realized_distributions,
              unrealized_value = EXCLUDED.unrealized_value,
              equity_multiple = EXCLUDED.equity_multiple,
              inputs_hash = EXCLUDED.inputs_hash,
              gross_asset_value = EXCLUDED.gross_asset_value,
              debt_balance = EXCLUDED.debt_balance,
              cash_balance = EXCLUDED.cash_balance,
              effective_ownership_percent = 1.0,
              fund_nav_contribution = EXCLUDED.fund_nav_contribution,
              created_at = now()
            """,
            (
                str(row["deal_id"]),
                row["quarter"],
                str(BACKFILL_RUN_ID),
                q12(nav),
                q12(committed),
                q12(invested),
                q12(realized),
                q12(nav),
                q12(equity_multiple) if equity_multiple is not None else None,
                inputs_hash,
                q12(gross_asset_value),
                q12(debt_balance),
                q12(cash_balance),
                q12(nav),
            ),
        )
        investment_count += 1

        key = (UUID(str(row["fund_id"])), row["quarter"])
        fund_accum[key]["portfolio_nav"] += nav
        fund_accum[key]["gross_asset_value"] += gross_asset_value
        fund_accum[key]["weighted_ltv_num"] += d(row["weighted_ltv_num"])
        fund_accum[key]["weighted_dscr_num"] += d(row["weighted_dscr_num"])
        fund_accum[key]["invested_capital"] += invested
        fund_accum[key]["realized_distributions"] += realized

    for (fund_id, quarter), payload in fund_accum.items():
        cur.execute("SELECT target_size FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        target_size = d((cur.fetchone() or {}).get("target_size"))
        total_called = min(target_size if target_size > 0 else payload["invested_capital"], payload["invested_capital"])
        total_distributed = payload["realized_distributions"]
        portfolio_nav = payload["portfolio_nav"]
        gross_asset_value = payload["gross_asset_value"]
        weighted_ltv = (payload["weighted_ltv_num"] / gross_asset_value).quantize(Decimal("0.0001")) if gross_asset_value > 0 else None
        weighted_dscr = (payload["weighted_dscr_num"] / gross_asset_value).quantize(Decimal("0.0001")) if gross_asset_value > 0 else None
        dpi = (total_distributed / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
        rvpi = (portfolio_nav / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
        tvpi = ((portfolio_nav + total_distributed) / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
        quarter_index = len(quarter_sequence("2024Q4", quarter))
        years = Decimal(str(max(0.25, quarter_index / 4)))
        irr = None
        if tvpi and tvpi > 0:
            irr = Decimal(str(math.pow(float(tvpi), float(Decimal("1") / years)) - 1)).quantize(Decimal("0.0001"))
        inputs_hash = hash_payload(
            {
                "fund_id": str(fund_id),
                "quarter": quarter,
                "portfolio_nav": str(portfolio_nav),
                "called": str(total_called),
                "distributed": str(total_distributed),
                "weighted_ltv": str(weighted_ltv),
                "weighted_dscr": str(weighted_dscr),
            }
        )
        cur.execute(
            """
            INSERT INTO re_fund_quarter_state (
              fund_id, quarter, scenario_id, run_id, portfolio_nav, total_committed, total_called,
              total_distributed, dpi, rvpi, tvpi, gross_irr, net_irr, weighted_ltv, weighted_dscr,
              inputs_hash
            )
            VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              run_id = EXCLUDED.run_id,
              portfolio_nav = EXCLUDED.portfolio_nav,
              total_committed = EXCLUDED.total_committed,
              total_called = EXCLUDED.total_called,
              total_distributed = EXCLUDED.total_distributed,
              dpi = EXCLUDED.dpi,
              rvpi = EXCLUDED.rvpi,
              tvpi = EXCLUDED.tvpi,
              gross_irr = EXCLUDED.gross_irr,
              net_irr = EXCLUDED.net_irr,
              weighted_ltv = EXCLUDED.weighted_ltv,
              weighted_dscr = EXCLUDED.weighted_dscr,
              inputs_hash = EXCLUDED.inputs_hash,
              created_at = now()
            """,
            (
                str(fund_id),
                quarter,
                str(BACKFILL_RUN_ID),
                q12(portfolio_nav),
                q12(target_size) if target_size > 0 else q12(total_called),
                q12(total_called),
                q12(total_distributed),
                q12(dpi) if dpi is not None else None,
                q12(rvpi) if rvpi is not None else None,
                q12(tvpi) if tvpi is not None else None,
                q12(irr) if irr is not None else None,
                q12((irr - Decimal("0.0150")).quantize(Decimal("0.0001"))) if irr is not None else None,
                q12(weighted_ltv) if weighted_ltv is not None else None,
                q12(weighted_dscr) if weighted_dscr is not None else None,
                inputs_hash,
            ),
        )
        fund_state_count += 1

        cur.execute(
            """
            INSERT INTO re_fund_quarter_metrics (
              fund_id, quarter, scenario_id, run_id, contributed_to_date, distributed_to_date,
              nav, dpi, tvpi, irr
            )
            VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              run_id = EXCLUDED.run_id,
              contributed_to_date = EXCLUDED.contributed_to_date,
              distributed_to_date = EXCLUDED.distributed_to_date,
              nav = EXCLUDED.nav,
              dpi = EXCLUDED.dpi,
              tvpi = EXCLUDED.tvpi,
              irr = EXCLUDED.irr,
              created_at = now()
            """,
            (
                str(fund_id),
                quarter,
                str(BACKFILL_RUN_ID),
                q12(total_called),
                q12(total_distributed),
                q12(portfolio_nav),
                q12(dpi) if dpi is not None else None,
                q12(tvpi) if tvpi is not None else None,
                q12(irr) if irr is not None else None,
            ),
        )
        fund_metric_count += 1

    return investment_count, fund_state_count, fund_metric_count


def repair_fund_level_amortization_dates(cur) -> int:
    cur.execute(
        """
        WITH base AS (
          SELECT
            id AS loan_id,
            (maturity - make_interval(years => term_years))::date AS origination_date
          FROM re_loan
          WHERE business_id = %s
            AND asset_id IS NULL
            AND amort_type = 'amortizing'
            AND maturity IS NOT NULL
            AND term_years IS NOT NULL
        )
        UPDATE re_loan_amortization_schedule s
        SET payment_date = (base.origination_date + make_interval(months => s.period_number))::date
        FROM base
        WHERE s.loan_id = base.loan_id
          AND s.payment_date IS NULL
        RETURNING s.id
        """,
        (str(TENANT_BUSINESS_ID),),
    )
    return len(cur.fetchall())


def write_summary(counts: dict[str, int]) -> Path:
    artifacts = Path(__file__).resolve().parents[2] / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    path = artifacts / "meridian_re_seed_backfill_2026-03-05.json"
    path.write_text(json.dumps(counts, indent=2, sort_keys=True) + "\n")
    return path


def main() -> None:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")

    property_profiles = build_property_profiles()

    counts: dict[str, int] = defaultdict(int)

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            ensure_schema(cur)
            assets = load_assets(cur)
            fund_ids = load_funds(cur)

            managed_property_assets: list[UUID] = []
            deal_inputs: dict[UUID, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

            for profile_name, profile in property_profiles.items():
                ctx = assets.get(profile_name)
                if ctx is None:
                    raise RuntimeError(f"Missing seeded asset: {profile_name}")
                managed_property_assets.append(ctx.asset_id)
                ensure_property_metadata(cur, ctx, profile)
                counts["property_assets_touched"] += 1

            delete_existing_property_seed_rows(cur, managed_property_assets)

            for profile_name, profile in property_profiles.items():
                ctx = assets[profile_name]
                quarter_rollups = upsert_monthly_rows(cur, ctx, profile)
                counts["property_quarters_rebuilt"] += len(quarter_rollups)
                counts["property_actual_rows"] += sum(10 for _ in iter_months(max(first_of_month(date.fromisoformat(profile["acq_date"])), date(2024, 1, 1)), CURRENT_MONTH))
                loans = ensure_property_loans(cur, ctx, profile)
                counts["property_loans_present"] += len(loans)
                refresh_loan_schedules(cur, ctx, profile, loans)
                asset_states = upsert_property_asset_quarter_states(cur, ctx, profile, quarter_rollups, loans)
                upsert_property_loan_detail(cur, ctx, asset_states, loans)
                counts["asset_quarter_states_upserted"] += len(asset_states)
                counts["property_comps_inserted"] += upsert_property_comps(cur, ctx, profile)

                quarter_items = sorted(asset_states)
                if not quarter_items:
                    continue
                latest_quarter = quarter_items[-1]
                initial_balance = sum(d(loan["upb"]) for loan in loans)
                equity_basis = max(Decimal("0"), Decimal(str(profile["purchase_price"])) - initial_balance)
                deal_age = deal_age_quarters(quarter_items[0], latest_quarter)
                yield_rate = Decimal("0.015") if not profile.get("distressed") else Decimal("0.003")
                realized = (equity_basis * yield_rate * Decimal(str(max(0, deal_age - 1)))).quantize(Decimal("0.01"))
                deal_inputs[ctx.deal_id]["committed_capital"] += Decimal(str(profile["purchase_price"]))
                deal_inputs[ctx.deal_id]["invested_capital"] += equity_basis
                deal_inputs[ctx.deal_id]["realized_distributions"] += realized

            debt_loan_count, _ = ensure_debt_loans(cur, assets, deal_inputs)
            counts["debt_loans_present"] += debt_loan_count

            update_deal_rollups(cur, deal_inputs, assets)
            investment_count, fund_state_count, fund_metric_count = upsert_rollups(cur, fund_ids)
            counts["investment_quarter_states_upserted"] = investment_count
            counts["fund_quarter_states_upserted"] = fund_state_count
            counts["fund_quarter_metrics_upserted"] = fund_metric_count
            counts["fund_level_schedule_dates_repaired"] = repair_fund_level_amortization_dates(cur)

        conn.commit()

    summary_path = write_summary(counts)
    print(f"Backfill complete. Summary: {summary_path}")
    print(json.dumps(counts, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
