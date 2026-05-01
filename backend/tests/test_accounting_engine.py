"""Tests for backend/app/services/accounting_engine.py.

Two layers:

1. Pure-compute tests for `calculate_position_value` — no DB needed; pass
   dataclass records directly. Covers the math and every fail-closed branch.

2. Integration tests for `rollup_portfolio_value`, `calculate_nav`, and
   `calculate_pnl` — use the `db_conn` fixture against the real Postgres.
   Seed an isolated `__inv_test_acct__` env_id, run, assert, clean up.

Tests skip automatically if no Postgres is reachable (per conftest.db_conn).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.services.accounting_engine import (
    ERR_FUND_NOT_FOUND,
    ERR_INCOMPLETE_INPUTS,
    ERR_INCOMPLETE_LOTS,
    ERR_INVALID_PERIOD,
    ERR_MISSING_FX,
    ERR_MISSING_PRICE,
    ERR_PORTFOLIO_NOT_FOUND,
    FxRow,
    LotRow,
    PriceRow,
    calculate_nav,
    calculate_pnl,
    calculate_position_value,
    rollup_portfolio_value,
)

# ─────────────────────────────────────────────────────────────────────────────
# PURE COMPUTE TESTS — no DB
# ─────────────────────────────────────────────────────────────────────────────

LOT_ID = UUID("11111111-1111-4111-8111-111111111111")
ACCT_ID = UUID("22222222-2222-4222-8222-222222222222")
SEC_ID = UUID("33333333-3333-4333-8333-333333333333")
PRICE_ID = UUID("44444444-4444-4444-8444-444444444444")
FX_ID = UUID("55555555-5555-4555-8555-555555555555")


def _lot(qty: Decimal = Decimal("100")) -> LotRow:
    return LotRow(
        id=LOT_ID, account_id=ACCT_ID, security_id=SEC_ID,
        open_event_date=date(2026, 1, 1),
        open_qty_initial=qty, cost_basis_native=Decimal("15000"),
        cost_basis_currency="USD",
    )


def _price(security_id: UUID = SEC_ID, ccy: str = "USD",
           amount: Decimal = Decimal("150")) -> PriceRow:
    return PriceRow(
        id=PRICE_ID, security_id=security_id,
        price_date=date(2026, 4, 30),
        price_native=amount, price_currency=ccy,
    )


def _fx(from_ccy: str = "EUR", to_ccy: str = "USD",
        rate: Decimal = Decimal("1.10")) -> FxRow:
    return FxRow(
        id=FX_ID, from_ccy=from_ccy, to_ccy=to_ccy,
        rate_date=date(2026, 4, 30), rate=rate,
    )


class TestCalculatePositionValue:
    def test_happy_path_same_currency(self):
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("100"),
            price=_price(ccy="USD", amount=Decimal("150")),
            fx=None, target_currency="USD",
        )
        assert result["valid"] is True
        assert result["value"]["market_value_native"] == Decimal("15000")
        assert result["value"]["market_value_target"] == Decimal("15000")
        assert result["value"]["currency"] == "USD"
        assert result["value"]["fx_rate_id"] is None
        assert result["input_versions"]["lot"] == str(LOT_ID)
        assert result["input_versions"]["price"] == str(PRICE_ID)
        assert result["input_versions"]["fx"] is None

    def test_happy_path_with_fx(self):
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("100"),
            price=_price(ccy="EUR", amount=Decimal("150")),
            fx=_fx(from_ccy="EUR", to_ccy="USD", rate=Decimal("1.10")),
            target_currency="USD",
        )
        assert result["valid"] is True
        assert result["value"]["market_value_native"] == Decimal("15000")
        assert result["value"]["market_value_target"] == Decimal("16500.00")
        assert result["value"]["fx_rate_id"] == str(FX_ID)
        assert result["input_versions"]["fx"] == str(FX_ID)

    def test_fail_closed_missing_fx(self):
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("100"),
            price=_price(ccy="EUR"),
            fx=None, target_currency="USD",
        )
        assert result["valid"] is False
        assert result["value"] is None
        assert len(result["errors"]) == 1
        assert result["errors"][0]["code"] == ERR_MISSING_FX

    def test_fail_closed_wrong_fx_pair(self):
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("100"),
            price=_price(ccy="EUR"),
            fx=_fx(from_ccy="GBP", to_ccy="USD"),  # wrong pair
            target_currency="USD",
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_MISSING_FX
        assert "expected" in result["errors"][0]["context"]

    def test_fail_closed_negative_qty(self):
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("-1"),
            price=_price(),
            fx=None, target_currency="USD",
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_INCOMPLETE_LOTS

    def test_fail_closed_security_mismatch(self):
        wrong_sec = UUID("99999999-9999-4999-8999-999999999999")
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("100"),
            price=_price(security_id=wrong_sec),
            fx=None, target_currency="USD",
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_INCOMPLETE_INPUTS

    def test_deterministic(self):
        # Same inputs → same outputs across many calls
        results = []
        for _ in range(50):
            r = calculate_position_value(
                lot=_lot(), open_qty=Decimal("100"),
                price=_price(ccy="EUR"),
                fx=_fx(rate=Decimal("1.10")),
                target_currency="USD",
            )
            results.append(r["value"]["market_value_target"])
        # All identical
        assert len(set(results)) == 1
        assert results[0] == Decimal("16500.00")

    def test_zero_qty(self):
        # Zero qty is valid (closed position) — produces zero market value
        result = calculate_position_value(
            lot=_lot(), open_qty=Decimal("0"),
            price=_price(),
            fx=None, target_currency="USD",
        )
        assert result["valid"] is True
        assert result["value"]["market_value_target"] == Decimal("0")


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRATION TESTS — real DB
# ─────────────────────────────────────────────────────────────────────────────

TEST_ENV = "__inv_test_acct__"
TEST_BUSINESS = "00000000-0000-4000-a000-000000000002"


@pytest.fixture
def seeded_fund(db_conn):
    """Seed a fund + portfolio + account + security + price + fx + trade + lot.

    Yields a dict with the IDs. Cleans up after.
    """
    cur = db_conn.cursor()
    # Insert via SQL (RLS bypassed for postgres role)
    cur.execute(
        """
        INSERT INTO inv_fund (env_id, business_id, name, inception_date, base_currency, lot_relief_method)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, "Test Fund", "2026-01-01", "USD", "fifo"),
    )
    fund_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_portfolio (env_id, business_id, fund_id, name, currency)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, fund_id, "Main", "USD"),
    )
    portfolio_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_account (env_id, business_id, portfolio_id, name, base_currency)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, portfolio_id, "Custody", "USD"),
    )
    account_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_security (env_id, business_id, ticker, asset_class, currency)
        VALUES (%s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, f"TEST.{uuid4().hex[:6]}", "equity", "USD"),
    )
    security_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_fx_rate (env_id, business_id, from_ccy, to_ccy, rate_date, rate, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, "USD", "USD", "2026-04-30", "1.0", "wm_reuters_4pm"),
    )
    fx_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_security_price (env_id, business_id, security_id, price_date, price_native, price_currency, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, security_id, "2026-04-30", "150.00", "USD", "test_source"),
    )
    price_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_trade (env_id, business_id, account_id, security_id, side, qty, price_native, price_currency, effective_date, booking_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, account_id, security_id, "buy", "100", "150.00", "USD", "2026-04-30", "2026-04-30"),
    )
    trade_id = cur.fetchone()["id"]

    cur.execute(
        """
        INSERT INTO inv_position_lot (env_id, business_id, account_id, security_id, open_event_id, open_event_date, open_qty_initial, cost_basis_native, cost_basis_currency, fx_rate_id_at_open)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """,
        (TEST_ENV, TEST_BUSINESS, account_id, security_id, trade_id, "2026-04-30", "100", "15000.00", "USD", fx_id),
    )
    lot_id = cur.fetchone()["id"]

    db_conn.commit()

    yield {
        "fund_id": fund_id,
        "portfolio_id": portfolio_id,
        "account_id": account_id,
        "security_id": security_id,
        "price_id": price_id,
        "fx_id": fx_id,
        "trade_id": trade_id,
        "lot_id": lot_id,
    }

    # Teardown
    cur = db_conn.cursor()
    cur.execute("ALTER TABLE inv_nav_snapshot DISABLE TRIGGER trg_inv_nav_block_released")
    for tbl in [
        "inv_position_lot_relief", "inv_position_lot", "inv_trade",
        "inv_security_price", "inv_fx_rate", "inv_security",
        "inv_account", "inv_portfolio", "inv_accrual", "inv_cash_movement",
        "inv_nav_snapshot", "inv_pnl_snapshot", "inv_position_valuation",
        "inv_fund",
    ]:
        cur.execute(f"DELETE FROM {tbl} WHERE env_id = %s", (TEST_ENV,))
    cur.execute("ALTER TABLE inv_nav_snapshot ENABLE TRIGGER trg_inv_nav_block_released")
    db_conn.commit()


