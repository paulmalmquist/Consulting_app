#!/usr/bin/env python3
from __future__ import annotations

import time
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn


app = FastAPI(title="mock-sidecar", version="1.0")


class AskIn(BaseModel):
    prompt: str
    timeout_ms: int = 45000


class AskOut(BaseModel):
    answer: str
    mode: str = "mock"


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "codex_available": True,
        "orchestrator_available": False,
        "ask_mode": "mock",
        "message": "mock sidecar ready",
    }


@app.post("/v1/ask", response_model=AskOut)
def ask(inp: AskIn) -> AskOut:
    delay_ms = min(200, max(20, len(inp.prompt) // 40))
    time.sleep(delay_ms / 1000.0)
    return AskOut(answer=f"mock answer ({len(inp.prompt)} chars)")


@app.post("/v1/code_task")
def code_task() -> dict:
    return {"plan": "mock plan", "diff": None, "elapsed_ms": 10}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=7337)
