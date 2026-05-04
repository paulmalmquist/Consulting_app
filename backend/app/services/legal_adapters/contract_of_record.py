"""ContractOfRecordAdapter — system of record for executed contracts.

Default backing: ``legal_contracts`` and the matter tables in
275_legal_ops_core.sql. Client fork swaps to Ironclad, DocuSign CLM,
SpotDraft, Agiloft, or a native repo.

The Outside Counsel Packet Builder reads contract metadata through this
adapter when assembling the prior-internal-position section.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol
from uuid import UUID

from app.db import get_cursor


@dataclass
class ContractRecord:
    contract_id: UUID
    contract_ref: str
    contract_type: str
    counterparty_name: str | None = None
    effective_date: date | None = None
    expiration_date: date | None = None
    governing_law: str | None = None
    status: str | None = None
    matter_id: UUID | None = None
    metadata: dict = field(default_factory=dict)


class ContractOfRecordAdapter(Protocol):
    def get_contract(
        self, *, env_id: UUID, business_id: UUID, contract_id: UUID
    ) -> ContractRecord | None:
        ...

    def list_contracts_for_matter(
        self, *, env_id: UUID, business_id: UUID, matter_id: UUID
    ) -> list[ContractRecord]:
        ...


class _WinstonContractOfRecord:
    """Default impl: reads legal_contracts."""

    name = "winston"

    def _row(self, row: dict) -> ContractRecord:
        return ContractRecord(
            contract_id=row["legal_contract_id"],
            contract_ref=row["contract_ref"],
            contract_type=row["contract_type"],
            counterparty_name=row.get("counterparty_name"),
            effective_date=row.get("effective_date"),
            expiration_date=row.get("expiration_date"),
            governing_law=row.get("governing_law"),
            status=row.get("status"),
            matter_id=row.get("matter_id"),
            metadata=row.get("metadata_json") or {},
        )

    def get_contract(
        self, *, env_id: UUID, business_id: UUID, contract_id: UUID
    ) -> ContractRecord | None:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM legal_contracts
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND legal_contract_id = %s::uuid
                LIMIT 1
                """,
                (str(env_id), str(business_id), str(contract_id)),
            )
            row = cur.fetchone()
        return self._row(row) if row else None

    def list_contracts_for_matter(
        self, *, env_id: UUID, business_id: UUID, matter_id: UUID
    ) -> list[ContractRecord]:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM legal_contracts
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND matter_id = %s::uuid
                ORDER BY created_at DESC
                """,
                (str(env_id), str(business_id), str(matter_id)),
            )
            rows = cur.fetchall() or []
        return [self._row(row) for row in rows]


default_contract_of_record: ContractOfRecordAdapter = _WinstonContractOfRecord()