class TestRollupPortfolioValue:
    def test_happy_path(self, seeded_fund):
        result = rollup_portfolio_value(
            env_id=TEST_ENV,
            portfolio_id=seeded_fund["portfolio_id"],
            as_of_date=date(2026, 4, 30),
        )
        assert result["valid"] is True, result["errors"]
        assert result["value"]["total_value"] == Decimal("15000.00000000")
        assert result["value"]["currency"] == "USD"
        assert result["value"]["position_count"] == 1
        assert seeded_fund["price_id"] in [UUID(s) for s in result["input_versions"]["prices"]]

    def test_fail_closed_portfolio_not_found(self, db_conn):
        result = rollup_portfolio_value(
            env_id=TEST_ENV,
            portfolio_id=uuid4(),
            as_of_date=date(2026, 4, 30),
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_PORTFOLIO_NOT_FOUND

    def test_fail_closed_missing_price(self, seeded_fund, db_conn):
        # Mark the price superseded so no current row remains
        cur = db_conn.cursor()
        cur.execute(
            "UPDATE inv_security_price SET superseded_by_id = id WHERE id = %s",
            (seeded_fund["price_id"],),
        )
        db_conn.commit()
        try:
            result = rollup_portfolio_value(
                env_id=TEST_ENV,
                portfolio_id=seeded_fund["portfolio_id"],
                as_of_date=date(2026, 4, 30),
            )
            assert result["valid"] is False
            assert any(e["code"] == ERR_MISSING_PRICE for e in result["errors"])
        finally:
            cur.execute(
                "UPDATE inv_security_price SET superseded_by_id = NULL WHERE id = %s",
                (seeded_fund["price_id"],),
            )
            db_conn.commit()


class TestCalculateNAV:
    def test_happy_path(self, seeded_fund):
        result = calculate_nav(
            env_id=TEST_ENV,
            fund_id=seeded_fund["fund_id"],
            as_of_date=date(2026, 4, 30),
        )
        assert result["valid"] is True, result["errors"]
        v = result["value"]
        # No cash, no liabilities — NAV equals portfolio value
        assert v["total_assets"] == Decimal("15000.00000000")
        assert v["total_liabilities"] == Decimal("0")
        assert v["nav"] == Decimal("15000.00000000")
        assert v["currency"] == "USD"

    def test_with_cash_and_fees(self, seeded_fund, db_conn):
        cur = db_conn.cursor()
        # Add $5,000 contribution
        cur.execute(
            """
            INSERT INTO inv_cash_movement (env_id, business_id, account_id, movement_type, amount_native, currency, effective_date, booking_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["account_id"], "contribution", "5000.00", "USD", "2026-04-30", "2026-04-30"),
        )
        # Add $250 unpaid management fee
        cur.execute(
            """
            INSERT INTO inv_accrual (env_id, business_id, account_id, accrual_type, amount_native, currency, effective_date, booking_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["account_id"], "management_fee", "250.00", "USD", "2026-04-30", "2026-04-30"),
        )
        db_conn.commit()
        result = calculate_nav(
            env_id=TEST_ENV,
            fund_id=seeded_fund["fund_id"],
            as_of_date=date(2026, 4, 30),
        )
        assert result["valid"] is True, result["errors"]
        v = result["value"]
        # 15000 (positions) + 5000 (cash) - 250 (fees) = 19750
        assert v["total_assets"] == Decimal("20000.00000000")
        assert v["total_liabilities"] == Decimal("250.00000000")
        assert v["nav"] == Decimal("19750.00000000")

    def test_fail_closed_fund_not_found(self, db_conn):
        result = calculate_nav(
            env_id=TEST_ENV,
            fund_id=uuid4(),
            as_of_date=date(2026, 4, 30),
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_FUND_NOT_FOUND

    def test_deterministic(self, seeded_fund):
        # Same inputs → same NAV across many calls
        navs = []
        for _ in range(10):
            r = calculate_nav(
                env_id=TEST_ENV,
                fund_id=seeded_fund["fund_id"],
                as_of_date=date(2026, 4, 30),
            )
            navs.append(r["value"]["nav"])
        assert len(set(navs)) == 1


class TestCalculatePnL:
    def test_happy_path_no_activity(self, seeded_fund):
        # No reliefs, no accruals in period — P&L = 0
        result = calculate_pnl(
            env_id=TEST_ENV,
            fund_id=seeded_fund["fund_id"],
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        assert result["valid"] is True, result["errors"]
        v = result["value"]
        assert v["realized_pnl"] == Decimal("0")
        assert v["income"] == Decimal("0")
        assert v["fees"] == Decimal("0")
        assert v["total_pnl"] == Decimal("0")
        assert v["unrealized_pnl"] is None
        assert v["unrealized_pnl_reason"] == "out_of_scope_v1"

    def test_with_realized_and_income(self, seeded_fund, db_conn):
        cur = db_conn.cursor()
        # Sell trade + relief = $500 realized gain
        cur.execute(
            """
            INSERT INTO inv_trade (env_id, business_id, account_id, security_id, side, qty, price_native, price_currency, effective_date, booking_date)
            VALUES (%s, %s, %s, %s, 'sell', %s, %s, %s, %s, %s) RETURNING id
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["account_id"], seeded_fund["security_id"], "10", "200.00", "USD", "2026-04-15", "2026-04-15"),
        )
        sell_trade_id = cur.fetchone()["id"]
        cur.execute(
            """
            INSERT INTO inv_position_lot_relief (env_id, business_id, lot_id, qty_relieved, relief_event_id, relief_event_date, relief_method, realized_pnl_native, realized_pnl_currency)
            VALUES (%s, %s, %s, %s, %s, %s, 'fifo', %s, 'USD')
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["lot_id"], "10", sell_trade_id, "2026-04-15", "500.00"),
        )
        # $100 dividend
        cur.execute(
            """
            INSERT INTO inv_accrual (env_id, business_id, account_id, security_id, accrual_type, amount_native, currency, effective_date, booking_date)
            VALUES (%s, %s, %s, %s, 'dividend', %s, %s, %s, %s)
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["account_id"], seeded_fund["security_id"], "100.00", "USD", "2026-04-20", "2026-04-20"),
        )
        # $50 management fee
        cur.execute(
            """
            INSERT INTO inv_accrual (env_id, business_id, account_id, accrual_type, amount_native, currency, effective_date, booking_date)
            VALUES (%s, %s, %s, 'management_fee', %s, %s, %s, %s)
            """,
            (TEST_ENV, TEST_BUSINESS, seeded_fund["account_id"], "50.00", "USD", "2026-04-25", "2026-04-25"),
        )
        db_conn.commit()
        result = calculate_pnl(
            env_id=TEST_ENV,
            fund_id=seeded_fund["fund_id"],
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        assert result["valid"] is True, result["errors"]
        v = result["value"]
        assert v["realized_pnl"] == Decimal("500.00000000")
        assert v["income"] == Decimal("100.00000000")
        assert v["fees"] == Decimal("50.00000000")
        assert v["total_pnl"] == Decimal("550.00000000")  # 500 + 100 - 50

    def test_fail_closed_invalid_period(self, seeded_fund):
        result = calculate_pnl(
            env_id=TEST_ENV,
            fund_id=seeded_fund["fund_id"],
            start_date=date(2026, 4, 30),
            end_date=date(2026, 4, 1),  # end before start
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_INVALID_PERIOD

    def test_fail_closed_fund_not_found(self, db_conn):
        result = calculate_pnl(
            env_id=TEST_ENV,
            fund_id=uuid4(),
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        assert result["valid"] is False
        assert result["errors"][0]["code"] == ERR_FUND_NOT_FOUND
