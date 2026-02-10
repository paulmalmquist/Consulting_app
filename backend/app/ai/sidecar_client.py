from __future__ import annotations

import time
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class SidecarResult:
    text: str
    elapsed_ms: int


class SidecarClient:
    def __init__(self, base_url: str, timeout_ms: int = 45_000):
        self.base_url = base_url.rstrip("/")
        self.timeout_ms = timeout_ms

    def health(self, timeout_ms: int = 1500) -> tuple[bool, str]:
        try:
            r = httpx.get(f"{self.base_url}/health", timeout=timeout_ms / 1000.0)
            if r.status_code != 200:
                return False, f"sidecar returned {r.status_code}"
            payload = r.json()
            if payload.get("ok") is True and payload.get("codex_available") is True:
                return True, "ok"
            msg = payload.get("message") or "codex unavailable"
            return False, msg
        except Exception as e:
            return False, str(e)

    def ask(self, prompt: str) -> SidecarResult:
        start = time.time()
        r = httpx.post(
            f"{self.base_url}/v1/ask",
            json={"prompt": prompt, "timeout_ms": self.timeout_ms},
            timeout=(self.timeout_ms / 1000.0) + 5.0,
        )
        elapsed_ms = int((time.time() - start) * 1000)
        r.raise_for_status()
        payload = r.json()
        return SidecarResult(text=(payload.get("answer") or "").strip(), elapsed_ms=elapsed_ms)

    def code_task(self, task_prompt: str, timeout_ms: int = 90_000) -> tuple[str, str | None, int]:
        start = time.time()
        r = httpx.post(
            f"{self.base_url}/v1/code_task",
            json={"task": task_prompt, "timeout_ms": timeout_ms},
            timeout=(timeout_ms / 1000.0) + 5.0,
        )
        elapsed_ms = int((time.time() - start) * 1000)
        r.raise_for_status()
        payload = r.json()
        plan = (payload.get("plan") or "").strip()
        diff = payload.get("diff")
        if isinstance(diff, str):
            diff = diff.strip() or None
        return plan, diff, elapsed_ms

