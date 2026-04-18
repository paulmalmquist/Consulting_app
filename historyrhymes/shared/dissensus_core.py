# Databricks notebook source
# MAGIC %md
# MAGIC # shared/dissensus_core — DisagreementScorer + OOD detector
# MAGIC
# MAGIC Single authoritative definition of all scoring logic.
# MAGIC Imported by:
# MAGIC   - 04_dissensus_scorer.py  (unit tests + simulation)
# MAGIC   - 09_nightly_agent_runner.py  (live scoring)
# MAGIC
# MAGIC %run AFTER config and utils:
# MAGIC   %run ../shared/config
# MAGIC   %run ../shared/utils
# MAGIC   %run ../shared/dissensus_core

# COMMAND ----------

import subprocess
subprocess.run(
    ["pip", "install", "scipy", "scikit-learn", "numpy", "-q"],
    capture_output=True,
)

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.stats import entropy as scipy_entropy
from sklearn.covariance import LedoitWolf

# ── Data contracts ────────────────────────────────────────────────────────────

@dataclass
class AgentOutput:
    agent_id:      str
    p_bear:        float          # P(bear) — P(GDP < 1%) or equivalent
    p_base:        float          # P(base)
    p_bull:        float          # P(bull) — P(GDP >= 3%) or equivalent
    rationale:     str   = ""
    model_version: str   = "unknown"

    def __post_init__(self):
        total = self.p_bear + self.p_base + self.p_bull
        assert abs(total - 1.0) < 1e-4, \
            f"{self.agent_id}: probs sum to {total:.4f}, not 1.0"
        assert all(0 <= p <= 1 for p in [self.p_bear, self.p_base, self.p_bull]), \
            f"{self.agent_id}: probability outside [0,1]"

    @property
    def dist(self) -> np.ndarray:
        return np.array([self.p_bear, self.p_base, self.p_bull])


@dataclass
class DissensusResult:
    d_t:                  float
    d_t_z:                Optional[float]
    regime:               str            # normal | elevated | high | extreme
    ood_flag:             bool
    suspicious_consensus: bool
    w1_mean:              float
    jsd:                  float
    dir_var:              float
    n_agents:             int
    ci_adj:               float          # aggregator CI width adjustment
    alpha_adj:            float          # aggregator extremization alpha adjustment
    agent_outputs:        list[AgentOutput] = field(default_factory=list)


# ── Core metric functions ─────────────────────────────────────────────────────

def w1_3bin(p: np.ndarray, q: np.ndarray) -> float:
    """
    Wasserstein-1 distance on ordinal 3-bin distributions.
    Formula: |F_p(1) - F_q(1)| + |F_p(2) - F_q(2)|
    where F is the CDF. Max value = 2.0 (bear vs bull).
    INVARIANT: w1_3bin(p, p) == 0  for all valid p.
    """
    assert abs(p.sum() - 1.0) < 1e-4 and abs(q.sum() - 1.0) < 1e-4
    fp = np.cumsum(p)
    fq = np.cumsum(q)
    return float(np.abs(fp[:-1] - fq[:-1]).sum())   # sum over first 2 CDF points


def jsd_n(dists: list[np.ndarray]) -> float:
    """
    Jensen-Shannon Divergence across N distributions.
    JSD = H(mean) - mean(H(d_i))
    Returns value in [0, log(N)].
    """
    n    = len(dists)
    mean = np.mean(dists, axis=0)
    h_mean = float(scipy_entropy(mean))
    h_each = [float(scipy_entropy(d)) for d in dists]
    return max(0.0, h_mean - np.mean(h_each))


def directional_var(dists: list[np.ndarray]) -> float:
    """
    Variance of (p_bull - p_bear) across agents.
    Captures directional disagreement independent of base allocation.
    """
    bull_minus_bear = [d[2] - d[0] for d in dists]
    return float(np.var(bull_minus_bear))


def pairwise_w1_mean(dists: list[np.ndarray]) -> float:
    """Mean of all pairwise W1 distances. O(n^2) — fine for n<=10 agents."""
    n      = len(dists)
    total  = 0.0
    count  = 0
    for i in range(n):
        for j in range(i + 1, n):
            total += w1_3bin(dists[i], dists[j])
            count += 1
    return total / count if count > 0 else 0.0


# ── DisagreementScorer ────────────────────────────────────────────────────────

