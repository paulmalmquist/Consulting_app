from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.irr_engine import xirr


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def compute_dpi(distributed: Decimal, contributed: Decimal) -> Decimal | None:
    if contributed <= 0:
        return None
    return (Decimal(distributed) / Decimal(contributed)).quantize(Decimal("0.0001"))


def compute_tvpi(
    distributed: Decimal, nav: Decimal, contributed: Decimal
) -> Decimal | None:
    if contributed <= 0:
        return None
    return (
        (Decimal(distributed) + Decimal(nav)) / Decimal(contributed)
    ).quantize(Decimal("0.0001"))


def compute_irr_from_ledger(
    *,
    fund_id: UUID,
    partner_id: UUID,
    nav: Decimal,
    as_of_date: date,
    as_of_quarter: str | None = None,
) -> Decimal | None:
    with get_cursor() as cur:
        conditions = ["fund_id = %s", "partner_id = %s"]
        params: list = [str(fund_id), str(partner_id)]
        if as_of_quarter:
            conditions.append("quarter <= %s")
            params.append(as_of_quarter)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT entry_type, amount_base, effective_date
            FROM re_capital_ledger_entry
            WHERE {where}
            ORDER BY effective_date, created_at
            """,
            params,
        )
        rows = cur.fetchall()

    cashflows: list[tuple[date, Decimal]] = []

    for r in rows:
        amt = Decimal(r["amount_base"])
        dt = r["effective_date"]
        if r["entry_type"] in ("contribution", "commitment"):
            cashflows.append((dt, -abs(amt)))
        elif r["entry_type"] in ("distribution", "recallable_dist"):
            cashflows.append((dt, abs(amt)))
        elif r["entry_type"] == "fee":
            cashflows.append((dt, -abs(amt)))
        elif r["entry_type"] == "reversal":
            cashflows.append((dt, amt))

    if nav and nav != 0:
        cashflows.append((as_of_date, abs(nav)))

    if len(cashflows) < 2:
        return None

    result = xirr(cashflows)
    return _q(result) if result is not None else None


def compute_fund_irr_from_ledger(
    *,
    fund_id: UUID,
    nav: Decimal,
    as_of_date: date,
    as_of_quarter: str | None = None,
    gross_only: bool = False,
) -> Decimal | None:
    """Compute fund IRR from re_capital_ledger_entry.

    When gross_only=True, excludes management fee entries so the result
    reflects pre-fee performance (gross IRR). When False, fees are treated
    as additional outflows (net IRR).
    """
    with get_cursor() as cur:
        conditions = ["fund_id = %s"]
        params: list = [str(fund_id)]
        if as_of_quarter:
            conditions.append("quarter <= %s")
            params.append(as_of_quarter)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT entry_type, amount_base, effective_date
            FROM re_capital_ledger_entry
            WHERE {where}
            ORDER BY effective_date, created_at
            """,
            params,
        )
        rows = cur.fetchall()

    cashflows: list[tuple[date, Decimal]] = []
    for r in rows:
        amt = Decimal(r["amount_base"])
        dt = r["effective_date"]
        if r["entry_type"] in ("contribution", "commitment"):
            cashflows.append((dt, -abs(amt)))
        elif r["entry_type"] in ("distribution", "recallable_dist"):
            cashflows.append((dt, abs(amt)))
        elif r["entry_type"] == "fee" and not gross_only:
            # Include fees as additional outflows only for net IRR
            cashflows.append((dt, -abs(amt)))
        elif r["entry_type"] == "reversal":
            cashflows.append((dt, amt))

    if nav and nav != 0:
        cashflows.append((as_of_date, abs(nav)))

    if len(cashflows) < 2:
        return None

    result = xirr(cashflows)
    return _q(result) if result is not None else None


