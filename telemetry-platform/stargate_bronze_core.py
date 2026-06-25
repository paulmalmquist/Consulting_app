"""Pure core for the Stargate -> Bronze Delta landing (lineage Ticket A).

No pyspark, no kafka, no databricks imports. Holds the table contract, the bounded
offset planner, the cost guardrails, the Kafka->bronze column mapping, and the run
receipt builder, so every decision is unit-testable without a cluster or credentials.
The Spark/Kafka I/O lives in databricks/notebooks/stargate_bronze_loader.py and calls
into here.

Honesty boundary: this module only PLANS and DESCRIBES. It never reads Kafka, never
writes Delta, and never stamps Postgres pointers (that is Ticket B). Every run is
bounded; there is no code path that reads an unbounded offset range.

Run the tests:  python -m pytest telemetry-platform/test_stargate_bronze_core.py -q
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass

# Fully-qualified bronze target (matches databricks/_bootstrap.py TEL = novendor_1.telemetry).
CATALOG = "novendor_1"
SCHEMA = "telemetry"
BRONZE_TABLE = f"{CATALOG}.{SCHEMA}.bronze_stargate_printer"

# Raw Stargate printer topics — mirror backend StargateTopics (stargate_bridge.py). The bronze lake
# lands the raw stream as-is; Ticket B stamping joins back on the Kafka coordinate JOIN_KEY.
STARGATE_TOPICS: tuple[str, ...] = (
    "stargate.printer.telemetry.v1",
    "stargate.printer.telemetry.agg5s.v1",
    "stargate.printer.anomalies.v1",
    "stargate.printer.dlq.v1",
    "stargate.printer.anomaly.triage.v1",
)

# Bronze column contract. Carries the Kafka coordinate (the Ticket B join key), the raw value
# as-landed (no decode), and ingest bookkeeping. Partitioned by ingest_date.
BRONZE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("kafka_topic", "STRING"),
    ("kafka_partition", "INT"),
    ("kafka_offset", "BIGINT"),
    ("kafka_timestamp", "TIMESTAMP"),
    ("kafka_key", "STRING"),
    ("raw_value", "STRING"),          # raw Kafka message value, as-landed; no schema decode here
    ("raw_value_bytes", "BIGINT"),    # byte length of the raw value, for sanity / cost checks
    ("ingest_date", "DATE"),          # partition column
    ("ingested_at", "TIMESTAMP"),
    ("run_id", "STRING"),
)
PARTITION_COLUMN = "ingest_date"
JOIN_KEY: tuple[str, str, str] = ("kafka_topic", "kafka_partition", "kafka_offset")

_RUN_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")


def bronze_ddl(table: str = BRONZE_TABLE) -> str:
    """CREATE TABLE IF NOT EXISTS DDL for the bronze Delta table. Idempotent and additive."""
    cols = ",\n    ".join(f"{name} {typ}" for name, typ in BRONZE_COLUMNS)
    comment = (
        "Raw Stargate printer Kafka stream, as-landed. Bronze lake for telemetry lineage. "
        "Join key (kafka_topic, kafka_partition, kafka_offset) maps to tel_stream_kafka_rows. "
        "Owning module: Telemetry Platform."
    )
    return (
        f"CREATE TABLE IF NOT EXISTS {table} (\n    {cols}\n)\n"
        f"USING DELTA\n"
        f"PARTITIONED BY ({PARTITION_COLUMN})\n"
        f"COMMENT '{comment}'"
    )


@dataclass(frozen=True)
class GuardRails:
    """Hard cost/safety bounds. Nothing is ever unbounded; the runner also enforces max_runtime."""
    max_records_per_run: int = 50_000
    max_offsets_per_partition: int = 10_000
    max_partitions_per_run: int = 64
    max_runtime_seconds: int = 600       # enforced by the runner; recorded here for the receipt
    cold_start_tail: int = 5_000         # first run (no checkpoint) reads only the last N per partition

    def validate(self) -> None:
        for name in (
            "max_records_per_run", "max_offsets_per_partition",
            "max_partitions_per_run", "max_runtime_seconds", "cold_start_tail",
        ):
            v = getattr(self, name)
            if not isinstance(v, int) or v <= 0:
                raise ValueError(f"GuardRails.{name} must be a positive int, got {v!r}")


@dataclass(frozen=True)
class OffsetRange:
    topic: str
    partition: int
    start_offset: int   # inclusive
    end_offset: int     # exclusive (Spark batch endingOffsets are exclusive)

    @property
    def count(self) -> int:
        return self.end_offset - self.start_offset


@dataclass
class OffsetPlan:
    ranges: list[OffsetRange]
    total_records: int
    caught_up: bool
    clamped_reasons: list[str]

    def is_empty(self) -> bool:
        return self.total_records == 0


def plan_offsets(
    end_offsets: dict[tuple[str, int], int],
    checkpoint: dict[tuple[str, int], int],
    rails: GuardRails,
) -> OffsetPlan:
    """Compute a BOUNDED set of offset ranges to read this run.

    end_offsets: {(topic, partition): latest_offset} — the high-water mark (exclusive).
    checkpoint:  {(topic, partition): next_offset_to_read} (inclusive). A partition absent from the
                 checkpoint is COLD: it starts at max(end - cold_start_tail, 0), so even a first run
                 over a huge backlog reads only the tail.

    Ranges are emitted in deterministic (topic, partition) order, each clamped to
    max_offsets_per_partition, the set clamped to max_partitions_per_run and the global
    max_records_per_run budget. caught_up is True only when nothing is left to read.
    """
    rails.validate()
    reasons: list[str] = []
    keys = sorted(end_offsets.keys())

    if len(keys) > rails.max_partitions_per_run:
        reasons.append(f"partitions capped at {rails.max_partitions_per_run} of {len(keys)}")
        keys = keys[: rails.max_partitions_per_run]

    ranges: list[OffsetRange] = []
    total = 0
    any_pending = False
    budget = rails.max_records_per_run

    for key in keys:
        topic, partition = key
        end = end_offsets[key]
        if key in checkpoint:
            start = checkpoint[key]
        else:
            start = max(end - rails.cold_start_tail, 0)
            if start > 0:
                reasons.append(f"{topic}[{partition}] cold start: tail {rails.cold_start_tail}")
        if start >= end:
            continue  # caught up on this partition
        any_pending = True

        read_end = min(end, start + rails.max_offsets_per_partition)
        if read_end < end:
            reasons.append(
                f"{topic}[{partition}] per-partition cap {rails.max_offsets_per_partition}"
            )

        if budget <= 0:
            reasons.append("record budget exhausted; remaining partitions deferred to next run")
            break

        span = read_end - start
        if span > budget:
            read_end = start + budget
            span = budget
            reasons.append(f"{topic}[{partition}] truncated to global record budget")

        ranges.append(OffsetRange(topic, partition, start, read_end))
        total += span
        budget -= span

    caught_up = total == 0 and not any_pending
    return OffsetPlan(ranges=ranges, total_records=total, caught_up=caught_up, clamped_reasons=reasons)


def kafka_offsets_json(plan: OffsetPlan, which: str) -> str:
    """Build the Spark Kafka startingOffsets/endingOffsets JSON from a plan.

    which='start' uses each range's start_offset; which='end' uses end_offset (exclusive). Topics
    with no planned range are omitted (the loader assigns only the planned partitions).
    """
    if which not in ("start", "end"):
        raise ValueError(f"which must be 'start' or 'end', got {which!r}")
    by_topic: dict[str, dict[str, int]] = {}
    for r in plan.ranges:
        off = r.start_offset if which == "start" else r.end_offset
        by_topic.setdefault(r.topic, {})[str(r.partition)] = off
    return json.dumps(by_topic, sort_keys=True)


def bronze_select_exprs(run_id: str) -> list[str]:
    """Spark selectExpr() list mapping a kafka-source DataFrame (topic, partition, offset, timestamp,
    key, value) to the BRONZE_COLUMNS contract. Kept here so the mapping is test-covered and lives in
    one place. run_id is validated to a safe charset to keep it injection-free in the literal."""
    if not _RUN_ID_RE.match(run_id):
        raise ValueError(f"unsafe run_id {run_id!r}; allowed charset [A-Za-z0-9_.:-]")
    return [
        "topic AS kafka_topic",
        "partition AS kafka_partition",
        "offset AS kafka_offset",
        "timestamp AS kafka_timestamp",
        "CAST(key AS STRING) AS kafka_key",
        "CAST(value AS STRING) AS raw_value",
        "length(value) AS raw_value_bytes",
        "to_date(timestamp) AS ingest_date",
        "current_timestamp() AS ingested_at",
        f"'{run_id}' AS run_id",
    ]


def build_receipt(
    *,
    plan: OffsetPlan,
    dry_run: bool,
    run_id: str,
    started_at: str,
    finished_at: str,
    rows_written: int,
    guardrails: GuardRails,
    table: str = BRONZE_TABLE,
    credential_source: str = "n/a",
) -> dict:
    """Build the run receipt. For a dry run, rows_written is 0 and the receipt reports what WOULD be
    appended (planned_records + ranges). This is the visible evidence each run emits."""
    return {
        "run_id": run_id,
        "mode": "dry_run" if dry_run else "execute",
        "table": table,
        "started_at": started_at,
        "finished_at": finished_at,
        "caught_up": plan.caught_up,
        "planned_records": plan.total_records,
        "rows_written": rows_written,
        "ranges": [
            {
                "topic": r.topic,
                "partition": r.partition,
                "start_offset": r.start_offset,
                "end_offset": r.end_offset,
                "count": r.count,
            }
            for r in plan.ranges
        ],
        "clamped_reasons": plan.clamped_reasons,
        "guardrails": asdict(guardrails),
        "credential_source": credential_source,
    }


def parse_offset_map(raw: dict) -> dict[tuple[str, int], int]:
    """Parse a {topic: {partition_str: offset}} JSON-style dict into {(topic, int_partition): offset}.

    Used by the loader's --fixture dry-run path and to normalize Kafka watermark output. Validates
    that offsets are non-negative ints."""
    out: dict[tuple[str, int], int] = {}
    for topic, parts in (raw or {}).items():
        for p_str, off in (parts or {}).items():
            p = int(p_str)
            off = int(off)
            if p < 0 or off < 0:
                raise ValueError(f"negative partition/offset for {topic}: {p_str}={off}")
            out[(topic, p)] = off
    return out
