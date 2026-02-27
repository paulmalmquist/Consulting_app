"""Waterfall scenario calculation service.

Runs a full scenario waterfall pipeline:
1. Validates all required ingredients (fund structure, ledger, assets, debt, valuations)
2. Applies scenario overrides (cap rate shift, NOI stress, etc.)
3. Recomputes asset valuations and cashflows under scenario
4. Executes waterfall with scenario-adjusted NAV
5. Stores immutable run artifact with tier-by-tier allocations per partner
6. Returns base vs scenario comparison

This is a SHADOW run — it never mutates base ledger data.
"""
from __future__ import annotations

import hashlib
import json
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


def _compute_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def validate_ingredients(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    scenario_id: UUID,
    quarter: str,
) -> dict:
    """Validate all ingredients required for a waterfall scenario run.

    Returns {ready: bool, missing: [...]} where missing lists ingredient categories
    that are absent or incomplete.
    """
    missing = []

    with get_cursor() as cur:
        # 1. Fund exists
        cur.execute(
            "SELECT fund_id, strategy_type FROM repe_fund WHERE fund_id = %s",
            (str(fund_id),),
        )
        fund = cur.fetchone()
        if not fund:
            missing.append({"category": "FUND_STRUCTURE", "detail": "Fund does not exist"})
            return {"ready": False, "missing": missing}

        # 2. Waterfall definition
        cur.execute(
            """SELECT definition_id FROM re_waterfall_definition
               WHERE fund_id = %s AND is_active = true LIMIT 1""",
            (str(fund_id),),
        )
        if not cur.fetchone():
            missing.append({"category": "WATERFALL_DEFINITION", "detail": "No active waterfall definition"})

        # 3. Partners + commitments
        cur.execute(
            """SELECT COUNT(*) AS cnt FROM re_partner_commitment
               WHERE fund_id = %s AND status = 'active'""",
            (str(fund_id),),
        )
        row = cur.fetchone()
        if not row or row["cnt"] == 0:
            missing.append({"category": "PARTNERS", "detail": "No partner commitments"})

        # 4. Capital ledger entries
        cur.execute(
            """SELECT COUNT(*) AS cnt FROM re_capital_ledger_entry
               WHERE fund_id = %s AND quarter <= %s""",
            (str(fund_id), quarter),
        )
        row = cur.fetchone()
        if not row or row["cnt"] == 0:
            missing.append({"category": "CAPITAL_LEDGER", "detail": "No capital ledger entries"})

        # 5. Fund quarter state (NAV)
        cur.execute(
            """SELECT fund_id FROM re_fund_quarter_state
               WHERE fund_id = %s AND quarter = %s LIMIT 1""",
            (str(fund_id), quarter),
        )
        if not cur.fetchone():
            missing.append({"category": "FUND_STATE", "detail": f"No fund quarter state for {quarter}"})

        # 6. Cash events
        cur.execute(
            """SELECT COUNT(*) AS cnt FROM re_cash_event
               WHERE env_id = %s AND business_id = %s AND fund_id = %s""",
            (env_id, str(business_id), str(fund_id)),
        )
        row = cur.fetchone()
        if not row or row["cnt"] == 0:
            missing.append({"category": "CASH_EVENTS", "detail": "No cash events (calls/distributions)"})

        # 7. Scenario exists
        cur.execute(
            "SELECT id FROM re_scenario WHERE id = %s AND fund_id = %s",
            (str(scenario_id), str(fund_id)),
        )
        if not cur.fetchone():
            missing.append({"category": "SCENARIO", "detail": "Scenario does not exist for this fund"})

        # 8. Investments / assets
        cur.execute(
            """SELECT COUNT(*) AS cnt FROM repe_deal
               WHERE fund_id = %s""",
            (str(fund_id),),
        )
        row = cur.fetchone()
        if not row or row["cnt"] == 0:
            missing.append({"category": "INVESTMENTS", "detail": "No investments in fund"})

    return {
        "ready": len(missing) == 0,
        "missing": missing,
    }


