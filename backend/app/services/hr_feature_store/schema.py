"""Constants + response builders for the feature store (mirrors hr_ml_demo/schema).

Fail-closed discipline: a feature whose dependency is missing returns
`status="not_available"` with a non-null `null_reason` while keeping its static
registry content; an unknown id returns `null_reason="unknown_feature_id"` so a
typo is never dressed up as a degraded real feature.
"""

from __future__ import annotations

from typing import Any

from .contract import MODEL_OBS_VERSION

SEED = 42
SOURCE = "synthetic"


def round_floats(obj: Any, ndigits: int = 4) -> Any:
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [round_floats(v, ndigits) for v in obj]
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float):
        return round(obj, ndigits)
    return obj


def evidence_block(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    block = {"seed": SEED, "model_obs_version": MODEL_OBS_VERSION, "source": SOURCE}
    if extra:
        block.update(extra)
    return block


def _static(feature: dict[str, Any]) -> dict[str, Any]:
    """The registry fields that survive a compute failure (registry key is `id`)."""
    keep = (
        "name", "family", "definition", "formula",
        "source_dependencies", "cadence", "availability_at_prediction_time",
        "leakage_risk", "imputation_policy", "models_using", "demo_explanation",
        "quant_slot",
    )
    out = {k: feature.get(k) for k in keep}
    out["feature_id"] = feature.get("id") or feature.get("feature_id")
    return out


def ok_feature_response(feature: dict[str, Any], computed: dict[str, Any]) -> dict[str, Any]:
    envelope = {
        **_static(feature),
        "status": "ok",
        "null_reason": None,
        "current_value": round_floats(computed.get("current_value")),
        "current_percentile": round_floats(computed.get("current_percentile")),
        "transformation_example": round_floats(computed.get("transformation_example", {})),
        "readiness": round_floats(computed.get("readiness", {})),
        "missingness": round_floats(computed.get("missingness", {})),
        "importance_across_models": round_floats(computed.get("importance_across_models", [])),
        "evidence": evidence_block(),
        "external_links": computed.get("external_links", []),
        "lineage": computed.get("lineage", {}),
    }
    return envelope


def not_available_feature_response(feature: dict[str, Any], null_reason: str) -> dict[str, Any]:
    return {
        **_static(feature),
        "status": "not_available",
        "null_reason": null_reason,
        "transformation_example": {},
        "readiness": {"score": 0.0, "degrade_reasons": [null_reason]},
        "missingness": {},
        "importance_across_models": [],
        "evidence": evidence_block(),
        "external_links": [],
        "lineage": {},
    }


def unknown_feature_response(feature_id: str) -> dict[str, Any]:
    """Unknown id — visibly marked, never a generic degrade."""
    return {
        "feature_id": feature_id,
        "name": feature_id,
        "status": "not_available",
        "null_reason": "unknown_feature_id",
        "family": None,
        "definition": None,
        "formula": None,
        "source_dependencies": [],
        "cadence": None,
        "availability_at_prediction_time": None,
        "leakage_risk": None,
        "imputation_policy": None,
        "models_using": [],
        "demo_explanation": None,
        "quant_slot": None,
        "transformation_example": {},
        "readiness": {},
        "missingness": {},
        "importance_across_models": [],
        "evidence": evidence_block(),
        "external_links": [],
        "lineage": {},
    }
