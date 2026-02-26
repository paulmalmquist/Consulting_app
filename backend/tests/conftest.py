"""Shared fixtures for Business OS backend tests.

These tests mock the database layer so they run without Postgres.
For integration tests that need a real DB, see tests/integration/.
"""

import os
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
pytest_plugins = ("tests.plugins.repe_logging",)

# Ensure DATABASE_URL is set before importing app modules
# (config.py exits if missing)
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("AI_MODE", "off")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


class FakeCursor:
    """In-memory cursor that records queries and returns canned results."""

    def __init__(self):
        self.queries: list[tuple[str, tuple]] = []
        self._results: list[list[dict]] = []
        self._result_idx = 0
        self.rowcount = 1

    def push_result(self, rows: list[dict]):
        """Queue a result set for the next execute() call."""
        self._results.append(rows)

    def execute(self, sql: str, params=None):
        self.queries.append((sql, params))
        return self

    def fetchone(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            if rows:
                return rows[0]
            self.rowcount = 0
            return None
        return None

    def fetchall(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            return rows
        return []


# All modules that import get_cursor — must be patched at each import site
_GET_CURSOR_TARGETS = [
    "app.db.get_cursor",
    "app.services.business.get_cursor",
    "app.services.documents.get_cursor",
    "app.services.executions.get_cursor",
    "app.services.finance_runtime.get_cursor",
    "app.services.finance_repe.get_cursor",
    "app.services.finance_legal.get_cursor",
    "app.services.finance_healthcare.get_cursor",
    "app.services.finance_construction.get_cursor",
    "app.services.finance_scenarios.get_cursor",
    "app.services.work.get_cursor",
    "app.services.audit.get_cursor",
    "app.services.compliance.get_cursor",
    "app.services.extraction.get_cursor",
    "app.services.metrics_semantic.get_cursor",
    "app.services.materialization.get_cursor",
    "app.services.reports.get_cursor",
    "app.services.crm.get_cursor",
    "app.services.underwriting.get_cursor",
    "app.services.real_estate.get_cursor",
    "app.services.repe.get_cursor",
    "app.services.re_valuation.get_cursor",
    "app.services.re_waterfall.get_cursor",
    "app.services.re_capital_accounts.get_cursor",
    "app.services.re_fund_aggregation.get_cursor",
    "app.services.re_refinance.get_cursor",
    "app.services.re_stress.get_cursor",
    "app.services.re_surveillance.get_cursor",
    "app.services.re_monte_carlo.get_cursor",
    "app.services.re_risk_scoring.get_cursor",
    "app.services.re_reports.get_cursor",
    "app.services.repe_context.get_cursor",
    "app.services.env_context.get_cursor",
    "app.services.pds.get_cursor",
    "app.services.credit.get_cursor",
    "app.services.legal_ops.get_cursor",
    "app.services.medoffice.get_cursor",
    "app.services.re_investment.get_cursor",
    "app.services.re_jv.get_cursor",
    "app.services.re_partner.get_cursor",
    "app.services.re_capital_ledger.get_cursor",
    "app.services.re_cashflow_ledger.get_cursor",
    "app.services.re_rollup.get_cursor",
    "app.services.re_metrics.get_cursor",
    "app.services.re_scenario.get_cursor",
    "app.services.re_provenance.get_cursor",
    "app.services.re_waterfall_runtime.get_cursor",
    "app.services.re_quarter_close.get_cursor",
    "app.services.re_accounting.get_cursor",
    "app.services.re_budget.get_cursor",
    "app.services.re_variance.get_cursor",
    "app.services.re_fund_metrics.get_cursor",
    "app.services.re_debt_surveillance.get_cursor",
    "app.services.re_run_engine.get_cursor",
]


@pytest.fixture
def fake_cursor():
    """Provide a FakeCursor and patch get_cursor everywhere it's imported."""
    cur = FakeCursor()

    @contextmanager
    def _mock_get_cursor():
        yield cur

    patches = [patch(target, _mock_get_cursor) for target in _GET_CURSOR_TARGETS]
    for p in patches:
        p.start()
    yield cur
    for p in patches:
        p.stop()


@pytest.fixture
def fake_storage():
    """Mock the SupabaseStorageRepository used by document routes."""
    mock = MagicMock()
    mock.generate_signed_upload_url.return_value = "https://storage.test/upload?token=abc"
    mock.generate_signed_download_url.return_value = "https://storage.test/download?token=xyz"
    with patch("app.services.documents._storage", mock):
        yield mock