def run_waterfall_scenario(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    scenario_id: UUID,
    quarter: str,
    mode: str = "shadow",
) -> dict:
    """Execute a full waterfall scenario calculation.

    This is the main orchestrator:
    1. Validate ingredients
    2. Load scenario overrides
    3. Compute scenario-adjusted NAV (apply cap rate shifts, NOI stress)
    4. Run waterfall with adjusted distributable amount
    5. Compute scenario metrics (IRR, TVPI, DPI, RVPI)
    6. Store run artifact
    7. Return base vs scenario comparison with tier allocations
    """
    as_of = _quarter_end_date(quarter)

    # Validate ingredients
    validation = validate_ingredients(
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        scenario_id=scenario_id,
        quarter=quarter,
    )
    if not validation["ready"]:
        return {
            "status": "failed",
            "error": "missing_ingredients",
            "missing": validation["missing"],
            "fund_id": str(fund_id),
            "scenario_id": str(scenario_id),
            "quarter": quarter,
        }

    with get_cursor() as cur:
        # ── Create run record ────────────────────────────────────────────
        cur.execute(
            """INSERT INTO re_run
                (env_id, business_id, fund_id, quarter, scenario_id,
                 run_type, status, created_by)
               VALUES (%s, %s, %s, %s, %s, 'WATERFALL_SCENARIO', 'running', 'api')
               RETURNING *""",
            (env_id, str(business_id), str(fund_id), quarter, str(scenario_id)),
        )
        run_record = cur.fetchone()
        db_run_id = str(run_record["id"])

        # ── Load scenario overrides ──────────────────────────────────────
        cur.execute(
            """SELECT key, value FROM re_assumption_override
               WHERE scenario_id = %s
               ORDER BY key""",
            (str(scenario_id),),
        )
        overrides_raw = cur.fetchall()
        overrides = {r["key"]: r["value"] for r in overrides_raw}

        # Parse scenario parameters
        cap_rate_delta_bps = Decimal(str(overrides.get("exit_cap_rate_delta_bps", "0")))
        noi_stress_pct = Decimal(str(overrides.get("noi_stress_pct", "0")))
        exit_date_shift_months = int(overrides.get("exit_date_shift_months", "0"))

        # ── Load base fund state ─────────────────────────────────────────
        cur.execute(
            """SELECT portfolio_nav, total_committed, total_called, total_distributed
               FROM re_fund_quarter_state
               WHERE fund_id = %s AND quarter = %s
               ORDER BY created_at DESC LIMIT 1""",
            (str(fund_id), quarter),
        )
        fund_state = cur.fetchone()
        base_nav = Decimal(str(fund_state["portfolio_nav"]))

        # ── Compute scenario-adjusted NAV ────────────────────────────────
        # Apply cap rate shift: if cap rate goes up, value goes down
        # value_new = NOI / (base_cap_rate + delta)
        # Approximation: delta_value = -base_nav * (delta_bps / 10000) / base_cap_rate
        # Simplified: proportional adjustment
        nav_adjustment = Decimal("0")
        if cap_rate_delta_bps != 0:
            # Cap rate up → value down. +75bps on 5% cap rate = ~13% NAV decline
            # Simplified: pct_change ≈ -delta_bps / (base_cap_rate_bps + delta_bps)
            # Use conservative 5.5% base cap rate assumption
            base_cap_bps = Decimal("550")  # 5.50% base cap rate
            pct_impact = cap_rate_delta_bps / (base_cap_bps + cap_rate_delta_bps)
            nav_adjustment -= (base_nav * pct_impact).quantize(Decimal("0.01"))

        if noi_stress_pct != 0:
            # NOI stress directly reduces NAV proportionally
            nav_adjustment -= (base_nav * noi_stress_pct / Decimal("100")).quantize(Decimal("0.01"))

        scenario_nav = max(base_nav + nav_adjustment, Decimal("0"))

        # ── Load base cash events ────────────────────────────────────────
        cur.execute(
            """SELECT event_date, event_type, amount
               FROM re_cash_event
               WHERE env_id = %s AND business_id = %s AND fund_id = %s
                 AND event_type IN ('CALL', 'DIST')
                 AND event_date <= %s
               ORDER BY event_date""",
            (env_id, str(business_id), str(fund_id), str(as_of)),
        )
        cash_events = cur.fetchall()

        # Build cashflows for XIRR
        cashflows: list[tuple[date, Decimal]] = []
        total_called = Decimal("0")
        total_distributed = Decimal("0")
        for ev in cash_events:
            amt = Decimal(str(ev["amount"]))
            dt = ev["event_date"] if isinstance(ev["event_date"], date) else date.fromisoformat(str(ev["event_date"]))
            if ev["event_type"] == "CALL":
                cashflows.append((dt, -amt))
                total_called += amt
            else:
                cashflows.append((dt, amt))
                total_distributed += amt

        # Add scenario-adjusted terminal NAV
        if scenario_nav > 0:
            cashflows.append((as_of, scenario_nav))

        # ── Compute scenario metrics ─────────────────────────────────────
        scenario_gross_irr = _xirr(cashflows) if len(cashflows) >= 2 else None
        scenario_gross_tvpi = (
            ((total_distributed + scenario_nav) / total_called).quantize(Decimal("0.0001"))
            if total_called > 0 else None
        )
        scenario_dpi = (
            (total_distributed / total_called).quantize(Decimal("0.0001"))
            if total_called > 0 else None
        )
        scenario_rvpi = (
            (scenario_nav / total_called).quantize(Decimal("0.0001"))
            if total_called > 0 else None
        )

        # ── Load fees/expenses for net calculation ───────────────────────
        cur.execute(
            """SELECT COALESCE(SUM(amount), 0) AS total
               FROM re_fee_accrual_qtr
               WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter <= %s""",
            (env_id, str(business_id), str(fund_id), quarter),
        )
        mgmt_fees = Decimal(str(cur.fetchone()["total"]))

        cur.execute(
            """SELECT COALESCE(SUM(amount), 0) AS total
               FROM re_fund_expense_qtr
               WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter <= %s""",
            (env_id, str(business_id), str(fund_id), quarter),
        )
        fund_expenses = Decimal(str(cur.fetchone()["total"]))

        # ── Run waterfall with scenario NAV ──────────────────────────────
        waterfall_run_id = None
        tier_allocations = []
        carry_from_waterfall = Decimal("0")

        try:
            from app.finance.waterfall_engine import (
                ParticipantState,
                WaterfallContract,
                WaterfallInput,
                run_us_waterfall,
            )

            # Load waterfall definition
            cur.execute(
                """SELECT * FROM re_waterfall_definition
                   WHERE fund_id = %s AND is_active = true
                   ORDER BY version DESC LIMIT 1""",
                (str(fund_id),),
            )
            wf_def = cur.fetchone()

            if wf_def:
                defn_id = wf_def["definition_id"]

                # Load tiers
                cur.execute(
                    """SELECT * FROM re_waterfall_tier
                       WHERE definition_id = %s ORDER BY tier_order""",
                    (str(defn_id),),
                )
                tiers = cur.fetchall()

                # Load partners
                cur.execute(
                    """SELECT p.partner_id, p.name, p.partner_type, pc.committed_amount
                       FROM re_partner p
                       JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
                       WHERE pc.fund_id = %s
                       ORDER BY p.partner_type, p.name""",
                    (str(fund_id),),
                )
                partners = cur.fetchall()

                # Build participant states
                participant_states = []
                for p in partners:
                    cur.execute(
                        """SELECT
                            COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS contributed,
                            COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS distributed
                           FROM re_capital_ledger_entry
                           WHERE fund_id = %s AND partner_id = %s AND quarter <= %s""",
                        (str(fund_id), str(p["partner_id"]), quarter),
                    )
                    bal = cur.fetchone()
                    contributed = Decimal(str(bal["contributed"]))
                    distributed = Decimal(str(bal["distributed"]))
                    unreturned = max(contributed - distributed, Decimal("0"))
                    role = "lp" if p["partner_type"] in ("lp", "co_invest") else "gp"

                    participant_states.append(
                        ParticipantState(
                            participant_id=str(p["partner_id"]),
                            role=role,
                            commitment_amount=Decimal(str(p["committed_amount"])),
                            unreturned_capital=unreturned,
                            pref_due=Decimal("0"),
                        )
                    )

                # Build contract from tiers
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

                wf_input = WaterfallInput(
                    as_of_date=None,
                    distribution_amount=scenario_nav,
                    gp_profit_paid_to_date=Decimal("0"),
                    lp_profit_paid_to_date=Decimal("0"),
                    participants=tuple(participant_states),
                )

                allocation_lines = run_us_waterfall(contract, wf_input)

                # Store waterfall run
                wf_run_id = str(uuid4())
                inputs_hash = _compute_hash({
                    "definition_id": str(defn_id),
                    "scenario_id": str(scenario_id),
                    "scenario_nav": str(scenario_nav),
                    "quarter": quarter,
                    "overrides": overrides,
                })

                cur.execute(
                    """INSERT INTO re_waterfall_run
                        (run_id, fund_id, definition_id, quarter, scenario_id,
                         run_type, total_distributable, inputs_hash, status)
                       VALUES (%s, %s, %s, %s, %s, 'scenario', %s, %s, 'success')
                       RETURNING *""",
                    (wf_run_id, str(fund_id), str(defn_id), quarter,
                     str(scenario_id), _q(scenario_nav), inputs_hash),
                )
                cur.fetchone()  # discard — run record created
                waterfall_run_id = wf_run_id

                # Store allocation results and build partner map
                partner_name_map = {str(p["partner_id"]): p["name"] for p in partners}
                partner_type_map = {str(p["partner_id"]): p["partner_type"] for p in partners}

                for line in allocation_lines:
                    cur.execute(
                        """INSERT INTO re_waterfall_run_result
                            (run_id, partner_id, tier_code, payout_type, amount)
                           VALUES (%s, %s, %s, %s, %s)
                           RETURNING *""",
                        (wf_run_id, line.participant_id,
                         line.tier_code, line.payout_type,
                         _q(line.amount)),
                    )
                    cur.fetchone()  # discard — result row inserted

                    tier_allocations.append({
                        "tier_name": line.tier_code,
                        "partner_name": partner_name_map.get(line.participant_id, "Unknown"),
                        "partner_type": partner_type_map.get(line.participant_id, "unknown"),
                        "payout_type": line.payout_type,
                        "amount": str(line.amount.quantize(Decimal("0.01"))),
                    })

                    if "carry" in line.tier_code or "catch_up" in line.tier_code:
                        carry_from_waterfall += line.amount

        except (LookupError, ValueError, ImportError) as exc:
            emit_log(
                level="warn", service="backend",
                action="re.waterfall_scenario.waterfall_fallback",
                message=f"Waterfall engine fallback: {exc}",
            )
            # Simplified carry fallback
            gross_return = total_distributed + scenario_nav - total_called
            pref_hurdle = total_called * Decimal("0.08")
            if gross_return > pref_hurdle:
                carry_from_waterfall = ((gross_return - pref_hurdle) * Decimal("0.20")).quantize(Decimal("0.01"))

        # ── Compute net metrics ──────────────────────────────────────────
        carry_estimate = carry_from_waterfall.quantize(Decimal("0.01"))
        net_terminal = max(scenario_nav - mgmt_fees - fund_expenses - carry_estimate, Decimal("0"))

        # Net XIRR
        net_cashflows: list[tuple[date, Decimal]] = []
        for ev in cash_events:
            amt = Decimal(str(ev["amount"]))
            dt = ev["event_date"] if isinstance(ev["event_date"], date) else date.fromisoformat(str(ev["event_date"]))
            if ev["event_type"] == "CALL":
                net_cashflows.append((dt, -amt))
            else:
                net_cashflows.append((dt, amt))
        if net_terminal > 0:
            net_cashflows.append((as_of, net_terminal))

        scenario_net_irr = _xirr(net_cashflows) if len(net_cashflows) >= 2 else None
        scenario_net_tvpi = (
            ((total_distributed + net_terminal) / total_called).quantize(Decimal("0.0001"))
            if total_called > 0 else None
        )

        # ── Load base metrics for comparison ─────────────────────────────
        cur.execute(
            """SELECT gross_irr, net_irr, gross_tvpi, net_tvpi, dpi, rvpi
               FROM re_fund_metrics_qtr
               WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s
               ORDER BY id DESC LIMIT 1""",
            (env_id, str(business_id), str(fund_id), quarter),
        )
        base_metrics = cur.fetchone()

        base_gross_irr = Decimal(str(base_metrics["gross_irr"])) if base_metrics and base_metrics.get("gross_irr") else None
        base_net_irr = Decimal(str(base_metrics["net_irr"])) if base_metrics and base_metrics.get("net_irr") else None
        base_gross_tvpi = Decimal(str(base_metrics["gross_tvpi"])) if base_metrics and base_metrics.get("gross_tvpi") else None
        base_net_tvpi = Decimal(str(base_metrics["net_tvpi"])) if base_metrics and base_metrics.get("net_tvpi") else None
        base_dpi = Decimal(str(base_metrics["dpi"])) if base_metrics and base_metrics.get("dpi") else None
        base_rvpi = Decimal(str(base_metrics["rvpi"])) if base_metrics and base_metrics.get("rvpi") else None

        # ── Store scenario metrics snapshot ──────────────────────────────
        cur.execute(
            """INSERT INTO re_scenario_metrics_snapshot
                (fund_id, scenario_id, quarter, run_id, waterfall_run_id,
                 gross_irr, net_irr, gross_tvpi, net_tvpi,
                 dpi, rvpi, total_distributed, portfolio_nav, carry_estimate)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (fund_id, scenario_id, quarter, run_id)
               DO UPDATE SET
                   waterfall_run_id = EXCLUDED.waterfall_run_id,
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
               RETURNING *""",
            (
                str(fund_id), str(scenario_id), quarter,
                db_run_id, waterfall_run_id,
                _q(scenario_gross_irr), _q(scenario_net_irr),
                _q(scenario_gross_tvpi), _q(scenario_net_tvpi),
                _q(scenario_dpi), _q(scenario_rvpi),
                _q(total_distributed), _q(scenario_nav),
                _q(carry_estimate),
            ),
        )
        snapshot = cur.fetchone()

        # ── Update run status ────────────────────────────────────────────
        output_hash = _compute_hash({
            "scenario_nav": str(scenario_nav),
            "gross_irr": str(scenario_gross_irr),
            "carry": str(carry_estimate),
            "waterfall_run_id": waterfall_run_id,
        })
        cur.execute(
            "UPDATE re_run SET status = 'success', output_hash = %s WHERE id = %s",
            (output_hash, db_run_id),
        )

    # ── Compute deltas ───────────────────────────────────────────────────
    def _delta(scenario_val, base_val):
        if scenario_val is not None and base_val is not None:
            return str((scenario_val - base_val).quantize(Decimal("0.0001")))
        return None

    emit_log(
        level="info", service="backend",
        action="re.waterfall_scenario.completed",
        message=f"Waterfall scenario run completed: fund={fund_id} scenario={scenario_id}",
        context={"run_id": db_run_id, "waterfall_run_id": waterfall_run_id},
    )

    return {
        "status": "success",
        "run_id": db_run_id,
        "waterfall_run_id": waterfall_run_id,
        "fund_id": str(fund_id),
        "scenario_id": str(scenario_id),
        "quarter": quarter,
        "mode": mode,
        # Scenario overrides applied
        "overrides": {
            "cap_rate_delta_bps": str(cap_rate_delta_bps),
            "noi_stress_pct": str(noi_stress_pct),
            "exit_date_shift_months": exit_date_shift_months,
        },
        # Base metrics
        "base": {
            "nav": str(base_nav) if fund_state else None,
            "gross_irr": str(base_gross_irr) if base_gross_irr else None,
            "net_irr": str(base_net_irr) if base_net_irr else None,
            "gross_tvpi": str(base_gross_tvpi) if base_gross_tvpi else None,
            "net_tvpi": str(base_net_tvpi) if base_net_tvpi else None,
            "dpi": str(base_dpi) if base_dpi else None,
            "rvpi": str(base_rvpi) if base_rvpi else None,
        },
        # Scenario metrics
        "scenario": {
            "nav": str(scenario_nav),
            "gross_irr": str(scenario_gross_irr) if scenario_gross_irr else None,
            "net_irr": str(scenario_net_irr) if scenario_net_irr else None,
            "gross_tvpi": str(scenario_gross_tvpi) if scenario_gross_tvpi else None,
            "net_tvpi": str(scenario_net_tvpi) if scenario_net_tvpi else None,
            "dpi": str(scenario_dpi) if scenario_dpi else None,
            "rvpi": str(scenario_rvpi) if scenario_rvpi else None,
        },
        # Deltas
        "deltas": {
            "nav": str(nav_adjustment),
            "gross_irr": _delta(scenario_gross_irr, base_gross_irr),
            "net_irr": _delta(scenario_net_irr, base_net_irr),
            "gross_tvpi": _delta(scenario_gross_tvpi, base_gross_tvpi),
        },
        # Carry
        "carry_estimate": str(carry_estimate),
        "mgmt_fees": str(mgmt_fees),
        "fund_expenses": str(fund_expenses),
        # Waterfall tier allocations
        "tier_allocations": tier_allocations,
        # Snapshot
        "snapshot_id": str(snapshot["id"]) if snapshot else None,
    }


