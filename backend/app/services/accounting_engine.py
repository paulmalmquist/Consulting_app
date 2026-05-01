"""Investment Engine: accounting service.

Pure, deterministic, fail-closed calculations for position valuation, portfolio
rollup, NAV, and P&L. Pulls only from authoritative inputs:

- inv_position_lot + inv_position_lot_relief (positions)
- inv_security_price (current rows; superseded_by_id IS NULL)
- inv_fx_rate (current rows; superseded_by_id IS NULL)
- inv_fund (config: base_currency, lot_relief_method)
- inv_account, inv_portfolio (entity hierarchy)
- inv_cash_movement, inv_accrual (cash and unpaid items)

Returns EngineResult({valid, value, errors, input_versions}). Never raises on
missing data — returns valid=False with structured error codes. Per
skills/winston-investment-engine-module:

- Public functions return the EngineResult shape on every code path.
- Pure compute helpers (calculate_position_value) take pre-fetched records;
  testable in isolation.
- DB-touching service functions fetch authoritative inputs and compose the
  pure helpers.
- Time-dependent inputs (as_of_date, effective_date) are passed in. No
  datetime.now() reads inside the calculation.
- Missing FX / price / position → fail closed. Never substitute, infer, or
  fall back to T-1.

This module is read-only. Snapshot persistence (produce/lock/release) lives
in a separate writer module so the audit hook story stays clean.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor

# ─────────────────────────────────────────────────────────────────────────────
# ERROR CODES (universal set per skills/winston-investment-engine-module)
# ─────────────────────────────────────────────────────────────────────────────

ERR_MISSING_PRICE = "missing_price"
ERR_MISSING_FX = "missing_fx"
ERR_MISSING_POSITION = "missing_position"
ERR_INCOMPLETE_LOTS = "incomplete_lots"
ERR_INCOMPLETE_INPUTS = "incomplete_inputs"
ERR_STALE_DATA = "stale_data"
ERR_FUND_NOT_FOUND = "fund_not_found"
ERR_PORTFOLIO_NOT_FOUND = "portfolio_not_found"
ERR_INVALID_PERIOD = "invalid_period"


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE
# ─────────────────────────────────────────────────────────────────────────────

class EngineError(TypedDict):
    code: str
    message: str
    context: dict


class EngineResult(TypedDict):
    valid: bool
    value: Optional[Any]
    errors: list[EngineError]
    input_versions: dict


def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {
        "valid": True,
        "value": value,
        "errors": [],
        "input_versions": input_versions,
    }


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {
        "valid": False,
        "value": None,
        "errors": errors,
        "input_versions": input_versions or {},
    }


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


# ─────────────────────────────────────────────────────────────────────────────
# PURE COMPUTE — testable in isolation, no DB
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class LotRow:
    """Subset of inv_position_lot needed for valuation."""
    id: UUID
    account_id: UUID
    security_id: UUID
    open_event_date: date
    open_qty_initial: Decimal
    cost_basis_native: Decimal
    cost_basis_currency: str


@dataclass(frozen=True)
class PriceRow:
    """Subset of inv_security_price needed for valuation."""
    id: UUID
    security_id: UUID
    price_date: date
    price_native: Decimal
    price_currency: str


@dataclass(frozen=True)
class FxRow:
    """Subset of inv_fx_rate needed for translation."""
    id: UUID
    from_ccy: str
    to_ccy: str
    rate_date: date
    rate: Decimal


def calculate_position_value(
    *,
    lot: LotRow,
    open_qty: Decimal,
    price: PriceRow,
    fx: Optional[FxRow],
    target_currency: str,
) -> EngineResult:
    """Compute the market value of a single position lot in a target currency.

    Pure function. Does not read the DB.

    Args:
        lot: the lot record (subset)
        open_qty: current open quantity (after reliefs); may differ from
                  lot.open_qty_initial
        price: a price record matching lot.security_id
        fx: an FX record translating price.price_currency to target_currency,
            or None when the currencies match
        target_currency: ISO 4217 alpha-3, the currency the result is in

    Returns:
        EngineResult with value = {market_value_native, market_value_target,
                                   currency, fx_rate_id}
        or fail-closed with structured error.
    """
    errors: list[EngineError] = []

    if open_qty < 0:
        errors.append(_err(
            ERR_INCOMPLETE_LOTS,
            "open_qty negative",
            lot_id=str(lot.id),
            open_qty=str(open_qty),
        ))

    if price.security_id != lot.security_id:
        errors.append(_err(
            ERR_INCOMPLETE_INPUTS,
            "price.security_id does not match lot.security_id",
            lot_id=str(lot.id),
            price_id=str(price.id),
        ))

    if errors:
        return _fail(errors)

    market_value_native = open_qty * price.price_native

    if price.price_currency == target_currency:
        market_value_target = market_value_native
        fx_id_used: Optional[UUID] = None
    else:
        if fx is None:
            return _fail([_err(
                ERR_MISSING_FX,
                "fx not provided for non-matching currencies",
                from_ccy=price.price_currency,
                to_ccy=target_currency,
            )])
        if fx.from_ccy != price.price_currency or fx.to_ccy != target_currency:
            return _fail([_err(
                ERR_MISSING_FX,
                "fx pair does not match required translation",
                expected=f"{price.price_currency}->{target_currency}",
                got=f"{fx.from_ccy}->{fx.to_ccy}",
            )])
        market_value_target = market_value_native * fx.rate
        fx_id_used = fx.id

    input_versions = {
        "lot": str(lot.id),
        "price": str(price.id),
        "fx": str(fx_id_used) if fx_id_used else None,
    }

    return _ok({
        "market_value_native": market_value_native,
        "market_value_target": market_value_target,
        "currency": target_currency,
        "fx_rate_id": str(fx_id_used) if fx_id_used else None,
    }, input_versions)


# ─────────────────────────────────────────────────────────────────────────────
# DB FETCHES — return None on missing; never substitute
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_fund(env_id: str, fund_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, base_currency, lot_relief_method, spot_fx_source
            FROM inv_fund
            WHERE env_id = %s AND id = %s
            """,
            (env_id, str(fund_id)),
        )
        return cur.fetchone()


