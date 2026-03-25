"""RAG semantic search MCP tool — exposes vector search to the AI Gateway."""
from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, AuditPolicy, registry
from app.services.rag_indexer import semantic_search


class RagSearchInput(BaseModel):
    query: str = Field(description="Natural language search query")
    business_id: UUID = Field(description="Business scope for multi-tenant isolation")
    env_id: UUID | None = Field(default=None, description="Optional environment filter")
    entity_type: str | None = Field(
        default=None, description="Entity type filter: fund | asset | investment | pds_project"
    )
    entity_id: UUID | None = Field(default=None, description="Specific entity filter")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to return")


def _rag_search(ctx: McpContext, inp: RagSearchInput) -> dict:
    chunks = semantic_search(
        query=inp.query,
        business_id=inp.business_id,
        env_id=inp.env_id,
        entity_type=inp.entity_type,
        entity_id=inp.entity_id,
        top_k=inp.top_k,
    )
    return {
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "document_id": c.document_id,
                "score": round(c.score, 4),
                "text": c.chunk_text[:800],
                "chunk_index": c.chunk_index,
                "section_heading": c.section_heading,
                "section_path": c.section_path,
            }
            for c in chunks
        ],
        "total": len(chunks),
    }


def register_rag_tools() -> None:
    registry.register(
        ToolDef(
            name="rag.search",
            description=(
                "Semantic search over indexed documents using vector similarity. "
                "Returns the most relevant document chunks for a natural language query. "
                "Use this to answer questions about uploaded fund documents, IC memos, "
                "operating agreements, or underwriting models."
            ),
            module="rag",
            permission="read",
            input_model=RagSearchInput,
            audit_policy=AuditPolicy(
                redact_keys=[],
                max_input_bytes_to_log=5000,
                max_output_bytes_to_log=10000,
            ),
            handler=_rag_search,
            tags=frozenset({"document"}),
        )
    )
