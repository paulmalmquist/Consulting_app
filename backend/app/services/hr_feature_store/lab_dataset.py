"""Lab-schema adapter — renders the shared canonical macro panel into the exact
column schema the ML lab's trainers + curveballs expect.

This is the "one shared dataset" bridge: the feature store owns the canonical
`QUANT_FEATURE_ORDER` panel (for the spine), and this adapter derives the lab's
`NUMERIC_FEATURES` + targets + metadata from it so `hr_ml_demo` can train on the
same underlying data without changing any trainer. Deterministic (seed 42).
"""

from __future__ import annotations

import functools

import numpy as np
import pandas as pd

from .macro_dataset import _THEME_TOKENS, THEMES, generate_macro_panel

_ASSET_CLASSES = ["equity", "credit", "rates", "crypto", "commodity"]


def _std(s: pd.Series) -> pd.Series:
    return (s - s.mean()) / (s.std() + 1e-9)


def _balanced_theme_and_narrative(p: pd.DataFrame, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Balanced 5-class theme (quantile buckets of a stress composite) + matching
    narrative text. Balance guarantees the lab's stratified text split has ≥2 per
    class; narrative is generated FROM the theme so Naive Bayes has real signal.
    The panel's own theme stays untouched (A1 golden depends only on signatures).
    """
    composite = (
        _std(p["hy_credit_spread"]) + _std(p["vix_spot"]) - _std(p["yield_curve_10y2y"])
        + _std(p["libor_ois_spread"]) - _std(p["sp500_return_1m"])
    )
    theme = pd.qcut(composite.rank(method="first"), q=len(THEMES), labels=THEMES).astype(object).to_numpy()
    rng = np.random.default_rng(seed + 7)
    narrative = np.empty(len(p), dtype=object)
    for i in range(len(p)):
        tokens = _THEME_TOKENS[theme[i]]
        k = int(rng.integers(4, 7))
        idx = rng.choice(len(tokens), size=min(k, len(tokens)), replace=False)
        narrative[i] = "market note: " + " ".join(tokens[j] for j in sorted(idx.tolist()))
    return theme, narrative


@functools.lru_cache(maxsize=4)
def lab_model_dataset(seed: int = 42) -> pd.DataFrame:
    """Return the shared panel in the ML lab's exact column schema (no NaN)."""
    p = generate_macro_panel(seed)
    n = len(p)

    yc_vel = (p["yield_curve_10y2y"] - p["yield_curve_10y2y"].shift(30)).fillna(0.0)
    theme, narrative = _balanced_theme_and_narrative(p, seed)

    out = pd.DataFrame({
        # identity / metadata (lab schema)
        "observation_id": p["observation_id"].to_numpy(),
        "as_of_date": p["as_of_date"].to_numpy(),
        "asset_class": [_ASSET_CLASSES[i % len(_ASSET_CLASSES)] for i in range(n)],
        "episode_id": p["anchor_name"].to_numpy(),
        "episode_name": p["anchor_name"].to_numpy(),
        "regime_label": p["regime_label"].to_numpy(),
        "is_crisis_anchor": p["is_crisis_anchor"].to_numpy(),
        "is_non_event": p["is_non_event"].to_numpy(),
        "has_anchor": (p["is_crisis_anchor"] | p["is_non_event"]).to_numpy(),
        # NUMERIC_FEATURES (lab names) derived from canonical panel
        "vix_level": p["vix_spot"].to_numpy(),
        "yield_curve_10y2y": p["yield_curve_10y2y"].to_numpy(),
        "yield_curve_velocity": yc_vel.to_numpy(),
        "credit_spread_hy": p["hy_credit_spread"].to_numpy(),
        "btc_mvrv_zscore": p["btc_mvrv_zscore"].to_numpy(),
        "crypto_fear_greed": p["crypto_fear_greed"].to_numpy(),
        "liquidity_index": (-_std(p["libor_ois_spread"])).to_numpy(),
        "momentum_63d": p["sp500_return_3m"].to_numpy(),
        "breadth": np.clip(0.55 + 2.0 * p["sp500_return_1m"], 0.02, 0.98),
        "term_premium": p["term_premium"].to_numpy(),
        "housing_starts_yoy": p["case_shiller_yoy"].to_numpy(),
        "cmbs_delinquency_rate": np.clip(0.04 + 0.01 * _std(p["hy_credit_spread"]), 0.005, 0.30),
        "aaii_bull_bear_spread": p["aaii_bull_bear_spread"].to_numpy(),
        "put_call_ratio": p["put_call_ratio"].to_numpy(),
        # targets
        "forward_return_30d": p["forward_return_30d"].to_numpy(),
        "risk_event_30d": p["risk_event_30d"].to_numpy(),
        "theme": theme,
        "narrative_text": narrative,
        "source_quality": p["source_quality"].to_numpy(),
    })
    return out
