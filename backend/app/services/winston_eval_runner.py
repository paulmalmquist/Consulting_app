"""Winston eval runner — thin backend wrapper around `eval_loop/runner.py`.

Single entrypoint:
    trigger_eval_run(suite, business_id, env_id, trigger) -> dict

Launches the eval_loop runner as a subprocess with `--persist-postgres`
so it mirrors results into winston_eval_runs/_results/_baselines.
Intentionally compatible with FastAPI BackgroundTasks (post-deploy trigger)
and a future scheduled poller.

Mirrors the `podcast_runner.py` pattern: catch everything, persist failure
state, never kill the worker.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

from app.db import get_cursor
from psycopg.types.json import Json

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS_DIR = REPO_ROOT / "artifacts" / "eval-loop"
VALID_SUITES = ("smoke", "full")
VALID_TRIGGERS = ("manual", "schedule", "post_deploy")


def trigger_eval_run(
    *,
    suite: str,
    business_id: str,
    env_id: str | None = None,
    environment: str | None = None,
    trigger: str = "manual",
    write_docs_report: bool = True,
    timeout_seconds: int = 1800,
) -> dict[str, Any]:
    """Run the Winston eval loop and mirror results into Postgres.

    Returns a dict with {status, run_id, returncode, stdout_tail, stderr_tail}.
    Never raises for eval failures — caller inspects `status`.
    Raises only for configuration errors (bad suite, missing business_id).
    """
    if suite not in VALID_SUITES:
        raise ValueError(f"suite must be one of {VALID_SUITES}, got {suite!r}")
    if trigger not in VALID_TRIGGERS:
        raise ValueError(f"trigger must be one of {VALID_TRIGGERS}, got {trigger!r}")
    if not business_id:
        raise ValueError("business_id is required for Postgres persistence")

    # Unique run_id up front so callers can correlate before subprocess exits.
    preview_run_id = f"eval_{uuid.uuid4().hex[:10]}"
    regressions_out = ARTIFACTS_DIR / f"regressions_{preview_run_id}.json"

    cmd = [
        sys.executable,
        "-m",
        "eval_loop.runner",
        f"--{suite}",
        "--persist-postgres",
        "--persist-business-id", business_id,
        "--persist-trigger", trigger,
        "--regressions-out", str(regressions_out),
    ]
    if environment:
        cmd.extend(["--environment", environment])
    if env_id:
        cmd.extend(["--persist-env-id", env_id])
    if write_docs_report:
        cmd.append("--write-docs-report")

    env = os.environ.copy()
    env.setdefault("WINSTON_EVAL_BUSINESS_ID", business_id)
    if env_id:
        env.setdefault("WINSTON_EVAL_ENV_ID", env_id)
    if environment:
        env.setdefault("WINSTON_EVAL_ENVIRONMENT", environment)

    logger.info(
        "winston eval run starting: suite=%s trigger=%s environment=%s business_id=%s env_id=%s",
        suite, trigger, environment, business_id, env_id,
    )

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        logger.error("winston eval run timed out after %ss", timeout_seconds)
        return {
            "status": "errored",
            "error": f"timeout after {timeout_seconds}s",
            "returncode": None,
            "stdout_tail": (exc.stdout or b"")[-2000:].decode(errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")[-2000:],
            "stderr_tail": (exc.stderr or b"")[-2000:].decode(errors="replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")[-2000:],
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("winston eval run crashed to launch")
        return {"status": "errored", "error": f"{type(exc).__name__}: {exc}"}

    stdout_tail = (proc.stdout or "")[-2000:]
    stderr_tail = (proc.stderr or "")[-2000:]

    # The runner prints a JSON summary on the last line of stdout.
    summary = _parse_last_json(proc.stdout or "")

    status = "passed"
    if proc.returncode != 0:
        status = "failed"
    if summary and summary.get("failed") and summary["failed"] > 0:
        status = "failed"

    logger.info(
        "winston eval run done: returncode=%s status=%s summary=%s",
        proc.returncode, status, summary,
    )

    return {
        "status": status,
        "returncode": proc.returncode,
        "run_id": (summary or {}).get("run_id"),
        "environment": environment,
        "summary": summary,
        "stdout_tail": stdout_tail,
        "stderr_tail": stderr_tail,
        "regressions_artifact": str(regressions_out) if regressions_out.exists() else None,
    }


def _parse_last_json(stdout: str) -> dict[str, Any] | None:
    """Runner emits a JSON status line per cycle; grab the last parseable one."""
    if not stdout:
        return None
    for line in reversed(stdout.strip().splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            continue
    return None


def list_repe_eval_scenarios(*, env_id: str | None = None, active: bool = True) -> list[dict[str, Any]]:
    conditions = ["domain = 'repe'"]
    params: list[Any] = []
    if env_id:
        conditions.append("env_id = %s")
        params.append(env_id)
    if active is not None:
        conditions.append("active = %s")
        params.append(active)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
              FROM winston_eval_scenarios
             WHERE {' AND '.join(conditions)}
             ORDER BY scenario_key
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]


def grade_repe_eval_observation(observation: dict[str, Any], scenario: dict[str, Any] | None = None) -> dict[str, Any]:
    expected_capability = (scenario or {}).get("expected_capability")
    capability_called = observation.get("capability_called")
    source_tables = set(observation.get("source_tables_used") or [])
    legacy = {"re_fund_quarter_state", "re_fund_metrics_qtr"}

    failure_category = observation.get("failure_category")
    pass_fail = "pass"
    if expected_capability and capability_called != expected_capability:
        pass_fail = "fail"
        failure_category = "capability_mismatch"
    if source_tables & legacy or observation.get("forbidden_table_touched"):
        pass_fail = "fail"
        failure_category = "legacy_source_violation"
    if not observation.get("data_snapshot_hash") and not failure_category:
        pass_fail = "fail"
        failure_category = "missing_snapshot_hash"
    if observation.get("comparison_result") and not (observation.get("coverage") or {}).get("total") and not failure_category:
        pass_fail = "fail"
        failure_category = "missing_coverage"

    return {
        "pass_fail": pass_fail,
        "failure_category": failure_category,
        "capability_correctness_status": "pass" if pass_fail == "pass" or failure_category != "capability_mismatch" else "fail",
        "scope_status": observation.get("scope_status") or "pass",
        "provenance_status": "pass" if observation.get("data_snapshot_hash") else "fail",
        "no_fake_zero_status": observation.get("no_fake_zero_status") or "pass",
    }


def record_repe_eval_observation(observation: dict[str, Any], scenario: dict[str, Any] | None = None) -> str:
    grade = grade_repe_eval_observation(observation, scenario)
    payload = {**observation, **grade}
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO winston_eval_observations (
              env_id, business_id, run_id, scenario_id, question,
              capability_called, capability_params_used, answer_text, tool_calls,
              sql_queries, source_tables_used, forbidden_table_touched,
              snapshot_ids_used, data_snapshot_hash, comparison_result,
              periods_used, metrics_returned, unavailable_reasons, coverage,
              pass_fail, failure_category, capability_correctness_status,
              numeric_accuracy_status, scope_status, provenance_status,
              no_fake_zero_status, latency_ms, raw_trace,
              mutation_requested, mutation_allowed, staged_change_set_id,
              committed_change_set_id, target_tables, validation_status,
              approval_gate_status, impact_preview_status, audit_receipt_status,
              rollback_status, rows_inserted, rows_updated, rows_deleted
            ) VALUES (
              %s, %s, %s, %s, %s,
              %s, %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s,
              %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                payload["env_id"],
                payload["business_id"],
                payload.get("run_id"),
                payload.get("scenario_id"),
                payload.get("question") or payload.get("prompt") or "",
                payload.get("capability_called"),
                Json(payload.get("capability_params_used") or {}),
                payload.get("answer_text"),
                Json(payload.get("tool_calls") or []),
                Json(payload.get("sql_queries") or []),
                Json(payload.get("source_tables_used") or []),
                bool(payload.get("forbidden_table_touched")),
                Json(payload.get("snapshot_ids_used") or []),
                payload.get("data_snapshot_hash"),
                Json(payload.get("comparison_result") or {}),
                Json(payload.get("periods_used") or []),
                Json(payload.get("metrics_returned") or {}),
                Json(payload.get("unavailable_reasons") or []),
                Json(payload.get("coverage") or {}),
                payload.get("pass_fail"),
                payload.get("failure_category"),
                payload.get("capability_correctness_status"),
                payload.get("numeric_accuracy_status"),
                payload.get("scope_status"),
                payload.get("provenance_status"),
                payload.get("no_fake_zero_status"),
                payload.get("latency_ms"),
                Json(payload.get("raw_trace") or {}),
                bool(payload.get("mutation_requested", False)),
                payload.get("mutation_allowed"),
                payload.get("staged_change_set_id"),
                payload.get("committed_change_set_id"),
                Json(payload.get("target_tables") or []),
                payload.get("validation_status"),
                payload.get("approval_gate_status"),
                payload.get("impact_preview_status"),
                payload.get("audit_receipt_status"),
                payload.get("rollback_status"),
                int(payload.get("rows_inserted") or 0),
                int(payload.get("rows_updated") or 0),
                int(payload.get("rows_deleted") or 0),
            ),
        )
        row = cur.fetchone()
    return str(row["id"])


__all__ = [
    "trigger_eval_run",
    "VALID_SUITES",
    "VALID_TRIGGERS",
    "list_repe_eval_scenarios",
    "grade_repe_eval_observation",
    "record_repe_eval_observation",
]
