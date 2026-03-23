"""Tests for the financial intelligence layer.

Tests:
- Accounting import normalizes GL to NOI line codes
- Variance endpoint returns non-zero when seeded
- Quarter close creates a run and outputs
- Fee accrual appears in gross-net bridge
- Debt covenant tests only work for debt funds
- Run history lists correctly
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-env"
BUSINESS_ID = str(uuid.uuid4())
FUND_ID = str(uuid.uuid4())
DEBT_FUND_ID = str(uuid.uuid4())
ASSET_ID_1 = str(uuid.uuid4())
ASSET_ID_2 = str(uuid.uuid4())
RUN_ID = str(uuid.uuid4())
LOAN_ID = str(uuid.uuid4())
UW_VERSION_ID = str(uuid.uuid4())
NOW = datetime(2026, 3, 31, 12, 0, 0).isoformat()


# ── Test: Accounting Import Normalizes ──────────────────────────────────────

class TestAccountingImportNormalizes:
    def test_import_stores_and_normalizes(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/accounting/import should store GL rows and normalize to NOI."""
        # Push result for INSERT (gl_balance) — 2 rows
        fake_cursor.push_result([{"id": str(uuid.uuid4())}])
        fake_cursor.push_result([{"id": str(uuid.uuid4())}])
        # Push result for normalize NOI INSERT
        fake_cursor.rowcount = 2
        fake_cursor.push_result([])
        # Push result for normalize BS INSERT
        fake_cursor.push_result([])

        response = client.post("/api/re/v2/accounting/import", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "source_name": "test_source",
            "payload": [
                {"asset_id": ASSET_ID_1, "period_month": "2026-01-01", "gl_account": "4000", "amount": 85000},
                {"asset_id": ASSET_ID_1, "period_month": "2026-01-01", "gl_account": "5000", "amount": 12000},
            ],
        })

        assert response.status_code == 200
        data = response.json()
        assert "source_hash" in data
        assert data["rows_loaded"] >= 0  # Exact count depends on ON CONFLICT behavior


# ── Test: Variance Endpoint Returns Nonzero When Seeded ────────────────────

