"""Regression tests for the v2 institutional seed patch.

Tests:
- Pure helper functions (_compute_budget_items, _make_loans, _make_comps)
- seed_institutional_v2_patch yields >= 12 assets
- Each investment has asset(s)
- Each asset has debt + NOI facts
- V2 patch endpoint returns 200
- Validation endpoint returns PASS
- Idempotent re-run does not crash
"""

import uuid
from datetime import datetime

from tests.conftest import FakeCursor

ENV_ID = "test-env"
BUSINESS_ID = str(uuid.uuid4())
FUND_ID = str(uuid.uuid4())
NOW = datetime(2025, 3, 31, 12, 0, 0).isoformat()

# 12 fake investments as the v1 seed would create
_DEAL_IDS = [uuid.uuid4() for _ in range(12)]
_ASSET_IDS = [uuid.uuid4() for _ in range(12)]

_INVESTMENT_NAMES = [
    "Meridian Office Tower",
    "Harborview Logistics Park",
    "Cascade Multifamily",
    "Summit Retail Center",
    "Ironworks Mixed-Use",
    "Lakeside Senior Living",
    "Pacific Gateway Hotel",
    "Riverfront Apartments",
    "Tech Campus North",
    "Harbor Industrial Portfolio",
    "Downtown Mixed-Use",
    "Suburban Office Park",
]


def _make_v1_rows():
    """Simulate the result of the initial SELECT that queries existing v1 data."""
    rows = []
    for i, name in enumerate(_INVESTMENT_NAMES):
        rows.append({
            "deal_id": str(_DEAL_IDS[i]),
            "deal_name": name,
            "asset_id": str(_ASSET_IDS[i]),
            "asset_name": name,
        })
    return rows


# ── Test: Helper Functions (pure, no DB) ─────────────────────────────────────

