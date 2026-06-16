"""History Rhymes Episode Feature Store (the learning layer).

Phase 0 ships the pure transform library that turns a raw signal series into a
derived feature value. The episode builder (0.4) prepares per-`as_of` series from
`episode_signals` / FRED and calls these transforms; nothing here touches the DB,
the network, or the clock — so every transform is deterministic and unit-testable.

See docs/plans (Episode Feature Store + Model Lab) and ADO Feature #623 / Story #624.
"""

from .transforms import (
    FeatureValue,
    TRANSFORMS,
    acceleration,
    compute,
    level,
    percentile_rank,
    regime_label,
    shock_frequency,
    slope,
    trend_persistence,
    velocity,
    zscore,
)

__all__ = [
    "FeatureValue",
    "TRANSFORMS",
    "acceleration",
    "compute",
    "level",
    "percentile_rank",
    "regime_label",
    "shock_frequency",
    "slope",
    "trend_persistence",
    "velocity",
    "zscore",
]
