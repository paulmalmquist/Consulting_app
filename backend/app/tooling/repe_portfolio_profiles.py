"""Hand-curated asset profiles for the calibrated seed.

Every entry mirrors an existing `repe_asset` row (id from seed 446/456/508) so
the SQL output of the calibrator plugs directly into the existing entity
graph. Identity fields (market, property_type, acquisition_date, cost_basis)
are sourced from the audited seeds; `strategy` is new and written into the
`repe_asset.strategy` column added in schema 510.

IGF-VII = Institutional Growth Fund VII (value-add equity, vintage 2021)
MREF-III = Meridian Real Estate Fund III (core-plus equity, vintage 2019)
GRANITE = Granite Peak Value-Add Fund IV (value-add equity, vintage 2023)

MCOF-I (debt / CMBS) is intentionally out of scope — credit returns are
measured differently and should not be forced into an equity-IRR distribution.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.tooling.repe_calibration import AssetProfile

# ---------------------------------------------------------------------------
# Fund UUIDs (deterministic from seeds 446/456/508)
# ---------------------------------------------------------------------------

IGF_VII_FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001"
MREF_III_FUND_ID = "d4560000-0003-0030-0004-000000000001"
GRANITE_FUND_ID = "__granite_peak__"  # resolved at seed-apply time by fund name


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _p(
    *,
    fund_id: str,
    investment_id: str,
    asset_id: str,
    name: str,
    property_type: str,
    city: str,
    state: str,
    strategy: str,
    driver: str,
    acq: str,
    cost: int,
    ltv: str,
    rate: str,
    hold_years: int,
    target: tuple[str, str],
) -> AssetProfile:
    return AssetProfile(
        fund_id=fund_id,
        investment_id=investment_id,
        asset_id=asset_id,
        name=name,
        property_type=property_type,
        city=city,
        state=state,
        strategy=strategy,
        driver=driver,
        acquisition_date=date.fromisoformat(acq),
        cost_basis=Decimal(cost),
        ltv=Decimal(ltv),
        interest_rate=Decimal(rate),
        hold_years=hold_years,
        target_irr_band=(Decimal(target[0]), Decimal(target[1])),
    )


# ---------------------------------------------------------------------------
# IGF-VII (value-add, vintage 2021)
#  * 2 outperformers (>20%), 1 negative (distressed exit), rest in core band
# ---------------------------------------------------------------------------

IGF_VII_PROFILES = [
    _p(  # Meadowview Apartments — Austin MF, value-add winner
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0001-000000000001",
        asset_id="d4560000-0456-0201-0001-000000000001",
        name="Meadowview Apartments",
        property_type="multifamily", city="Austin", state="TX",
        strategy="value_add", driver="operational_improvement",
        acq="2021-09-15", cost=210_000_000,
        ltv="0.60", rate="0.0500", hold_years=5,
        target=("0.20", "0.28"),
    ),
    _p(  # Sunbelt Crossing — Phoenix MF, solid value-add
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0002-000000000001",
        asset_id="d4560000-0456-0201-0002-000000000001",
        name="Sunbelt Crossing",
        property_type="multifamily", city="Phoenix", state="AZ",
        strategy="value_add", driver="rent_growth",
        acq="2022-03-01", cost=188_000_000,
        ltv="0.60", rate="0.0500", hold_years=5,
        target=("0.12", "0.16"),
    ),
    _p(  # Pinehurst Residences — Charlotte MF, low-single (stabilized drift)
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0003-000000000001",
        asset_id="d4560000-0456-0201-0003-000000000001",
        name="Pinehurst Residences",
        property_type="multifamily", city="Charlotte", state="NC",
        strategy="value_add", driver="rent_growth",
        acq="2022-06-15", cost=158_000_000,
        ltv="0.62", rate="0.0500", hold_years=5,
        target=("0.05", "0.08"),
    ),
    _p(  # Bayshore Flats — Tampa MF, low single
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0004-000000000001",
        asset_id="d4560000-0456-0201-0004-000000000001",
        name="Bayshore Flats",
        property_type="multifamily", city="Tampa", state="FL",
        strategy="value_add", driver="rent_growth",
        acq="2022-11-01", cost=175_000_000,
        ltv="0.62", rate="0.0500", hold_years=5,
        target=("0.05", "0.08"),
    ),
    _p(  # Oakridge Residences — Raleigh MF, NEGATIVE (distressed workout)
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0005-000000000001",
        asset_id="d4560000-0456-0201-0005-000000000001",
        name="Oakridge Residences",
        property_type="multifamily", city="Raleigh", state="NC",
        strategy="distressed", driver="distressed_recovery",
        acq="2023-02-15", cost=137_000_000,
        ltv="0.65", rate="0.0525", hold_years=4,
        target=("-0.18", "-0.02"),
    ),
    _p(  # Lone Star Distribution — Dallas industrial, outperformer
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0006-000000000001",
        asset_id="d4560000-0456-0201-0006-000000000001",
        name="Lone Star Distribution",
        property_type="industrial", city="Dallas", state="TX",
        strategy="value_add", driver="cap_compression",
        acq="2021-12-01", cost=245_000_000,
        ltv="0.58", rate="0.0550", hold_years=5,
        target=("0.22", "0.30"),
    ),
    _p(  # Peachtree Logistics Park — Atlanta industrial, core-band
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0007-000000000001",
        asset_id="d4560000-0456-0201-0007-000000000001",
        name="Peachtree Logistics Park",
        property_type="industrial", city="Atlanta", state="GA",
        strategy="value_add", driver="rent_growth",
        acq="2022-08-15", cost=222_000_000,
        ltv="0.60", rate="0.0550", hold_years=5,
        target=("0.13", "0.17"),
    ),
    _p(  # Northwest Commerce Center — Portland mixed_use, low single
        fund_id=IGF_VII_FUND_ID,
        investment_id="d4560000-0456-0101-0008-000000000001",
        asset_id="d4560000-0456-0201-0008-000000000001",
        name="Northwest Commerce Center",
        property_type="mixed_use", city="Portland", state="OR",
        strategy="value_add", driver="lease_up",
        acq="2023-05-01", cost=197_000_000,
        ltv="0.60", rate="0.0525", hold_years=5,
        target=("0.04", "0.07"),
    ),
]


# ---------------------------------------------------------------------------
# MREF-III (core-plus, vintage 2019)
#  * Tighter distribution, 2 realized exits (Emerald Ridge, Biscayne Towers),
#    1 negative (office-heavy drag), rest in core band
# ---------------------------------------------------------------------------

MREF_III_PROFILES = [
    _p(  # Commonwealth Place — Boston MF, core-plus
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0001-000000000001",
        asset_id="d4560000-0456-0202-0001-000000000001",
        name="Commonwealth Place",
        property_type="multifamily", city="Boston", state="MA",
        strategy="core_plus", driver="cap_compression",
        acq="2019-06-01", cost=98_000_000,
        ltv="0.55", rate="0.0475", hold_years=7,
        target=("0.09", "0.12"),
    ),
    _p(  # Capitol Gateway — DC MF, core-plus
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0002-000000000001",
        asset_id="d4560000-0456-0202-0002-000000000001",
        name="Capitol Gateway",
        property_type="multifamily", city="Washington", state="DC",
        strategy="core_plus", driver="rent_growth",
        acq="2019-09-15", cost=108_000_000,
        ltv="0.55", rate="0.0475", hold_years=7,
        target=("0.08", "0.11"),
    ),
    _p(  # Pacific Terrace — San Diego MF, core-plus
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0003-000000000001",
        asset_id="d4560000-0456-0202-0003-000000000001",
        name="Pacific Terrace",
        property_type="multifamily", city="San Diego", state="CA",
        strategy="core_plus", driver="rent_growth",
        acq="2020-01-15", cost=82_000_000,
        ltv="0.55", rate="0.0480", hold_years=6,
        target=("0.10", "0.14"),
    ),
    _p(  # Mile High Apartments — Denver MF, core-plus, upper-core band
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0004-000000000001",
        asset_id="d4560000-0456-0202-0004-000000000001",
        name="Mile High Apartments",
        property_type="multifamily", city="Denver", state="CO",
        strategy="core_plus", driver="cap_compression",
        acq="2020-04-01", cost=72_000_000,
        ltv="0.55", rate="0.0480", hold_years=6,
        target=("0.15", "0.18"),
    ),
    _p(  # Harmony Place — Nashville MF, core-band
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0005-000000000001",
        asset_id="d4560000-0456-0202-0005-000000000001",
        name="Harmony Place",
        property_type="multifamily", city="Nashville", state="TN",
        strategy="core_plus", driver="rent_growth",
        acq="2020-07-15", cost=63_000_000,
        ltv="0.55", rate="0.0485", hold_years=6,
        target=("0.11", "0.15"),
    ),
    _p(  # Emerald Ridge Apartments — Seattle MF, REALIZED exit (in prior seed)
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0006-000000000001",
        asset_id="d4560000-0456-0202-0006-000000000001",
        name="Emerald Ridge Apartments",
        property_type="multifamily", city="Seattle", state="WA",
        strategy="core_plus", driver="cap_compression",
        acq="2020-10-01", cost=87_000_000,
        ltv="0.55", rate="0.0485", hold_years=5,
        target=("0.13", "0.16"),
    ),
    _p(  # Biscayne Towers — Miami MF, REALIZED exit
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0007-000000000001",
        asset_id="d4560000-0456-0202-0007-000000000001",
        name="Biscayne Towers",
        property_type="multifamily", city="Miami", state="FL",
        strategy="core_plus", driver="rent_growth",
        acq="2021-01-15", cost=75_000_000,
        ltv="0.55", rate="0.0490", hold_years=5,
        target=("0.09", "0.12"),
    ),
    _p(  # Inland Empire Fulfillment — Riverside industrial, NEGATIVE (bad UW)
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0008-000000000001",
        asset_id="d4560000-0456-0202-0008-000000000001",
        name="Inland Empire Fulfillment",
        property_type="industrial", city="Riverside", state="CA",
        strategy="core_plus", driver="distressed_recovery",
        acq="2020-03-01", cost=122_000_000,
        ltv="0.58", rate="0.0510", hold_years=7,
        target=("-0.12", "-0.01"),
    ),
    _p(  # DFW Logistics Center — Dallas industrial, core-band
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0009-000000000001",
        asset_id="d4560000-0456-0202-0009-000000000001",
        name="DFW Logistics Center",
        property_type="industrial", city="Dallas", state="TX",
        strategy="core_plus", driver="cap_compression",
        acq="2020-08-15", cost=103_000_000,
        ltv="0.58", rate="0.0510", hold_years=6,
        target=("0.12", "0.17"),
    ),
    _p(  # Heartland Distribution — Columbus industrial, low single
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0010-000000000001",
        asset_id="d4560000-0456-0202-0010-000000000001",
        name="Heartland Distribution",
        property_type="industrial", city="Columbus", state="OH",
        strategy="core_plus", driver="rent_growth",
        acq="2021-03-01", cost=80_000_000,
        ltv="0.60", rate="0.0515", hold_years=6,
        target=("0.06", "0.09"),
    ),
    _p(  # Scottsdale Market Square — Scottsdale retail, low single
        fund_id=MREF_III_FUND_ID,
        investment_id="d4560000-0456-0102-0011-000000000001",
        asset_id="d4560000-0456-0202-0011-000000000001",
        name="Scottsdale Market Square",
        property_type="retail", city="Scottsdale", state="AZ",
        strategy="core_plus", driver="rent_growth",
        acq="2020-06-01", cost=48_000_000,
        ltv="0.60", rate="0.0540", hold_years=6,
        target=("0.04", "0.08"),
    ),
]


# ---------------------------------------------------------------------------
# Granite Peak (value-add, vintage 2023) — reconfirmed from 508 seed
# ---------------------------------------------------------------------------

GRANITE_PROFILES = [
    _p(  # Granite Peak Crossing Apartments — Atlanta MF, realized
        fund_id=GRANITE_FUND_ID,
        investment_id="__granite_deal__",
        asset_id="11111111-1111-4111-8111-000000000001",
        name="Granite Peak Crossing Apartments",
        property_type="multifamily", city="Atlanta", state="GA",
        strategy="value_add", driver="operational_improvement",
        acq="2022-02-15", cost=25_000_000,
        ltv="0.60", rate="0.0525", hold_years=2,
        target=("0.17", "0.22"),
    ),
    _p(  # Cedar Bluff Industrial — Charlotte industrial, pre-exit NAV
        fund_id=GRANITE_FUND_ID,
        investment_id="__granite_deal__",
        asset_id="11111111-1111-4111-8111-000000000002",
        name="Cedar Bluff Industrial",
        property_type="industrial", city="Charlotte", state="NC",
        strategy="value_add", driver="rent_growth",
        acq="2023-05-10", cost=18_000_000,
        ltv="0.60", rate="0.0525", hold_years=3,
        target=("0.12", "0.16"),
    ),
    _p(  # Sunbelt Logistics Park — Dallas industrial, pre-exit NOI/cap
        fund_id=GRANITE_FUND_ID,
        investment_id="__granite_deal__",
        asset_id="11111111-1111-4111-8111-000000000003",
        name="Sunbelt Logistics Park",
        property_type="industrial", city="Dallas", state="TX",
        strategy="value_add", driver="cap_compression",
        acq="2023-11-05", cost=32_000_000,
        ltv="0.60", rate="0.0525", hold_years=3,
        target=("0.16", "0.21"),
    ),
]


ALL_PROFILES = IGF_VII_PROFILES + MREF_III_PROFILES + GRANITE_PROFILES


def profiles_by_fund() -> dict[str, list[AssetProfile]]:
    return {
        "IGF-VII": IGF_VII_PROFILES,
        "MREF-III": MREF_III_PROFILES,
        "Granite Peak": GRANITE_PROFILES,
    }
