"""Model-observation contract for the History Rhymes feature store.

The gold grain is one row per (observation_id, as_of_date, model_obs_version).
Phase A keeps this as an in-memory contract (this module + a dataclass); Phase B
materializes the identical columns into `hr_history_rhymes_model_observations`.

`QUANT_FEATURE_ORDER` MIRRORS skills/historyrhymes/services/state_vector_encoder.py
— that file is the spine's source of truth; this copy lets the backend feature
store map gold rows onto the same 128-dim slot ordering WITHOUT a cross-root
import. Keep the two in sync; any `quant_slot` a feature claims must live here.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

MODEL_OBS_VERSION = "hr-fs-v1"

# Source-of-truth mirror (see module docstring). Order is load-bearing.
QUANT_FEATURE_ORDER: list[str] = [
    "yield_curve_10y2y", "fed_funds_rate", "term_premium",
    "cpi_yoy", "pce_yoy",
    "initial_claims", "unemployment_rate", "nonfarm_payrolls_3mo",
    "housing_starts_saar", "case_shiller_yoy", "mortgage_rate_30y",
    "hy_credit_spread", "ig_credit_spread", "libor_ois_spread",
    "vix_spot", "vix_term_structure", "move_index",
    "sp500_return_1m", "sp500_return_3m", "sp500_drawdown_60d",
    "btc_price_usd", "btc_return_1m", "btc_mvrv_zscore", "crypto_fear_greed",
    "btc_dominance", "perp_funding_rate",
    "epu_us_daily", "epu_world_weekly",
    "aaii_bull_bear_spread", "put_call_ratio", "margin_debt_yoy",
    "hoyt_cycle_position",
]
QUANT_BLOCK_DIM = 128

SOURCE_QUALITY_VALUES = ("live", "fixture", "synthetic", "synthetic_fallback")

# Gold-table column contract (Phase A in-memory; Phase B materialized 1:1).
MODEL_OBS_COLUMNS: list[str] = [
    "observation_id", "as_of_date", "model_obs_version",
    "features_raw", "features_normalized",
    "features_z_score_2y", "features_delta_1d", "features_velocity", "features_acceleration",
    "staleness_seconds", "source_quality", "null_reason", "feature_family_coverage",
    "feature_vector", "text_embedding", "narrative_text",
    "forward_return_30d", "risk_event_30d", "theme", "is_crisis_anchor", "is_non_event",
    "model_readiness_score", "readiness_degrade_reasons",
    "lineage_json", "external_links_json", "provenance", "created_at",
]


@dataclass
class FeatureObservation:
    """One model-observation row (the gold contract, in-memory form)."""

    observation_id: str
    as_of_date: str
    model_obs_version: str = MODEL_OBS_VERSION
    features_raw: dict[str, float | None] = field(default_factory=dict)
    features_normalized: dict[str, float | None] = field(default_factory=dict)
    features_z_score_2y: dict[str, float | None] = field(default_factory=dict)
    features_delta_1d: dict[str, float | None] = field(default_factory=dict)
    features_velocity: dict[str, float | None] = field(default_factory=dict)
    features_acceleration: dict[str, float | None] = field(default_factory=dict)
    staleness_seconds: dict[str, float] = field(default_factory=dict)
    source_quality: str = "synthetic"
    null_reason: str | None = None
    feature_family_coverage: dict[str, Any] = field(default_factory=dict)
    narrative_text: str = ""
    forward_return_30d: float | None = None
    risk_event_30d: int | None = None
    theme: str | None = None
    is_crisis_anchor: bool = False
    is_non_event: bool = False
    model_readiness_score: float | None = None
    readiness_degrade_reasons: list[str] = field(default_factory=list)


def encode_quant_block(features_normalized: dict[str, float | None]) -> list[float]:
    """Project normalized features onto the canonical 128-dim quant block (L2).

    Mirrors the encoder's `_pad_or_truncate` + `_l2_normalize` for the quant half
    so the spine bridge is unit-testable in the backend without importing skills/.
    None/NaN → 0.0; padded to 128; L2-normalized (zero-vector returned unchanged).
    """
    vec: list[float] = []
    for name in QUANT_FEATURE_ORDER[:QUANT_BLOCK_DIM]:
        val = features_normalized.get(name)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            vec.append(0.0)
        else:
            vec.append(float(val))
    while len(vec) < QUANT_BLOCK_DIM:
        vec.append(0.0)
    norm = math.sqrt(sum(x * x for x in vec))
    if norm < 1e-12:
        return vec
    return [x / norm for x in vec]
