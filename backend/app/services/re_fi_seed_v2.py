"""V2 Seed Patch for Institutional Growth Fund VII.

Idempotent patch that extends the v1 institutional seed with:
- Property metadata (address, city, state, submarket, type, size, year_built)
- 4 additional assets (multi-asset investments) → 16 total
- Per-asset debt (loans + DSCR/LTV covenants)
- 15-month NOI accounting + BS data (2024-01 to 2025-03)
- 3 sale comps per asset (48 total)
- 2 distressed assets with negative NOI variance trend
- Adjusted quarter states for distressed assets

Re-runnable: uses deterministic UUIDs + delete-before-insert for accounting data.
"""
from __future__ import annotations

import uuid as _uuid
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log

# ── Deterministic UUID namespace ──────────────────────────────────────────────

_V2_NS = _uuid.UUID("b2c3d4e5-0002-0020-0002-000000000002")


def _v2_id(name: str) -> UUID:
    """Stable UUID5 from a descriptive name. Same name → same UUID every time."""
    return _uuid.uuid5(_V2_NS, name)


# ── 15-month period range ────────────────────────────────────────────────────

_V2_MONTHS = [
    "2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01",
    "2024-05-01", "2024-06-01", "2024-07-01", "2024-08-01",
    "2024-09-01", "2024-10-01", "2024-11-01", "2024-12-01",
    "2025-01-01", "2025-02-01", "2025-03-01",
]

_V2_QUARTERS = ["2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4"]
_V2_APPRECIATION = [1.00, 1.02, 1.04, 1.07, 1.10]

# ── Asset profiles (12 existing + 4 new = 16 total) ─────────────────────────
# inv_idx maps to the INVESTMENTS list index from re_fi_seed.py
# is_new=True means the v2 patch creates this asset.