def list_scenario_runs(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str | None = None,
) -> list[dict]:
    """List all waterfall scenario runs for a fund."""
    with get_cursor() as cur:
        conditions = [
            "env_id = %s", "business_id = %s", "fund_id = %s",
            "run_type = 'WATERFALL_SCENARIO'",
        ]
        params: list = [env_id, str(business_id), str(fund_id)]
        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)

        cur.execute(
            f"""SELECT r.*, s.name AS scenario_name
                FROM re_run r
                LEFT JOIN re_scenario s ON s.id::text = r.scenario_id
                WHERE {' AND '.join(conditions)}
                ORDER BY r.created_at DESC""",
            params,
        )
        return cur.fetchall()


def get_scenario_run_detail(
    *,
    run_id: UUID,
) -> dict | None:
    """Get detailed results for a specific waterfall scenario run."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM re_run WHERE id = %s", (str(run_id),))
        run = cur.fetchone()
        if not run:
            return None

        # Get scenario metrics snapshot
        cur.execute(
            """SELECT * FROM re_scenario_metrics_snapshot
               WHERE fund_id = %s AND scenario_id = %s AND quarter = %s
               ORDER BY computed_at DESC LIMIT 1""",
            (str(run["fund_id"]), str(run["scenario_id"]), run["quarter"]),
        )
        snapshot = cur.fetchone()

        # Get waterfall allocations if available
        allocations = []
        if snapshot and snapshot.get("waterfall_run_id"):
            cur.execute(
                """SELECT wrr.tier_code, wrr.payout_type, wrr.amount,
                          p.name AS partner_name, p.partner_type
                   FROM re_waterfall_run_result wrr
                   JOIN re_partner p ON p.partner_id::text = wrr.partner_id
                   WHERE wrr.run_id = %s
                   ORDER BY wrr.tier_code, p.partner_type, p.name""",
                (str(snapshot["waterfall_run_id"]),),
            )
            allocations = cur.fetchall()

        return {
            "run": run,
            "snapshot": snapshot,
            "allocations": allocations,
        }
