"""Capital account snapshot service.

Computes and materializes per-partner per-quarter capital account snapshots
for fast LP reporting.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor

ZERO = Decimal("0")
TWO = Decimal("0.01")
FOUR = Decimal("0.0001")


def compute_and_store_snapshots(
    *,
    fund_id: UUID,
    quarter: str,
) -> list[dict]:
    """For each partner in the fund, compute capital account metrics and UPSERT."""
    snapshots = []
    with get_cursor() as cur:
        # Get fund NAV from fund quarter state
        cur.execute(
            """
            SELECT portfolio_nav FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        nav_row = cur.fetchone()
        fund_nav = Decimal(str(nav_row["portfolio_nav"])) if nav_row and nav_row.get("portfolio_nav") else ZERO

        # Get all partners with commitments for this fund
        cur.execute(
            """
            SELECT p.partner_id, p.name, p.partner_type, pc.committed_amount
            FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id AND pc.fund_id = %s
            ORDER BY p.partner_type, p.name
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

        if not partners:
            return []

        total_committed = sum(Decimal(str(p["committed_amount"] or 0)) for p in partners)

        # Get waterfall results for carry allocations
        cur.execute(
            """
            SELECT wr.run_id
            FROM re_waterfall_run wr
            WHERE wr.fund_id = %s AND wr.quarter = %s
            ORDER BY wr.created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        wf_run = cur.fetchone()
        carry_by_partner: dict[str, Decimal] = {}
        if wf_run:
            cur.execute(
                """
                SELECT partner_id, SUM(amount) as total_amount
                FROM re_waterfall_run_result
                WHERE run_id = %s AND tier_name LIKE '%%carry%%'
                GROUP BY partner_id
                """,
                (str(wf_run["run_id"]),),
            )
            for cr in cur.fetchall():
                carry_by_partner[str(cr["partner_id"])] = Decimal(str(cr["total_amount"]))

        for p in partners:
            pid = str(p["partner_id"])
            committed = Decimal(str(p["committed_amount"] or 0))
            ownership_pct = committed / total_committed if total_committed > 0 else ZERO

            # Get capital ledger balances
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount ELSE 0 END), 0) as contributed,
                    COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount ELSE 0 END), 0) as distributed
                FROM re_capital_ledger_entry
                WHERE fund_id = %s AND partner_id = %s
                """,
                (str(fund_id), pid),
            )
            ledger = cur.fetchone()
            contributed = Decimal(str(ledger["contributed"])) if ledger else ZERO
            distributed = Decimal(str(ledger["distributed"])) if ledger else ZERO

            unreturned = (contributed - distributed).quantize(TWO)
            nav_share = (fund_nav * ownership_pct).quantize(TWO)
            carry = carry_by_partner.get(pid, ZERO)

            # Compute pref accrual (8% of unreturned, annualized by quarter)
            pref_accrual = (unreturned * Decimal("0.08") / 4).quantize(TWO)

            unrealized_gain = (nav_share - unreturned).quantize(TWO)

            dpi = (distributed / contributed).quantize(FOUR) if contributed > 0 else ZERO
            rvpi = (nav_share / contributed).quantize(FOUR) if contributed > 0 else ZERO
            tvpi = (dpi + rvpi).quantize(FOUR)

            # UPSERT
            cur.execute(
                """
                INSERT INTO re_capital_account_snapshot
                    (fund_id, partner_id, quarter, committed, contributed,
                     distributed, unreturned_capital, pref_accrual,
                     carry_allocation, unrealized_gain, nav_share,
                     dpi, rvpi, tvpi)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (fund_id, partner_id, quarter)
                DO UPDATE SET
                    committed = EXCLUDED.committed,
                    contributed = EXCLUDED.contributed,
                    distributed = EXCLUDED.distributed,
                    unreturned_capital = EXCLUDED.unreturned_capital,
                    pref_accrual = EXCLUDED.pref_accrual,
                    carry_allocation = EXCLUDED.carry_allocation,
                    unrealized_gain = EXCLUDED.unrealized_gain,
                    nav_share = EXCLUDED.nav_share,
                    dpi = EXCLUDED.dpi,
                    rvpi = EXCLUDED.rvpi,
                    tvpi = EXCLUDED.tvpi
                RETURNING *
                """,
                (
                    str(fund_id), pid, quarter,
                    str(committed), str(contributed), str(distributed),
                    str(unreturned), str(pref_accrual), str(carry),
                    str(unrealized_gain), str(nav_share),
                    str(dpi), str(rvpi), str(tvpi),
                ),
            )
            snapshot = cur.fetchone()
            snapshots.append(snapshot)

    return snapshots


def get_snapshots(
    *,
    fund_id: UUID,
    quarter: str,
) -> list[dict]:
    """Return all partner snapshots for a fund + quarter, joined with names."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.*, p.name as partner_name, p.partner_type
            FROM re_capital_account_snapshot s
            JOIN re_partner p ON p.partner_id = s.partner_id
            WHERE s.fund_id = %s AND s.quarter = %s
            ORDER BY p.partner_type, p.name
            """,
            (str(fund_id), quarter),
        )
        return cur.fetchall()
