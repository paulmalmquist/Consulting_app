"""g10 — AI/ML outputs (convo.md §4 Phase 9, §12 scoring, §13 Screen 5).

DETERMINISTIC SYNTHETIC ML *OUTPUTS* — not real training. Generates a model registry,
version history with model-card-ready eval fields, scored predictions with explainability
(top_drivers_json) tied to real upstream causes, an AI action log, and human feedback.

Hard contract (PR #146): similarity/match outputs CONSUME g07's feature windows via
waveforms.run_vectors_from_windows / nearest_runs. g10 does NOT recompute similarity from
raw telemetry samples and does NOT reinvent SCN-005 — it surfaces the golden-pair match that
already exists in the data, explained, never pretending the two runs are identical.

Tables:
  dim_model              — the 6 model types (registry).
  dim_model_version      — version history; one @champion per model, eval metrics, model-card fields.
  fact_ml_prediction     — scored entities; score + top_drivers_json + decision_this_informs + scenario_id.
  fact_ai_action_log     — AI usage history (predictions surfaced / queries answered).
  fact_human_feedback    — accepted / rejected / needs_review / escalated, per the config mix.
"""

from __future__ import annotations

import json

from .. import ids, waveforms
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import GENERATOR_VERSION
from ..lineage import SourceSystem as SS

_SCN5 = "SCN-005-HOTFIRE-ANOMALY-SIMILARITY"


def run(ctx: BuildContext, ds: Dataset) -> None:
    models = _models(ctx, ds)
    versions = _model_versions(ctx, ds, models)
    # champion version per model_id, indexed by the BASE model key the prediction emitters use
    # (the unscoped canonical type, e.g. test_anomaly_detector / defect_risk).
    base_to_model = {}
    for m in models:
        base = m["base_model_key"]
        # first (unscoped) model of each base type wins as the canonical champion holder.
        if base not in base_to_model and m["scope"] is None:
            base_to_model[base] = m["model_id"]
    champ_by_model_id = {v["model_id"]: v for v in versions if v["is_champion"]}
    champ = {base: champ_by_model_id[mid] for base, mid in base_to_model.items()}
    preds = _predictions(ctx, ds, models, champ)
    _ai_action_log(ctx, ds, preds)
    _human_feedback(ctx, ds, preds)


# --- registry ---------------------------------------------------------------
def _models(ctx: BuildContext, ds: Dataset) -> list[dict]:
    """The 6 canonical model types, padded to n('models') (convo §4 Phase 9 = 8-15) with
    deterministic scoped variants of the risk families (e.g. a defect-risk model per part
    family) — a realistic registry shape that keeps model_keys unique."""
    specs = ctx.scenario["ml"]["models"]
    n = ctx.n("models")
    # scope candidates for risk-family variants, in fixed order (deterministic). Enough to
    # cover the medium profile's higher n('models') without a silent cap.
    scopes = {
        "defect_risk": ["ENG-VALVE", "ENG-CHAMBER", "STR-BRACKET", "AVI-HARNESS", "SEN-ASSY"],
        "supplier_risk": ["weld_wire", "forging", "fastener"],
        "schedule_risk": ["final_assembly", "integration"],
        "test_anomaly_detector": ["hotfire", "pressure"],
    }
    entries = [dict(m, scope=None) for m in specs]   # the 6 base models first
    # append scoped variants round-robin until we hit n.
    pending = [(m["key"], s) for m in specs for s in scopes.get(m["key"], [])]
    for key, scope in pending:
        if len(entries) >= n:
            break
        base = next(m for m in specs if m["key"] == key)
        entries.append(dict(base, scope=scope))
    rows = []
    for i, m in enumerate(entries, start=1):
        scope = m.get("scope")
        model_key = f"{m['key']}@{scope}" if scope else m["key"]
        rows.append({
            "model_id": ids.model(i),
            "model_key": model_key,
            "base_model_key": m["key"],     # links variants back to the canonical type
            "family": m["family"],
            "scope": scope,
            "scored_entity": m["scored_entity"],
            "primary_metric": m["metric"],
            "description": f"{model_key.replace('_', ' ').title()} ({m['family']})",
            "scenario_id": None,
        })
    ds.add("dim_model", rows, key=["model_id"], source_system=SS.AIML)
    return rows


