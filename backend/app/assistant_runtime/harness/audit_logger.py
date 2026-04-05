"""Structured audit logger with correlation ID enrichment.

Wraps the existing emit_log() infrastructure with per-turn correlation IDs
so all logs for a single assistant turn can be queried together.
"""
from __future__ import annotations

from typing import Any

from app.observability.logger import emit_log


class HarnessAuditLogger:
    """Logs harness events with consistent correlation IDs."""

    def __init__(
        self,
        *,
        request_id: str,
        thread_id: str | None = None,
        conversation_id: str | None = None,
        env_id: str | None = None,
        entity_id: str | None = None,
    ) -> None:
        self._correlation = {
            "request_id": request_id,
            "thread_id": thread_id,
            "conversation_id": conversation_id,
            "env_id": env_id,
            "entity_id": entity_id,
        }

    def _emit(self, action: str, message: str, context: dict[str, Any] | None = None) -> None:
        emit_log(
            level="info",
            service="backend",
            action=f"harness.{action}",
            message=message,
            context={**self._correlation, **(context or {})},
        )

    def log_checkpoint(self, phase: str, *, outcome: str = "ok", context: dict[str, Any] | None = None) -> None:
        self._emit(
            "lifecycle_checkpoint",
            f"Checkpoint: {phase} ({outcome})",
            {"phase": phase, "outcome": outcome, **(context or {})},
        )

    def log_gate_result(self, gate_name: str, *, passed: bool, message: str = "", severity: str = "info") -> None:
        self._emit(
            "quality_gate",
            f"Gate {gate_name}: {'PASS' if passed else 'FAIL'} {message}",
            {"gate_name": gate_name, "passed": passed, "severity": severity, "gate_message": message},
        )

    def log_context_carry_forward(
        self,
        *,
        inherited_entity_id: str | None,
        inherited_entity_source: str | None,
        entity_name: str | None = None,
    ) -> None:
        if not inherited_entity_id:
            return
        self._emit(
            "context_carry_forward",
            f"Inherited entity {entity_name or inherited_entity_id} from {inherited_entity_source}",
            {
                "inherited_entity_id": inherited_entity_id,
                "inherited_entity_source": inherited_entity_source,
                "entity_name": entity_name,
            },
        )

    def log_entity_persisted(self, *, entity_type: str, entity_id: str, entity_name: str | None = None) -> None:
        self._emit(
            "entity_persisted",
            f"Persisted {entity_type} {entity_name or entity_id} to thread state",
            {"entity_type": entity_type, "entity_id": entity_id, "entity_name": entity_name},
        )
