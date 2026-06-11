#!/usr/bin/env python3
"""DLQ demo: publish deliberately corrupted payloads to the telemetry topic.

The bridge's deserializer rejects each one, surfaces it in the DLQ buffer with
a reason, and best-effort routes the raw bytes to stargate.printer.dlq.v1 —
the "break it on purpose" beat: bad data is visible and routed, never dropped
and never fatal.

    python bad_producer.py --mode local            # Redpanda
    python bad_producer.py --mode cloud --count 5  # Confluent Cloud
"""

from __future__ import annotations

import argparse
import json
import os
import time

import common  # noqa: F401  (sys.path bootstrap)
from common import StargateTopics

CORRUPT_PAYLOADS = [
    # raw JSON where Protobuf + SR framing is expected
    json.dumps({"printer_id": "stargate-v4-66", "melt_pool_temp_c": "not-a-number"}).encode(),
    # valid magic byte, garbage after it
    b"\x00\x00\x00\x00\x07\xff\xfe\xfd\xfc\xfb",
    # truncated mid-message
    b"\x00\x00\x00",
    # plain text, the classic "sensor firmware printed a log line into the data plane"
    b"ERROR: sensor SG-TEMP-04 watchdog reset 0xDEADBEEF",
    # empty value
    b"",
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["local", "cloud"], default="local")
    parser.add_argument("--count", type=int, default=len(CORRUPT_PAYLOADS))
    args = parser.parse_args()

    if args.mode == "local":
        os.environ.setdefault("CONFLUENT_BOOTSTRAP_SERVERS", "localhost:9092")

    from confluent_kafka import Producer

    from app.events.protobuf_codec import build_confluent_conf

    producer = Producer(build_confluent_conf())
    sent = 0
    for i in range(args.count):
        payload = CORRUPT_PAYLOADS[i % len(CORRUPT_PAYLOADS)]
        producer.produce(StargateTopics.TELEMETRY, key=b"bad-producer", value=payload)
        sent += 1
        time.sleep(0.3)  # spaced out so the DLQ panel visibly counts up
    producer.flush(10)
    print(f"sent {sent} corrupted payloads to {StargateTopics.TELEMETRY} ({args.mode})")
    print("watch /stargate/dlq and the dashboard DLQ panel count up")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
