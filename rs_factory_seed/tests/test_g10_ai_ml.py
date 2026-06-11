"""g10 tests: registry/version integrity, volumes, exact feedback mix, prediction RI, and the
SCN-005 ML output as a stable, explainable, not-identical golden match.

The SCN-005 ML assertions are the spine: the anomaly detector's match for 00088 must point at
00041 (g07's top-1), carry the COMPUTED similarity (>= threshold, < 1.0) in its explainability,
and never pretend the two runs are identical — the match is consumed from g07 feature windows,
not recomputed from raw samples."""

import json

from rs_factory_seed import waveforms
from rs_factory_seed.cli import build_dataset

_SCN5 = "SCN-005-HOTFIRE-ANOMALY-SIMILARITY"


def _by(ds, name, key):
    return {r[key]: r for r in ds.get(name).rows}


def test_g10_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("dim_model").rows) == 12
    assert len(ds.get("dim_model_version").rows) == 30
    assert len(ds.get("fact_ml_prediction").rows) == 5000
    assert len(ds.get("fact_ai_action_log").rows) == 1500
    assert len(ds.get("fact_human_feedback").rows) == 700


def test_registry_keys_unique_and_one_champion_per_model():
    _ctx, ds = build_dataset("small")
    models = ds.get("dim_model").rows
    keys = [m["model_key"] for m in models]
    assert len(keys) == len(set(keys)), "model_keys must be unique"
    versions = ds.get("dim_model_version").rows
    # every version points at a real model; exactly one champion per model.
    model_ids = {m["model_id"] for m in models}
    assert {v["model_id"] for v in versions} <= model_ids
    champs = {}
    for v in versions:
        if v["is_champion"]:
            champs.setdefault(v["model_id"], 0)
            champs[v["model_id"]] += 1
    assert all(c == 1 for c in champs.values()), "exactly one champion per model"
    assert set(champs) == model_ids, "every model has a champion version"


def test_model_versions_have_model_card_fields():
    _ctx, ds = build_dataset("small")
    for v in ds.get("dim_model_version").rows:
        assert v["eval_metrics_json"] and json.loads(v["eval_metrics_json"])
        assert v["primary_metric_value"] is not None
        assert v["feature_set"] and v["model_card_summary"]
        assert v["validation"] == "walk-forward (synthetic)"


def test_feedback_mix_is_exact():
    ctx, ds = build_dataset("small")
    mix = ctx.scenario["ml"]["feedback_mix"]
    n = len(ds.get("fact_human_feedback").rows)
    counts = {}
    for r in ds.get("fact_human_feedback").rows:
        counts[r["label"]] = counts.get(r["label"], 0) + 1
    # rounding lands on the configured proportions (drift absorbed by the first label).
    assert sum(counts.values()) == n == 700
    assert counts["rejected"] == round(mix["rejected"] * n)
    assert counts["needs_review"] == round(mix["needs_review"] * n)
    assert counts["escalated"] == round(mix["escalated"] * n)
    assert set(counts) == set(mix)


def test_predictions_reference_real_models_and_champions():
    _ctx, ds = build_dataset("small")
    model_ids = {m["model_id"] for m in ds.get("dim_model").rows}
    champ_version_ids = {v["model_version_id"] for v in ds.get("dim_model_version").rows
                         if v["is_champion"]}
    for p in ds.get("fact_ml_prediction").rows:
        assert p["model_id"] in model_ids
        assert p["model_version_id"] in champ_version_ids, "predictions must use the champion"
        drivers = json.loads(p["top_drivers_json"])["top_drivers"]
        assert 1 <= len(drivers) <= 3
        assert p["decision_this_informs"]          # every prediction names the decision it informs


def test_feedback_and_actions_reference_real_predictions():
    _ctx, ds = build_dataset("small")
    pred_ids = {p["prediction_id"] for p in ds.get("fact_ml_prediction").rows}
    for r in ds.get("fact_human_feedback").rows:
        assert r["prediction_id"] in pred_ids
    for r in ds.get("fact_ai_action_log").rows:
        assert r["prediction_id"] is None or r["prediction_id"] in pred_ids


def test_scenario_anchored_predictions_present():
    _ctx, ds = build_dataset("small")
    preds = ds.get("fact_ml_prediction").rows
    # TR-003 readiness is low and tagged; ML-8821 supplier risk elevated and tagged.
    readiness = {p["scored_entity_id"]: p for p in preds if p["model_key"] == "readiness"}
    assert readiness["VEH-TR-003"]["score"] < min(
        p["score"] for vid, p in readiness.items() if vid != "VEH-TR-003")
    assert readiness["VEH-TR-003"]["scenario_id"] == "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
    ml8821 = [p for p in preds if p["model_key"] == "supplier_risk"
              and p["scored_entity_id"] == "ML-8821"]
    assert ml8821 and ml8821[0]["scenario_id"] == "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK"
    assert ml8821[0]["score"] >= 0.8


def test_scn005_ml_output_is_stable_explainable_and_not_identical():
    ctx, ds = build_dataset("small")
    cfg = ctx.scenario["ml"]["scn005_match"]
    target, expected = cfg["target_run"], cfg["expected_match_run"]

    scn5 = [p for p in ds.get("fact_ml_prediction").rows if p["scenario_id"] == _SCN5]
    target_pred = next(p for p in scn5 if p["scored_entity_id"] == target)

    # right model + decision framing
    assert target_pred["model_key"] == cfg["model_key"] == "test_anomaly_detector"
    assert target_pred["decision_this_informs"] == cfg["decision_this_informs"]

    # explainability names the matched failed run as the top driver
    drivers = json.loads(target_pred["top_drivers_json"])["top_drivers"]
    top = drivers[0]
    assert top["feature"] == "historical_failure_similarity"
    assert top["match_run"] == expected, "00088's nearest match must be the prior failed run 00041"
    assert top.get("match_run_is_failed") is True

    # similarity is in-band: >= threshold and strictly < 1.0 (similar, NOT identical)
    sim = target_pred["score"]
    assert sim >= cfg["min_match_similarity"], f"match similarity {sim} below threshold"
    assert sim < cfg["must_be_below"], f"match similarity {sim} claims identity"


def test_scn005_match_recomputes_from_feature_windows_not_raw_samples():
    """The prediction's similarity must equal what the canonical feature-window path produces —
    proving g10 consumed g07's windows + run_feature_vector, not some other recomputation."""
    ctx, ds = build_dataset("small")
    cfg = ctx.scenario["ml"]["scn005_match"]
    target, expected = cfg["target_run"], cfg["expected_match_run"]

    vectors = waveforms.run_vectors_from_windows(ds.get("fact_process_feature_window").rows)
    ranked = waveforms.nearest_runs(target, vectors, k=2)
    assert ranked[0][0] == expected, "feature-window path: 00041 is top-1 for 00088"
    canonical_sim = round(ranked[0][1], 4)

    scn5 = [p for p in ds.get("fact_ml_prediction").rows if p["scenario_id"] == _SCN5]
    target_pred = next(p for p in scn5 if p["scored_entity_id"] == target)
    assert target_pred["score"] == canonical_sim, (
        f"prediction score {target_pred['score']} != canonical feature-window similarity "
        f"{canonical_sim} — g10 must consume the feature-window path")

    # margin over the second-best proves it's a real golden pair, not template-uniqueness luck.
    assert ranked[0][1] - ranked[1][1] > 0.3
