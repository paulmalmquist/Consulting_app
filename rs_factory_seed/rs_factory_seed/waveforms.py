"""Deterministic test-telemetry waveforms + window features + similarity (g07 core).

Seven patterns (convo §6 Phase 6). The PF-TPL-01 pre-failure *template* is a fixed base
shape (no per-run randomness); a pre-failure run = that base + small per-run noise. So two
runs sharing PF-TPL-01 are structurally similar (high cosine on their window-feature vectors)
yet not identical (different raw readings) — the SCN-005 golden pair.

Determinism: every random draw comes from a caller-supplied numpy Generator seeded per
(run, channel). The template base is pure math (no RNG). Feature vectors are deterministic
functions of the samples.
"""

from __future__ import annotations

import numpy as np

PATTERNS = [
    "normal", "gradual_drift", "step_change", "oscillation",
    "sensor_dropout", "pre_failure", "false_positive",
]

# baseline (level, noise_sigma, osc_amp) per channel.
CHANNELS = {
    "pressure": (300.0, 4.0, 6.0),
    "temperature": (450.0, 6.0, 4.0),
    "vibration_rms": (2.0, 0.15, 0.4),
    "flow_rate": (120.0, 3.0, 3.0),
}
# all window features we compute + persist (fixed order -> deterministic).
_FEATURES = ("mean", "std", "rms", "slope", "peak_to_peak")
# the subset that discriminates *shape* (a pre-failure signature vs a normal run). mean/rms
# only encode "which channel is this" — identical across runs — so they add no signal and,
# being huge, would swamp the cosine. The similarity vector uses shape features only.
_SHAPE_FEATURES = ("std", "slope", "peak_to_peak")


def _t(n: int) -> np.ndarray:
    return np.linspace(0.0, 1.0, n)


def pf_template_base(channel: str, n: int) -> np.ndarray:
    """PF-TPL-01 pre-failure signature: rising baseline + growing oscillation + late bump.
    Pure deterministic math — identical for every run that uses the template."""
    level, _sigma, amp = CHANNELS[channel]
    t = _t(n)
    rising = level * (1.0 + 0.12 * t)                      # slow climb
    growth = amp * (0.4 + 1.6 * t) * np.sin(2 * np.pi * 7 * t)  # oscillation grows toward end
    bump = amp * 3.0 * np.exp(-((t - 0.85) ** 2) / (2 * 0.01))  # late pre-failure bump
    return rising + growth + bump


def generate(pattern: str, channel: str, n: int, rng: np.random.Generator) -> np.ndarray:
    level, sigma, amp = CHANNELS[channel]
    t = _t(n)
    noise = rng.normal(0.0, sigma, n)
    if pattern == "normal":
        return level + noise
    if pattern == "gradual_drift":
        return level + level * 0.18 * t + noise
    if pattern == "step_change":
        step = np.where(t > 0.6, amp * 4.0, 0.0)
        return level + step + noise
    if pattern == "oscillation":
        return level + amp * 2.0 * np.sin(2 * np.pi * 12 * t) + noise
    if pattern == "sensor_dropout":
        out = level + noise
        lo, hi = int(n * 0.45), int(n * 0.6)
        out[lo:hi] = level  # flatline segment (dropout)
        return out
    if pattern == "pre_failure":
        # shared template base + small per-run noise -> similar, not identical
        return pf_template_base(channel, n) + rng.normal(0.0, sigma * 0.5, n)
    if pattern == "false_positive":
        out = level + noise
        spike = int(n * 0.3)
        out[spike] += amp * 5.0  # single odd-but-accepted transient
        return out
    raise ValueError(f"unknown pattern {pattern!r}")


def window_features(samples: np.ndarray) -> dict[str, float]:
    s = np.asarray(samples, dtype=float)
    if s.size == 0:
        return {f: 0.0 for f in _FEATURES}
    x = np.linspace(0.0, 1.0, s.size)
    slope = float(np.polyfit(x, s, 1)[0]) if s.size > 1 else 0.0
    return {
        "mean": round(float(s.mean()), 6),
        "std": round(float(s.std()), 6),
        "rms": round(float(np.sqrt(np.mean(s ** 2))), 6),
        "slope": round(slope, 6),
        "peak_to_peak": round(float(s.max() - s.min()), 6),
    }


def run_feature_vector(channel_windows: dict[str, list[dict[str, float]]]) -> np.ndarray:
    """Run similarity vector = the per-window *trajectory* of shape features, mean-centered.

    Input: {channel -> [window_features, ...]} in window order (what fact_process_feature_window
    stores per run). For each (channel, shape feature) we take the window-by-window series, scale
    by the channel level, and subtract its mean. Stacking those centered series makes cosine
    behave like the *correlation of how the signal evolves over time*.

    Why trajectory, not run-average: a pre-failure signature (PF-TPL-01) is defined by its shape
    over time — rising oscillation then a late bump. Averaging windows collapses that into a
    single number indistinguishable from a flat run, pinning every cosine near 1.0. Centering the
    window series instead measures whether two runs *rise and bump together*: the two PF-TPL-01
    anchors correlate strongly (high cosine), normal/drift runs correlate weakly (well below).
    Only shape features go in (mean/rms just encode channel level, identical across runs)."""
    series = []
    for ch in sorted(CHANNELS):
        windows = channel_windows.get(ch, [])
        level = CHANNELS[ch][0] or 1.0
        for f in _SHAPE_FEATURES:
            s = np.array([float(w.get(f, 0.0)) for w in windows], dtype=float) / level
            if s.size:
                s = s - s.mean()        # center -> cosine measures shape-over-time correlation
            series.append(s)
    return np.concatenate(series) if series else np.zeros(0)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def run_vectors_from_windows(feature_window_rows: list[dict]) -> dict[str, np.ndarray]:
    """Canonical run-similarity vectors from fact_process_feature_window rows.

    THE contract any downstream consumer (g10 ML outputs, g11 gold, tests) must use to
    reason about run-to-run similarity. It rebuilds each run's per-window shape trajectory
    and runs it through run_feature_vector. Do NOT recompute similarity from raw telemetry
    samples or with a different feature set — that would reinvent SCN-005 and risk flattening
    away the shape features g07 protects."""
    from collections import defaultdict

    by_run_ch: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for w in feature_window_rows:
        by_run_ch[w["run_id"]][w["channel"]].append(w)
    vectors: dict[str, np.ndarray] = {}
    for run_id, chans in by_run_ch.items():
        channel_windows = {
            ch: sorted(windows, key=lambda x: x["window_index"])
            for ch, windows in chans.items()
        }
        vectors[run_id] = run_feature_vector(channel_windows)
    return vectors


def nearest_runs(target_id: str, vectors: dict[str, np.ndarray], k: int = 5) -> list[tuple[str, float]]:
    """Top-k most-similar runs to target_id by cosine on the canonical vectors (desc)."""
    target = vectors[target_id]
    ranked = sorted(
        ((rid, cosine(target, v)) for rid, v in vectors.items() if rid != target_id),
        key=lambda kv: kv[1], reverse=True,
    )
    return ranked[:k]
