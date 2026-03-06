"""AI Gateway service — OpenAI Chat Completions with streaming tool calls + RAG.

Demonstrates:
  - OpenAI API integration (streaming Chat Completions)
  - Tool calling loop (multi-round, up to AI_MAX_TOOL_ROUNDS)
  - MCP tool dispatch via existing execute_tool() audit wrapper
  - Domain-aware system prompt (RE investment context)
  - SSE event emission for real-time streaming
"""
from __future__ import annotations

import json
import time
import uuid
from typing import AsyncGenerator, Any

from app.config import (
    OPENAI_API_KEY,
    OPENAI_CHAT_MODEL,
    AI_MAX_TOOL_ROUNDS,
    RAG_TOP_K,
)
from app.mcp.registry import registry
from app.mcp.auth import McpContext
from app.mcp.audit import execute_tool
from app.services import audit as audit_svc
from app.services.rag_indexer import semantic_search, RetrievedChunk

# ── System prompt ────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are Winston, an AI analyst embedded in an institutional real estate private equity platform.

## Absolute Rule
NEVER ask the user for data you can look up. You are connected to a live portfolio database with
full access to all funds, assets, deals, metrics, and documents for this business. If the user
references a fund, asset, or entity — call the appropriate tool first. Ask questions ONLY if the
lookup returns nothing or the query is genuinely ambiguous.

## Knowledge Authority
Prefer sources in this order:
1. Retrieved document context (cite chunk_id when available)
2. Structured portfolio data via tools (repe.list_funds, repe.get_fund, repe.get_asset, etc.)
3. General domain knowledge
Never fabricate fund names, cap rates, IRRs, or entity-level figures. If data is unavailable, say so.

## Reasoning Modes
Classify the query before responding:
- LOOKUP: entity attribute, single metric → answer directly, one sentence + source
- SYNTHESIS: compare funds/assets, summarize period → structured response with data table
- ANALYSIS: scenario, stress test, what-if → show assumptions, step-by-step, caveats
- EXECUTION: create, update, run → confirm parameters before acting via write tools

## Available Tools
- repe.list_funds: List all funds for the business (use for "our funds", "portfolio overview")
- repe.get_fund: Get fund details + terms (management fee, carry, waterfall)
- repe.list_deals: List deals/investments in a fund
- repe.list_assets: List assets under a deal
- repe.get_asset: Get asset details (NOI, occupancy, cap rate, units, market)
- rag.search: Semantic search over indexed documents (IC memos, operating agreements)
- metrics.query: Query computed metrics by key and dimension
- models.list / scenarios.*: Cross-fund scenario modeling tools

## Domain Knowledge
- TVPI = (distributions + NAV) / paid-in capital
- IRR = internal rate of return on cash flows
- DPI = distributions / paid-in, RVPI = residual value / paid-in
- DSCR = NOI / debt service, Cap Rate = NOI / property value
- NOI = revenue - operating expenses (excludes debt service)
- Waterfall: preferred return → catch-up → carried interest split

