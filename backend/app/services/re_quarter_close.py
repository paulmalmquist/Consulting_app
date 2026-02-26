from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import re_provenance
from app.services import re_rollup
from app.services import re_metrics
from app.services import re_capital_ledger
from app.services import re_waterfall_runtime


def _q(v: Decimal | None) -> Decimal | None:
    return Decimal(v).quantize(Decimal("0.000000000001")) if v is not None else None


def _compute_hash(data: dict) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


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


def run_quarter_close(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    accounting_basis: str = "accrual",
    valuation_method: str = "cap_rate",
    run_waterfall: bool = False,
    triggered_by: str | None = None,
) -> dict:
    run_id_str = re_provenance.start_run(
        run_type="quarter_close",
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        triggered_by=triggered_by,
    )
    run_id = UUID(run_id_str)

    try:
        result = _execute_quarter_close(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
            accounting_basis=accounting_basis,
            valuation_method=valuation_method,
            do_waterfall=run_waterfall,
        )

        re_provenance.complete_run(
            run_id=run_id_str,
            effective_assumptions_hash=result.get("assumptions_hash"),
            metadata={
                "assets_processed": result.get("assets_processed", 0),
                "jvs_processed": result.get("jvs_processed", 0),
                "investments_processed": result.get("investments_processed", 0),
            },
        )

        result["run_id"] = run_id_str
        result["status"] = "success"
        return result

    except Exception as exc:
        re_provenance.fail_run(run_id=run_id_str, error_message=str(exc))
        raise


