from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


def _json_dumps(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, default=str)


def _json_loads(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value


class RegressionStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _table_columns(self, table: str) -> set[str]:
        rows = self.conn.execute(f"pragma table_info({table})").fetchall()
        return {str(row["name"]) for row in rows}

    def _ensure_column(self, table: str, column: str, column_type: str) -> None:
        if column in self._table_columns(table):
            return
        self.conn.execute(f"alter table {table} add column {column} {column_type}")

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            create table if not exists scenario_runs (
              id integer primary key autoincrement,
              run_id text not null,
              cycle integer not null,
              scenario_id text not null,
              suite text not null,
              environment text,
              kind text not null,
              prompt text,
              raw_response text,
              turn_receipt_json text,
              trace_json text,
              frontend_result_json text,
              score real not null,
              passed integer not null,
              failure_category text,
              failure_reason text,
              duration_ms integer,
              first_token_ms integer,
              retrieval_count integer default 0,
              tool_count integer default 0,
              created_at text default current_timestamp
            );
            create table if not exists scenario_summaries (
              id integer primary key autoincrement,
              run_id text not null,
              cycle integer not null,
              suite text not null,
              scenario_count integer not null,
              passed_count integer not null,
              failed_count integer not null,
              median_latency_ms real,
              p95_latency_ms real,
              degraded_rate real,
              hallucination_rate real,
              contamination_rate real,
              created_at text default current_timestamp
            );
            create table if not exists regression_events (
              id integer primary key autoincrement,
              run_id text not null,
              cycle integer not null,
              scenario_id text not null,
              previous_score real,
              current_score real not null,
              regression_type text not null,
              details_json text,
              created_at text default current_timestamp
            );
            create table if not exists receipt_diffs (
              id integer primary key autoincrement,
              run_id text not null,
              cycle integer not null,
              scenario_id text not null,
              diff_json text not null,
              created_at text default current_timestamp
            );
            create table if not exists environment_scorecards (
              id integer primary key autoincrement,
              run_id text not null,
              cycle integer not null,
              suite text not null,
              environment text not null,
              scorecard_json text not null,
              created_at text default current_timestamp
            );
            """
        )

        scenario_run_columns = {
            "family": "text",
            "parent_scenario_id": "text",
            "mutation_family": "text",
            "mutation_label": "text",
            "golden": "integer default 0",
            "high_value": "integer default 0",
            "chaos_profile": "text",
            "chaos_seed": "integer",
            "chaos_injections_json": "text",
            "contamination_details_json": "text",
            "suspected_files_json": "text",
            "receipt_diff_json": "text",
            "receipt_completeness": "real",
            "trace_fidelity": "real",
            "latency_bucket": "text",
            "fallback_used": "integer default 0",
            "fallback_reason": "text",
            "low_confidence_dispatch": "integer default 0",
            "invalid_dispatch": "integer default 0",
            "dispatch_code_disagreement": "integer default 0",
        }
        summary_columns = {
            "receipt_completeness_avg": "real",
            "trace_fidelity_avg": "real",
            "fallback_rate": "real",
            "low_confidence_dispatch_rate": "real",
            "invalid_dispatch_rate": "real",
            "dispatch_code_disagreement_rate": "real",
        }
        for column, column_type in scenario_run_columns.items():
            self._ensure_column("scenario_runs", column, column_type)
        for column, column_type in summary_columns.items():
            self._ensure_column("scenario_summaries", column, column_type)
        self.conn.commit()

    def _decode_run_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        decoded = dict(row)
        decoded["turn_receipt"] = _json_loads(decoded.pop("turn_receipt_json", None))
        decoded["trace"] = _json_loads(decoded.pop("trace_json", None))
        decoded["frontend_result"] = _json_loads(decoded.pop("frontend_result_json", None))
        decoded["mismatches"] = _json_loads(decoded.pop("failure_reason", None)) or []
        decoded["chaos_injections"] = _json_loads(decoded.pop("chaos_injections_json", None)) or []
        decoded["contamination_details"] = _json_loads(decoded.pop("contamination_details_json", None)) or {}
        decoded["suspected_files"] = _json_loads(decoded.pop("suspected_files_json", None)) or []
        decoded["receipt_diff"] = _json_loads(decoded.pop("receipt_diff_json", None)) or {}
        decoded["passed"] = bool(decoded.get("passed"))
        decoded["golden"] = bool(decoded.get("golden"))
        decoded["high_value"] = bool(decoded.get("high_value"))
        decoded["fallback_used"] = bool(decoded.get("fallback_used"))
        decoded["low_confidence_dispatch"] = bool(decoded.get("low_confidence_dispatch"))
        decoded["invalid_dispatch"] = bool(decoded.get("invalid_dispatch"))
        decoded["dispatch_code_disagreement"] = bool(decoded.get("dispatch_code_disagreement"))
        return decoded

    def last_run_for_scenario(self, scenario_id: str, *, exclude_run_id: str | None = None) -> dict[str, Any] | None:
        if exclude_run_id:
            row = self.conn.execute(
                """
                select * from scenario_runs
                where scenario_id = ? and run_id != ?
                order by id desc
                limit 1
                """,
                (scenario_id, exclude_run_id),
            ).fetchone()
        else:
            row = self.conn.execute(
                """
                select * from scenario_runs
                where scenario_id = ?
                order by id desc
                limit 1
                """,
                (scenario_id,),
            ).fetchone()
        return self._decode_run_row(row)

    def insert_run(self, record: dict[str, Any]) -> None:
        self.conn.execute(
            """
            insert into scenario_runs (
              run_id, cycle, scenario_id, suite, environment, kind, prompt, raw_response,
              turn_receipt_json, trace_json, frontend_result_json, score, passed,
              failure_category, failure_reason, duration_ms, first_token_ms,
              retrieval_count, tool_count, family, parent_scenario_id, mutation_family,
              mutation_label, golden, high_value, chaos_profile, chaos_seed,
              chaos_injections_json, contamination_details_json, suspected_files_json,
              receipt_diff_json, receipt_completeness, trace_fidelity, latency_bucket,
              fallback_used, fallback_reason, low_confidence_dispatch, invalid_dispatch, dispatch_code_disagreement
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["run_id"],
                record["cycle"],
                record["scenario_id"],
                record["suite"],
                record.get("environment"),
                record["kind"],
                record.get("prompt"),
                record.get("raw_response"),
                _json_dumps(record.get("turn_receipt")),
                _json_dumps(record.get("trace")),
                _json_dumps(record.get("frontend_result")),
                record["score"],
                1 if record["passed"] else 0,
                record.get("failure_category"),
                _json_dumps(record.get("mismatches", [])),
                record.get("duration_ms"),
                record.get("first_token_ms"),
                record.get("retrieval_count", 0),
                record.get("tool_count", 0),
                record.get("family"),
                record.get("parent_scenario_id"),
                record.get("mutation_family"),
                record.get("mutation_label"),
                1 if record.get("golden") else 0,
                1 if record.get("high_value") else 0,
                record.get("chaos_profile"),
                record.get("chaos_seed"),
                _json_dumps(record.get("chaos_injections", [])),
                _json_dumps(record.get("contamination_details", {})),
                _json_dumps(record.get("suspected_files", [])),
                _json_dumps(record.get("receipt_diff", {})),
                record.get("receipt_completeness"),
                record.get("trace_fidelity"),
                record.get("latency_bucket"),
                1 if record.get("fallback_used") else 0,
                record.get("fallback_reason"),
                1 if record.get("low_confidence_dispatch") else 0,
                1 if record.get("invalid_dispatch") else 0,
                1 if record.get("dispatch_code_disagreement") else 0,
            ),
        )
        self.conn.commit()

    def insert_summary(self, summary: dict[str, Any]) -> None:
        self.conn.execute(
            """
            insert into scenario_summaries (
              run_id, cycle, suite, scenario_count, passed_count, failed_count,
              median_latency_ms, p95_latency_ms, degraded_rate, hallucination_rate,
              contamination_rate, receipt_completeness_avg, trace_fidelity_avg,
              fallback_rate, low_confidence_dispatch_rate, invalid_dispatch_rate, dispatch_code_disagreement_rate
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                summary["run_id"],
                summary["cycle"],
                summary["suite"],
                summary["scenario_count"],
                summary["passed_count"],
                summary["failed_count"],
                summary.get("median_latency_ms"),
                summary.get("p95_latency_ms"),
                summary.get("degraded_rate"),
                summary.get("hallucination_rate"),
                summary.get("contamination_rate"),
                summary.get("receipt_completeness_avg"),
                summary.get("trace_fidelity_avg"),
                summary.get("fallback_rate"),
                summary.get("low_confidence_dispatch_rate"),
                summary.get("invalid_dispatch_rate"),
                summary.get("dispatch_code_disagreement_rate"),
            ),
        )
        self.conn.commit()

    def insert_regression(self, event: dict[str, Any]) -> None:
        self.conn.execute(
            """
            insert into regression_events (
              run_id, cycle, scenario_id, previous_score, current_score, regression_type, details_json
            ) values (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["run_id"],
                event["cycle"],
                event["scenario_id"],
                event.get("previous_score"),
                event["current_score"],
                event["regression_type"],
                _json_dumps(event.get("details", {})),
            ),
        )
        self.conn.commit()

    def insert_receipt_diff(self, diff_record: dict[str, Any]) -> None:
        if not diff_record.get("diffs"):
            return
        self.conn.execute(
            """
            insert into receipt_diffs (run_id, cycle, scenario_id, diff_json)
            values (?, ?, ?, ?)
            """,
            (
                diff_record["run_id"],
                diff_record["cycle"],
                diff_record["scenario_id"],
                _json_dumps(diff_record),
            ),
        )
        self.conn.commit()

    def insert_environment_scorecards(
        self,
        *,
        run_id: str,
        cycle: int,
        suite: str,
        scorecards: list[dict[str, Any]],
    ) -> None:
        for scorecard in scorecards:
            self.conn.execute(
                """
                insert into environment_scorecards (run_id, cycle, suite, environment, scorecard_json)
                values (?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    cycle,
                    suite,
                    scorecard["environment"],
                    _json_dumps(scorecard),
                ),
            )
        self.conn.commit()

    def recent_summaries(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "select * from scenario_summaries order by id desc limit ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def latest_run_id(self, *, suite: str | None = None) -> str | None:
        if suite:
            row = self.conn.execute(
                "select run_id from scenario_summaries where suite = ? order by id desc limit 1",
                (suite,),
            ).fetchone()
        else:
            row = self.conn.execute(
                "select run_id from scenario_summaries order by id desc limit 1"
            ).fetchone()
        return str(row["run_id"]) if row else None

    def last_good_run_id(self, *, suite: str | None = None, exclude_run_id: str | None = None) -> str | None:
        filters: list[str] = []
        params: list[Any] = []
        if suite:
            filters.append("suite = ?")
            params.append(suite)
        if exclude_run_id:
            filters.append("run_id != ?")
            params.append(exclude_run_id)
        where_clause = f"where {' and '.join(filters)}" if filters else ""
        row = self.conn.execute(
            f"""
            select run_id from scenario_summaries
            {where_clause}
            order by case when failed_count = 0 then 0 else 1 end asc,
                     failed_count asc,
                     id desc
            limit 1
            """,
            tuple(params),
        ).fetchone()
        return str(row["run_id"]) if row else None

    def run_records(self, run_id: str, *, suite: str | None = None) -> list[dict[str, Any]]:
        if suite:
            rows = self.conn.execute(
                """
                select * from scenario_runs
                where run_id = ? and suite = ?
                order by id asc
                """,
                (run_id, suite),
            ).fetchall()
        else:
            rows = self.conn.execute(
                """
                select * from scenario_runs
                where run_id = ?
                order by id asc
                """,
                (run_id,),
            ).fetchall()
        return [self._decode_run_row(row) for row in rows if row is not None]

    def close(self) -> None:
        self.conn.close()
