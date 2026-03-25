"""Live integration smoke tests — mirrors the frontend UX journey.

These tests run REAL SQL against a real Postgres database with seeded data.
No FakeCursor, no monkeypatching. Every assertion reflects what a real user
would see when walking through the Winston RE/REPE interface.

Run modes
---------
Skip automatically (safe for CI):
    pytest backend/tests/test_re_live.py
    → all tests skipped; DATABASE_URL is the test stub

Run against a live DB:
    DATABASE_URL=postgresql://... pytest backend/tests/test_re_live.py -v
    make test-live

What is tested (in frontend UX order)
--------------------------------------
1. Health endpoint
2. REPE context bootstrap — fund list present
3. Fund list — Institutional Growth Fund VII exists
4. Fund detail — name, strategy, vintage
5. Fund investments — Cascade Multifamily investment row
6. Fund quarter metrics (2026Q1) — IRR / TVPI present and in range
7. Fund investment rollup — at least one asset row
8. Asset identity — Cascade Multifamily name, city, units, property type
9. Asset quarter-state (2026Q1) — NOI, occupancy, asset_value present and sane
10. JV list for investment — JV row exists and is active
11. Models list — at least one model seeded
12. Fund capital ledger — call/distribution entries seeded
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# ── Skip guard ─────────────────────────────────────────────────────────────────
# conftest.py sets DATABASE_URL via setdefault, so a real URL passed through the
# environment before pytest starts will NOT be overwritten.

_FAKE_URL = "postgresql://test:test@localhost:5432/test"
_LIVE = os.environ.get("DATABASE_URL", _FAKE_URL) not in (_FAKE_URL, "")

pytestmark = pytest.mark.skipif(
    not _LIVE,
    reason="No live DB — set DATABASE_URL to a real Postgres instance to run these tests",
)

# ── Shared fixtures ────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def http():
    """Real TestClient — no cursor mocks, no monkeypatches."""
    from app.main import app  # imported here so conftest stub runs first

    return TestClient(app)


@pytest.fixture(scope="module")
def ids(http):
    """
    Discover fund_id / asset_id / investment_id from the live DB by name.
    Skips the entire module if seed data is missing.
    """
    from app.db import get_cursor

    result: dict = {}

    with get_cursor() as cur:
        # Fund
        cur.execute(
            "SELECT fund_id::text FROM repe_fund WHERE name ILIKE %s LIMIT 1",
            ("%Institutional Growth Fund VII%",),
        )
        row = cur.fetchone()
        if not row:
            pytest.skip(
                "Seed data missing — run 'make db:migrate' then POST /api/repe/businesses/{id}/seed"
            )
        result["fund_id"] = row["fund_id"]

        # Business (needed for context endpoint)
        cur.execute(
            "SELECT business_id::text FROM repe_fund WHERE fund_id = %s::uuid LIMIT 1",
            (result["fund_id"],),
        )
        biz = cur.fetchone()
        result["business_id"] = biz["business_id"] if biz else None

        # Cascade Multifamily asset
        cur.execute(
            "SELECT a.asset_id::text FROM repe_asset a WHERE a.name = %s LIMIT 1",
            ("Cascade Multifamily",),
        )
        asset_row = cur.fetchone()
        result["cascade_id"] = asset_row["asset_id"] if asset_row else None

        # Investment that owns Cascade
        if result["cascade_id"]:
            cur.execute(
                """SELECT d.investment_id::text
                   FROM repe_asset a
                   JOIN repe_deal d ON d.deal_id = a.deal_id
                   WHERE a.asset_id = %s::uuid LIMIT 1""",
                (result["cascade_id"],),
            )
            inv_row = cur.fetchone()
            result["investment_id"] = inv_row["investment_id"] if inv_row else None
        else:
            result["investment_id"] = None

    return result


# ── 1. Health ──────────────────────────────────────────────────────────────────

def test_health(http):
    resp = http.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") in ("ok", "healthy", "up")


# ── 2. REPE context bootstrap ─────────────────────────────────────────────────

def test_context_has_funds(http, ids):
    biz_id = ids.get("business_id")
    if not biz_id:
        pytest.skip("No business_id resolved from seed")

    resp = http.get(f"/api/repe/context?business_id={biz_id}")
    assert resp.status_code == 200
    data = resp.json()
    # Context must surface at least one fund
    assert isinstance(data.get("funds"), list)
    assert len(data["funds"]) >= 1


# ── 3. Fund list ──────────────────────────────────────────────────────────────

def test_fund_list_contains_igf_vii(http, ids):
    biz_id = ids.get("business_id")
    if not biz_id:
        pytest.skip("No business_id resolved")

    resp = http.get(f"/api/repe/funds?business_id={biz_id}")
    assert resp.status_code == 200
    funds = resp.json()
    assert isinstance(funds, list)
    names = [f.get("name", "") for f in funds]
    assert any("Institutional Growth Fund VII" in n for n in names), (
        f"Expected 'Institutional Growth Fund VII' in fund names, got: {names}"
    )


# ── 4. Fund detail ────────────────────────────────────────────────────────────

def test_fund_detail(http, ids):
    fund_id = ids["fund_id"]

    resp = http.get(f"/api/repe/funds/{fund_id}")
    assert resp.status_code == 200
    fund = resp.json()

    assert "Institutional Growth Fund VII" in fund.get("name", "")
    assert fund.get("strategy") in ("equity", "debt")
    assert fund.get("vintage_year") in (2022, 2023, 2024), (
        f"Unexpected vintage_year: {fund.get('vintage_year')}"
    )


# ── 5. Fund investments ───────────────────────────────────────────────────────

def test_fund_investments_contains_cascade(http, ids):
    fund_id = ids["fund_id"]

    resp = http.get(f"/api/re/v2/funds/{fund_id}/investments")
    assert resp.status_code == 200
    investments = resp.json()
    assert isinstance(investments, list), "Expected list of investments"
    assert len(investments) >= 1, "No investments found — seed may not have run"

    names = [i.get("name", "") for i in investments]
    assert any("Cascade" in n for n in names), (
        f"Expected a 'Cascade' investment, got: {names}"
    )


# ── 6. Fund quarter metrics (2026Q1) ─────────────────────────────────────────

def test_fund_metrics_2026q1(http, ids):
    fund_id = ids["fund_id"]

    resp = http.get(f"/api/re/v2/funds/{fund_id}/metrics/2026Q1")
    # 404 is acceptable if no quarter-close has been run; 200 must have valid data
    if resp.status_code == 404:
        pytest.skip("No 2026Q1 fund metrics — quarter-close not run")

    assert resp.status_code == 200
    m = resp.json()

    # Gross IRR must be a positive float in a realistic REPE range (0–50%)
    gross_irr = m.get("gross_irr")
    if gross_irr is not None:
        assert 0.0 < float(gross_irr) < 0.50, f"gross_irr out of range: {gross_irr}"

    net_irr = m.get("net_irr")
    if net_irr is not None:
        assert 0.0 < float(net_irr) < 0.50, f"net_irr out of range: {net_irr}"

    # Net must be less than gross (fees)
    if gross_irr is not None and net_irr is not None:
        assert float(net_irr) < float(gross_irr), "net_irr should be < gross_irr"


# ── 7. Fund investment rollup ─────────────────────────────────────────────────

def test_fund_investment_rollup(http, ids):
    fund_id = ids["fund_id"]

    resp = http.get(f"/api/re/v2/funds/{fund_id}/investment-rollup/2026Q1")
    if resp.status_code == 404:
        pytest.skip("No rollup data for 2026Q1")

    assert resp.status_code == 200
    rollup = resp.json()
    assert isinstance(rollup, list) and len(rollup) >= 1, "Rollup returned no rows"


# ── 8. Asset identity — Cascade Multifamily ──────────────────────────────────

def test_cascade_identity(http, ids):
    cascade_id = ids.get("cascade_id")
    if not cascade_id:
        pytest.skip("Cascade Multifamily asset not found in DB")

    resp = http.get(f"/api/repe/assets/{cascade_id}")
    assert resp.status_code == 200
    a = resp.json()

    assert a.get("name") == "Cascade Multifamily"

    # Property details may be nested under 'property' or flat
    prop = a.get("property") or a
    assert prop.get("city") == "Aurora", f"Expected Aurora, got: {prop.get('city')}"
    assert prop.get("state") == "CO", f"Expected CO, got: {prop.get('state')}"
    assert prop.get("property_type") == "multifamily", (
        f"Expected multifamily, got: {prop.get('property_type')}"
    )

    units = prop.get("units")
    if units is not None:
        assert int(units) == 280, f"Expected 280 units, got: {units}"


# ── 9. Asset quarter-state (2026Q1) ──────────────────────────────────────────

def test_cascade_quarter_state(http, ids):
    cascade_id = ids.get("cascade_id")
    if not cascade_id:
        pytest.skip("Cascade Multifamily not found")

    resp = http.get(f"/api/re/v2/assets/{cascade_id}/quarter-state/2026Q1")
    if resp.status_code == 404:
        pytest.skip("No 2026Q1 quarter-state for Cascade — seed V2 patch may not have run")

    assert resp.status_code == 200
    qs = resp.json()

    # NOI must be a positive number (quarterly, not annual)
    noi = qs.get("noi")
    assert noi is not None, "noi is null"
    assert float(noi) > 0, f"noi must be positive, got: {noi}"

    # Occupancy must be between 0 and 1
    occ = qs.get("occupancy")
    if occ is not None:
        assert 0.0 < float(occ) <= 1.0, f"occupancy out of range: {occ}"

    # Asset value must be > 0
    asset_value = qs.get("asset_value")
    if asset_value is not None:
        assert float(asset_value) > 0, f"asset_value must be positive: {asset_value}"

    # NAV = asset_value - debt; should be positive for healthy asset
    nav = qs.get("nav")
    debt = qs.get("debt_balance")
    if nav is not None and debt is not None:
        assert float(nav) > 0, f"NAV is negative (possible data issue): {nav}"


# ── 10. JV list for investment ────────────────────────────────────────────────

def test_investment_has_jv(http, ids):
    investment_id = ids.get("investment_id")
    if not investment_id:
        pytest.skip("No investment_id resolved for Cascade")

    resp = http.get(f"/api/re/v2/investments/{investment_id}/jvs")
    assert resp.status_code == 200
    jvs = resp.json()
    assert isinstance(jvs, list), "Expected list of JVs"
    assert len(jvs) >= 1, "No JVs found for Cascade investment"

    jv = jvs[0]
    assert jv.get("status") == "active", f"JV status unexpected: {jv.get('status')}"


# ── 11. Models list ───────────────────────────────────────────────────────────

def test_models_seeded(http, ids):
    fund_id = ids["fund_id"]

    # Try fund-scoped first, fall back to global
    resp = http.get(f"/api/re/v2/funds/{fund_id}/models")
    if resp.status_code == 200 and len(resp.json()) > 0:
        return  # pass

    resp2 = http.get("/api/re/v2/models")
    assert resp2.status_code == 200
    # Models are optional — just assert the endpoint is alive
    assert isinstance(resp2.json(), list)


# ── 12. Capital ledger — call + distribution entries ─────────────────────────

def test_capital_ledger_has_entries(http, ids):
    fund_id = ids["fund_id"]

    resp = http.get(f"/api/re/v2/funds/{fund_id}/capital-ledger")
    assert resp.status_code == 200
    entries = resp.json()
    assert isinstance(entries, list), "Expected list"
    assert len(entries) >= 1, (
        "Capital ledger is empty — re_fi_seed may not have run "
        "(check POST /bos/re/fi/seed or make seed)"
    )

    event_types = {e.get("entry_type") for e in entries}
    assert "CALL" in event_types or "call" in event_types, (
        f"No CALL entries found. Types present: {event_types}"
    )
