#!/usr/bin/env python3
"""Local-only Codex sidecar routed through orchestration enforcement."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7337
DEFAULT_TIMEOUT_MS = 45_000
MAX_PROMPT_BYTES = 50_000
ROOT = Path(__file__).resolve().parents[1]
ORCH = ROOT / "scripts" / "codex_orchestrator.py"
ASK_MODE = os.getenv("AI_SIDECAR_ASK_MODE", "direct").strip().lower()

FAST_INTENTS = {"ui_refactor", "file_move", "test_fix", "documentation", "analytics_query"}


class AskRequest(BaseModel):
    prompt: str = Field(min_length=1)
    timeout_ms: int = Field(default=DEFAULT_TIMEOUT_MS, ge=1_000, le=180_000)
    session_id: str | None = None
    intent: str | None = None
    allowed_directories: list[str] | None = None
    auto_approval: bool = False
    reasoning_effort: str = "low"


class AskResponse(BaseModel):
    answer: str
    elapsed_ms: int
    execution_id: str | None = None
    log_path: str | None = None


class CodeTaskRequest(BaseModel):
    task: str = Field(min_length=1)
    timeout_ms: int = Field(default=DEFAULT_TIMEOUT_MS, ge=1_000, le=300_000)
    session_id: str | None = None
    intent: str | None = "documentation"
    allowed_directories: list[str] | None = None
    auto_approval: bool = False


class CodeTaskResponse(BaseModel):
    plan: str
    diff: str | None = None
    elapsed_ms: int
    execution_id: str | None = None
    log_path: str | None = None


app = FastAPI(title="Local Codex Sidecar", version="0.2.0")


def _check_codex_available() -> tuple[bool, str]:
    path = shutil.which("codex")
    if not path:
        return False, "codex CLI not found on PATH"
    if not ORCH.exists():
        return False, "orchestration runner not found"
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5)
        if out.returncode != 0:
            return False, "codex CLI is present but failed to run"
        return True, out.stdout.strip() or "codex available"
    except Exception as e:  # pragma: no cover
        return False, f"codex CLI check failed: {e}"


def _minimal_env() -> dict[str, str]:
    keep = [
        "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "TERM",
        "CODEX_MODEL_FAST", "CODEX_MODEL_DEEP",
    ]
    out: dict[str, str] = {}
    for key in keep:
        if key in os.environ:
            out[key] = os.environ[key]
    return out


def _session_create(session_id: str, intent: str, allowed_directories: list[str], auto_approval: bool, reasoning_effort: str = "low") -> None:
    if not ORCH.exists():
        raise HTTPException(status_code=500, detail="orchestration runner missing")

    model = "fast" if intent in {"ui_refactor", "file_move", "test_fix", "documentation", "analytics_query"} else "deep"
    allowed = ",".join(allowed_directories or ["repo-b/src", "backend", "scripts"]) 
    args = [
        "python3", str(ORCH), "session", "create",
        "--session-id", session_id,
        "--intent", intent,
        "--model", model,
        "--reasoning-effort", reasoning_effort,
        "--allowed-directories", allowed,
        "--allowed-tools", "read,edit,shell",
        "--max-files-per-execution", "25",
    ]
    if auto_approval:
        args.append("--auto-approval")
    cp = subprocess.run(args, capture_output=True, text=True, env=_minimal_env(), cwd=str(ROOT))
    if cp.returncode != 0 and "already" not in (cp.stderr + cp.stdout).lower():
        # session might already exist; validate attempt next
        val = subprocess.run(["python3", str(ORCH), "session", "validate", "--session-id", session_id], capture_output=True, text=True, env=_minimal_env(), cwd=str(ROOT))
        if val.returncode != 0:
            raise HTTPException(status_code=422, detail=(cp.stderr or cp.stdout or "session creation failed")[:500])


def _run_orchestrated(prompt: str, session_id: str, intent: str, allowed_directories: list[str], auto_approval: bool, timeout_ms: int) -> tuple[int, str, str]:
    _session_create(session_id=session_id, intent=intent, allowed_directories=allowed_directories, auto_approval=auto_approval)

    args = [
        "python3", str(ORCH), "run",
        "--session-id", session_id,
        "--prompt", prompt,
        "--simulate",  # sidecar keeps previous read-only semantics for now
    ]
    if intent:
        args.extend(["--intent", intent])
    if auto_approval:
        args.extend(["--approval-text", "CONFIRM"])
    cp = subprocess.run(args, capture_output=True, text=True, timeout=timeout_ms / 1000.0, env=_minimal_env(), cwd=str(ROOT))
    return cp.returncode, cp.stdout, cp.stderr


def _run_direct_ask(prompt: str, intent: str, timeout_ms: int) -> tuple[int, str, str]:
    model = "fast" if intent in FAST_INTENTS else "deep"
    with tempfile.NamedTemporaryFile(prefix="codex-sidecar-last-", suffix=".txt", delete=False) as tf:
        output_path = tf.name

    ask_prompt = "\n".join(
        [
            "You are answering in a local developer workspace.",
            "Provide a concise, directly actionable answer.",
            "When stating repo facts, include concrete file paths.",
            "If uncertain, state what context is missing.",
            "",
            "User request:",
            prompt,
        ]
    )
    args = [
        "codex",
        "exec",
        "-m",
        model,
        "--sandbox",
        "read-only",
        "--cd",
        str(ROOT),
        "--output-last-message",
        output_path,
        ask_prompt,
    ]
    cp = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout_ms / 1000.0,
        env=_minimal_env(),
        cwd=str(ROOT),
    )
    answer = ""
    try:
        answer = Path(output_path).read_text(encoding="utf-8").strip()
    except Exception:
        answer = ""
    finally:
        Path(output_path).unlink(missing_ok=True)

    if not answer:
        answer = (cp.stdout or "").strip()
    return cp.returncode, answer, cp.stderr


@app.get("/health")
def health() -> dict[str, Any]:
    ok, msg = _check_codex_available()
    return {"ok": True, "codex_available": ok, "message": msg}


@app.post("/v1/ask", response_model=AskResponse)
def ask(payload: AskRequest) -> AskResponse:
    start = time.time()
    if len(payload.prompt.encode("utf-8")) > MAX_PROMPT_BYTES:
        raise HTTPException(status_code=413, detail="Prompt too large")

    sid = payload.session_id or str(uuid4())
    intent = payload.intent or "documentation"
    allowed = payload.allowed_directories or ["repo-b/src", "backend", "scripts"]
    if ASK_MODE not in {"direct", "orchestrated"}:
        raise HTTPException(status_code=500, detail=f"Invalid AI_SIDECAR_ASK_MODE: {ASK_MODE}")

    try:
        if ASK_MODE == "direct":
            rc, out, err = _run_direct_ask(
                prompt=payload.prompt,
                intent=intent,
                timeout_ms=payload.timeout_ms,
            )
            if rc == 0 and out.strip():
                elapsed_ms = int((time.time() - start) * 1000)
                return AskResponse(answer=out, elapsed_ms=elapsed_ms)
        rc, out, err = _run_orchestrated(
            prompt=payload.prompt,
            session_id=sid,
            intent=intent,
            allowed_directories=allowed,
            auto_approval=payload.auto_approval,
            timeout_ms=payload.timeout_ms,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Codex sidecar timed out")

    elapsed_ms = int((time.time() - start) * 1000)
    if rc != 0:
        detail = (err or out or "Orchestrated run failed").strip()[:1000]
        raise HTTPException(status_code=502, detail=detail)

    parsed = {}
    try:
        parsed = json.loads(out)
    except Exception:
        parsed = {"status": "completed", "raw": out}

    answer = parsed.get("stdout_tail") if isinstance(parsed, dict) else None
    if not isinstance(answer, str) or not answer.strip():
        answer = json.dumps(parsed, sort_keys=True)
    return AskResponse(
        answer=answer,
        elapsed_ms=elapsed_ms,
        execution_id=parsed.get("execution_id"),
        log_path=parsed.get("log_path"),
    )


@app.post("/v1/code_task", response_model=CodeTaskResponse)
def code_task(payload: CodeTaskRequest) -> CodeTaskResponse:
    start = time.time()
    sid = payload.session_id or str(uuid4())
    intent = payload.intent or "documentation"
    allowed = payload.allowed_directories or ["repo-b/src", "backend", "scripts"]
    rc, out, err = _run_orchestrated(
        prompt=payload.task,
        session_id=sid,
        intent=intent,
        allowed_directories=allowed,
        auto_approval=payload.auto_approval,
        timeout_ms=payload.timeout_ms,
    )
    elapsed_ms = int((time.time() - start) * 1000)
    if rc != 0:
        detail = (err or out or "Orchestrated run failed").strip()[:1000]
        raise HTTPException(status_code=502, detail=detail)

    parsed = json.loads(out)
    return CodeTaskResponse(
        plan=json.dumps(parsed.get("plan", {}), sort_keys=True),
        diff=None,
        elapsed_ms=elapsed_ms,
        execution_id=parsed.get("execution_id"),
        log_path=parsed.get("log_path"),
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("AI_SIDECAR_HOST", DEFAULT_HOST)
    port = int(os.getenv("AI_SIDECAR_PORT", str(DEFAULT_PORT)))
    uvicorn.run(app, host=host, port=port)
