"""Model-scoped quarter close: runs the existing quarter-close pipeline
but filtered to only in-scope entities and with model-level overrides.

Reuses re_quarter_close._compute_asset_state and re_rollup for aggregation.
"""

from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.services import re_model
from app.services import re_provenance
from app.services import re_rollup
from app.services import re_scenario
from app.services import re_waterfall_runtime
from app.services import re_quarter_close


def run_model(
    *,
    model_id: UUID,
    quarter: str,
    accounting_basis: str = "accrual",
    valuation_method: str = "cap_rate",
    run_waterfall: bool = True,
    triggered_by: str = "model_run",
) -> dict:
    """Execute a full model run: compute quarter state for scoped entities,
    rollup to fund level, optionally run waterfall.

    Steps:
    1. Ensure a scenario exists for this model
    2. Sync model overrides → scenario overrides
    3. Run quarter close scoped to model entities
    4. Optionally run waterfall
    """
    model = re_model.get_model(model_id=model_id)
    fund_id = UUID(str(model["primary_fund_id"]))

    # 1. Ensure a scenario linked to this model
    scenario_id = _ensure_model_scenario(model_id, fund_id)

    # 2. Sync model overrides into the scenario
    _sync_model_overrides_to_scenario(model_id, scenario_id)

    # 3. Get scoped entities
    scoped_asset_ids = set(re_model.get_scoped_asset_ids(model_id=model_id))

    # 4. Start provenance run
    run_id_str = re_provenance.start_run(
        run_type="quarter_close",
        fund_id=fund_id,
        quarter=quarter,
        scenario_id=scenario_id,
        triggered_by=triggered_by,
    )
    run_id = UUID(run_id_str)

    try:
        result = _execute_model_quarter_close(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
            accounting_basis=accounting_basis,
            valuation_method=valuation_method,
            scoped_asset_ids=scoped_asset_ids,
            do_waterfall=run_waterfall,
        )

        re_provenance.complete_run(
            run_id=run_id_str,
            effective_assumptions_hash=result.get("assumptions_hash"),
            metadata={
                "model_id": str(model_id),
                "assets_processed": result.get("assets_processed", 0),
                "jvs_processed": result.get("jvs_processed", 0),
                "investments_processed": result.get("investments_processed", 0),
            },
        )

        # Persist per-investment results for UW vs Actual reporting
        _persist_investment_results(
            model_id=model_id,
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
        )

        result["run_id"] = run_id_str
        result["model_id"] = str(model_id)
        result["status"] = "success"
        return result

    except Exception as exc:
        re_provenance.fail_run(run_id=run_id_str, error_message=str(exc))
        raise


def _ensure_model_scenario(model_id: UUID, fund_id: UUID) -> UUID:
    """Find or create a scenario linked to this model."""
    model_name = re_model.get_model(model_id=model_id)["name"]
    scenario_name = f"__model__{model_name}"

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT scenario_id FROM re_scenario
            WHERE fund_id = %s AND model_id = %s AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), str(model_id)),
        )
        row = cur.fetchone()
        if row:
            return UUID(str(row["scenario_id"]))

        # Create a new scenario for this model
        cur.execute(
            """
            INSERT INTO re_scenario (
                fund_id, name, scenario_type, is_base, status, model_id
            )
            VALUES (%s, %s, 'custom', false, 'active', %s)
            ON CONFLICT (fund_id, name) DO UPDATE
            SET status = 'active', model_id = EXCLUDED.model_id
            RETURNING scenario_id
            """,
            (str(fund_id), scenario_name, str(model_id)),
        )
        return UUID(str(cur.fetchone()["scenario_id"]))


def _sync_model_overrides_to_scenario(model_id: UUID, scenario_id: UUID) -> None:
    """Copy model overrides into the scenario's assumption overrides."""
    overrides = re_model.list_model_overrides(model_id=model_id)

    # Clear existing scenario overrides for this model-linked scenario
    with get_cursor() as cur:
        cur.execute(
            "UPDATE re_assumption_override SET is_active = false WHERE scenario_id = %s",
            (str(scenario_id),),
        )

    # Apply each model override as a scenario override
    for ov in overrides:
        re_scenario.set_override(
            scenario_id=scenario_id,
            payload={
                "scope_node_type": ov["scope_node_type"],
                "scope_node_id": ov["scope_node_id"],
                "key": ov["key"],
                "value_type": ov["value_type"],
                "value_decimal": ov.get("value_decimal"),
                "value_int": ov.get("value_int"),
                "value_text": ov.get("value_text"),
                "value_json": ov.get("value_json"),
                "reason": ov.get("reason", "model override"),
            },
        )


