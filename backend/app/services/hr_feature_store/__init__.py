"""History Rhymes feature store (Phase A — deterministic, in-memory).

Turns raw canonical signals into engineered, model-ready features and makes the
enrichment visible (Feature Foundry). No DB, no live APIs in Phase A; the gold
contract (`contract.MODEL_OBS_COLUMNS`) is designed so connectors drop in behind
it (Phase B). Feeds the existing HR spine via canonical `QUANT_FEATURE_ORDER`.
"""

from __future__ import annotations

from .contract import MODEL_OBS_COLUMNS, MODEL_OBS_VERSION, QUANT_FEATURE_ORDER, FeatureObservation, encode_quant_block
from .enrich import FEATURE_FAMILIES, SIGNATURE_FEATURE_IDS, enrich_observation, latest_signatures, signature_series
from .macro_dataset import generate_macro_panel
from .registry import FEATURE_REGISTRY, get_feature
from .runner import (
    build_feature_overview,
    build_importance,
    build_pipeline_map,
    build_quality_board,
    prepare_model_dataset,
    run_feature,
)
from .schema import SEED

__all__ = [
    "FEATURE_FAMILIES",
    "FEATURE_REGISTRY",
    "FeatureObservation",
    "MODEL_OBS_COLUMNS",
    "MODEL_OBS_VERSION",
    "QUANT_FEATURE_ORDER",
    "SEED",
    "SIGNATURE_FEATURE_IDS",
    "build_feature_overview",
    "build_importance",
    "build_pipeline_map",
    "build_quality_board",
    "encode_quant_block",
    "enrich_observation",
    "generate_macro_panel",
    "get_feature",
    "latest_signatures",
    "prepare_model_dataset",
    "run_feature",
    "signature_series",
]
