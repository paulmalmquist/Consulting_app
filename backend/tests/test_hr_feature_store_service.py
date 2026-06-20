"""A1 tests for the History Rhymes feature store (deterministic, no network).

Covers: registry completeness + id/quant_slot guards, the 6 signature formulas
vs the golden row, readiness (stale degrades / leakage⇒0), missingness policy
visibility, lineage, determinism, importance shape, encoder slotting, and
fail-closed run_feature (unknown id ⇒ unknown_feature_id).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.services.hr_feature_store import (
    FEATURE_FAMILIES,
    FEATURE_REGISTRY,
    MODEL_OBS_COLUMNS,
    QUANT_FEATURE_ORDER,
    build_feature_overview,
    build_pipeline_map,
    build_quality_board,
    encode_quant_block,
    enrich_observation,
    generate_macro_panel,
    latest_signatures,
    prepare_model_dataset,
    run_feature,
)
from app.services.hr_feature_store.importance import importance_across_models
from app.services.hr_feature_store.lineage import feature_lineage
from app.services.hr_feature_store.readiness import observation_readiness, readiness_for_feature
from app.services.hr_feature_store.registry import get_feature

GOLDEN = json.loads(
    (Path(__file__).parent / "fixtures" / "hr_feature_store" / "golden_feature_row_seed42.json").read_text()
)

ID_RE = re.compile(r"^[a-z0-9_]+$")
SIGNATURE_IDS = {
    "yield_curve_10y2y_velocity_30d", "yield_curve_10y2y_acceleration_30d",
    "credit_complacency_gap", "liquidity_fragmentation_score",
    "narrative_flow_mismatch", "non_event_counterexample_score", "model_readiness_score",
}


def test_registry_completeness_and_id_rules():
    families_present = {f["family"] for f in FEATURE_REGISTRY}
    assert set(FEATURE_FAMILIES) <= families_present, "every family must be represented"
    for f in FEATURE_REGISTRY:
        assert ID_RE.match(f["id"]), f"bad id {f['id']}"
        for key in ("name", "family", "definition", "formula", "source_dependencies",
                    "leakage_risk", "imputation_policy", "demo_explanation"):
            assert f.get(key) not in (None, ""), f"{f['id']} missing {key}"


def test_quant_slot_guard():
    # Encoder-promotion guard: any non-null quant_slot must exist in QUANT_FEATURE_ORDER.
    for f in FEATURE_REGISTRY:
        slot = f.get("quant_slot")
        if slot is not None:
            assert slot in QUANT_FEATURE_ORDER, f"{f['id']} claims unknown quant_slot {slot}"


def test_all_signature_ids_registered():
    ids = {f["id"] for f in FEATURE_REGISTRY}
    assert SIGNATURE_IDS <= ids


def test_dataset_deterministic_and_covers_canonical():
    a, b = generate_macro_panel(42), generate_macro_panel(42)
    assert a.equals(b)
    assert set(QUANT_FEATURE_ORDER) <= set(a.columns)


def test_signature_formulas_vs_golden():
    panel = generate_macro_panel()
    sigs = latest_signatures(panel)
    sigs["model_readiness_score"] = observation_readiness(panel)["score"]
    for fid, expected in GOLDEN["signature_values"].items():
        assert sigs[fid] == pytest.approx(expected, abs=1e-4), f"{fid} drifted"


def test_features_normalized_vs_golden():
    panel = generate_macro_panel()
    obs = enrich_observation(panel, -1)
    norm = obs["features_normalized"]
    assert set(norm.keys()) == set(QUANT_FEATURE_ORDER)
    for name, expected in GOLDEN["features_normalized"].items():
        assert round(float(norm[name]), 4) == pytest.approx(expected, abs=1e-4), f"{name} drifted"


def test_readiness_zero_for_leakage():
    r = readiness_for_feature(get_feature("resolved_trap_label"))
    assert r["score"] == 0.0
    assert any("leakage_blocked" in reason for reason in r["degrade_reasons"])


def test_readiness_degrades_for_stale_and_emits_reason():
    feature = get_feature("vix_spot_level")
    fresh = readiness_for_feature(feature)
    stale = readiness_for_feature(feature, freshness=0.5)
    assert stale["score"] < fresh["score"]
    assert any(reason.startswith("freshness:") for reason in stale["degrade_reasons"])


def test_missingness_policy_visible():
    res = run_feature("btc_mvrv_missing_flag")
    assert res["missingness"]["policy_visible"] is True
    assert res["missingness"]["imputation_policy"]


def test_lineage_contains_gold_table():
    lin = feature_lineage(get_feature("credit_complacency_gap"))
    assert any(t["name"] == "hr_history_rhymes_model_observations" for t in lin["source_tables"])


def test_importance_shape():
    imp = importance_across_models()
    # Supervised features carry per-model entries; signature features included.
    cc = imp.get("credit_complacency_gap")
    assert cc and all("model" in e for e in cc)
    models = {e["model"] for e in cc}
    assert {"random_forest", "logistic_regression", "linear_regression"} <= models


def test_encoder_slotting():
    panel = generate_macro_panel()
    obs = enrich_observation(panel, -1)
    vec = encode_quant_block(obs["features_normalized"])
    assert len(vec) == 128
    # L2-normalized
    assert abs(sum(x * x for x in vec) - 1.0) < 1e-6


def test_run_feature_envelope_and_unknown():
    ok = run_feature("yield_curve_10y2y_velocity_30d")
    assert ok["status"] == "ok"
    assert ok["current_value"] == pytest.approx(GOLDEN["signature_values"]["yield_curve_10y2y_velocity_30d"], abs=1e-4)
    assert ok["lineage"]["source_tables"]
    unknown = run_feature("totally_made_up")
    assert unknown["status"] == "not_available"
    assert unknown["null_reason"] == "unknown_feature_id"


def test_overview_pipeline_quality_board_shapes():
    ov = build_feature_overview()
    assert ov["feature_count"] == len(FEATURE_REGISTRY)
    assert ov["family_count"] == 20
    pm = build_pipeline_map()
    assert [n["layer"] for n in pm["nodes"]] == ["bronze", "silver", "gold", "vector", "algorithm"]
    qb = build_quality_board()
    assert len(qb["features"]) == len(FEATURE_REGISTRY)
    leaky = next(r for r in qb["features"] if r["feature_id"] == "resolved_trap_label")
    assert leaky["leakage_blocked"] is True and leaky["readiness_score"] == 0.0


def test_prepare_model_dataset_deterministic_superset():
    a, b = prepare_model_dataset(42), prepare_model_dataset(42)
    assert a.equals(b)
    cols = set(a.columns)
    assert set(QUANT_FEATURE_ORDER) <= cols
    assert {"forward_return_30d", "risk_event_30d", "credit_complacency_gap"} <= cols


def test_model_obs_columns_contract_stable():
    # The gold contract column list is the cross-phase freeze point.
    assert "feature_vector" in MODEL_OBS_COLUMNS
    assert "source_quality" in MODEL_OBS_COLUMNS
    assert MODEL_OBS_COLUMNS[0] == "observation_id"