PROPERTY_PROFILES = [
    # ── Investment 0: Meridian Office Tower ─────────────────────────────
    {
        "inv_idx": 0, "name": "Meridian Office Tower", "is_new": False,
        "address": "1200 17th Street", "city": "Denver", "state": "CO",
        "submarket": "CBD", "property_type": "office",
        "size_sf": 185_000, "units": None, "year_built": 2008,
        "purchase_price": 45_000_000, "noi_monthly": 375_000,
        "occupancy": 0.94, "cap_rate": 0.058,
        "vacancy_rate": 0.06, "expense_ratio": 0.35,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2024-03-15",
    },
    # ── Investment 1: Harborview Logistics Park (primary) ──────────────
    {
        "inv_idx": 1, "name": "Harborview Logistics Park", "is_new": False,
        "address": "8500 Stemmons Freeway", "city": "Dallas", "state": "TX",
        "submarket": "Northwest Dallas", "property_type": "industrial",
        "size_sf": 320_000, "units": None, "year_built": 2015,
        "purchase_price": 38_000_000, "noi_monthly": 316_667,
        "occupancy": 0.97, "cap_rate": 0.052,
        "vacancy_rate": 0.03, "expense_ratio": 0.28,
        "loan_type": "senior_mezz", "distressed": False,
        "acq_date": "2024-04-01",
    },
    # ── Investment 1: Harborview Distribution Center (NEW secondary) ───
    {
        "inv_idx": 1, "name": "Harborview Distribution Center", "is_new": True,
        "address": "4200 Royal Lane", "city": "Dallas", "state": "TX",
        "submarket": "Valwood", "property_type": "industrial",
        "size_sf": 185_000, "units": None, "year_built": 2019,
        "purchase_price": 22_000_000, "noi_monthly": 183_333,
        "occupancy": 0.98, "cap_rate": 0.050,
        "vacancy_rate": 0.02, "expense_ratio": 0.26,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2024-04-01",
    },
    # ── Investment 2: Cascade Multifamily (primary) ────────────────────
    {
        "inv_idx": 2, "name": "Cascade Multifamily", "is_new": False,
        "address": "3200 Peachtree Road NE", "city": "Atlanta", "state": "GA",
        "submarket": "Buckhead", "property_type": "multifamily",
        "size_sf": None, "units": 280, "year_built": 2016,
        "purchase_price": 52_000_000, "noi_monthly": 390_000,
        "occupancy": 0.92, "cap_rate": 0.045,
        "vacancy_rate": 0.08, "expense_ratio": 0.38,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2024-05-10",
    },
    # ── Investment 2: Cascade Village Phase II (NEW secondary) ─────────
    {
        "inv_idx": 2, "name": "Cascade Village Phase II", "is_new": True,
        "address": "3400 Piedmont Road NE", "city": "Atlanta", "state": "GA",
        "submarket": "Buckhead", "property_type": "multifamily",
        "size_sf": None, "units": 196, "year_built": 2021,
        "purchase_price": 34_000_000, "noi_monthly": 255_000,
        "occupancy": 0.89, "cap_rate": 0.046,
        "vacancy_rate": 0.11, "expense_ratio": 0.40,
        "loan_type": "construction", "distressed": False,
        "acq_date": "2024-05-10",
    },
    # ── Investment 3: Summit Retail Center ──────────────────────────────
    {
        "inv_idx": 3, "name": "Summit Retail Center", "is_new": False,
        "address": "4901 W Kennedy Blvd", "city": "Tampa", "state": "FL",
        "submarket": "Westshore", "property_type": "retail",
        "size_sf": 95_000, "units": None, "year_built": 2004,
        "purchase_price": 28_000_000, "noi_monthly": 233_333,
        "occupancy": 0.96, "cap_rate": 0.068,
        "vacancy_rate": 0.04, "expense_ratio": 0.30,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2024-06-01",
    },
    # ── Investment 4: Ironworks Mixed-Use [DISTRESSED] ─────────────────
    {
        "inv_idx": 4, "name": "Ironworks Mixed-Use", "is_new": False,
        "address": "2100 Champa Street", "city": "Denver", "state": "CO",
        "submarket": "RiNo", "property_type": "mixed_use",
        "size_sf": 125_000, "units": None, "year_built": 2022,
        "purchase_price": 41_000_000, "noi_monthly": 273_333,
        "occupancy": 0.78, "cap_rate": 0.055,
        "vacancy_rate": 0.22, "expense_ratio": 0.42,
        "loan_type": "construction", "distressed": True,
        "acq_date": "2024-07-15",
    },
    # ── Investment 5: Lakeside Senior Living ───────────────────────────
    {
        "inv_idx": 5, "name": "Lakeside Senior Living", "is_new": False,
        "address": "7600 E Shea Blvd", "city": "Phoenix", "state": "AZ",
        "submarket": "Scottsdale", "property_type": "senior_housing",
        "size_sf": 92_000, "units": 145, "year_built": 2010,
        "purchase_price": 33_000_000, "noi_monthly": 275_000,
        "occupancy": 0.93, "cap_rate": 0.060,
        "vacancy_rate": 0.07, "expense_ratio": 0.48,
        "loan_type": "senior_mezz", "distressed": False,
        "acq_date": "2024-08-01",
    },
    # ── Investment 6: Pacific Gateway Hotel [DISTRESSED] ───────────────
    {
        "inv_idx": 6, "name": "Pacific Gateway Hotel", "is_new": False,
        "address": "1501 N Dale Mabry Hwy", "city": "Tampa", "state": "FL",
        "submarket": "Airport/Westshore", "property_type": "hospitality",
        "size_sf": 112_000, "units": 210, "year_built": 2001,
        "purchase_price": 36_000_000, "noi_monthly": 250_000,
        "occupancy": 0.68, "cap_rate": 0.070,
        "vacancy_rate": 0.32, "expense_ratio": 0.55,
        "loan_type": "senior_io", "distressed": True,
        "acq_date": "2024-09-01",
    },
    # ── Investment 7: Riverfront Apartments ────────────────────────────
    {
        "inv_idx": 7, "name": "Riverfront Apartments", "is_new": False,
        "address": "1600 Platte Street", "city": "Denver", "state": "CO",
        "submarket": "LoHi/Platte", "property_type": "multifamily",
        "size_sf": None, "units": 320, "year_built": 2017,
        "purchase_price": 48_000_000, "noi_monthly": 400_000,
        "occupancy": 0.95, "cap_rate": 0.047,
        "vacancy_rate": 0.05, "expense_ratio": 0.36,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2024-10-15",
    },
    # ── Investment 8: Tech Campus North (primary) ──────────────────────
    {
        "inv_idx": 8, "name": "Tech Campus North", "is_new": False,
        "address": "5000 Headquarters Drive", "city": "Dallas", "state": "TX",
        "submarket": "Plano/Frisco", "property_type": "office",
        "size_sf": 240_000, "units": None, "year_built": 2019,
        "purchase_price": 55_000_000, "noi_monthly": 412_500,
        "occupancy": 0.88, "cap_rate": 0.054,
        "vacancy_rate": 0.12, "expense_ratio": 0.33,
        "loan_type": "senior_io", "distressed": False,
        "acq_date": "2024-11-01",
    },
    # ── Investment 8: Tech Campus South Building (NEW secondary) ───────
    {
        "inv_idx": 8, "name": "Tech Campus South Building", "is_new": True,
        "address": "5200 Headquarters Drive", "city": "Dallas", "state": "TX",
        "submarket": "Plano/Frisco", "property_type": "office",
        "size_sf": 145_000, "units": None, "year_built": 2020,
        "purchase_price": 35_000_000, "noi_monthly": 262_500,
        "occupancy": 0.91, "cap_rate": 0.055,
        "vacancy_rate": 0.09, "expense_ratio": 0.34,
        "loan_type": "construction", "distressed": False,
        "acq_date": "2024-11-01",
    },
    # ── Investment 9: Harbor Industrial Portfolio (primary) ────────────
    {
        "inv_idx": 9, "name": "Harbor Industrial Portfolio", "is_new": False,
        "address": "2300 Fulton Industrial Blvd", "city": "Atlanta", "state": "GA",
        "submarket": "I-20 West", "property_type": "industrial",
        "size_sf": 280_000, "units": None, "year_built": 2013,
        "purchase_price": 42_000_000, "noi_monthly": 350_000,
        "occupancy": 0.96, "cap_rate": 0.053,
        "vacancy_rate": 0.04, "expense_ratio": 0.27,
        "loan_type": "senior_mezz", "distressed": False,
        "acq_date": "2024-12-01",
    },
    # ── Investment 9: Harbor Warehouse Complex (NEW secondary) ─────────
    {
        "inv_idx": 9, "name": "Harbor Warehouse Complex", "is_new": True,
        "address": "2500 Fulton Industrial Blvd", "city": "Atlanta", "state": "GA",
        "submarket": "I-20 West", "property_type": "industrial",
        "size_sf": 200_000, "units": None, "year_built": 2018,
        "purchase_price": 26_000_000, "noi_monthly": 216_667,
        "occupancy": 0.97, "cap_rate": 0.051,
        "vacancy_rate": 0.03, "expense_ratio": 0.25,
        "loan_type": "senior_io", "distressed": False,
        "acq_date": "2024-12-01",
    },
    # ── Investment 10: Downtown Mixed-Use ──────────────────────────────
    {
        "inv_idx": 10, "name": "Downtown Mixed-Use", "is_new": False,
        "address": "100 W Washington Street", "city": "Phoenix", "state": "AZ",
        "submarket": "Downtown", "property_type": "mixed_use",
        "size_sf": 110_000, "units": None, "year_built": 2014,
        "purchase_price": 31_000_000, "noi_monthly": 258_333,
        "occupancy": 0.93, "cap_rate": 0.057,
        "vacancy_rate": 0.07, "expense_ratio": 0.35,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2025-01-15",
    },
    # ── Investment 11: Suburban Office Park ─────────────────────────────
    {
        "inv_idx": 11, "name": "Suburban Office Park", "is_new": False,
        "address": "12000 N Central Expressway", "city": "Dallas", "state": "TX",
        "submarket": "North Dallas", "property_type": "office",
        "size_sf": 165_000, "units": None, "year_built": 2006,
        "purchase_price": 26_000_000, "noi_monthly": 195_000,
        "occupancy": 0.87, "cap_rate": 0.065,
        "vacancy_rate": 0.13, "expense_ratio": 0.38,
        "loan_type": "senior", "distressed": False,
        "acq_date": "2025-02-01",
    },
]