class DisagreementScorer:
    """
    Stateful scorer that maintains rolling z-score history and regime state.

    Usage:
        scorer  = DisagreementScorer()
        result  = scorer.score(agent_outputs, ood_flag=False)
        agg_adj = scorer.adjust_aggregator(result)
    """

    def __init__(self,
                 warmup: int = 63,
                 z_window: int = 252,
                 w_w1:     float = None,
                 w_jsd:    float = None,
                 w_dirvar: float = None):
        # Weights — default from config
        self.w_w1     = w_w1     if w_w1     is not None else W_W1      # noqa: F821
        self.w_jsd    = w_jsd    if w_jsd    is not None else W_JSD     # noqa: F821
        self.w_dirvar = w_dirvar if w_dirvar is not None else W_DIRVAR  # noqa: F821
        assert abs(self.w_w1 + self.w_jsd + self.w_dirvar - 1.0) < 1e-6

        self.warmup    = warmup
        self.z_window  = z_window
        self._history: list[float] = []   # raw D_t values for z-score
        self._regime   = "normal"         # current regime (hysteresis)

    # ── public API ──────────────────────────────────────────────────────────

    def score(self, agents: list[AgentOutput], ood_flag: bool = False) -> DissensusResult:
        """
        Compute D_t from a list of AgentOutputs.
        Appends to history, updates regime with hysteresis.
        """
        if len(agents) == 0:
            raise ValueError("score() requires at least 1 agent")

        dists   = [a.dist for a in agents]
        w1_mean = pairwise_w1_mean(dists)
        jsd     = jsd_n(dists)
        dir_v   = directional_var(dists)

        # Raw D_t (unscaled, in metric units)
        d_raw = (self.w_w1 * w1_mean +
                 self.w_jsd * jsd +
                 self.w_dirvar * dir_v)

        self._history.append(d_raw)

        # Rolling z-score (only after warmup)
        d_z = None
        if len(self._history) >= self.warmup:
            window = self._history[-self.z_window:]
            mu     = np.mean(window)
            sigma  = np.std(window, ddof=1)
            d_z    = float((d_raw - mu) / sigma) if sigma > 1e-9 else 0.0

        # Percentile for regime (use window)
        window     = self._history[-self.z_window:]
        pct_rank   = sum(1 for x in window if x <= d_raw) / len(window)
        regime     = self._update_regime(pct_rank)

        # suspicious_consensus: low D_t but OOD — maximum caution
        suspicious = (ood_flag and d_raw <= np.percentile(window, 25))

        # Aggregator adjustment factors
        ci_adj    = CI_BASE * (1 + 0.5 * max(0.0, d_z or 0.0))  # noqa: F821
        alpha_adj = max(1.0, ALPHA_BASE - 0.2 * max(0.0, d_z or 0.0))  # noqa: F821

        return DissensusResult(
            d_t=d_raw,
            d_t_z=d_z,
            regime=regime,
            ood_flag=ood_flag,
            suspicious_consensus=suspicious,
            w1_mean=w1_mean,
            jsd=jsd,
            dir_var=dir_v,
            n_agents=len(agents),
            ci_adj=min(ci_adj, P_CAP),      # noqa: F821
            alpha_adj=alpha_adj,
            agent_outputs=agents,
        )

    def adjust_aggregator(self, result: DissensusResult) -> dict:
        """
        Return aggregator parameter overrides based on current dissensus.
        Passed to the log-opinion pooling aggregator in 09_nightly_agent_runner.
        """
        return {
            "ci_adj":       result.ci_adj,
            "alpha_adj":    result.alpha_adj,
            "p_cap":        P_CAP,           # noqa: F821
            "regime":       result.regime,
            "ood_gate":     result.ood_flag,
        }

    def history_df(self) -> "pd.DataFrame":
        import pandas as pd
        return pd.DataFrame({"d_raw": self._history})

    # ── private ──────────────────────────────────────────────────────────────

    def _update_regime(self, pct_rank: float) -> str:
        """
        Hysteresis regime update.
        REGIME_THRESHOLDS = {name: (enter_pct, exit_pct)}
        """
        thresholds = REGIME_THRESHOLDS  # noqa: F821
        current    = self._regime
        for level in ["extreme", "high", "elevated"]:
            enter, exit_ = thresholds[level]
            if current == level:
                if pct_rank < exit_:
                    # Step down: find correct lower level
                    if level == "extreme" and pct_rank >= thresholds["high"][0]:
                        current = "high"
                    elif level in ("extreme", "high") and pct_rank >= thresholds["elevated"][0]:
                        current = "elevated"
                    else:
                        current = "normal"
                break
            elif pct_rank >= enter:
                current = level
                break
        self._regime = current
        return current


# ── OOD Detector (Mahalanobis) ────────────────────────────────────────────────

class OODDetector:
    """
    Stateful OOD detector using Ledoit-Wolf shrinkage covariance.
    Maintains a rolling window of macro feature vectors.
    Flags observations whose Mahalanobis distance exceeds the
    OOD_PERCENTILE-th percentile of the rolling window.
    """

    def __init__(self, window: int = OOD_ROLLING_WINDOW,   # noqa: F821
                 percentile: int = OOD_PERCENTILE):         # noqa: F821
        self.window     = window
        self.percentile = percentile
        self._history: list[np.ndarray] = []
        self._distances: list[float]    = []

    def update(self, feature_vector: np.ndarray) -> bool:
        """
        Append a new macro feature vector and return OOD flag.
        Returns False during warmup (< 252 observations).
        """
        self._history.append(feature_vector)
        if len(self._history) < 252:
            self._distances.append(0.0)
            return False

        window_data = np.stack(self._history[-self.window:])
        lw          = LedoitWolf().fit(window_data)
        mu          = lw.location_
        prec        = lw.get_precision()
        diff        = feature_vector - mu
        maha        = float(math.sqrt(diff @ prec @ diff))
        self._distances.append(maha)

        threshold = np.percentile(self._distances[-self.window:], self.percentile)
        return maha > threshold

    def latest_distance(self) -> Optional[float]:
        return self._distances[-1] if self._distances else None

    def calibration_rate(self) -> float:
        """Fraction of days flagged — should be ~1% if OOD_PERCENTILE=99."""
        if not self._distances:
            return 0.0
        return sum(1 for d in self._distances if d > 0) / len(self._distances)


print("[dissensus_core] DisagreementScorer, OODDetector, w1_3bin, jsd_n loaded")