def _model_versions(ctx: BuildContext, ds: Dataset, models: list[dict]) -> list[dict]:
    rng = ctx.rng("dim_model_version")
    bands = ctx.scenario["ml"]["champion_eval"]
    n_total = ctx.n("model_versions")
    # spread n_total versions across the models, newest = champion.
    base = n_total // len(models)
    extra = n_total - base * len(models)
    rows = []
    for mi, m in enumerate(models):
        n_ver = base + (1 if mi < extra else 0)
        n_ver = max(n_ver, 1)
        champ_band = bands[m["family"]]
        for v in range(1, n_ver + 1):
            is_champ = (v == n_ver)
            # champion hits the band; older versions trail it by a small, deterministic amount.
            trail = (n_ver - v) * 0.015
            metrics = {}
            for metric, target in champ_band.items():
                if metric == "mae":           # lower is better -> older versions worse = higher
                    metrics[metric] = round(float(target) + trail, 4)
                else:
                    metrics[metric] = round(max(0.0, float(target) - trail), 4)
            train_rows = int(rng.integers(5000, 60000))
            rows.append({
                "model_version_id": ids.model_version(m["model_id"], v),
                "model_id": m["model_id"],
                "model_key": m["model_key"],
                "version": v,
                "is_champion": is_champ,
                "stage": "champion" if is_champ else "archived",
                "primary_metric": m["primary_metric"],
                "primary_metric_value": metrics.get(m["primary_metric"]),
                "eval_metrics_json": json.dumps(metrics, sort_keys=True),
                "training_rows": train_rows,
                "feature_set": _feature_set(m["family"]),
                "validation": "walk-forward (synthetic)",
                "model_card_summary": _model_card(m, is_champ, metrics),
                "scenario_id": None,
            })
    ds.add("dim_model_version", rows, key=["model_version_id"], source_system=SS.AIML)
    return rows


def _feature_set(family: str) -> str:
    return {
        "anomaly": "process_feature_window(std,slope,peak_to_peak) x channels",
        "risk": "part_family_risk,machine_drift,supplier_lot_risk,revision_risk,prior_ncr_count",
        "readiness": "tests_complete_pct,open_critical_ncr,unresolved_anomaly,blocker_age",
        "rag": "approved_doc_chunks,citations",
    }.get(family, "n/a")


def _model_card(m: dict, is_champ: bool, metrics: dict) -> str:
    stage = "Champion" if is_champ else "Archived"
    mtxt = ", ".join(f"{k}={v}" for k, v in sorted(metrics.items()))
    return (f"{stage} {m['model_key']} scores {m['scored_entity']}s. Metrics: {mtxt}. "
            f"Deterministic synthetic eval for demo; not a trained artifact.")


# --- predictions (tied to real causes) --------------------------------------
def _predictions(ctx: BuildContext, ds: Dataset, models: list[dict], champ: dict[str, dict]) -> list[dict]:
    rng = ctx.rng("fact_ml_prediction")
    n_target = ctx.n("ml_predictions")
    ndrivers = int(ctx.scenario["ml"]["top_drivers_count"])
    rows: list[dict] = []
    seq = 0

    def emit(model_key, entity_type, entity_id, score, drivers, decision, scenario_id):
        nonlocal seq
        seq += 1
        cv = champ[model_key]
        rows.append({
            "prediction_id": ids.ml_prediction(seq),
            "model_id": cv["model_id"],
            "model_version_id": cv["model_version_id"],
            "model_key": model_key,
            "scored_entity_type": entity_type,
            "scored_entity_id": entity_id,
            "score": round(float(score), 4),
            "top_drivers_json": json.dumps({"top_drivers": drivers[:ndrivers]}),
            "decision_this_informs": decision,
            "scenario_id": scenario_id,
        })

    # 1) SCN-005 anomaly match (consumes g07 feature windows — the golden pair) -----------
    scn5_pred = _scn005_prediction(ctx, ds, emit)

    # 2) test-anomaly scores for every hot-fire run (reconstruction-error proxy from windows)
    _anomaly_scores(ctx, ds, emit, ndrivers, exclude={scn5_pred} if scn5_pred else set())

    # 3) defect-risk on operations tied to WLD-07 drift / ML-8821 lot -----------------
    _defect_risk(ctx, ds, emit, ndrivers)

    # 4) supplier-risk on material lots (ML-8821 elevated) ----------------------------
    _supplier_risk(ctx, ds, emit, ndrivers)

    # 5) readiness on vehicles (TR-003 low) -------------------------------------------
    _readiness(ctx, ds, emit, ndrivers)

    # 6) fill remaining quota with deterministic schedule-risk on work orders ---------
    _fill_schedule_risk(ctx, ds, emit, ndrivers, rng, n_target, lambda: len(rows))

    ds.add("fact_ml_prediction", rows, key=["prediction_id"], source_system=SS.AIML)
    return rows


