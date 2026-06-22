"""Deterministic synthetic dataset for the ML Algorithm Decision Lab.

ONE generator, seeded (default 42), used by both the runtime trainers and the
BigQuery export so the in-memory table and the materialized table are
byte-identical. The data is HR-flavored market-signal observations with a
latent `stress` factor driving correlated features and all four task targets:

  - regression target   : forward_return_30d
  - classification target: risk_event_30d   (deliberately imbalanced ~10%)
  - text target          : theme            (via narrative_text)
  - unsupervised         : the numeric feature block

Determinism rules: a single `np.random.default_rng(seed)` drawn in a fixed
order, fixed column order, no `hash()`/set-iteration in value paths, floats
rounded at the JSON boundary (not here). Real episode anchors (crises AND
non-events) are injected so the analog / non-event teaching content is honest.
"""

from __future__ import annotations

import functools
from typing import Any

import numpy as np
import pandas as pd

N_ROWS = 240

NUMERIC_FEATURES: list[str] = [
    "vix_level",
    "yield_curve_10y2y",
    "yield_curve_velocity",
    "credit_spread_hy",
    "btc_mvrv_zscore",
    "crypto_fear_greed",
    "liquidity_index",
    "momentum_63d",
    "breadth",
    "term_premium",
    "housing_starts_yoy",
    "cmbs_delinquency_rate",
    "aaii_bull_bear_spread",
    "put_call_ratio",
]

ASSET_CLASSES = ["equity", "credit", "rates", "crypto", "commodity"]
REGIME_LABELS = ["expansion", "late_cycle", "stagflation", "recovery", "crisis"]
THEMES = [
    "liquidity_squeeze",
    "growth_scare",
    "inflation_shock",
    "risk_on_melt_up",
    "credit_event",
]

# Theme -> distinctive vocabulary so CountVectorizer + MultinomialNB has signal.
_THEME_TOKENS: dict[str, list[str]] = {
    "liquidity_squeeze": [
        "funding", "dollar", "repo", "drain", "liquidity", "squeeze", "collateral",
        "swap", "shortage", "stress",
    ],
    "growth_scare": [
        "growth", "recession", "slowdown", "pmi", "demand", "layoffs", "earnings",
        "contraction", "soft", "weak",
    ],
    "inflation_shock": [
        "inflation", "cpi", "prices", "wages", "hawkish", "hike", "sticky", "energy",
        "rates", "fed",
    ],
    "risk_on_melt_up": [
        "rally", "breakout", "momentum", "melt", "up", "greed", "fomo", "highs",
        "bid", "chase",
    ],
    "credit_event": [
        "default", "spread", "downgrade", "bankruptcy", "contagion", "credit",
        "leverage", "covenant", "distress", "blowup",
    ],
}

# Named episode anchors. is_crisis=True => a real risk event; False => non-event
# (looked scary, nothing happened) which the model must learn as a false alarm.
_EPISODES: list[dict[str, Any]] = [
    {"id": "gfc-2008", "name": "GFC 2008", "stress": 3.1, "is_crisis": True},
    {"id": "covid-2020", "name": "COVID crash 2020", "stress": 3.4, "is_crisis": True},
    {"id": "ftx-2022", "name": "FTX contagion 2022", "stress": 2.6, "is_crisis": True},
    {"id": "ltcm-1998", "name": "LTCM 1998 (contained)", "stress": 2.2, "is_crisis": False},
    {"id": "debt-ceiling-2011", "name": "2011 debt-ceiling panic", "stress": 2.0, "is_crisis": False},
    {"id": "brexit-2016", "name": "2016 Brexit shock", "stress": 1.9, "is_crisis": False},
    {"id": "inversion-2019", "name": "2019 yield-curve inversion", "stress": 1.8, "is_crisis": False},
]


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


