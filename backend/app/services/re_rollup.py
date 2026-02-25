from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from uuid import UUID, uuid4

from app.db import get_cursor


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def _compute_inputs_hash(inputs: dict) -> str:
    canonical = json.dumps(inputs, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _zero() -> Decimal:
    return Decimal("0")


def rollup_jv(
    *,
    jv_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_id: UUID | None = None,
) -> dict:
    rid = run_id or uuid4()
    with get_cursor() as cur:
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(jv_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT asset_id, noi, nav, debt_balance, cash_balance, inputs_hash
            FROM re_asset_quarter_state
            WHERE asset_id IN (
                SELECT asset_id FROM repe_asset WHERE jv_id = %s
            )
            AND quarter = %s
            AND {scenario_clause}
            ORDER BY created_at DESC
            """,
            params,
        )
        asset_states = cur.fetchall()

        agg_nav = _zero()
        agg_noi = _zero()
        agg_debt = _zero()
        agg_cash = _zero()
        hashes = []

        for s in asset_states:
            agg_nav += Decimal(s["nav"] or 0)
            agg_noi += Decimal(s["noi"] or 0)
            agg_debt += Decimal(s["debt_balance"] or 0)
            agg_cash += Decimal(s["cash_balance"] or 0)
            hashes.append(s["inputs_hash"])

        inputs_hash = _compute_inputs_hash({
            "jv_id": str(jv_id),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
            "asset_hashes": sorted(hashes),
        })

        cur.execute(
            """
            INSERT INTO re_jv_quarter_state (
                jv_id, quarter, scenario_id, run_id,
                nav, noi, debt_balance, cash_balance, inputs_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (jv_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                nav = EXCLUDED.nav,
                noi = EXCLUDED.noi,
                debt_balance = EXCLUDED.debt_balance,
                cash_balance = EXCLUDED.cash_balance,
                inputs_hash = EXCLUDED.inputs_hash,
                created_at = now()
            RETURNING *
            """,
            (
                str(jv_id), quarter,
                str(scenario_id) if scenario_id else None,
                str(rid),
                _q(agg_nav), _q(agg_noi), _q(agg_debt), _q(agg_cash),
                inputs_hash,
            ),
        )
        return cur.fetchone()


def rollup_investment(
    *,
    investment_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_id: UUID | None = None,
) -> dict:
    rid = run_id or uuid4()
    with get_cursor() as cur:
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(investment_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT jv_id, nav, noi, debt_balance, cash_balance, inputs_hash
            FROM re_jv_quarter_state
            WHERE jv_id IN (
                SELECT jv_id FROM re_jv WHERE investment_id = %s
            )
            AND quarter = %s
            AND {scenario_clause}
            ORDER BY created_at DESC
            """,
            params,
        )
        jv_states = cur.fetchall()

        agg_nav = _zero()
        hashes = []

        for s in jv_states:
            agg_nav += Decimal(s["nav"] or 0)
            hashes.append(s["inputs_hash"])

        # Get investment capital figures
        cur.execute(
            "SELECT committed_capital, invested_capital, realized_distributions FROM repe_deal WHERE deal_id = %s",
            (str(investment_id),),
        )
        inv = cur.fetchone()

        inputs_hash = _compute_inputs_hash({
            "investment_id": str(investment_id),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
            "jv_hashes": sorted(hashes),
        })

        committed = Decimal(inv["committed_capital"] or 0) if inv else _zero()
        invested = Decimal(inv["invested_capital"] or 0) if inv else _zero()
        realized = Decimal(inv["realized_distributions"] or 0) if inv else _zero()
        equity_multiple = (
            (realized + agg_nav) / invested if invested > 0 else None
        )

        cur.execute(
            """
            INSERT INTO re_investment_quarter_state (
                investment_id, quarter, scenario_id, run_id,
                nav, committed_capital, invested_capital,
                realized_distributions, unrealized_value,
                equity_multiple, inputs_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (investment_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                nav = EXCLUDED.nav,
                committed_capital = EXCLUDED.committed_capital,
                invested_capital = EXCLUDED.invested_capital,
                realized_distributions = EXCLUDED.realized_distributions,
                unrealized_value = EXCLUDED.unrealized_value,
                equity_multiple = EXCLUDED.equity_multiple,
                inputs_hash = EXCLUDED.inputs_hash,
                created_at = now()
            RETURNING *
            """,
            (
                str(investment_id), quarter,
                str(scenario_id) if scenario_id else None,
                str(rid),
                _q(agg_nav), _q(committed), _q(invested),
                _q(realized), _q(agg_nav),
                _q(equity_multiple),
                inputs_hash,
            ),
        )
        return cur.fetchone()


def rollup_fund(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_id: UUID | None = None,
    total_committed: Decimal | None = None,
    total_called: Decimal | None = None,
    total_distributed: Decimal | None = None,
) -> dict:
    rid = run_id or uuid4()
    with get_cursor() as cur:
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT investment_id, nav, inputs_hash
            FROM re_investment_quarter_state
            WHERE investment_id IN (
                SELECT deal_id FROM repe_deal WHERE fund_id = %s
            )
            AND quarter = %s
            AND {scenario_clause}
            ORDER BY created_at DESC
            """,
            params,
        )
        inv_states = cur.fetchall()

        portfolio_nav = _zero()
        hashes = []

        for s in inv_states:
            portfolio_nav += Decimal(s["nav"] or 0)
            hashes.append(s["inputs_hash"])

        tc = Decimal(total_committed or 0)
        tk = Decimal(total_called or 0)
        td = Decimal(total_distributed or 0)

        dpi = td / tk if tk > 0 else None
        rvpi = portfolio_nav / tk if tk > 0 else None
        tvpi = (td + portfolio_nav) / tk if tk > 0 else None

        inputs_hash = _compute_inputs_hash({
            "fund_id": str(fund_id),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
            "investment_hashes": sorted(hashes),
            "total_committed": str(tc),
            "total_called": str(tk),
            "total_distributed": str(td),
        })

        cur.execute(
            """
            INSERT INTO re_fund_quarter_state (
                fund_id, quarter, scenario_id, run_id,
                portfolio_nav, total_committed, total_called,
                total_distributed, dpi, rvpi, tvpi, inputs_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                portfolio_nav = EXCLUDED.portfolio_nav,
                total_committed = EXCLUDED.total_committed,
                total_called = EXCLUDED.total_called,
                total_distributed = EXCLUDED.total_distributed,
                dpi = EXCLUDED.dpi,
                rvpi = EXCLUDED.rvpi,
                tvpi = EXCLUDED.tvpi,
                inputs_hash = EXCLUDED.inputs_hash,
                created_at = now()
            RETURNING *
            """,
            (
                str(fund_id), quarter,
                str(scenario_id) if scenario_id else None,
                str(rid),
                _q(portfolio_nav), _q(tc), _q(tk), _q(td),
                _q(dpi), _q(rvpi), _q(tvpi),
                inputs_hash,
            ),
        )
        return cur.fetchone()