def compute_partner_metrics(
    *,
    fund_id: UUID,
    partner_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_id: UUID,
    as_of_date: date,
) -> dict:
    from app.services.re_capital_ledger import compute_balances

    balances = compute_balances(
        fund_id=fund_id, partner_id=partner_id, as_of_quarter=quarter
    )

    contributed = Decimal(balances["total_contributed"])
    distributed = Decimal(balances["total_distributed"])

    # Get partner's NAV share from fund quarter state
    with get_cursor() as cur:
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT portfolio_nav FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND {scenario_clause}
            ORDER BY created_at DESC LIMIT 1
            """,
            params,
        )
        fs = cur.fetchone()

    fund_nav = Decimal(fs["portfolio_nav"] or 0) if fs else Decimal("0")

    # Commitment share is the default fallback for funds without explicit JV shares.
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                pc.committed_amount,
                (SELECT COALESCE(SUM(committed_amount), 0) FROM re_partner_commitment WHERE fund_id = %s) AS total_fund_commitment
            FROM re_partner_commitment pc
            WHERE pc.partner_id = %s AND pc.fund_id = %s
            """,
            (str(fund_id), str(partner_id), str(fund_id)),
        )
        commitment_row = cur.fetchone()

    if commitment_row and Decimal(commitment_row["total_fund_commitment"]) > 0:
        share = Decimal(commitment_row["committed_amount"]) / Decimal(
            commitment_row["total_fund_commitment"]
        )
    else:
        share = Decimal("0")

    with get_cursor() as cur:
        scenario_clause = "s.scenario_id = %s" if scenario_id else "s.scenario_id IS NULL"
        params = [str(partner_id), str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT COALESCE(SUM(s.nav * sh.ownership_percent), 0) AS explicit_nav
            FROM re_jv_partner_share sh
            JOIN re_jv j ON j.jv_id = sh.jv_id
            JOIN re_jv_quarter_state s ON s.jv_id = sh.jv_id
            WHERE sh.partner_id = %s
              AND j.investment_id IN (SELECT deal_id FROM repe_deal WHERE fund_id = %s)
              AND s.quarter = %s
              AND {scenario_clause}
              AND (sh.effective_to IS NULL OR sh.effective_to >= CURRENT_DATE)
            """,
            params,
        )
        explicit_nav_row = cur.fetchone()
        explicit_nav = Decimal(explicit_nav_row["explicit_nav"] or 0) if explicit_nav_row else Decimal("0")

        direct_params = [str(fund_id), quarter]
        if scenario_id:
            direct_params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT COALESCE(SUM(s.nav), 0) AS direct_nav
            FROM re_asset_quarter_state s
            WHERE s.asset_id IN (
                SELECT a.asset_id
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE d.fund_id = %s AND a.jv_id IS NULL
            )
              AND s.quarter = %s
              AND {scenario_clause.replace('s.', '')}
            """,
            direct_params,
        )
        direct_nav_row = cur.fetchone()
        direct_nav = Decimal(direct_nav_row["direct_nav"] or 0) if direct_nav_row else Decimal("0")

    if explicit_nav > 0:
        partner_nav = explicit_nav + (direct_nav * share)
    else:
        partner_nav = fund_nav * share

    dpi = compute_dpi(distributed, contributed)
    tvpi = compute_tvpi(distributed, partner_nav, contributed)
    irr = compute_irr_from_ledger(
        fund_id=fund_id,
        partner_id=partner_id,
        nav=partner_nav,
        as_of_date=as_of_date,
        as_of_quarter=quarter,
    )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_partner_quarter_metrics (
                partner_id, fund_id, quarter, scenario_id, run_id,
                contributed_to_date, distributed_to_date, nav, dpi, tvpi, irr
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (partner_id, fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                contributed_to_date = EXCLUDED.contributed_to_date,
                distributed_to_date = EXCLUDED.distributed_to_date,
                nav = EXCLUDED.nav,
                dpi = EXCLUDED.dpi,
                tvpi = EXCLUDED.tvpi,
                irr = EXCLUDED.irr,
                created_at = now()
            RETURNING *
            """,
            (
                str(partner_id), str(fund_id), quarter,
                str(scenario_id) if scenario_id else None,
                str(run_id),
                _q(contributed), _q(distributed), _q(partner_nav),
                _q(dpi), _q(tvpi), _q(irr),
            ),
        )
        return cur.fetchone()


def compute_fund_metrics(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_id: UUID,
    as_of_date: date,
) -> dict:
    from app.services.re_capital_ledger import compute_fund_totals

    totals = compute_fund_totals(fund_id=fund_id, as_of_quarter=quarter)
    contributed = Decimal(totals["total_called"])
    distributed = Decimal(totals["total_distributed"])

    with get_cursor() as cur:
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT portfolio_nav FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND {scenario_clause}
            ORDER BY created_at DESC LIMIT 1
            """,
            params,
        )
        fs = cur.fetchone()

    fund_nav = Decimal(fs["portfolio_nav"] or 0) if fs else Decimal("0")

    dpi = compute_dpi(distributed, contributed)
    tvpi = compute_tvpi(distributed, fund_nav, contributed)

    # Gross IRR: capital calls + distributions + terminal NAV, fees excluded
    gross_irr = compute_fund_irr_from_ledger(
        fund_id=fund_id,
        nav=fund_nav,
        as_of_date=as_of_date,
        as_of_quarter=quarter,
        gross_only=True,
    )
    # Net IRR: same flows but management fees added as additional outflows
    net_irr = compute_fund_irr_from_ledger(
        fund_id=fund_id,
        nav=fund_nav,
        as_of_date=as_of_date,
        as_of_quarter=quarter,
        gross_only=False,
    )

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_fund_quarter_metrics (
                fund_id, quarter, scenario_id, run_id,
                contributed_to_date, distributed_to_date, nav, dpi, tvpi, irr
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                contributed_to_date = EXCLUDED.contributed_to_date,
                distributed_to_date = EXCLUDED.distributed_to_date,
                nav = EXCLUDED.nav,
                dpi = EXCLUDED.dpi,
                tvpi = EXCLUDED.tvpi,
                irr = EXCLUDED.irr,
                created_at = now()
            RETURNING *
            """,
            (
                str(fund_id), quarter,
                str(scenario_id) if scenario_id else None,
                str(run_id),
                _q(contributed), _q(distributed), _q(fund_nav),
                _q(dpi), _q(tvpi), _q(gross_irr),
            ),
        )
        row = cur.fetchone()
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [_q(gross_irr), _q(net_irr), str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))
        cur.execute(
            f"""
            UPDATE re_fund_quarter_state
            SET gross_irr = %s,
                net_irr = %s
            WHERE fund_id = %s AND quarter = %s AND {scenario_clause}
            """,
            params,
        )
        return row
