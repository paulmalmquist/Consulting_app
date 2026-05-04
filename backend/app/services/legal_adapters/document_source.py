"""DocumentSourceAdapter — where contract text and metadata come from.

Default backing: ``app.documents`` + ``app.extracted_field`` populated by
the Winston extraction pipeline. Client fork replaces with SharePoint,
iManage, Box, Google Drive, NetDocuments, Notion, S3, etc.

The First-Pass Contract Review service requires a real text body and
substring-validates every cited evidence quote. If extraction is incomplete,
this adapter must return ``None`` (or a partial doc with ``extraction_confidence``
set) so Winston can fail closed instead of fabricating an evidence quote.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from app.db import get_cursor


@dataclass
class DocumentRef:
    document_id: UUID
    title: str | None = None
    filename: str | None = None
    content_type: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class ExtractedDocument:
    document_id: UUID
    text: str
    pages: int | None = None
    sections: list[str] = field(default_factory=list)
    extraction_confidence: float | None = None
    metadata: dict = field(default_factory=dict)


class DocumentSourceAdapter(Protocol):
    def get_extracted_text(
        self, *, env_id: UUID, business_id: UUID, document_id: UUID
    ) -> ExtractedDocument | None:
        ...

    def list_documents_for_matter(
        self, *, env_id: UUID, business_id: UUID, matter_id: UUID
    ) -> list[DocumentRef]:
        ...


class _WinstonDocumentSource:
    """Default impl: reads from app.documents + app.extracted_field via the
    Winston extraction pipeline. Future phases will populate `extraction_confidence`
    from the extraction metadata; for now Phase 1 ships only the list path,
    which is what the KB / matter-detail UI needs.
    """

    name = "winston"

    def get_extracted_text(
        self, *, env_id: UUID, business_id: UUID, document_id: UUID
    ) -> ExtractedDocument | None:
        # Phase 3 will wire this to app.extracted_field. Intentionally minimal
        # here so Phase 1 ships without depending on the extraction pipeline.
        return None

    def list_documents_for_matter(
        self, *, env_id: UUID, business_id: UUID, matter_id: UUID
    ) -> list[DocumentRef]:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT d.document_id, d.title, d.filename, d.content_type, d.metadata_json
                FROM app.document_entity_links l
                JOIN app.documents d ON d.document_id = l.document_id
                WHERE l.env_id = %s::uuid
                  AND l.entity_type = 'legal_matter'
                  AND l.entity_id = %s::uuid
                """,
                (str(env_id), str(matter_id)),
            )
            rows = cur.fetchall() or []
        return [
            DocumentRef(
                document_id=row["document_id"],
                title=row.get("title"),
                filename=row.get("filename"),
                content_type=row.get("content_type"),
                metadata=row.get("metadata_json") or {},
            )
            for row in rows
        ]


default_document_source: DocumentSourceAdapter = _WinstonDocumentSource()
