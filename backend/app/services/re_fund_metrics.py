"""Fund return metrics + gross→net bridge service.

Computes quarterly and inception-to-date metrics:
- Cash-on-Cash, Gross IRR/Net IRR, Gross TVPI/Net TVPI, DPI, RVPI
- Gross→Net bridge: gross return minus mgmt fees minus expenses minus carry = net
- Fee accrual via management fee policy
- XIRR via deterministic binary-search engine (irr_engine)
- Carry via real waterfall engine when definition exists
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.irr_engine import xirr as _xirr
from app.observability.logger import emit_log


def _q(v: Decimal | None) -> str | None:
    if v is None:
        return None
    return str(v.quantize(Decimal("0.000000000001")))


def _quarter_end_date(quarter: str) -> date:
    year = int(quarter[:4])
    q = int(quarter[-1])
    month = q * 3
    if month == 3:
        return date(year, 3, 31)
    elif month == 6:
        return date(year, 6, 30)
    elif month == 9:
        return date(year, 9, 30)
    else:
        return date(year, 12, 31)


def _compute_fund_xirr(
    cur,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    terminal_nav: Decimal,
) -> Decimal | None:
    """Compute fund-level gross XIRR from cash events + terminal NAV.

    Builds cashflows:
      - Capital calls as negative (outflows)
      - Distributions as positive (inflows)
      - Terminal NAV as positive on quarter end date
    """
    as_of = _quarter_end_date(quarter)
    cur.execute(
        """
        SELECT event_date, event_type, amount
        FROM re_cash_event
        WHERE env_id = %s AND business_id = %s AND fund_id = %s
            AND event_type IN ('CALL', 'DIST')
            AND event_date <= %s
        ORDER BY event_date
        """,
        (env_id, str(business_id), str(fund_id), str(as_of)),
    )
    rows = cur.fetchall()

    cashflows: list[tuple[date, Decimal]] = []
    for row in rows:
        amt = Decimal(str(row["amount"]))
        dt = row["event_date"] if isinstance(row["event_date"], date) else date.fromisoformat(str(row["event_date"]))
        if row["event_type"] == "CALL":
            cashflows.append((dt, -amt))
        else:
            cashflows.append((dt, amt))

    # Terminal value: NAV as of quarter end
    if terminal_nav > 0:
        cashflows.append((as_of, terminal_nav))

    if len(cashflows) < 2:
        return None

    return _xirr(cashflows)


def _compute_net_xirr(
    cur,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    terminal_nav: Decimal,
    mgmt_fees: Decimal,
    fund_expenses: Decimal,
    carry: Decimal,
) -> Decimal | None:
    """Compute fund-level net XIRR.

    Same as gross XIRR but terminal value is reduced by cumulative
    fees, expenses, and carry.
    """
    net_terminal = terminal_nav - mgmt_fees - fund_expenses - carry
    if net_terminal < 0:
        net_terminal = Decimal("0")
    return _compute_fund_xirr(cur, env_id, business_id, fund_id, quarter, net_terminal)


def _compute_waterfall_carry(fund_id: UUID, quarter: str, gross_return: Decimal, total_called: Decimal) -> Decimal:
    """Compute carry using real waterfall engine if definition exists, else simplified fallback."""
    try:
        from app.services.re_waterfall_runtime import run_waterfall
        wf_result = run_waterfall(fund_id=fund_id, quarter=quarter)
        # Sum carry + catch-up allocations from waterfall results
        carry = Decimal("0")
        for result in (wf_result.get("results") or []):
            tier_code = result.get("tier_code", "")
            if "carry" in tier_code or "catch_up" in tier_code:
                carry += Decimal(str(result.get("amount", 0)))
        return carry.quantize(Decimal("0.01"))
    except (LookupError, ValueError, ImportError):
        # Fallback: simplified carry (20% of gains above 8% pref hurdle)
        pref_hurdle = total_called * Decimal("0.08")
        if gross_return > pref_hurdle:
            return ((gross_return - pref_hurdle) * Decimal("0.20")).quantize(Decimal("0.01"))
        return Decimal("0")


def compute_fee_accrual(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    run_id: UUID,
) -> Decimal:
    """Compute management fee accrual for the quarter based on fee policy.

    Fee = basis_amount * annual_rate / 4  (quarterly)
    Uses stepdown_rate after stepdown_date if applicable.
    """
    as_of = _quarter_end_date(quarter)

    with get_cursor() as cur:
        # Get fee policy
        cur.execute(
            """
            SELECT * FROM re_fee_policy
            WHERE env_id = %s AND business_id = %s AND fund_id = %s
            ORDER BY start_date DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id)),
        )
        policy = cur.fetchone()
        if not policy:
            return Decimal("0")

        fee_basis = policy["fee_basis"]
        annual_rate = Decimal(str(policy["annual_rate"]))
        stepdown_date = policy.get("stepdown_date")
        stepdown_rate = Decimal(str(policy["stepdown_rate"])) if policy.get("stepdown_rate") else None

        # Apply stepdown if past stepdown date
        if stepdown_date and as_of >= stepdown_date and stepdown_rate is not None:
            annual_rate = stepdown_rate

        # Determine basis amount
        basis_amount = Decimal("0")
        if fee_basis == "COMMITTED":
            cur.execute(
                """
                SELECT COALESCE(SUM(committed_amount), 0) AS total
                FROM re_partner_commitment
                WHERE fund_id = %s AND status = 'active'
                """,
                (str(fund_id),),
            )
            row = cur.fetchone()
            basis_amount = Decimal(str(row["total"])) if row else Decimal("0")
        elif fee_basis == "CALLED":
            cur.execute(
                """
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM re_cash_event
                WHERE env_id = %s AND business_id = %s AND fund_id = %s
                    AND event_type = 'CALL' AND event_date <= %s
                """,
                (env_id, str(business_id), str(fund_id), str(as_of)),
            )
            row = cur.fetchone()
            basis_amount = Decimal(str(row["total"])) if row else Decimal("0")
        elif fee_basis == "NAV":
            cur.execute(
                """
                SELECT portfolio_nav FROM re_fund_quarter_state
                WHERE fund_id = %s AND quarter = %s
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), quarter),
            )
            row = cur.fetchone()
            basis_amount = Decimal(str(row["portfolio_nav"])) if row and row.get("portfolio_nav") else Decimal("0")

        fee_amount = (basis_amount * annual_rate / Decimal("4")).quantize(Decimal("0.01"))

        # Store accrual
        cur.execute(
            """
            INSERT INTO re_fee_accrual_qtr (env_id, business_id, fund_id, quarter, amount, run_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (env_id, str(business_id), str(fund_id), quarter, str(fee_amount), str(run_id)),
        )
        cur.fetchone()

    return fee_amount


def compute_fund_expenses(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
) -> Decimal:
    """Sum fund expenses for the quarter from re_fund_expense_qtr."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM re_fund_expense_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        row = cur.fetchone()
        return Decimal(str(row["total"])) if row else Decimal("0")


def compute_return_metrics(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
    run_id: UUID,
) -> dict:
    """Compute gross/net return metrics and store in re_fund_metrics_qtr + re_gross_net_bridge_qtr."""
    inputs_missing = []

    with get_cursor() as cur:
        # Get fund state for NAV
        cur.execute(
            """
            SELECT * FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        fund_state = cur.fetchone()

        # Get capital totals from cash events
        cur.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN event_type = 'CALL' THEN amount ELSE 0 END), 0) AS total_called,
                COALESCE(SUM(CASE WHEN event_type = 'DIST' THEN amount ELSE 0 END), 0) AS total_distributed
            FROM re_cash_event
            WHERE env_id = %s AND business_id = %s AND fund_id = %s
            """,
            (env_id, str(business_id), str(fund_id)),
        )
        cash_totals = cur.fetchone()

        total_called = Decimal(str(cash_totals["total_called"])) if cash_totals else Decimal("0")
        total_distributed = Decimal(str(cash_totals["total_distributed"])) if cash_totals else Decimal("0")
        nav = Decimal(str(fund_state["portfolio_nav"])) if fund_state and fund_state.get("portfolio_nav") else Decimal("0")

        if total_called == 0:
            inputs_missing.append("no_capital_calls")
        if nav == 0 and not fund_state:
            inputs_missing.append("no_fund_state")

        # Compute metrics
        dpi = (total_distributed / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
        rvpi = (nav / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
        gross_tvpi = ((total_distributed + nav) / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None

        # Gross return (absolute)
        gross_return = total_distributed + nav - total_called

        # Gross IRR via XIRR engine (date-weighted, not simple ratio)
        gross_irr = _compute_fund_xirr(cur, env_id, business_id, fund_id, quarter, nav)

        # Cash-on-Cash = distributions / called
        cash_on_cash = dpi  # same ratio

        # Get fees and expenses for net calculation
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM re_fee_accrual_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter <= %s
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        fee_row = cur.fetchone()
        mgmt_fees = Decimal(str(fee_row["total"])) if fee_row else Decimal("0")

        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM re_fund_expense_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter <= %s
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        expense_row = cur.fetchone()
        fund_expenses = Decimal(str(expense_row["total"])) if expense_row else Decimal("0")

        # Carry via real waterfall engine (falls back to simplified if no definition)
        carry_shadow = _compute_waterfall_carry(fund_id, quarter, gross_return, total_called)

        # Net return
        net_return = gross_return - mgmt_fees - fund_expenses - carry_shadow

        # Net IRR via XIRR engine (terminal NAV reduced by fees/expenses/carry)
        net_irr = _compute_net_xirr(
            cur, env_id, business_id, fund_id, quarter,
            nav, mgmt_fees, fund_expenses, carry_shadow,
        )

        net_tvpi = ((total_distributed + nav - mgmt_fees - fund_expenses - carry_shadow) / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None

        gross_net_spread = None
        if gross_irr is not None and net_irr is not None:
            gross_net_spread = (gross_irr - net_irr).quantize(Decimal("0.0001"))

        # Store metrics
        cur.execute(
            """
            INSERT INTO re_fund_metrics_qtr
                (run_id, env_id, business_id, fund_id, quarter,
                 gross_irr, net_irr, gross_tvpi, net_tvpi,
                 dpi, rvpi, cash_on_cash, gross_net_spread, inputs_missing)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(run_id), env_id, str(business_id), str(fund_id), quarter,
                _q(gross_irr), _q(net_irr), _q(gross_tvpi), _q(net_tvpi),
                _q(dpi), _q(rvpi), _q(cash_on_cash), _q(gross_net_spread),
                str(inputs_missing) if inputs_missing else None,
            ),
        )
        metrics_row = cur.fetchone()

        # Store gross-net bridge
        cur.execute(
            """
            INSERT INTO re_gross_net_bridge_qtr
                (run_id, env_id, business_id, fund_id, quarter,
                 gross_return, mgmt_fees, fund_expenses, carry_shadow, net_return)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(run_id), env_id, str(business_id), str(fund_id), quarter,
                _q(gross_return), _q(mgmt_fees), _q(fund_expenses),
                _q(carry_shadow), _q(net_return),
            ),
        )
        bridge_row = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="re.fund_metrics.computed",
        message=f"Fund metrics computed for {fund_id} {quarter}",
        context={
            "fund_id": str(fund_id), "quarter": quarter, "run_id": str(run_id),
            "inputs_missing": inputs_missing,
        },
    )

    return {
        "metrics": metrics_row,
        "bridge": bridge_row,
        "inputs_missing": inputs_missing,
    }


def get_fund_metrics(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        metrics = cur.fetchone()

        cur.execute(
            """
            SELECT * FROM re_gross_net_bridge_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        bridge = cur.fetchone()

        if not metrics:
            return None
        return {"metrics": metrics, "bridge": bridge}