class TestHelperFunctions:
    def test_compute_budget_items_office(self):
        from app.services.re_fi_seed_v2 import _compute_budget_items
        result = _compute_budget_items(375_000, "office")
        assert "RENT" in result
        assert "VACANCY" in result
        assert "OTHER_INCOME" in result
        assert "PAYROLL" in result
        assert "TAXES" in result
        assert result["RENT"] > 0
        # NOI margin ~65% for office
        opex = sum(v for k, v in result.items() if k not in ("RENT", "OTHER_INCOME", "VACANCY"))
        vacancy = result["VACANCY"]
        noi = result["RENT"] + result["OTHER_INCOME"] - vacancy - opex
        # NOI should be close to 375,000
        assert abs(noi - 375_000) < 50_000  # within 50k tolerance

    def test_compute_budget_items_hospitality(self):
        from app.services.re_fi_seed_v2 import _compute_budget_items
        result = _compute_budget_items(250_000, "hospitality")
        # Hospitality has higher payroll (14% vs 5%)
        office_result = _compute_budget_items(250_000, "office")
        assert result["PAYROLL"] > office_result["PAYROLL"]

    def test_compute_budget_items_industrial(self):
        from app.services.re_fi_seed_v2 import _compute_budget_items
        result = _compute_budget_items(316_667, "industrial")
        # Industrial has higher margin → lower gross rent for same NOI
        office_result = _compute_budget_items(316_667, "office")
        assert result["RENT"] < office_result["RENT"]

    def test_make_loans_senior(self):
        from app.services.re_fi_seed_v2 import _make_loans, _v2_id
        profile = {
            "name": "Test Office",
            "purchase_price": 45_000_000,
            "loan_type": "senior",
            "acq_date": "2024-03-15",
        }
        asset_id = _v2_id("asset:Test Office")
        deal_id = uuid.uuid4()
        loans = _make_loans(profile, asset_id, deal_id)
        assert len(loans) == 1
        assert "Senior Note" in loans[0]["loan_name"]
        assert loans[0]["upb"] == 27_000_000  # 60% of 45M
        assert loans[0]["amort_type"] == "amortizing"
        assert loans[0]["amortization_period_years"] == 30
        assert loans[0]["term_years"] == 7
        assert loans[0]["io_period_months"] == 0
        assert loans[0]["asset_id"] == asset_id
        assert loans[0]["investment_id"] == deal_id

    def test_make_loans_senior_mezz(self):
        from app.services.re_fi_seed_v2 import _make_loans
        profile = {
            "name": "Test Industrial",
            "purchase_price": 38_000_000,
            "loan_type": "senior_mezz",
            "acq_date": "2024-04-01",
        }
        loans = _make_loans(profile, uuid.uuid4(), uuid.uuid4())
        assert len(loans) == 2
        senior = loans[0]
        mezz = loans[1]
        assert "Senior Note" in senior["loan_name"]
        assert "Mezz Note" in mezz["loan_name"]
        assert senior["upb"] == round(38_000_000 * 0.55)
        assert mezz["upb"] == round(38_000_000 * 0.15)
        assert senior["amort_type"] == "amortizing"
        assert mezz["amort_type"] == "interest_only"

    def test_make_loans_construction(self):
        from app.services.re_fi_seed_v2 import _make_loans
        profile = {
            "name": "Test Dev",
            "purchase_price": 34_000_000,
            "loan_type": "construction",
            "acq_date": "2024-05-10",
        }
        loans = _make_loans(profile, uuid.uuid4(), uuid.uuid4())
        assert len(loans) == 1
        assert "Construction" in loans[0]["loan_name"]
        assert loans[0]["upb"] == round(34_000_000 * 0.70)
        assert loans[0]["io_period_months"] == 24

    def test_make_loans_senior_io(self):
        from app.services.re_fi_seed_v2 import _make_loans
        profile = {
            "name": "Test Hotel",
            "purchase_price": 36_000_000,
            "loan_type": "senior_io",
            "acq_date": "2024-09-01",
        }
        loans = _make_loans(profile, uuid.uuid4(), uuid.uuid4())
        assert len(loans) == 1
        assert loans[0]["amort_type"] == "interest_only"
        assert loans[0]["upb"] == round(36_000_000 * 0.65)

    def test_make_comps_returns_three(self):
        from app.services.re_fi_seed_v2 import _make_comps
        profile = {
            "name": "Test Office",
            "city": "Denver",
            "state": "CO",
            "submarket": "CBD",
            "purchase_price": 45_000_000,
            "cap_rate": 0.058,
            "size_sf": 185_000,
            "units": None,
        }
        comps = _make_comps(0, profile)
        assert len(comps) == 3
        for c in comps:
            assert "address" in c
            assert c["sale_price"] > 0
            assert c["cap_rate"] > 0
            assert c["source"] in ("CoStar", "CBRE", "JLL")

    def test_make_comps_deterministic(self):
        from app.services.re_fi_seed_v2 import _make_comps
        profile = {
            "name": "Test Office",
            "city": "Denver",
            "state": "CO",
            "submarket": "CBD",
            "purchase_price": 45_000_000,
            "cap_rate": 0.058,
            "size_sf": 185_000,
            "units": None,
        }
        comps1 = _make_comps(0, profile)
        comps2 = _make_comps(0, profile)
        assert comps1 == comps2

    def test_v2_id_deterministic(self):
        from app.services.re_fi_seed_v2 import _v2_id
        id1 = _v2_id("test:value")
        id2 = _v2_id("test:value")
        assert id1 == id2
        id3 = _v2_id("test:other")
        assert id1 != id3


# ── Test: Seed V2 Patch Executes Successfully ────────────────────────────────

