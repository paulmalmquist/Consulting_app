"""Stargate channel maps and the anomaly predicate — single source of truth.

The producer, the bridge's local "Flink emulation" aggregator, and the tests all
import these constants. PR 4's Flink statement
(infra/confluent/stargate/flink/02_anomaly_route.sql) encodes the same
predicate; test_stargate_codec parses the SQL and asserts the constants match,
so the two definitions cannot drift.

Lives in backend/app/services so it ships in the Railway image (the Docker
build context is backend/ only). The scripts-dir signal_mapping.py is a
re-export shim. Import purity: pure stdlib — never app.config / app.observability
(config hard-exits without DATABASE_URL, which the laptop tooling venv lacks).

Raw signals come from rs_factory_seed.waveforms (level/sigma/amp per channel);
the affine maps below translate them into physical printer units:

  temperature  (level 450) -> melt_pool_temp_c, NEGATIVE slope so the
               pre_failure pattern's rising raw signal reads as a melt-pool
               temperature drop (the failure mode that matters in deposition).
  vibration_rms (level 2.0) -> arm_vibration_g, zero-floored excess so normal
               jitter sits near 0.02 g and only real excursions climb.
  flow_rate    (level 120) -> deposition_rate_kg_hr.
"""

from __future__ import annotations

import statistics
from collections.abc import Sequence

# Anomaly predicate constants. Mirrored in infra/confluent/flink/02_anomaly_route.sql.
TEMP_THRESHOLD_C = 1400.0
VIBRATION_THRESHOLD_G = 0.08

# Human-readable predicate for operator/drawer copy. The redline is a COLD melt pool
# (temp below 1400C) together with a shaking arm (vibration above 0.08g) — never "high temp".
PREDICATE_TEXT = "cold melt pool (melt_pool_temp_c < 1400°C) AND high arm vibration (arm_vibration_g > 0.08g)"

# Affine map parameters keyed by waveform channel.
MELT_POOL_NOMINAL_C = 1500.0
MELT_POOL_SLOPE = -2.2          # degC per raw-temperature unit above level
TEMP_RAW_LEVEL = 450.0

VIBRATION_FLOOR_G = 0.02
VIBRATION_SLOPE = 0.05          # g per raw-vibration unit above level
VIBRATION_RAW_LEVEL = 2.0

DEPOSITION_SLOPE = 0.2          # kg/hr per raw flow unit


def melt_pool_temp_c(raw_temperature: float) -> float:
    return MELT_POOL_NOMINAL_C + MELT_POOL_SLOPE * (raw_temperature - TEMP_RAW_LEVEL)


def arm_vibration_g(raw_vibration_rms: float) -> float:
    return VIBRATION_FLOOR_G + VIBRATION_SLOPE * max(0.0, raw_vibration_rms - VIBRATION_RAW_LEVEL)


def deposition_rate_kg_hr(raw_flow_rate: float) -> float:
    return DEPOSITION_SLOPE * raw_flow_rate


# ── derived process-context features ────────────────────────────────────────────────
# Pure stdlib (no numpy): the producer, the capture fixture, AND the bridge's hot path
# all compute these from the same definitions, so toolpath_speed / acceleration /
# temp_slope can never drift between where they're recorded and where they're scored.