def _scn005_prediction(ctx: BuildContext, ds: Dataset, emit) -> str | None:
    cfg = ctx.scenario["ml"]["scn005_match"]
    target = cfg["target_run"]
    expected = cfg["expected_match_run"]
    # CONSUME g07 feature windows — never raw samples.
    vectors = waveforms.run_vectors_from_windows(ds.get("fact_process_feature_window").rows)
    if target not in vectors:
        return None
    ranked = waveforms.nearest_runs(target, vectors, k=3)
    best_run, best_sim = ranked[0]
    second_sim = ranked[1][1] if len(ranked) > 1 else 0.0
    drivers = [
        {"feature": "historical_failure_similarity", "impact": round(best_sim, 4),
         "match_run": best_run, "match_run_is_failed": True},
        {"feature": "shape_trajectory_correlation",
         "impact": round(best_sim - second_sim, 4)},
        {"feature": "pre_failure_signature_PF-TPL-01", "impact": 1.0},
    ]
    emit(cfg["model_key"], "test_run", target,
         score=best_sim, drivers=drivers,
         decision=cfg["decision_this_informs"], scenario_id=_SCN5)
    return target


def _anomaly_scores(ctx: BuildContext, ds: Dataset, emit, ndrivers: int, exclude: set) -> None:
    vectors = waveforms.run_vectors_from_windows(ds.get("fact_process_feature_window").rows)
    runs = {r["run_id"]: r for r in ds.get("raw_test_runs").rows}
    for run_id, r in sorted(runs.items()):
        if run_id in exclude or r["test_type"] != "HOTFIRE":
            continue
        ranked = waveforms.nearest_runs(run_id, vectors, k=1)
        sim = ranked[0][1] if ranked else 0.0
        # anomaly score = how strongly it resembles a known pre_failure trajectory.
        drivers = [
            {"feature": "historical_failure_similarity", "impact": round(sim, 4),
             "match_run": ranked[0][0] if ranked else None},
            {"feature": "limit_violation_weight",
             "impact": 0.2 if r["result"] == "fail" else 0.05},
            {"feature": "channel_drift_weight", "impact": 0.1},
        ]
        emit("test_anomaly_detector", "test_run", run_id,
             score=sim, drivers=drivers,
             decision="hot-fire disposition / launch-readiness review",
             scenario_id=r.get("scenario_id"))


def _defect_risk(ctx: BuildContext, ds: Dataset, emit, ndrivers: int) -> None:
    anchors = ctx.scenario["anchors"]
    wld = anchors["weld_machine"]
    bad_lot = anchors["bad_material_lot"]
    ops = ds.get("raw_mes_operation_executions")
    # operations on the drifting weld machine carry elevated defect risk (tied to SCN-003).
    drift_ops = [o for o in ops.sorted_rows() if o.get("machine_id") == wld][:200]
    for o in drift_ops:
        is_tagged = str(o.get("dq_defect_tag") or "") == "WLD07_DRIFT"
        drivers = [
            {"feature": f"machine_id_{wld}", "impact": 0.34},
            {"feature": "machine_drift_factor", "impact": 0.21 if is_tagged else 0.08},
            {"feature": f"material_lot_{bad_lot}", "impact": 0.18},
        ]
        emit("defect_risk", "operation", str(o["op_id"]),
             score=0.85 if is_tagged else 0.55,
             drivers=drivers, decision="prioritize inspection / containment",
             scenario_id=o.get("scenario_id") or "SCN-003-MACHINE-WLD07-CALIBRATION-DRIFT")


def _supplier_risk(ctx: BuildContext, ds: Dataset, emit, ndrivers: int) -> None:
    bad_lot = ctx.scenario["anchors"]["bad_material_lot"]
    supplier = ctx.scenario["anchors"]["aerometals_supplier_name"]
    # map supplier_id -> canonical name so we can name the driver.
    sup_name = {s["supplier_id"]: s.get("canonical_name") for s in ds.get("dim_supplier").rows}
    lots = ds.get("raw_erp_material_lots")
    for lot in lots.sorted_rows():
        lid = lot["lot_id"]
        name = sup_name.get(lot.get("supplier_id"))
        is_bad = (lid == bad_lot) or (str(name or "").startswith(supplier))
        drivers = [
            {"feature": "inspection_failure_rate", "impact": 0.31 if is_bad else 0.05},
            {"feature": f"supplier_{name or 'unknown'}", "impact": 0.22 if is_bad else 0.03},
            {"feature": "weld_porosity_pattern", "impact": 0.18 if is_bad else 0.0},
        ]
        emit("supplier_risk", "material_lot", str(lid),
             score=0.85 if is_bad else 0.12, drivers=drivers,
             decision="supplier corrective action / lot quarantine",
             scenario_id=lot.get("scenario_id"))


