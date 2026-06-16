"""Feature-readiness scoring.

`model_readiness_score = freshness * completeness * lineage * leakage_safety *
drift_stability`. HARD rule: `leakage_risk=="high"` (or not available at prediction
time) ⇒ score 0. Every multiplier < 1 emits an explicit degrade reason — no
silent degradation.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .contract import QUANT_FEATURE_ORDER


def readiness_for_feature(
    feature: dict[str, Any],
    *,
    freshness: float = 1.0,
    completeness: float = 1.0,
    lineage_present: bool = True,
    drift_stability: float = 1.0,
) -> dict[str, Any]:
    """Score one feature; leakage/lookahead forces 0."""
    reasons: list[str] = []

    if feature.get("leakage_risk") == "high" or feature.get("availability_at_prediction_time") is False:
        return {"score": 0.0, "degrade_reasons": ["leakage_blocked:not_available_at_prediction_time"]}

    leakage_safety = 1.0
    if feature.get("leakage_risk") == "medium":
        leakage_safety = 0.9
        reasons.append("leakage_risk:medium")

    lineage = 1.0 if lineage_present else 0.5
    if not lineage_present:
        reasons.append("lineage:missing")
    if freshness < 1.0:
        reasons.append(f"freshness:{round(freshness, 3)}")
    if completeness < 1.0:
        reasons.append(f"completeness:{round(completeness, 3)}")
    if drift_stability < 1.0:
        reasons.append(f"drift:{round(drift_stability, 3)}")

    score = freshness * completeness * lineage * leakage_safety * drift_stability
    return {"score": round(float(score), 4), "degrade_reasons": reasons}


def observation_readiness(panel: pd.DataFrame, idx: int = -1) -> dict[str, Any]:
    """Observation-level readiness (the `model_readiness_score` feature's value)."""
    row = idx if idx >= 0 else len(panel) + idx
    present = sum(1 for n in QUANT_FEATURE_ORDER if not _is_null(panel[n].iloc[row]))
    completeness = present / len(QUANT_FEATURE_ORDER)
    # Synthetic panel is fresh + complete + non-drifting by construction.
    return readiness_for_feature(
        {"leakage_risk": "low", "availability_at_prediction_time": True},
        freshness=1.0,
        completeness=round(completeness, 4),
        lineage_present=True,
        drift_stability=1.0,
    )


def _is_null(v: Any) -> bool:
    return v is None or (isinstance(v, float) and np.isnan(v))
