from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest


def _iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _safe_name(nodeid: str) -> str:
    return (
        nodeid.replace("/", "_")
        .replace("\\", "_")
        .replace("::", "__")
        .replace("[", "_")
        .replace("]", "_")
        .replace(":", "_")
    )


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


@pytest.fixture
def repe_log_context(request):
    run_id = str(uuid4())
    request_id = str(uuid4())
    artifact_root = _repo_root() / "artifacts" / "test-logs" / "backend" / run_id
    artifact_root.mkdir(parents=True, exist_ok=True)

    test_name = _safe_name(request.node.nodeid)
    jsonl_path = artifact_root / f"{test_name}.jsonl"

    state = {
        "run_id": run_id,
        "request_id": request_id,
        "artifact_root": artifact_root,
        "jsonl_path": jsonl_path,
        "test_name": test_name,
        "last_response": None,
    }
    request.node._repe_state = state

    def log_event(action: str, message: str, *, level: str = "info", context: dict[str, Any] | None = None):
        payload = {
            "ts": _iso_now(),
            "level": level,
            "service": "backend",
            "env_id": None,
            "business_id": None,
            "user": "test",
            "request_id": request_id,
            "run_id": run_id,
            "action": action,
            "message": message,
            "context": context or {},
            "duration_ms": None,
        }
        line = json.dumps(payload, ensure_ascii=True)
        print(line)
        with jsonl_path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def capture_response(resp):
        state["last_response"] = {
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "body": resp.text,
        }

    return {
        "run_id": run_id,
        "request_id": request_id,
        "headers": {
            "X-Run-Id": run_id,
            "X-Request-Id": request_id,
        },
        "log_event": log_event,
        "capture_response": capture_response,
    }


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()

    state = getattr(item, "_repe_state", None)
    if not state or rep.when != "call":
        return

    if rep.failed:
        last = state.get("last_response") or {}
        headers_path = state["artifact_root"] / f"{state['test_name']}.response_headers.json"
        body_path = state["artifact_root"] / f"{state['test_name']}.response_body.json"
        summary_path = state["artifact_root"] / f"{state['test_name']}.failure_summary.txt"

        headers_path.write_text(
            json.dumps(last.get("headers", {}), indent=2, ensure_ascii=True),
            encoding="utf-8",
        )
        body_path.write_text(last.get("body", ""), encoding="utf-8")
        summary_path.write_text(
            f"status={last.get('status_code')}\nheaders={headers_path}\nbody={body_path}\n",
            encoding="utf-8",
        )
