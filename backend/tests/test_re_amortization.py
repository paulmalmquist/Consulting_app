"""Tests for amortization, property comps, capital snapshots, waterfall breakdown, and excel export.

Tests:
- Generate amortization stores schedule
- Get amortization returns stored rows
- Waterfall breakdown returns tier allocations
- Property comps CRUD
- Capital snapshots compute and store
- Excel export returns xlsx
- DSCR uses amortization schedule
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-env"
BUSINESS_ID = str(uuid.uuid4())
FUND_ID = str(uuid.uuid4())
LOAN_ID = str(uuid.uuid4())
ASSET_ID = str(uuid.uuid4())
PARTNER_ID_1 = str(uuid.uuid4())
PARTNER_ID_2 = str(uuid.uuid4())


def test_generate_amortization_stores_schedule(client, fake_cursor: FakeCursor):
    """POST /loans/{id}/amortization/generate generates and stores schedule."""
    # 1. Loan lookup
    fake_cursor.push_result([{
        "id": LOAN_ID,
        "upb": Decimal("15000000"),
        "rate": Decimal("0.065"),
        "amortization_period_years": 30,
        "term_years": 7,
        "io_period_months": 0,
        "amort_type": "amortizing",
    }])
    # 2. DELETE old schedule
    fake_cursor.push_result([])
    # 3..86: INSERT for each of 84 periods (7yr * 12mo)
    for _ in range(84):
        fake_cursor.push_result([])

    resp = client.post(f"/api/re/v2/loans/{LOAN_ID}/amortization/generate")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 84
    assert data[0]["period_number"] == 1
    assert float(data[0]["beginning_balance"]) == 15000000.0


def test_get_amortization_returns_stored(client, fake_cursor: FakeCursor):
    """GET /loans/{id}/amortization returns stored rows."""
    fake_cursor.push_result([
        {
            "period_number": 1,
            "payment_date": None,
            "beginning_balance": Decimal("15000000"),
            "scheduled_principal": Decimal("15000"),
            "interest_payment": Decimal("81250"),
            "total_payment": Decimal("96250"),
            "ending_balance": Decimal("14985000"),
        },
        {
            "period_number": 2,
            "payment_date": None,
            "beginning_balance": Decimal("14985000"),
            "scheduled_principal": Decimal("15100"),
            "interest_payment": Decimal("81169"),
            "total_payment": Decimal("96269"),
            "ending_balance": Decimal("14969900"),
        },
    ])

    resp = client.get(f"/api/re/v2/loans/{LOAN_ID}/amortization")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["period_number"] == 1


def test_waterfall_breakdown_returns_tiers(client, fake_cursor: FakeCursor):
    """GET /funds/{id}/waterfall-breakdown returns tier allocations."""
    run_id = str(uuid.uuid4())
    # 1. Waterfall run lookup
    fake_cursor.push_result([{"id": run_id}])
    # 2. Waterfall run results
    fake_cursor.push_result([
        {"tier_name": "T1_ROC", "amount": Decimal("100000"), "partner_name": "Winston", "partner_type": "gp"},
        {"tier_name": "T2_PREF", "amount": Decimal("50000"), "partner_name": "State Pension", "partner_type": "lp"},
        {"tier_name": "T4_CARRY", "amount": Decimal("20000"), "partner_name": "Winston", "partner_type": "gp"},
    ])

    resp = client.get(f"/api/re/v2/funds/{FUND_ID}/waterfall-breakdown?quarter=2025Q3")
    assert resp.status_code == 200
    data = resp.json()
    assert data["fund_id"] == FUND_ID
    assert len(data["allocations"]) == 3
    assert data["allocations"][0]["tier_name"] == "T1_ROC"


def test_comps_crud(client, fake_cursor: FakeCursor):
    """POST + GET comps for asset."""
    comp_id = 1
    # 1. INSERT returning
    fake_cursor.push_result([{
        "id": comp_id,
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "asset_id": ASSET_ID,
        "comp_type": "sale",
        "address": "100 Main St",
        "submarket": "CBD",
        "close_date": date(2024, 11, 15),
        "sale_price": Decimal("48000000"),
        "cap_rate": Decimal("0.058"),
        "noi": None,
        "size_sf": Decimal("120000"),
        "price_per_sf": Decimal("400"),
        "rent_psf": None,
        "term_months": None,
        "source": "CoStar",
        "created_at": datetime(2025, 1, 1),
    }])

    resp = client.post(
        f"/api/re/v2/assets/{ASSET_ID}/comps",
        json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "comp_type": "sale",
            "comps": [{"address": "100 Main St", "submarket": "CBD", "sale_price": 48000000, "cap_rate": 0.058}],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 1
    assert data[0]["address"] == "100 Main St"


def test_capital_snapshots_compute(client, fake_cursor: FakeCursor):
    """POST /funds/{id}/capital-snapshots/compute stores per-partner snapshots."""
    # 1. Fund metrics (NAV)
    fake_cursor.push_result([{"nav": Decimal("425000000")}])
    # 2. Partners
    fake_cursor.push_result([
        {"id": PARTNER_ID_1, "partner_name": "Winston Capital", "partner_type": "gp", "commitment": Decimal("10000000")},
        {"id": PARTNER_ID_2, "partner_name": "State Pension", "partner_type": "lp", "commitment": Decimal("200000000")},
    ])
    # 3. Waterfall run lookup
    fake_cursor.push_result([])
    # 4. Capital ledger for partner 1
    fake_cursor.push_result([{"contributed": Decimal("8500000"), "distributed": Decimal("680000")}])
    # 5. UPSERT for partner 1
    fake_cursor.push_result([{
        "id": 1, "fund_id": FUND_ID, "partner_id": PARTNER_ID_1,
        "partner_name": "Winston Capital", "partner_type": "gp",
        "quarter": "2025Q3",
        "committed": Decimal("10000000"), "contributed": Decimal("8500000"),
        "distributed": Decimal("680000"), "unreturned_capital": Decimal("7820000"),
        "pref_accrual": Decimal("156400"), "carry_allocation": Decimal("0"),
        "unrealized_gain": Decimal("238095"), "nav_share": Decimal("8500000"),
        "dpi": Decimal("0.08"), "rvpi": Decimal("1.00"), "tvpi": Decimal("1.08"),
        "created_at": datetime(2025, 1, 1),
    }])
    # 6. Capital ledger for partner 2
    fake_cursor.push_result([{"contributed": Decimal("170000000"), "distributed": Decimal("13600000")}])
    # 7. UPSERT for partner 2
    fake_cursor.push_result([{
        "id": 2, "fund_id": FUND_ID, "partner_id": PARTNER_ID_2,
        "partner_name": "State Pension", "partner_type": "lp",
        "quarter": "2025Q3",
        "committed": Decimal("200000000"), "contributed": Decimal("170000000"),
        "distributed": Decimal("13600000"), "unreturned_capital": Decimal("156400000"),
        "pref_accrual": Decimal("3128000"), "carry_allocation": Decimal("0"),
        "unrealized_gain": Decimal("248095238"), "nav_share": Decimal("404761905"),
        "dpi": Decimal("0.08"), "rvpi": Decimal("2.38"), "tvpi": Decimal("2.46"),
        "created_at": datetime(2025, 1, 1),
    }])

    resp = client.post(
        f"/api/re/v2/funds/{FUND_ID}/capital-snapshots/compute",
        json={"quarter": "2025Q3"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["partner_name"] == "Winston Capital"


def test_excel_export_returns_xlsx(client, fake_cursor: FakeCursor):
    """GET /funds/{id}/export returns 200 with xlsx content-type."""
    # 1. Fund metrics for summary
    fake_cursor.push_result([{
        "gross_irr": Decimal("0.12"), "net_irr": Decimal("0.095"),
        "gross_tvpi": Decimal("1.28"), "net_tvpi": Decimal("1.20"),
        "dpi": Decimal("0.08"), "rvpi": Decimal("1.20"), "nav": Decimal("425000000"),
    }])
    # 2. Fund name
    fake_cursor.push_result([{"fund_name": "Institutional Growth Fund VII"}])
    # 3. LP capital account snapshots
    fake_cursor.push_result([])
    # 4. Waterfall run lookup
    fake_cursor.push_result([])
    # 5. Loans list
    fake_cursor.push_result([])
    # 6. NOI variance
    fake_cursor.push_result([])

    resp = client.get(
        f"/api/re/v2/funds/{FUND_ID}/export",
        params={"env_id": ENV_ID, "business_id": BUSINESS_ID, "quarter": "2025Q3"},
    )
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert len(resp.content) > 100  # Has actual xlsx bytes


def test_get_capital_snapshots(client, fake_cursor: FakeCursor):
    """GET /funds/{id}/capital-snapshots returns stored snapshots."""
    fake_cursor.push_result([
        {
            "id": 1, "fund_id": FUND_ID, "partner_id": PARTNER_ID_1,
            "partner_name": "Winston Capital", "partner_type": "gp",
            "quarter": "2025Q3",
            "committed": Decimal("10000000"), "contributed": Decimal("8500000"),
            "distributed": Decimal("680000"), "unreturned_capital": Decimal("7820000"),
            "pref_accrual": Decimal("156400"), "carry_allocation": Decimal("0"),
            "unrealized_gain": Decimal("238095"), "nav_share": Decimal("8500000"),
            "dpi": Decimal("0.08"), "rvpi": Decimal("1.00"), "tvpi": Decimal("1.08"),
            "created_at": datetime(2025, 1, 1),
        },
    ])

    resp = client.get(
        f"/api/re/v2/funds/{FUND_ID}/capital-snapshots",
        params={"quarter": "2025Q3"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["partner_name"] == "Winston Capital"
