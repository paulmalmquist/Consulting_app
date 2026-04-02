"""Gateway audit wrapper for AI calls outside the main pipeline.

Any service that calls an LLM directly (extraction, pds_analytics, etc.)
MUST wrap the call with `log_ai_call()` to ensure unified observability.

Usage:
    from app.services.gateway_audit import log_ai_call

    with log_ai_call(
        service="extraction",
        model="gpt-4o",
        lane="bypass",
        actor="system",
    ) as audit:
        response = client.chat.completions.create(...)
        audit.record(
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
        )
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Generator

from app.observability.logger import emit_log
from app.services.cost_tracker import estimate_cost


@dataclass
class AiCallAudit:
    """Mutable audit record populated during an AI call."""
    service: str
    model: str
    lane: str
    actor: str
    start_time: float = field(default_factory=time.time)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    tools_used: list[str] = field(default_factory=list)
    success: bool = True
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def record(
        self,
        *,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        tools_used: list[str] | None = None,
    ) -> None:
        """Record token usage from a completed AI call."""
        try:
            self.prompt_tokens += int(prompt_tokens)
            self.completion_tokens += int(completion_tokens)
        except (TypeError, ValueError):
            pass  # Gracefully handle non-int values (e.g., from mocks)
        if tools_used:
            self.tools_used.extend(tools_used)

    def fail(self, error: str) -> None:
        """Mark the call as failed."""
        self.success = False
        self.error_message = error

    @property
    def duration_ms(self) -> int:
        return int((time.time() - self.start_time) * 1000)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@contextmanager
def log_ai_call(
    *,
    service: str,
    model: str,
    lane: str = "bypass",
    actor: str = "system",
    env_id: str | None = None,
    business_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> Generator[AiCallAudit, None, None]:
    """Context manager that logs an AI call to the unified audit trail.

    Emits a structured log event on exit with timing, token usage,
    and cost estimation — matching the format used by the main gateway.
    """
    audit = AiCallAudit(
        service=service,
        model=model,
        lane=lane,
        actor=actor,
        metadata=metadata or {},
    )

    try:
        yield audit
    except Exception as exc:
        audit.fail(str(exc))
        raise
    finally:
        try:
            cost = estimate_cost(
                model=audit.model,
                prompt_tokens=int(audit.prompt_tokens),
                completion_tokens=int(audit.completion_tokens),
            ) if isinstance(audit.prompt_tokens, int) and audit.prompt_tokens > 0 else None
        except (TypeError, ValueError):
            cost = None

        emit_log(
            level="error" if not audit.success else "info",
            service="backend",
            action=f"ai.bypass.{audit.service}",
            message=(
                f"[{audit.service}] model={audit.model} lane={audit.lane} "
                f"tokens={audit.total_tokens} "
                f"(prompt={audit.prompt_tokens}, completion={audit.completion_tokens}) "
                f"duration={audit.duration_ms}ms "
                f"{'FAILED: ' + (audit.error_message or 'unknown') if not audit.success else 'OK'}"
            ),
            context={
                "service": audit.service,
                "model": audit.model,
                "lane": audit.lane,
                "actor": audit.actor,
                "prompt_tokens": audit.prompt_tokens,
                "completion_tokens": audit.completion_tokens,
                "total_tokens": audit.total_tokens,
                "tools_used": audit.tools_used,
                "duration_ms": audit.duration_ms,
                "success": audit.success,
                "error": audit.error_message,
                "cost_estimate_usd": cost,
                "env_id": env_id,
                "business_id": business_id,
                **(audit.metadata),
            },
        )
