"""Scenario run engine: loads base schedules, applies overrides, recalculates
cash flows (revenue, expense, amort, NOI), and persists outputs.

NOI_cash = revenue - expense
NOI_GAAP = revenue - expense - amort
"""

from __future__ import annotations

import hashlib
import json
from uuid import UUID

from app.db import get_cursor
from app.services import re_model_scenario


def run_scenario(*, scenario_id: UUID) -> dict:
    """Execute a deterministic scenario run.

    1. Load base schedules for all in-scope assets
    2. Apply overrides (revenue_delta_pct, expense_delta_pct, etc.)
    3. Recalculate NOI_cash and NOI_GAAP per period
    4. Generate per-asset and scenario-level outputs
    5. Persist to re_model_runs
    """
    scenario = re_model_scenario.get_scenario(scenario_id=scenario_id)
    model_id = str(scenario["model_id"])

    # Get scope and overrides
    scope_assets = re_model_scenario.list_scenario_assets(scenario_id=scenario_id)
    overrides = re_model_scenario.list_scenario_overrides(scenario_id=scenario_id)

    if not scope_assets:
        raise ValueError("No assets in scope. Add assets before running.")

    # Build override lookup: {asset_id: {key: value}}
    override_map: dict[str, dict] = {}
    for ov in overrides:
        sid = str(ov["scope_id"])
        if sid not in override_map:
            override_map[sid] = {}
        val = ov["value_json"]
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
        override_map[sid][ov["key"]] = val

    # Create run record
    inputs_hash = _compute_hash({"scope": [str(a["asset_id"]) for a in scope_assets], "overrides": override_map})

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_runs (scenario_id, status, started_at, inputs_hash)
            VALUES (%s, 'running', now(), %s)
            RETURNING id
            """,
            (str(scenario_id), inputs_hash),
        )
        run_id = str(cur.fetchone()["id"])

    try:
        # Process each asset
        asset_outputs = []
        for sa in scope_assets:
            asset_id = str(sa["asset_id"])
            asset_overrides = override_map.get(asset_id, {})

            schedules = _load_base_schedules(asset_id)
            adjusted = _apply_overrides(schedules, asset_overrides)
            computed = _compute_noi(adjusted)

            asset_outputs.append({
                "asset_id": asset_id,
                "asset_name": sa.get("asset_name", ""),
                "fund_name": sa.get("fund_name", ""),
                "source_fund_id": str(sa["source_fund_id"]) if sa.get("source_fund_id") else None,
                "periods": computed,
                "overrides_applied": asset_overrides,
            })

        # Generate scenario summary
        summary = _compute_scenario_summary(asset_outputs)

        outputs = {
            "assets": asset_outputs,
            "summary": summary,
        }

        # Persist results
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE re_model_runs
                SET status = 'success', finished_at = now(),
                    outputs_json = %s::jsonb, summary_json = %s::jsonb
                WHERE id = %s
                """,
                (json.dumps(outputs, default=str), json.dumps(summary, default=str), run_id),
            )

        return {
            "run_id": run_id,
            "scenario_id": str(scenario_id),
            "model_id": model_id,
            "status": "success",
            "assets_processed": len(asset_outputs),
            "summary": summary,
        }

    except Exception:
        with get_cursor() as cur:
            cur.execute(
                "UPDATE re_model_runs SET status = 'failed', finished_at = now() WHERE id = %s",
                (run_id,),
            )
        raise


def get_run(*, run_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, model_version_id, scenario_id, status,
                   started_at, finished_at, inputs_hash, engine_version,
                   outputs_json, summary_json, created_at
            FROM re_model_runs WHERE id = %s
            """,
            (str(run_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Run {run_id} not found")
        return row


def compare_scenarios(*, scenario_ids: list[UUID]) -> dict:
    """Compare outputs across multiple scenario runs (latest run each)."""
    results = []
    for sid in scenario_ids:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT id, scenario_id, status, outputs_json, summary_json
                FROM re_model_runs
                WHERE scenario_id = %s AND status = 'success'
                ORDER BY finished_at DESC LIMIT 1
                """,
                (str(sid),),
            )
            row = cur.fetchone()
            if row:
                scenario = re_model_scenario.get_scenario(scenario_id=sid)
                results.append({
                    "scenario_id": str(sid),
                    "scenario_name": scenario["name"],
                    "run_id": str(row["id"]),
                    "summary": row["summary_json"],
                    "outputs": row["outputs_json"],
                })

    if len(results) < 2:
        return {"scenarios": results, "comparison": None}

    # Build comparison: variance between first (base) and others
    base = results[0]
    comparisons = []
    for other in results[1:]:
        diff = _diff_summaries(base.get("summary") or {}, other.get("summary") or {})
        comparisons.append({
            "base_scenario": base["scenario_name"],
            "compare_scenario": other["scenario_name"],
            "variance": diff,
        })

    return {"scenarios": results, "comparison": comparisons}


