"""Unit tests for the Stargate bronze landing core — pure Python, no Databricks/Kafka/Spark.

Run: python -m pytest telemetry-platform/test_stargate_bronze_core.py -q
"""
import json

import pytest

from stargate_bronze_core import (
    BRONZE_COLUMNS,
    BRONZE_TABLE,
    GuardRails,
    OffsetPlan,
    bronze_ddl,
    bronze_select_exprs,
    build_receipt,
    kafka_offsets_json,
    parse_offset_map,
    plan_offsets,
)

T = "stargate.printer.anomalies.v1"


# ── DDL / contract ──────────────────────────────────────────────────────────────────────

def test_bronze_ddl_has_table_partition_and_every_column():
    ddl = bronze_ddl()
    assert BRONZE_TABLE in ddl
    assert "USING DELTA" in ddl
    assert "PARTITIONED BY (ingest_date)" in ddl
    for name, _typ in BRONZE_COLUMNS:
        assert name in ddl, f"DDL missing column {name}"
    # The Kafka coordinate join key must be present for Ticket B.
    for col in ("kafka_topic", "kafka_partition", "kafka_offset"):
        assert col in ddl


def test_bronze_ddl_is_idempotent_form():
    assert bronze_ddl().startswith("CREATE TABLE IF NOT EXISTS")


# ── guardrails ──────────────────────────────────────────────────────────────────────────

def test_guardrails_reject_non_positive():
    with pytest.raises(ValueError):
        GuardRails(max_records_per_run=0).validate()
    with pytest.raises(ValueError):
        GuardRails(cold_start_tail=-1).validate()


# ── offset planner ──────────────────────────────────────────────────────────────────────

def test_cold_start_reads_only_the_tail():
    rails = GuardRails(cold_start_tail=1_000, max_offsets_per_partition=10_000)
    plan = plan_offsets({(T, 0): 50_000}, {}, rails)
    assert len(plan.ranges) == 1
    r = plan.ranges[0]
    assert r.start_offset == 49_000  # 50_000 - 1_000
    assert r.end_offset == 50_000
    assert r.count == 1_000
    assert not plan.caught_up
    assert any("cold start" in reason for reason in plan.clamped_reasons)


def test_checkpoint_resumes_and_clamps_to_per_partition_cap():
    rails = GuardRails(max_offsets_per_partition=500, max_records_per_run=10_000)
    plan = plan_offsets({(T, 0): 10_000}, {(T, 0): 2_000}, rails)
    r = plan.ranges[0]
    assert r.start_offset == 2_000
    assert r.end_offset == 2_500  # clamped to +500
    assert r.count == 500
    assert any("per-partition cap" in reason for reason in plan.clamped_reasons)


def test_caught_up_when_checkpoint_equals_end():
    rails = GuardRails()
    plan = plan_offsets({(T, 0): 7_000}, {(T, 0): 7_000}, rails)
    assert plan.ranges == []
    assert plan.total_records == 0
    assert plan.caught_up is True
    assert plan.is_empty()


def test_idempotent_no_rereads_after_full_consume():
    # After a run reads [2000, 2500), the next checkpoint is 2500. With no new data, replan is empty.
    rails = GuardRails(max_offsets_per_partition=500)
    end = {(T, 0): 2_500}
    plan = plan_offsets(end, {(T, 0): 2_500}, rails)
    assert plan.caught_up and plan.total_records == 0


def test_global_record_budget_truncates_total():
    rails = GuardRails(max_records_per_run=1_500, max_offsets_per_partition=10_000)
    end = {(T, 0): 10_000, (T, 1): 10_000, (T, 2): 10_000}
    cp = {(T, 0): 0, (T, 1): 0, (T, 2): 0}
    plan = plan_offsets(end, cp, rails)
    assert plan.total_records == 1_500  # never exceeds the global budget
    assert sum(r.count for r in plan.ranges) == 1_500
    assert any("budget" in reason for reason in plan.clamped_reasons)