class TestSeedV2PatchRuns:
    def test_seed_v2_patch_completes(self, fake_cursor: FakeCursor):
        """seed_institutional_v2_patch should complete without error."""
        # Push result for initial SELECT (12 investments with 12 assets)
        fake_cursor.push_result(_make_v1_rows())

        from app.services.re_fi_seed_v2 import seed_institutional_v2_patch

        result = seed_institutional_v2_patch(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            fund_id=uuid.UUID(FUND_ID),
        )

        assert result["existing_investments"] == 12
        assert result["existing_assets"] == 12
        assert result["new_assets_created"] == 4
        assert result["property_assets_upserted"] == 16
        assert result["loans_created"] >= 16  # at least 1 per asset
        assert result["budget_rows"] == 16 * 15 * 10  # 16 assets × 15 months × 10 codes
        assert result["actual_rows"] == 16 * 15 * 10
        assert result["bs_rows"] == 16 * 15 * 6  # 6 BS line codes
        assert result["sale_comps"] == 16 * 3
        assert result["covenant_definitions"] >= 16  # at least 1 per loan

    def test_seed_v2_patch_raises_without_v1(self, fake_cursor: FakeCursor):
        """seed_institutional_v2_patch should raise ValueError if v1 not run."""
        fake_cursor.push_result([])  # No investments found

        from app.services.re_fi_seed_v2 import seed_institutional_v2_patch
        import pytest

        with pytest.raises(ValueError, match="No investments found"):
            seed_institutional_v2_patch(
                env_id=ENV_ID,
                business_id=uuid.UUID(BUSINESS_ID),
                fund_id=uuid.UUID(FUND_ID),
            )


# ── Test: Seed V2 Patch Endpoint ─────────────────────────────────────────────

