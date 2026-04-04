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
            SELECT
                s.jv_id,
                s.nav,
                s.noi,
                s.debt_balance,
                s.cash_balance,
                s.inputs_hash,
                j.ownership_percent
            FROM re_jv_quarter_state s
            JOIN re_jv j ON j.jv_id = s.jv_id
            WHERE j.investment_id = %s
              AND s.quarter = %s
              AND {scenario_clause}
            ORDER BY s.created_at DESC
            """,
            params,
        )
        jv_states = cur.fetchall()

        agg_nav = _zero()
        gross_asset_value = _zero()
        debt_balance = _zero()
        cash_balance = _zero()
        owned_gross_value = _zero()
        hashes = []

        for s in jv_states:
            ownership = Decimal(s["ownership_percent"] or 0)
            # NULL nav means the asset has no valuation — do NOT coerce to 0.
            # Coercing to 0 would collapse the fund's NAV for unvalued assets.
            # Skip from nav aggregation; still include debt for LTV tracking.
            raw_nav = s.get("nav")
            nav = Decimal(raw_nav) if raw_nav is not None else None
            debt = Decimal(s["debt_balance"] or 0)
            cash = Decimal(s["cash_balance"] or 0)
            if nav is not None:
                gross = nav + debt - cash
                agg_nav += nav * ownership
                owned_gross_value += gross * ownership
            else:
                gross = Decimal("0")
            gross_asset_value += gross
            debt_balance += debt * ownership
            cash_balance += cash * ownership
            hashes.append(f"jv:{s['inputs_hash']}:{ownership}")

        direct_params = [str(investment_id), quarter]
        if scenario_id:
            direct_params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT asset_id, asset_value, nav, debt_balance, cash_balance, inputs_hash
            FROM re_asset_quarter_state
            WHERE asset_id IN (
                SELECT a.asset_id
                FROM repe_asset a
                WHERE a.deal_id = %s AND a.jv_id IS NULL
            )
              AND quarter = %s
              AND {scenario_clause}
            ORDER BY created_at DESC
            """,
            direct_params,
        )
        direct_asset_states = cur.fetchall()

        for s in direct_asset_states:
            raw_nav = s.get("nav")
            raw_asset_value = s.get("asset_value")
            # NULL nav = unvalued asset — exclude from NAV sum but still track debt.
            nav = Decimal(raw_nav) if raw_nav is not None else None
            asset_value = Decimal(raw_asset_value) if raw_asset_value is not None else Decimal("0")
            debt = Decimal(s["debt_balance"] or 0)
            cash = Decimal(s["cash_balance"] or 0)
            if nav is not None:
                agg_nav += nav
                owned_gross_value += asset_value
            gross_asset_value += asset_value
            debt_balance += debt
            cash_balance += cash
            hashes.append(f"asset:{s['inputs_hash']}")

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
        effective_ownership_percent = (
            owned_gross_value / gross_asset_value if gross_asset_value > 0 else None
        )

        cur.execute(
            """
            INSERT INTO re_investment_quarter_state (
                investment_id, quarter, scenario_id, run_id,
                nav, committed_capital, invested_capital,
                realized_distributions, unrealized_value,
                gross_asset_value, debt_balance, cash_balance,
                effective_ownership_percent, fund_nav_contribution,
                equity_multiple, inputs_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (investment_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
                run_id = EXCLUDED.run_id,
                nav = EXCLUDED.nav,
                committed_capital = EXCLUDED.committed_capital,
                invested_capital = EXCLUDED.invested_capital,
                realized_distributions = EXCLUDED.realized_distributions,
                unrealized_value = EXCLUDED.unrealized_value,
                gross_asset_value = EXCLUDED.gross_asset_value,
                debt_balance = EXCLUDED.debt_balance,
                cash_balance = EXCLUDED.cash_balance,
                effective_ownership_percent = EXCLUDED.effective_ownership_percent,
                fund_nav_contribution = EXCLUDED.fund_nav_contribution,
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
                _q(gross_asset_value), _q(debt_balance), _q(cash_balance),
                _q(effective_ownership_percent), _q(agg_nav),
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
            SELECT
                investment_id,
                COALESCE(fund_nav_contribution, nav) AS effective_nav,
                inputs_hash
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
        # Track how many investments have a real NAV vs NULL (pending valuation).
        # A fund with some NULL-NAV investments should not report as zero NAV.
        valued_investment_count = 0

        for s in inv_states:
            raw = s.get("effective_nav")
            if raw is not None:
                portfolio_nav += Decimal(raw)
                valued_investment_count += 1
            # NULL effective_nav = investment has no quarter-close yet; exclude from sum.
            hashes.append(s["inputs_hash"])

        asset_params = [str(fund_id), quarter]
        if scenario_id:
            asset_params.append(str(scenario_id))
        cur.execute(
            f"""
            SELECT asset_value, ltv, dscr
            FROM re_asset_quarter_state
            WHERE asset_id IN (
                SELECT a.asset_id
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                WHERE d.fund_id = %s
            )
            AND quarter = %s
            AND {scenario_clause}
            ORDER BY created_at DESC
            """,
            asset_params,
        )
        asset_states = cur.fetchall()

        weighted_asset_base = _zero()
        weighted_ltv_numerator = _zero()
        weighted_dscr_numerator = _zero()
        for s in asset_states:
            asset_value = Decimal(s["asset_value"] or 0)
            if asset_value <= 0:
                continue
            weighted_asset_base += asset_value
            if s.get("ltv") is not None:
                weighted_ltv_numerator += asset_value * Decimal(s["ltv"])
            if s.get("dscr") is not None:
                weighted_dscr_numerator += asset_value * Decimal(s["dscr"])

        weighted_ltv = (
            weighted_ltv_numerator / weighted_asset_base if weighted_asset_base > 0 else None
        )
        weighted_dscr = (
            weighted_dscr_numerator / weighted_asset_base if weighted_asset_base > 0 else None
        )

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
                total_distributed, dpi, rvpi, tvpi,
                weighted_ltv, weighted_dscr, inputs_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                weighted_ltv = EXCLUDED.weighted_ltv,
                weighted_dscr = EXCLUDED.weighted_dscr,
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
                _q(weighted_ltv), _q(weighted_dscr),
                inputs_hash,
            ),
        )
        return cur.fetchone()
