"""Enrichment engine: raw canonical series → engineered features.

A1 scope: all 20 families are REPRESENTED (`family_value`) with the 6 signature
features implemented as real, deterministic formulas (`signature_series`); the
non-signature families return deterministic representative values (deepened in
Phase C). Z-scores use a trailing ~2y window; the latest row (full window) is
what the golden fixture locks.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .contract import QUANT_FEATURE_ORDER
from .macro_dataset import generate_macro_panel

_Z2Y_WINDOW = 504
_Z2Y_MINP = 60

SIGNATURE_FEATURE_IDS = [
    "yield_curve_10y2y_velocity_30d",
    "yield_curve_10y2y_acceleration_30d",
    "credit_complacency_gap",
    "liquidity_fragmentation_score",
    "narrative_flow_mismatch",
    "non_event_counterexample_score",
    "model_readiness_score",  # value supplied by readiness.py, listed for completeness
]

# The 20 families the Foundry surfaces.
FEATURE_FAMILIES = [
    "level", "velocity", "acceleration", "rolling", "percentile_regime",
    "cross_signal_divergence", "composite_stress", "interaction", "lag",
    "missingness_as_signal", "freshness", "leakage_guard", "narrative_embedding",
    "narrative_velocity", "flow_vs_narrative_mismatch", "crowding_consensus",
    "non_event_counterexample", "distribution_drift", "model_readiness",
    "composite_catch_all",
]


def _z2y(s: pd.Series) -> pd.Series:
    mean = s.rolling(_Z2Y_WINDOW, min_periods=_Z2Y_MINP).mean()
    std = s.rolling(_Z2Y_WINDOW, min_periods=_Z2Y_MINP).std()
    return (s - mean) / std.replace(0.0, np.nan)


def _vel(s: pd.Series, k: int) -> pd.Series:
    return s - s.shift(k)


def _accel(s: pd.Series, k: int) -> pd.Series:
    return _vel(s, k) - _vel(s, k).shift(k)


def _macro_stress_z(panel: pd.DataFrame) -> pd.Series:
    """Composite macro-stress z: high VIX + high claims + inverted curve."""
    return (
        _z2y(panel["vix_spot"]).fillna(0.0)
        + _z2y(panel["initial_claims"]).fillna(0.0)
        - _z2y(panel["yield_curve_10y2y"]).fillna(0.0)
    ) / 3.0


def signature_series(panel: pd.DataFrame) -> dict[str, pd.Series]:
    """The 6 series-derived signature features (model_readiness comes from readiness.py)."""
    yc = panel["yield_curve_10y2y"]
    vel30 = _vel(yc, 30)
    acc30 = _accel(yc, 30)

    credit_complacency_gap = _z2y(panel["hy_credit_spread"]) - _macro_stress_z(panel)

    crypto_liq = _z2y(panel["btc_dominance"])
    tradfi_liq = -_z2y(panel["libor_ois_spread"])
    liquidity_fragmentation_score = crypto_liq - tradfi_liq

    narrative_panic_vel = _z2y(_vel(panel["epu_us_daily"], 7))
    capital_flow_stress = _z2y(-panel["sp500_drawdown_60d"])
    narrative_flow_mismatch = narrative_panic_vel - capital_flow_stress

    non_event_counterexample_score = _non_event_counterexample(panel)

    return {
        "yield_curve_10y2y_velocity_30d": vel30,
        "yield_curve_10y2y_acceleration_30d": acc30,
        "credit_complacency_gap": credit_complacency_gap,
        "liquidity_fragmentation_score": liquidity_fragmentation_score,
        "narrative_flow_mismatch": narrative_flow_mismatch,
        "non_event_counterexample_score": non_event_counterexample_score,
    }


_SIM_FEATURES = ["vix_spot", "hy_credit_spread", "yield_curve_10y2y", "sp500_drawdown_60d", "move_index"]


def _non_event_counterexample(panel: pd.DataFrame) -> pd.Series:
    """nearest_non_event_similarity − nearest_crisis_similarity (higher = benign-looking)."""
    z = {f: _z2y(panel[f]).fillna(0.0).to_numpy() for f in _SIM_FEATURES}
    mat = np.vstack([z[f] for f in _SIM_FEATURES]).T  # (n, k)
    crisis_idx = np.where(panel["is_crisis_anchor"].to_numpy())[0]
    nonevent_idx = np.where(panel["is_non_event"].to_numpy())[0]
    n = len(panel)
    out = np.zeros(n)

    def _max_sim(row: np.ndarray, idxs: np.ndarray) -> float:
        if len(idxs) == 0:
            return 0.0
        d = np.linalg.norm(mat[idxs] - row, axis=1)
        return float(-d.min())  # similarity = negative distance

    for i in range(n):
        out[i] = _max_sim(mat[i], nonevent_idx) - _max_sim(mat[i], crisis_idx)
    return pd.Series(out, index=panel.index)


def enrich_observation(panel: pd.DataFrame, idx: int = -1) -> dict[str, dict[str, float | None]]:
    """Per-canonical-feature derived dicts for one row (raw/normalized/z2y/delta/vel/accel)."""
    row_pos = idx if idx >= 0 else len(panel) + idx

    def _at(s: pd.Series) -> float | None:
        v = s.iloc[row_pos]
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return float(v)

    raw, normalized, z2y, delta1d, velocity, acceleration = {}, {}, {}, {}, {}, {}
    for name in QUANT_FEATURE_ORDER:
        s = panel[name].astype(float)
        z = _z2y(s)
        raw[name] = _at(s)
        z2y[name] = _at(z)
        normalized[name] = _at(z)  # normalized view = trailing-2y z-score (encoder input)
        delta1d[name] = _at(_vel(s, 1))
        velocity[name] = _at(_vel(s, 30))
        acceleration[name] = _at(_accel(s, 30))
    return {
        "features_raw": raw,
        "features_normalized": normalized,
        "features_z_score_2y": z2y,
        "features_delta_1d": delta1d,
        "features_velocity": velocity,
        "features_acceleration": acceleration,
    }


def latest_signatures(panel: pd.DataFrame) -> dict[str, float | None]:
    """Latest value of each series-derived signature (golden-locked)."""
    out: dict[str, float | None] = {}
    for fid, series in signature_series(panel).items():
        v = series.iloc[-1]
        out[fid] = None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 4)
    return out


def transformation_example(feature_id: str, panel: pd.DataFrame | None = None, n: int = 6) -> dict:
    """before/after slice for the drawer: raw input vs engineered output (tail n)."""
    panel = panel if panel is not None else generate_macro_panel()
    series_map = signature_series(panel)
    if feature_id not in series_map:
        return {}
    after = series_map[feature_id].tail(n)
    before_col = {
        "yield_curve_10y2y_velocity_30d": "yield_curve_10y2y",
        "yield_curve_10y2y_acceleration_30d": "yield_curve_10y2y",
        "credit_complacency_gap": "hy_credit_spread",
        "liquidity_fragmentation_score": "libor_ois_spread",
        "narrative_flow_mismatch": "epu_us_daily",
        "non_event_counterexample_score": "vix_spot",
    }.get(feature_id)
    before = panel[before_col].tail(n) if before_col else after
    dates = panel["as_of_date"].tail(n).tolist()
    return {
        "before": [{"as_of": d, "value": round(float(v), 4)} for d, v in zip(dates, before.tolist())],
        "after": [
            {"as_of": d, "value": (None if np.isnan(v) else round(float(v), 4))}
            for d, v in zip(dates, after.tolist())
        ],
    }


def family_value(family: str, panel: pd.DataFrame, idx: int = -1) -> float | None:
    """Deterministic representative value per family (signature families use real formulas)."""
    row = idx if idx >= 0 else len(panel) + idx
    s_yc = panel["yield_curve_10y2y"].astype(float)
    s_vix = panel["vix_spot"].astype(float)
    sig = signature_series(panel)

    def _last(series: pd.Series) -> float | None:
        v = series.iloc[row]
        return None if (isinstance(v, float) and np.isnan(v)) else round(float(v), 4)

    table = {
        "level": _last(s_vix),
        "velocity": _last(sig["yield_curve_10y2y_velocity_30d"]),
        "acceleration": _last(sig["yield_curve_10y2y_acceleration_30d"]),
        "rolling": _last(s_vix.rolling(20, min_periods=5).mean()),
        "percentile_regime": _last(s_vix.rolling(252, min_periods=30).rank(pct=True)),
        "cross_signal_divergence": _last(sig["credit_complacency_gap"]),
        "composite_stress": _last(_macro_stress_z(panel)),
        "interaction": _last(_z2y(s_vix).fillna(0.0) * _z2y(panel["hy_credit_spread"]).fillna(0.0)),
        "lag": _last(s_yc.shift(30)),
        "missingness_as_signal": 0.0,  # synthetic panel is complete; connectors set real rates (Phase B)
        "freshness": 1.0,  # synthetic = fresh
        "leakage_guard": _last(sig["credit_complacency_gap"]),
        "narrative_embedding": _last(_z2y(panel["epu_us_daily"])),
        "narrative_velocity": _last(_z2y(_vel(panel["epu_us_daily"], 7))),
        "flow_vs_narrative_mismatch": _last(sig["narrative_flow_mismatch"]),
        "crowding_consensus": _last(_z2y(panel["aaii_bull_bear_spread"]).fillna(0.0)
                                    + _z2y(panel["put_call_ratio"]).fillna(0.0)),
        "non_event_counterexample": _last(sig["non_event_counterexample_score"]),
        "distribution_drift": _last((_z2y(s_vix).abs() > 3).astype(float)),  # crude OOR flag (PSI deepened in C)
        "model_readiness": None,  # readiness.py owns the real value
        "composite_catch_all": _last(sig["liquidity_fragmentation_score"]),
    }
    return table.get(family)
