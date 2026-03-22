"""Resume AI Chat — SSE streaming endpoint for resume-scoped conversations.

Accepts messages, streams responses using the AI gateway with resume context.
Uses Vercel AI SDK Data Stream Protocol format.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume/v1/chat", tags=["resume-chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    env_id: str
    business_id: str


SUGGESTED_QUESTIONS = [
    "Walk me through the system architecture",
    "What data platforms has Paul deployed?",
    "Compare the Kayne Anderson and JLL deployments",
    "What's the ROI on the automation work?",
    "How does Winston's AI layer work?",
    "What would Paul build for our firm?",
]


def _sse_text(text: str) -> str:
    """Format as Vercel AI SDK text stream token."""
    return f"0:{json.dumps(text)}\n"


def _sse_data(data: dict[str, Any]) -> str:
    """Format as Vercel AI SDK data."""
    return f"2:{json.dumps([data])}\n"


# Pre-built knowledge base for common questions (deterministic, no LLM needed)
_KNOWLEDGE: dict[str, str] = {
    "architecture": (
        "## System Architecture\n\n"
        "Paul's systems follow a **5-layer architecture pattern**:\n\n"
        "1. **Data Platform** — Databricks Lakehouse, Azure Data Lake, PostgreSQL + pgvector\n"
        "2. **AI Layer** — Multi-model LLM gateway (Claude + GPT-4), RAG pipeline, 83 MCP tools\n"
        "3. **Investment Engine** — Waterfall distribution engine, fund analytics, deal pipeline intelligence\n"
        "4. **BI Layer** — Power BI semantic layer, AI dashboard composer, Recharts visualizations\n"
        "5. **Governance** — Data governance framework, audit trails, lane-based access control\n\n"
        "Each layer is independently deployable and communicates through well-defined APIs. "
        "The AI layer consumes data from both the platform and investment engine, "
        "while governance enforces policy across all layers."
    ),
    "data_platform": (
        "## Data Platform Deployments\n\n"
        "Paul has deployed data platforms across three organizations:\n\n"
        "**Kayne Anderson** ($4B+ AUM)\n"
        "- Databricks Lakehouse with Delta Lake and Unity Catalog\n"
        "- Integrated DealCloud, MRI, Yardi, and Excel sources\n"
        "- 500+ properties, 75% reduction in manual reconciliation\n\n"
        "**JLL PDS** (Enterprise)\n"
        "- Databricks with Medallion architecture (Bronze/Silver/Gold)\n"
        "- OpenAI conversational wrappers for analyst self-service\n"
        "- Standardized methodologies across 10+ client accounts\n\n"
        "**Novendor / Winston**\n"
        "- PostgreSQL + pgvector for production AI workloads\n"
        "- Sub-second vector similarity search for RAG\n"
        "- 83 MCP tool operations against structured data"
    ),
    "comparison": (
        "## Kayne Anderson vs. JLL Deployments\n\n"
        "| Dimension | Kayne Anderson | JLL PDS |\n"
        "|---|---|---|\n"
        "| **Type** | Investment Data Warehouse | AI Analytics Platform |\n"
        "| **Scale** | $4B AUM, 500+ properties | 10+ client accounts |\n"
        "| **Stack** | Databricks + Azure + Power BI | Databricks + Delta Lake + OpenAI |\n"
        "| **Key Metric** | 50% DDQ time reduction | Standardized methodologies |\n"
        "| **AI Component** | None (pure data engineering) | Conversational AI wrappers |\n"
        "| **Team** | Led offshore data engineering team | Built high-leverage team from scratch |\n\n"
        "The Kayne deployment was a **classic data warehouse modernization** — unifying fragmented sources. "
        "JLL PDS was an **AI-first analytics platform** — the evolution of Paul's approach from data engineering to AI-enabled delivery."
    ),
    "roi": (
        "## ROI on Automation Work\n\n"
        "**Quantified outcomes across deployments:**\n\n"
        "- **160+ hrs/month** of manual data entry eliminated (Kayne Anderson)\n"
        "- **80 hrs/month** of pipeline input automated (acquisition workflows)\n"
        "- **50% reduction** in DDQ response time (investor relations)\n"
        "- **75% reduction** in manual reconciliation (data governance)\n"
        "- **10-day acceleration** in quarterly reporting cycle\n"
        "- **95% error reduction** in data entry (VBA pipelines)\n"
        "- **~100x performance gain** — waterfall runs from 5 min to <3 sec\n\n"
        "**Estimated annualized value:** $500K+ in analyst time recaptured across roles, "
        "plus material risk reduction from automated data quality checks."
    ),
    "winston": (
        "## Winston AI Layer\n\n"
        "Winston's AI architecture has three core subsystems:\n\n"
        "**1. LLM Gateway**\n"
        "- Multi-model routing: Claude (complex reasoning), GPT-4 (speed-optimized), specialized models\n"
        "- Intent classification with fast-path bypass for known patterns\n"
        "- SSE streaming for real-time response delivery\n\n"
        "**2. RAG Pipeline**\n"
        "- pgvector embeddings for semantic search\n"
        "- Hybrid retrieval (semantic + keyword)\n"
        "- Domain-scoped context windows per environment\n\n"
        "**3. MCP Tool Framework**\n"
        "- 83 tools covering fund reporting, waterfall modeling, deal pipeline, documents\n"
        "- Lane-based access control (read/write/admin)\n"
        "- Full audit trail on every tool invocation\n"
        "- Structured Pydantic schemas for every tool input/output"
    ),
    "build": (
        "## What Paul Would Build for Your Firm\n\n"
        "Based on the pattern across JLL, Kayne Anderson, and Novendor, Paul would:\n\n"
        "**Phase 1 — Data Foundation** (Month 1-2)\n"
        "- Audit existing data sources and reporting workflows\n"
        "- Design governed data warehouse with Medallion architecture\n"
        "- Automate top 3 manual data pipelines by volume\n\n"
        "**Phase 2 — Intelligence Layer** (Month 2-4)\n"
        "- Build semantic layer for self-service analytics\n"
        "- Deploy AI-assisted query and reporting tools\n"
        "- Implement data governance framework\n\n"
        "**Phase 3 — AI Execution** (Month 4-6)\n"
        "- Domain-specific AI tools for your investment workflows\n"
        "- Real-time streaming dashboards and alerts\n"
        "- Full audit and compliance trail\n\n"
        "This is the same playbook that reduced DDQ response time by 50% at Kayne "
        "and standardized reporting across 10+ accounts at JLL."
    ),
}


def _match_knowledge(question: str) -> str | None:
    """Match a question to pre-built knowledge."""
    q = question.lower()
    if any(w in q for w in ["architecture", "system", "layers", "walk me through"]):
        return _KNOWLEDGE["architecture"]
    if any(w in q for w in ["data platform", "databricks", "azure", "deployed"]):
        return _KNOWLEDGE["data_platform"]
    if any(w in q for w in ["compare", "kayne", "jll", "vs"]):
        return _KNOWLEDGE["comparison"]
    if any(w in q for w in ["roi", "automation", "hours", "saved", "return"]):
        return _KNOWLEDGE["roi"]
    if any(w in q for w in ["winston", "ai layer", "mcp", "rag", "llm"]):
        return _KNOWLEDGE["winston"]
    if any(w in q for w in ["build", "our firm", "hire", "would"]):
        return _KNOWLEDGE["build"]
    return None


async def _stream_chat(req: ChatRequest):
    """Generator that yields SSE events for the chat response."""
    user_message = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_message = msg.content
            break

    if not user_message:
        yield _sse_text("Ask me anything about Paul's systems, architecture, or deployment history.")
        return

    # Try deterministic knowledge match first
    knowledge = _match_knowledge(user_message)
    if knowledge:
        yield _sse_text(knowledge)
        return

    # Fallback: general response
    yield _sse_text(
        "I can answer questions about Paul's **system architecture**, **data platforms**, "
        "**deployment history**, **ROI metrics**, and **what he'd build for your firm**.\n\n"
        "Try asking:\n"
        "- \"Walk me through the system architecture\"\n"
        "- \"What's the ROI on the automation work?\"\n"
        "- \"Compare the Kayne Anderson and JLL deployments\"\n"
        "- \"How does Winston's AI layer work?\""
    )


@router.post("")
async def chat(request: Request, req: ChatRequest):
    """SSE streaming chat endpoint for resume AI conversations."""
    return StreamingResponse(
        _stream_chat(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/suggestions")
def chat_suggestions():
    """Return suggested starter questions."""
    return {"suggestions": SUGGESTED_QUESTIONS}
