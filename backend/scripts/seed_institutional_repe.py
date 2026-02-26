#!/usr/bin/env python3
"""Seed the database with the full institutional Meridian REPE dataset.

Creates:
  - Meridian Real Estate Partners business entity
  - Meridian Real Estate Fund III (equity, closed-end, $900M)
    * 4 assets: Multifamily, Senior Housing, Medical Office, Student Housing
    * 2 repe_deals grouping them
    * GP + 2 LP entities with ownership edges
    * Fund terms (8% pref, 20% carry, European waterfall)
    * 2 capital calls with investor contributions
  - Meridian Credit Opportunities Fund I (debt, open-end, $600M)
    * 8 CMBS-style multifamily loan assets
    * Capital calls and LP contributions
  - fin_fund + fin_asset_investment + fin_participant + fin_commitment
    + fin_capital_call + fin_contribution records for both funds

Safe to re-run: INSERT ... ON CONFLICT DO NOTHING throughout.

Usage:
  cd backend && python -m scripts.seed_institutional_repe
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("FATAL: DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Fixed UUIDs – deterministic so re-runs are idempotent
# ---------------------------------------------------------------------------
TENANT_ID        = UUID("1186aa7f-faf5-45a0-9cfb-dcb99949a30e")  # existing tenant
BIZ_ID           = UUID("a1b2c3d4-0001-0001-0001-000000000001")
PARTITION_ID     = UUID("a1b2c3d4-0001-0001-0002-000000000001")

# Equity fund
EQ_FUND_ID       = UUID("a1b2c3d4-0001-0010-0001-000000000001")
EQ_DEAL_1_ID     = UUID("a1b2c3d4-0001-0010-0002-000000000001")  # Dallas Cluster
EQ_DEAL_2_ID     = UUID("a1b2c3d4-0001-0010-0002-000000000002")  # Phoenix Assets

EQ_ASSET_1_ID    = UUID("a1b2c3d4-0001-0010-0003-000000000001")  # Meridian Park MF
EQ_ASSET_2_ID    = UUID("a1b2c3d4-0001-0010-0003-000000000002")  # Ellipse Senior
EQ_ASSET_3_ID    = UUID("a1b2c3d4-0001-0010-0003-000000000003")  # Phoenix Medical
EQ_ASSET_4_ID    = UUID("a1b2c3d4-0001-0010-0003-000000000004")  # Westgate Student

EQ_GP_ENTITY_ID  = UUID("a1b2c3d4-0001-0010-0004-000000000001")
EQ_LP1_ENTITY_ID = UUID("a1b2c3d4-0001-0010-0004-000000000002")
EQ_LP2_ENTITY_ID = UUID("a1b2c3d4-0001-0010-0004-000000000003")
EQ_SPV1_ID       = UUID("a1b2c3d4-0001-0010-0004-000000000004")  # Dallas JV SPV
EQ_SPV2_ID       = UUID("a1b2c3d4-0001-0010-0004-000000000005")  # Phoenix JV SPV

# Equity fund fin_ layer
FIN_EQ_FUND_ID   = UUID("a1b2c3d4-0001-0010-0005-000000000001")
FIN_EQ_ASSET_1   = UUID("a1b2c3d4-0001-0010-0005-000000000002")
FIN_EQ_ASSET_2   = UUID("a1b2c3d4-0001-0010-0005-000000000003")
FIN_EQ_ASSET_3   = UUID("a1b2c3d4-0001-0010-0005-000000000004")
FIN_EQ_ASSET_4   = UUID("a1b2c3d4-0001-0010-0005-000000000005")

FIN_PART_GP      = UUID("a1b2c3d4-0001-0010-0006-000000000001")  # Meridian GP
FIN_PART_LP1     = UUID("a1b2c3d4-0001-0010-0006-000000000002")  # Mega Pension
FIN_PART_LP2     = UUID("a1b2c3d4-0001-0010-0006-000000000003")  # Regional Ins

FIN_COMMIT_GP    = UUID("a1b2c3d4-0001-0010-0007-000000000001")
FIN_COMMIT_LP1   = UUID("a1b2c3d4-0001-0010-0007-000000000002")
FIN_COMMIT_LP2   = UUID("a1b2c3d4-0001-0010-0007-000000000003")

FIN_CALL_EQ_1    = UUID("a1b2c3d4-0001-0010-0008-000000000001")
FIN_CALL_EQ_2    = UUID("a1b2c3d4-0001-0010-0008-000000000002")

# Debt fund
DT_FUND_ID       = UUID("a1b2c3d4-0002-0020-0001-000000000001")

DT_DEAL_1_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000001")
DT_DEAL_2_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000002")
DT_DEAL_3_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000003")
DT_DEAL_4_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000004")
DT_DEAL_5_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000005")
DT_DEAL_6_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000006")
DT_DEAL_7_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000007")
DT_DEAL_8_ID     = UUID("a1b2c3d4-0002-0020-0002-000000000008")

DT_ASSET_1_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000001")  # Riverdale MF Dallas
DT_ASSET_2_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000002")  # Midtown Atlanta
DT_ASSET_3_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000003")  # Vertex Tampa
DT_ASSET_4_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000004")  # Bellmont Charlotte
DT_ASSET_5_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000005")  # Summit Nashville
DT_ASSET_6_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000006")  # Westridge Austin
DT_ASSET_7_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000007")  # Riverside Miami
DT_ASSET_8_ID    = UUID("a1b2c3d4-0002-0020-0003-000000000008")  # Stratford Denver

DT_GP_ENTITY_ID  = UUID("a1b2c3d4-0002-0020-0004-000000000001")
DT_LP1_ENTITY_ID = UUID("a1b2c3d4-0002-0020-0004-000000000002")

# Debt fund fin_ layer
FIN_DT_FUND_ID   = UUID("a1b2c3d4-0002-0020-0005-000000000001")
FIN_DT_ASSET_1   = UUID("a1b2c3d4-0002-0020-0005-000000000002")
FIN_DT_ASSET_2   = UUID("a1b2c3d4-0002-0020-0005-000000000003")
FIN_DT_ASSET_3   = UUID("a1b2c3d4-0002-0020-0005-000000000004")
FIN_DT_ASSET_4   = UUID("a1b2c3d4-0002-0020-0005-000000000005")
FIN_DT_ASSET_5   = UUID("a1b2c3d4-0002-0020-0005-000000000006")
FIN_DT_ASSET_6   = UUID("a1b2c3d4-0002-0020-0005-000000000007")
FIN_DT_ASSET_7   = UUID("a1b2c3d4-0002-0020-0005-000000000008")
FIN_DT_ASSET_8   = UUID("a1b2c3d4-0002-0020-0005-000000000009")

FIN_PART_DT_GP   = UUID("a1b2c3d4-0002-0020-0006-000000000001")
FIN_PART_DT_LP1  = UUID("a1b2c3d4-0002-0020-0006-000000000002")

FIN_COMMIT_DT_GP  = UUID("a1b2c3d4-0002-0020-0007-000000000001")
FIN_COMMIT_DT_LP1 = UUID("a1b2c3d4-0002-0020-0007-000000000002")

FIN_CALL_DT_1    = UUID("a1b2c3d4-0002-0020-0008-000000000001")
FIN_CALL_DT_2    = UUID("a1b2c3d4-0002-0020-0008-000000000002")

# ---------------------------------------------------------------------------
# Capital event IDs
# ---------------------------------------------------------------------------
CAP_EV_EQ_LP1_1  = UUID("a1b2c3d4-0003-0001-0001-000000000001")  # LP1 call 1
CAP_EV_EQ_LP1_2  = UUID("a1b2c3d4-0003-0001-0001-000000000002")  # LP1 call 2
CAP_EV_EQ_LP2_1  = UUID("a1b2c3d4-0003-0001-0001-000000000003")  # LP2 call 1
CAP_EV_EQ_LP2_2  = UUID("a1b2c3d4-0003-0001-0001-000000000004")  # LP2 call 2
CAP_EV_DT_LP1_1  = UUID("a1b2c3d4-0003-0001-0002-000000000001")  # Debt LP1 call 1
CAP_EV_DT_LP1_2  = UUID("a1b2c3d4-0003-0001-0002-000000000002")  # Debt LP1 call 2


def q(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.000000000001"))


def seed_business(cur) -> None:
    print("  Creating Meridian tenant-business...")
    # Re-use existing tenant; create new business
    cur.execute(
        """
        INSERT INTO business (business_id, tenant_id, name, slug, region, is_active)
        VALUES (%s, %s, %s, %s, %s, true)
        ON CONFLICT (business_id) DO NOTHING
        """,
        (str(BIZ_ID), str(TENANT_ID), "Meridian Capital Management", "meridian-capital", "us"),
    )

    cur.execute(
        """
        INSERT INTO fin_partition (partition_id, tenant_id, business_id, key, partition_type, status)
        VALUES (%s, %s, %s, 'live', 'live', 'active')
        ON CONFLICT (partition_id) DO NOTHING
        """,
        (str(PARTITION_ID), str(TENANT_ID), str(BIZ_ID)),
    )


def seed_equity_fund(cur) -> None:
    print("  Creating Meridian Real Estate Fund III (equity)...")

    # ---------- repe_fund ----------
    cur.execute(
        """
        INSERT INTO repe_fund
        (fund_id, business_id, name, vintage_year, fund_type, strategy, sub_strategy,
         target_size, term_years, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_id) DO NOTHING
        """,
        (
            str(EQ_FUND_ID), str(BIZ_ID),
            "Meridian Real Estate Fund III",
            2026, "closed_end", "equity", "Value-Add",
            q(900_000_000), 7, "investing",
        ),
    )

    # ---------- repe_fund_term ----------
    cur.execute(
        """
        INSERT INTO repe_fund_term
        (fund_term_id, fund_id, effective_from, management_fee_rate, management_fee_basis,
         preferred_return_rate, carry_rate, waterfall_style, catch_up_style)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_term_id) DO NOTHING
        """,
        (
            str(uuid4()), str(EQ_FUND_ID),
            date(2026, 1, 15),
            q(0.015), "committed",
            q(0.08), q(0.20),
            "european", "full",
        ),
    )

    # ---------- Entities: GP + 2 LPs ----------
    for eid, name, etype in [
        (EQ_GP_ENTITY_ID,  "Meridian RE Partners GP, LLC", "gp"),
        (EQ_LP1_ENTITY_ID, "Mega Pension Fund LP",         "fund_lp"),
        (EQ_LP2_ENTITY_ID, "Regional Insurance Company",   "fund_lp"),
        (EQ_SPV1_ID,       "Meridian Dallas JV SPV LLC",   "spv"),
        (EQ_SPV2_ID,       "Meridian Phoenix JV SPV LLC",  "spv"),
    ]:
        cur.execute(
            """
            INSERT INTO repe_entity (entity_id, business_id, name, entity_type, jurisdiction)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (entity_id) DO NOTHING
            """,
            (str(eid), str(BIZ_ID), name, etype, "Delaware"),
        )

    # ---------- Ownership edges (LP → Fund SPV → Asset) ----------
    # LP1 → GP (80% economic through fund)
    # LP2 → GP (20% economic through fund)
    for edge_id, from_id, to_id, pct in [
        (uuid4(), EQ_LP1_ENTITY_ID, EQ_GP_ENTITY_ID, q(0.8)),
        (uuid4(), EQ_LP2_ENTITY_ID, EQ_GP_ENTITY_ID, q(0.2)),
        (uuid4(), EQ_GP_ENTITY_ID,  EQ_SPV1_ID,      q(1.0)),
        (uuid4(), EQ_GP_ENTITY_ID,  EQ_SPV2_ID,      q(1.0)),
    ]:
        cur.execute(
            """
            INSERT INTO repe_ownership_edge
            (ownership_edge_id, from_entity_id, to_entity_id, percent, effective_from)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (str(edge_id), str(from_id), str(to_id), pct, date(2026, 1, 15)),
        )

    # ---------- Deals (Investments) ----------
    for deal_id, name, stage in [
        (EQ_DEAL_1_ID, "MRF III – Dallas Multifamily Cluster", "operating"),
        (EQ_DEAL_2_ID, "MRF III – Phoenix Value-Add Portfolio", "operating"),
    ]:
        cur.execute(
            """
            INSERT INTO repe_deal
            (deal_id, fund_id, name, deal_type, stage, sponsor, target_close_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (deal_id) DO NOTHING
            """,
            (
                str(deal_id), str(EQ_FUND_ID), name,
                "equity", stage,
                "Meridian RE Partners GP, LLC",
                date(2026, 1, 20),
            ),
        )

    # ---------- Property Assets ----------
    property_assets = [
        # (asset_id, deal_id, name, property_type, units, market, noi, occupancy)
        (EQ_ASSET_1_ID, EQ_DEAL_1_ID, "Meridian Park Multifamily – Dallas",
         "multifamily", 285, "Dallas – Deep Ellum", 27_981_616, q("0.945")),
        (EQ_ASSET_2_ID, EQ_DEAL_1_ID, "Ellipse Senior Living – Dallas",
         "senior_housing", 120, "Dallas – Preston Hollow", 759_552,  q("0.920")),
        (EQ_ASSET_3_ID, EQ_DEAL_2_ID, "Phoenix Gateway Medical Office",
         "medical_office", 0, "Scottsdale Medical District", 2_722_438, q("0.880")),
        (EQ_ASSET_4_ID, EQ_DEAL_2_ID, "Westgate Student Housing – Tempe",
         "student_housing", 220, "Tempe – ASU Campus", 1_400_947, q("0.960")),
    ]
    for asset_id, deal_id, name, ptype, units, market, noi, occ in property_assets:
        cur.execute(
            """
            INSERT INTO repe_asset (asset_id, deal_id, asset_type, name)
            VALUES (%s, %s, 'property', %s)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (str(asset_id), str(deal_id), name),
        )
        cur.execute(
            """
            INSERT INTO repe_property_asset
            (asset_id, property_type, units, market, current_noi, occupancy)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (str(asset_id), ptype, units or None, market, q(noi), occ),
        )

    # ---------- Asset–Entity links (SPV ownership) ----------
    asset_entity_links = [
        (EQ_ASSET_1_ID, EQ_SPV1_ID, "owner",    q(1.0)),
        (EQ_ASSET_2_ID, EQ_SPV1_ID, "owner",    q(1.0)),
        (EQ_ASSET_3_ID, EQ_SPV2_ID, "owner",    q(1.0)),
        (EQ_ASSET_4_ID, EQ_SPV2_ID, "owner",    q(1.0)),
    ]
    for asset_id, entity_id, role, pct in asset_entity_links:
        cur.execute(
            """
            INSERT INTO repe_asset_entity_link
            (asset_entity_link_id, asset_id, entity_id, role, percent, effective_from)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (str(uuid4()), str(asset_id), str(entity_id), role, pct, date(2026, 1, 20)),
        )

    # ---------- Capital Events (equity fund) ----------
    cap_events = [
        # (event_id, investor_id, type, amount, date, memo)
        (CAP_EV_EQ_LP1_1, EQ_LP1_ENTITY_ID, "capital_call", q(200_000_000),
         date(2026, 1, 31), "Capital Call #1 – Initial acquisition funding – LP1"),
        (CAP_EV_EQ_LP2_1, EQ_LP2_ENTITY_ID, "capital_call", q(50_000_000),
         date(2026, 1, 31), "Capital Call #1 – Initial acquisition funding – LP2"),
        (CAP_EV_EQ_LP1_2, EQ_LP1_ENTITY_ID, "capital_call", q(160_000_000),
         date(2026, 2, 28), "Capital Call #2 – Additional acquisitions – LP1"),
        (CAP_EV_EQ_LP2_2, EQ_LP2_ENTITY_ID, "capital_call", q(40_000_000),
         date(2026, 2, 28), "Capital Call #2 – Additional acquisitions – LP2"),
    ]
    for ev_id, investor_id, etype, amount, edate, memo in cap_events:
        cur.execute(
            """
            INSERT INTO repe_capital_event
            (capital_event_id, fund_id, investor_id, event_type, amount, event_date, memo)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (capital_event_id) DO NOTHING
            """,
            (str(ev_id), str(EQ_FUND_ID), str(investor_id), etype, amount, edate, memo),
        )

    print("  Equity fund complete: 4 assets, 2 deals, 2 LPs, 4 capital calls.")


def seed_debt_fund(cur) -> None:
    print("  Creating Meridian Credit Opportunities Fund I (debt)...")

    cur.execute(
        """
        INSERT INTO repe_fund
        (fund_id, business_id, name, vintage_year, fund_type, strategy, sub_strategy,
         target_size, term_years, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_id) DO NOTHING
        """,
        (
            str(DT_FUND_ID), str(BIZ_ID),
            "Meridian Credit Opportunities Fund I",
            2024, "open_end", "debt", "CMBS Senior Multifamily",
            q(600_000_000), 7, "investing",
        ),
    )

    cur.execute(
        """
        INSERT INTO repe_fund_term
        (fund_term_id, fund_id, effective_from, management_fee_rate, management_fee_basis,
         preferred_return_rate, carry_rate, waterfall_style, catch_up_style)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_term_id) DO NOTHING
        """,
        (
            str(uuid4()), str(DT_FUND_ID),
            date(2024, 3, 15),
            q(0.010), "invested",
            q(0.05), q(0.10),
            "european", "none",
        ),
    )

    # Entities
    for eid, name, etype in [
        (DT_GP_ENTITY_ID,  "Meridian Credit GP, LLC",        "gp"),
        (DT_LP1_ENTITY_ID, "Meridian Credit LP Investors",   "fund_lp"),
    ]:
        cur.execute(
            """
            INSERT INTO repe_entity (entity_id, business_id, name, entity_type, jurisdiction)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (entity_id) DO NOTHING
            """,
            (str(eid), str(BIZ_ID), name, etype, "Delaware"),
        )

    # 8 CMBS-style loan deals + assets
    loans = [
        # (deal_id, asset_id, deal_name, upb, coupon, maturity, units, market, noi, occ,
        #   dscr, ltv, rating, watchlist)
        (DT_DEAL_1_ID, DT_ASSET_1_ID,
         "Riverdale Multifamily – Dallas TX",
         q(58_000_000), q(0.0575), date(2029, 3, 20),
         310, "Irving / Las Colinas TX",
         q(6_670_000), q("0.920"), q("1.282"), q("0.780"),
         "Investment Grade", False,
         {"property_name": "Riverdale Multifamily",
          "address": "2850 Stemmons Freeway, Dallas, TX 75207",
          "year_built": 2008, "market_rent_per_unit": 1650, "sponsor": "Riverdale RE Group LLC",
          "annual_debt_service": 5_200_000}),

        (DT_DEAL_2_ID, DT_ASSET_2_ID,
         "Midtown Towers – Atlanta GA",
         q(82_500_000), q(0.0625), date(2031, 6, 15),
         425, "Midtown Atlanta GA",
         q(10_965_000), q("0.940"), q("1.523"), q("0.750"),
         "Investment Grade", False,
         {"property_name": "Midtown Towers Multifamily",
          "address": "950 West Peachtree Street, Atlanta, GA 30309",
          "year_built": 2016, "market_rent_per_unit": 1900, "sponsor": "Midtown RE Partners",
          "annual_debt_service": 7_200_000}),

        (DT_DEAL_3_ID, DT_ASSET_3_ID,
         "Vertex Multifamily – Tampa FL",
         q(49_000_000), q(0.0605), date(2029, 8, 20),
         280, "Carrollwood / North Tampa FL",
         q(4_872_000), q("0.890"), q("1.188"), q("0.780"),
         "Watch", True,
         {"property_name": "Vertex Multifamily Tampa",
          "address": "4800 North Armenia Avenue, Tampa, FL 33603",
          "year_built": 2014, "market_rent_per_unit": 1550, "sponsor": "Vertex Real Estate LLC",
          "watchlist_reason": "Below target occupancy; rent growth slower than market",
          "annual_debt_service": 4_100_000}),

        (DT_DEAL_4_ID, DT_ASSET_4_ID,
         "Bellmont Residential – Charlotte NC",
         q(65_000_000), q(0.0615), date(2029, 10, 10),
         365, "Uptown Charlotte NC",
         q(7_605_000), q("0.930"), q("1.345"), q("0.780"),
         "Investment Grade", False,
         {"property_name": "Bellmont Residential",
          "address": "6400 Crescent Drive, Charlotte, NC 28202",
          "year_built": 2011, "market_rent_per_unit": 1700, "sponsor": "Bellmont Capital Group",
          "annual_debt_service": 5_650_000}),

        (DT_DEAL_5_ID, DT_ASSET_5_ID,
         "Summit Heights – Nashville TN",
         q(52_500_000), q(0.058), date(2030, 1, 15),
         295, "West Nashville TN",
         q(5_508_000), q("0.910"), q("1.311"), q("0.774"),
         "Investment Grade", False,
         {"property_name": "Summit Heights Multifamily",
          "address": "3200 West End Avenue, Nashville, TN 37203",
          "year_built": 2013, "market_rent_per_unit": 1800, "sponsor": "Summit Properties TN",
          "annual_debt_service": 4_200_000}),

        (DT_DEAL_6_ID, DT_ASSET_6_ID,
         "Westridge Commons – Austin TX",
         q(74_000_000), q(0.059), date(2030, 3, 20),
         330, "North Austin TX",
         q(8_235_000), q("0.950"), q("1.395"), q("0.705"),
         "Investment Grade", False,
         {"property_name": "Westridge Commons",
          "address": "5500 North Lamar Boulevard, Austin, TX 78751",
          "year_built": 2012, "market_rent_per_unit": 2100, "sponsor": "Westridge Development LLC",
          "annual_debt_service": 5_900_000}),

        (DT_DEAL_7_ID, DT_ASSET_7_ID,
         "Riverside Park – Miami FL",
         q(92_000_000), q(0.062), date(2030, 5, 10),
         410, "Wynwood / Design District FL",
         q(9_108_000), q("0.880"), q("1.273"), q("0.787"),
         "Watch", True,
         {"property_name": "Riverside Park Multifamily",
          "address": "1500 Northeast 2nd Avenue, Miami, FL 33132",
          "year_built": 2010, "market_rent_per_unit": 2200, "sponsor": "Riverside Miami Partners",
          "watchlist_reason": "Occupancy trending down; pre-leasing delays",
          "annual_debt_service": 7_150_000}),

        (DT_DEAL_8_ID, DT_ASSET_8_ID,
         "Stratford Village – Denver CO",
         q(61_000_000), q(0.0585), date(2030, 7, 18),
         275, "Southwest Denver CO",
         q(5_460_000), q("0.900"), q("1.332"), q("0.871"),
         "Watch", True,
         {"property_name": "Stratford Village",
          "address": "2800 South Quitman Street, Denver, CO 80236",
          "year_built": 2009, "market_rent_per_unit": 1900, "sponsor": "Stratford Capital CO",
          "watchlist_reason": "LTV elevated; refinance at maturity may be challenging",
          "annual_debt_service": 4_100_000}),
    ]

    for (deal_id, asset_id, deal_name, upb, coupon, maturity,
         units, market, noi, occ, dscr, ltv, rating, watchlist, collateral) in loans:

        cur.execute(
            """
            INSERT INTO repe_deal
            (deal_id, fund_id, name, deal_type, stage, sponsor, target_close_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (deal_id) DO NOTHING
            """,
            (
                str(deal_id), str(DT_FUND_ID), deal_name,
                "debt", "operating",
                collateral.get("sponsor", "Meridian Borrower LLC"),
                maturity,
            ),
        )

        cur.execute(
            """
            INSERT INTO repe_asset (asset_id, deal_id, asset_type, name)
            VALUES (%s, %s, 'cmbs', %s)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (str(asset_id), str(deal_id), deal_name),
        )

        cur.execute(
            """
            INSERT INTO repe_cmbs_asset
            (asset_id, tranche, rating, coupon, maturity_date, collateral_summary_json)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (asset_id) DO NOTHING
            """,
            (
                str(asset_id),
                "Senior A-Note",
                rating,
                coupon,
                maturity,
                json.dumps({
                    **collateral,
                    "upb": float(upb),
                    "units": units,
                    "submarket": market,
                    "t12_noi": float(noi),
                    "occupancy": float(occ),
                    "dscr": float(dscr),
                    "ltv": float(ltv),
                    "covenant_dscr_min": 1.25,
                    "covenant_ltv_max": 0.78,
                    "watchlist": watchlist,
                }),
            ),
        )

    # Debt fund capital events
    cur.execute(
        """
        INSERT INTO repe_capital_event
        (capital_event_id, fund_id, investor_id, event_type, amount, event_date, memo)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (capital_event_id) DO NOTHING
        """,
        (str(CAP_EV_DT_LP1_1), str(DT_FUND_ID), str(DT_LP1_ENTITY_ID),
         "capital_call", q(250_000_000), date(2024, 3, 25),
         "Capital Call #1 – Initial deployment"),
    )
    cur.execute(
        """
        INSERT INTO repe_capital_event
        (capital_event_id, fund_id, investor_id, event_type, amount, event_date, memo)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (capital_event_id) DO NOTHING
        """,
        (str(CAP_EV_DT_LP1_2), str(DT_FUND_ID), str(DT_LP1_ENTITY_ID),
         "capital_call", q(235_000_000), date(2024, 9, 30),
         "Capital Call #2 – Continued loan origination"),
    )

    print("  Debt fund complete: 8 CMBS-style loan assets.")


