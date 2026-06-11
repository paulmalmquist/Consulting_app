import json
import re
import sqlite3
from pathlib import Path

import pyarrow.parquet as pq

from rs_factory_seed import cli


def test_emit_includes_parquet_jsonl_sql_and_guided_queries(tmp_path):
    ctx, ds = cli.build_dataset("small")
    db = cli._emit(ds, ctx, tmp_path)

    parquet_path = tmp_path / "parquet" / "gold_vehicle_launch_readiness.parquet"
    assert parquet_path.exists()
    assert pq.read_table(parquet_path).num_rows == len(ds.get("gold_vehicle_launch_readiness").rows)

    jsonl_path = tmp_path / "jsonl" / "raw_docs_chunks.jsonl"
    first = json.loads(jsonl_path.read_text(encoding="utf-8").splitlines()[0])
    assert first["chunk_id"] == "CHUNK-000001"
    assert (tmp_path / "sql" / "create_tables.sql").exists()
    assert (tmp_path / "sql" / "create_views.sql").exists()
    assert (tmp_path / "sql" / "sample_queries.sql").exists()

    conn = sqlite3.connect(db)
    try:
        q01 = conn.execute(
            "SELECT scenario_open_ncr_count, unresolved_anomaly_count, "
            "missing_inspection_signoff_count FROM gold_vehicle_launch_readiness "
            "WHERE vehicle_id='VEH-TR-003'"
        ).fetchone()
        assert q01 == (4, 1, 2)
        q08 = conn.execute(
            "SELECT nearest_match_run FROM gold_test_anomaly_review "
            "WHERE run_id='TEST-HOTFIRE-2026-00088'"
        ).fetchone()
        assert q08 == ("TEST-HOTFIRE-2026-00041",)
        q12 = conn.execute(
            "SELECT revision, first_pass_yield, completed_operations "
            "FROM v_revision_first_pass_yield ORDER BY revision"
        ).fetchall()
        assert q12 == [("B", 0.78, 60), ("C", 0.91, 64)]
        assert conn.execute("SELECT COUNT(*) FROM v_rejected_ai_recommendations").fetchone()[0] > 0
        assert conn.execute("SELECT COUNT(*) FROM gold_daily_factory_report").fetchone() == (1,)
    finally:
        conn.close()


def test_every_tagged_row_has_exactly_one_lineage_finding():
    _ctx, ds = cli.build_dataset("small")
    tagged = []
    for table in ds.ordered():
        if table.name == "data_quality_findings":
            continue
        for row in table.rows:
            if row.get("dq_defect_tag"):
                key = "|".join(str(row.get(column)) for column in table.key)
                tagged.append((table.name, key, row["dq_defect_tag"]))
    findings = [
        (row["source_table"], row["entity_id"], row["dq_defect_tag"])
        for row in ds.get("data_quality_findings").rows
        if row["rule"] == "injected_defect"
    ]
    assert sorted(findings) == sorted(tagged)


def test_all_twelve_guided_queries_execute_and_return_answers(tmp_path):
    ctx, ds = cli.build_dataset("small")
    db = cli._emit(ds, ctx, tmp_path)
    sql = (tmp_path / "sql" / "sample_queries.sql").read_text(encoding="utf-8")
    parts = re.split(r"(?m)^-- (Q\d{2}) ", sql)
    queries = {}
    for i in range(1, len(parts), 2):
        block = parts[i + 1]
        queries[parts[i]] = block[block.find("\n") + 1:].strip()
    assert sorted(queries) == [f"Q{i:02d}" for i in range(1, 13)]

    conn = sqlite3.connect(db)
    try:
        answers = {name: conn.execute(statement).fetchall()
                   for name, statement in queries.items()}
    finally:
        conn.close()
    assert all(answers.values())
    assert answers["Q01"][0][:4] == ("VEH-TR-003", 4, 1, 2)
    assert answers["Q04"][0][0] == "AeroMetals"
    assert answers["Q07"][0][0] == "WLD-07"
    assert answers["Q08"][0][1] == "TEST-HOTFIRE-2026-00041"
    assert {row[0] for row in answers["Q09"]} == {"pass", "fail"}
    assert answers["Q10"][0][-2] == "SCN-008-DAILY-FACTORY-HANDOFF"
    assert [(r[0], r[3]) for r in answers["Q12"]] == [("B", 0.78), ("C", 0.91)]
