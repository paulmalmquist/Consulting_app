"""Tests for the RE v2 append-only capital ledger.

Verifies immutability, reversal pattern, and balance computation.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from tests.conftest import FakeCursor
from app.services import re_capital_ledger


class TestRecordEntry:
    """Append-only entry creation."""

    def test_basic_contribution(self, fake_cursor: FakeCursor):
        fund_id = uuid4()
        partner_id = uuid4()
        entry_id = str(uuid4())

        fake_cursor.push_result([{
            "entry_id": entry_id,
            "fund_id": str(fund_id),
            "investment_id": None,
            "jv_id": None,
            "partner_id": str(partner_id),
            "entry_type": "contribution",
            "amount": "10000000.000000000000",
            "currency": "USD",
            "fx_rate_to_base": "1.000000000000",
            "amount_base": "10000000.000000000000",
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
            "memo": "First capital call",
            "source": "manual",
            "source_ref": None,
            "run_id": None,
            "created_at": "2026-03-31T00:00:00",
        }])

        result = re_capital_ledger.record_entry(
            fund_id=fund_id,
            partner_id=partner_id,
            entry_type="contribution",
            amount=Decimal("10000000"),
            effective_date="2026-03-31",
            quarter="2026Q1",
            memo="First capital call",
        )
        assert result["entry_type"] == "contribution"
        assert result["amount"] == "10000000.000000000000"

    def test_fx_conversion(self, fake_cursor: FakeCursor):
        """amount_base should be amount * fx_rate_to_base."""
        fund_id = uuid4()
        partner_id = uuid4()

        fake_cursor.push_result([{
            "entry_id": str(uuid4()),
            "fund_id": str(fund_id),
            "investment_id": None,
            "jv_id": None,
            "partner_id": str(partner_id),
            "entry_type": "contribution",
            "amount": "1000000.000000000000",
            "currency": "EUR",
            "fx_rate_to_base": "1.100000000000",
            "amount_base": "1100000.000000000000",
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
            "memo": None,
            "source": "manual",
            "source_ref": None,
            "run_id": None,
            "created_at": "2026-03-31T00:00:00",
        }])

        result = re_capital_ledger.record_entry(
            fund_id=fund_id,
            partner_id=partner_id,
            entry_type="contribution",
            amount=Decimal("1000000"),
            effective_date="2026-03-31",
            quarter="2026Q1",
            currency="EUR",
            fx_rate_to_base=Decimal("1.1"),
        )
        assert result["currency"] == "EUR"
        assert result["amount_base"] == "1100000.000000000000"


class TestReversal:
    """Reversals create new entries with negated amounts."""

    def test_reversal_creates_negative_entry(self, fake_cursor: FakeCursor):
        original_id = uuid4()
        fund_id = str(uuid4())
        partner_id = str(uuid4())

        # fetchone: original entry
        fake_cursor.push_result([{
            "entry_id": str(original_id),
            "fund_id": fund_id,
            "investment_id": None,
            "jv_id": None,
            "partner_id": partner_id,
            "entry_type": "contribution",
            "amount": "5000000",
            "currency": "USD",
            "fx_rate_to_base": "1.0",
            "amount_base": "5000000",
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
            "memo": "Call 1",
            "source": "manual",
            "source_ref": None,
            "run_id": None,
        }])
        # fetchone: INSERT RETURNING (reversal)
        fake_cursor.push_result([{
            "entry_id": str(uuid4()),
            "fund_id": fund_id,
            "investment_id": None,
            "jv_id": None,
            "partner_id": partner_id,
            "entry_type": "reversal",
            "amount": "-5000000.000000000000",
            "currency": "USD",
            "fx_rate_to_base": "1.0",
            "amount_base": "-5000000.000000000000",
            "effective_date": "2026-03-31",
            "quarter": "2026Q1",
            "memo": f"Reversal of {original_id}",
            "source": "generated",
            "source_ref": str(original_id),
            "run_id": None,
            "created_at": "2026-03-31T00:00:00",
        }])

        result = re_capital_ledger.record_reversal(original_entry_id=original_id)
        assert result["entry_type"] == "reversal"
        assert Decimal(result["amount"]) < 0
        assert result["source"] == "generated"
        assert result["source_ref"] == str(original_id)

    def test_reversal_not_found(self, fake_cursor: FakeCursor):
        fake_cursor.push_result([])  # No original found

        try:
            re_capital_ledger.record_reversal(original_entry_id=uuid4())
            assert False, "Should have raised LookupError"
        except LookupError:
            pass


class TestComputeBalances:
    """Balance aggregation by entry type."""

    def test_balance_aggregation(self, fake_cursor: FakeCursor):
        fund_id = uuid4()
        partner_id = uuid4()

        fake_cursor.push_result([{
            "total_committed": "50000000",
            "total_contributed": "30000000",
            "total_distributed": "5000000",
            "total_fees": "500000",
            "total_reversals": "0",
            "net_balance": "85500000",
        }])

        result = re_capital_ledger.compute_balances(
            fund_id=fund_id, partner_id=partner_id, as_of_quarter="2026Q1"
        )
        assert result["total_committed"] == "50000000"
        assert result["total_contributed"] == "30000000"
        assert result["total_distributed"] == "5000000"


class TestComputeFundTotals:
    """Fund-level totals for rollup inputs."""

    def test_fund_totals(self, fake_cursor: FakeCursor):
        fund_id = uuid4()

        fake_cursor.push_result([{
            "total_committed": "100000000",
            "total_called": "60000000",
            "total_distributed": "10000000",
        }])

        result = re_capital_ledger.compute_fund_totals(
            fund_id=fund_id, as_of_quarter="2026Q1"
        )
        assert result["total_committed"] == "100000000"
        assert result["total_called"] == "60000000"
        assert result["total_distributed"] == "10000000"


class TestGetLedger:
    """Ledger query with optional filters."""

    def test_filter_by_quarter(self, fake_cursor: FakeCursor):
        fund_id = uuid4()

        fake_cursor.push_result([
            {"entry_id": str(uuid4()), "entry_type": "contribution", "quarter": "2026Q1"},
        ])

        entries = re_capital_ledger.get_ledger(fund_id=fund_id, quarter="2026Q1")
        assert len(entries) == 1

        # Verify the SQL included quarter filter
        sql = fake_cursor.queries[0][0]
        assert "quarter" in sql

    def test_filter_by_partner(self, fake_cursor: FakeCursor):
        fund_id = uuid4()
        partner_id = uuid4()

        fake_cursor.push_result([])

        entries = re_capital_ledger.get_ledger(fund_id=fund_id, partner_id=partner_id)
        assert len(entries) == 0

        sql = fake_cursor.queries[0][0]
        assert "partner_id" in sql
