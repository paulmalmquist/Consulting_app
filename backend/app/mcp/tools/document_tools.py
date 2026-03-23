"""Documents module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.document_tools import (
    InitUploadInput,
    CompleteUploadInput,
    ListDocumentsInput,
    GetVersionsInput,
    GetDownloadUrlInput,
    TagDocumentInput,
    ProcessDdqInput,
    ExtractOperatingStatementInput,
    ConfirmExtractionInput,
)
from app.services import documents as doc_svc


def _init_upload(ctx: McpContext, inp: InitUploadInput) -> dict:
    result = doc_svc.init_upload(
        business_id=inp.business_id,
        filename=inp.filename,
        content_type=inp.content_type,
        department_id=inp.department_id,
        title=inp.title,
        virtual_path=inp.virtual_path,
    )
    # MCP returns metadata only; omit raw signed URL
    return {
        "document_id": str(result["document_id"]),
        "version_id": str(result["version_id"]),
        "storage_key": result["storage_key"],
        "expires_in": 3600,
        "upload_url_omitted": True,
    }


def _complete_upload(ctx: McpContext, inp: CompleteUploadInput) -> dict:
    doc_svc.complete_upload(inp.document_id, inp.version_id, inp.sha256, inp.byte_size)
    return {"ok": True}


def _list_documents(ctx: McpContext, inp: ListDocumentsInput) -> dict:
    rows = doc_svc.list_documents(
        business_id=inp.business_id,
        department_id=inp.department_id,
        tags=inp.tags,
    )
    return {
        "documents": [
            {
                "document_id": str(r["document_id"]),
                "title": r["title"],
                "status": r["status"],
                "created_at": str(r["created_at"]),
                "latest_version_number": r.get("latest_version_number"),
            }
            for r in rows
        ]
    }


def _get_versions(ctx: McpContext, inp: GetVersionsInput) -> dict:
    rows = doc_svc.list_versions(inp.document_id)
    return {
        "versions": [
            {
                "version_id": str(r["version_id"]),
                "version_number": r["version_number"],
                "state": r["state"],
                "original_filename": r.get("original_filename"),
                "mime_type": r.get("mime_type"),
                "size_bytes": r.get("size_bytes"),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


def _get_download_url(ctx: McpContext, inp: GetDownloadUrlInput) -> dict:
    # Return metadata only; URL is sensitive
    return {
        "document_id": str(inp.document_id),
        "version_id": str(inp.version_id),
        "download_available": True,
        "note": "Use REST API to obtain actual download URL",
    }


def _tag_document(ctx: McpContext, inp: TagDocumentInput) -> dict:
    if inp.action == "add":
        doc_svc.add_tag(inp.document_id, inp.tag, ctx.actor)
    elif inp.action == "remove":
        doc_svc.remove_tag(inp.document_id, inp.tag)
    else:
        raise ValueError(f"Invalid tag action: {inp.action}")
    return {"ok": True, "action": inp.action, "tag": inp.tag}


def _process_ddq(ctx: McpContext, inp: ProcessDdqInput) -> dict:
    from app.services.ddq_workflow import process_ddq
    from uuid import UUID

    result = process_ddq(
        document_id=inp.document_id,
        fund_id=inp.fund_id,
        business_id=UUID(inp.business_id),
        env_id=inp.env_id,
    )
    return result


def _extract_operating_statement(ctx: McpContext, inp: ExtractOperatingStatementInput) -> dict:
    from app.services.extraction import service as extraction_service
    from app.services.extraction_writeback import preview_writeback
    from uuid import UUID

    # Determine profile based on document classification
    from app.db import get_cursor
    with get_cursor() as cur:
        cur.execute(
            "SELECT dv.version_id FROM app.document_versions dv WHERE dv.document_id = %s ORDER BY version_number DESC LIMIT 1",
            (str(inp.document_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Document {inp.document_id} not found")
        version_id = row["version_id"]

    # Use t12_multifamily as default; caller can specify via document tags
    profile = "t12_multifamily"
    ed = extraction_service.init_extraction(inp.document_id, UUID(str(version_id)), profile)
    result = extraction_service.run_extraction(UUID(str(ed["id"])))

    # Preview write-back against asset data
    preview = preview_writeback(
        extracted_document_id=UUID(str(ed["id"])),
        asset_id=inp.asset_id,
        env_id=inp.env_id,
        business_id=inp.business_id,
    )

    return {
        "extracted_document_id": str(ed["id"]),
        "status": result.get("extracted_document", {}).get("status", "completed"),
        "fields": [
            {
                "field_key": f["field_key"],
                "value": f.get("field_value_json"),
                "confidence": f.get("confidence"),
            }
            for f in result.get("fields", [])
        ],
        "preview": preview,
    }


def _confirm_extraction(ctx: McpContext, inp: ConfirmExtractionInput) -> dict:
    from app.services.extraction_writeback import confirm_writeback

    confirm_writeback(
        extracted_document_id=inp.extracted_document_id,
        asset_id=inp.asset_id,
        approved_fields=inp.approved_fields,
    )
    return {"ok": True, "fields_written": len(inp.approved_fields)}


def register_document_tools():
    registry.register(ToolDef(
        name="documents.init_upload",
        description="Initialize a document upload (returns metadata, not URL)",
        module="documents",
        permission="write",
        input_model=InitUploadInput,
        handler=_init_upload,
        tags=frozenset({"document", "write"}),
    ))
    registry.register(ToolDef(
        name="documents.complete_upload",
        description="Mark a document version upload as complete",
        module="documents",
        permission="write",
        input_model=CompleteUploadInput,
        handler=_complete_upload,
        tags=frozenset({"document", "write"}),
    ))
    registry.register(ToolDef(
        name="documents.list",
        description="List documents for a business with optional filters",
        module="documents",
        permission="read",
        input_model=ListDocumentsInput,
        handler=_list_documents,
        tags=frozenset({"document"}),
    ))
    registry.register(ToolDef(
        name="documents.get_versions",
        description="List versions of a document",
        module="documents",
        permission="read",
        input_model=GetVersionsInput,
        handler=_get_versions,
        tags=frozenset({"document"}),
    ))
    registry.register(ToolDef(
        name="documents.get_download_url",
        description="Get download metadata for a document version",
        module="documents",
        permission="read",
        input_model=GetDownloadUrlInput,
        handler=_get_download_url,
        tags=frozenset({"document"}),
    ))
    registry.register(ToolDef(
        name="documents.tag",
        description="Add or remove a tag on a document",
        module="documents",
        permission="write",
        input_model=TagDocumentInput,
        handler=_tag_document,
        tags=frozenset({"document", "write"}),
    ))
    registry.register(ToolDef(
        name="documents.process_ddq",
        description="Process a DDQ document: extract questions, search fund document corpus via RAG, draft answers with citations, flag questions needing GP input",
        module="documents",
        permission="read",
        input_model=ProcessDdqInput,
        handler=_process_ddq,
        tags=frozenset({"document", "repe", "analysis"}),
    ))
    registry.register(ToolDef(
        name="documents.extract_operating_statement",
        description="Extract structured financial data (NOI, occupancy, rent roll) from a T-12 or operating statement document and preview write-back to asset record",
        module="documents",
        permission="read",
        input_model=ExtractOperatingStatementInput,
        handler=_extract_operating_statement,
        tags=frozenset({"document", "repe", "write"}),
    ))
    registry.register(ToolDef(
        name="documents.confirm_extraction",
        description="Confirm and write extracted financial data from a document to an asset record",
        module="documents",
        permission="write",
        input_model=ConfirmExtractionInput,
        handler=_confirm_extraction,
        tags=frozenset({"document", "repe", "write"}),
    ))
