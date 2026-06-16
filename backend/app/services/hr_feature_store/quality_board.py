"""Feature Quality Board — per-feature quality flags + a family×dimension grid.

A1 synthetic panel is fresh + complete + non-drifting by construction; the leaky
feature surfaces `leakage_risk=high`. Connectors (Phase B) supply real
freshness/missingness/drift via `hr_fs_pipeline_status`.
"""

from __future__ import annotations

from typing import Any

from .enrich import FEATURE_FAMILIES
from .readiness import readiness_for_feature
from .registry import FEATURE_REGISTRY

DIMENSIONS = ["freshness", "missingness", "drift", "leakage_risk", "lineage_coverage", "model_usage"]


def _feature_row(feature: dict[str, Any]) -> dict[str, Any]:
    leaky = feature.get("leakage_risk") == "high" or feature.get("availability_at_prediction_time") is False
    missing_flag = feature["family"] == "missingness_as_signal"
    readiness = readiness_for_feature(feature)
    return {
        "feature_id": feature["id"],
        "family": feature["family"],
        "freshness_status": "fresh",
        "missingness_rate": 0.0 if not missing_flag else 0.02,
        "drift_status": "normal",
        "leakage_risk": feature.get("leakage_risk", "low"),
        "leakage_blocked": leaky,
        "lineage_present": True,
        "models_using_count": len(feature.get("models_using", [])),
        "readiness_score": readiness["score"],
        "readiness_degrade_reasons": readiness["degrade_reasons"],
    }


def build_quality_board() -> dict[str, Any]:
    features = [_feature_row(f) for f in FEATURE_REGISTRY]
    grid: dict[str, dict[str, Any]] = {}
    for fam in FEATURE_FAMILIES:
        fam_rows = [r for r in features if r["family"] == fam]
        grid[fam] = {
            "freshness": "fresh",
            "missingness": "ok" if all(r["missingness_rate"] == 0.0 for r in fam_rows) else "partial",
            "drift": "normal",
            "leakage_risk": "high" if any(r["leakage_blocked"] for r in fam_rows) else "low",
            "lineage_coverage": "complete",
            "model_usage": sum(r["models_using_count"] for r in fam_rows),
        }
    return {"dimensions": DIMENSIONS, "families": FEATURE_FAMILIES, "features": features, "grid": grid}
