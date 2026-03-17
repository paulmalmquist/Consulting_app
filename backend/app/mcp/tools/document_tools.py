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
