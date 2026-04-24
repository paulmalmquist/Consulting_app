from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
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


# ─────────────────────────────────────────────────────────────────────
# Postgres durable store (sibling of SQLite RegressionStore)
#
# Writes eval runs/results/baselines to the Postgres tables defined in
# repo-b/db/schema/030_winston_eval_core.sql. Keeps the SQLite store for
# local/debugging; Postgres is the durable source of truth used by the
# autonomous workflow and admin inspection routes.
# ─────────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _response_shape_hash(result: dict[str, Any]) -> str:
    """Stable hash of the response shape (event types + block types).

    Delegates to the authoritative implementation in
    `backend.app.assistant_runtime.response_contract`. Preserved as a
    top-level name so `postgres_sink.py` and other internal callers keep
    working without edits.
    """
    try:
        from app.assistant_runtime.response_contract import response_shape_hash
    except ImportError:
        # Backend path not on sys.path yet (rare — happens in isolated tests).
        # Fall back to the original implementation to keep behavior stable.
        events = result.get("events") or []
        event_types = [str(e.get("event") or e.get("type") or "") for e in events]
        block_types: list[str] = []
        for block in result.get("response_blocks") or []:
            if isinstance(block, dict):
                block_types.append(str(block.get("type") or ""))
        payload = json.dumps(
            {"events": event_types, "blocks": block_types}, sort_keys=True
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:16]
    return response_shape_hash(
        result.get("events") or [],
        result.get("response_blocks") or [],
    )