@functools.lru_cache(maxsize=4)
def generate_dataset(seed: int = 42) -> pd.DataFrame:
    """Return the deterministic ~240-row observation table (cached per seed)."""
    rng = np.random.default_rng(seed)
    n = N_ROWS

    # Latent stress factor in fixed draw order; everything else conditions on it.
    stress = rng.normal(0.0, 1.0, n)

    # Overwrite the first len(_EPISODES) rows with anchored episodes.
    episode_ids = np.array(["" for _ in range(n)], dtype=object)
    episode_names = np.array(["" for _ in range(n)], dtype=object)
    is_crisis_anchor = np.zeros(n, dtype=bool)
    has_anchor = np.zeros(n, dtype=bool)
    for i, ep in enumerate(_EPISODES):
        stress[i] = ep["stress"]
        episode_ids[i] = ep["id"]
        episode_names[i] = ep["name"]
        is_crisis_anchor[i] = ep["is_crisis"]
        has_anchor[i] = True

    def feat(base: float, load: float, scale: float) -> np.ndarray:
        return base + load * stress + rng.normal(0.0, scale, n)

    cols: dict[str, np.ndarray] = {
        "vix_level": np.clip(feat(16.0, 7.5, 2.5), 9.0, 80.0),
        "yield_curve_10y2y": feat(0.6, -0.55, 0.25),
        "yield_curve_velocity": feat(0.0, -0.30, 0.20),
        "credit_spread_hy": np.clip(feat(3.6, 1.6, 0.6), 1.5, 15.0),
        "btc_mvrv_zscore": feat(0.2, -0.80, 0.6),
        "crypto_fear_greed": np.clip(feat(52.0, -18.0, 10.0), 1.0, 99.0),
        "liquidity_index": feat(0.0, -1.0, 0.5),
        "momentum_63d": feat(0.02, -0.045, 0.03),
        "breadth": np.clip(feat(0.56, -0.20, 0.10), 0.02, 0.98),
        "term_premium": feat(0.30, -0.20, 0.15),
        "housing_starts_yoy": feat(0.03, -0.05, 0.04),
        "cmbs_delinquency_rate": np.clip(feat(0.045, 0.030, 0.012), 0.005, 0.30),
        "aaii_bull_bear_spread": feat(10.0, -15.0, 8.0),
        "put_call_ratio": np.clip(feat(0.92, 0.32, 0.18), 0.3, 2.5),
    }

    # Regression target: stress depresses forward returns, with mild nonlinearity.
    fwd = -0.030 * stress - 0.010 * np.square(np.maximum(stress, 0.0))
    fwd = fwd + rng.normal(0.0, 0.020, n)

    # Classification target: logit calibrated to ~10% positives, then overridden
    # by episode anchors (crisis => 1, non-event => 0) so false alarms exist.
    logit = -2.35 + 1.55 * stress
    p = _sigmoid(logit)
    risk = (rng.uniform(0.0, 1.0, n) < p).astype(int)
    risk[has_anchor & is_crisis_anchor] = 1
    risk[has_anchor & ~is_crisis_anchor] = 0

    # Regime by stress bucket (deterministic ordering).
    regime_idx = np.digitize(
        stress, bins=[-0.8, -0.1, 0.6, 1.6]
    )  # 0..4 -> expansion..crisis
    regime = np.array([REGIME_LABELS[i] for i in regime_idx], dtype=object)

    # Asset class: stable round-robin so clustering sees within-regime structure.
    asset_class = np.array([ASSET_CLASSES[i % len(ASSET_CLASSES)] for i in range(n)], dtype=object)

    # Theme by a feature rule, then build narrative text from theme vocab.
    theme = _assign_theme(cols, stress)
    narrative = _build_narratives(theme, rng)

    # As-of dates: monthly cadence, fixed start (no clock access).
    as_of = pd.date_range("2015-01-31", periods=n, freq="ME").strftime("%Y-%m-%d")

    # Source quality: most high, a deterministic minority lower.
    source_quality = np.where((np.arange(n) % 11) == 0, "medium", "high")

    data: dict[str, Any] = {
        "observation_id": [f"obs-{i:04d}" for i in range(n)],
        "as_of_date": as_of,
        "asset_class": asset_class,
        "episode_id": episode_ids,
        "episode_name": episode_names,
        "regime_label": regime,
        "is_crisis_anchor": is_crisis_anchor,
        "has_anchor": has_anchor,
    }
    for name in NUMERIC_FEATURES:
        data[name] = cols[name]
    data["forward_return_30d"] = fwd
    data["risk_event_30d"] = risk
    data["narrative_text"] = narrative
    data["theme"] = theme
    data["source_quality"] = source_quality

    df = pd.DataFrame(data)
    return df