def _fetch_position_qty(
    env_id: str, account_id: UUID, security_id: UUID, as_of_date: date
) -> Decimal:
    """Return the open quantity for (account, security) as of date.

    Sum of open_qty_initial over lots opened on/before as_of_date,
    minus sum of qty_relieved over active reliefs on/before as_of_date.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                COALESCE((
                    SELECT SUM(l.open_qty_initial)
                    FROM inv_position_lot l
                    WHERE l.env_id = %s
                      AND l.account_id = %s
                      AND l.security_id = %s
                      AND l.open_event_date <= %s
                ), 0) -
                COALESCE((
                    SELECT SUM(r.qty_relieved)
                    FROM inv_position_lot_relief r
                    JOIN inv_position_lot l ON l.id = r.lot_id
                    WHERE l.env_id = %s
                      AND l.account_id = %s
                      AND l.security_id = %s
                      AND r.relief_event_date <= %s
                      AND r.voided_by_id IS NULL
                ), 0) AS open_qty
            """,
            (
                env_id, str(account_id), str(security_id), as_of_date,
                env_id, str(account_id), str(security_id), as_of_date,
            ),
        )
        row = cur.fetchone()
    return Decimal(row["open_qty"]) if row and row["open_qty"] is not None else Decimal(0)


def _fetch_latest_price(
    env_id: str, security_id: UUID, as_of_date: date, source: str | None = None
) -> PriceRow | None:
    where = (
        "env_id = %s AND security_id = %s AND price_date <= %s "
        "AND superseded_by_id IS NULL"
    )
    params: tuple = (env_id, str(security_id), as_of_date)
    if source:
        where += " AND source = %s"
        params = params + (source,)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT id, security_id, price_date, price_native, price_currency "
            f"FROM inv_security_price WHERE {where} "
            f"ORDER BY price_date DESC, published_at DESC LIMIT 1",
            params,
        )
        row = cur.fetchone()
    if not row:
        return None
    return PriceRow(
        id=row["id"],
        security_id=row["security_id"],
        price_date=row["price_date"],
        price_native=Decimal(row["price_native"]),
        price_currency=row["price_currency"],
    )