def toolpath_speed_mm_s(
    x0: float, y0: float, z0: float,
    x1: float, y1: float, z1: float,
    dt_s: float,
) -> float:
    """Toolhead speed (mm/s) between two positions over dt_s. 0 when dt is non-positive
    (the first sample of a stream has no predecessor)."""
    if dt_s <= 0.0:
        return 0.0
    dist = ((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) ** 0.5
    return dist / dt_s


def acceleration_mm_s2(speed_prev_mm_s: float, speed_curr_mm_s: float, dt_s: float) -> float:
    """Toolhead acceleration (mm/s^2) from two consecutive speeds over dt_s."""
    if dt_s <= 0.0:
        return 0.0
    return (speed_curr_mm_s - speed_prev_mm_s) / dt_s


def temp_slope_c_per_s(temps: Sequence[float], dt_s: float) -> float:
    """Melt-pool temperature slope (degC/s) across a short window — endpoint slope, cheap
    and deterministic. A falling melt pool (the deposition failure mode) reads negative.
    0 when the window is too short or dt is non-positive."""
    n = len(temps)
    if n < 2 or dt_s <= 0.0:
        return 0.0
    return (temps[-1] - temps[0]) / ((n - 1) * dt_s)


def is_anomalous(temp_c: float, vibration_g: float) -> bool:
    """A structural-flaw signature: cold melt pool AND a shaking arm, together."""
    return temp_c < TEMP_THRESHOLD_C and vibration_g > VIBRATION_THRESHOLD_G


# ── baseline anomaly scorer (frozen rolling-MAD champion, re-expressed pure-stdlib) ──────
# The promoted anomaly champion (tel_anomaly_detector@champion) is a rolling-MAD dynamic
# threshold. backend/app/services/telemetry_serving.py re-implements it for /score, but that
# module imports app.db, which the bridge must NOT (import purity — the laptop venv has no
# DATABASE_URL). So the SAME math is re-expressed here, pure-stdlib, for the live bridge lane.
# These constants and the verdict bands MUST equal telemetry_serving.MAD_K /
# GLOBAL_TRAIN_SCALE / _verdict_for, and the normalization MUST match
# telemetry_stream_etl.normalize_window / rolling_mean — test_stargate_codec locks all three.
# This is a BASELINE scorer (rolling-MAD), NOT an LSTM. Label it honestly everywhere.
BASELINE_MAD_K = 4.0
BASELINE_GLOBAL_TRAIN_SCALE = 0.033866801182436346
BASELINE_ROLLING_POINTS = 50          # matches the champion's value_rmean50 window
BASELINE_MIN_WINDOW = 10              # below this -> fail closed (insufficient_window)
BASELINE_SCORER_NAME = "baseline scorer (rolling-MAD residual)"
BASELINE_SCORER_VERSION = "mad-k4.0-gscale0.0339"   # constants fingerprint, surfaced honestly


def baseline_verdict(score: float | None) -> str:
    """GO / REVIEW / NO_GO band on the score — mirrors telemetry_serving._verdict_for exactly."""
    if score is None:
        return "GO"
    if score < 1.0:
        return "GO"
    if score <= 2.0:
        return "REVIEW"
    return "NO_GO"


def _normalize_fractional(values: Sequence[float]) -> list[float]:
    """v / median(|window|) — matches telemetry_stream_etl.normalize_window. Raw engineering units
    (melt pool ~1500C) vs the normalized-unit champion threshold: normalize before scoring."""
    base = statistics.median(abs(v) for v in values) if values else 0.0
    base = max(base, 1e-9)
    return [v / base for v in values]


def _rolling_mean(values: Sequence[float], window: int = BASELINE_ROLLING_POINTS) -> list[float]:
    """Trailing mean over `window` points incl. current (min_periods=1) — the rmean50 frame.
    Mirrors telemetry_stream_etl.rolling_mean."""
    out: list[float] = []
    acc = 0.0
    buf: list[float] = []
    for v in values:
        buf.append(v)
        acc += v
        if len(buf) > window:
            acc -= buf.pop(0)
        out.append(acc / len(buf))
    return out


def score_baseline(values: Sequence[float]) -> dict:
    """Score a trailing window of one channel's raw values with the frozen rolling-MAD champion.
    Returns the display contract used by the SSE frame and the drawer. FAIL CLOSED: a window shorter
    than BASELINE_MIN_WINDOW yields model_not_configured + null_reason 'insufficient_window' and a null
    score — never a fabricated number."""
    threshold = round(BASELINE_MAD_K * BASELINE_GLOBAL_TRAIN_SCALE, 6)
    if len(values) < BASELINE_MIN_WINDOW:
        return {
            "name": BASELINE_SCORER_NAME, "version": BASELINE_SCORER_VERSION,
            "score": None, "verdict": None, "threshold": threshold,
            "model_not_configured": True, "null_reason": "insufficient_window",
        }
    norm = _normalize_fractional([float(v) for v in values])
    rmeans = _rolling_mean(norm)
    peak_resid = max(abs(n - m) for n, m in zip(norm, rmeans))
    raw_threshold = BASELINE_MAD_K * BASELINE_GLOBAL_TRAIN_SCALE
    score = round(peak_resid / raw_threshold, 6) if raw_threshold else None
    return {
        "name": BASELINE_SCORER_NAME, "version": BASELINE_SCORER_VERSION,
        "score": score, "verdict": baseline_verdict(score), "threshold": threshold,
        "model_not_configured": False, "null_reason": None,
    }


# ── Kafka provenance helpers (capture-mode synthesis; shared by bridge + durable sink) ───
STARGATE_PARTITION_COUNT = 6   # matches stargate.printer.telemetry.v1
CAPTURE_SCHEMA_NULL_REASON = "capture_mode_synthetic_schema_id"


def synthetic_partition(printer_id: str, partition_count: int = STARGATE_PARTITION_COUNT) -> int:
    """Deterministic partition for a printer key — a stable (non-salted) hash so two cold starts and
    the durable sink agree. Kafka keys Stargate telemetry on printer_id, so this is faithful in shape
    to how the real broker would place the record; in capture mode it is labeled synthetic."""
    h = 0
    for ch in printer_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % max(1, partition_count)


# ── multi-window rolling features (5s / 15s / 60s) ───────────────────────────────────────
def _window_stats(points: list[dict]) -> dict:
    """avg temp, max vib, temp/vib slope, n over a set of telemetry points (one window)."""
    n = len(points)
    if n == 0:
        return {"n": 0, "avg_temp_c": None, "max_vib_g": None,
                "temp_slope_c_per_s": None, "vib_slope_g_per_s": None}
    temps = [float(p["melt_pool_temp_c"]) for p in points]
    vibs = [float(p["arm_vibration_g"]) for p in points]
    span_us = points[-1]["ts_us"] - points[0]["ts_us"]
    dt_s = (span_us / 1_000_000) / (n - 1) if n > 1 else 0.0
    return {
        "n": n,
        "avg_temp_c": round(sum(temps) / n, 3),
        "max_vib_g": round(max(vibs), 5),
        "temp_slope_c_per_s": round(temp_slope_c_per_s(temps, dt_s), 4),
        "vib_slope_g_per_s": round(temp_slope_c_per_s(vibs, dt_s), 6),
    }


class MultiWindowAggregator:
    """Rolling 5s / 15s / 60s features (avg temp, max vib, temp/vib slope, n) over a printer's recent
    telemetry. Pure: computed on demand from the points the bridge already holds, so it carries no
    incremental state and never drifts from the chart. Sits beside TumblingAggregator (which owns the
    5s TUMBLING agg rows for the chart / agg topic); this owns the scorer + drawer feature windows."""

    WINDOWS = (("w5s", 5), ("w15s", 15), ("w60s", 60))

    def features(self, points: list[dict], now_us: int) -> dict:
        pts = sorted(points, key=lambda p: p["ts_us"])
        return {
            label: _window_stats([p for p in pts if p["ts_us"] >= now_us - span * 1_000_000])
            for label, span in self.WINDOWS
        }


class TumblingAggregator:
    """5-second tumbling windows over telemetry — the bridge's local stand-in for
    the managed Flink statement (01_agg_5s.sql). Pure Python on purpose: the
    health endpoint labels its output "local aggregation (Flink emulation)" so a
    viewer always knows which engine produced the line they are looking at."""

    def __init__(self, window_ms: int = 5000) -> None:
        self.window_ms = window_ms
        # (printer_id, window_start_ms) -> [count, temp_sum, max_vib]
        self._open: dict[tuple[str, int], list[float]] = {}

    def add(self, printer_id: str, ts_us: int, temp_c: float, vibration_g: float) -> None:
        window_start = (ts_us // 1000) // self.window_ms * self.window_ms
        slot = self._open.setdefault((printer_id, window_start), [0, 0.0, 0.0])
        slot[0] += 1
        slot[1] += temp_c
        slot[2] = max(slot[2], vibration_g)

    def flush_closed(self, now_ms: int) -> list[dict]:
        """Emit rows for windows whose end has passed. Mirrors Flink's output shape."""
        rows: list[dict] = []
        for (printer_id, window_start), (count, temp_sum, max_vib) in list(self._open.items()):
            if window_start + self.window_ms <= now_ms:
                rows.append({
                    "printer_id": printer_id,
                    "window_start_ms": window_start,
                    "window_end_ms": window_start + self.window_ms,
                    "avg_temp_c": round(temp_sum / count, 3) if count else 0.0,
                    "max_vibration_g": round(max_vib, 5),
                    "n": int(count),
                })
                del self._open[(printer_id, window_start)]
        rows.sort(key=lambda r: (r["window_start_ms"], r["printer_id"]))
        return rows