class PostgresRegressionStore:
    """
    Postgres-backed durable store for Winston autonomous eval results.

    Unlike the SQLite `RegressionStore`, this class is shaped around
    run / result / baseline semantics rather than scenario_runs +
    scenario_summaries + regression_events. It's intentionally narrow:
    the rich local telemetry stays in SQLite; Postgres holds the
    authoritative pass/fail + baseline signal.
    """

    def __init__(
        self,
        *,
        dsn: str | None = None,
        business_id: str,
        env_id: str | None = None,
    ) -> None:
        import psycopg  # local import so sqlite-only callers don't need psycopg
        from psycopg.rows import dict_row

        resolved_dsn = dsn or os.environ.get("DATABASE_URL")
        if not resolved_dsn:
            raise RuntimeError(
                "PostgresRegressionStore requires DATABASE_URL or explicit dsn"
            )
        self._psycopg = psycopg
        self.conn = psycopg.connect(resolved_dsn, row_factory=dict_row)
        self.conn.autocommit = True
        self.business_id = business_id
        self.env_id = env_id

    # ── Runs ────────────────────────────────────────────────────────
    def create_run(
        self,
        *,
        trigger: str,
        suite: str,
        git_sha: str | None = None,
        run_id: str | None = None,
    ) -> str:
        run_id = run_id or str(uuid.uuid4())
        self.conn.execute(
            """
            INSERT INTO winston_eval_runs
              (run_id, business_id, env_id, trigger, suite, git_sha, started_at, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'running')
            """,
            (
                run_id,
                self.business_id,
                self.env_id,
                trigger,
                suite,
                git_sha,
                _utcnow(),
            ),
        )
        return run_id

    def finalize_run(
        self,
        *,
        run_id: str,
        status: str,
        total: int,
        passed: int,
        failed: int,
        errored: int,
        regressions: int,
        summary: dict[str, Any] | None = None,
    ) -> None:
        self.conn.execute(
            """
            UPDATE winston_eval_runs
               SET completed_at = %s,
                   status = %s,
                   total_cases = %s,
                   passed_count = %s,
                   failed_count = %s,
                   errored_count = %s,
                   regressions_count = %s,
                   summary = %s::jsonb
             WHERE run_id = %s
            """,
            (
                _utcnow(),
                status,
                total,
                passed,
                failed,
                errored,
                regressions,
                json.dumps(summary or {}, default=str),
                run_id,
            ),
        )

    # ── Results ─────────────────────────────────────────────────────
    def insert_result(
        self,
        *,
        run_id: str,
        case_id: str,
        status: str,
        contract_version: int = 1,
        expected_lane: str | None = None,
        observed_lane: str | None = None,
        failure_category: str | None = None,
        latency_ms: int | None = None,
        ttft_ms: int | None = None,
        tool_count: int | None = None,
        token_count: int | None = None,
        response_excerpt: str | None = None,
        assertion_failures: list[dict[str, Any]] | None = None,
        trace_summary: dict[str, Any] | None = None,
        ai_gateway_log_id: str | None = None,
        is_regression: bool = False,
        baseline_delta: dict[str, Any] | None = None,
    ) -> str:
        result_id = str(uuid.uuid4())
        self.conn.execute(
            """
            INSERT INTO winston_eval_results (
                result_id, run_id, business_id, env_id,
                case_id, contract_version, expected_lane, observed_lane,
                status, failure_category,
                latency_ms, ttft_ms, tool_count, token_count,
                response_excerpt, assertion_failures, trace_summary,
                ai_gateway_log_id, is_regression, baseline_delta
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s, %s, %s,
                %s, %s::jsonb, %s::jsonb,
                %s, %s, %s::jsonb
            )
            """,
            (
                result_id,
                run_id,
                self.business_id,
                self.env_id,
                case_id,
                contract_version,
                expected_lane,
                observed_lane,
                status,
                failure_category,
                latency_ms,
                ttft_ms,
                tool_count,
                token_count,
                (response_excerpt or "")[:2000] or None,
                json.dumps(assertion_failures or [], default=str),
                json.dumps(trace_summary or {}, default=str),
                ai_gateway_log_id,
                is_regression,
                json.dumps(baseline_delta) if baseline_delta else None,
            ),
        )
        return result_id

    # ── Baselines ───────────────────────────────────────────────────
    def get_baseline(
        self,
        *,
        case_id: str,
        contract_version: int,
        expected_lane: str | None,
    ) -> dict[str, Any] | None:
        row = self.conn.execute(
            """
            SELECT *
              FROM winston_eval_baselines
             WHERE business_id = %s
               AND case_id = %s
               AND contract_version = %s
               AND (expected_lane IS NOT DISTINCT FROM %s)
               AND (env_id IS NOT DISTINCT FROM %s)
               AND invalidated_at IS NULL
             ORDER BY last_pass_at DESC
             LIMIT 1
            """,
            (
                self.business_id,
                case_id,
                contract_version,
                expected_lane,
                self.env_id,
            ),
        ).fetchone()
        return dict(row) if row else None

    def upsert_baseline_on_pass(
        self,
        *,
        case_id: str,
        contract_version: int,
        expected_lane: str | None,
        run_id: str,
        result_id: str,
        latency_ms: int | None,
        ttft_ms: int | None,
        response_shape_hash: str | None,
    ) -> None:
        """Update last-known-good. Called only on `status='pass'`."""
        now = _utcnow()
        self.conn.execute(
            """
            INSERT INTO winston_eval_baselines (
                business_id, env_id, case_id, contract_version, expected_lane,
                last_pass_run_id, last_pass_result_id, last_pass_at,
                last_pass_latency_ms, last_pass_ttft_ms,
                last_pass_response_shape_hash,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s,
                %s, %s
            )
            ON CONFLICT (business_id, case_id, env_id, contract_version, expected_lane)
            DO UPDATE SET
                last_pass_run_id = EXCLUDED.last_pass_run_id,
                last_pass_result_id = EXCLUDED.last_pass_result_id,
                last_pass_at = EXCLUDED.last_pass_at,
                last_pass_latency_ms = EXCLUDED.last_pass_latency_ms,
                last_pass_ttft_ms = EXCLUDED.last_pass_ttft_ms,
                last_pass_response_shape_hash = EXCLUDED.last_pass_response_shape_hash,
                invalidated_at = NULL,
                invalidated_reason = NULL,
                updated_at = EXCLUDED.updated_at
            """,
            (
                self.business_id,
                self.env_id,
                case_id,
                contract_version,
                expected_lane,
                run_id,
                result_id,
                now,
                latency_ms,
                ttft_ms,
                response_shape_hash,
                now,
                now,
            ),
        )

    def invalidate_baseline(
        self,
        *,
        case_id: str,
        contract_version: int,
        expected_lane: str | None,
        reason: str,
    ) -> int:
        cur = self.conn.execute(
            """
            UPDATE winston_eval_baselines
               SET invalidated_at = %s,
                   invalidated_reason = %s,
                   updated_at = %s
             WHERE business_id = %s
               AND case_id = %s
               AND contract_version = %s
               AND (expected_lane IS NOT DISTINCT FROM %s)
               AND (env_id IS NOT DISTINCT FROM %s)
               AND invalidated_at IS NULL
            """,
            (
                _utcnow(),
                reason,
                _utcnow(),
                self.business_id,
                case_id,
                contract_version,
                expected_lane,
                self.env_id,
            ),
        )
        return cur.rowcount or 0

    def close(self) -> None:
        self.conn.close()


__all__ = [
    "RegressionStore",
    "PostgresRegressionStore",
    "_response_shape_hash",
]