# ── Actual-vs-budget multipliers (15 months) ─────────────────────────────────

_STANDARD_MULTS = {
    "RENT":          [1.00, 1.01, 1.01, 1.02, 1.02, 1.02, 1.03, 1.03, 1.03, 1.04, 1.04, 1.04, 1.04, 1.05, 1.05],
    "VACANCY":       [1.10, 1.05, 0.95, 1.00, 1.15, 0.90, 1.05, 1.10, 0.85, 1.00, 1.20, 0.95, 1.05, 0.90, 1.10],
    "OTHER_INCOME":  [0.95, 1.05, 0.90, 1.10, 0.95, 1.00, 1.05, 0.90, 1.10, 0.95, 1.00, 1.05, 0.90, 1.10, 1.00],
    "PAYROLL":       [1.00, 1.02, 1.02, 1.03, 1.03, 1.04, 1.04, 1.05, 1.05, 1.05, 1.06, 1.06, 1.07, 1.07, 1.08],
    "TAXES":         [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    "INSURANCE":     [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.02, 1.02, 1.02, 1.02, 1.02, 1.02, 1.02, 1.02, 1.02],
    "UTILITIES":     [1.15, 1.10, 0.95, 0.85, 0.80, 0.90, 1.10, 1.15, 1.00, 0.85, 0.75, 0.90, 1.10, 1.15, 1.00],
    "REPAIRS":       [0.60, 1.50, 0.80, 1.30, 0.40, 2.00, 0.70, 1.20, 0.90, 1.40, 0.50, 1.80, 0.65, 1.35, 0.85],
    "MGMT_FEE_PROP": [1.00, 1.01, 1.01, 1.02, 1.02, 1.02, 1.03, 1.03, 1.03, 1.04, 1.04, 1.04, 1.04, 1.05, 1.05],
    "ADMIN":         [0.90, 1.05, 1.10, 0.95, 1.15, 0.88, 0.92, 1.08, 1.05, 0.96, 1.12, 0.90, 0.95, 1.08, 1.00],
}

# Distressed: revenue declining, expenses rising → negative NOI variance trend
_DISTRESSED_MULTS = {
    "RENT":          [1.00, 0.99, 0.98, 0.97, 0.96, 0.95, 0.93, 0.91, 0.90, 0.88, 0.87, 0.86, 0.85, 0.84, 0.83],
    "VACANCY":       [1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90, 2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60],
    "OTHER_INCOME":  [0.90, 0.85, 0.80, 0.78, 0.75, 0.72, 0.70, 0.68, 0.65, 0.63, 0.60, 0.58, 0.55, 0.53, 0.50],
    "PAYROLL":       [1.05, 1.08, 1.10, 1.12, 1.15, 1.18, 1.20, 1.22, 1.25, 1.28, 1.30, 1.32, 1.35, 1.38, 1.40],
    "TAXES":         [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    "INSURANCE":     [1.00, 1.00, 1.02, 1.02, 1.04, 1.04, 1.06, 1.06, 1.08, 1.08, 1.10, 1.10, 1.12, 1.12, 1.15],
    "UTILITIES":     [1.10, 1.12, 1.15, 1.10, 1.08, 1.12, 1.15, 1.18, 1.12, 1.10, 1.15, 1.18, 1.20, 1.15, 1.18],
    "REPAIRS":       [1.50, 1.80, 2.00, 1.60, 2.20, 1.90, 2.10, 1.70, 2.30, 2.00, 2.40, 1.80, 2.50, 2.10, 2.60],
    "MGMT_FEE_PROP": [1.00, 0.99, 0.98, 0.97, 0.96, 0.95, 0.93, 0.91, 0.90, 0.88, 0.87, 0.86, 0.85, 0.84, 0.83],
    "ADMIN":         [1.10, 1.15, 1.20, 1.10, 1.25, 1.15, 1.20, 1.25, 1.30, 1.15, 1.20, 1.25, 1.30, 1.35, 1.25],
}

# GL codes for mapping actuals → GL accounts
_GL_CODE_MAP = {
    "RENT": "4000", "VACANCY": "4100", "OTHER_INCOME": "4200",
    "PAYROLL": "5000", "TAXES": "5100", "INSURANCE": "5200",
    "UTILITIES": "5300", "REPAIRS": "5400", "MGMT_FEE_PROP": "5500", "ADMIN": "5600",
}

# ── Additional BS GL accounts ────────────────────────────────────────────────

_BS_GL_ACCOUNTS = [
    ("1100", "Accounts Receivable", "asset", True),
    ("1200", "Prepaids & Deposits", "asset", True),
    ("2100", "Accounts Payable", "liability", True),
    ("2200", "Accrued Liabilities", "liability", True),
    ("2300", "Tenant Security Deposits", "liability", True),
    ("1300", "CapEx Reserve", "asset", True),
]

_BS_MAPPINGS = [
    ("1100", "AR", "BS", 1),
    ("1200", "PREPAIDS", "BS", 1),
    ("2100", "AP", "BS", -1),
    ("2200", "ACCRUED_LIAB", "BS", -1),
    ("2300", "TENANT_DEPOSITS", "BS", -1),
    ("1300", "CAPEX_RESERVE", "BS", 1),
]

# Street names for generating comps per city
_COMP_STREETS = {
    "Denver": ["Broadway", "Colfax Ave", "Speer Blvd"],
    "Dallas": ["Commerce St", "Elm St", "Main St"],
    "Atlanta": ["Peachtree St", "Spring St", "Marietta St"],
    "Tampa": ["Bayshore Blvd", "Dale Mabry Hwy", "Gandy Blvd"],
    "Phoenix": ["Camelback Rd", "Indian School Rd", "Thomas Rd"],
}


# ── Helper: budget line items ────────────────────────────────────────────────

def _compute_budget_items(noi_monthly: int, property_type: str) -> dict[str, int]:
    """Derive monthly budget line items from target NOI and property type."""
    if property_type in ("senior_housing", "hospitality"):
        margin = 0.48
    elif property_type == "industrial":
        margin = 0.72
    elif property_type == "multifamily":
        margin = 0.62
    else:
        margin = 0.65

    gross_rent = round(noi_monthly / margin)
    payroll_pct = 0.14 if property_type in ("senior_housing", "hospitality") else 0.05

    return {
        "RENT": gross_rent,
        "VACANCY": round(gross_rent * 0.05),
        "OTHER_INCOME": round(gross_rent * 0.04),
        "PAYROLL": round(gross_rent * payroll_pct),
        "TAXES": round(gross_rent * 0.10),
        "INSURANCE": round(gross_rent * 0.04),
        "UTILITIES": round(gross_rent * 0.055),
        "REPAIRS": round(gross_rent * 0.04),
        "MGMT_FEE_PROP": round(gross_rent * 0.03),
        "ADMIN": round(gross_rent * 0.025),
    }


def _compute_bs_items(purchase_price: int) -> dict[str, int]:
    """Monthly BS items scaled to asset value."""
    return {
        "AR": round(purchase_price * 0.005),
        "PREPAIDS": round(purchase_price * 0.003),
        "AP": round(purchase_price * 0.004),
        "ACCRUED_LIAB": round(purchase_price * 0.006),
        "TENANT_DEPOSITS": round(purchase_price * 0.002),
        "CAPEX_RESERVE": round(purchase_price * 0.008),
    }


def _make_loans(profile: dict, asset_id: UUID, deal_id: UUID) -> list[dict]:
    """Generate loan config(s) for an asset profile."""
    pp = profile["purchase_price"]
    lt = profile["loan_type"]
    name = profile["name"]

    acq_year = int(profile["acq_date"][:4])

    loans = []
    if lt == "senior":
        loans.append({
            "id": _v2_id(f"loan:senior:{name}"),
            "loan_name": f"Senior Note - {name[:30]}",
            "upb": round(pp * 0.60),
            "rate_type": "fixed", "rate": 0.0600, "spread": None,
            "maturity": f"{acq_year + 7}-06-30",
            "amort_type": "amortizing",
            "amortization_period_years": 30, "term_years": 7,
            "io_period_months": 0, "balloon_flag": True,
            "payment_frequency": "monthly",
        })
    elif lt == "construction":
        loans.append({
            "id": _v2_id(f"loan:construction:{name}"),
            "loan_name": f"Construction Facility - {name[:25]}",
            "upb": round(pp * 0.70),
            "rate_type": "fixed", "rate": 0.0575, "spread": None,
            "maturity": f"{acq_year + 7}-06-30",
            "amort_type": "amortizing",
            "amortization_period_years": 25, "term_years": 7,
            "io_period_months": 24, "balloon_flag": False,
            "payment_frequency": "monthly",
        })
    elif lt == "senior_mezz":
        loans.append({
            "id": _v2_id(f"loan:senior:{name}"),
            "loan_name": f"Senior Note - {name[:30]}",
            "upb": round(pp * 0.55),
            "rate_type": "floating", "rate": 0.0625, "spread": 0.0225,
            "maturity": f"{acq_year + 7}-06-30",
            "amort_type": "amortizing",
            "amortization_period_years": 30, "term_years": 7,
            "io_period_months": 0, "balloon_flag": True,
            "payment_frequency": "monthly",
        })
        loans.append({
            "id": _v2_id(f"loan:mezz:{name}"),
            "loan_name": f"Mezz Note - {name[:30]}",
            "upb": round(pp * 0.15),
            "rate_type": "floating", "rate": 0.0900, "spread": 0.0400,
            "maturity": f"{acq_year + 5}-12-31",
            "amort_type": "interest_only",
            "amortization_period_years": None, "term_years": None,
            "io_period_months": None, "balloon_flag": True,
            "payment_frequency": "monthly",
        })
    elif lt == "senior_io":
        loans.append({
            "id": _v2_id(f"loan:senior_io:{name}"),
            "loan_name": f"Senior IO Note - {name[:25]}",
            "upb": round(pp * 0.65),
            "rate_type": "floating", "rate": 0.0650, "spread": 0.0250,
            "maturity": f"{acq_year + 5}-12-31",
            "amort_type": "interest_only",
            "amortization_period_years": None, "term_years": None,
            "io_period_months": None, "balloon_flag": True,
            "payment_frequency": "monthly",
        })

    for loan in loans:
        loan["asset_id"] = asset_id
        loan["investment_id"] = deal_id

    return loans


def _make_comps(idx: int, profile: dict) -> list[dict]:
    """Generate 3 deterministic sale comps for an asset."""
    city = profile["city"]
    streets = _COMP_STREETS.get(city, ["Main St", "First Ave", "Oak Blvd"])
    pp = profile["purchase_price"]
    cap = profile["cap_rate"]
    sf = profile["size_sf"] or (profile.get("units") or 200) * 900

    price_mults = [1.05, 0.95, 1.02]
    cap_adjs = [-0.003, 0.004, -0.001]
    sf_mults = [0.90, 1.10, 0.98]
    months_offsets = [3, 6, 9]
    sources = ["CoStar", "CBRE", "JLL"]

    comps = []
    for j in range(3):
        comp_price = round(pp * price_mults[j])
        comp_sf = round(sf * sf_mults[j])
        comp_cap = round(cap + cap_adjs[j], 4)

        base_month = 8 - months_offsets[j]
        year = 2024 if base_month > 0 else 2023
        month = base_month if base_month > 0 else base_month + 12

        addr_num = (idx * 100 + j * 37 + 100) % 9000 + 100
        comps.append({
            "address": f"{addr_num} {streets[j % len(streets)]}, {city}",
            "submarket": profile["submarket"],
            "close_date": f"{year}-{month:02d}-15",
            "sale_price": comp_price,
            "cap_rate": comp_cap,
            "size_sf": comp_sf,
            "price_per_sf": round(comp_price / comp_sf, 2) if comp_sf > 0 else None,
            "source": sources[j],
        })
    return comps


# ══════════════════════════════════════════════════════════════════════════════
# MAIN FUNCTION
# ══════════════════════════════════════════════════════════════════════════════

def seed_institutional_v2_patch(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
) -> dict:
    """Idempotent v2 patch: extends institutional fund with per-asset debt,
    accounting, valuations, property metadata, and additional assets.

    Prerequisites: v1 seed (seed_institutional_fund) must have been run first.
    """
    result: dict = {"fund_id": str(fund_id)}

    v2_run_id = _v2_id("run:seed_v2_patch")
    v2_uw_version_id = _v2_id("uw_version:institutional_v2_2024")

    with get_cursor() as cur:
        # ─── 0. Query existing investments + assets ─────────────────────
        cur.execute(
            """
            SELECT d.deal_id, d.name AS deal_name,
                   a.asset_id, a.name AS asset_name
            FROM repe_deal d
            LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
            WHERE d.fund_id = %s
            ORDER BY d.created_at, a.created_at
            """,
            (str(fund_id),),
        )
        rows = cur.fetchall()
        if not rows:
            raise ValueError(
                "No investments found for this fund. Run seed_institutional_fund (v1) first."
            )

        # Build maps: inv_idx → deal_id, asset_name → asset_id
        deal_map: dict[int, UUID] = {}   # inv_idx → deal_id
        asset_map: dict[str, UUID] = {}  # asset_name → asset_id
        deal_name_idx: dict[str, int] = {}

        # Map deal names back to INVESTMENTS index using PROPERTY_PROFILES
        inv_names_ordered = []
        for p in PROPERTY_PROFILES:
            if not p["is_new"] and p["name"] not in inv_names_ordered:
                inv_names_ordered.append(p["name"])

        for row in rows:
            dn = row["deal_name"]
            did = UUID(str(row["deal_id"]))
            if dn in inv_names_ordered:
                idx = inv_names_ordered.index(dn)
                deal_map[idx] = did
                deal_name_idx[dn] = idx
            if row["asset_id"]:
                asset_map[row["asset_name"]] = UUID(str(row["asset_id"]))

        result["existing_investments"] = len(deal_map)
        result["existing_assets"] = len(asset_map)

        # ─── 1. Create 4 new secondary assets ──────────────────────────
        new_asset_count = 0
        for p in PROPERTY_PROFILES:
            if not p["is_new"]:
                continue
            new_asset_id = _v2_id(f"asset:{p['name']}")
            parent_deal_id = deal_map.get(p["inv_idx"])
            if not parent_deal_id:
                continue

            cur.execute(
                """
                INSERT INTO repe_asset
                    (asset_id, deal_id, name, asset_type, cost_basis,
                     acquisition_date, asset_status)
                VALUES (%s, %s, %s, 'property', %s, %s, 'active')
                ON CONFLICT (asset_id) DO NOTHING
                """,
                (
                    str(new_asset_id), str(parent_deal_id), p["name"],
                    p["purchase_price"], p["acq_date"],
                ),
            )
            asset_map[p["name"]] = new_asset_id
            new_asset_count += 1

        result["new_assets_created"] = new_asset_count

        # ─── 2. Populate repe_property_asset for all 16 ────────────────
        prop_count = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            sf = p.get("size_sf")
            units = p.get("units")
            cur.execute(
                """
                INSERT INTO repe_property_asset
                    (asset_id, property_type, units, market, current_noi,
                     occupancy, address, gross_sf, year_built)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (asset_id) DO UPDATE SET
                    property_type = EXCLUDED.property_type,
                    units = EXCLUDED.units,
                    market = EXCLUDED.market,
                    current_noi = EXCLUDED.current_noi,
                    occupancy = EXCLUDED.occupancy,
                    address = EXCLUDED.address,
                    gross_sf = EXCLUDED.gross_sf,
                    year_built = EXCLUDED.year_built
                """,
                (
                    str(aid), p["property_type"], units,
                    f"{p['city']}, {p['state']}",
                    p["noi_monthly"] * 12, p["occupancy"],
                    f"{p['address']}, {p['city']}, {p['state']}",
                    sf, p["year_built"],
                ),
            )
            prop_count += 1
        result["property_assets_upserted"] = prop_count

        # ─── 3. Asset quarter states for NEW assets ─────────────────────
        aq_count = 0
        for p in PROPERTY_PROFILES:
            if not p["is_new"]:
                continue
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            for qi, (qtr, mult) in enumerate(zip(_V2_QUARTERS, _V2_APPRECIATION)):
                nav = round(p["purchase_price"] * mult)
                noi = round(p["noi_monthly"] * 3 * mult)
                occ = p["occupancy"]
                cur.execute(
                    """
                    INSERT INTO re_asset_quarter_state
                        (asset_id, quarter, run_id, inputs_hash, noi,
                         asset_value, occupancy)
                    VALUES (%s, %s, %s, 'seed_v2', %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (str(aid), qtr, str(v2_run_id), noi, nav, occ),
                )
                aq_count += 1
        result["new_asset_quarter_states"] = aq_count

        # ─── 4. Adjust quarter states for distressed assets (2025Q1) ───
        distressed_count = 0
        for p in PROPERTY_PROFILES:
            if not p["distressed"] or p["is_new"]:
                continue
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            # Reduce NOI to ~60% of original for 2025Q1
            reduced_noi = round(p["noi_monthly"] * 3 * 1.02 * 0.60)
            cur.execute(
                """
                UPDATE re_asset_quarter_state
                SET noi = %s, occupancy = %s
                WHERE asset_id = %s AND quarter = '2025Q1'
                """,
                (reduced_noi, p["occupancy"], str(aid)),
            )
            distressed_count += 1
        result["distressed_assets_adjusted"] = distressed_count

        # ─── 5. BS GL accounts + mapping rules ─────────────────────────
        for gl, name, cat, is_bs in _BS_GL_ACCOUNTS:
            cur.execute(
                """
                INSERT INTO acct_chart_of_accounts
                    (gl_account, name, category, is_balance_sheet)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (gl_account) DO NOTHING
                """,
                (gl, name, cat, is_bs),
            )
        for gl, code, stmt, sign in _BS_MAPPINGS:
            cur.execute(
                """
                INSERT INTO acct_mapping_rule
                    (env_id, business_id, gl_account, target_line_code,
                     target_statement, sign_multiplier)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, str(business_id), gl, code, stmt, sign),
            )
        result["bs_gl_accounts"] = len(_BS_GL_ACCOUNTS)
        result["bs_mapping_rules"] = len(_BS_MAPPINGS)

        # ─── 6. UW version for v2 budget data ──────────────────────────
        cur.execute(
            """
            INSERT INTO uw_version
                (id, env_id, business_id, name, effective_from)
            VALUES (%s, %s, %s, 'Institutional V2 Underwrite', '2024-01-01')
            ON CONFLICT (id) DO NOTHING
            """,
            (str(v2_uw_version_id), env_id, str(business_id)),
        )
        result["uw_version_id"] = str(v2_uw_version_id)

        # Delete old v2 budget data for idempotency
        cur.execute(
            "DELETE FROM uw_noi_budget_monthly WHERE uw_version_id = %s",
            (str(v2_uw_version_id),),
        )

        # ─── 7. Budget data (15 months × 16 assets × 10 line codes) ───
        budget_rows = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            budget = _compute_budget_items(p["noi_monthly"], p["property_type"])
            for month in _V2_MONTHS:
                for code, amt in budget.items():
                    cur.execute(
                        """
                        INSERT INTO uw_noi_budget_monthly
                            (env_id, business_id, asset_id, uw_version_id,
                             period_month, line_code, amount)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            env_id, str(business_id), str(aid),
                            str(v2_uw_version_id), month, code, amt,
                        ),
                    )
                    budget_rows += 1
        result["budget_rows"] = budget_rows

        # ─── 8. Delete old v2 actuals for idempotency ──────────────────
        cur.execute(
            """
            DELETE FROM acct_gl_balance_monthly
            WHERE env_id = %s AND business_id = %s AND source_id = 'seed_v2'
            """,
            (env_id, str(business_id)),
        )
        cur.execute(
            """
            DELETE FROM acct_normalized_noi_monthly
            WHERE env_id = %s AND business_id = %s AND source_hash = 'seed_v2'
            """,
            (env_id, str(business_id)),
        )
        cur.execute(
            """
            DELETE FROM acct_normalized_bs_monthly
            WHERE env_id = %s AND business_id = %s AND source_hash = 'seed_v2'
            """,
            (env_id, str(business_id)),
        )

        # ─── 9. Actual data (15 months × 16 assets) ────────────────────
        actual_rows = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            budget = _compute_budget_items(p["noi_monthly"], p["property_type"])
            mults = _DISTRESSED_MULTS if p["distressed"] else _STANDARD_MULTS

            for i, month in enumerate(_V2_MONTHS):
                for code, base_amt in budget.items():
                    mult = mults[code][i]
                    actual_amt = round(base_amt * mult, 2)
                    gl = _GL_CODE_MAP[code]

                    # GL balance
                    cur.execute(
                        """
                        INSERT INTO acct_gl_balance_monthly
                            (env_id, business_id, asset_id, period_month,
                             gl_account, amount, source_id)
                        VALUES (%s, %s, %s, %s, %s, %s, 'seed_v2')
                        """,
                        (
                            env_id, str(business_id), str(aid),
                            month, gl, actual_amt,
                        ),
                    )

                    # Normalized NOI
                    sign = 1 if code in ("RENT", "OTHER_INCOME") else -1
                    if code == "VACANCY":
                        sign = -1
                    cur.execute(
                        """
                        INSERT INTO acct_normalized_noi_monthly
                            (env_id, business_id, asset_id, period_month,
                             line_code, amount, source_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, 'seed_v2')
                        """,
                        (
                            env_id, str(business_id), str(aid),
                            month, code, actual_amt * sign,
                        ),
                    )
                    actual_rows += 1
        result["actual_rows"] = actual_rows

        # ─── 10. Balance sheet data (15 months × 16 assets × 6 lines) ──
        bs_rows = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            bs = _compute_bs_items(p["purchase_price"])

            for month in _V2_MONTHS:
                for code, amt in bs.items():
                    cur.execute(
                        """
                        INSERT INTO acct_normalized_bs_monthly
                            (env_id, business_id, asset_id, period_month,
                             line_code, amount, source_hash)
                        VALUES (%s, %s, %s, %s, %s, %s, 'seed_v2')
                        """,
                        (
                            env_id, str(business_id), str(aid),
                            month, code, amt,
                        ),
                    )
                    bs_rows += 1
        result["bs_rows"] = bs_rows

        # ─── 11. Per-asset loans ────────────────────────────────────────
        all_loan_ids: list[UUID] = []
        loan_count = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            parent_deal_id = deal_map.get(p["inv_idx"])
            if not parent_deal_id:
                continue

            loans = _make_loans(p, aid, parent_deal_id)
            for lc in loans:
                cur.execute(
                    """
                    INSERT INTO re_loan
                        (id, env_id, business_id, fund_id, investment_id,
                         asset_id, loan_name, upb, rate_type, rate, spread,
                         maturity, amort_type, amortization_period_years,
                         term_years, io_period_months, balloon_flag,
                         payment_frequency)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        str(lc["id"]), env_id, str(business_id), str(fund_id),
                        str(lc["investment_id"]), str(lc["asset_id"]),
                        lc["loan_name"], lc["upb"], lc["rate_type"],
                        lc["rate"], lc["spread"], lc["maturity"],
                        lc["amort_type"], lc["amortization_period_years"],
                        lc["term_years"], lc["io_period_months"],
                        lc["balloon_flag"], lc["payment_frequency"],
                    ),
                )
                all_loan_ids.append(lc["id"])
                loan_count += 1

        result["loans_created"] = loan_count
        result["loan_ids"] = [str(lid) for lid in all_loan_ids]

        # ─── 12. Covenant definitions (DSCR + LTV per senior loan) ──────
        cov_count = 0
        for p in PROPERTY_PROFILES:
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            loans = _make_loans(p, aid, deal_map.get(p["inv_idx"], _uuid.UUID(int=0)))
            for lc in loans:
                is_mezz = "mezz" in lc["loan_name"].lower()
                dscr_threshold = 1.10 if is_mezz else 1.25

                # DSCR covenant
                cov_id = _v2_id(f"covenant:DSCR:{lc['id']}")
                cur.execute(
                    """
                    INSERT INTO re_loan_covenant_definition
                        (id, env_id, business_id, loan_id, covenant_type,
                         comparator, threshold, frequency, cure_days)
                    VALUES (%s, %s, %s, %s, 'DSCR', '>=', %s, 'quarterly', 30)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        str(cov_id), env_id, str(business_id),
                        str(lc["id"]), dscr_threshold,
                    ),
                )
                cov_count += 1

                # LTV covenant (skip for mezz)
                if not is_mezz:
                    cov_id = _v2_id(f"covenant:LTV:{lc['id']}")
                    cur.execute(
                        """
                        INSERT INTO re_loan_covenant_definition
                            (id, env_id, business_id, loan_id, covenant_type,
                             comparator, threshold, frequency, cure_days)
                        VALUES (%s, %s, %s, %s, 'LTV', '<=', 0.75,
                                'quarterly', 30)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            str(cov_id), env_id, str(business_id),
                            str(lc["id"]),
                        ),
                    )
                    cov_count += 1

        result["covenant_definitions"] = cov_count

        # ─── 13. Sale comps (3 per asset, all 16) ──────────────────────
        comp_count = 0
        for idx, p in enumerate(PROPERTY_PROFILES):
            aid = asset_map.get(p["name"])
            if not aid:
                continue
            comps = _make_comps(idx, p)
            for c in comps:
                cur.execute(
                    """
                    INSERT INTO re_property_comp
                        (env_id, business_id, asset_id, comp_type,
                         address, submarket, close_date, sale_price,
                         cap_rate, size_sf, price_per_sf, source)
                    VALUES (%s, %s, %s, 'sale', %s, %s, %s, %s, %s, %s,
                            %s, %s)
                    """,
                    (
                        env_id, str(business_id), str(aid),
                        c["address"], c["submarket"], c["close_date"],
                        c["sale_price"], c["cap_rate"], c["size_sf"],
                        c["price_per_sf"], c["source"],
                    ),
                )
                comp_count += 1
        result["sale_comps"] = comp_count

    # ─── 14. Generate amortization schedules for amortizing loans ───────
    from app.services import re_amortization as _re_amort

    amort_count = 0
    for p in PROPERTY_PROFILES:
        aid = asset_map.get(p["name"])
        if not aid:
            continue
        loans = _make_loans(
            p, aid, deal_map.get(p["inv_idx"], _uuid.UUID(int=0)),
        )
        for lc in loans:
            if lc["amort_type"] == "interest_only":
                continue
            try:
                sched = _re_amort.generate_and_store_schedule(loan_id=lc["id"])
                amort_count += len(sched)
            except (ValueError, LookupError):
                pass
    result["amortization_rows"] = amort_count

    emit_log(
        level="info",
        service="backend",
        action="re.fi.seed.v2_patch",
        message=(
            f"V2 patch applied: {len(PROPERTY_PROFILES)} assets, "
            f"{loan_count} loans, {budget_rows} budget rows, "
            f"{actual_rows} actual rows"
        ),
        context={
            "env_id": env_id,
            "business_id": str(business_id),
            "fund_id": str(fund_id),
        },
    )

    return result


