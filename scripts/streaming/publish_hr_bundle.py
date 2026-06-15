#!/usr/bin/env python3
"""Phase 5B: publish a REAL History Rhymes manual bundle to the HR topic.

Reads the same JSON bundle shape that scripts/hr_weekly_brief.py consumes
(a flat ``signals`` map plus per_signal_freshness + source), maps every
canonical signal to a per-signal hr.signal.observed EventEnvelope via
app.events.hr_signal_publisher.real_bundle_to_envelopes, and publishes to
history-rhymes.signals.v1. The existing GKE sink drains them into BigQuery.

This is the real-bundle path (not the Phase 5A synthetic fixture). It does NOT
read or write Postgres — it only emits events.

Replay: --replay republishes a historical/manual bundle. Replay is SAFE because
the idempotency_key is hr.signal.observed:{as_of_date}:{signal_name} — a stable,
content-addressed key — so duplicates are collapsible at READ time with
QUALIFY ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY ingested_at)=1.
NOTE: BigQuery's streaming-insert insertId dedup only covers a short window
(~1 min, same partition); a historical replay lands AFTER that window, so it
WILL write duplicate raw rows. That is expected and harmless — the dedup view
is the canonical read. --max-signals bounds how many signals a replay emits.

Env (same broker config as the rest of the backbone):
  EVENTS_BROKER_URL, EVENTS_SECURITY_PROTOCOL, EVENTS_SASL_MECHANISM,
  EVENTS_SASL_USERNAME, EVENTS_SASL_PASSWORD

Usage:
  # From a real bundle file:
  python scripts/streaming/publish_hr_bundle.py --input bundle.json --as-of 2026-06-14
  cat bundle.json | python scripts/streaming/publish_hr_bundle.py --input - --as-of 2026-06-14

  # Synthetic 8-signal bundle (mirrors hr_weekly_brief.py --seed signals):
  python scripts/streaming/publish_hr_bundle.py --seed --as-of 2026-06-14

  # Bounded replay (republish, capped):
  python scripts/streaming/publish_hr_bundle.py --seed --as-of 2026-06-14 --replay --max-signals 3
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.events import config as events_config  # noqa: E402
from app.events.hr_signal_publisher import (  # noqa: E402
    HR_SIGNAL_NAMES,
    real_bundle_to_envelopes,
)
from app.events.topics import Topics  # noqa: E402


def _seed_signals() -> dict:
    """The real-shape signals map from hr_weekly_brief.py --seed: all 8 signals."""
    return {
        "signals": {
            "mvrv_z": 1.4,
            "yc_10y2y": -0.10,
            "vix_term": 0.95,
            "housing": {"price_yoy": -2.1, "starts_yoy": -15.0},
            "cmbs_delinq": 0.062,
            "fed_tone": "hawkish-hold",
            "crypto_flow": -0.8,
            "macro_surprise": -0.45,
            "per_signal_freshness": {
                "mvrv_z": "fresh", "yc_10y2y": "fresh", "vix_term": "fresh",
                "housing": "1d", "cmbs_delinq": "7d", "fed_tone": "fresh",
                "crypto_flow": "fresh", "macro_surprise": "1d",
            },
            "source": "seed",
        }
    }


def _load_bundle(args) -> dict:
    if "--seed" in args:
        return _seed_signals()
    if "--input" in args:
        path = args[args.index("--input") + 1]
        raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
        return json.loads(raw)
    # Default to seed so the script is runnable with no args for a smoke.
    return _seed_signals()


def main() -> int:
    args = sys.argv[1:]
    as_of = "2026-06-14"
    if "--as-of" in args:
        as_of = args[args.index("--as-of") + 1]
    replay = "--replay" in args
    max_signals: int | None = None
    if "--max-signals" in args:
        max_signals = int(args[args.index("--max-signals") + 1])

    bundle = _load_bundle(args)
    envelopes = real_bundle_to_envelopes(bundle, as_of_date=as_of)

    if max_signals is not None:
        envelopes = envelopes[:max_signals]

    mode = "REPLAY" if replay else "publish"
    print(f"History Rhymes real bundle — Phase 5B {mode}")
    print("-" * 60)
    print(f"topic        = {Topics.HISTORY_RHYMES_SIGNALS}")
    print(f"as_of        = {as_of}")
    print(f"signals      = {len(envelopes)} of {len(HR_SIGNAL_NAMES)} canonical"
          + (f" (bounded to {max_signals})" if max_signals is not None else ""))
    print(f"broker       = {events_config.EVENTS_BROKER_URL or '(unset)'}")
    print("-" * 60)

    if not events_config.EVENTS_BROKER_URL:
        print("No broker configured — printing envelopes only (no publish).")
        for env in envelopes:
            print(f"  {env.payload['signal_name']}: value={env.payload['signal_value']} "
                  f"staleness={env.payload['staleness_status']} key={env.idempotency_key}")
        return 0

    try:
        from confluent_kafka import Producer  # noqa: PLC0415
    except ImportError:
        print("confluent-kafka not installed.", file=sys.stderr)
        return 1

    conf = {"bootstrap.servers": events_config.EVENTS_BROKER_URL}
    conf.update(events_config.producer_security_config())
    producer = Producer(conf)

    results: list[dict] = []

    def _cb(err, msg):
        results.append({
            "err": str(err) if err else None,
            "partition": msg.partition() if msg else None,
            "offset": msg.offset() if msg else None,
        })

    for env in envelopes:
        producer.produce(
            Topics.HISTORY_RHYMES_SIGNALS,
            key=env.idempotency_key,
            value=env.to_wire(),
            callback=_cb,
        )
    producer.flush(30)

    ok = 0
    for env, res in zip(envelopes, results):
        name = env.payload["signal_name"]
        if res["err"] is None:
            ok += 1
            print(f"  delivered {name}: partition={res['partition']} offset={res['offset']}")
        else:
            print(f"  FAILED {name}: {res['err']}", file=sys.stderr)

    print("-" * 60)
    print(f"{mode}: delivered {ok}/{len(envelopes)} HR signal events")
    print("run_id =", envelopes[0].run_id if envelopes else "(none)")
    return 0 if ok == len(envelopes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
