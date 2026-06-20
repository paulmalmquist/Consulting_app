"""Orchestration for the History Rhymes feature store (Phase A).

Public API: build_feature_overview, run_feature, build_quality_board,
build_pipeline_map, build_importance, prepare_model_dataset. All fail-closed
(mirrors hr_ml_demo): unknown id ⇒ `unknown_feature_id`, never an exception.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from app.services.hr_ml_demo.cloud_links import public_cloud_config

from .contract import MODEL_OBS_VERSION
from .enrich import (
    FEATURE_FAMILIES,
    SIGNATURE_FEATURE_IDS,
    family_value,
    generate_macro_panel,
    latest_signatures,
    signature_series,
    transformation_example,
)
from .importance import importance_for_feature
from .lineage import feature_external_links, feature_lineage
from .quality_board import build_quality_board as _build_quality_board
from .readiness import observation_readiness, readiness_for_feature
from .registry import FEATURE_BY_ID, FEATURE_REGISTRY, get_feature
from .schema import evidence_block, not_available_feature_response, ok_feature_response, unknown_feature_response

logger = logging.getLogger(__name__)

LESSON = "Models do not discover business context by magic. Feature engineering is where raw data becomes judgment."
CLOSER = "The algorithm is the final mile. The feature system is the edge."


def _current_value(feature_id: str, panel: pd.DataFrame) -> float | None:
    sigs = latest_signatures(panel)
    if feature_id in sigs:
        return sigs[feature_id]
    feature = FEATURE_BY_ID.get(feature_id)
    if feature is None:
        return None
    if feature_id == "model_readiness_score":
        return observation_readiness(panel)["score"]
    return family_value(feature["family"], panel)


def run_feature(feature_id: str) -> dict[str, Any]:
    feature = get_feature(feature_id)
    if feature is None:
        return unknown_feature_response(feature_id)
    try:
        panel = generate_macro_panel()
        if feature_id == "model_readiness_score":
            readiness = observation_readiness(panel)
        else:
            readiness = readiness_for_feature(feature)
        missing_flag = feature["family"] == "missingness_as_signal"
        computed = {
            "current_value": _current_value(feature_id, panel),
            "current_percentile": None,
            "transformation_example": transformation_example(feature_id, panel),
            "readiness": readiness,
            "missingness": {
                "rate": 0.02 if missing_flag else 0.0,
                "policy_visible": True,
                "imputation_policy": feature.get("imputation_policy"),
            },
            "importance_across_models": importance_for_feature(feature_id),
            "external_links": feature_external_links(),
            "lineage": feature_lineage(feature),
        }
        return ok_feature_response(feature, computed)
    except Exception as exc:  # noqa: BLE001 — per-feature fail-closed
        logger.exception("feature-store run_feature %s failed", feature_id)
        return not_available_feature_response(feature, f"compute_failed: {type(exc).__name__}")


def build_feature_overview() -> dict[str, Any]:
    families: dict[str, int] = {fam: 0 for fam in FEATURE_FAMILIES}
    for f in FEATURE_REGISTRY:
        families[f["family"]] = families.get(f["family"], 0) + 1
    return {
        "title": "Feature Foundry",
        "subtitle": "Raw data becomes signal only after enrichment, normalization, context, lineage, and stress testing.",
        "lesson": LESSON,
        "closer": CLOSER,
        "feature_count": len(FEATURE_REGISTRY),
        "family_count": len(FEATURE_FAMILIES),
        "families": [{"family": fam, "feature_count": families[fam]} for fam in FEATURE_FAMILIES],
        "signature_features": SIGNATURE_FEATURE_IDS,
        "features": [
            {"feature_id": f["id"], "name": f["name"], "family": f["family"],
             "leakage_risk": f.get("leakage_risk"), "models_using": f.get("models_using", [])}
            for f in FEATURE_REGISTRY
        ],
        "cloud_provider": public_cloud_config().get("provider", "none"),
        "evidence": evidence_block(),
    }


def build_pipeline_map() -> dict[str, Any]:
    return {
        "nodes": [
            {"layer": "bronze", "label": "Raw external signal", "detail": "hr_fs_readings_bronze (Phase B)"},
            {"layer": "silver", "label": "Normalized signal", "detail": "hr_fs_readings (Phase B)"},
            {"layer": "gold", "label": "Model observations", "detail": "hr_history_rhymes_model_observations"},
            {"layer": "vector", "label": "State vector (256-dim)", "detail": "encode_state_vector(features_normalized, narrative)"},
            {"layer": "algorithm", "label": "ML lab + Rhyme Score / trap detector", "detail": "shared deterministic dataset"},
        ],
        "model_obs_version": MODEL_OBS_VERSION,
        "note": "Phase A is synthetic (seed 42); connectors (Phase B) fill bronze/silver behind the same gold contract.",
    }


def build_quality_board() -> dict[str, Any]:
    return _build_quality_board()


def build_importance() -> dict[str, Any]:
    from .importance import importance_across_models
    return {"importance": importance_across_models()}


def prepare_model_dataset(seed: int = 42) -> pd.DataFrame:
    """The shared deterministic frame the ML lab will consume in A2.

    Canonical macro panel + the 6 engineered signature columns. Deterministic.
    """
    panel = generate_macro_panel(seed).copy()
    for col, series in signature_series(panel).items():
        panel[col] = series
    return panel
