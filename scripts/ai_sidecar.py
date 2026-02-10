#!/usr/bin/env python3
"""
Local-only Codex sidecar.

This is a developer/operator tool. It runs on localhost and shells out to the
installed `codex` CLI (which uses local ChatGPT-managed auth via `codex login`).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 7337
DEFAULT_TIMEOUT_MS = 45_000
MAX_PROMPT_BYTES = 50_000


class AskRequest(BaseModel):
    prompt: str = Field(min_length=1)
    timeout_ms: int = Field(default=DEFAULT_TIMEOUT_MS, ge=1_000, le=180_000)


class AskResponse(BaseModel):
    answer: str
    elapsed_ms: int


class CodeTaskRequest(BaseModel):
    task: str = Field(min_length=1)
    timeout_ms: int = Field(default=DEFAULT_TIMEOUT_MS, ge=1_000, le=300_000)


class CodeTaskResponse(BaseModel):
    plan: str
    diff: str | None = None
    elapsed_ms: int


app = FastAPI(title="Local Codex Sidecar", version="0.1.0")


def _check_codex_available() -> tuple[bool, str]:
    path = shutil.which("codex")
    if not path:
        return False, "codex CLI not found on PATH"
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5)
        if out.returncode != 0:
            return False, "codex CLI is present but failed to run"
        return True, out.stdout.strip() or "codex available"
    except Exception as e:  # pragma: no cover
        return False, f"codex CLI check failed: {e}"


def _minimal_env() -> dict[str, str]:
    # Do not forward arbitrary environment variables (especially secrets).
    # Keep only what is required for the process to run.
    keep = ["PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "TERM"]
    out: dict[str, str] = {}
    for key in keep:
        if key in os.environ:
            out[key] = os.environ[key]
    return out


def _run_codex(prompt: str, timeout_ms: int) -> tuple[int, str, str]:
    if len(prompt.encode("utf-8")) > MAX_PROMPT_BYTES:
        raise HTTPException(status_code=413, detail="Prompt too large")

    codex_path = shutil.which("codex")
    if not codex_path:
        raise HTTPException(status_code=503, detail="codex CLI not installed")

    # Strongly discourage Codex from running commands/tools.
    # We provide retrieval context upstream in the backend.
    safe_prompt = (
        "SYSTEM:\n"
        "- You are running locally on a developer machine.\n"
        "- Do NOT run any commands, tools, or searches.\n"
        "- Do NOT attempt to access the network.\n"
        "- Answer ONLY based on the provided text.\n\n"
        f"USER:\n{prompt.strip()}\n"
    )

    # Read-only sandbox: no shell execution / no repo mutation.
    cmd = [
        codex_path,
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        safe_prompt,
    ]

    try:
        p = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_ms / 1000.0,
            env=_minimal_env(),
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Codex sidecar timed out")


@app.get("/health")
def health() -> dict[str, Any]:
    ok, msg = _check_codex_available()
    return {"ok": True, "codex_available": ok, "message": msg}


@app.post("/v1/ask", response_model=AskResponse)
def ask(payload: AskRequest) -> AskResponse:
    start = time.time()
    rc, out, err = _run_codex(payload.prompt, payload.timeout_ms)
    elapsed_ms = int((time.time() - start) * 1000)

    if rc != 0:
        # Avoid leaking stderr; truncate.
        detail = (err or out or "Codex execution failed").strip()[:500]
        raise HTTPException(status_code=502, detail=detail)

    answer = out.strip()
    # Codex CLI includes a lot of headers/metadata. Keep the last non-empty line as the answer.
    # This is a pragmatic heuristic for local usage; backend already supplies citations separately.
    lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
    if lines:
        answer = lines[-1]
    if not answer:
        raise HTTPException(status_code=502, detail="Empty response from codex")

    return AskResponse(answer=answer, elapsed_ms=elapsed_ms)


@app.post("/v1/code_task", response_model=CodeTaskResponse)
def code_task(payload: CodeTaskRequest) -> CodeTaskResponse:
    start = time.time()
    # Ask Codex to return a plan and (optionally) a unified diff.
    prompt = (
        "You are a coding assistant. Provide a concise implementation plan, then if possible "
        "provide a unified diff. If you cannot produce a diff, say so explicitly.\n\n"
        f"TASK:\n{payload.task}\n"
    )
    rc, out, err = _run_codex(prompt, payload.timeout_ms)
    elapsed_ms = int((time.time() - start) * 1000)

    if rc != 0:
        detail = (err or out or "Codex execution failed").strip()[:500]
        raise HTTPException(status_code=502, detail=detail)

    text = out.strip()
    if not text:
        raise HTTPException(status_code=502, detail="Empty response from codex")

    # Best-effort extraction: split on first "diff" fence if present.
    diff = None
    plan = text
    if "```diff" in text:
        before, after = text.split("```diff", 1)
        plan = before.strip()
        diff_body = after.split("```", 1)[0]
        diff = diff_body.strip() or None

    return CodeTaskResponse(plan=plan, diff=diff, elapsed_ms=elapsed_ms)


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("AI_SIDECAR_HOST", DEFAULT_HOST)
    port = int(os.getenv("AI_SIDECAR_PORT", str(DEFAULT_PORT)))
    uvicorn.run(app, host=host, port=port)
