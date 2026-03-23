"""Sale scenario modeling service.

Manages hypothetical asset sale assumptions per scenario and computes
scenario-specific metrics (IRR, TVPI, waterfall) without mutating base data.
Results are stored in re_scenario_metrics_snapshot as a side channel.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

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


# ── Sale Assumption CRUD ────────────────────────────────────────────────────

def create_sale_assumption(
    *,
    fund_id: UUID,
    scenario_id: UUID,
    deal_id: UUID,
    asset_id: UUID | None = None,
    sale_price: Decimal,
    sale_date: date,
    buyer_costs: Decimal = Decimal("0"),
    disposition_fee_pct: Decimal = Decimal("0"),
    memo: str | None = None,
    created_by: str | None = None,
) -> dict:
    """Create a hypothetical sale assumption for a scenario."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_sale_assumption
                (fund_id, scenario_id, deal_id, asset_id, sale_price, sale_date,
                 buyer_costs, disposition_fee_pct, memo, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, scenario_id, deal_id, asset_id)
            DO UPDATE SET
                sale_price = EXCLUDED.sale_price,
                sale_date = EXCLUDED.sale_date,
                buyer_costs = EXCLUDED.buyer_costs,
                disposition_fee_pct = EXCLUDED.disposition_fee_pct,
                memo = EXCLUDED.memo,
                created_by = EXCLUDED.created_by
            RETURNING *
            """,
            (
                str(fund_id), str(scenario_id), str(deal_id),
                str(asset_id) if asset_id else None,
                str(sale_price), str(sale_date),
                str(buyer_costs), str(disposition_fee_pct),
                memo, created_by,
            ),
        )
        return cur.fetchone()


def list_sale_assumptions(*, fund_id: UUID, scenario_id: UUID) -> list[dict]:
    """List all sale assumptions for a fund+scenario."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_sale_assumption
            WHERE fund_id = %s AND scenario_id = %s
            ORDER BY sale_date, deal_id
            """,
            (str(fund_id), str(scenario_id)),
        )
        return cur.fetchall()


def delete_sale_assumption(*, assumption_id: int) -> None:
    """Delete a sale assumption by ID."""
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_sale_assumption WHERE id = %s",
            (assumption_id,),
        )


# ── Scenario Metrics Computation ────────────────────────────────────────────

def compute_scenario_metrics(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    scenario_id: UUID,
    quarter: str,
) -> dict:
    """Compute scenario-specific metrics with sale assumptions applied.

    1. Load base cash events
    2. Inject synthetic DIST cashflows from sale assumptions
    3. Adjust NAV for sold assets
    4. Compute XIRR for scenario
    5. Run waterfall with adjusted distributions
    6. Store snapshot in re_scenario_metrics_snapshot
    7. Return base vs scenario comparison with delta
    """
    as_of = _quarter_end_date(quarter)

    with get_cursor() as cur:
        # ── Load base cash events ────────────────────────────────────────
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
        base_events = cur.fetchall()

        # ── Load base fund state ─────────────────────────────────────────
        cur.execute(
            """
            SELECT portfolio_nav, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        fund_state = cur.fetchone()
        base_nav = Decimal(str(fund_state["portfolio_nav"])) if fund_state and fund_state.get("portfolio_nav") else Decimal("0")

        # ── Load base metrics for comparison ─────────────────────────────
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        base_metrics = cur.fetchone()
        base_gross_irr = Decimal(str(base_metrics["gross_irr"])) if base_metrics and base_metrics.get("gross_irr") else None
        base_gross_tvpi = Decimal(str(base_metrics["gross_tvpi"])) if base_metrics and base_metrics.get("gross_tvpi") else None

        # ── Load sale assumptions ────────────────────────────────────────
        cur.execute(
            """
            SELECT * FROM re_sale_assumption
            WHERE fund_id = %s AND scenario_id = %s
            ORDER BY sale_date
            """,
            (str(fund_id), str(scenario_id)),
        )
        sale_assumptions = cur.fetchall()

        # ── Load cumulative fees/expenses for net IRR ────────────────────
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

    # ── Build scenario cashflows ─────────────────────────────────────────
    cashflows: list[tuple[date, Decimal]] = []
    total_called = Decimal("0")
    total_distributed = Decimal("0")

    for ev in base_events:
        amt = Decimal(str(ev["amount"]))
        dt = ev["event_date"] if isinstance(ev["event_date"], date) else date.fromisoformat(str(ev["event_date"]))
        if ev["event_type"] == "CALL":
            cashflows.append((dt, -amt))
            total_called += amt
        else:
            cashflows.append((dt, amt))
            total_distributed += amt

    # Inject synthetic sale proceeds
    total_sale_proceeds = Decimal("0")
    nav_reduction = Decimal("0")
    for sale in sale_assumptions:
        price = Decimal(str(sale["sale_price"]))
        costs = Decimal(str(sale["buyer_costs"] or 0))
        fee_pct = Decimal(str(sale["disposition_fee_pct"] or 0))
        disp_fee = (price * fee_pct).quantize(Decimal("0.01"))
        net_proceeds = price - costs - disp_fee

        sale_dt = sale["sale_date"] if isinstance(sale["sale_date"], date) else date.fromisoformat(str(sale["sale_date"]))
        cashflows.append((sale_dt, net_proceeds))
        total_sale_proceeds += net_proceeds

        # Estimate NAV reduction from sold asset
        # Use sale price as proxy for asset NAV contribution
        nav_reduction += price

    # Adjusted NAV: reduce by sold asset values, floor at 0
    scenario_nav = max(base_nav - nav_reduction, Decimal("0"))
    scenario_total_distributed = total_distributed + total_sale_proceeds

    # Add terminal NAV
    if scenario_nav > 0:
        cashflows.append((as_of, scenario_nav))

    # ── Compute scenario XIRR ────────────────────────────────────────────
    scenario_gross_irr = _xirr(cashflows) if len(cashflows) >= 2 else None

    # ── Compute scenario net XIRR ────────────────────────────────────────
    # Rebuild with net terminal value
    gross_return = scenario_total_distributed + scenario_nav - total_called

    # Carry estimate (simplified for scenario)
    from app.services.re_fund_metrics import _compute_waterfall_carry
    carry_estimate = _compute_waterfall_carry(fund_id, quarter, gross_return, total_called)

    net_terminal = max(scenario_nav - mgmt_fees - fund_expenses - carry_estimate, Decimal("0"))
    net_cashflows: list[tuple[date, Decimal]] = []
    for ev in base_events:
        amt = Decimal(str(ev["amount"]))
        dt = ev["event_date"] if isinstance(ev["event_date"], date) else date.fromisoformat(str(ev["event_date"]))
        if ev["event_type"] == "CALL":
            net_cashflows.append((dt, -amt))
        else:
            net_cashflows.append((dt, amt))
    for sale in sale_assumptions:
        price = Decimal(str(sale["sale_price"]))
        costs = Decimal(str(sale["buyer_costs"] or 0))
        fee_pct = Decimal(str(sale["disposition_fee_pct"] or 0))
        disp_fee = (price * fee_pct).quantize(Decimal("0.01"))
        net_proceeds = price - costs - disp_fee
        sale_dt = sale["sale_date"] if isinstance(sale["sale_date"], date) else date.fromisoformat(str(sale["sale_date"]))
        net_cashflows.append((sale_dt, net_proceeds))
    if net_terminal > 0:
        net_cashflows.append((as_of, net_terminal))

    scenario_net_irr = _xirr(net_cashflows) if len(net_cashflows) >= 2 else None

    # ── Compute scenario multiples ───────────────────────────────────────
    scenario_gross_tvpi = ((scenario_total_distributed + scenario_nav) / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
    scenario_net_tvpi = ((scenario_total_distributed + scenario_nav - mgmt_fees - fund_expenses - carry_estimate) / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
    scenario_dpi = (scenario_total_distributed / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None
    scenario_rvpi = (scenario_nav / total_called).quantize(Decimal("0.0001")) if total_called > 0 else None

    # ── Store snapshot ───────────────────────────────────────────────────
    snapshot_run_id = uuid4()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_scenario_metrics_snapshot
                (fund_id, scenario_id, quarter, run_id,
                 gross_irr, net_irr, gross_tvpi, net_tvpi,
                 dpi, rvpi, total_distributed, portfolio_nav, carry_estimate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, scenario_id, quarter, run_id)
            DO UPDATE SET
                gross_irr = EXCLUDED.gross_irr,
                net_irr = EXCLUDED.net_irr,
                gross_tvpi = EXCLUDED.gross_tvpi,
                net_tvpi = EXCLUDED.net_tvpi,
                dpi = EXCLUDED.dpi,
                rvpi = EXCLUDED.rvpi,
                total_distributed = EXCLUDED.total_distributed,
                portfolio_nav = EXCLUDED.portfolio_nav,
                carry_estimate = EXCLUDED.carry_estimate,
                computed_at = now()
            RETURNING *
            """,
            (
                str(fund_id), str(scenario_id), quarter, str(snapshot_run_id),
                _q(scenario_gross_irr), _q(scenario_net_irr),
                _q(scenario_gross_tvpi), _q(scenario_net_tvpi),
                _q(scenario_dpi), _q(scenario_rvpi),
                _q(scenario_total_distributed), _q(scenario_nav),
                _q(carry_estimate),
            ),
        )
        snapshot = cur.fetchone()

    # ── Compute deltas ───────────────────────────────────────────────────
    irr_delta = None
    if scenario_gross_irr is not None and base_gross_irr is not None:
        irr_delta = (scenario_gross_irr - base_gross_irr).quantize(Decimal("0.0001"))

    tvpi_delta = None
    if scenario_gross_tvpi is not None and base_gross_tvpi is not None:
        tvpi_delta = (scenario_gross_tvpi - base_gross_tvpi).quantize(Decimal("0.0001"))

    emit_log(
        level="info",
        service="backend",
        action="re.sale_scenario.computed",
        message=f"Scenario metrics computed for fund {fund_id} scenario {scenario_id}",
        context={
            "fund_id": str(fund_id),
            "scenario_id": str(scenario_id),
            "quarter": quarter,
            "irr_delta": str(irr_delta) if irr_delta else None,
        },
    )

    return {
        "scenario_id": str(scenario_id),
        "fund_id": str(fund_id),
        "quarter": quarter,
        "base_gross_irr": str(base_gross_irr) if base_gross_irr else None,
        "scenario_gross_irr": str(scenario_gross_irr) if scenario_gross_irr else None,
        "irr_delta": str(irr_delta) if irr_delta else None,
        "base_gross_tvpi": str(base_gross_tvpi) if base_gross_tvpi else None,
        "scenario_gross_tvpi": str(scenario_gross_tvpi) if scenario_gross_tvpi else None,
        "tvpi_delta": str(tvpi_delta) if tvpi_delta else None,
        "scenario_net_irr": str(scenario_net_irr) if scenario_net_irr else None,
        "scenario_net_tvpi": str(scenario_net_tvpi) if scenario_net_tvpi else None,
        "scenario_dpi": str(scenario_dpi) if scenario_dpi else None,
        "scenario_rvpi": str(scenario_rvpi) if scenario_rvpi else None,
        "carry_estimate": str(carry_estimate),
        "total_sale_proceeds": str(total_sale_proceeds),
        "sale_count": len(sale_assumptions),
        "snapshot_id": str(snapshot["id"]) if snapshot else None,
    }


# ── LP Summary ──────────────────────────────────────────────────────────────

def get_lp_summary(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str,
) -> dict:
    """Build consolidated LP summary with capital accounts, metrics, and waterfall allocations."""
    with get_cursor() as cur:
        # ── Fund-level metrics ───────────────────────────────────────────
        cur.execute(
            """
            SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi, cash_on_cash
            FROM re_fund_metrics_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        metrics_row = cur.fetchone()

        # ── Gross-net bridge ─────────────────────────────────────────────
        cur.execute(
            """
            SELECT gross_return, mgmt_fees, fund_expenses, carry_shadow, net_return
            FROM re_gross_net_bridge_qtr
            WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
            ORDER BY id DESC LIMIT 1
            """,
            (env_id, str(business_id), str(fund_id), quarter),
        )
        bridge_row = cur.fetchone()

        # ── Partners + commitments ───────────────────────────────────────
        cur.execute(
            """
            SELECT p.partner_id, p.name, p.partner_type,
                   pc.committed_amount
            FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s AND pc.status = 'active'
            ORDER BY p.partner_type, p.name
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

        # ── Capital balances per partner ─────────────────────────────────
        partner_summaries = []
        total_committed = Decimal("0")
        total_contributed = Decimal("0")
        total_distributed = Decimal("0")

        for p in partners:
            pid = str(p["partner_id"])
            committed = Decimal(str(p["committed_amount"]))
            total_committed += committed

            cur.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS contributed,
                    COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS distributed
                FROM re_capital_ledger_entry
                WHERE fund_id = %s AND partner_id = %s AND quarter <= %s
                """,
                (str(fund_id), pid, quarter),
            )
            balances = cur.fetchone()
            contributed = Decimal(str(balances["contributed"])) if balances else Decimal("0")
            distributed = Decimal(str(balances["distributed"])) if balances else Decimal("0")
            total_contributed += contributed
            total_distributed += distributed

            # Per-partner metrics
            p_dpi = (distributed / contributed).quantize(Decimal("0.0001")) if contributed > 0 else None
            # NAV share is proportional to commitment
            nav_share = None

            partner_summaries.append({
                "partner_id": pid,
                "name": p["name"],
                "partner_type": p["partner_type"],
                "committed": str(committed),
                "contributed": str(contributed),
                "distributed": str(distributed),
                "nav_share": str(nav_share) if nav_share else None,
                "dpi": str(p_dpi) if p_dpi else None,
            })

        # ── NAV share allocation (pro-rata by commitment) ────────────────
        cur.execute(
            """
            SELECT portfolio_nav FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        nav_row = cur.fetchone()
        fund_nav = Decimal(str(nav_row["portfolio_nav"])) if nav_row and nav_row.get("portfolio_nav") else Decimal("0")

        for ps in partner_summaries:
            committed = Decimal(ps["committed"])
            if total_committed > 0 and fund_nav > 0:
                share = (committed / total_committed * fund_nav).quantize(Decimal("0.01"))
                ps["nav_share"] = str(share)
                # TVPI = (distributed + nav_share) / contributed
                contributed = Decimal(ps["contributed"])
                if contributed > 0:
                    ps["tvpi"] = str(((Decimal(ps["distributed"]) + share) / contributed).quantize(Decimal("0.0001")))

        # ── Waterfall allocations per partner ────────────────────────────
        cur.execute(
            """
            SELECT wr.run_id, wrr.partner_id, wrr.tier_code, wrr.payout_type, wrr.amount
            FROM re_waterfall_run wr
            JOIN re_waterfall_run_result wrr ON wrr.run_id = wr.run_id
            WHERE wr.fund_id = %s AND wr.quarter = %s AND wr.status = 'success'
            ORDER BY wr.created_at DESC
            """,
            (str(fund_id), quarter),
        )
        wf_results = cur.fetchall()

        # Group by partner
        wf_by_partner: dict[str, dict] = {}
        for wr in wf_results:
            pid = str(wr["partner_id"])
            if pid not in wf_by_partner:
                wf_by_partner[pid] = {"return_of_capital": "0", "preferred_return": "0", "carry": "0", "total": "0"}
            tier = wr["tier_code"]
            amt = Decimal(str(wr["amount"]))
            if "return_of_capital" in tier:
                wf_by_partner[pid]["return_of_capital"] = str(Decimal(wf_by_partner[pid]["return_of_capital"]) + amt)
            elif "preferred_return" in tier:
                wf_by_partner[pid]["preferred_return"] = str(Decimal(wf_by_partner[pid]["preferred_return"]) + amt)
            elif "carry" in tier or "catch_up" in tier:
                wf_by_partner[pid]["carry"] = str(Decimal(wf_by_partner[pid]["carry"]) + amt)
            wf_by_partner[pid]["total"] = str(Decimal(wf_by_partner[pid]["total"]) + amt)

        for ps in partner_summaries:
            ps["waterfall_allocation"] = wf_by_partner.get(ps["partner_id"])

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "fund_metrics": {
            "gross_irr": str(metrics_row["gross_irr"]) if metrics_row and metrics_row.get("gross_irr") else None,
            "net_irr": str(metrics_row["net_irr"]) if metrics_row and metrics_row.get("net_irr") else None,
            "gross_tvpi": str(metrics_row["gross_tvpi"]) if metrics_row and metrics_row.get("gross_tvpi") else None,
            "net_tvpi": str(metrics_row["net_tvpi"]) if metrics_row and metrics_row.get("net_tvpi") else None,
            "dpi": str(metrics_row["dpi"]) if metrics_row and metrics_row.get("dpi") else None,
            "rvpi": str(metrics_row["rvpi"]) if metrics_row and metrics_row.get("rvpi") else None,
        } if metrics_row else {},
        "gross_net_bridge": {
            "gross_return": str(bridge_row["gross_return"]) if bridge_row else None,
            "mgmt_fees": str(bridge_row["mgmt_fees"]) if bridge_row else None,
            "fund_expenses": str(bridge_row["fund_expenses"]) if bridge_row else None,
            "carry": str(bridge_row["carry_shadow"]) if bridge_row else None,
            "net_return": str(bridge_row["net_return"]) if bridge_row else None,
        } if bridge_row else {},
        "partners": partner_summaries,
        "total_committed": str(total_committed),
        "total_contributed": str(total_contributed),
        "total_distributed": str(total_distributed),
        "fund_nav": str(fund_nav),
    }