def test_max_partitions_per_run_caps_partition_count():
    rails = GuardRails(max_partitions_per_run=2, max_records_per_run=10_000,
                       max_offsets_per_partition=10_000)
    end = {(T, 0): 100, (T, 1): 100, (T, 2): 100}
    cp = {(T, 0): 0, (T, 1): 0, (T, 2): 0}
    plan = plan_offsets(end, cp, rails)
    assert len({(r.topic, r.partition) for r in plan.ranges}) == 2
    assert any("partitions capped" in reason for reason in plan.clamped_reasons)


def test_ranges_are_deterministically_ordered():
    rails = GuardRails(max_records_per_run=10_000, max_offsets_per_partition=10_000)
    end = {("b.topic", 1): 10, ("a.topic", 0): 10, ("a.topic", 1): 10}
    cp = {k: 0 for k in end}
    plan = plan_offsets(end, cp, rails)
    ordered = [(r.topic, r.partition) for r in plan.ranges]
    assert ordered == sorted(ordered)


# ── Spark offset JSON ───────────────────────────────────────────────────────────────────

def test_kafka_offsets_json_start_and_end():
    rails = GuardRails(max_offsets_per_partition=500, max_records_per_run=10_000)
    plan = plan_offsets({(T, 0): 10_000}, {(T, 0): 2_000}, rails)
    start = json.loads(kafka_offsets_json(plan, "start"))
    end = json.loads(kafka_offsets_json(plan, "end"))
    assert start == {T: {"0": 2_000}}
    assert end == {T: {"0": 2_500}}  # exclusive end matches Spark batch endingOffsets


def test_kafka_offsets_json_rejects_bad_which():
    plan = OffsetPlan(ranges=[], total_records=0, caught_up=True, clamped_reasons=[])
    with pytest.raises(ValueError):
        kafka_offsets_json(plan, "middle")


# ── select-expr mapping ─────────────────────────────────────────────────────────────────

def test_select_exprs_cover_every_bronze_column():
    exprs = bronze_select_exprs("run-2026-06-25-abc")
    aliased = " ".join(exprs)
    for name, _typ in BRONZE_COLUMNS:
        assert f"AS {name}" in aliased, f"select exprs do not produce {name}"


def test_select_exprs_use_base64_for_lossless_raw_value():
    # The Stargate stream is binary/Avro; raw_value must be base64(value), not a lossy CAST AS STRING.
    exprs = bronze_select_exprs("run-x")
    assert "base64(value) AS raw_value" in exprs
    assert "CAST(value AS STRING) AS raw_value" not in exprs


def test_select_exprs_reject_unsafe_run_id():
    with pytest.raises(ValueError):
        bronze_select_exprs("bad'; DROP TABLE x; --")


# ── receipt ─────────────────────────────────────────────────────────────────────────────

def test_dry_run_receipt_reports_planned_not_written():
    rails = GuardRails(max_offsets_per_partition=500)
    plan = plan_offsets({(T, 0): 10_000}, {(T, 0): 2_000}, rails)
    rec = build_receipt(
        plan=plan, dry_run=True, run_id="r1",
        started_at="2026-06-25T00:00:00Z", finished_at="2026-06-25T00:00:01Z",
        rows_written=0, guardrails=rails,
    )
    assert rec["mode"] == "dry_run"
    assert rec["rows_written"] == 0
    assert rec["planned_records"] == 500
    assert rec["ranges"][0] == {
        "topic": T, "partition": 0, "start_offset": 2_000, "end_offset": 2_500, "count": 500,
    }
    assert rec["table"] == BRONZE_TABLE


# ── fixture parsing ─────────────────────────────────────────────────────────────────────

def test_parse_offset_map_normalizes_partitions_to_int():
    parsed = parse_offset_map({T: {"0": 100, "1": 200}})
    assert parsed == {(T, 0): 100, (T, 1): 200}


def test_parse_offset_map_rejects_negative():
    with pytest.raises(ValueError):
        parse_offset_map({T: {"0": -1}})
