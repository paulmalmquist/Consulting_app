"""Waterfall Engine — Shadow liquidation and actual distribution waterfall.

Canonical source: re_asset_quarter_state (schema 270).
Falls back to re_asset_financial_state for legacy fin_fund_id-keyed calls.
Supports American (deal-by-deal) and European (fund-level) modes.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.re_math import _d

TWO_PLACES = Decimal("0.01")


# ---------------------------------------------------------------------------
# Pure waterfall tier math (stateless)
# ---------------------------------------------------------------------------

def apply_waterfall_tiers(
    net_cash: Decimal,
    total_contributions: Decimal,
    accrued_pref: Decimal,
    tiers: list[dict],
    pref_rate: Decimal,
    pref_is_compound: bool = False,
    quarters_held: int = 0,
) -> list[dict]:
    """Apply sequential waterfall tiers to distributable cash.

    Returns list of tier allocation dicts.
    """
    remaining = _d(net_cash)
    allocations = []

    for tier in tiers:
        tier_type = tier["tier_type"]
        alloc = {"tier_type": tier_type, "tier_order": tier["tier_order"]}

        if tier_type == "return_of_capital":
            roc = min(remaining, _d(total_contributions))
            alloc["amount"] = roc
            alloc["lp_amount"] = roc
            alloc["gp_amount"] = Decimal(0)
            remaining -= roc

        elif tier_type == "preferred_return":
            if pref_is_compound:
                pref_owed = _d(total_contributions) * ((1 + pref_rate) ** _d(quarters_held / 4) - 1)
            else:
                pref_owed = _d(total_contributions) * pref_rate * _d(quarters_held) / 4
            pref_due = max(pref_owed - _d(accrued_pref), Decimal(0))
            pref_paid = min(remaining, pref_due)
            alloc["amount"] = pref_paid
            alloc["lp_amount"] = pref_paid
            alloc["gp_amount"] = Decimal(0)
            alloc["pref_owed"] = pref_owed
            alloc["pref_paid"] = pref_paid
            remaining -= pref_paid

        elif tier_type == "catch_up":
            catchup_rate = _d(tier.get("catchup_rate", 1.0))
            carry_rate = _d(tier.get("split_pct_gp", 0.20))
            # GP catch-up: GP gets catchup_rate of remaining until GP has carry_rate of total profit
            total_profit = _d(net_cash) - _d(total_contributions)
            target_gp = total_profit * carry_rate if total_profit > 0 else Decimal(0)
            gp_received_so_far = sum(_d(a.get("gp_amount", 0)) for a in allocations)
            gp_shortfall = max(target_gp - gp_received_so_far, Decimal(0))
            catch_up_amount = min(remaining, gp_shortfall / catchup_rate) if catchup_rate > 0 else Decimal(0)
            gp_catch = min(catch_up_amount * catchup_rate, remaining)
            lp_catch = catch_up_amount - gp_catch
            alloc["amount"] = catch_up_amount
            alloc["gp_amount"] = gp_catch
            alloc["lp_amount"] = lp_catch
            remaining -= catch_up_amount

        elif tier_type == "carry_split":
            gp_split = _d(tier.get("split_pct_gp", 0.20))
            gp_amount = (remaining * gp_split).quantize(TWO_PLACES, ROUND_HALF_UP)
            lp_amount = remaining - gp_amount
            alloc["amount"] = remaining
            alloc["gp_amount"] = gp_amount
            alloc["lp_amount"] = lp_amount
            remaining = Decimal(0)

        else:
            # Generic split tier
            gp_split = _d(tier.get("split_pct_gp", 0))
            amt = min(remaining, _d(tier.get("cap", remaining)))
            alloc["amount"] = amt
            alloc["gp_amount"] = (amt * gp_split).quantize(TWO_PLACES, ROUND_HALF_UP)
            alloc["lp_amount"] = amt - alloc["gp_amount"]
            remaining -= amt

        # Quantize
        for key in ("amount", "lp_amount", "gp_amount"):
            if key in alloc and isinstance(alloc[key], Decimal):
                alloc[key] = alloc[key].quantize(TWO_PLACES, ROUND_HALF_UP)

        allocations.append(alloc)

        if remaining <= 0:
            break

    return allocations


# ---------------------------------------------------------------------------
# Shadow liquidation waterfall
# ---------------------------------------------------------------------------

def run_shadow(
    *,
    fin_fund_id: str,
    quarter: str,
    waterfall_style: str = "european",
    fin_rule_version_id: str | None = None,
    sale_costs_pct: float = 0.02,
) -> dict:
    """Run shadow liquidation waterfall for a fund quarter.

    Pulls NAV per asset from re_asset_financial_state, computes hypothetical
    proceeds, and applies waterfall tiers.
    """
    from app.services.re_valuation import get_asset_financial_states_for_fund

    asset_states = get_asset_financial_states_for_fund(fin_fund_id, quarter)
    if not asset_states:
        raise LookupError(f"No asset states for fund {fin_fund_id} quarter {quarter}")

    # Get fund terms for pref/carry rates
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM fin_fund WHERE fin_fund_id = %s",
            (fin_fund_id,),
        )
        fund = cur.fetchone()
    if not fund:
        raise LookupError(f"Fund not found: {fin_fund_id}")

    pref_rate = _d(fund.get("pref_rate", 0.08))
    carry_rate = _d(fund.get("carry_rate", 0.20))
    catchup_rate = _d(fund.get("catchup_rate", 1.0))
    pref_is_compound = fund.get("pref_is_compound", False)

    # Default tier structure
    tiers = [
        {"tier_order": 1, "tier_type": "return_of_capital"},
        {"tier_order": 2, "tier_type": "preferred_return"},
        {"tier_order": 3, "tier_type": "catch_up", "catchup_rate": float(catchup_rate), "split_pct_gp": float(carry_rate)},
        {"tier_order": 4, "tier_type": "carry_split", "split_pct_gp": float(carry_rate)},
    ]

    # If a rule version is specified, load tiers from DB
    if fin_rule_version_id:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM fin_allocation_tier
                WHERE fin_rule_version_id = %s
                ORDER BY tier_order
                """,
                (fin_rule_version_id,),
            )
            db_tiers = cur.fetchall()
            if db_tiers:
                tiers = db_tiers

    # Compute per-asset liquidation proceeds
    asset_proceeds = []
    valuation_snapshot_ids = []
    total_gross = Decimal(0)
    total_debt = Decimal(0)
    total_sale = Decimal(0)
    total_net = Decimal(0)

    for state in asset_states:
        gross = _d(state["implied_gross_value"])
        debt = _d(state["loan_balance"] or 0)
        costs = (gross * _d(sale_costs_pct)).quantize(TWO_PLACES, ROUND_HALF_UP)
        net = (gross - costs - debt).quantize(TWO_PLACES, ROUND_HALF_UP)

        asset_proceeds.append({
            "fin_asset_investment_id": str(state["fin_asset_investment_id"]),
            "gross_value": str(gross),
            "debt_payoff": str(debt),
            "sale_costs": str(costs),
            "net_cash": str(net),
        })
        valuation_snapshot_ids.append(str(state["valuation_snapshot_id"]))
        total_gross += gross
        total_debt += debt
        total_sale += costs
        total_net += net

    # Aggregate contributions/distributions
    total_contributions = sum(_d(s.get("cumulative_contributions") or 0) for s in asset_states)
    accrued_pref_total = sum(_d(s.get("accrued_pref") or 0) for s in asset_states)

    if waterfall_style == "american":
        # Deal-by-deal: run tiers per asset, then aggregate
        all_allocations = []
        total_gp_carry = Decimal(0)
        for ap in asset_proceeds:
            net = _d(ap["net_cash"])
            # Approximate per-asset contribution proportionally
            weight = _d(ap["gross_value"]) / total_gross if total_gross > 0 else Decimal(0)
            asset_contribs = (total_contributions * weight).quantize(TWO_PLACES, ROUND_HALF_UP)
            asset_pref = (accrued_pref_total * weight).quantize(TWO_PLACES, ROUND_HALF_UP)
            tier_allocs = apply_waterfall_tiers(
                net_cash=net,
                total_contributions=asset_contribs,
                accrued_pref=asset_pref,
                tiers=tiers,
                pref_rate=pref_rate,
                pref_is_compound=pref_is_compound,
            )
            gp_carry = sum(_d(a.get("gp_amount", 0)) for a in tier_allocs)
            total_gp_carry += gp_carry
            all_allocations.append({
                "asset_id": ap["fin_asset_investment_id"],
                "tiers": [{k: str(v) for k, v in a.items()} for a in tier_allocs],
                "gp_carry": str(gp_carry),
            })

        tier_allocations = all_allocations
        gp_carry_earned = total_gp_carry
        # Clawback: if any deal had negative carry exposure
        clawback = max(-total_gp_carry, Decimal(0))

    else:  # european
        tier_allocs = apply_waterfall_tiers(
            net_cash=total_net,
            total_contributions=total_contributions,
            accrued_pref=accrued_pref_total,
            tiers=tiers,
            pref_rate=pref_rate,
            pref_is_compound=pref_is_compound,
        )
        gp_carry_earned = sum(_d(a.get("gp_amount", 0)) for a in tier_allocs)
        clawback = Decimal(0)
        tier_allocations = [{k: str(v) for k, v in a.items()} for a in tier_allocs]

    # Per-investor allocations (proportional to contributions)
    investor_allocations = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT fin_participant_id, committed_amount
            FROM fin_commitment
            WHERE fin_fund_id = %s AND status = 'active'
            """,
            (fin_fund_id,),
        )
        commitments = cur.fetchall()

    total_committed = sum(_d(c["committed_amount"]) for c in commitments)
    for c in commitments:
        weight = _d(c["committed_amount"]) / total_committed if total_committed > 0 else Decimal(0)
        lp_share = (total_net - gp_carry_earned) * weight
        investor_allocations.append({
            "fin_participant_id": str(c["fin_participant_id"]),
            "weight": str(weight.quantize(Decimal("0.000001"), ROUND_HALF_UP)),
            "allocation": str(lp_share.quantize(TWO_PLACES, ROUND_HALF_UP)),
        })

    # Store waterfall snapshot
    snapshot_id = str(uuid.uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_waterfall_snapshot (
                waterfall_snapshot_id, fin_fund_id, quarter,
                waterfall_style, fin_rule_version_id,
                total_gross_value, total_net_cash, total_debt_payoff, total_sale_costs,
                gp_carry_earned, gp_carry_paid, clawback_exposure,
                tier_allocations_json, asset_proceeds_json, investor_allocations_json,
                valuation_snapshot_ids
            ) VALUES (
                %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s
            )
            RETURNING *
            """,
            (
                snapshot_id, fin_fund_id, quarter,
                waterfall_style, fin_rule_version_id,
                str(total_gross), str(total_net), str(total_debt), str(total_sale),
                str(gp_carry_earned), "0", str(clawback),
                json.dumps(tier_allocations),
                json.dumps(asset_proceeds),
                json.dumps(investor_allocations),
                valuation_snapshot_ids,
            ),
        )
        snapshot = cur.fetchone()

    emit_log(
        level="info",
        service="re_waterfall",
        action="waterfall.run_shadow",
        message=f"Shadow waterfall complete for fund {fin_fund_id} {quarter}",
        context={
            "fin_fund_id": fin_fund_id,
            "quarter": quarter,
            "waterfall_style": waterfall_style,
            "waterfall_snapshot_id": snapshot_id,
            "total_net_cash": str(total_net),
            "gp_carry_earned": str(gp_carry_earned),
        },
    )

    return {
        "waterfall_snapshot": snapshot,
        "tier_allocations": tier_allocations,
        "asset_proceeds": asset_proceeds,
        "investor_allocations": investor_allocations,
        "gp_carry_earned": str(gp_carry_earned),
        "clawback_exposure": str(clawback),
    }


def get_waterfall_snapshot(fin_fund_id: str, quarter: str) -> dict:
    """Get the most recent waterfall snapshot for a fund quarter."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_waterfall_snapshot
            WHERE fin_fund_id = %s AND quarter = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (fin_fund_id, quarter),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"No waterfall snapshot for fund {fin_fund_id} quarter {quarter}")
    return row
