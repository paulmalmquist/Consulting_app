"""IntakeSourceAdapter — where structured legal requests come from.

Default backing: the ``legal_intake_requests`` table populated by the Winston
web form. A client fork replaces this with Jira / ServiceNow / Slack / Outlook
/ Workday / native ITSM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from app.db import get_cursor


@dataclass
class IntakeItem:
    intake_id: UUID
    request_text: str
    requestor: str | None = None
    urgency_input: str | None = None
    source_external_id: str | None = None
    metadata: dict = field(default_factory=dict)


class IntakeSourceAdapter(Protocol):
    def fetch_pending(
        self, *, env_id: UUID, business_id: UUID, limit: int = 50
    ) -> list[IntakeItem]:
        ...

    def acknowledge(
        self, *, env_id: UUID, business_id: UUID, source_external_id: str, intake_id: UUID
    ) -> None:
        ...


class _WinstonIntakeSource:
    """Default impl: reads pending intakes from legal_intake_requests."""

    name = "winston"

    def fetch_pending(
        self, *, env_id: UUID, business_id: UUID, limit: int = 50
    ) -> list[IntakeItem]:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT intake_id, request_text, requestor, urgency_input,
                       source_external_id, metadata_json
                FROM legal_intake_requests
                WHERE env_id = %s::uuid
                  AND business_id = %s::uuid
                  AND classification_status = 'pending'
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (str(env_id), str(business_id), int(limit)),
            )
            rows = cur.fetchall() or []
        return [
            IntakeItem(
                intake_id=row["intake_id"],
                request_text=row["request_text"],
                requestor=row.get("requestor"),
                urgency_input=row.get("urgency_input"),
                source_external_id=row.get("source_external_id"),
                metadata=row.get("metadata_json") or {},
            )
            for row in rows
        ]

    def acknowledge(
        self, *, env_id: UUID, business_id: UUID, source_external_id: str, intake_id: UUID
    ) -> None:
        # Default impl is a no-op — the same row is updated in-place by the
        # Winston intake service when classification completes. Real
        # implementations (Jira, ServiceNow) would post status back to the
        # source ticket here.
        return None


default_intake_source: IntakeSourceAdapter = _WinstonIntakeSource()