def seed_fin_layer_equity(cur) -> None:
    """Create fin_fund + fin_asset_investment + participants + commitments + calls."""
    print("  Creating fin_ layer for equity fund...")

    cur.execute(
        """
        INSERT INTO fin_fund
        (fin_fund_id, tenant_id, business_id, partition_id, fund_code, name, strategy,
         vintage_date, term_years, currency_code, pref_rate, pref_is_compound,
         catchup_rate, carry_rate, waterfall_style, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fin_fund_id) DO NOTHING
        """,
        (
            str(FIN_EQ_FUND_ID), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
            "MRFIII", "Meridian Real Estate Fund III", "equity",
            date(2026, 1, 15), 7, "USD",
            q(0.08), True,
            q(1.00), q(0.20),
            "european", "active",
        ),
    )

    # fin_asset_investment records (4 equity assets)
    fin_eq_assets = [
        (FIN_EQ_ASSET_1, "Meridian Park Multifamily – Dallas",
         date(2026, 1, 20), q(140_000_000), q(335_000_000)),
        (FIN_EQ_ASSET_2, "Ellipse Senior Living – Dallas",
         date(2026, 1, 20), q(85_000_000),  q(110_838_000)),
        (FIN_EQ_ASSET_3, "Phoenix Gateway Medical Office",
         date(2026, 1, 20), q(65_000_000),  q(64_096_154)),
        (FIN_EQ_ASSET_4, "Westgate Student Housing – Tempe",
         date(2026, 1, 20), q(48_000_000),  q(78_668_519)),
    ]
    for fid, name, acq_date, cost, val in fin_eq_assets:
        cur.execute(
            """
            INSERT INTO fin_asset_investment
            (fin_asset_investment_id, tenant_id, business_id, partition_id, fin_fund_id,
             asset_name, acquisition_date, cost_basis, current_valuation, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_asset_investment_id) DO NOTHING
            """,
            (str(fid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_EQ_FUND_ID), name, acq_date, cost, val, "active"),
        )

    # Participants
    participants = [
        (FIN_PART_GP,  "Meridian RE Partners GP, LLC", "gp"),
        (FIN_PART_LP1, "Mega Pension Fund LP",         "lp"),
        (FIN_PART_LP2, "Regional Insurance Company",   "lp"),
    ]
    for pid, name, ptype in participants:
        cur.execute(
            """
            INSERT INTO fin_participant
            (fin_participant_id, tenant_id, business_id, name, participant_type)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (fin_participant_id) DO NOTHING
            """,
            (str(pid), str(TENANT_ID), str(BIZ_ID), name, ptype),
        )

    # Commitments
    commitments = [
        (FIN_COMMIT_GP,  FIN_PART_GP,  "gp",       q(  90_000_000), date(2026, 1, 15)),
        (FIN_COMMIT_LP1, FIN_PART_LP1, "lp",       q( 600_000_000), date(2026, 1, 15)),
        (FIN_COMMIT_LP2, FIN_PART_LP2, "lp",       q( 210_000_000), date(2026, 1, 15)),
    ]
    for cid, pid, role, amount, cdate in commitments:
        cur.execute(
            """
            INSERT INTO fin_commitment
            (fin_commitment_id, tenant_id, business_id, partition_id, fin_fund_id,
             fin_participant_id, commitment_role, commitment_date, committed_amount,
             currency_code, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_commitment_id) DO NOTHING
            """,
            (str(cid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_EQ_FUND_ID), str(pid), role, cdate, amount, "USD", "active"),
        )

    # Capital calls
    calls = [
        (FIN_CALL_EQ_1, 1, date(2026, 1, 31), date(2026, 2, 14),
         q(250_000_000), "Initial acquisition funding", "closed"),
        (FIN_CALL_EQ_2, 2, date(2026, 2, 28), date(2026, 3, 14),
         q(200_000_000), "Additional acquisitions and working capital", "closed"),
    ]
    for cid, num, cdate, due, amount, purpose, status in calls:
        cur.execute(
            """
            INSERT INTO fin_capital_call
            (fin_capital_call_id, tenant_id, business_id, partition_id, fin_fund_id,
             call_number, call_date, due_date, amount_requested, purpose, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_capital_call_id) DO NOTHING
            """,
            (str(cid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_EQ_FUND_ID), num, cdate, due, amount, purpose, status),
        )

    # Contributions per call
    contributions = [
        # (call_id, participant_id, amount, date)
        (FIN_CALL_EQ_1, FIN_PART_LP1, q(200_000_000), date(2026, 2, 14)),
        (FIN_CALL_EQ_1, FIN_PART_LP2, q(50_000_000),  date(2026, 2, 14)),
        (FIN_CALL_EQ_2, FIN_PART_LP1, q(160_000_000), date(2026, 3, 14)),
        (FIN_CALL_EQ_2, FIN_PART_LP2, q(40_000_000),  date(2026, 3, 14)),
    ]
    for call_id, part_id, amount, contrib_date in contributions:
        cur.execute(
            """
            INSERT INTO fin_contribution
            (fin_contribution_id, tenant_id, business_id, partition_id, fin_fund_id,
             fin_capital_call_id, fin_participant_id, contribution_date,
             amount_contributed, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_contribution_id) DO NOTHING
            """,
            (str(uuid4()), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_EQ_FUND_ID), str(call_id), str(part_id),
             contrib_date, amount, "collected"),
        )

    print("  Equity fin_ layer complete.")


