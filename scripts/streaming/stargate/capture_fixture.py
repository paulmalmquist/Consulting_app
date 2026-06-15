#!/usr/bin/env python3
"""Generate the checked-in capture fixture — deterministic, no broker needed.

The fixture is the bridge's ``capture`` mode input: the CI path and the demo
floor when the network dies. ~60 seconds of 4-printer telemetry where each
printer runs a ``normal`` job segment then a ``pre_failure`` segment, so the
anomaly predicate visibly fires during replay. Three deliberately bad lines
exercise the DLQ path.

    python capture_fixture.py          # rewrites backend/app/data/stargate/replay_capture.jsonl

Determinism: fixed seed, fixed offsets, no wall clock. Regenerating produces a
byte-identical file unless the waveforms or maps changed — which is exactly
when the fixture should change.
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
SEGMENTS = ["normal", "pre_failure"]
SAMPLE_SPACING_MS = 100        # per printer -> 60s of replay per loop
SEED = 20260611

# (line_index, raw_line) — the DLQ beats. Indices spread through the file.
BAD_LINES = [
    (97, "not json {{{ corrupted sensor packet 0xDEADBEEF"),
    (901, json.dumps({"kind": "bad", "offset_ms": 22525, "note": "schema violation: fields missing"})),
    (1803, json.dumps({"kind": "mystery", "offset_ms": 45075, "payload": [1, 2, 3]})),
]


def build_lines() -> list[str]:
    entries: list[tuple[int, dict]] = []
    for p in range(PRINTERS):
        printer_id = f"stargate-v4-{p + 1:02d}"
        sample_idx = 0
        for seg_idx, pattern in enumerate(SEGMENTS):
            rng = np.random.default_rng(SEED + p * 1000 + seg_idx)
            temp = waveforms.generate(pattern, "temperature", SAMPLES_PER_SEGMENT, rng)
            vib = waveforms.generate(pattern, "vibration_rms", SAMPLES_PER_SEGMENT, rng)
            flow = waveforms.generate(pattern, "flow_rate", SAMPLES_PER_SEGMENT, rng)
            job_id = f"JOB-{p:02d}-{seg_idx:04d}-{pattern.upper()}"
            for i in range(SAMPLES_PER_SEGMENT):
                x, y, z, layer = toolpath(sample_idx)
                offset_ms = sample_idx * SAMPLE_SPACING_MS + p * 13  # stagger printers
                entries.append((offset_ms, {
                    "kind": "telemetry",
                    "offset_ms": offset_ms,
                    "data": {
                        "printer_id": printer_id,
                        "layer": layer,
                        "print_job_id": job_id,
                        "x": x, "y": y, "z": z,
                        "melt_pool_temp_c": round(sm.melt_pool_temp_c(float(temp[i])), 2),
                        "deposition_rate_kg_hr": round(sm.deposition_rate_kg_hr(float(flow[i])), 2),
                        "arm_vibration_g": round(sm.arm_vibration_g(float(vib[i])), 5),
                    },
                }))
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
