"""Deterministic synthetic macro panel for the feature store (seed 42).

Daily business-day rows keyed by the canonical `QUANT_FEATURE_ORDER` names plus
the ML lab's targets, so (a) the enrichment engine has real series to transform,
(b) the encoder/spine can consume `features_normalized`, and (c) the ML lab can
train on the SAME frame (A2). A latent smooth "stress" walk drives correlated
features so velocity / percentile / z-score / divergence are all meaningful.

~520 business days (~2y) so `z_score_2y` has a full trailing window for recent
rows. Deterministic: one seeded RNG drawn in fixed order, fixed column order,
fixed end date (no clock access). Episode anchors include crises AND non-events.
"""

from __future__ import annotations

import functools

import numpy as np
import pandas as pd

from .contract import QUANT_FEATURE_ORDER

N_ROWS = 520
END_DATE = "2026-06-12"  # fixed (no clock); rows go back ~2y of business days

REGIME_LABELS = ["expansion", "late_cycle", "stagflation", "recovery", "crisis"]
THEMES = ["liquidity_squeeze", "growth_scare", "inflation_shock", "risk_on_melt_up", "credit_event"]

_THEME_TOKENS: dict[str, list[str]] = {
    "liquidity_squeeze": ["funding", "dollar", "repo", "drain", "liquidity", "squeeze", "collateral", "shortage"],
    "growth_scare": ["growth", "recession", "slowdown", "pmi", "demand", "layoffs", "earnings", "weak"],
    "inflation_shock": ["inflation", "cpi", "prices", "wages", "hawkish", "hike", "sticky", "energy"],
    "risk_on_melt_up": ["rally", "breakout", "momentum", "melt", "greed", "fomo", "highs", "bid"],
    "credit_event": ["default", "spread", "downgrade", "bankruptcy", "contagion", "credit", "leverage", "distress"],
}

# Named episode anchors (placed at fixed row offsets). is_crisis distinguishes
# real risk events from "looked scary, nothing happened" non-events.
_ANCHORS: list[dict] = [
    {"offset": 40, "name": "GFC-like 2008", "stress": 3.1, "is_crisis": True},
    {"offset": 120, "name": "COVID-like crash", "stress": 3.4, "is_crisis": True},
    {"offset": 200, "name": "FTX-like contagion", "stress": 2.6, "is_crisis": True},
    {"offset": 300, "name": "LTCM-like (contained)", "stress": 2.2, "is_crisis": False},
    {"offset": 360, "name": "Debt-ceiling panic (non-event)", "stress": 2.0, "is_crisis": False},
    {"offset": 430, "name": "Brexit-like shock (non-event)", "stress": 1.9, "is_crisis": False},
    {"offset": 480, "name": "Inversion scare (non-event)", "stress": 1.8, "is_crisis": False},
]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