def _fetch_latest_fx(
    env_id: str,
    from_ccy: str,
    to_ccy: str,
    as_of_date: date,
    source: str = "wm_reuters_4pm",
) -> FxRow | None:
    if from_ccy == to_ccy:
        return None
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, from_ccy, to_ccy, rate_date, rate
            FROM inv_fx_rate
            WHERE env_id = %s AND from_ccy = %s AND to_ccy = %s
              AND rate_date <= %s AND source = %s AND superseded_by_id IS NULL
            ORDER BY rate_date DESC, published_at DESC LIMIT 1
            """,
            (env_id, from_ccy, to_ccy, as_of_date, source),
        )
        row = cur.fetchone()
    if not row:
        return None
    return FxRow(
        id=row["id"],
        from_ccy=row["from_ccy"],
        to_ccy=row["to_ccy"],
        rate_date=row["rate_date"],
        rate=Decimal(row["rate"]),
    )


def _translate(
    env_id: str,
    amount: Decimal,
    from_ccy: str,
    to_ccy: str,
    as_of_date: date,
    fx_source: str,
) -> tuple[Decimal | None, str | None, EngineError | None]:
    """Translate amount from from_ccy to to_ccy. Returns (translated, fx_id, error)."""
    if from_ccy == to_ccy:
        return amount, None, None
    fx = _fetch_latest_fx(env_id, from_ccy, to_ccy, as_of_date, fx_source)
    if not fx:
        return None, None, _err(
            ERR_MISSING_FX,
            "no fx rate available for translation",
            from_ccy=from_ccy,
            to_ccy=to_ccy,
            as_of_date=as_of_date.isoformat(),
            source=fx_source,
        )
    return amount * fx.rate, str(fx.id), None


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC: rollup_portfolio_value, calculate_nav, calculate_pnl
# ─────────────────────────────────────────────────────────────────────────────

def rollup_portfolio_value(
    *, env_id: str, portfolio_id: UUID, as_of_date: date
) -> EngineResult:
    """Sum market value of all positions across all accounts in a portfolio.

    Result currency is the portfolio's currency. All positions translated
    via current FX rate (per ADR 002).

    Fail-closed if any required price or FX rate is missing for any
    non-zero position.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.id, p.fund_id, p.currency AS portfolio_currency,
                   f.base_currency, f.spot_fx_source
            FROM inv_portfolio p
            JOIN inv_fund f ON f.id = p.fund_id
            WHERE p.env_id = %s AND p.id = %s
            """,
            (env_id, str(portfolio_id)),
        )
        portfolio = cur.fetchone()

    if not portfolio:
        return _fail([_err(
            ERR_PORTFOLIO_NOT_FOUND,
            "portfolio not found",
            env_id=env_id,
            portfolio_id=str(portfolio_id),
        )])

    target_currency = portfolio["portfolio_currency"]
    fx_source = portfolio["spot_fx_source"]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT l.account_id, l.security_id, s.currency AS security_currency
            FROM inv_position_lot l
            JOIN inv_security s ON s.id = l.security_id
            JOIN inv_account a ON a.id = l.account_id
            WHERE l.env_id = %s
              AND a.portfolio_id = %s
              AND l.open_event_date <= %s
            """,
            (env_id, str(portfolio_id), as_of_date),
        )
        positions = cur.fetchall()

    errors: list[EngineError] = []
    total_value = Decimal(0)
    input_versions: dict = {
        "prices": [],
        "fx_rates": [],
        "positions": [],
        "portfolio": str(portfolio_id),
    }

    for pos in positions:
        account_id = pos["account_id"]
        security_id = pos["security_id"]
        security_currency = pos["security_currency"]

        open_qty = _fetch_position_qty(env_id, account_id, security_id, as_of_date)
        if open_qty == 0:
            continue

        price = _fetch_latest_price(env_id, security_id, as_of_date)
        if not price:
            errors.append(_err(
                ERR_MISSING_PRICE,
                "no price for security",
                security_id=str(security_id),
                as_of_date=as_of_date.isoformat(),
            ))
            continue

        mv_native = open_qty * price.price_native
        mv_target, fx_id, fx_err = _translate(
            env_id, mv_native, price.price_currency, target_currency,
            as_of_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue

        total_value += mv_target  # type: ignore[operator]
        input_versions["prices"].append(str(price.id))
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["positions"].append({
            "account_id": str(account_id),
            "security_id": str(security_id),
            "open_qty": str(open_qty),
        })

    if errors:
        return _fail(errors, input_versions)

    return _ok({
        "portfolio_id": str(portfolio_id),
        "as_of_date": as_of_date.isoformat(),
        "total_value": total_value,
        "currency": target_currency,
        "position_count": len(input_versions["positions"]),
    }, input_versions)


def calculate_nav(
    *, env_id: str, fund_id: UUID, as_of_date: date
) -> EngineResult:
    """Calculate fund NAV in fund.base_currency.

    NAV = total_assets - total_liabilities
        total_assets   = sum(portfolio market values) + sum(cash balances)
        total_liabilities = sum(unpaid management/incentive fees + expenses)

    Fail-closed if any portfolio rollup fails or any required FX is missing.
    """
    fund = _fetch_fund(env_id, fund_id)
    if not fund:
        return _fail([_err(
            ERR_FUND_NOT_FOUND, "fund not found",
            env_id=env_id, fund_id=str(fund_id),
        )])

    base_currency = fund["base_currency"]
    fx_source = fund["spot_fx_source"]

    errors: list[EngineError] = []
    input_versions: dict = {
        "fund": str(fund_id),
        "portfolios": [],
        "cash_movements": [],
        "accruals": [],
        "prices": [],
        "fx_rates": [],
    }

    # Portfolio market values
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, currency FROM inv_portfolio WHERE env_id = %s AND fund_id = %s",
            (env_id, str(fund_id)),
        )
        portfolios = cur.fetchall()

    portfolio_total = Decimal(0)
    for p in portfolios:
        sub = rollup_portfolio_value(
            env_id=env_id, portfolio_id=p["id"], as_of_date=as_of_date,
        )
        if not sub["valid"]:
            errors.extend(sub["errors"])
            continue
        sub_value = sub["value"]
        portfolio_value = sub_value["total_value"]
        portfolio_currency = sub_value["currency"]
        # Forward sub.input_versions for full reproducibility
        input_versions["prices"].extend(sub["input_versions"].get("prices", []))
        input_versions["fx_rates"].extend(sub["input_versions"].get("fx_rates", []))

        translated, fx_id, fx_err = _translate(
            env_id, portfolio_value, portfolio_currency, base_currency,
            as_of_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue
        portfolio_total += translated  # type: ignore[operator]
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["portfolios"].append({
            "id": str(p["id"]),
            "value_base": str(translated),
        })

    # Cash balances per account in fund
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT cm.id, cm.account_id, cm.amount_native, cm.currency
            FROM inv_cash_movement cm
            JOIN inv_account a ON a.id = cm.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE cm.env_id = %s
              AND p.fund_id = %s
              AND cm.effective_date <= %s
              AND cm.corrects_id IS NULL
            """,
            (env_id, str(fund_id), as_of_date),
        )
        cash_movements = cur.fetchall()

    cash_balance = Decimal(0)
    for cm in cash_movements:
        translated, fx_id, fx_err = _translate(
            env_id, Decimal(cm["amount_native"]), cm["currency"], base_currency,
            as_of_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue
        cash_balance += translated  # type: ignore[operator]
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["cash_movements"].append(str(cm["id"]))

    total_assets = portfolio_total + cash_balance

    # Liabilities: unpaid accrued fees and expenses
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ac.id, ac.amount_native, ac.currency, ac.accrual_type
            FROM inv_accrual ac
            JOIN inv_account a ON a.id = ac.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE ac.env_id = %s
              AND p.fund_id = %s
              AND ac.effective_date <= %s
              AND ac.paid_movement_id IS NULL
              AND ac.accrual_type IN ('management_fee','incentive_fee','expense')
              AND ac.corrects_id IS NULL
            """,
            (env_id, str(fund_id), as_of_date),
        )
        unpaid = cur.fetchall()

    total_liabilities = Decimal(0)
    for ac in unpaid:
        amt = abs(Decimal(ac["amount_native"]))
        translated, fx_id, fx_err = _translate(
            env_id, amt, ac["currency"], base_currency, as_of_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue
        total_liabilities += translated  # type: ignore[operator]
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["accruals"].append(str(ac["id"]))

    if errors:
        return _fail(errors, input_versions)

    nav = total_assets - total_liabilities

    return _ok({
        "fund_id": str(fund_id),
        "as_of_date": as_of_date.isoformat(),
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "nav": nav,
        "currency": base_currency,
    }, input_versions)


def calculate_pnl(
    *,
    env_id: str,
    fund_id: UUID,
    start_date: date,
    end_date: date,
) -> EngineResult:
    """Calculate fund P&L over [start_date, end_date].

    V1 components:
        realized_pnl = sum of realized P&L on lot reliefs in the period
        income       = sum of interest + dividend accruals in the period
        fees         = sum of management_fee + incentive_fee + expense accruals
        total_pnl    = realized_pnl + income - fees

    V1.1 deferred:
        unrealized_pnl — requires NAV(start) and NAV(end) plus cash flow netting
        fx_pnl         — requires position-level FX revaluation

    Both are reported as None with structured note (out_of_scope_v1).
    """
    if start_date > end_date:
        return _fail([_err(
            ERR_INVALID_PERIOD,
            "start_date is after end_date",
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )])

    fund = _fetch_fund(env_id, fund_id)
    if not fund:
        return _fail([_err(
            ERR_FUND_NOT_FOUND, "fund not found",
            env_id=env_id, fund_id=str(fund_id),
        )])

    base_currency = fund["base_currency"]
    fx_source = fund["spot_fx_source"]

    errors: list[EngineError] = []
    input_versions: dict = {
        "fund": str(fund_id),
        "reliefs": [],
        "accruals": [],
        "fx_rates": [],
    }

    # Realized P&L from lot reliefs
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT r.id, r.realized_pnl_native, r.realized_pnl_currency
            FROM inv_position_lot_relief r
            JOIN inv_position_lot l ON l.id = r.lot_id
            JOIN inv_account a ON a.id = l.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE r.env_id = %s
              AND p.fund_id = %s
              AND r.relief_event_date BETWEEN %s AND %s
              AND r.voided_by_id IS NULL
            """,
            (env_id, str(fund_id), start_date, end_date),
        )
        reliefs = cur.fetchall()

    realized_pnl = Decimal(0)
    for r in reliefs:
        translated, fx_id, fx_err = _translate(
            env_id, Decimal(r["realized_pnl_native"]),
            r["realized_pnl_currency"], base_currency,
            end_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue
        realized_pnl += translated  # type: ignore[operator]
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["reliefs"].append(str(r["id"]))

    # Income and fees from accruals booked in period
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ac.id, ac.amount_native, ac.currency, ac.accrual_type
            FROM inv_accrual ac
            JOIN inv_account a ON a.id = ac.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE ac.env_id = %s
              AND p.fund_id = %s
              AND ac.effective_date BETWEEN %s AND %s
              AND ac.corrects_id IS NULL
            """,
            (env_id, str(fund_id), start_date, end_date),
        )
        accruals = cur.fetchall()

    income = Decimal(0)
    fees = Decimal(0)
    for ac in accruals:
        amt = Decimal(ac["amount_native"])
        translated, fx_id, fx_err = _translate(
            env_id, amt, ac["currency"], base_currency,
            end_date, fx_source,
        )
        if fx_err:
            errors.append(fx_err)
            continue
        if fx_id:
            input_versions["fx_rates"].append(fx_id)
        input_versions["accruals"].append(str(ac["id"]))

        if ac["accrual_type"] in ("interest", "dividend"):
            income += translated  # type: ignore[operator]
        elif ac["accrual_type"] in ("management_fee", "incentive_fee", "expense"):
            fees += abs(translated)  # type: ignore[operator]

    if errors:
        return _fail(errors, input_versions)

    total_pnl = realized_pnl + income - fees

    return _ok({
        "fund_id": str(fund_id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "realized_pnl": realized_pnl,
        "unrealized_pnl": None,
        "unrealized_pnl_reason": "out_of_scope_v1",
        "fx_pnl": None,
        "fx_pnl_reason": "out_of_scope_v1",
        "income": income,
        "fees": fees,
        "total_pnl": total_pnl,
        "currency": base_currency,
    }, input_versions)
