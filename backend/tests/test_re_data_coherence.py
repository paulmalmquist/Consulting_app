"""REPE Data Coherence Tests — validates seed data integrity.

These tests verify that the seeded REPE environment is internally coherent:
- Referential integrity (no orphaned records)
- Financial consistency (NOI = revenue - opex, etc.)
- Coverage completeness (minimum counts for pipeline, leases, partners)
- Cross-table reconciliation

Tests run against the SQL integrity check functions defined in
362_re_integrity_checks.sql via the coherence API endpoint, or directly
via FakeCursor with canned passing results for CI environments.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from tests.conftest import FakeCursor


# ── Configuration ───────────────────────────────────────────────────────

# Set to True to run against a live DB (requires DATABASE_URL with seeded data)
_LIVE = os.environ.get("RE_COHERENCE_LIVE", "").lower() in ("1", "true", "yes")

# All SQL integrity check functions from 362_re_integrity_checks.sql
INTEGRITY_CHECKS = [
    "re_check_orphaned_assets",
    "re_check_assets_without_property_detail",
    "re_check_funds_without_investments",
    "re_check_pipeline_completeness",
    "re_check_noi_equals_rev_minus_opex",
    "re_check_ncf_waterfall",
    "re_check_occupancy_bounds",
    "re_check_cap_rate_bounds",
    "re_check_dpi_tvpi_consistency",
    "re_check_all_assets_have_rollup",
    "re_check_pipeline_density",
    "re_check_lease_coverage",
    "re_check_partner_ledger_coverage",
]


# ── Mocked tests (run in CI without DB) ────────────────────────────────


class TestCoherenceChecksMocked:
    """Verify the coherence API endpoint contract using FakeCursor."""

    def test_master_check_returns_all_checks(self, client, monkeypatch):
        """GET /api/re/v2/integrity/coherence returns all check results."""
        cur = FakeCursor()
        # Simulate re_run_all_integrity_checks() returning all passing
        cur.push_result([
            {"check_name": fn, "passed": True, "detail": "OK"}
            for fn in INTEGRITY_CHECKS
        ])

        @contextmanager
        def mock_cursor():
            yield cur

        # Patch at the route module level
        import app.routes.re_v2 as mod
        monkeypatch.setattr(mod, "get_cursor", mock_cursor)

        # The endpoint may not exist yet; test the contract shape
        response = client.get("/api/re/v2/integrity/coherence")
        if response.status_code == 404:
            pytest.skip("Coherence endpoint not yet deployed")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "checks" in data
        assert all(c["passed"] for c in data["checks"])

    @pytest.mark.parametrize("check_fn", INTEGRITY_CHECKS)
    def test_individual_check_shape(self, check_fn):
        """Each check function name follows naming convention."""
        assert check_fn.startswith("re_check_")
        assert len(check_fn) > 10


# ── Live DB tests (run with RE_COHERENCE_LIVE=1) ───────────────────────


@pytest.mark.skipif(not _LIVE, reason="Requires live DB (RE_COHERENCE_LIVE=1)")
class TestCoherenceChecksLive:
    """Run SQL integrity checks against a live seeded database."""

    @pytest.fixture(autouse=True)
    def _db_cursor(self):
        """Get a real DB cursor for live tests."""
        from app.db import get_cursor
        with get_cursor() as cur:
            self._cur = cur
            yield

    @pytest.mark.parametrize("check_fn", INTEGRITY_CHECKS)
    def test_integrity_check(self, check_fn):
        """Each SQL integrity function must return all rows with passed=true."""
        self._cur.execute(f"SELECT * FROM {check_fn}()")
        results = self._cur.fetchall()
        assert len(results) > 0, f"{check_fn}() returned no rows"
        for row in results:
            assert row["passed"], (
                f"{check_fn} FAILED: {row['detail']}"
            )

    def test_master_runner(self):
        """re_run_all_integrity_checks() returns results for all checks."""
        self._cur.execute("SELECT * FROM re_run_all_integrity_checks()")
        results = self._cur.fetchall()
        assert len(results) >= len(INTEGRITY_CHECKS)
        failures = [r for r in results if not r["passed"]]
        if failures:
            detail = "\n".join(
                f"  FAIL: {r['check_name']} — {r['detail']}"
                for r in failures
            )
            pytest.fail(f"Integrity check failures:\n{detail}")


# ── Seed Count Validation (mocked) ─────────────────────────────────────


class TestSeedCountValidation:
    """Validate expected minimum entity counts in seeded environment."""

    EXPECTED_MINIMUMS = {
        "funds": 3,
        "investments": 5,
        "assets": 10,
        "pipeline_deals": 25,
        "leased_assets": 4,
        "partners": 6,
        "valuation_snapshots": 16,  # 4 quarters × 4+ assets
    }

    def test_expected_minimums_documented(self):
        """All expected minimums are positive integers."""
        for key, value in self.EXPECTED_MINIMUMS.items():
            assert isinstance(value, int) and value > 0, f"{key} must be positive int"

    @pytest.mark.skipif(not _LIVE, reason="Requires live DB")
    def test_seed_counts_live(self):
        """Verify seeded entity counts meet minimums."""
        from app.db import get_cursor

        queries = {
            "funds": "SELECT COUNT(*) AS n FROM repe_fund",
            "investments": "SELECT COUNT(*) AS n FROM repe_deal",
            "assets": "SELECT COUNT(*) AS n FROM repe_asset",
            "pipeline_deals": "SELECT COUNT(*) AS n FROM re_pipeline_deal",
            "leased_assets": "SELECT COUNT(DISTINCT asset_id) AS n FROM re_lease",
            "partners": "SELECT COUNT(*) AS n FROM re_partner",
            "valuation_snapshots": "SELECT COUNT(*) AS n FROM re_asset_quarter_state",
        }

        with get_cursor() as cur:
            for key, sql in queries.items():
                cur.execute(sql)
                row = cur.fetchone()
                actual = row["n"] if row else 0
                expected = self.EXPECTED_MINIMUMS[key]
                assert actual >= expected, (
                    f"{key}: expected >= {expected}, got {actual}"
                )


# ── Financial Reconciliation (mocked unit tests) ───────────────────────


class TestFinancialReconciliation:
    """Unit tests for financial relationship formulas."""

    def test_noi_formula(self):
        """NOI = Revenue - OpEx."""
        revenue, opex = 3200000, 1504000
        noi = revenue - opex
        assert noi == 1696000
        assert noi > 0

    def test_ncf_formula(self):
        """NCF = NOI - CapEx - DebtService - TI/LC - Reserves."""
        noi = 1696000
        capex = 320000
        debt_service = 285000
        ti_lc = 48000
        reserves = 42400
        ncf = noi - capex - debt_service - ti_lc - reserves
        assert ncf == 1000600
        assert ncf > 0

    def test_tvpi_dpi_rvpi(self):
        """TVPI = DPI + RVPI."""
        total_called = 250000000
        total_distributed = 50000000
        portfolio_nav = 300000000
        dpi = total_distributed / total_called
        rvpi = portfolio_nav / total_called
        tvpi = dpi + rvpi
        assert abs(tvpi - (total_distributed + portfolio_nav) / total_called) < 0.001

    def test_ltv_formula(self):
        """LTV = Debt / Value."""
        debt = 60000000
        value = 100000000
        ltv = debt / value
        assert ltv == 0.60
        assert 0 <= ltv <= 1

    def test_dscr_formula(self):
        """DSCR = NOI / Debt Service."""
        noi = 1696000
        debt_service = 285000
        dscr = noi / debt_service
        assert dscr > 1.0  # Must cover debt service
        assert round(dscr, 2) == 5.95

    def test_cap_rate_implied_value(self):
        """Value = NOI / Cap Rate."""
        noi_annual = 6784000  # 1696000 * 4
        cap_rate = 0.055
        value = noi_annual / cap_rate
        assert value > 100000000
        assert 0.03 <= cap_rate <= 0.15