# ══════════════════════════════════════════════════════════════════════════════
# POST-SEED VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def validate_institutional_seed(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
) -> dict:
    """Assert the seeded dataset meets all structural requirements.

    Returns a dict of assertion results. Raises ValueError on first failure.
    """
    checks: dict = {}

    with get_cursor() as cur:
        # 1. Every investment has >= 1 asset
        cur.execute(
            """
            SELECT d.deal_id, d.name, COUNT(a.asset_id) AS asset_count
            FROM repe_deal d
            LEFT JOIN repe_asset a ON a.deal_id = d.deal_id
            WHERE d.fund_id = %s
            GROUP BY d.deal_id, d.name
            """,
            (str(fund_id),),
        )
        inv_rows = cur.fetchall()
        total_investments = len(inv_rows)
        total_assets = sum(r["asset_count"] for r in inv_rows)
        orphans = [r["name"] for r in inv_rows if r["asset_count"] == 0]
        checks["total_investments"] = total_investments
        checks["total_assets"] = total_assets
        if orphans:
            raise ValueError(
                f"Investments without assets: {orphans}"
            )
        if total_assets < 12:
            raise ValueError(
                f"Expected >= 12 assets, found {total_assets}"
            )

        # 2. Every asset has >= 1 loan
        cur.execute(
            """
            SELECT a.asset_id, a.name,
                   (SELECT COUNT(*) FROM re_loan l
                    WHERE l.asset_id = a.asset_id::text::uuid) AS loan_count
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s
            """,
            (str(fund_id),),
        )
        asset_rows = cur.fetchall()
        no_loans = [r["name"] for r in asset_rows if r["loan_count"] == 0]
        checks["assets_with_loans"] = len(asset_rows) - len(no_loans)
        if no_loans:
            raise ValueError(
                f"Assets without loans: {no_loans}"
            )

        # 3. Every asset has accounting facts for required periods
        cur.execute(
            """
            SELECT a.asset_id, a.name,
                   COUNT(DISTINCT n.period_month) AS periods
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            LEFT JOIN acct_normalized_noi_monthly n
                ON n.asset_id = a.asset_id::text::uuid
                AND n.source_hash = 'seed_v2'
            WHERE d.fund_id = %s
            GROUP BY a.asset_id, a.name
            """,
            (str(fund_id),),
        )
        acct_rows = cur.fetchall()
        no_acct = [r["name"] for r in acct_rows if r["periods"] == 0]
        checks["assets_with_v2_accounting"] = len(acct_rows) - len(no_acct)
        if no_acct:
            raise ValueError(
                f"Assets without v2 accounting: {no_acct}"
            )

        # 4. Valuation exists for 2025Q1
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM re_asset_quarter_state aqs
            JOIN repe_asset a ON a.asset_id = aqs.asset_id
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s AND aqs.quarter = '2025Q1'
            """,
            (str(fund_id),),
        )
        val_row = cur.fetchone()
        checks["assets_with_2025Q1_valuation"] = val_row["cnt"] if val_row else 0
        if not val_row or val_row["cnt"] < 12:
            raise ValueError(
                f"Expected >= 12 assets with 2025Q1 valuation, "
                f"found {val_row['cnt'] if val_row else 0}"
            )

        # 5. Property comps exist
        cur.execute(
            """
            SELECT COUNT(DISTINCT pc.asset_id) AS assets_with_comps,
                   COUNT(*) AS total_comps
            FROM re_property_comp pc
            JOIN repe_asset a ON a.asset_id::text = pc.asset_id::text
            JOIN repe_deal d ON d.deal_id = a.deal_id
            WHERE d.fund_id = %s
            """,
            (str(fund_id),),
        )
        comp_row = cur.fetchone()
        checks["assets_with_comps"] = comp_row["assets_with_comps"] if comp_row else 0
        checks["total_comps"] = comp_row["total_comps"] if comp_row else 0

    checks["status"] = "PASS"
    return checks
