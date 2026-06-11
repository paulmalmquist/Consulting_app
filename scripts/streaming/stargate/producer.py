#!/usr/bin/env python3
"""Stargate printer simulator — Protobuf telemetry into Kafka at demo rate.

Simulates N printers laying down layers on a 600x600 mm bed. Signal shapes are
the deterministic rs_factory_seed waveforms (read-only import), affine-mapped
into printer units by signal_mapping. Print jobs rotate through patterns; every
``pre_failure`` job crosses the anomaly predicate (cold melt pool + arm
vibration spike together), so anomaly routing visibly fires during a demo.

    # local Redpanda (infra/local/docker-compose.streaming.yml up first):
    python producer.py --mode local --rate 250

    # Confluent Cloud (PR 4 — CONFLUENT_* env set):
    python producer.py --mode cloud --rate 500

Throughput: --printers 4 --rate 250 is ~1,000 msgs/sec total; --rate 500 is
~2,000/sec. Serialization goes through Schema Registry (local SR at :8081 or
Confluent Cloud SR), so the topic contract is enforced at publish time.
"""

from __future__ import annotations

import argparse
import os
import time

import common  # noqa: F401  (sys.path bootstrap — must precede the imports below)
import numpy as np
from common import StargateTopics, telemetry_message_class

import signal_mapping as sm
from rs_factory_seed import waveforms

# Pattern rotation per print job. pre_failure every 6th job keeps the anomaly
# beat ~once a minute at default settings without making it feel scripted.
JOB_PATTERNS = ["normal", "oscillation", "gradual_drift", "normal", "false_positive", "pre_failure"]
SAMPLES_PER_JOB = 3000
SAMPLES_PER_LAYER = 200
ROWS_PER_LAYER = 10
BED_MIN_MM, BED_MAX_MM = 30.0, 570.0
LAYER_HEIGHT_MM = 0.8


def toolpath(sample_idx: int) -> tuple[float, float, float, int]:
    """Deterministic serpentine raster: x sweeps each row, y steps per row,
    z climbs one layer height per SAMPLES_PER_LAYER samples."""
    layer = sample_idx // SAMPLES_PER_LAYER
    idx = sample_idx % SAMPLES_PER_LAYER
    row = idx * ROWS_PER_LAYER // SAMPLES_PER_LAYER
    samples_per_row = SAMPLES_PER_LAYER // ROWS_PER_LAYER
    frac = (idx % samples_per_row) / max(1, samples_per_row - 1)
    span = BED_MAX_MM - BED_MIN_MM
    x = BED_MIN_MM + span * (frac if row % 2 == 0 else 1.0 - frac)
    y = BED_MIN_MM + span * (row / max(1, ROWS_PER_LAYER - 1))
    z = layer * LAYER_HEIGHT_MM
    return round(x, 2), round(y, 2), round(z, 2), layer


class PrintJob:
    """One print job: precomputed waveform arrays for the three channels."""

    def __init__(self, printer_idx: int, job_idx: int, base_seed: int) -> None:
        self.pattern = JOB_PATTERNS[job_idx % len(JOB_PATTERNS)]
        self.job_id = f"JOB-{printer_idx:02d}-{job_idx:04d}-{self.pattern.upper()}"
        rng = np.random.default_rng(base_seed + printer_idx * 100_003 + job_idx)
        self.temp = waveforms.generate(self.pattern, "temperature", SAMPLES_PER_JOB, rng)
        self.vib = waveforms.generate(self.pattern, "vibration_rms", SAMPLES_PER_JOB, rng)
        self.flow = waveforms.generate(self.pattern, "flow_rate", SAMPLES_PER_JOB, rng)

    def sample(self, idx: int) -> dict:
        x, y, z, layer = toolpath(idx)
        return {
            "layer": layer,
            "print_job_id": self.job_id,
            "x": x, "y": y, "z": z,
            "melt_pool_temp_c": round(sm.melt_pool_temp_c(float(self.temp[idx])), 2),
            "deposition_rate_kg_hr": round(sm.deposition_rate_kg_hr(float(self.flow[idx])), 2),
            "arm_vibration_g": round(sm.arm_vibration_g(float(self.vib[idx])), 5),
        }


class PrinterSim:
    def __init__(self, printer_idx: int, base_seed: int) -> None:
        self.printer_id = f"stargate-v4-{printer_idx + 1:02d}"
        self._printer_idx = printer_idx
        self._base_seed = base_seed
        self._job_idx = 0
        self._sample_idx = 0
        self._job = PrintJob(printer_idx, 0, base_seed)

    def next_sample(self) -> dict:
        if self._sample_idx >= SAMPLES_PER_JOB:
            self._job_idx += 1
            self._sample_idx = 0
            self._job = PrintJob(self._printer_idx, self._job_idx, self._base_seed)
        record = self._job.sample(self._sample_idx)
        record["printer_id"] = self.printer_id
        self._sample_idx += 1
        return record


def iter_samples(printers: int, base_seed: int):
    """Round-robin sample stream across printers (also used by capture_fixture)."""
    sims = [PrinterSim(i, base_seed) for i in range(printers)]
    while True:
        for sim in sims:
            yield sim.next_sample()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["local", "cloud"], default="local")
    parser.add_argument("--printers", type=int, default=4)
    parser.add_argument("--rate", type=int, default=250, help="msgs/sec per printer")
    parser.add_argument("--duration", type=float, default=0.0, help="seconds; 0 = run until ^C")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.mode == "local":
        os.environ.setdefault("CONFLUENT_BOOTSTRAP_SERVERS", "localhost:9092")
        os.environ.setdefault("CONFLUENT_SR_URL", "http://localhost:8081")

    from confluent_kafka import Producer
    from confluent_kafka.serialization import MessageField, SerializationContext

    from app.events.protobuf_codec import build_confluent_conf, build_protobuf_serializer

    message_class = telemetry_message_class()
    serializer = build_protobuf_serializer(message_class)
    ser_ctx = SerializationContext(StargateTopics.TELEMETRY, MessageField.VALUE)
    producer = Producer({**build_confluent_conf(), "linger.ms": 20, "batch.num.messages": 5000})

    stream = iter_samples(args.printers, args.seed)
    total_rate = args.printers * args.rate
    tick_s = 0.05
    per_tick = max(1, int(total_rate * tick_s))

    print(f"mode={args.mode} printers={args.printers} rate={args.rate}/printer "
          f"(~{total_rate}/s total) topic={StargateTopics.TELEMETRY}")

    sent = 0
    window_sent = 0
    started = time.time()
    last_report = started
    try:
        while True:
            tick_start = time.time()
            for _ in range(per_tick):
                record = stream.__next__()
                msg = message_class(ts_us=int(time.time() * 1_000_000), **record)
                producer.produce(
                    StargateTopics.TELEMETRY,
                    key=record["printer_id"].encode("utf-8"),
                    value=serializer(msg, ser_ctx),
                )
            producer.poll(0)
            sent += per_tick
            window_sent += per_tick

            now = time.time()
            if now - last_report >= 5.0:
                print(f"sent={sent} rate={window_sent / (now - last_report):.0f}/s")
                window_sent = 0
                last_report = now
            if args.duration and now - started >= args.duration:
                break
            sleep_for = tick_s - (time.time() - tick_start)
            if sleep_for > 0:
                time.sleep(sleep_for)
    except KeyboardInterrupt:
        pass
    finally:
        producer.flush(10)
        print(f"done: {sent} messages in {time.time() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
