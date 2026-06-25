#!/usr/bin/env python3
"""Generate the checked-in capture fixture — deterministic, no broker needed.

The fixture is the bridge's ``capture`` mode input: the CI path and the demo
floor when the network dies. ~60 seconds of 4-printer telemetry, one personality
per printer so the Rules-vs-baseline story is legible on replay:

  stargate-v4-01  normal -> normal       nominal control; no rule fire, baseline GO
  stargate-v4-02  normal -> pre_failure  coupled drift; the melt pool falls and the
                                         arm shakes together while feed/power stay
                                         stable, so the baseline scorer flags REVIEW
                                         BEFORE the hard rule co-fires (the showcase)
  stargate-v4-03  normal -> redline      an abrupt cold-melt-pool + shaking-arm step
                                         that crosses BOTH thresholds at once; rule
                                         and baseline fire together (the obvious fault)
  stargate-v4-04  normal -> pre_failure  carries the deliberately bad lines (DLQ beats)

    python capture_fixture.py          # rewrites backend/app/data/stargate/replay_capture.jsonl

Determinism: fixed seed, fixed offsets, no wall clock. Regenerating produces a
byte-identical file unless the waveforms, maps, or derived features changed —
which is exactly when the fixture should change.

The redline is NOT a shared rs_factory_seed waveform (those are owned by the
generator PRs); it's authored here as demo data. It never touches the anomaly
predicate or the scorer thresholds — it only crosses them.
"""

from __future__ import annotations

import json

import common  # noqa: F401  (sys.path bootstrap)
import numpy as np

import signal_mapping as sm
from producer import toolpath
from rs_factory_seed import waveforms

PRINTERS = 4
SAMPLES_PER_SEGMENT = 300
SAMPLE_SPACING_MS = 100        # per printer -> 60s of replay per loop
SAMPLE_SPACING_S = SAMPLE_SPACING_MS / 1000.0
TEMP_SLOPE_WINDOW = 5          # samples (0.5s) backing the temp_slope feature
SEED = 20260611
CAPTURE_ID = "cap-stargate-20260611"   # this fixture's identity (the drawer's join key)

# One personality per printer (see the module docstring). v4-03 uses the locally
# authored "redline"; the rest use shared rs_factory_seed patterns.
SEGMENTS_BY_PRINTER = {
    0: ["normal", "normal"],          # v4-01 nominal control
    1: ["normal", "coupled_drift"],   # v4-02 baseline leads the rule (see _coupled_drift_raw)
    2: ["normal", "redline"],         # v4-03 abrupt cold-pool + vibration redline
    3: ["normal", "pre_failure"],     # v4-04 carries the DLQ beats
}

# (line_index, raw_line) — the DLQ beats, flavored as stargate-v4-04 so the dead-letter
# feed visibly ties to that printer. Each is unparseable or schema-violating on purpose.
BAD_LINES = [
    (97, "not json {{{ corrupted stargate-v4-04 sensor packet 0xDEADBEEF"),
    (450, json.dumps({"kind": "bad", "offset_ms": 11200, "printer_id": "stargate-v4-04",
                      "note": "schema violation: melt_pool_temp_c missing"})),
    (901, json.dumps({"kind": "bad", "offset_ms": 22525, "printer_id": "stargate-v4-04",
                      "note": "out-of-order timestamp"})),
    (1350, json.dumps({"kind": "mystery", "offset_ms": 33750, "printer_id": "stargate-v4-04",
                       "payload": [1, 2, 3]})),
    (1803, "stargate-v4-04 ::: truncated frame >>> not-valid-json"),
]


