"""ApproverRegistryAdapter — resolves who is authorized to approve what.

Default backing: ``legal_approver_registry`` table seeded with role-based
entries. Client fork swaps to Okta / Active Directory / Workday / native
authz / ABAC engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from app.db import get_cursor


@dataclass
class ApproverIdentity:
    role_label: str
    person_name: str | None = None
    contact: str | None = None
    scope: dict = field(default_factory=dict)


class ApproverRegistryAdapter(Protocol):
    def resolve_approver(
        self, *, env_id: UUID, business_id: UUID, role_label: str
    ) -> ApproverIdentity | None:
        ...

    def lookup_signature_authority(
        self, *, env_id: UUID, business_id: UUID, person: str, action: str
    ) -> bool:
        ...


class _WinstonApproverRegistry:
    """Default impl: reads the seeded legal_approver_registry table.

    A real client implementation reads Okta groups / AD memberships / Workday
    roles. The Attorney Workbench calls ``lookup_signature_authority`` before
    recording any disposition; a False answer surfaces as
    'Not authorized for this action — escalate to GC' and prevents the write.
    """

    name = "winston"

    def resolve_approver(
        self, *, env_id: UUID, business_id: UUID, role_label: str
    ) -> ApproverIdentity | None:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT role_label, person_name, contact, scope_json
                FROM legal_approver_registry
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND role_label = %s
                LIMIT 1
                """,
                (str(env_id), str(business_id), role_label),
            )
            row = cur.fetchone()
        if not row:
            return None
        return ApproverIdentity(
            role_label=row["role_label"],
            person_name=row.get("person_name"),
            contact=row.get("contact"),
            scope=row.get("scope_json") or {},
        )

    def lookup_signature_authority(
        self, *, env_id: UUID, business_id: UUID, person: str, action: str
    ) -> bool:
        # Phase 1 default: any registered approver is authorized for any
        # disposition action. Phase 5 (Attorney Workbench) will tighten this
        # by reading scope_json for action-specific rules.
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM legal_approver_registry
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                  AND (person_name = %s OR contact = %s OR role_label = %s)
                LIMIT 1
                """,
                (str(env_id), str(business_id), person, person, person),
            )
            return cur.fetchone() is not None


default_approver_registry: ApproverRegistryAdapter = _WinstonApproverRegistry()
