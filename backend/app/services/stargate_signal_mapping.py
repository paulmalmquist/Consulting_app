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

from collections.abc import Sequence

# Anomaly predicate constants. Mirrored in infra/confluent/flink/02_anomaly_route.sql.
TEMP_THRESHOLD_C = 1400.0
VIBRATION_THRESHOLD_G = 0.08

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