# ── Internal helpers ─────────────────────────────────────────────────────────

def _load_base_schedules(asset_id: str) -> list[dict]:
    """Load revenue, expense, and amort schedules for an asset."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                r.period_date,
                COALESCE(r.revenue, 0) AS revenue,
                COALESCE(e.expense, 0) AS expense,
                COALESCE(am.amort_amount, 0) AS amort
            FROM asset_revenue_schedule r
            LEFT JOIN asset_expense_schedule e
                ON e.asset_id = r.asset_id AND e.period_date = r.period_date
            LEFT JOIN asset_amort_schedule am
                ON am.asset_id = r.asset_id AND am.period_date = r.period_date
            WHERE r.asset_id = %s
            ORDER BY r.period_date
            """,
            (asset_id,),
        )
        return cur.fetchall()


def _apply_overrides(schedules: list[dict], overrides: dict) -> list[dict]:
    """Apply override deltas to base schedules."""
    rev_delta = float(overrides.get("revenue_delta_pct", 0))
    exp_delta = float(overrides.get("expense_delta_pct", 0))
    amort_delta = float(overrides.get("amort_delta_pct", 0))
    noi_override = overrides.get("noi_override")
    capex_override = overrides.get("capex_override", 0)

    adjusted = []
    for row in schedules:
        revenue = float(row["revenue"]) * (1 + rev_delta / 100)
        expense = float(row["expense"]) * (1 + exp_delta / 100)
        amort = float(row["amort"]) * (1 + amort_delta / 100)
        capex = float(capex_override) if capex_override else 0

        adjusted.append({
            "period_date": str(row["period_date"]),
            "revenue": round(revenue, 2),
            "expense": round(expense, 2),
            "amort": round(amort, 2),
            "capex": round(capex, 2),
            "noi_override": float(noi_override) if noi_override is not None else None,
        })

    return adjusted


def _compute_noi(adjusted: list[dict]) -> list[dict]:
    """Compute NOI_cash and NOI_GAAP for each period."""
    results = []
    for row in adjusted:
        if row["noi_override"] is not None:
            noi_cash = row["noi_override"]
            noi_gaap = row["noi_override"] - row["amort"]
        else:
            noi_cash = row["revenue"] - row["expense"]
            noi_gaap = row["revenue"] - row["expense"] - row["amort"]

        results.append({
            "period_date": row["period_date"],
            "revenue": row["revenue"],
            "expense": row["expense"],
            "amort": row["amort"],
            "capex": row["capex"],
            "noi_cash": round(noi_cash, 2),
            "noi_gaap": round(noi_gaap, 2),
        })

    return results


def _compute_scenario_summary(asset_outputs: list[dict]) -> dict:
    """Aggregate scenario-level summary from per-asset outputs."""
    total_noi_cash = 0
    total_noi_gaap = 0
    total_revenue = 0
    total_expense = 0
    period_count = 0
    by_fund: dict[str, dict] = {}

    for ao in asset_outputs:
        fund_id = ao.get("source_fund_id") or "unassigned"
        fund_name = ao.get("fund_name") or "Unassigned"
        if fund_id not in by_fund:
            by_fund[fund_id] = {"fund_name": fund_name, "noi_cash": 0, "noi_gaap": 0, "asset_count": 0}
        by_fund[fund_id]["asset_count"] += 1

        for period in ao.get("periods", []):
            total_noi_cash += period["noi_cash"]
            total_noi_gaap += period["noi_gaap"]
            total_revenue += period["revenue"]
            total_expense += period["expense"]
            by_fund[fund_id]["noi_cash"] += period["noi_cash"]
            by_fund[fund_id]["noi_gaap"] += period["noi_gaap"]
            period_count += 1

    asset_count = len(asset_outputs)
    avg_noi_cash = round(total_noi_cash / asset_count, 2) if asset_count else 0
    avg_noi_gaap = round(total_noi_gaap / asset_count, 2) if asset_count else 0

    return {
        "asset_count": asset_count,
        "total_noi_cash": round(total_noi_cash, 2),
        "total_noi_gaap": round(total_noi_gaap, 2),
        "avg_noi_cash_per_asset": avg_noi_cash,
        "avg_noi_gaap_per_asset": avg_noi_gaap,
        "total_revenue": round(total_revenue, 2),
        "total_expense": round(total_expense, 2),
        "period_count": period_count,
        "by_fund": by_fund,
    }


def _diff_summaries(base: dict, other: dict) -> dict:
    """Compute variance between two scenario summaries."""
    variance = {}
    for key in ("total_noi_cash", "total_noi_gaap", "total_revenue", "total_expense"):
        b = float(base.get(key, 0))
        o = float(other.get(key, 0))
        variance[key] = {
            "base": b,
            "compare": o,
            "delta": round(o - b, 2),
            "delta_pct": round((o - b) / b * 100, 2) if b else 0,
        }
    return variance


def _compute_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