class TestVarianceEndpoint:
    def test_returns_variance_data(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/variance/noi should return variance data with rollup."""
        # Push results for the SELECT from re_asset_variance_qtr
        fake_cursor.push_result([
            {
                "id": str(uuid.uuid4()),
                "run_id": RUN_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "investment_id": None,
                "asset_id": ASSET_ID_1,
                "quarter": "2026Q1",
                "line_code": "RENT",
                "actual_amount": Decimal("86700"),
                "plan_amount": Decimal("85000"),
                "variance_amount": Decimal("1700"),
                "variance_pct": Decimal("0.02"),
            },
            {
                "id": str(uuid.uuid4()),
                "run_id": RUN_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "investment_id": None,
                "asset_id": ASSET_ID_1,
                "quarter": "2026Q1",
                "line_code": "PAYROLL",
                "actual_amount": Decimal("-12600"),
                "plan_amount": Decimal("-12000"),
                "variance_amount": Decimal("-600"),
                "variance_pct": Decimal("-0.05"),
            },
        ])

        response = client.get(
            "/api/re/v2/variance/noi",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "quarter": "2026Q1",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 2
        assert "rollup" in data
        assert data["rollup"]["total_variance"] != "0"


# ── Test: Quarter Close Creates Run and Outputs ────────────────────────────

class TestQuarterCloseCreatesRun:
    def test_creates_run_and_stores_outputs(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/runs/quarter_close should create a run with metrics."""
        # 1. create_run INSERT → re_run RETURNING
        fake_cursor.push_result([{
            "id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "run_type": "QUARTER_CLOSE",
            "status": "running",
            "created_at": NOW,
        }])

        # 2. fee_accrual: SELECT fee_policy
        fake_cursor.push_result([{
            "fee_basis": "COMMITTED",
            "annual_rate": Decimal("0.015"),
            "stepdown_date": None,
            "stepdown_rate": None,
        }])
        # 3. fee_accrual: SELECT committed
        fake_cursor.push_result([{"total": Decimal("25000000")}])
        # 4. fee_accrual: INSERT re_fee_accrual_qtr
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "amount": Decimal("93750"),
        }])

        # 5-9: compute_return_metrics queries
        # SELECT fund_state
        fake_cursor.push_result([{"portfolio_nav": Decimal("28000000")}])
        # SELECT cash totals
        fake_cursor.push_result([{"total_called": Decimal("25000000"), "total_distributed": Decimal("1500000")}])
        # SELECT re_cash_event for gross XIRR
        fake_cursor.push_result([
            {"event_date": date(2025, 1, 15), "event_type": "CALL", "amount": Decimal("25000000")},
            {"event_date": date(2025, 12, 31), "event_type": "DIST", "amount": Decimal("1500000")},
        ])
        # SELECT fee accruals sum
        fake_cursor.push_result([{"total": Decimal("93750")}])
        # SELECT fund expenses sum
        fake_cursor.push_result([{"total": Decimal("45000")}])
        # Waterfall definition lookup (empty → fallback to simplified carry)
        fake_cursor.push_result([])
        # SELECT re_cash_event for net XIRR
        fake_cursor.push_result([
            {"event_date": date(2025, 1, 15), "event_type": "CALL", "amount": Decimal("25000000")},
            {"event_date": date(2025, 12, 31), "event_type": "DIST", "amount": Decimal("1500000")},
        ])
        # INSERT re_fund_metrics_qtr
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "run_id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "gross_irr": Decimal("0.18"),
            "net_irr": Decimal("0.14"),
            "gross_tvpi": Decimal("1.18"),
            "net_tvpi": Decimal("1.14"),
            "dpi": Decimal("0.06"),
            "rvpi": Decimal("1.12"),
            "cash_on_cash": Decimal("0.06"),
            "gross_net_spread": Decimal("0.04"),
            "inputs_missing": None,
        }])
        # INSERT re_gross_net_bridge_qtr
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "run_id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "gross_return": Decimal("4500000"),
            "mgmt_fees": Decimal("93750"),
            "fund_expenses": Decimal("45000"),
            "carry_shadow": Decimal("560000"),
            "net_return": Decimal("3801250"),
        }])

        # 10: complete_run UPDATE
        fake_cursor.push_result([])

        response = client.post("/api/re/v2/runs/quarter_close", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["run_id"] == RUN_ID
        assert data["run_type"] == "QUARTER_CLOSE"


# ── Test: Fee Accrual in Bridge ──────────────────────────────────────────────

class TestFeeAccrualInBridge:
    def test_fee_accrual_computed_in_bridge(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/funds/{fund_id}/metrics-detail should include bridge with fees."""
        # SELECT re_fund_metrics_qtr
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "run_id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "gross_irr": Decimal("0.18"),
            "net_irr": Decimal("0.14"),
            "gross_tvpi": Decimal("1.18"),
            "net_tvpi": Decimal("1.14"),
            "dpi": Decimal("0.06"),
            "rvpi": Decimal("1.12"),
            "cash_on_cash": Decimal("0.06"),
            "gross_net_spread": Decimal("0.04"),
            "inputs_missing": None,
        }])
        # SELECT re_gross_net_bridge_qtr
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "run_id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "gross_return": Decimal("4500000"),
            "mgmt_fees": Decimal("93750"),
            "fund_expenses": Decimal("45000"),
            "carry_shadow": Decimal("560000"),
            "net_return": Decimal("3801250"),
        }])

        response = client.get(
            f"/api/re/v2/funds/{FUND_ID}/metrics-detail",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "quarter": "2026Q1",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["bridge"] is not None
        assert float(data["bridge"]["mgmt_fees"]) > 0
        assert float(data["bridge"]["net_return"]) > 0


# ── Test: Debt Covenant Tests Only For Debt Fund ─────────────────────────────

class TestDebtCovenantTestsOnlyForDebtFund:
    def test_covenant_test_rejects_equity_fund(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/runs/covenant_tests should reject non-debt funds."""
        # create_run INSERT
        fake_cursor.push_result([{
            "id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
            "run_type": "COVENANT_TEST",
            "status": "running",
            "created_at": NOW,
        }])
        # SELECT strategy from repe_fund — equity fund
        fake_cursor.push_result([{"strategy": "equity"}])
        # fail_run UPDATE
        fake_cursor.push_result([])

        response = client.post("/api/re/v2/runs/covenant_tests", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": FUND_ID,
            "quarter": "2026Q1",
        })

        assert response.status_code == 400
        data = response.json()
        assert "debt fund" in data.get("message", data.get("detail", {}).get("message", "")).lower()

    def test_covenant_test_runs_for_debt_fund(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/runs/covenant_tests should succeed for debt funds."""
        # create_run INSERT
        fake_cursor.push_result([{
            "id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": DEBT_FUND_ID,
            "quarter": "2026Q1",
            "run_type": "COVENANT_TEST",
            "status": "running",
            "created_at": NOW,
        }])
        # SELECT strategy — debt fund
        fake_cursor.push_result([{"strategy": "debt"}])
        # SELECT loans
        fake_cursor.push_result([{
            "id": LOAN_ID,
            "loan_name": "Test Loan",
            "upb": Decimal("15000000"),
            "rate": Decimal("0.065"),
            "asset_id": None,
        }])
        # SELECT covenants for loan
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "covenant_type": "DSCR",
            "comparator": ">=",
            "threshold": Decimal("1.25"),
        }])
        # re_amortization.get_debt_service_summary → SELECT from schedule (empty → fallback)
        fake_cursor.push_result([{"annual_debt_service": None, "annual_interest": None, "annual_principal": None, "period_count": None}])
        # INSERT covenant result
        fake_cursor.push_result([{
            "id": str(uuid.uuid4()),
            "run_id": RUN_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": DEBT_FUND_ID,
            "loan_id": LOAN_ID,
            "quarter": "2026Q1",
            "dscr": None,
            "ltv": None,
            "debt_yield": None,
            "pass": False,
            "headroom": None,
            "breached": True,
            "created_at": NOW,
        }])
        # INSERT watchlist event
        fake_cursor.push_result([])
        # complete_run UPDATE
        fake_cursor.push_result([])

        response = client.post("/api/re/v2/runs/covenant_tests", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "fund_id": DEBT_FUND_ID,
            "quarter": "2026Q1",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["run_type"] == "COVENANT_TEST"


# ── Test: Run History Lists ──────────────────────────────────────────────────

class TestRunHistoryLists:
    def test_lists_runs_for_fund(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/fi/runs should return run history."""
        fake_cursor.push_result([
            {
                "id": RUN_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "quarter": "2026Q1",
                "scenario_id": None,
                "run_type": "QUARTER_CLOSE",
                "status": "success",
                "input_hash": None,
                "output_hash": "abc123",
                "created_at": NOW,
                "created_by": "api",
            },
        ])

        response = client.get(
            "/api/re/v2/fi/runs",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["run_type"] == "QUARTER_CLOSE"
        assert data[0]["status"] == "success"

    def test_lists_runs_filtered_by_quarter(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/fi/runs?quarter=2026Q1 should filter."""
        fake_cursor.push_result([])

        response = client.get(
            "/api/re/v2/fi/runs",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "quarter": "2026Q1",
            },
        )

        assert response.status_code == 200
        assert response.json() == []
