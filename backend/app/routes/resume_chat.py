"""Resume AI Chat — SSE streaming endpoint for resume-scoped conversations.

Public endpoint — no authentication required.
Mode: public_resume (enforced server-side).
Rate limit: 10 requests/minute per IP (token bucket).
Persona: advocate, persuasive, no citations.
LLM-powered via Claude with deterministic fallback.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.config import RESUME_LLM_ENABLED
from app.services.resume_llm import classify_resume_intent, stream_resume_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume/v1/chat", tags=["resume-chat"])


# ---------------------------------------------------------------------------
# Per-IP rate limiting (token bucket, 10 RPM)
# ---------------------------------------------------------------------------

@dataclass
class _Bucket:
    capacity: int = 10
    tokens: float = 10.0
    refill_rate: float = 10 / 60.0  # tokens per second
    last_refill: float = field(default_factory=time.monotonic)

    def consume(self) -> float | None:
        """Consume one token. Returns retry_after seconds if exhausted, else None."""
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now
        if self.tokens < 1:
            return (1 - self.tokens) / self.refill_rate
        self.tokens -= 1
        return None


_ip_buckets: dict[str, _Bucket] = {}


def _check_rate_limit(request: Request) -> float | None:
    """Return retry_after seconds if rate-limited, else None."""
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    bucket = _ip_buckets.setdefault(ip, _Bucket())
    return bucket.consume()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    mode: Literal["public_resume"] = "public_resume"
    scope: Literal["paul"] = "paul"
    user: Literal["public"] = "public"


SUGGESTED_QUESTIONS = [
    "Why is Paul a strong AI/data leader?",
    "Compare JLL vs Kayne Anderson",
    "What has Paul built end-to-end?",
    "Should I hire Paul?",
]


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse_text(text: str) -> str:
    """Format as Vercel AI SDK text stream token."""
    return f"0:{json.dumps(text)}\n"


def _sse_data(data: dict[str, Any]) -> str:
    """Format as Vercel AI SDK data."""
    return f"2:{json.dumps([data])}\n"


# ---------------------------------------------------------------------------
# Persona enforcement — strip citations, ensure advocate framing
# ---------------------------------------------------------------------------

_CITATION_PATTERN = re.compile(
    r"\[\d+\]"           # [1], [2], ...
    r"|\(source:[^)]*\)" # (source: ...)
    r"|\^(\d+)"          # ^1
    r"|\bfootnote\b",    # literal "footnote"
    re.IGNORECASE,
)


def _format_public_resume_response(text: str) -> str:
    """Strip citation markers. Knowledge entries are pre-written in advocate tone."""
    return _CITATION_PATTERN.sub("", text).strip()


# ---------------------------------------------------------------------------
# Pre-built knowledge base (deterministic — no LLM)
# ---------------------------------------------------------------------------

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
        "Paul has deployed production data platforms across three organizations:\n\n"
        "**Kayne Anderson** ($4B+ AUM) — joined 2018\n"
        "- Databricks Lakehouse with Delta Lake and Unity Catalog\n"
        "- Integrated DealCloud, MRI, Yardi, and Excel sources\n"
        "- 500+ properties, 75% reduction in manual reconciliation\n\n"
        "**JLL PDS** (Enterprise) — joined 2023\n"
        "- Databricks with Medallion architecture (Bronze/Silver/Gold)\n"
        "- OpenAI conversational wrappers for analyst self-service\n"
        "- Standardized methodologies across 10+ client accounts\n\n"
        "**Novendor / Winston** — 2024–present\n"
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
    "hire": (
        "## Why Hire Paul\n\n"
        "Paul is a rare combination of deep technical execution and strategic architecture. "
        "He ships production AI and data systems — not prototypes — at $4B+ AUM scale.\n\n"
        "- Built and owns a full-stack AI platform (Winston) from scratch, including LLM gateway, "
        "RAG pipeline, 83 MCP tools, and a real-time SSE streaming layer\n"
        "- Reduced reporting cycles by 10 days and automated 160+ hrs/month of analyst work at Kayne Anderson\n"
        "- Led offshore data engineering teams and built high-leverage analytics orgs from zero at JLL\n"
        "- Designs for governance and auditability first — every tool invocation is audited, "
        "every data contract is explicit\n"
        "- 11 years of compounding investment data systems: from BI service lines to AI-powered fund analytics\n\n"
        "If your firm needs someone who can build an AI data platform that actually runs in production, "
        "Paul has done exactly that — twice — at firms with real AUM on the line."
    ),
}


def _match_knowledge(question: str) -> str | None:
    """Match a question to pre-built knowledge. Returns None if no match."""
    q = question.lower()
    if any(w in q for w in ["architecture", "system", "layers", "walk me through"]):
        return _KNOWLEDGE["architecture"]
    if any(w in q for w in ["data platform", "databricks", "azure", "deployed", "when did", "start at", "kayne", "career", "timeline"]):
        return _KNOWLEDGE["data_platform"]
    if any(w in q for w in ["compare", "jll", "vs", "versus", "difference"]):
        return _KNOWLEDGE["comparison"]
    if any(w in q for w in ["roi", "automation", "hours", "saved", "return", "impact", "results"]):
        return _KNOWLEDGE["roi"]
    if any(w in q for w in ["winston", "ai layer", "mcp", "rag", "llm", "how does"]):
        return _KNOWLEDGE["winston"]
    if any(w in q for w in ["should i hire", "hire paul", "why hire", "recommend", "good fit", "right person"]):
        return _KNOWLEDGE["hire"]
    if any(w in q for w in ["build", "our firm", "would paul", "what would"]):
        return _KNOWLEDGE["build"]
    return None


# ---------------------------------------------------------------------------
# Stream generator
# ---------------------------------------------------------------------------

async def _stream_chat(req: ChatRequest):
    """Generator that yields SSE events for the chat response.

    Uses LLM streaming when RESUME_LLM_ENABLED and an API key is set.
    Falls back to deterministic knowledge base otherwise.
    """
    user_message = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_message = msg.content
            break

    if not user_message:
        yield _sse_text("I'm Winston — ask me anything about Paul's background, systems, or hiring fit.")
        return

    # Classify intent (always — used for both LLM and fallback paths)
    intent = classify_resume_intent(user_message)

    # LLM path — streaming Claude/OpenAI with full resume context
    if RESUME_LLM_ENABLED:
        history = [{"role": m.role, "content": m.content} for m in req.messages]
        try:
            async for token in stream_resume_response(history, intent):
                yield _sse_text(token)
            return
        except Exception:
            logger.exception("LLM streaming failed, falling back to deterministic")

    # Deterministic fallback — regex → pre-built knowledge
    knowledge = _match_knowledge(user_message)
    if knowledge:
        yield _sse_text(_format_public_resume_response(knowledge))
        return

    yield _sse_text(
        "I focus on Paul's background and capabilities — try asking about his systems, "
        "experience, or hiring fit."
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("")
async def chat(request: Request, req: ChatRequest):
    """SSE streaming chat endpoint for public resume conversations."""
    retry_after = _check_rate_limit(request)
    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded"},
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

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
