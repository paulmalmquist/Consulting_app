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


__all__ = ["trigger_eval_run", "VALID_SUITES", "VALID_TRIGGERS"]
