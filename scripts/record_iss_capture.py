#!/usr/bin/env python3
"""Record a real session of public ISS Lightstreamer telemetry into a replayable capture fixture.

The CaptureAdapter (backend/app/services/telemetry_stream_ingest.py) replays this fixture in CI and
offline dev so nothing ever depends on the live feed. Frames are stored with offsets relative to the
recording start; replay re-bases them onto the current wall clock.

ts semantics: `ts_offset_s` is the RECEIVE time offset (wall clock at the recorder when the update
arrived). The feed's raw `TimeStamp` field (GMT decimal-hours format) is preserved per frame in
`raw` for provenance/calibration but is not used as the replay clock.

Usage:
    pip install lightstreamer-client-lib
    python scripts/record_iss_capture.py --duration 180 \
        --out backend/app/data/telemetry/iss_capture.json
"""
from __future__ import annotations

import argparse
import json
import threading
import time
from pathlib import Path

from lightstreamer.client import LightstreamerClient, Subscription

LS_SERVER = "https://push.lightstreamer.com"
LS_ADAPTER_SET = "ISSLIVE"

# Curated channel set — must match the 10015 migration seed (tel_telemetry_channels).
CHANNELS = [
    "USLAB000058",   # Lab cabin pressure (mmHg)
    "USLAB000059",   # Lab cabin temperature (degC)
    "USLAB000062",   # Lab ppO2 (mmHg)
    "USLAB000063",   # Lab ppN2 (mmHg)
    "USLAB000064",   # Lab ppCO2 (mmHg)
    "AIRLOCK000049", # Crewlock pressure (mmHg)
    "NODE3000005",   # Urine tank qty (%)
    "NODE3000008",   # Waste water tank qty (%)
    "NODE3000009",   # Clean water tank qty (%)
    "S4000001",      # 1A solar array voltage (V)
    "S6000004",      # 4B solar array voltage (V)
    "P4000001",      # 2A solar array voltage (V)
]
FIELDS = ["TimeStamp", "Value", "Status.Class", "Status.Indicator"]


class _Recorder:
    def __init__(self) -> None:
        self.t0 = time.time()
        self.frames: list[dict] = []
        self.lock = threading.Lock()
        self.status = "connecting"

    def on_update(self, update) -> None:  # SubscriptionListener.onItemUpdate
        try:
            raw_value = update.getValue("Value")
            value = float(raw_value) if raw_value not in (None, "") else None
        except (TypeError, ValueError):
            value = None
        frame = {
            "channel_key": update.getItemName(),
            "ts_offset_s": round(time.time() - self.t0, 3),
            "value": value,
            "raw": {
                "TimeStamp": update.getValue("TimeStamp"),
                "Status.Class": update.getValue("Status.Class"),
                "Status.Indicator": update.getValue("Status.Indicator"),
            },
        }
        with self.lock:
            self.frames.append(frame)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=int, default=180, help="seconds to record")
    ap.add_argument("--out", default="backend/app/data/telemetry/iss_capture.json")
    args = ap.parse_args()

    rec = _Recorder()
    client = LightstreamerClient(LS_SERVER, LS_ADAPTER_SET)
    sub = Subscription(mode="MERGE", items=CHANNELS, fields=FIELDS)

    class _SubListener:
        def onItemUpdate(self, update):  # noqa: N802 (lightstreamer API casing)
            rec.on_update(update)
        def __getattr__(self, _name):    # absorb the other listener callbacks
            return lambda *a, **k: None

    class _ClientListener:
        def onStatusChange(self, status):  # noqa: N802
            rec.status = status
            print(f"[recorder] client status: {status}", flush=True)
        def __getattr__(self, _name):
            return lambda *a, **k: None

    sub.addListener(_SubListener())
    client.addListener(_ClientListener())
    client.subscribe(sub)
    client.connect()

    print(f"[recorder] recording {len(CHANNELS)} channels for {args.duration}s …", flush=True)
    deadline = time.time() + args.duration
    while time.time() < deadline:
        time.sleep(5)
        with rec.lock:
            n = len(rec.frames)
        print(f"[recorder] t+{int(time.time() - rec.t0)}s frames={n} status={rec.status}", flush=True)

    client.disconnect()
    with rec.lock:
        frames = sorted(rec.frames, key=lambda f: f["ts_offset_s"])

    per_chan: dict[str, int] = {}
    for f in frames:
        per_chan[f["channel_key"]] = per_chan.get(f["channel_key"], 0) + 1

    fixture = {
        "source": "iss_lightstreamer_public",
        "server": LS_SERVER,
        "adapter_set": LS_ADAPTER_SET,
        "recorded_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(rec.t0)),
        "duration_s": args.duration,
        "channels": CHANNELS,
        "frames_per_channel": per_chan,
        "note": "Real recorded public ISS telemetry frames. ts_offset_s = receive-time offset from "
                "recording start; replay re-bases onto the current clock. Raw feed TimeStamp kept "
                "per frame for provenance.",
        "frames": frames,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, indent=1), encoding="utf-8")
    print(f"[recorder] wrote {len(frames)} frames across {len(per_chan)} channels -> {out}", flush=True)
    if not frames:
        print("[recorder] WARNING: zero frames recorded — feed unreachable or channel set wrong", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