def seed_fin_layer_debt(cur) -> None:
    """Create fin_ layer records for debt fund."""
    print("  Creating fin_ layer for debt fund...")

    cur.execute(
        """
        INSERT INTO fin_fund
        (fin_fund_id, tenant_id, business_id, partition_id, fund_code, name, strategy,
         vintage_date, term_years, currency_code, pref_rate, pref_is_compound,
         catchup_rate, carry_rate, waterfall_style, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fin_fund_id) DO NOTHING
        """,
        (
            str(FIN_DT_FUND_ID), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
            "MCOF1", "Meridian Credit Opportunities Fund I", "credit",
            date(2024, 3, 15), 7, "USD",
            q(0.05), False,
            q(0.00), q(0.10),
            "european", "active",
        ),
    )

    # fin_asset_investment for 8 loans
    debt_assets = [
        (FIN_DT_ASSET_1, "Riverdale Multifamily – Dallas TX",
         date(2024, 3, 20), q(60_000_000), q(58_000_000)),
        (FIN_DT_ASSET_2, "Midtown Towers – Atlanta GA",
         date(2024, 6, 15), q(85_000_000), q(82_500_000)),
        (FIN_DT_ASSET_3, "Vertex Multifamily – Tampa FL",
         date(2024, 8, 20), q(50_000_000), q(49_000_000)),
        (FIN_DT_ASSET_4, "Bellmont Residential – Charlotte NC",
         date(2024, 10, 10), q(67_000_000), q(65_000_000)),
        (FIN_DT_ASSET_5, "Summit Heights – Nashville TN",
         date(2025, 1, 15), q(55_000_000), q(52_500_000)),
        (FIN_DT_ASSET_6, "Westridge Commons – Austin TX",
         date(2025, 3, 20), q(75_000_000), q(74_000_000)),
        (FIN_DT_ASSET_7, "Riverside Park – Miami FL",
         date(2025, 5, 10), q(95_000_000), q(92_000_000)),
        (FIN_DT_ASSET_8, "Stratford Village – Denver CO",
         date(2025, 7, 18), q(62_000_000), q(61_000_000)),
    ]
    for fid, name, acq_date, cost, val in debt_assets:
        cur.execute(
            """
            INSERT INTO fin_asset_investment
            (fin_asset_investment_id, tenant_id, business_id, partition_id, fin_fund_id,
             asset_name, acquisition_date, cost_basis, current_valuation, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_asset_investment_id) DO NOTHING
            """,
            (str(fid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_DT_FUND_ID), name, acq_date, cost, val, "active"),
        )

    # Participants (GP + 1 LP for debt fund)
    for pid, name, ptype in [
        (FIN_PART_DT_GP,  "Meridian Credit GP, LLC",      "gp"),
        (FIN_PART_DT_LP1, "Meridian Credit LP Investors",  "lp"),
    ]:
        cur.execute(
            """
            INSERT INTO fin_participant
            (fin_participant_id, tenant_id, business_id, name, participant_type)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (fin_participant_id) DO NOTHING
            """,
            (str(pid), str(TENANT_ID), str(BIZ_ID), name, ptype),
        )

    # Commitments
    for cid, pid, role, amount in [
        (FIN_COMMIT_DT_GP,  FIN_PART_DT_GP,  "gp", q(60_000_000)),
        (FIN_COMMIT_DT_LP1, FIN_PART_DT_LP1, "lp", q(540_000_000)),
    ]:
        cur.execute(
            """
            INSERT INTO fin_commitment
            (fin_commitment_id, tenant_id, business_id, partition_id, fin_fund_id,
             fin_participant_id, commitment_role, commitment_date, committed_amount,
             currency_code, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_commitment_id) DO NOTHING
            """,
            (str(cid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_DT_FUND_ID), str(pid), role, date(2024, 3, 15),
             amount, "USD", "active"),
        )

    # Capital calls
    for cid, num, cdate, due, amount, purpose in [
        (FIN_CALL_DT_1, 1, date(2024, 3, 25), date(2024, 4, 8),
         q(250_000_000), "Initial loan deployment – Loans 1-4"),
        (FIN_CALL_DT_2, 2, date(2024, 9, 30), date(2024, 10, 15),
         q(235_000_000), "Continued loan origination – Loans 5-8"),
    ]:
        cur.execute(
            """
            INSERT INTO fin_capital_call
            (fin_capital_call_id, tenant_id, business_id, partition_id, fin_fund_id,
             call_number, call_date, due_date, amount_requested, purpose, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_capital_call_id) DO NOTHING
            """,
            (str(cid), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_DT_FUND_ID), num, cdate, due, amount, purpose, "closed"),
        )
        cur.execute(
            """
            INSERT INTO fin_contribution
            (fin_contribution_id, tenant_id, business_id, partition_id, fin_fund_id,
             fin_capital_call_id, fin_participant_id, contribution_date,
             amount_contributed, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fin_contribution_id) DO NOTHING
            """,
            (str(uuid4()), str(TENANT_ID), str(BIZ_ID), str(PARTITION_ID),
             str(FIN_DT_FUND_ID), str(cid), str(FIN_PART_DT_LP1),
             due, amount, "collected"),
        )

    print("  Debt fin_ layer complete.")


