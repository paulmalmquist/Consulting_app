from __future__ import annotations

import os
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
import httpx

from app.ai.retrieval import retrieve_snippets, DEFAULT_ALLOWED_ROOTS
from app.ai.sidecar_client import SidecarClient
from app.schemas.ai import (
    AiHealthResponse,
    AiAskRequest,
    AiAskResponse,
    Citation,
    Diagnostics,
    AiCodeTaskRequest,
    AiCodeTaskResponse,
)


router = APIRouter(prefix="/api/ai", tags=["ai"])


def _ai_mode() -> str:
    return os.getenv("AI_MODE", "off").strip().lower()


def _sidecar_url() -> str:
    return os.getenv("AI_SIDECAR_URL", "http://127.0.0.1:7337").strip()


def _timeout_ms() -> int:
    try:
        return int(os.getenv("AI_TIMEOUT_MS", "45000"))
    except ValueError:
        return 45000


def _allowed_roots() -> list[str]:
    raw = os.getenv("AI_ALLOWED_ROOTS", ",".join(DEFAULT_ALLOWED_ROOTS))
    roots = [r.strip() for r in raw.split(",") if r.strip()]
    return roots or DEFAULT_ALLOWED_ROOTS


def _max_prompt_bytes() -> int:
    try:
        return int(os.getenv("AI_MAX_PROMPT_BYTES", "50000"))
    except ValueError:
        return 50000


def _build_augmented_prompt(user_prompt: str, snippets) -> tuple[str, list[Citation]]:
    citations: list[Citation] = []
    parts: list[str] = []
    parts.append(
        "SYSTEM:\n"
        "- You are running locally on a developer machine.\n"
        "- Do not request or reveal secrets.\n"
        "- Base your answer on the provided repo snippets.\n"
        "- If you are unsure, say what additional code/context is needed.\n"
    )
    if snippets:
        parts.append("REPO SNIPPETS:\n")
        for s in snippets:
            citations.append(Citation(path=s.path, start_line=s.start_line, end_line=s.end_line))
            parts.append(f"[{s.path}:{s.start_line}-{s.end_line}]\n{s.text}\n")
    parts.append("USER QUESTION:\n")
    parts.append(user_prompt.strip() + "\n")
    return "\n".join(parts), citations


@router.get("/health", response_model=AiHealthResponse)
def health() -> AiHealthResponse:
    mode = _ai_mode()
    if mode != "local":
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "mode": mode,
                "message": "AI_MODE is not local. Set AI_MODE=local.",
            },
        )

    client = SidecarClient(_sidecar_url(), timeout_ms=_timeout_ms())
    ok, msg = client.health()
    if not ok:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "error",
                "mode": mode,
                "message": msg,
            },
        )
    return AiHealthResponse(status="ok", mode=mode)


@router.post("/ask", response_model=AiAskResponse)
def ask(payload: AiAskRequest, request: Request) -> AiAskResponse:
    mode = _ai_mode()
    if mode != "local":
        raise HTTPException(status_code=501, detail="AI is disabled (AI_MODE != local).")

    req_id = str(uuid.uuid4())
    start = time.time()

    prompt_bytes = len(payload.prompt.encode("utf-8"))
    if prompt_bytes > _max_prompt_bytes():
        raise HTTPException(status_code=413, detail="Prompt too large.")

    scope = payload.scope
    retrieval = payload.retrieval
    allowed_roots = scope.repo_paths if scope and scope.repo_paths else _allowed_roots()
    max_files = scope.max_files if scope else 12
    max_bytes = scope.max_bytes if scope else 200_000
    query = (retrieval.query if retrieval and retrieval.query else payload.prompt).strip()
    top_k = retrieval.top_k if retrieval else 8

    snippets = retrieve_snippets(
        query=query,
        allowed_roots=allowed_roots,
        top_k=top_k,
        max_files=max_files,
        max_bytes=max_bytes,
    )

    augmented, citations = _build_augmented_prompt(payload.prompt, snippets)

    # Do not allow the augmented prompt to explode in size.
    if len(augmented.encode("utf-8")) > max_bytes + _max_prompt_bytes():
        raise HTTPException(status_code=413, detail="Augmented prompt too large.")

    client = SidecarClient(_sidecar_url(), timeout_ms=_timeout_ms())
    ok, msg = client.health(timeout_ms=1000)
    if not ok:
        raise HTTPException(status_code=503, detail=f"Sidecar unavailable: {msg}")

    try:
        result = client.ask(augmented)
    except httpx.HTTPStatusError as e:
        detail = (e.response.text or "").strip()
        raise HTTPException(status_code=e.response.status_code, detail=detail[:500] or "Sidecar error")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:500])
    elapsed_ms = int((time.time() - start) * 1000)

    # Minimal structured logging (no prompt contents).
    print(
        f"[ai.ask] request_id={req_id} ip={request.client.host if request.client else 'unknown'} "
        f"snippets={len(snippets)} elapsed_ms={elapsed_ms}"
    )

    return AiAskResponse(
        answer=result.text,
        citations=citations,
        diagnostics=Diagnostics(used_files=len({c.path for c in citations}), elapsed_ms=elapsed_ms),
    )


@router.post("/code_task", response_model=AiCodeTaskResponse)
def code_task(payload: AiCodeTaskRequest, request: Request) -> AiCodeTaskResponse:
    mode = _ai_mode()
    if mode != "local":
        raise HTTPException(status_code=501, detail="AI is disabled (AI_MODE != local).")

    if payload.dry_run is not True:
        raise HTTPException(status_code=400, detail="Only dry_run=true is supported.")

    req_id = str(uuid.uuid4())
    start = time.time()

    allowed_roots = payload.context_paths or _allowed_roots()
    snippets = retrieve_snippets(
        query=payload.task,
        allowed_roots=allowed_roots,
        top_k=10,
        max_files=12,
        max_bytes=200_000,
    )
    augmented, citations = _build_augmented_prompt(payload.task, snippets)

    client = SidecarClient(_sidecar_url(), timeout_ms=_timeout_ms())
    ok, msg = client.health(timeout_ms=1000)
    if not ok:
        raise HTTPException(status_code=503, detail=f"Sidecar unavailable: {msg}")

    try:
        plan, diff, _sidecar_elapsed = client.code_task(
            augmented, timeout_ms=min(_timeout_ms() * 2, 120_000)
        )
    except httpx.HTTPStatusError as e:
        detail = (e.response.text or "").strip()
        raise HTTPException(status_code=e.response.status_code, detail=detail[:500] or "Sidecar error")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)[:500])
    elapsed_ms = int((time.time() - start) * 1000)

    print(
        f"[ai.code_task] request_id={req_id} ip={request.client.host if request.client else 'unknown'} "
        f"snippets={len(snippets)} elapsed_ms={elapsed_ms}"
    )

    return AiCodeTaskResponse(
        plan=plan,
        diff=diff,
        citations=citations,
        diagnostics=Diagnostics(used_files=len({c.path for c in citations}), elapsed_ms=elapsed_ms),
    )