def _redline_raw(channel: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """Abrupt cold-melt-pool + shaking-arm redline: nominal until t>0.55, then a hard
    step that pushes BOTH the mapped temperature below 1400C and the mapped vibration
    above 0.08g at the same instant — the 'obvious' fault the threshold rule is for."""
    level, sigma, _amp = waveforms.CHANNELS[channel]
    t = np.linspace(0.0, 1.0, n)
    noise = rng.normal(0.0, sigma, n)
    if channel == "temperature":
        step = np.where(t > 0.55, 62.0, 0.0)   # raw +62 -> melt pool ~1364C (< 1400)
        return level + step + noise
    if channel == "vibration_rms":
        step = np.where(t > 0.55, 1.9, 0.0)     # raw +1.9 -> arm vib ~0.115g (> 0.08)
        return level + step + noise
    return level + noise                        # flow stays nominal


def _coupled_drift_raw(channel: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """v4-02 — the baseline-leads-the-rule case. An early melt-pool TEMPERATURE excursion (raw temp up,
    so the melt pool dips well below 1400C) while arm vibration stays NOMINAL, so the two-condition rule
    (cold pool AND shaking arm) stays silent — but the rolling-MAD baseline flags the temperature
    excursion as REVIEW. Later a SUSTAINED cold-pool + vibration redline finally trips the hard rule.
    Feed/power are held stable elsewhere, so the early signal is a melt-pool instability the rule misses.
    Authored here as demo data; it crosses neither the predicate nor the scorer thresholds, it only
    exercises them."""
    level, sigma, _amp = waveforms.CHANNELS[channel]
    t = np.linspace(0.0, 1.0, n)
    noise = rng.normal(0.0, sigma, n)
    if channel == "temperature":
        # early excursion: raw +135 over t in [0.18,0.26) -> melt pool ~1203C (cold), vibration nominal
        excursion = np.where((t >= 0.18) & (t < 0.26), 135.0, 0.0)
        # sustained redline: raw +62 at t>0.62 -> melt pool ~1364C (cold)
        redline = np.where(t > 0.62, 62.0, 0.0)
        return level + excursion + redline + noise
    if channel == "vibration_rms":
        # nominal through the early temp excursion; rises only with the sustained redline at t>0.62
        redline = np.where(t > 0.62, 1.9, 0.0)
        return level + redline + noise
    return level + noise                          # flow stays nominal


def _generate_raw(pattern: str, channel: str, n: int, rng: np.random.Generator) -> np.ndarray:
    if pattern == "redline":
        return _redline_raw(channel, n, rng)
    if pattern == "coupled_drift":
        return _coupled_drift_raw(channel, n, rng)
    return waveforms.generate(pattern, channel, n, rng)


def build_lines() -> list[str]:
    entries: list[tuple[int, dict]] = []
    for p in range(PRINTERS):
        printer_id = f"stargate-v4-{p + 1:02d}"
        segments = SEGMENTS_BY_PRINTER[p]
        sample_idx = 0
        prev_xyz: tuple[float, float, float] | None = None
        prev_speed = 0.0
        temp_window: list[float] = []
        for seg_idx, pattern in enumerate(segments):
            rng = np.random.default_rng(SEED + p * 1000 + seg_idx)
            temp = _generate_raw(pattern, "temperature", SAMPLES_PER_SEGMENT, rng)
            vib = _generate_raw(pattern, "vibration_rms", SAMPLES_PER_SEGMENT, rng)
            flow = _generate_raw(pattern, "flow_rate", SAMPLES_PER_SEGMENT, rng)
            # Commanded power and feed stay stable while temp/vib diverge — that contrast
            # is what makes v4-02 a baseline-catches-coupled-drift case, not a redline.
            power = 3500.0 + rng.normal(0.0, 35.0, SAMPLES_PER_SEGMENT)
            quality = np.clip(0.99 + rng.normal(0.0, 0.005, SAMPLES_PER_SEGMENT), 0.0, 1.0)
            job_id = f"JOB-{p:02d}-{seg_idx:04d}-{pattern.upper()}"
            for i in range(SAMPLES_PER_SEGMENT):
                x, y, z, layer = toolpath(sample_idx)
                mp_temp = round(sm.melt_pool_temp_c(float(temp[i])), 2)
                # Derived features, computed once here via the shared helpers the bridge
                # also uses, over the continuous per-printer sample stream.
                speed = (
                    sm.toolpath_speed_mm_s(*prev_xyz, x, y, z, SAMPLE_SPACING_S)
                    if prev_xyz is not None else 0.0
                )
                accel = sm.acceleration_mm_s2(prev_speed, speed, SAMPLE_SPACING_S)
                temp_window.append(mp_temp)
                if len(temp_window) > TEMP_SLOPE_WINDOW:
                    temp_window.pop(0)
                slope = sm.temp_slope_c_per_s(temp_window, SAMPLE_SPACING_S)
                offset_ms = sample_idx * SAMPLE_SPACING_MS + p * 13  # stagger printers
                entries.append((offset_ms, {
                    "kind": "telemetry",
                    "offset_ms": offset_ms,
                    "data": {
                        "printer_id": printer_id,
                        "layer": layer,
                        "print_job_id": job_id,
                        "x": x, "y": y, "z": z,
                        "melt_pool_temp_c": mp_temp,
                        "deposition_rate_kg_hr": round(sm.deposition_rate_kg_hr(float(flow[i])), 2),
                        "arm_vibration_g": round(sm.arm_vibration_g(float(vib[i])), 5),
                        "toolpath_speed_mm_s": round(speed, 3),
                        "acceleration_mm_s2": round(accel, 3),
                        "commanded_power_w": round(float(power[i]), 1),
                        "sensor_quality": round(float(quality[i]), 4),
                        "capture_id": CAPTURE_ID,
                        "temp_slope_c_per_s": round(slope, 4),
                    },
                }))
                prev_xyz = (x, y, z)
                prev_speed = speed
                sample_idx += 1
    entries.sort(key=lambda e: e[0])
    lines = [json.dumps(obj, separators=(",", ":")) for _, obj in entries]
    for index, raw in BAD_LINES:
        lines.insert(min(index, len(lines)), raw)
    return lines


def main() -> int:
    # Single path definition shared with the bridge reader (backend core).
    from app.services.stargate_bridge import fixture_path
    out = fixture_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = build_lines()
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    anomalies = sum(
        1 for line in lines
        if '"kind":"telemetry"' in line
        and sm.is_anomalous(json.loads(line)["data"]["melt_pool_temp_c"],
                            json.loads(line)["data"]["arm_vibration_g"])
    )
    print(f"wrote {out} ({len(lines)} lines, {anomalies} anomalous samples)")
    if anomalies == 0:
        print("ERROR: fixture contains no anomalous samples — demo beat would not fire")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