def main() -> None:
    print("=== Meridian Institutional REPE Dataset Seed ===")
    conn = psycopg.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor(row_factory=psycopg.rows.dict_row)

    try:
        print("\n[1/6] Business + partition...")
        seed_business(cur)

        print("\n[2/6] Equity fund – repe_ layer...")
        seed_equity_fund(cur)

        print("\n[3/6] Debt fund – repe_ layer...")
        seed_debt_fund(cur)

        print("\n[4/6] Equity fund – fin_ layer...")
        seed_fin_layer_equity(cur)

        print("\n[5/6] Debt fund – fin_ layer...")
        seed_fin_layer_debt(cur)

        conn.commit()
        print("\n[6/6] Committed.")

        # Summary
        cur.execute(
            "SELECT COUNT(*) FROM repe_fund WHERE business_id = %s", (str(BIZ_ID),)
        )
        print(f"\n  repe_fund:              {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM repe_deal WHERE fund_id IN "
            "(SELECT fund_id FROM repe_fund WHERE business_id = %s)", (str(BIZ_ID),)
        )
        print(f"  repe_deal:              {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM repe_asset WHERE deal_id IN "
            "(SELECT deal_id FROM repe_deal WHERE fund_id IN "
            "(SELECT fund_id FROM repe_fund WHERE business_id = %s))", (str(BIZ_ID),)
        )
        print(f"  repe_asset:             {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM fin_fund WHERE business_id = %s", (str(BIZ_ID),)
        )
        print(f"  fin_fund:               {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM fin_asset_investment WHERE business_id = %s",
            (str(BIZ_ID),)
        )
        print(f"  fin_asset_investment:   {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM fin_commitment WHERE business_id = %s", (str(BIZ_ID),)
        )
        print(f"  fin_commitment:         {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM fin_capital_call WHERE business_id = %s", (str(BIZ_ID),)
        )
        print(f"  fin_capital_call:       {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM fin_contribution WHERE business_id = %s", (str(BIZ_ID),)
        )
        print(f"  fin_contribution:       {cur.fetchone()['count']}")
        cur.execute(
            "SELECT COUNT(*) FROM repe_capital_event WHERE fund_id IN "
            "(SELECT fund_id FROM repe_fund WHERE business_id = %s)", (str(BIZ_ID),)
        )
        print(f"  repe_capital_event:     {cur.fetchone()['count']}")

        print(f"\n  Business ID: {BIZ_ID}")
        print(f"  Equity Fund ID:  {EQ_FUND_ID}  (fin: {FIN_EQ_FUND_ID})")
        print(f"  Debt Fund ID:    {DT_FUND_ID}  (fin: {FIN_DT_FUND_ID})")
        print("\n=== Seed complete ===")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR – rolled back: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
