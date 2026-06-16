"""Pure derived-feature transforms for the History Rhymes Episode Feature Store.

Each transform takes a **chronologically ordered** series (oldest -> newest) of
floats that the builder has already filtered to observations on or before the
`as_of_date` (the no-lookahead contract lives in the builder, not here). Every
transform returns a `FeatureValue` and **fails closed**: when there is not enough
history (or no variance) it returns `value=None` with a `null_reason` rather than a
silent zero, mirroring the fail-closed discipline used across the HR services.

Numeric transforms populate `value`; categorical transforms (`regime_label`)
populate `label` (and echo the raw level into `value`). These are the reusable
primitives the registry's feature definitions compose; the builder maps a
`feature_registry.transform` string + params onto `compute(...)`.

No DB, no network, no clock — deterministic and golden-testable.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Callable, Sequence


@dataclass(frozen=True)
class FeatureValue:
    """Result of a transform. Exactly one of (value/label) is meaningful per call;
    `null_reason` is set (and value/label None) when the feature is not computable."""

    value: float | None = None
    label: str | None = None
    null_reason: str | None = None


def _clean(series: Sequence[float]) -> list[float]:
    """Drop None / NaN holes; the builder passes raw pulls that may have gaps."""
    out: list[float] = []
    for x in series:
        if x is None:
            continue
        try:
            fx = float(x)
        except (TypeError, ValueError):
            continue
        if math.isnan(fx) or math.isinf(fx):
            continue
        out.append(fx)
    return out


def _insufficient(need: int, have: int) -> FeatureValue:
    return FeatureValue(null_reason=f"insufficient_history(need>={need},have={have})")


def level(series: Sequence[float]) -> FeatureValue:
    """Most recent value (point-in-time level)."""
    s = _clean(series)
    if not s:
        return _insufficient(1, len(s))
    return FeatureValue(value=s[-1])


def velocity(series: Sequence[float], periods: int = 1) -> FeatureValue:
    """Average change per period over the last `periods` steps: (s[-1]-s[-1-p])/p."""
    s = _clean(series)
    if len(s) <= periods:
        return _insufficient(periods + 1, len(s))
    return FeatureValue(value=(s[-1] - s[-1 - periods]) / periods)


def acceleration(series: Sequence[float], periods: int = 1) -> FeatureValue:
    """Change in velocity: vel_now - vel_prev. With periods=1 this is the second
    difference s[-1] - 2*s[-2] + s[-3]."""
    s = _clean(series)
    if len(s) <= 2 * periods:
        return _insufficient(2 * periods + 1, len(s))
    vel_now = (s[-1] - s[-1 - periods]) / periods
    vel_prev = (s[-1 - periods] - s[-1 - 2 * periods]) / periods
    return FeatureValue(value=vel_now - vel_prev)


def zscore(series: Sequence[float], window: int) -> FeatureValue:
    """Standardized latest value over the trailing `window` (sample std)."""
    s = _clean(series)
    if window < 2 or len(s) < 2:
        return _insufficient(2, len(s))
    w = s[-window:]
    if len(w) < 2:
        return _insufficient(2, len(w))
    sd = statistics.stdev(w)
    if sd == 0:
        return FeatureValue(null_reason="no_variance")
    return FeatureValue(value=(w[-1] - statistics.fmean(w)) / sd)


def percentile_rank(series: Sequence[float], window: int) -> FeatureValue:
    """Fraction of the trailing `window` strictly below the latest value, in [0,1]."""
    s = _clean(series)
    if len(s) < 2:
        return _insufficient(2, len(s))
    w = s[-window:] if window > 0 else s
    if len(w) < 2:
        return _insufficient(2, len(w))
    below = sum(1 for v in w if v < w[-1])
    return FeatureValue(value=below / (len(w) - 1))


def slope(series: Sequence[float], window: int) -> FeatureValue:
    """OLS slope (per step) of the last `window` points against index 0..n-1."""
    s = _clean(series)
    if len(s) < 2:
        return _insufficient(2, len(s))
    w = s[-window:] if window > 0 else s
    n = len(w)
    if n < 2:
        return _insufficient(2, n)
    xs = list(range(n))
    mx = (n - 1) / 2.0
    my = statistics.fmean(w)
    var_x = sum((x - mx) ** 2 for x in xs)
    if var_x == 0:
        return FeatureValue(null_reason="no_variance")
    cov = sum((xs[i] - mx) * (w[i] - my) for i in range(n))
    return FeatureValue(value=cov / var_x)


def trend_persistence(series: Sequence[float], ma_window: int) -> FeatureValue:
    """Count of trailing consecutive points above the trailing moving average."""
    s = _clean(series)
    if len(s) < 1 or ma_window < 1:
        return _insufficient(1, len(s))
    ma = statistics.fmean(s[-ma_window:])
    count = 0
    for v in reversed(s):
        if v > ma:
            count += 1
        else:
            break
    return FeatureValue(value=float(count))


def shock_frequency(series: Sequence[float], window: int, k: float = 2.0) -> FeatureValue:
    """Count of first-differences in the trailing `window` whose magnitude exceeds
    k * std(diffs). Detects clustered shocks; needs window+1 observations."""
    s = _clean(series)
    if len(s) < window + 1 or window < 2:
        return _insufficient(window + 1, len(s))
    w = s[-(window + 1):]
    diffs = [w[i] - w[i - 1] for i in range(1, len(w))]
    sd = statistics.stdev(diffs)
    if sd == 0:
        return FeatureValue(value=0.0)
    thresh = k * sd
    return FeatureValue(value=float(sum(1 for d in diffs if abs(d) > thresh)))


def regime_label(
    series: Sequence[float],
    thresholds: Sequence[float],
    labels: Sequence[str],
) -> FeatureValue:
    """Categorical regime of the latest value. `labels` has len(thresholds)+1 entries;
    the latest value picks the bucket it falls into (thresholds ascending)."""
    s = _clean(series)
    if not s:
        return _insufficient(1, len(s))
    if len(labels) != len(thresholds) + 1:
        return FeatureValue(null_reason="bad_regime_config")
    x = s[-1]
    idx = len(thresholds)
    for i, t in enumerate(thresholds):
        if x < t:
            idx = i
            break
    return FeatureValue(value=x, label=labels[idx])


# Dispatch table: feature_registry.transform string -> callable.
TRANSFORMS: dict[str, Callable[..., FeatureValue]] = {
    "level": level,
    "velocity": velocity,
    "acceleration": acceleration,
    "zscore": zscore,
    "percentile": percentile_rank,
    "percentile_rank": percentile_rank,
    "slope": slope,
    "trend_persistence": trend_persistence,
    "shock_frequency": shock_frequency,
    "regime": regime_label,
    "regime_label": regime_label,
}


def compute(transform: str, series: Sequence[float], **params) -> FeatureValue:
    """Map a registry `transform` name + params onto the right primitive.

    Unknown transforms fail closed (never raise) so a bad registry row degrades to
    a null feature with a reason instead of crashing the builder."""
    fn = TRANSFORMS.get(transform)
    if fn is None:
        return FeatureValue(null_reason=f"unknown_transform:{transform}")
    try:
        return fn(series, **params)
    except TypeError as exc:  # bad params for this transform
        return FeatureValue(null_reason=f"bad_params:{exc}")