## Format Guidelines
- Use tables for multi-entity comparisons (>2 data points)
- Use bullet points for single-entity summaries
- Format numbers clearly: percentages with 1 decimal, multiples with 2 decimals
- State data freshness: "as of Q1 2026" or "per the IC memo dated..."
- Write-tools require explicit user approval (confirm=true)
- When citing documents, include the chunk_id for traceability
"""


def _sanitize_tool_name(name: str) -> str:
    """OpenAI requires tool names matching ^[a-zA-Z0-9_-]+$. Replace dots."""
    return name.replace(".", "__")


def _build_openai_tools() -> tuple[list[dict], dict[str, str]]:
    """Convert MCP ToolDef registry → OpenAI function tool schemas.

    Returns (tools_list, name_map) where name_map maps sanitized→original names.
    Skips codex tools (being removed) and tools without handlers.
    """
    tools = []
    name_map: dict[str, str] = {}  # sanitized_name → original_name
    for tool_def in registry.list_all():
        if tool_def.name.startswith("codex."):
            continue
        if tool_def.handler is None:
            continue
        schema = tool_def.input_schema
        # Clean up Pydantic-generated schema for OpenAI
        clean_schema = {
            k: v
            for k, v in schema.items()
            if k not in ("$schema", "title")
        }
        safe_name = _sanitize_tool_name(tool_def.name)
        name_map[safe_name] = tool_def.name
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": safe_name,
                    "description": tool_def.description,
                    "parameters": clean_schema,
                },
            }
        )
    return tools, name_map


async def run_gateway_stream(
    *,
    message: str,
    session_id: str | None = None,
    env_id: uuid.UUID | None = None,
    business_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor: str = "anonymous",
) -> AsyncGenerator[str, None]:
    """Main streaming generator. Yields SSE-formatted strings.

    SSE event types emitted:
      - token          {"text": "..."}
      - citation       {"chunk_id": ..., "doc_id": ..., "score": ..., "snippet": ...}
      - tool_call      {"tool_name": ..., "args": ..., "result_preview": ...}
      - done           {"session_id": ..., "total_tokens": ..., "tool_calls": N}
      - error          {"message": "..."}
    """
    if not OPENAI_API_KEY:
        yield _sse("error", {"message": "OPENAI_API_KEY not configured"})
        return

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    start = time.time()
    session_id = session_id or str(uuid.uuid4())

    # ── Step 0: Portfolio snapshot ────────────────────────────────────
    portfolio_context = ""
    if business_id:
        try:
            from app.services.repe import list_funds
            funds = list_funds(business_id=business_id)
            if funds:
                lines = []
                for f in funds:
                    size = f.get("target_size")
                    size_str = f"${int(size / 1_000_000)}M" if size else "N/A"
                    lines.append(
                        f"- {f['name']} (fund_id={f['fund_id']}) | "
                        f"vintage {f.get('vintage_year', '?')} | "
                        f"{f.get('strategy', '?')} | {f.get('status', '?')} | {size_str}"
                    )
                portfolio_context = (
                    "\n\nPORTFOLIO SNAPSHOT (current funds for this business):\n"
                    + "\n".join(lines)
                    + "\n\nUse the fund_id values above when calling repe.get_fund or repe.list_deals.\n"
                )
        except Exception:
            pass  # Non-fatal; tools can still look up data on demand

    # ── Step 1: RAG retrieval ────────────────────────────────────────
    rag_chunks: list[RetrievedChunk] = []
    if business_id:
        try:
            rag_chunks = semantic_search(
                query=message,
                business_id=business_id,
                env_id=env_id,
                entity_type=entity_type,
                entity_id=entity_id,
                top_k=RAG_TOP_K,
            )
            for chunk in rag_chunks:
                yield _sse(
                    "citation",
                    {
                        "chunk_id": chunk.chunk_id,
                        "doc_id": chunk.document_id,
                        "score": round(chunk.score, 4),
                        "snippet": chunk.chunk_text[:300],
                        "section_heading": chunk.section_heading,
                        "section_path": chunk.section_path,
                    },
                )
        except Exception as rag_err:
            yield _sse(
                "citation",
                {"message": f"RAG unavailable: {str(rag_err)[:100]}"},
            )

    # ── Step 2: Build messages with RAG context ──────────────────────
    rag_context = ""
    if rag_chunks:
        rag_context = "\n\nRELEVANT DOCUMENT CONTEXT:\n"
        for i, chunk in enumerate(rag_chunks, 1):
            heading = f", section={chunk.section_heading}" if chunk.section_heading else ""
            rag_context += (
                f"\n[Doc {i}, chunk_id={chunk.chunk_id}, "
                f"score={chunk.score:.3f}{heading}]\n{chunk.chunk_text[:800]}\n"
            )

    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT + portfolio_context + rag_context},
        {"role": "user", "content": message},
    ]

    openai_tools, tool_name_map = _build_openai_tools()
    ctx = McpContext(actor=actor, token_valid=True)

    # ── Step 3: Tool-calling loop ────────────────────────────────────
    total_prompt_tokens = 0
    total_completion_tokens = 0
    tool_call_count = 0
    tool_calls_log: list[dict] = []

    for round_num in range(AI_MAX_TOOL_ROUNDS + 1):
        stream_kwargs: dict[str, Any] = {
            "model": OPENAI_CHAT_MODEL,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": 0.2,
            "max_tokens": 2048,
        }
        if openai_tools:
            stream_kwargs["tools"] = openai_tools
            stream_kwargs["tool_choice"] = "auto"

        collected_content = ""
        collected_tool_calls: dict[int, dict] = {}

        async for chunk in await client.chat.completions.create(**stream_kwargs):
            if not chunk.choices and chunk.usage:
                total_prompt_tokens += chunk.usage.prompt_tokens or 0
                total_completion_tokens += chunk.usage.completion_tokens or 0
                continue

            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta

            # Text content delta
            if delta.content:
                collected_content += delta.content
                yield _sse("token", {"text": delta.content})

            # Tool call deltas (accumulate across chunks)
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in collected_tool_calls:
                        collected_tool_calls[idx] = {
                            "id": tc.id or "",
                            "name": "",
                            "args": "",
                        }
                    if tc.id:
                        collected_tool_calls[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            collected_tool_calls[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            collected_tool_calls[idx]["args"] += tc.function.arguments

        # If no tool calls, we are done
        if not collected_tool_calls:
            break

        if round_num >= AI_MAX_TOOL_ROUNDS:
            yield _sse(
                "error",
                {"message": f"Max tool rounds ({AI_MAX_TOOL_ROUNDS}) reached"},
            )
            break

        # Add assistant message with tool calls to conversation
        assistant_msg: dict[str, Any] = {
            "role": "assistant",
            "content": collected_content or None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["args"]},
                }
                for tc in collected_tool_calls.values()
            ],
        }
        messages.append(assistant_msg)

        # ── Execute each tool call ───────────────────────────────────
        for tc in collected_tool_calls.values():
            sanitized_name = tc["name"]
            tool_name = tool_name_map.get(sanitized_name, sanitized_name)
            tool_def = registry.get(tool_name)

            if not tool_def:
                tool_result = {"error": f"Unknown tool: {tool_name}"}
            else:
                try:
                    raw_args = json.loads(tc["args"]) if tc["args"] else {}
                    tool_result = execute_tool(tool_def, ctx, raw_args)
                    tool_call_count += 1
                    tool_calls_log.append(
                        {"name": tool_name, "success": True}
                    )
                except Exception as tool_err:
                    tool_result = {"error": str(tool_err)[:500]}
                    tool_calls_log.append(
                        {
                            "name": tool_name,
                            "success": False,
                            "error": str(tool_err)[:200],
                        }
                    )

            yield _sse(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "args": json.loads(tc["args"]) if tc["args"] else {},
                    "result_preview": str(tool_result)[:200],
                },
            )

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(tool_result, default=str),
                }
            )

    # ── Step 4: Persist audit record ────────────────────────────────
    elapsed_ms = int((time.time() - start) * 1000)
    try:
        audit_svc.record_event(
            actor=actor,
            action="ai.gateway.ask",
            tool_name="ai_gateway",
            success=True,
            latency_ms=elapsed_ms,
            business_id=business_id,
            input_data={"message": message[:500], "session_id": session_id},
            output_data={
                "tool_calls": tool_call_count,
                "rag_chunks": len(rag_chunks),
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
            },
        )
    except Exception:
        pass  # Audit failure should not fail the user-facing response

    yield _sse(
        "done",
        {
            "session_id": session_id,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "tool_calls": tool_call_count,
            "elapsed_ms": elapsed_ms,
        },
    )


def _sse(event: str, data: dict) -> str:
    """Format a single SSE frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
