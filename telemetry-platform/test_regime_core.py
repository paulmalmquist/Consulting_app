"""Eval tests for the regime-conditioning primitives — numpy only, no Databricks.

Run: python -m pytest telemetry-platform/test_regime_core.py -q
"""

import numpy as np

from regime_core import (
    per_regime_rate, recon_error, regime_stats, regime_zscore, spread, threshold_quantile,
)


def _pca(X: np.ndarray, k: int):
    mean = X.mean(axis=0)
    _, _, vt = np.linalg.svd(X - mean, full_matrices=False)
    return mean, vt[:k]


def test_recon_error_zero_at_full_rank():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(50, 5))
    mean, comp = _pca(X, 5)
    assert np.allclose(recon_error(X, mean, comp), 0.0, atol=1e-7)


def test_regime_zscore_centers_each_regime():
    X = np.array([[10.0, 10.0], [11.0, 11.0], [100.0, 100.0], [101.0, 101.0]])
    reg = np.array([0, 0, 1, 1])
    Z = regime_zscore(X, reg, regime_stats(X, reg))
    assert abs(Z[reg == 0].mean()) < 1e-9
    assert abs(Z[reg == 1].mean()) < 1e-9


def test_regime_conditioning_collapses_cross_regime_recon_spread():
    # Three healthy regimes sharing a low-rank structure, but each operating condition puts
    # the sensors on a different SCALE and offset (exactly what a C-MAPSS operating condition
    # does). A single global threshold on raw reconstruction error is dominated by the
    # high-scale regime -> its healthy points get flagged (false positives) while the
    # low-scale regime is never flagged. Per-regime standardization removes scale+offset
    # first, so reconstruction error reflects faults, not regime.
    rng = np.random.default_rng(0)
    d, k = 8, 2
    scales = {0: 1.0, 1: 8.0, 2: 0.3}
    offsets = {0: 0, 1: 3, 2: 6}
    base = rng.normal(size=(900, k)) @ rng.normal(size=(k, d))  # shared low-rank signal
    rows, regs = [], []
    for i, r in enumerate((0, 1, 2)):
        off = np.zeros(d)
        off[offsets[r]] = 10.0
        blk = base[i * 300:(i + 1) * 300] * scales[r] + off + rng.normal(scale=0.5 * scales[r], size=(300, d))
        rows.append(blk)
        regs += [r] * 300
    X = np.vstack(rows)
    reg = np.array(regs)

    mg, cg = _pca(X, 2)
    eg = recon_error(X, mg, cg)
    fp_global = per_regime_rate(eg, reg, threshold_quantile(eg, 0.95))

    stats = regime_stats(X, reg)
    Z = regime_zscore(X, reg, stats)
    mz, cz = _pca(Z, 2)
    ez = recon_error(Z, mz, cz)
    fp_regime = per_regime_rate(ez, reg, threshold_quantile(ez, 0.95))

    # Regime conditioning collapses the cross-regime false-positive spread.
    assert spread(fp_regime) < spread(fp_global)
    assert max(fp_global.values()) > max(fp_regime.values())