def _execute_model_quarter_close(
    *,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID,
    run_id: UUID,
    accounting_basis: str,
    valuation_method: str,
    scoped_asset_ids: set[str],
    do_waterfall: bool,
) -> dict:
    """Run quarter close for scoped assets only, then rollup.

    For non-scoped assets, the existing Base quarter state is used unchanged.
    """
    with get_cursor() as cur:
        # Get all investments for this fund
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

            cur.execute(
                "SELECT jv_id FROM re_jv WHERE investment_id = %s",
                (str(inv_id),),
            )
            jvs = cur.fetchall()

            for jv in jvs:
                jv_id_val = jv["jv_id"]

                cur.execute(
                    "SELECT asset_id, asset_type FROM repe_asset WHERE jv_id = %s",
                    (str(jv_id_val),),
                )
                assets = cur.fetchall()

                for asset in assets:
                    asset_id_str = str(asset["asset_id"])
                    if asset_id_str in scoped_asset_ids or not scoped_asset_ids:
                        # In scope: recompute with model overrides
                        re_quarter_close._compute_asset_state(
                            cur=cur,
                            asset_id=UUID(asset_id_str),
                            asset_type=asset["asset_type"],
                            quarter=quarter,
                            scenario_id=scenario_id,
                            run_id=run_id,
                            accounting_basis=accounting_basis,
                            valuation_method=valuation_method,
                        )
                        assets_processed += 1

                # Rollup JV (uses scenario_id to pick up overridden asset states)
                re_rollup.rollup_jv(
                    jv_id=UUID(str(jv_id_val)),
                    quarter=quarter,
                    scenario_id=scenario_id,
                    run_id=run_id,
                )
                jvs_processed += 1

            # Rollup investment
            re_rollup.rollup_investment(
                investment_id=UUID(str(inv_id)),
                quarter=quarter,
                scenario_id=scenario_id,
                run_id=run_id,
            )
            investments_processed += 1

        # Rollup fund
        re_rollup.rollup_fund(
            fund_id=fund_id,
            quarter=quarter,
            scenario_id=scenario_id,
            run_id=run_id,
        )

    # Waterfall
    waterfall_result = None
    if do_waterfall:
        try:
            waterfall_result = re_waterfall_runtime.run_waterfall(
                fund_id=fund_id,
                quarter=quarter,
                scenario_id=scenario_id,
            )
        except Exception:
            pass  # Waterfall is optional

    return {
        "fund_id": str(fund_id),
        "quarter": quarter,
        "scenario_id": str(scenario_id),
        "assets_processed": assets_processed,
        "jvs_processed": jvs_processed,
        "investments_processed": investments_processed,
        "waterfall_run": waterfall_result,
    }


def _persist_investment_results(
    *,
    model_id: UUID,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID,
    run_id: UUID,
) -> None:
    """After model run, snapshot per-investment metrics into re_model_results_investment."""
    from app.services import re_uw_vs_actual

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT investment_id, irr, equity_multiple, nav, tvpi, dpi,
                   total_equity_called, total_distributions
            FROM re_investment_quarter_state
            WHERE fund_id = %s AND quarter = %s AND scenario_id = %s
            """,
            (str(fund_id), quarter, str(scenario_id)),
        )
        rows = cur.fetchall()

    for row in rows:
        metrics = {
            "irr": float(row["irr"]) if row.get("irr") is not None else None,
            "equity_multiple": float(row["equity_multiple"]) if row.get("equity_multiple") is not None else None,
            "nav": float(row["nav"]) if row.get("nav") is not None else None,
            "tvpi": float(row["tvpi"]) if row.get("tvpi") is not None else None,
            "dpi": float(row["dpi"]) if row.get("dpi") is not None else None,
            "quarter": quarter,
        }
        try:
            re_uw_vs_actual.store_model_results(
                model_id=model_id,
                investment_id=UUID(str(row["investment_id"])),
                metrics=metrics,
                run_id=run_id,
            )
        except Exception:
            pass  # Non-critical; don't fail the run