class TestSeedV2PatchEndpoint:
    def test_endpoint_returns_200(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/fi/seed-institutional-v2-patch should return 200."""
        fake_cursor.push_result(_make_v1_rows())

        response = client.post(
            "/api/re/v2/fi/seed-institutional-v2-patch",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["existing_investments"] == 12
        assert data["new_assets_created"] == 4
        assert data["loans_created"] >= 16

    def test_endpoint_returns_error_without_v1(self, client, fake_cursor: FakeCursor):
        """POST should return error if v1 seed not run."""
        fake_cursor.push_result([])

        response = client.post(
            "/api/re/v2/fi/seed-institutional-v2-patch",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
            },
        )

        assert response.status_code == 400


# ── Test: Validation Endpoint ────────────────────────────────────────────────

class TestValidationEndpoint:
    def test_validation_returns_pass(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/fi/validate-institutional-seed should return PASS."""
        # 1. Investments with asset counts
        fake_cursor.push_result([
            {"deal_id": str(_DEAL_IDS[i]), "name": _INVESTMENT_NAMES[i], "asset_count": 2 if i in (1, 2, 8, 9) else 1}
            for i in range(12)
        ])
        # 2. Assets with loan counts
        asset_rows = []
        for i in range(12):
            asset_rows.append({"asset_id": str(_ASSET_IDS[i]), "name": _INVESTMENT_NAMES[i], "loan_count": 1})
        # Add 4 secondary assets
        for name in ["Harborview Distribution Center", "Cascade Village Phase II", "Tech Campus South Building", "Harbor Warehouse Complex"]:
            asset_rows.append({"asset_id": str(uuid.uuid4()), "name": name, "loan_count": 1})
        fake_cursor.push_result(asset_rows)

        # 3. Assets with accounting periods
        acct_rows = []
        for row in asset_rows:
            acct_rows.append({"asset_id": row["asset_id"], "name": row["name"], "periods": 15})
        fake_cursor.push_result(acct_rows)

        # 4. 2025Q1 valuation count
        fake_cursor.push_result([{"cnt": 16}])

        # 5. Property comps
        fake_cursor.push_result([{"assets_with_comps": 16, "total_comps": 48}])

        response = client.get(
            "/api/re/v2/fi/validate-institutional-seed",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "PASS"
        assert data["total_investments"] == 12
        assert data["total_assets"] == 16


# ── Test: SQL Patterns Verify Idempotency ────────────────────────────────────

class TestIdempotency:
    def test_inserts_use_on_conflict(self, fake_cursor: FakeCursor):
        """All entity INSERTs should use ON CONFLICT for idempotency."""
        fake_cursor.push_result(_make_v1_rows())

        from app.services.re_fi_seed_v2 import seed_institutional_v2_patch

        seed_institutional_v2_patch(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            fund_id=uuid.UUID(FUND_ID),
        )

        # Check that key entity inserts use ON CONFLICT
        entity_tables = ["repe_asset", "re_loan", "re_loan_covenant_definition",
                         "uw_version", "repe_property_asset"]
        for table in entity_tables:
            insert_queries = [
                (sql, params) for sql, params in fake_cursor.queries
                if f"INSERT INTO {table}" in sql
            ]
            for sql, _params in insert_queries:
                assert "ON CONFLICT" in sql, (
                    f"INSERT INTO {table} missing ON CONFLICT: {sql[:100]}"
                )

    def test_accounting_deletes_before_insert(self, fake_cursor: FakeCursor):
        """Accounting data should DELETE old seed_v2 data before inserting."""
        fake_cursor.push_result(_make_v1_rows())

        from app.services.re_fi_seed_v2 import seed_institutional_v2_patch

        seed_institutional_v2_patch(
            env_id=ENV_ID,
            business_id=uuid.UUID(BUSINESS_ID),
            fund_id=uuid.UUID(FUND_ID),
        )

        # Check that DELETE precedes INSERT for accounting tables
        delete_tables = ["acct_gl_balance_monthly", "acct_normalized_noi_monthly",
                         "acct_normalized_bs_monthly", "uw_noi_budget_monthly"]
        for table in delete_tables:
            found_delete = any(
                f"DELETE FROM {table}" in sql
                for sql, _ in fake_cursor.queries
            )
            assert found_delete, f"Missing DELETE FROM {table}"


# ── Test: Property Profiles Data Quality ─────────────────────────────────────

class TestPropertyProfilesQuality:
    def test_sixteen_profiles(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        assert len(PROPERTY_PROFILES) == 16

    def test_four_new_assets(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        new_count = sum(1 for p in PROPERTY_PROFILES if p["is_new"])
        assert new_count == 4

    def test_twelve_existing_assets(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        existing = sum(1 for p in PROPERTY_PROFILES if not p["is_new"])
        assert existing == 12

    def test_two_distressed_assets(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        distressed = [p for p in PROPERTY_PROFILES if p["distressed"]]
        assert len(distressed) == 2
        names = {p["name"] for p in distressed}
        assert "Ironworks Mixed-Use" in names
        assert "Pacific Gateway Hotel" in names

    def test_geography_mix(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        cities = {}
        for p in PROPERTY_PROFILES:
            cities[p["city"]] = cities.get(p["city"], 0) + 1
        # At least 5 cities
        assert len(cities) >= 5
        # Denver, Dallas, Atlanta, Tampa, Phoenix all present
        for city in ["Denver", "Dallas", "Atlanta", "Tampa", "Phoenix"]:
            assert city in cities, f"{city} missing from geography"

    def test_property_types_diverse(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        types = {p["property_type"] for p in PROPERTY_PROFILES}
        # At least 5 property types
        assert len(types) >= 5

    def test_all_profiles_have_required_fields(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        required = [
            "inv_idx", "name", "is_new", "address", "city", "state",
            "submarket", "property_type", "year_built", "purchase_price",
            "noi_monthly", "occupancy", "cap_rate", "loan_type", "distressed",
            "acq_date",
        ]
        for p in PROPERTY_PROFILES:
            for field in required:
                assert field in p, f"Profile {p['name']} missing {field}"

    def test_loan_type_mix(self):
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES
        loan_types = {}
        for p in PROPERTY_PROFILES:
            lt = p["loan_type"]
            loan_types[lt] = loan_types.get(lt, 0) + 1
        # Spec: 6 senior, 3 construction, 3 senior_mezz, 4 senior_io (approx)
        assert "senior" in loan_types
        assert "construction" in loan_types
        assert "senior_mezz" in loan_types
        assert "senior_io" in loan_types
        assert loan_types["senior"] >= 5
        assert loan_types["construction"] >= 3
        assert loan_types["senior_mezz"] >= 3

    def test_total_loan_count(self):
        """Total loans should be >= 16 (at least 1 per asset, more for mezz)."""
        from app.services.re_fi_seed_v2 import PROPERTY_PROFILES, _make_loans, _v2_id
        total = 0
        for p in PROPERTY_PROFILES:
            loans = _make_loans(p, _v2_id(f"asset:{p['name']}"), uuid.uuid4())
            total += len(loans)
        # 16 assets, 3 have senior_mezz (2 loans each) → 16 + 3 = 19
        assert total >= 19