@functools.lru_cache(maxsize=4)
def generate_macro_panel(seed: int = 42) -> pd.DataFrame:
    """Return the deterministic canonical-named macro panel (cached per seed)."""
    rng = np.random.default_rng(seed)
    n = N_ROWS
    dates = pd.bdate_range(end=END_DATE, periods=n)

    # Smooth latent stress: standardized cumulative walk so deltas are meaningful.
    walk = np.cumsum(rng.normal(0.0, 0.12, n))
    stress = (walk - walk.mean()) / (walk.std() + 1e-9)

    # Anchor overrides (fixed offsets).
    is_crisis = np.zeros(n, dtype=bool)
    is_non_event = np.zeros(n, dtype=bool)
    anchor_name = np.array([""] * n, dtype=object)
    for a in _ANCHORS:
        i = a["offset"]
        if i < n:
            stress[i] = a["stress"]
            anchor_name[i] = a["name"]
            is_crisis[i] = a["is_crisis"]
            is_non_event[i] = not a["is_crisis"]

    def feat(base: float, load: float, scale: float, lo=None, hi=None) -> np.ndarray:
        v = base + load * stress + rng.normal(0.0, scale, n)
        if lo is not None or hi is not None:
            v = np.clip(v, lo if lo is not None else -1e9, hi if hi is not None else 1e9)
        return v

    # Canonical QUANT_FEATURE_ORDER series (plausible signs vs stress).
    cols: dict[str, np.ndarray] = {
        "yield_curve_10y2y": feat(0.6, -0.55, 0.12),
        "fed_funds_rate": feat(3.5, 0.4, 0.08, 0, 10),
        "term_premium": feat(0.3, -0.2, 0.08),
        "cpi_yoy": feat(0.032, 0.4, 0.004, 0),
        "pce_yoy": feat(0.028, 0.35, 0.004, 0),
        "initial_claims": feat(230_000, 60_000, 8_000, 120_000),
        "unemployment_rate": feat(0.041, 0.012, 0.002, 0.02),
        "nonfarm_payrolls_3mo": feat(180_000, -90_000, 20_000),
        "housing_starts_saar": feat(1.45, -0.25, 0.05, 0.2),
        "case_shiller_yoy": feat(0.05, -0.06, 0.01),
        "mortgage_rate_30y": feat(0.065, 0.012, 0.002, 0.01),
        "hy_credit_spread": feat(3.6, 1.6, 0.18, 1.5, 15),
        "ig_credit_spread": feat(1.2, 0.5, 0.06, 0.3, 6),
        "libor_ois_spread": feat(0.15, 0.35, 0.04, 0),
        "vix_spot": feat(16.0, 7.5, 1.2, 9, 80),
        "vix_term_structure": feat(0.05, -0.4, 0.05),
        "move_index": feat(95.0, 35.0, 6.0, 40, 250),
        "sp500_return_1m": feat(0.01, -0.05, 0.01),
        "sp500_return_3m": feat(0.025, -0.08, 0.015),
        "sp500_drawdown_60d": feat(-0.04, -0.10, 0.01, -0.6, 0),
        "btc_price_usd": feat(45_000, -9_000, 1_500, 1_000),
        "btc_return_1m": feat(0.02, -0.10, 0.02),
        "btc_mvrv_zscore": feat(0.2, -0.8, 0.12),
        "crypto_fear_greed": feat(52.0, -18.0, 4.0, 1, 99),
        "btc_dominance": feat(0.52, 0.04, 0.01, 0.2, 0.8),
        "perp_funding_rate": feat(0.0005, -0.0008, 0.0002),
        "epu_us_daily": feat(110.0, 40.0, 8.0, 20),
        "epu_world_weekly": feat(150.0, 45.0, 10.0, 30),
        "aaii_bull_bear_spread": feat(10.0, -15.0, 3.0),
        "put_call_ratio": feat(0.92, 0.32, 0.05, 0.3, 2.5),
        "margin_debt_yoy": feat(0.06, -0.10, 0.02),
        "hoyt_cycle_position": feat(9.0, 0.0, 0.05, 0, 18),
    }
    assert set(cols) == set(QUANT_FEATURE_ORDER), "macro panel must cover QUANT_FEATURE_ORDER exactly"

    # Targets.
    fwd = -0.030 * stress - 0.010 * np.square(np.maximum(stress, 0.0)) + rng.normal(0.0, 0.015, n)
    logit = -2.35 + 1.55 * stress
    risk = (rng.uniform(0.0, 1.0, n) < _sigmoid(logit)).astype(int)
    risk[is_crisis] = 1
    risk[is_non_event] = 0

    regime_idx = np.digitize(stress, bins=[-0.8, -0.1, 0.6, 1.6])
    regime = np.array([REGIME_LABELS[i] for i in regime_idx], dtype=object)
    theme = _assign_theme(cols, stress)
    narrative = _build_narratives(theme, rng)

    data: dict = {
        "observation_id": [d.strftime("%Y-%m-%d") for d in dates],
        "as_of_date": [d.strftime("%Y-%m-%d") for d in dates],
        "regime_label": regime,
        "is_crisis_anchor": is_crisis,
        "is_non_event": is_non_event,
        "anchor_name": anchor_name,
    }
    for name in QUANT_FEATURE_ORDER:
        data[name] = cols[name]
    data["forward_return_30d"] = fwd
    data["risk_event_30d"] = risk
    data["theme"] = theme
    data["narrative_text"] = narrative
    data["source_quality"] = np.array(["synthetic"] * n, dtype=object)

    return pd.DataFrame(data)


def _assign_theme(cols: dict[str, np.ndarray], stress: np.ndarray) -> np.ndarray:
    n = len(stress)
    out = np.empty(n, dtype=object)
    for i in range(n):
        if cols["hy_credit_spread"][i] > 5.0:
            out[i] = "credit_event"
        elif cols["libor_ois_spread"][i] > 0.5:
            out[i] = "liquidity_squeeze"
        elif cols["cpi_yoy"][i] > 0.05 or cols["aaii_bull_bear_spread"][i] < -12:
            out[i] = "inflation_shock"
        elif cols["sp500_return_1m"][i] > 0.02 and stress[i] < -0.2:
            out[i] = "risk_on_melt_up"
        else:
            out[i] = "growth_scare"
    return out


def _build_narratives(theme: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    n = len(theme)
    out = np.empty(n, dtype=object)
    for i in range(n):
        tokens = _THEME_TOKENS[theme[i]]
        k = int(rng.integers(4, 7))
        idx = rng.choice(len(tokens), size=min(k, len(tokens)), replace=False)
        out[i] = "market note: " + " ".join(tokens[j] for j in sorted(idx.tolist()))
    return out
