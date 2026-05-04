"""AuditSinkAdapter — records every step.

Default backing: backend/app/services/audit.py ``record_event`` writing to
the Winston audit table. Client fork swaps to Splunk HEC, Datadog Logs,
native SIEM, S3+Athena, or a records-management system.

Every attorney disposition, every AI-prepared output, and every adapter call
should land here. The audit trail is what makes the layer credible to a GC.
"""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.services import audit as audit_svc


class AuditSinkAdapter(Protocol):
    def record(
        self,
        *,
        env_id: UUID,
        business_id: UUID,
        actor: str,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        success: bool = True,
        input_data: dict | None = None,
        output_data: dict | None = None,
        latency_ms: int | None = None,
    ) -> None:
        ...


class _WinstonAuditSink:
    """Default impl: delegates to backend/app/services/audit.record_event.

    The Winston audit_svc.record_event signature has historically taken
    optional kwargs for actor/action/tool_name/success/latency_ms/business_id/
    object_type/object_id/input_data/output_data. We pass through what we have
    and tolerate the rest being absent in older versions.
    """

    name = "winston"

    def record(
        self,
        *,
        env_id: UUID,
        business_id: UUID,
        actor: str,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        success: bool = True,
        input_data: dict | None = None,
        output_data: dict | None = None,
        latency_ms: int | None = None,
    ) -> None:
        try:
            record = getattr(audit_svc, "record_event", None)
            if record is None:
                return
            record(
                actor=actor,
                action=action,
                business_id=str(business_id),
                object_type=object_type,
                object_id=str(object_id) if object_id else None,
                success=success,
                input_data=input_data,
                output_data=output_data,
                latency_ms=latency_ms,
                env_id=str(env_id),
            )
        except Exception:
            # Audit is best-effort; never let it bubble up and break the
            # caller's primary write path. A real client implementation
            # should send to a buffered sink so failures here are isolated.
            return


default_audit_sink: AuditSinkAdapter = _WinstonAuditSink()