def _readiness(ctx: BuildContext, ds: Dataset, emit, ndrivers: int) -> None:
    blocked = ctx.scenario["anchors"]["blocked_vehicle"]
    for v in ds.get("dim_vehicle").rows:
        vid = v["vehicle_id"]
        is_blocked = vid == blocked
        drivers = [
            {"feature": "open_critical_ncr", "impact": 0.4 if is_blocked else 0.05},
            {"feature": "unresolved_anomaly", "impact": 0.3 if is_blocked else 0.0},
            {"feature": "missing_inspection_signoff", "impact": 0.2 if is_blocked else 0.02},
        ]
        # readiness score: lower = less ready. TR-003 is yellow.
        emit("readiness", "vehicle", vid,
             score=0.58 if is_blocked else 0.93, drivers=drivers,
             decision="launch-readiness gate review",
             scenario_id="SCN-001-VEHICLE-TR003-READINESS-BLOCKED" if is_blocked else None)


def _fill_schedule_risk(ctx, ds, emit, ndrivers, rng, n_target, current_count) -> None:
    wo_rows = ds.get("raw_mes_work_orders").sorted_rows()
    if not wo_rows:
        return
    i = 0
    while current_count() < n_target:
        wo = wo_rows[i % len(wo_rows)]
        wid = wo["wo_id"]
        base = float(rng.uniform(0.05, 0.7))
        drivers = [
            {"feature": "blocker_age_days", "impact": round(base * 0.5, 4)},
            {"feature": "open_operations", "impact": round(base * 0.3, 4)},
            {"feature": "material_shortage", "impact": round(base * 0.2, 4)},
        ]
        # a deterministic disambiguator keeps prediction_ids 1:1 with rows even when a WO repeats.
        emit("schedule_risk", "work_order", f"{wid}#{i}", score=base, drivers=drivers,
             decision="re-sequence / expedite", scenario_id=wo.get("scenario_id"))
        i += 1


# --- AI action log + human feedback -----------------------------------------
def _ai_action_log(ctx: BuildContext, ds: Dataset, preds: list[dict]) -> None:
    rng = ctx.rng("fact_ai_action_log")
    n = ctx.n("ai_action_log")
    actions = ["surfaced_prediction", "answered_query", "drafted_summary", "flagged_for_review"]
    preds_sorted = sorted(preds, key=lambda p: p["prediction_id"])
    rows = []
    for i in range(n):
        p = preds_sorted[i % len(preds_sorted)] if preds_sorted else None
        rows.append({
            "ai_action_id": ids.ai_action(i + 1),
            "action_type": actions[int(rng.integers(0, len(actions)))],
            "model_key": p["model_key"] if p else None,
            "prediction_id": p["prediction_id"] if p else None,
            "surface": str(rng.choice(["readiness", "anomaly_review", "factory_exceptions", "copilot"])),
            "scenario_id": p["scenario_id"] if p else None,
        })
    ds.add("fact_ai_action_log", rows, key=["ai_action_id"], source_system=SS.AIML)


def _human_feedback(ctx: BuildContext, ds: Dataset, preds: list[dict]) -> None:
    mix = ctx.scenario["ml"]["feedback_mix"]
    n = ctx.n("human_feedback")
    # realize the label mix EXACTLY (deterministic), not via sampling.
    labels = list(mix.keys())
    counts = {lab: int(round(mix[lab] * n)) for lab in labels}
    # fix rounding so counts sum to n.
    drift = n - sum(counts.values())
    counts[labels[0]] += drift
    preds_sorted = sorted(preds, key=lambda p: p["prediction_id"])
    rows = []
    i = 0
    for lab in labels:
        for _ in range(counts[lab]):
            p = preds_sorted[i % len(preds_sorted)] if preds_sorted else None
            rows.append({
                "feedback_id": ids.human_feedback(i + 1),
                "prediction_id": p["prediction_id"] if p else None,
                "model_key": p["model_key"] if p else None,
                "label": lab,
                "scenario_id": p["scenario_id"] if p else None,
            })
            i += 1
    ds.add("fact_human_feedback", rows, key=["feedback_id"], source_system=SS.AIML)


__all__ = ["run", "GENERATOR_VERSION"]