def _execute_quarter_close(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None,
    run_id: UUID,
    accounting_basis: str,
    valuation_method: str,
    do_waterfall: bool,
) -> dict:
    as_of = _quarter_end_date(quarter)

    with get_cursor() as cur:
        # 1. Get all investments for this fund
        cur.execute(
            "SELECT deal_id AS investment_id FROM repe_deal WHERE fund_id = %s",
            (str(fund_id),),
        )
        investments = cur.fetchall()

        assets_processed = 0
        jvs_processed = 0
        investments_processed = 0

        for inv in investments:
            inv_id = inv["investment_id"]

            # 2. Get all JVs for this investment
            cur.execute(
                "SELECT jv_id FROM re_jv WHERE investment_id = %s",
                (str(inv_id),),
            )
            jvs = cur.fetchall()

            for jv in jvs:
                jv_id_val = jv["jv_id"]

                # 3. Get all assets for this JV
                cur.execute(
                    "SELECT asset_id, asset_type FROM repe_asset WHERE jv_id = %s",
                    (str(jv_id_val),),
                )
                assets = cur.fetchall()

                for asset in assets:
                    _compute_asset_state(
                        cur=cur,
                        asset_id=UUID(str(asset["asset_id"])),
                        asset_type=asset["asset_type"],
                        quarter=quarter,
                        scenario_id=scenario_id,
                        run_id=run_id,
                        accounting_basis=accounting_basis,
                        valuation_method=valuation_method,
                    )
                    assets_processed += 1

                # 4. Rollup JV
                re_rollup.rollup_jv(
                    jv_id=UUID(str(jv_id_val)),
                    quarter=quarter,
                    scenario_id=scenario_id,
                    run_id=run_id,
                )
                jvs_processed += 1

            # Also process assets attached directly to investment (no JV)
            cur.execute(
                """
                SELECT asset_id, asset_type FROM repe_asset
                WHERE deal_id = %s AND jv_id IS NULL
                """,
                (str(inv_id),),
            )
            direct_assets = cur.fetchall()
            for asset in direct_assets:
                _compute_asset_state(
                    cur=cur,
                    asset_id=UUID(str(asset["asset_id"])),
                    asset_type=asset["asset_type"],
                    quarter=quarter,
                    scenario_id=scenario_id,
                    run_id=run_id,
                    accounting_basis=accounting_basis,
                    valuation_method=valuation_method,
                )
                assets_processed += 1

            # 5. Rollup investment
            re_rollup.rollup_investment(
                investment_id=UUID(str(inv_id)),
                quarter=quarter,
                scenario_id=scenario_id,
                run_id=run_id,
            )
            investments_processed += 1

    # 6. Get capital totals from ledger
    totals = re_capital_ledger.compute_fund_totals(
        fund_id=fund_id, as_of_quarter=quarter
    )

    # 7. Rollup fund
    fund_state = re_rollup.rollup_fund(
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_id=run_id,
        total_committed=Decimal(totals["total_committed"]),
        total_called=Decimal(totals["total_called"]),
        total_distributed=Decimal(totals["total_distributed"]),
    )

    # 8. Compute fund-level metrics
    fund_metrics = re_metrics.compute_fund_metrics(
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        run_id=run_id,
        as_of_date=as_of,
    )

    # 9. Compute partner-level metrics
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.partner_id FROM re_partner p
            JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
            WHERE pc.fund_id = %s
            """,
            (str(fund_id),),
        )
        partners = cur.fetchall()

    for p in partners:
        re_metrics.compute_partner_metrics(
            fund_id=fund_id,
            partner_id=UUID(str(p["partner_id"])),
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
            as_of_date=as_of,
        )

    # 10. Optional waterfall
    waterfall_run = None
    if do_waterfall:
        try:
            waterfall_run = re_waterfall_runtime.run_waterfall(
                fund_id=fund_id,
                quarter=quarter,
                scenario_id=scenario_id,
                run_type="shadow",
            )
        except (LookupError, ValueError):
            pass

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "fund_state": fund_state,
        "fund_metrics": fund_metrics,
        "waterfall_run": waterfall_run,
        "assets_processed": assets_processed,
        "jvs_processed": jvs_processed,
        "investments_processed": investments_processed,
    }


def _compute_asset_state(
    *,
    cur,
    asset_id: UUID,
    asset_type: str,
    quarter: str,
    scenario_id: UUID | None,
    run_id: UUID,
    accounting_basis: str,
    valuation_method: str,
) -> dict:
    noi = Decimal("0")
    revenue = Decimal("0")
    opex = Decimal("0")
    capex = Decimal("0")
    debt_service = Decimal("0")
    occupancy = None
    debt_balance = Decimal("0")
    cash_balance = Decimal("0")
    asset_value = Decimal("0")

    if asset_type == "property":
        cur.execute(
            """
            SELECT pa.current_noi, pa.occupancy, a.cost_basis
            FROM repe_property_asset pa
            JOIN repe_asset a ON a.asset_id = pa.asset_id
            WHERE pa.asset_id = %s
            """,
            (str(asset_id),),
        )
        prop = cur.fetchone()
        if prop:
            noi = Decimal(prop["current_noi"] or 0)
            occupancy = prop["occupancy"]
            cost_basis = Decimal(prop["cost_basis"] or 0)

            if valuation_method == "cap_rate" and noi > 0:
                cap_rate = Decimal("0.06")
                asset_value = (noi / cap_rate).quantize(Decimal("0.01"))
            else:
                asset_value = cost_basis

            revenue = noi
    else:
        cur.execute(
            "SELECT * FROM re_loan_detail WHERE asset_id = %s",
            (str(asset_id),),
        )
        loan = cur.fetchone()
        if loan:
            debt_balance = Decimal(loan["current_balance"] or 0)
            asset_value = debt_balance
            if loan.get("coupon"):
                revenue = (debt_balance * Decimal(loan["coupon"])).quantize(Decimal("0.01"))

    nav = asset_value - debt_balance + cash_balance

    inputs_hash = _compute_hash({
        "asset_id": str(asset_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id) if scenario_id else None,
        "noi": str(noi),
        "asset_value": str(asset_value),
        "debt_balance": str(debt_balance),
        "valuation_method": valuation_method,
    })

    cur.execute(
        """
        INSERT INTO re_asset_quarter_state (
            asset_id, quarter, scenario_id, run_id, accounting_basis,
            noi, revenue, opex, capex, debt_service,
            occupancy, debt_balance, cash_balance,
            asset_value, nav, valuation_method, inputs_hash
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            run_id = EXCLUDED.run_id,
            accounting_basis = EXCLUDED.accounting_basis,
            noi = EXCLUDED.noi,
            revenue = EXCLUDED.revenue,
            opex = EXCLUDED.opex,
            capex = EXCLUDED.capex,
            debt_service = EXCLUDED.debt_service,
            occupancy = EXCLUDED.occupancy,
            debt_balance = EXCLUDED.debt_balance,
            cash_balance = EXCLUDED.cash_balance,
            asset_value = EXCLUDED.asset_value,
            nav = EXCLUDED.nav,
            valuation_method = EXCLUDED.valuation_method,
            inputs_hash = EXCLUDED.inputs_hash,
            created_at = now()
        RETURNING *
        """,
        (
            str(asset_id), quarter,
            str(scenario_id) if scenario_id else None,
            str(run_id), accounting_basis,
            _q(noi), _q(revenue), _q(opex), _q(capex), _q(debt_service),
            occupancy, _q(debt_balance), _q(cash_balance),
            _q(asset_value), _q(nav), valuation_method, inputs_hash,
        ),
    )
    return cur.fetchone()
