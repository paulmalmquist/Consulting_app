from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from uuid import UUID, uuid4

from app.db import get_cursor
from app.finance.waterfall_engine import (
    AllocationLine,
    ParticipantState,
    WaterfallContract,
    WaterfallInput,
    run_us_waterfall,
)


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def _compute_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def run_waterfall(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    run_type: str = "shadow",
    definition_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        # 1. Load waterfall definition
        if definition_id:
            cur.execute(
                "SELECT * FROM re_waterfall_definition WHERE definition_id = %s",
                (str(definition_id),),
            )
        else:
            cur.execute(
                """
                SELECT * FROM re_waterfall_definition
                WHERE fund_id = %s AND is_active = true
                ORDER BY version DESC LIMIT 1
                """,
                (str(fund_id),),
            )
        wf_def = cur.fetchone()
        if not wf_def:
            raise LookupError(f"No active waterfall definition for fund {fund_id}")

        defn_id = wf_def["definition_id"]

        # 2. Load tiers
        cur.execute(
            """
            SELECT * FROM re_waterfall_tier
            WHERE definition_id = %s
            ORDER BY tier_order
            """,
            (str(defn_id),),
        )
        tiers = cur.fetchall()

        # 3. Load fund NAV from quarter state
        scenario_clause = "scenario_id = %s" if scenario_id else "scenario_id IS NULL"
        params = [str(fund_id), quarter]
        if scenario_id:
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT portfolio_nav, total_committed, total_called, total_distributed
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND {scenario_clause}
            ORDER BY created_at DESC LIMIT 1
            """,
            params,
        )
        fund_state = cur.fetchone()
        if not fund_state:
            raise LookupError(f"No fund quarter state for fund {fund_id} quarter {quarter}")

        portfolio_nav = Decimal(fund_state["portfolio_nav"] or 0)

        # 4. Load partner commitments and capital balances
        cur.execute(
            """
            SELECT p.partner_id, p.name, p.partner_type,
                   pc.committed_amount
            FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s
            ORDER BY p.partner_type, p.name
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

        if not partners:
            raise ValueError(f"No partners with commitments for fund {fund_id}")

        # Build participant states from capital ledger
        participant_states = []
        for p in partners:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS total_contributed,
                    COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS total_distributed
                FROM re_capital_ledger_entry
                WHERE fund_id = %s AND partner_id = %s AND quarter <= %s
                """,
                (str(fund_id), str(p["partner_id"]), quarter),
            )
            balances = cur.fetchone()

            contributed = Decimal(balances["total_contributed"])
            distributed = Decimal(balances["total_distributed"])
            unreturned = max(contributed - distributed, Decimal("0"))

            role = "lp" if p["partner_type"] in ("lp", "co_invest") else "gp"

            participant_states.append(
                ParticipantState(
                    participant_id=str(p["partner_id"]),
                    role=role,
                    commitment_amount=Decimal(p["committed_amount"]),
                    unreturned_capital=unreturned,
                    pref_due=Decimal("0"),
                )
            )

        # 5. Build waterfall contract from tiers
        pref_rate = Decimal("0.08")
        carry_rate = Decimal("0.20")
        catchup_rate = Decimal("1.0")

        for t in tiers:
            if t["tier_type"] == "preferred_return" and t.get("hurdle_rate"):
                pref_rate = Decimal(str(t["hurdle_rate"]))
            if t["tier_type"] in ("split", "promote") and t.get("split_gp"):
                carry_rate = Decimal(str(t["split_gp"]))
            if t["tier_type"] == "catch_up" and t.get("catch_up_percent"):
                catchup_rate = Decimal(str(t["catch_up_percent"]))

        contract = WaterfallContract(
            pref_rate=pref_rate,
            pref_is_compound=False,
            carry_rate=carry_rate,
            catchup_rate=catchup_rate,
            style=wf_def["waterfall_type"],
        )

        # 6. Run waterfall
        distributable = portfolio_nav
        wf_input = WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=tuple(participant_states),
        )

        allocation_lines: list[AllocationLine] = run_us_waterfall(contract, wf_input)

        # 7. Compute inputs hash
        inputs_hash = _compute_hash({
            "definition_id": str(defn_id),
            "definition_version": wf_def["version"],
            "fund_nav": str(portfolio_nav),
            "partner_ids": sorted(str(p["partner_id"]) for p in partners),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
        })

        # 8. Store waterfall run
        run_id = str(uuid4())
        cur.execute(
            """
            INSERT INTO re_waterfall_run (
                run_id, fund_id, definition_id, quarter,
                scenario_id, run_type, total_distributable,
                inputs_hash, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'success')
            RETURNING *
            """,
            (
                run_id, str(fund_id), str(defn_id), quarter,
                str(scenario_id) if scenario_id else None,
                run_type, _q(distributable), inputs_hash,
            ),
        )
        wf_run = cur.fetchone()

        # 9. Store results
        results = []
        for line in allocation_lines:
            cur.execute(
                """
                INSERT INTO re_waterfall_run_result (
                    run_id, partner_id, tier_code, payout_type, amount
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    run_id, line.participant_id,
                    line.tier_code, line.payout_type, _q(line.amount),
                ),
            )
            results.append(cur.fetchone())

        wf_run["results"] = results
        return wf_run