def _assign_theme(cols: dict[str, np.ndarray], stress: np.ndarray) -> np.ndarray:
    """Deterministic theme per row from a small feature rule."""
    n = len(stress)
    out = np.empty(n, dtype=object)
    for i in range(n):
        if cols["credit_spread_hy"][i] > 5.0:
            out[i] = "credit_event"
        elif cols["liquidity_index"][i] < -1.0:
            out[i] = "liquidity_squeeze"
        elif cols["term_premium"][i] > 0.45 or cols["aaii_bull_bear_spread"][i] < -10:
            out[i] = "inflation_shock"
        elif cols["momentum_63d"][i] > 0.03 and stress[i] < -0.2:
            out[i] = "risk_on_melt_up"
        else:
            out[i] = "growth_scare"
    return out


def _build_narratives(theme: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """One short sentence per row, drawn from the theme's distinctive vocab."""
    n = len(theme)
    out = np.empty(n, dtype=object)
    for i in range(n):
        tokens = _THEME_TOKENS[theme[i]]
        k = int(rng.integers(5, 8))
        idx = rng.choice(len(tokens), size=min(k, len(tokens)), replace=False)
        words = [tokens[j] for j in sorted(idx.tolist())]
        out[i] = "market note: " + " ".join(words)
    return out


def _missingness(series: pd.Series) -> float:
    return float(series.isna().mean())


def get_dataset_profile(seed: int = 42) -> dict[str, Any]:
    """Human/UI-facing profile of the dataset: columns, roles, balance, summary."""
    df = generate_dataset(seed)

    roles: dict[str, str] = {}
    for c in df.columns:
        if c in NUMERIC_FEATURES:
            roles[c] = "feature"
        elif c in ("forward_return_30d", "risk_event_30d", "theme"):
            roles[c] = "target"
        elif c == "narrative_text":
            roles[c] = "text"
        else:
            roles[c] = "metadata"

    columns: list[dict[str, Any]] = []
    for c in df.columns:
        columns.append(
            {
                "name": c,
                "dtype": str(df[c].dtype),
                "role": roles[c],
                "missingness": round(_missingness(df[c]), 4),
            }
        )

    numeric_summary: dict[str, dict[str, float]] = {}
    for c in NUMERIC_FEATURES:
        s = df[c].astype(float)
        numeric_summary[c] = {
            "min": round(float(s.min()), 4),
            "max": round(float(s.max()), 4),
            "mean": round(float(s.mean()), 4),
            "std": round(float(s.std()), 4),
        }

    risk = df["risk_event_30d"]
    theme_counts = df["theme"].value_counts().to_dict()

    return {
        "n_rows": int(len(df)),
        "n_features": len(NUMERIC_FEATURES),
        "seed": seed,
        "source": "synthetic",
        "as_of_range": [df["as_of_date"].min(), df["as_of_date"].max()],
        "columns": columns,
        "numeric_summary": numeric_summary,
        "class_balance": {
            "risk_event_30d": {
                "positive": int(risk.sum()),
                "negative": int((risk == 0).sum()),
                "positive_rate": round(float(risk.mean()), 4),
            },
            "theme": {str(k): int(v) for k, v in theme_counts.items()},
        },
        "episodes": [
            {"id": e["id"], "name": e["name"], "is_crisis": e["is_crisis"]}
            for e in _EPISODES
        ],
    }
