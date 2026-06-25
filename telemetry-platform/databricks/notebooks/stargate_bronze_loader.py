"""Stargate -> Bronze Delta loader (lineage Ticket A) — scaffold + dry-run.

Lands the raw Stargate printer Kafka stream into novendor_1.telemetry.bronze_stargate_printer as a
BOUNDED Spark batch read (never structured streaming, never an unbounded read). All decision logic
lives in the pure stargate_bronze_core; this file is the thin Spark/Kafka shell plus a credential-free
dry-run path so the plan and receipt can be validated locally with no cluster and no secrets.

Safety contract (enforced here + in the core):
  - Default mode is --dry-run. Writing requires --execute AND a non-empty bounded plan.
  - Every read is a bounded [start, end) offset range from the planner. There is no unbounded path.
  - A cold partition (no checkpoint) reads only the tail (cold_start_tail), never the whole backlog.
  - No long-running cluster: this is a batch job that runs the bounded read and exits.
  - No pointer stamping here — that is Ticket B.
  - No secrets in the repo. Broker config comes from env vars (see ENV below).

ENV (only needed for --execute against real Kafka; never committed):
  CONFLUENT_BOOTSTRAP_SERVERS   host:port of the Confluent cluster
  CONFLUENT_API_KEY             SASL username (API key)
  CONFLUENT_API_SECRET          SASL password (API secret)

Local dry-run (no Kafka, no Spark, no creds) — the evidence path:
  python telemetry-platform/databricks/notebooks/stargate_bronze_loader.py \
      --dry-run --fixture telemetry-platform/databricks/notebooks/fixtures/stargate_bronze_dryrun.example.json

Real Databricks run (human-gated; see the bottom of this file for exact commands).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the pure core importable both locally (repo root) and on Databricks (Repos checkout).
_TEL_ROOT = Path(__file__).resolve().parents[2]  # telemetry-platform/
if str(_TEL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TEL_ROOT))

from stargate_bronze_core import (  # noqa: E402
    BRONZE_TABLE,
    GuardRails,
    bronze_ddl,
    bronze_select_exprs,
    build_receipt,
    kafka_offsets_json,
    parse_offset_map,
    plan_offsets,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_id(now_iso: str) -> str:
    # Safe charset only (validated again in the core before it reaches a SQL literal).
    return "stargate-bronze-" + now_iso.replace(":", "").replace("+", "").replace(".", "")


def _rails_from_args(args: argparse.Namespace) -> GuardRails:
    rails = GuardRails(
        max_records_per_run=args.max_records,
        max_offsets_per_partition=args.max_offsets_per_partition,
        max_partitions_per_run=args.max_partitions,
        max_runtime_seconds=args.max_runtime_seconds,
        cold_start_tail=args.cold_start_tail,
    )
    rails.validate()
    return rails


# ── dry-run from a fixture (no Kafka, no Spark, no creds) ────────────────────────────────

def plan_from_fixture(fixture_path: str, rails: GuardRails):
    raw = json.loads(Path(fixture_path).read_text(encoding="utf-8"))
    end_offsets = parse_offset_map(raw.get("end_offsets", {}))
    checkpoint = parse_offset_map(raw.get("checkpoint", {}))
    return plan_offsets(end_offsets, checkpoint, rails)


# ── real Kafka / Spark shell (only used under --execute on a cluster) ────────────────────

def _kafka_conf() -> dict:
    import os
    servers = os.environ.get("CONFLUENT_BOOTSTRAP_SERVERS")
    key = os.environ.get("CONFLUENT_API_KEY")
    secret = os.environ.get("CONFLUENT_API_SECRET")
    missing = [n for n, v in (
        ("CONFLUENT_BOOTSTRAP_SERVERS", servers),
        ("CONFLUENT_API_KEY", key),
        ("CONFLUENT_API_SECRET", secret),
    ) if not v]
    if missing:
        raise RuntimeError(f"missing Kafka env vars: {', '.join(missing)} (never commit these)")
    return {"servers": servers, "key": key, "secret": secret}


def get_kafka_end_offsets(topics, conf) -> dict[tuple[str, int], int]:
    """Latest (high-water) offset per (topic, partition) via a short-lived confluent_kafka consumer."""
    from confluent_kafka import Consumer, TopicPartition  # lazy import

    c = Consumer({
        "bootstrap.servers": conf["servers"],
        "security.protocol": "SASL_SSL",
        "sasl.mechanisms": "PLAIN",
        "sasl.username": conf["key"],
        "sasl.password": conf["secret"],
        "group.id": "stargate-bronze-watermark-probe",
        "enable.auto.commit": False,
    })
    out: dict[tuple[str, int], int] = {}
    try:
        md = c.list_topics(timeout=15)
        for topic in topics:
            tmd = md.topics.get(topic)
            if tmd is None or tmd.error is not None:
                continue
            for pid in tmd.partitions:
                _lo, hi = c.get_watermark_offsets(TopicPartition(topic, pid), timeout=15)
                out[(topic, pid)] = int(hi)
    finally:
        c.close()
    return out


def get_checkpoint_from_delta(spark, table: str) -> dict[tuple[str, int], int]:
    """Next offset to read per partition = max(kafka_offset)+1 already in the bronze table."""
    try:
        rows = spark.sql(
            f"SELECT kafka_topic, kafka_partition, MAX(kafka_offset) AS mx "
            f"FROM {table} GROUP BY kafka_topic, kafka_partition"
        ).collect()
    except Exception:
        return {}  # table not created yet -> everything is cold
    return {(r["kafka_topic"], int(r["kafka_partition"])): int(r["mx"]) + 1 for r in rows}


def execute_plan(spark, plan, run_id: str, conf) -> int:
    """Read the bounded plan from Kafka and append to the bronze Delta table. Returns rows written."""
    if plan.is_empty():
        return 0
    assign = {}
    for r in plan.ranges:
        assign.setdefault(r.topic, []).append(r.partition)
    jaas = (
        "org.apache.kafka.common.security.plain.PlainLoginModule required "
        f"username='{conf['key']}' password='{conf['secret']}';"
    )
    df = (
        spark.read.format("kafka")
        .option("kafka.bootstrap.servers", conf["servers"])
        .option("kafka.security.protocol", "SASL_SSL")
        .option("kafka.sasl.mechanism", "PLAIN")
        .option("kafka.sasl.jaas.config", jaas)
        .option("assign", json.dumps({t: sorted(ps) for t, ps in assign.items()}))
        .option("startingOffsets", kafka_offsets_json(plan, "start"))
        .option("endingOffsets", kafka_offsets_json(plan, "end"))
        .load()
        .selectExpr(*bronze_select_exprs(run_id))
    )
    df.write.format("delta").mode("append").partitionBy("ingest_date").saveAsTable(BRONZE_TABLE)
    return plan.total_records


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Stargate -> Bronze Delta loader (bounded batch).")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", default=True,
                      help="plan + receipt only, no writes (default)")
    mode.add_argument("--execute", action="store_true",
                      help="actually read Kafka and append to Delta (requires creds + non-empty plan)")
    ap.add_argument("--fixture", help="JSON file with end_offsets/checkpoint for a credential-free dry-run")
    ap.add_argument("--table", default=BRONZE_TABLE)
    ap.add_argument("--max-records", type=int, default=GuardRails.max_records_per_run)
    ap.add_argument("--max-offsets-per-partition", type=int, default=GuardRails.max_offsets_per_partition)
    ap.add_argument("--max-partitions", type=int, default=GuardRails.max_partitions_per_run)
    ap.add_argument("--max-runtime-seconds", type=int, default=GuardRails.max_runtime_seconds)
    ap.add_argument("--cold-start-tail", type=int, default=GuardRails.cold_start_tail)
    args = ap.parse_args(argv)

    dry_run = not args.execute
    rails = _rails_from_args(args)
    started = _now_iso()
    run_id = _run_id(started)

    if args.fixture:
        if args.execute:
            print("refusing to --execute from a fixture; fixtures are dry-run only", file=sys.stderr)
            return 2
        plan = plan_from_fixture(args.fixture, rails)
        receipt = build_receipt(
            plan=plan, dry_run=True, run_id=run_id, started_at=started, finished_at=_now_iso(),
            rows_written=0, guardrails=rails, table=args.table, credential_source="fixture",
        )
        print(json.dumps(receipt, indent=2, default=str))
        return 0

    # Real path (Kafka + Spark). Requires a Databricks/Spark runtime and Kafka creds.
    from stargate_bronze_core import STARGATE_TOPICS  # local import keeps top-level import light

    try:
        from pyspark.sql import SparkSession
        spark = SparkSession.builder.getOrCreate()
    except Exception as exc:  # pragma: no cover - only on a non-Spark host
        print(f"no SparkSession available ({exc}); run this on Databricks, or use --fixture locally",
              file=sys.stderr)
        return 3

    conf = _kafka_conf()
    spark.sql(bronze_ddl(args.table))  # idempotent create
    end_offsets = get_kafka_end_offsets(STARGATE_TOPICS, conf)
    checkpoint = get_checkpoint_from_delta(spark, args.table)
    plan = plan_offsets(end_offsets, checkpoint, rails)

    rows_written = 0
    if dry_run:
        cred_src = "env:CONFLUENT_*"
    else:
        rows_written = execute_plan(spark, plan, run_id, conf)
        cred_src = "env:CONFLUENT_*"

    receipt = build_receipt(
        plan=plan, dry_run=dry_run, run_id=run_id, started_at=started, finished_at=_now_iso(),
        rows_written=rows_written, guardrails=rails, table=args.table, credential_source=cred_src,
    )
    print(json.dumps(receipt, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# ── Exact commands for a real Databricks run (human-gated; do NOT run unattended) ─────────
#
# 1) One-time table create (cheap, no cluster read):
#      from stargate_bronze_core import bronze_ddl
#      spark.sql(bronze_ddl())          # inside a Databricks notebook
#
# 2) Dry-run against real Kafka (reports the bounded plan + receipt, writes nothing):
#      # cluster env (Databricks secrets -> env, never committed):
#      #   CONFLUENT_BOOTSTRAP_SERVERS, CONFLUENT_API_KEY, CONFLUENT_API_SECRET
#      python stargate_bronze_loader.py --dry-run \
#          --max-records 50000 --max-offsets-per-partition 10000 --cold-start-tail 5000
#
# 3) Execute the SAME bounded plan (appends only the planned ranges, then exits):
#      python stargate_bronze_loader.py --execute \
#          --max-records 50000 --max-offsets-per-partition 10000 --cold-start-tail 5000
#
#    Submit as a one-shot Databricks job (job cluster tears down after the run; no long-running stream):
#      databricks jobs submit --json '{"run_name":"stargate-bronze-once",
#        "tasks":[{"task_key":"load","notebook_task":{"notebook_path":
#        "/Repos/<you>/Consulting_app/telemetry-platform/databricks/notebooks/stargate_bronze_loader"}}]}'
#
# Ticket B (separate PR) reads this table's DESCRIBE HISTORY version and stamps the
# tel_stream_kafka_rows / tel_stream_triage_events pointer columns. This loader never touches Postgres.
