"""AI Gateway service — OpenAI Chat Completions with streaming tool calls + RAG."""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid
from typing import Any, AsyncGenerator

from app.config import AI_MAX_TOOL_ROUNDS, ENABLE_QUERY_EXPANSION, OPENAI_API_KEY, OPENAI_CHAT_MODEL, OPENAI_CHAT_MODEL_FALLBACK, RAG_CACHE_TTL_SECONDS, RAG_MIN_SCORE, RAG_OVERFETCH, RAG_RERANK_METHOD, RAG_TOP_K
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import registry
from app.observability.logger import emit_log
from app.services import langfuse_client
from app.observability.request_context import get_request_context, set_request_context
from app.schemas.ai_gateway import AssistantContextEnvelope
from app.services import audit as audit_svc
from app.services.assistant_scope import (
    build_context_block,
    ensure_context_envelope,
    resolve_assistant_scope,
    resolve_visible_context_policy,
)
from app.services.repe_intent import classify_repe_intent
from app.services.run_narrator import CLEAN_ERROR_MESSAGE, RunNarrator
from app.services.failure_modes import get_tool_failure_message
from app.services.repe_scenario_schema import build_clarification_question, resolve_scenario_params
from app.services.repe_session import get_session, summarize_waterfall_run, update_session
from app.services.cost_tracker import estimate_cost
from app.services.rag_indexer import RetrievedChunk, semantic_search
from app.services.rag_reranker import rerank_chunks
from app.services.model_registry import get_caps, map_openai_error, sanitize_params
from app.services.request_router import RouteDecision, classify_request
from app.services.assistant_blocks import (
    citations_block,
    confirmation_block,
    error_block,
    legacy_structured_result_to_blocks,
    markdown_block,
)
from app.services.prompt_composer import compose_prompt, PromptAudit

# ── Singleton OpenAI client (reuse HTTP connection pool) ──────────
import openai as _openai_mod

_openai_client: _openai_mod.AsyncOpenAI | None = None


def _get_openai_client() -> _openai_mod.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = _openai_mod.AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


# ── Workflow-aware routing override ──────────────────────────────────
# Confirmation keywords that indicate the user is responding to a pending action
_CONFIRM_KEYWORDS = re.compile(
    r"^(yes|yep|yeah|yup|sure|ok|okay|go ahead|proceed|do it|confirmed?|"
    r"that'?s? (?:right|correct)|looks? good|sounds? good|approve|let'?s? go|execute|make it so)[\.\!\s]*$",
    re.IGNORECASE,
)
_CANCEL_KEYWORDS = re.compile(
    r"^(no|nope|cancel|never ?mind|stop|don'?t|abort|scratch that)[\.\!\s]*$",
    re.IGNORECASE,
)


def _check_pending_workflow(conversation_id: str | None) -> dict | None:
    """Check if conversation has a pending confirmation or slot-fill workflow.

    Returns dict with workflow context if active, None otherwise.
    Lightweight: only reads the last 4 messages.
    """
    if not conversation_id:
        return None
    try:
        from app.services import ai_conversations as convo_svc
        history = convo_svc.get_messages(conversation_id=conversation_id)
        # Check last few assistant messages for pending workflow signals
        recent_assistant = [m for m in history if m["role"] == "assistant"][-3:]
        for msg in reversed(recent_assistant):
            content = msg.get("content") or ""
            tool_calls = msg.get("tool_calls")
            # Check for explicit PENDING CONFIRMATION annotation
            if "PENDING CONFIRMATION" in content:
                return {"type": "pending_confirmation", "content": content, "tool_calls": tool_calls}
            # Check for text-only confirmation request
            if "confirmation request with no tool call" in content:
                return {"type": "text_confirmation", "content": content}
            # Check tool_calls for confirmed=false (needs_input / pending)
            # OR validation-failed tool calls that need more user input
            if tool_calls:
                tcs = tool_calls if isinstance(tool_calls, list) else json.loads(tool_calls) if isinstance(tool_calls, str) else None
                if tcs:
                    for tc in tcs:
                        args = tc.get("args", {})
                        if args.get("confirmed") is False and tc.get("success"):
                            return {"type": "pending_confirmation", "content": content, "tool_calls": tcs}
                        # Validation errors (missing required fields) = pending slot-fill
                        if not tc.get("success") and tc.get("error") and "required" in str(tc.get("error", "")).lower():
                            return {"type": "pending_slot_fill", "content": content, "tool_calls": tcs}
        return None
    except Exception:
        return None


def _override_route_for_workflow(
    route: RouteDecision,
    workflow: dict | None,
    message: str,
) -> RouteDecision:
    """Override route to preserve tool access during active workflows.

    If a workflow is active and the current route would strip tools (Lane A),
    upgrade to a route that has tools enabled.
    """
    if not workflow:
        return route

    # If route already has tools, just expand history window for workflow context
    if not route.skip_tools:
        if route.history_max_tokens < 2000:
            return RouteDecision(
                lane=route.lane, skip_rag=route.skip_rag, skip_tools=False,
                max_tool_rounds=max(route.max_tool_rounds, 2),
                max_tokens=route.max_tokens, temperature=route.temperature,
                is_write=route.is_write, model=route.model,
                rag_top_k=route.rag_top_k, rag_max_tokens=route.rag_max_tokens,
                history_max_tokens=2000,  # ensure enough for workflow context
                use_rerank=route.use_rerank, use_hybrid=route.use_hybrid,
                reasoning_effort=route.reasoning_effort,
            )
        return route

    # Route has skip_tools=True (Lane A) but there's an active workflow.
    # Override to Lane C write route so tools are available for confirmation.
    return RouteDecision(
        lane="C",
        skip_rag=True,  # confirmation doesn't need RAG
        skip_tools=False,
        max_tool_rounds=3,
        max_tokens=1024,
        temperature=0.2,
        is_write=True,
        model=route.model or OPENAI_CHAT_MODEL,
        rag_top_k=0,
        rag_max_tokens=0,
        history_max_tokens=2000,  # enough for workflow context
    )


# ── RAG result cache (60s TTL) ────────────────────────────────────────
_rag_cache: dict[str, tuple[float, list[RetrievedChunk]]] = {}


def _rag_cache_key(query: str, business_id: str, env_id: str | None, entity_id: str | None) -> str:
    raw = f"{query}:{business_id}:{env_id}:{entity_id}"
    return hashlib.md5(raw.encode()).hexdigest()


def _rag_cache_get(key: str) -> list[RetrievedChunk] | None:
    entry = _rag_cache.get(key)
    if entry is None:
        return None
    ts, chunks = entry
    if time.time() - ts > RAG_CACHE_TTL_SECONDS:
        del _rag_cache[key]
        return None
    return chunks


def _rag_cache_set(key: str, chunks: list[RetrievedChunk]) -> None:
    _rag_cache[key] = (time.time(), chunks)
    # Evict old entries if cache grows too large
    if len(_rag_cache) > 200:
        oldest_key = min(_rag_cache, key=lambda k: _rag_cache[k][0])
        del _rag_cache[oldest_key]


_SYSTEM_PROMPT_BASE = """You are Winston, an in-app copilot embedded in an institutional real estate private equity platform.

## Primary Operating Rule
Treat the application UI as the first source of truth. Resolve the current page, environment, and selected entity
before answering. Do not behave like a stateless chatbot.

## Scope And Clarification
- Never ask for IDs or identifiers that are already available in the application context.
- Default unspecified portfolio questions to the active environment.
- If the user refers to "we", assume the active environment.
- If the user refers to "this fund", "this asset", "current model", or similar, use the resolved page scope.
- Ask for clarification only when scope resolution and tool lookups both fail.

## Tooling Rules
- Use repe.get_environment_snapshot first for environment-wide questions when the UI does not already show the answer.
- Call tools with EMPTY parameters (no arguments) — business_id, env_id, and fund_id are auto-resolved from context. Do NOT copy IDs from the context into tool parameters.
- Prefer structured tool data over general knowledge.
- If visible UI data already answers the question, do not contradict it with a stale assumption.
- When the user mentions a fund by NAME (not ID), call repe.list_funds first to resolve the fund_id, then pass that fund_id to subsequent tools like finance.run_waterfall.
- After creating an entity, always report its ID back to the user so they can reference it later.

## Tool Failure Recovery
- If a tool call returns an error, surface the error plainly: "I tried to [action] but got: [error]."
- NEVER invent or fabricate a result when a tool call fails or returns nothing. Silence from a tool is NOT success.
- If you attempted a tool call that returned an "Unknown tool" error, tell the user: "That operation is not available in the current configuration."

## Data Model
- In this platform, "deals" and "investments" are the SAME entity (stored in repe_deal table).
- The hierarchy is: Business → Environment → Fund → Deal/Investment → Asset.
- When the user says "investments", use repe.list_deals. When they say "deals", use the same tool.
- Do NOT confuse deals/investments with funds or assets.

## Response Style
- Be concise, data-driven, and explicit about freshness.
- Use tables for multi-entity comparisons and bullets for simple summaries.
- Never fabricate fund names, cap rates, IRRs, or entity-level figures.
- Cite retrieved chunk_id values when using document context.
"""

_NOVENDOR_PREDICTION_MARKET_PROMPT = """You are a senior systems architect and data platform engineer working inside the Novendor Business Machine repository. Your task is to design and implement a Prediction Market Intelligence module that continuously ingests public prediction market data and converts it into strategic signals for the business. This system is not a trading platform and must not execute trades. Its purpose is to act as a macro and narrative radar that helps leadership understand emerging trends in technology, economics, and regulation before they appear in mainstream analysis.

The system must monitor prediction markets and transform raw probabilities into structured signals that can inform company strategy, marketing timing, product positioning, and macro awareness. The system must be deterministic, modular, auditable, and designed to integrate into the existing Business Machine architecture built with Python, FastAPI, and Postgres.

The initial data sources will be Polymarket and Kalshi. Polymarket public market data should be ingested using the Gamma API endpoints at https://gamma-api.polymarket.com/events and https://gamma-api.polymarket.com/markets. Kalshi public market data should be ingested using the REST endpoint https://api.elections.kalshi.com/trade-api/v2/markets. These endpoints do not require authentication for reading market data. The system must capture relevant fields including market identifiers, event title, category, probabilities, liquidity, volume, resolution date, and timestamps. These fields must be normalized so that markets from different platforms can be compared consistently.

Create a database schema with three primary tables. The first table should be prediction_markets with fields id, platform, external_market_id, title, category, resolution_date, and created_at. The second table should be prediction_market_prices with fields id, market_id, timestamp, probability_yes, probability_no, volume, and liquidity. The third table should be prediction_market_signals with fields id, market_id, signal_type, signal_strength, description, and created_at. The schema should allow historical time series analysis of probabilities and market movements.

Implement the ingestion pipeline in a new directory called /services/prediction_markets/. Create Python modules named polymarket_ingest.py, kalshi_ingest.py, normalize_markets.py, and signal_engine.py. The ingestion scripts must fetch market data from the APIs, normalize the fields into the internal schema, insert new markets into the prediction_markets table if they do not already exist, and record probability snapshots in prediction_market_prices. The ingestion process should run automatically every five minutes using a scheduled task or cron job.

After each ingestion run, trigger a signal engine that analyzes the new market data and detects meaningful probability changes or structural patterns. The signal engine must calculate probability trends over multiple time windows including one hour, twenty four hours, and seven days. Signals should be generated when probability movement exceeds meaningful thresholds. A narrative shift signal should trigger when the absolute probability change over twenty four hours exceeds ten percent. A macro stress signal should trigger when recession related markets exceed sixty percent probability. A technology acceleration signal should trigger when probabilities related to AI model releases, technological breakthroughs, or regulatory events rise rapidly within a short window. A market divergence signal should trigger when the probability difference between platforms for similar questions exceeds twenty percent. Each signal must be recorded in the prediction_market_signals table with a descriptive interpretation.

Integrate the intelligence feed into the Business Machine interface by creating a new section called /intelligence/markets. This section should display macro outlook indicators, AI timeline signals, narrative shifts, and market divergence alerts. Macro outlook indicators should track markets related to recession probability, interest rates, inflation, and economic stress. AI timeline signals should track markets related to model releases, AI regulation, and major technology milestones. Narrative shifts should highlight markets with the largest probability movement in the last twenty four hours. Market divergence should display cases where multiple prediction platforms disagree on the likelihood of the same event.

The dashboard should visualize probability trends over time using charts and display summary cards for each tracked market. Each market card should show the market title, platform source, current probability, seven day trend, market volume or liquidity, and the expected resolution date. Probability movement should be color coded to highlight accelerating narratives.

Implement an alert system integrated into the Business Machine alerts infrastructure. Alerts should be generated when significant signals occur such as an AI model release probability jumping more than fifteen percent in a short time period, recession probability exceeding sixty percent, or regulatory action probabilities surging. Alerts should appear in the global alerts interface so that leadership can quickly see major shifts in macro expectations.

Design the system so that additional intelligence feeds can be added later. Future integrations should include other prediction sources such as Manifold and Metaculus as well as macroeconomic signals like CME FedWatch, treasury yield curves, and economic indicators. The architecture should also allow future integration of news feeds and narrative analysis.

Prepare the system for future narrative intelligence capabilities using language models. The system should eventually be able to summarize market movements, interpret their implications for enterprise technology adoption, and generate strategic recommendations. Example interpretation output could be: AI model release probability increased significantly this week, indicating growing expectation of near term model improvements, which historically increases enterprise experimentation with AI infrastructure. Recommendation: increase outreach to companies currently running AI pilots and position Novendor as the execution infrastructure for production deployment.

The architecture should also support a future public insight page called AI Timeline Tracker. This page would visualize prediction market expectations for major AI milestones and could serve as a thought leadership asset and lead generation mechanism.

Engineering constraints are critical. The system must remain lightweight and avoid unnecessary frameworks. It must maintain full transparency of calculations and transformations so that signals can be audited. The code must be modular and easily extensible to support additional intelligence feeds and analytical models.

The final deliverable must include ingestion scripts for Polymarket and Kalshi, a normalized database schema, a signal detection engine, integration with the Business Machine dashboard, and an alerting mechanism that surfaces narrative shifts and macro signals in real time. The end result should be a continuously updating prediction market intelligence feed embedded inside the Novendor Business Machine that allows the company to monitor emerging technological and economic narratives and respond strategically before those narratives reach mainstream awareness."""

_RESUME_DOMAIN_BLOCK = """
## Visual Resume Domain

You are operating inside a Visual Resume environment for Paul Malmquist. You are Paul's professional representative and should speak about him in the third person.

Rules:
- Be specific: name companies, years, technologies — not vague generalities.
- When asked "what can he do?" → return a structured skills breakdown by category, not a paragraph.
- When asked about timeline → use the resume.list_roles tool and present dates clearly.
- When asked to compare experiences → present a side-by-side comparison.
- When asked about duration at a company → compute the exact years and months.
- Be confident but not boastful. Let the data speak.
- Only reference information from the resume tools. Do not invent references or contacts.
- For contact: paul@novendor.com, paulmalmquist.com

Key facts:
- 11+ years in data platform engineering and investment management technology
- Current: Director, AI Data Platform & Analytics at JLL (PDS Americas) + Founder of Novendor
- Previous: VP at Kayne Anderson Real Estate ($4B+ AUM REPE firm)
- Education: B.A., Brown University
- Location: Lake Worth, FL
- Built Winston AI Platform: 83 MCP tools, full REPE domain coverage
"""

_CREDIT_DOMAIN_BLOCK = """
## Credit Decisioning Domain

You are operating inside a consumer credit decisioning environment. In addition to the standard rules above, the following constraints are absolute:

### Layer 1 — Deny-by-Default Walled Garden
- NEVER use general knowledge to answer questions about credit policy, underwriting criteria, or regulatory requirements.
- ONLY reference documents that exist in the environment's corpus (cc_corpus_document / cc_corpus_passage).
- Every factual assertion about policy, procedure, or regulation MUST include a citation: document_ref + passage_ref + excerpt.
- If the corpus does not contain the answer, say so explicitly. Do NOT guess.
- When the user asks about underwriting criteria, search the corpus first using credit.search_corpus before answering.

### Layer 2 — Chain-of-Thought Orchestration
- When evaluating a loan or answering a policy question, decompose the query into sub-questions.
- For each sub-question, retrieve the relevant corpus passage and validate it answers the sub-question directly.
- Show your reasoning: "Per [document_ref] section [passage_ref]: [excerpt]. Therefore: [conclusion]."
- Every decision produced by credit.evaluate_loan includes a full reasoning chain in the audit record.

### Layer 3 — Format Locks
- Decisioning outputs are schema-validated. Do NOT rephrase or summarize the structured output in a way that loses the rule-by-rule evaluation.
- Present the decision, then the rules evaluated (with PASS/FAIL for each), then the explanation, then the citations.
- Exception queue items must include: the failing rules, the gap between threshold and observed, and the recommended action from policy.
- Adverse action reasons must use ECOA-compliant codes from the corpus.

### Data Model
- The hierarchy is: Business → Environment → Portfolio → Loan → Loan Event
- Borrowers are linked to loans. Servicers are linked to portfolios.
- Decisioning runs against a portfolio's active policy.
- The exception queue holds loans that could not be auto-decided.
- The audit trail is immutable and append-only.

### Tool Routing
- Portfolio questions → credit.list_portfolios, credit.get_portfolio
- Loan questions → credit.list_loans, credit.get_loan
- "Run decisioning" / "evaluate this loan" → credit.evaluate_loan
- Policy questions → credit.search_corpus FIRST, then credit.list_policies
- Exception queue → credit.list_exceptions
- Audit/compliance questions → credit.list_audit_records, credit.get_decision
- "What does the policy say about X" → credit.search_corpus (NEVER answer from general knowledge)
"""

_MUTATION_RULES_BLOCK = """
## Mutation Rules — Two-Phase Write Flow

CRITICAL: Call the write tool FIRST. Do NOT gather parameters through conversation.

### The four steps
1. User requests creation/modification → call the write tool with `confirmed=false` IMMEDIATELY.
   - Do NOT ask "what name?", "what vintage?", or any other parameter question first.
   - Call the tool with whatever you know — even just a name. Missing fields will be handled by the tool.
2. Tool returns either:
   - A `needs_input` response listing missing fields and already-collected params → ask the user ONLY for the missing fields, then call again with confirmed=false and ALL previously provided params merged with new values.
   - A `pending_confirmation` summary with some null params → present the summary. If important optional fields are null, ask the user for those values. Otherwise ask "Shall I proceed?"
3. User provides missing values OR confirms ("yes", "go ahead", "proceed"):
   - **Slot-fill**: Merge the new values with ALL previously known parameters (name, vintage_year, fund_type, strategy, etc.) from the prior tool call. Call the SAME tool with confirmed=false and the FULL merged parameter set. NEVER forget or drop parameters from prior turns.
   - **Confirmation**: Call the SAME tool again with confirmed=true and the EXACT SAME parameters.
4. Tool executes → report what was created and its ID.

### CRITICAL: Parameter memory across turns
- When the user provides values across multiple messages, you MUST accumulate ALL parameters.
- Example: Turn 1 provides name="ABC Fund". Turn 2 provides "2024 open_end equity" → call tool with name="ABC Fund", vintage_year=2024, fund_type="open_end", strategy="equity".
- NEVER re-ask for a parameter the user already provided in an earlier message. Check conversation history.

### FORBIDDEN — never do these
- Never ask "Please provide the necessary details" before calling the tool.
- Never generate your own confirmation summary. Let the tool produce it.
- Never respond to "yes" without calling the tool with confirmed=true.
- Never ask for parameters you can infer from the user's message.
- Never forget the fund/deal/asset name from a prior turn when the user provides other fields.

### Recovery: if the user says "yes" and you have no recent tool call
Check the conversation history for a pending action. Identify the parameters discussed and call the write tool with confirmed=true.
"""

_READ_ONLY_BLOCK = """
## Operating Mode: Read-Only
- You operate in read-only mode. You can look up, analyze, and report on data, but you cannot create, modify, or delete records.
- If the user asks you to create, add, or modify something, explain that write operations are not available and suggest they use the platform UI directly.
"""


def _has_write_tools() -> bool:
    """Check if any write-permission tools are registered."""
    for tool_def in registry.list_all():
        if tool_def.permission == "write" and tool_def.handler is not None:
            return True
    return False


def _build_system_prompt() -> str:
    """Build system prompt dynamically based on registered tool capabilities."""
    if _has_write_tools():
        return _SYSTEM_PROMPT_BASE + _MUTATION_RULES_BLOCK
    return _SYSTEM_PROMPT_BASE + _READ_ONLY_BLOCK


def _is_novendor_environment(*, environment_name: str | None, environment_id: str | None) -> bool:
    haystacks = [environment_name or "", environment_id or ""]
    return any("novendor" in value.lower() for value in haystacks)


def _is_resume_environment(*, environment_name: str | None, environment_id: str | None, industry: str | None = None) -> bool:
    if industry and industry.lower() in ("visual_resume", "resume"):
        return True
    haystacks = [environment_name or "", environment_id or ""]
    return any("resume" in value.lower() for value in haystacks)


def _is_credit_environment(*, environment_name: str | None, environment_id: str | None, industry: str | None = None, credit_initialized: bool = False) -> bool:
    if credit_initialized:
        return True
    if industry and industry.lower() in ("consumer_credit", "credit"):
        return True
    haystacks = [environment_name or "", environment_id or ""]
    return any("credit" in value.lower() for value in haystacks)


def _build_system_prompt_for_context(*, environment_name: str | None, environment_id: str | None, industry: str | None = None, credit_initialized: bool = False) -> str:
    base = _build_system_prompt()
    if _is_novendor_environment(environment_name=environment_name, environment_id=environment_id):
        base += "\n\n" + _NOVENDOR_PREDICTION_MARKET_PROMPT
    if _is_credit_environment(environment_name=environment_name, environment_id=environment_id, industry=industry, credit_initialized=credit_initialized):
        base += "\n\n" + _CREDIT_DOMAIN_BLOCK
    if _is_resume_environment(environment_name=environment_name, environment_id=environment_id, industry=industry):
        base += "\n\n" + _RESUME_DOMAIN_BLOCK
    return base


def _sanitize_tool_name(name: str) -> str:
    return name.replace(".", "__")


_cached_tools: tuple[list[dict], dict[str, str]] | None = None
_cached_tools_by_lane: dict[frozenset[str], tuple[list[dict], dict[str, str]]] = {}

# Tag sets per lane — controls which tools are sent to the LLM.
# Lane A uses skip_tools=True (no tools at all), so is not listed here.
_LANE_B_TAGS: set[str] = {"core", "meta", "repe", "finance", "env", "business"}
_LANE_C_TAGS: set[str] = {"core", "meta", "repe", "finance", "analysis", "model", "ops",
                           "investor", "workflow", "platform", "env", "business",
                           "document", "report"}
_LANE_C_CREDIT_TAGS: set[str] = {"core", "meta", "credit", "env", "business", "document"}
_LANE_C_RESUME_TAGS: set[str] = {"core", "meta", "resume", "env", "business"}
# Lane D gets all tools (no tag filter).


def _reset_tool_cache() -> None:
    global _cached_tools
    _cached_tools = None
    _cached_tools_by_lane.clear()


def _strip_schema(schema: dict) -> dict:
    """Remove metadata and auto-resolved context fields from tool schema to
    reduce token overhead.  The gateway injects env_id/business_id from
    resolved scope, so they don't need to appear in the tool definition sent
    to the model."""
    _DROP_KEYS = {"$schema", "title"}
    _AUTO_RESOLVED_PROPS = {"env_id", "business_id"}
    out: dict = {}
    for key, value in schema.items():
        if key in _DROP_KEYS:
            continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {
                k: v for k, v in value.items() if k not in _AUTO_RESOLVED_PROPS
            }
            continue
        if key == "required" and isinstance(value, list):
            out[key] = [r for r in value if r not in _AUTO_RESOLVED_PROPS]
            continue
        out[key] = value
    return out


def _build_openai_tools() -> tuple[list[dict], dict[str, str]]:
    """Build the full (unfiltered) tool list. Used by Lane D and as fallback."""
    global _cached_tools
    if _cached_tools is not None:
        return _cached_tools

    tools = []
    name_map: dict[str, str] = {}
    for tool_def in registry.list_all():
        if tool_def.name.startswith("codex."):
            continue
        if tool_def.handler is None:
            continue
        clean_schema = _strip_schema(tool_def.input_schema)
        safe_name = _sanitize_tool_name(tool_def.name)
        name_map[safe_name] = tool_def.name
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": safe_name,
                    "description": tool_def.description[:200],
                    "parameters": clean_schema,
                },
            }
        )
    _cached_tools = (tools, name_map)
    return _cached_tools


def _build_openai_tools_for_lane(
    *, lane: str, is_write: bool, is_credit: bool, is_resume: bool = False
) -> tuple[list[dict], dict[str, str]]:
    """Return a lane-filtered tool list to reduce token overhead.

    Lane A uses skip_tools=True so never calls this.
    Lane B gets a focused subset (~20 tools).
    Lane C gets a broader subset (~50 tools), with credit variant.
    Lane D gets the full set (delegates to _build_openai_tools).
    """
    if lane == "D":
        return _build_openai_tools()

    # Determine which tag set to use
    if lane == "B":
        tag_set = _LANE_B_TAGS
    elif is_resume:
        tag_set = _LANE_C_RESUME_TAGS
    elif is_credit:
        tag_set = _LANE_C_CREDIT_TAGS
    else:
        tag_set = _LANE_C_TAGS

    # Cache key includes lane, write flag, and credit flag
    cache_key = frozenset({f"lane={lane}", f"write={is_write}", f"credit={is_credit}", f"resume={is_resume}"})
    if cache_key in _cached_tools_by_lane:
        return _cached_tools_by_lane[cache_key]

    tools = []
    name_map: dict[str, str] = {}
    for tool_def in registry.list_all():
        if tool_def.name.startswith("codex."):
            continue
        if tool_def.handler is None:
            continue
        # Skip tools without matching tags
        if not (tool_def.tags & tag_set):
            continue
        # Skip write tools when not in write mode
        if "write" in tool_def.tags and not is_write:
            continue
        clean_schema = _strip_schema(tool_def.input_schema)
        safe_name = _sanitize_tool_name(tool_def.name)
        name_map[safe_name] = tool_def.name
        tools.append(
            {
                "type": "function",
                "function": {
                    "name": safe_name,
                    "description": tool_def.description[:200],
                    "parameters": clean_schema,
                },
            }
        )

    _cached_tools_by_lane[cache_key] = (tools, name_map)
    return (tools, name_map)


def _json_safe(value: Any) -> Any:
    from decimal import Decimal

    if isinstance(value, dict):
        return {str(key): _json_safe(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    if hasattr(value, "hex"):
        return str(value)
    return value


def _preview(value: Any, max_chars: int = 1600) -> str:
    text = json.dumps(_json_safe(value), ensure_ascii=True, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...[truncated]"


def _maybe_attach_scope(tool_def, args: dict[str, Any], resolved_scope: dict[str, Any]) -> dict[str, Any]:
    fields = getattr(tool_def.input_model, "model_fields", {})
    if "resolved_scope" in fields and "resolved_scope" not in args:
        args["resolved_scope"] = resolved_scope
    return args


def _sse(event: str, data: dict[str, Any]) -> str:
    # Sanitize streamed tokens to prevent internal context leakage
    if event == "token" and "text" in data:
        from app.services.response_sanitizer import sanitize_response_token
        data = {**data, "text": sanitize_response_token(data["text"])}
    return f"event: {event}\ndata: {json.dumps(_json_safe(data), ensure_ascii=True)}\n\n"


def _citation_items(chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for chunk in chunks:
        items.append(
            {
                "label": chunk.source_filename or chunk.document_id or chunk.chunk_id,
                "href": None,
                "snippet": chunk.chunk_text[:240],
                "score": round(chunk.score, 4),
                "doc_id": chunk.document_id,
                "chunk_id": chunk.chunk_id,
                "section_heading": chunk.section_heading,
            }
        )
    return items


def _tool_activity_item(
    *,
    tool_name: str,
    summary: str,
    duration_ms: int | None = None,
    status: str = "completed",
    is_write: bool = False,
) -> dict[str, Any]:
    return {
        "tool_name": tool_name,
        "status": status,
        "summary": summary,
        "duration_ms": duration_ms,
        "is_write": is_write,
    }


# ── REPE Fast-Path Engine ────────────────────────────────────────────────────

async def _run_repe_fast_path(
    *,
    intent,
    resolved_scope,
    context_envelope,
    session_id: str,
    conversation_id,
    scope_dump: dict,
    timings: dict,
    start: float,
    trace,
    actor: str,
) -> AsyncGenerator[str, None]:
    """Execute a REPE finance query deterministically without an LLM call.

    Emits SSE events: status → tool_call → structured_result → done.
    Target latency: <2s for metrics, <4s for scenario + waterfall.
    """
    from app.services.repe_intent import (
        INTENT_ANALYTICS_QUERY,
        INTENT_BRIEFING_GENERATE,
        INTENT_CAPITAL_CALL_IMPACT,
        INTENT_CLAWBACK_RISK,
        INTENT_COMPARE_SCENARIOS,
        INTENT_CONSTRUCTION_IMPACT,
        INTENT_DATA_HEALTH,
        INTENT_FUND_METRICS,
        INTENT_GENERATE_DASHBOARD,
        INTENT_KNOWLEDGE_SEARCH,
        INTENT_LIST_CAPITAL_ACTIVITY,
        INTENT_LIST_INVESTORS,
        INTENT_LP_SUMMARY,
        INTENT_MONTE_CARLO_WATERFALL,
        INTENT_NAV_ROLLFORWARD,
        INTENT_PIPELINE_RADAR,
        INTENT_PORTFOLIO_WATERFALL,
        INTENT_RUN_FUND_IMPACT,
        INTENT_RUN_SALE_SCENARIO,
        INTENT_RUN_WATERFALL,
        INTENT_SENSITIVITY,
        INTENT_SESSION_WATERFALL_QUERY,
        INTENT_STRESS_CAP_RATE,
        INTENT_UW_VS_ACTUAL,
        INTENT_CAPITAL_CALL_WORKFLOW,
        INTENT_DISTRIBUTION_WORKFLOW,
        INTENT_PERIOD_CLOSE,
        INTENT_FEE_SCHEDULE,
        INTENT_WATERFALL_COMPARE,
        INTENT_NOI_VARIANCE,
        INTENT_LIST_APPROVALS,
        INTENT_LIST_DOCUMENTS,
        INTENT_SAVED_ANALYSES,
        INTENT_TRANSFORM_RESULT,
        INTENT_COVENANT_CHECK,
        INTENT_DDQ_DRAFT,
        INTENT_LP_REPORT,
        INTENT_ISSUE_NOTICES,
    )
    from app.mcp.auth import McpContext

    from app.services.query_intent import extract_query_intent

    scenario = resolve_scenario_params(intent, resolved_scope, context_envelope)
    session_state = get_session(str(conversation_id) if conversation_id else None)
    response_blocks: list[dict[str, Any]] = []
    collected_text_parts: list[str] = []

    # Extract analytical query intent (group_by, time_grain, chart_preference, etc.)
    query_intent = extract_query_intent(intent.original_message)

    # Store query intent in session for conversational transforms
    if conversation_id and (query_intent.group_by or query_intent.is_time_series or query_intent.limit):
        from dataclasses import asdict
        update_session(
            str(conversation_id),
            last_query_intent=asdict(query_intent),
        )

    if intent.family == INTENT_SESSION_WATERFALL_QUERY:
        if session_state and session_state.waterfall_runs:
            card = _build_session_waterfall_card(session_state)
            yield _sse("structured_result", {"result_type": "session_waterfall_summary", "card": card})
            blocks = legacy_structured_result_to_blocks("session_waterfall_summary", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})
            timings["total_ms"] = int((time.time() - start) * 1000)
            yield _sse("done", {
                "session_id": session_id,
                "trace": {
                    "execution_path": "repe_fast_path",
                    "lane": "F",
                    "model": "none",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "tool_call_count": 0,
                    "tool_timeline": [],
                    "data_sources": [],
                    "citations": [],
                    "rag_chunks_used": 0,
                    "warnings": [],
                    "elapsed_ms": timings["total_ms"],
                    "resolved_scope": scope_dump,
                    "repe": {"intent": intent.family, "fast_path": True, "session_memory": True},
                    "visible_context_shortcut": False,
                    "timings": timings,
                },
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "tool_calls": 0,
                "elapsed_ms": timings["total_ms"],
                "resolved_scope": scope_dump,
                "response_blocks": response_blocks,
            })
            return

    # ── Handle conversational transforms ──────────────────────────────
    if intent.family == INTENT_TRANSFORM_RESULT:
        if session_state and session_state.last_result_data:
            from app.services.assistant_blocks import chart_block, table_block

            transform = intent.extracted_params or {}
            prior_intent = session_state.last_query_intent or {}
            rows = session_state.last_result_data

            # Determine visualization type
            chart_type = transform.get("chart_type") or prior_intent.get("chart_preference", "bar")

            # Apply limit transform
            if "limit" in transform:
                limit_n = int(transform["limit"])
                sort_key = prior_intent.get("sort_by") or (prior_intent.get("metrics", [None])[0] if prior_intent.get("metrics") else None)
                if sort_key and rows:
                    rows = sorted(rows, key=lambda r: r.get(sort_key) or 0, reverse=True)[:limit_n]
                else:
                    rows = rows[:limit_n]

            # Apply group_by transform (re-query would be needed — for now just note it)
            if "group_by" in transform and transform["group_by"] != prior_intent.get("group_by"):
                text = f"I'll need to re-query the data to group by **{transform['group_by']}**. Let me rephrase your original question."
                yield _sse("token", {"text": text})
                collected_text_parts.append(text)
            elif chart_type == "table":
                # Re-emit as table
                columns = list(rows[0].keys()) if rows else []
                block = table_block(title="Results", columns=columns, rows=rows)
                response_blocks.append(block)
                yield _sse("response_block", {"block": block})
            else:
                # Re-emit as chart
                x_key = prior_intent.get("x_key", "period")
                y_keys = prior_intent.get("metrics", ["value"])
                series_key = prior_intent.get("group_by")
                # Infer x_key from data
                if rows and x_key not in rows[0]:
                    for candidate in ("period", "quarter", "entity_name", "name"):
                        if candidate in rows[0]:
                            x_key = candidate
                            break
                block = chart_block(
                    title="Results",
                    chart_type=chart_type,
                    x_key=x_key,
                    y_keys=y_keys,
                    data=rows,
                    series_key=series_key,
                )
                response_blocks.append(block)
                yield _sse("response_block", {"block": block})

            timings["total_ms"] = int((time.time() - start) * 1000)
            yield _sse("done", {
                "session_id": session_id,
                "trace": {
                    "execution_path": "repe_fast_path", "lane": "F",
                    "model": "none", "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                    "tool_call_count": 0, "tool_timeline": [],
                    "data_sources": [], "citations": [], "rag_chunks_used": 0, "warnings": [],
                    "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
                    "repe": {"intent": intent.family, "fast_path": True, "transform": True},
                    "visible_context_shortcut": False, "timings": timings,
                },
                "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": 0,
                "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
                "response_blocks": response_blocks,
            })
            return
        else:
            text = "I don't have a previous result to transform. Try running an analysis first, then ask me to change the visualization."
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

    # ── Check for missing critical params ──────────────────────────────
    clarification = build_clarification_question(scenario)
    if clarification:
        yield _sse("status", {"message": "Need a bit more info...", "stage": "clarification", "progress": 0.1})
        yield _sse("clarification_required", {
            "action": "finance_clarification",
            "question": clarification,
            "intent": intent.family,
            "missing_params": scenario.missing_critical,
        })
        yield _sse("token", {"text": clarification})
        collected_text_parts.append(clarification)
        timings["total_ms"] = int((time.time() - start) * 1000)
        response_blocks.append(markdown_block(clarification))
        yield _sse("done", {
            "session_id": session_id,
            "trace": {
                "execution_path": "repe_fast_path", "lane": "F",
                "model": "none", "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                "tool_call_count": 0, "tool_timeline": [], "data_sources": [],
                "citations": [], "rag_chunks_used": 0, "warnings": [],
                "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
                "repe": {"intent": intent.family, "fast_path": True, "clarification": True},
                "visible_context_shortcut": False, "timings": timings,
            },
            "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": 0,
            "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
            "response_blocks": response_blocks,
        })
        return

    # ── Build MCP context for tool execution ───────────────────────────
    ctx = McpContext(
        actor=actor,
        token_valid=True,
        resolved_scope=scope_dump,
    )

    tool_timeline = []
    data_sources = []
    family = intent.family
    result: dict[str, Any] | None = None
    response_blocks: list[dict[str, Any]] = []
    collected_text_parts: list[str] = []

    try:
        # ── Route to the right engine ──────────────────────────────────
        if family == INTENT_RUN_SALE_SCENARIO:
            yield _sse("status", {"message": "Building sale scenario...", "stage": "params", "progress": 0.2})
            result = await _exec_fast_tool(
                ctx, "finance.run_sale_scenario", {
                    "fund_id": scenario.fund_id,
                    "deal_id": scenario.deal_id,
                    "asset_id": scenario.asset_id,
                    "sale_price": float(scenario.sale_price) if scenario.sale_price else None,
                    "exit_cap_rate": float(scenario.exit_cap_rate) if scenario.exit_cap_rate else None,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            yield _sse("status", {"message": "Computing fund impact...", "stage": "compute", "progress": 0.6})

            # Build structured result card
            card = _build_scenario_card(result, scenario)
            yield _sse("structured_result", {"result_type": "scenario_comparison", "card": card})
            blocks = legacy_structured_result_to_blocks("scenario_comparison", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_RUN_WATERFALL:
            yield _sse("status", {"message": "Running waterfall distribution...", "stage": "waterfall", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.run_waterfall", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_waterfall_card(result, scenario)
            yield _sse("structured_result", {"result_type": "waterfall_breakdown", "card": card})
            blocks = legacy_structured_result_to_blocks("waterfall_breakdown", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family in (INTENT_FUND_METRICS, INTENT_RUN_FUND_IMPACT):
            yield _sse("status", {"message": "Loading fund metrics...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.fund_metrics", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_metrics_card(result, scenario)
            yield _sse("structured_result", {"result_type": "fund_metrics", "card": card})
            blocks = legacy_structured_result_to_blocks("fund_metrics", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_STRESS_CAP_RATE:
            yield _sse("status", {"message": "Stress testing cap rates...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.stress_cap_rate", {
                    "fund_id": scenario.fund_id,
                    "cap_rate_delta_bps": scenario.cap_rate_delta_bps or 50,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_stress_card(result, scenario)
            yield _sse("structured_result", {"result_type": "stress_matrix", "card": card})
            blocks = legacy_structured_result_to_blocks("stress_matrix", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_LP_SUMMARY:
            yield _sse("status", {"message": "Building LP summary...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.lp_summary", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_lp_card(result, scenario)
            yield _sse("structured_result", {"result_type": "lp_summary", "card": card})
            blocks = legacy_structured_result_to_blocks("lp_summary", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_COMPARE_SCENARIOS:
            yield _sse("status", {"message": "Comparing scenarios...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.compare_scenarios", {
                    "fund_id": scenario.fund_id,
                    "scenario_ids": scenario.scenario_ids or [],
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_comparison_card(result, scenario)
            yield _sse("structured_result", {"result_type": "scenario_comparison", "card": card})
            blocks = legacy_structured_result_to_blocks("scenario_comparison", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_MONTE_CARLO_WATERFALL:
            yield _sse("status", {"message": "Running percentile waterfalls...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.monte_carlo_waterfall", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "p10_nav": float(intent.extracted_params.get("p10_nav") or 0),
                    "p50_nav": float(intent.extracted_params.get("p50_nav") or 0),
                    "p90_nav": float(intent.extracted_params.get("p90_nav") or 0),
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_mc_waterfall_card(result, scenario)
            yield _sse("structured_result", {"result_type": "waterfall_percentiles", "card": card})
            blocks = legacy_structured_result_to_blocks("waterfall_percentiles", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_PORTFOLIO_WATERFALL:
            yield _sse("status", {"message": "Aggregating portfolio waterfalls...", "stage": "compute", "progress": 0.3})
            fund_ids = intent.extracted_params.get("fund_ids") or ([scenario.fund_id] if scenario.fund_id else [])
            result = await _exec_fast_tool(
                ctx, "finance.portfolio_waterfall", {
                    "fund_ids": fund_ids,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_portfolio_waterfall_card(result, scenario)
            yield _sse("structured_result", {"result_type": "portfolio_waterfall", "card": card})
            blocks = legacy_structured_result_to_blocks("portfolio_waterfall", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_PIPELINE_RADAR:
            yield _sse("status", {"message": "Scoring pipeline deals...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.pipeline_radar", {
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                    "stage_filter": intent.extracted_params.get("stage_filter"),
                },
                tool_timeline, data_sources,
            )
            card = _build_pipeline_radar_card(result, scenario)
            yield _sse("structured_result", {"result_type": "pipeline_radar", "card": card})
            blocks = legacy_structured_result_to_blocks("pipeline_radar", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_CAPITAL_CALL_IMPACT:
            yield _sse("status", {"message": "Modeling capital call impact...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.capital_call_impact", {
                    "fund_id": scenario.fund_id,
                    "additional_call_amount": float(scenario.additional_call_amount or 0),
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_capital_call_card(result, scenario)
            yield _sse("structured_result", {"result_type": "capital_call_impact", "card": card})
            blocks = legacy_structured_result_to_blocks("capital_call_impact", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_CLAWBACK_RISK:
            yield _sse("status", {"message": "Assessing clawback risk...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.clawback_risk", {
                    "fund_id": scenario.fund_id,
                    "scenario_id": scenario.scenario_id,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_clawback_card(result, scenario)
            yield _sse("structured_result", {"result_type": "clawback_risk", "card": card})
            blocks = legacy_structured_result_to_blocks("clawback_risk", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_UW_VS_ACTUAL:
            yield _sse("status", {"message": "Comparing underwriting to actual...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.uw_vs_actual_waterfall", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "model_id": intent.extracted_params.get("model_id"),
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_uw_vs_actual_card(result, scenario)
            yield _sse("structured_result", {"result_type": "uw_vs_actual_waterfall", "card": card})
            blocks = legacy_structured_result_to_blocks("uw_vs_actual_waterfall", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_SENSITIVITY:
            yield _sse("status", {"message": "Building sensitivity matrix...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.sensitivity_matrix", {
                    "fund_id": scenario.fund_id,
                    "quarter": scenario.quarter,
                    "cap_rate_range_bps": intent.extracted_params.get("cap_rate_range_bps") or [0, 50, 100, 150, 200],
                    "noi_stress_range_pct": intent.extracted_params.get("noi_stress_range_pct") or [0, -0.05, -0.10, -0.15, -0.20],
                    "metric": intent.extracted_params.get("metric") or "net_irr",
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_sensitivity_card(result, scenario)
            yield _sse("structured_result", {"result_type": "sensitivity_matrix", "card": card})
            blocks = legacy_structured_result_to_blocks("sensitivity_matrix", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_CONSTRUCTION_IMPACT:
            yield _sse("status", {"message": "Projecting construction timing...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.construction_waterfall", {
                    "fund_id": scenario.fund_id,
                    "asset_id": scenario.asset_id,
                    "quarter": scenario.quarter,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_construction_waterfall_card(result, scenario)
            yield _sse("structured_result", {"result_type": "construction_waterfall", "card": card})
            blocks = legacy_structured_result_to_blocks("construction_waterfall", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_GENERATE_DASHBOARD:
            from app.services.dashboard_composer import compose_dashboard_spec

            yield _sse("status", {"message": "Composing dashboard layout...", "stage": "compose", "progress": 0.3})
            dashboard_spec = compose_dashboard_spec(
                message=intent.original_message,
                env_id=scenario.env_id,
                business_id=scenario.business_id,
                fund_id=scenario.fund_id,
                quarter=scenario.quarter,
            )
            yield _sse("status", {"message": "Dashboard ready", "stage": "results", "progress": 0.9})
            card = _build_dashboard_card(dashboard_spec)
            yield _sse("structured_result", {
                "result_type": "dynamic_dashboard",
                "card": card,
                "dashboard_spec": dashboard_spec,
            })
            blocks = legacy_structured_result_to_blocks("dynamic_dashboard", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_LIST_INVESTORS:
            yield _sse("status", {"message": "Loading investors...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "finance.list_investors", {
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_investor_list_card(result, scenario)
            yield _sse("structured_result", {"result_type": "investor_list", "card": card})
            blocks = legacy_structured_result_to_blocks("investor_list", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_LIST_CAPITAL_ACTIVITY:
            yield _sse("status", {"message": "Loading capital activity...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {
                "env_id": scenario.env_id,
                "business_id": scenario.business_id,
            }
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            # Extract quarter from message if present
            quarter_param = intent.extracted_params.get("quarter") or scenario.quarter
            if quarter_param:
                tool_params["quarter"] = quarter_param
            result = await _exec_fast_tool(
                ctx, "finance.list_capital_activity", tool_params,
                tool_timeline, data_sources,
            )
            card = _build_capital_activity_card(result, scenario)
            yield _sse("structured_result", {"result_type": "capital_activity", "card": card})
            blocks = legacy_structured_result_to_blocks("capital_activity", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_NAV_ROLLFORWARD:
            yield _sse("status", {"message": "Computing NAV rollforward...", "stage": "compute", "progress": 0.3})
            # Determine quarter_from/to — default: prior quarter → current quarter
            q = scenario.quarter or "2026Q1"
            year, qn = int(q[:4]), int(q[-1])
            if qn == 1:
                q_from = f"{year - 1}Q4"
            else:
                q_from = f"{year}Q{qn - 1}"
            result = await _exec_fast_tool(
                ctx, "finance.nav_rollforward", {
                    "fund_id": scenario.fund_id,
                    "quarter_from": q_from,
                    "quarter_to": q,
                    "env_id": scenario.env_id,
                    "business_id": scenario.business_id,
                },
                tool_timeline, data_sources,
            )
            card = _build_nav_rollforward_card(result, scenario)
            yield _sse("structured_result", {"result_type": "nav_rollforward", "card": card})
            blocks = legacy_structured_result_to_blocks("nav_rollforward", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_CAPITAL_CALL_WORKFLOW:
            yield _sse("status", {"message": "Loading capital calls...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {"env_id": scenario.env_id, "business_id": scenario.business_id}
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            result = await _exec_fast_tool(ctx, "finance.list_capital_calls", tool_params, tool_timeline, data_sources)
            card = _build_capital_calls_card(result, scenario)
            yield _sse("structured_result", {"result_type": "capital_calls", "card": card})
            blocks = legacy_structured_result_to_blocks("capital_calls", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_DISTRIBUTION_WORKFLOW:
            yield _sse("status", {"message": "Loading distributions...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {"env_id": scenario.env_id, "business_id": scenario.business_id}
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            result = await _exec_fast_tool(ctx, "finance.list_distributions", tool_params, tool_timeline, data_sources)
            card = _build_distributions_card(result, scenario)
            yield _sse("structured_result", {"result_type": "distributions", "card": card})
            blocks = legacy_structured_result_to_blocks("distributions", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_PERIOD_CLOSE:
            yield _sse("status", {"message": "Loading period close status...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {"env_id": scenario.env_id, "business_id": scenario.business_id}
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            result = await _exec_fast_tool(ctx, "ops.period_close_status", tool_params, tool_timeline, data_sources)
            card = _build_period_close_card(result, scenario)
            yield _sse("structured_result", {"result_type": "period_close", "card": card})
            blocks = legacy_structured_result_to_blocks("period_close", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_FEE_SCHEDULE:
            yield _sse("status", {"message": "Loading fee schedule...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {"env_id": scenario.env_id, "business_id": scenario.business_id}
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            result = await _exec_fast_tool(ctx, "ops.fee_schedule", tool_params, tool_timeline, data_sources)
            card = _build_fee_schedule_card(result, scenario)
            yield _sse("structured_result", {"result_type": "fee_schedule", "card": card})
            blocks = legacy_structured_result_to_blocks("fee_schedule", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_WATERFALL_COMPARE:
            yield _sse("status", {"message": "Comparing waterfall runs...", "stage": "compute", "progress": 0.3})
            # This intent navigates to the waterfall comparison page
            card = {
                "title": "Waterfall Comparison",
                "subtitle": "Select two waterfall runs to compare",
                "metrics": [],
                "actions": [
                    {"label": "Open Comparison", "action": "navigate", "params": {"path": "waterfall-comparison"}},
                ],
            }
            yield _sse("structured_result", {"result_type": "waterfall_compare", "card": card})
            blocks = legacy_structured_result_to_blocks("waterfall_compare", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_NOI_VARIANCE:
            yield _sse("status", {"message": "Loading variance analysis...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {"env_id": scenario.env_id, "business_id": scenario.business_id}
            if scenario.fund_id:
                tool_params["fund_id"] = scenario.fund_id
            q = intent.extracted_params.get("quarter") or scenario.quarter
            if q:
                tool_params["quarter"] = q
            result = await _exec_fast_tool(ctx, "finance.noi_variance", tool_params, tool_timeline, data_sources)
            card = _build_variance_card(result, scenario)
            yield _sse("structured_result", {"result_type": "noi_variance", "card": card})
            blocks = legacy_structured_result_to_blocks("noi_variance", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_LIST_APPROVALS:
            yield _sse("status", {"message": "Loading approvals...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "platform.list_approvals",
                {"env_id": scenario.env_id, "business_id": scenario.business_id},
                tool_timeline, data_sources,
            )
            card = _build_approvals_card(result, scenario)
            yield _sse("structured_result", {"result_type": "approvals", "card": card})
            blocks = legacy_structured_result_to_blocks("approvals", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_LIST_DOCUMENTS:
            yield _sse("status", {"message": "Loading documents...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "platform.list_documents",
                {"env_id": scenario.env_id, "business_id": scenario.business_id},
                tool_timeline, data_sources,
            )
            card = _build_documents_card(result, scenario)
            yield _sse("structured_result", {"result_type": "documents", "card": card})
            blocks = legacy_structured_result_to_blocks("documents", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_SAVED_ANALYSES:
            yield _sse("status", {"message": "Loading saved analyses...", "stage": "compute", "progress": 0.3})
            result = await _exec_fast_tool(
                ctx, "platform.list_saved_analyses",
                {"env_id": scenario.env_id, "business_id": scenario.business_id},
                tool_timeline, data_sources,
            )
            card = _build_saved_analyses_card(result, scenario)
            yield _sse("structured_result", {"result_type": "saved_analyses", "card": card})
            blocks = legacy_structured_result_to_blocks("saved_analyses", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_ANALYTICS_QUERY:
            from app.services.analytics_workspace import run_query, suggest_visualization

            yield _sse("status", {"message": "Generating SQL query...", "stage": "sql_gen", "progress": 0.2})

            # Use the SQL agent to generate SQL from NL
            try:
                from app.sql_agent.combined_agent import generate_sql
                from app.sql_agent.catalog import catalog_text_dynamic
                catalog = catalog_text_dynamic(business_id=scenario.business_id)
                if not catalog or len(catalog.strip()) < 50:
                    emit_log(
                        level="error",
                        service="backend",
                        action="ai.gateway.generate_sql.empty_catalog",
                        message="catalog_text_dynamic returned empty or too-short catalog",
                        context={"business_id": str(scenario.business_id), "catalog_len": len(catalog or "")},
                    )
                    err_text = "I couldn't generate a query — the data catalog for this environment is not available."
                    yield _sse("token", {"text": err_text})
                    collected_text_parts.append(err_text)
                    sql = ""
                else:
                    generated = await generate_sql(
                        message=intent.original_message,
                        catalog=catalog,
                        business_id=scenario.business_id,
                    )
                    sql = generated.get("sql", "")
            except RuntimeError as e:
                # Config/key error (e.g. OPENAI_API_KEY not set) — surface to user
                emit_log(
                    level="error",
                    service="backend",
                    action="ai.gateway.generate_sql.config_error",
                    message=str(e),
                    context={"intent": intent.original_message[:100]},
                )
                err_text = f"AI query unavailable: {e}"
                yield _sse("token", {"text": err_text})
                collected_text_parts.append(err_text)
                sql = ""
            except Exception as e:
                # Unexpected error — log with full detail so we can diagnose in Railway logs
                emit_log(
                    level="error",
                    service="backend",
                    action="ai.gateway.generate_sql.error",
                    message=str(e),
                    context={
                        "intent": intent.original_message[:100],
                        "error_type": type(e).__name__,
                    },
                )
                sql = ""

            if sql:
                yield _sse("status", {"message": "Executing query...", "stage": "execute", "progress": 0.6})
                query_result = run_query(
                    business_id=scenario.business_id or "",
                    env_id=scenario.env_id or "",
                    sql=sql,
                    executed_by=actor,
                )
                if query_result.get("error"):
                    text = f"Query error: {query_result['error']}"
                    yield _sse("token", {"text": text})
                    collected_text_parts.append(text)
                else:
                    viz_hint = suggest_visualization(
                        columns=query_result["columns"],
                        row_count=query_result["row_count"],
                    )
                    query_card = {
                        "title": "Query Results",
                        "sql": sql,
                        "columns": query_result["columns"],
                        "rows": query_result["rows"][:100],
                        "row_count": query_result["row_count"],
                        "elapsed_ms": query_result["elapsed_ms"],
                        "visualization_hint": viz_hint,
                        "truncated": query_result.get("truncated", False),
                    }
                    yield _sse("structured_result", {
                        "result_type": "query_result",
                        "card": query_card,
                    })
                    blocks = legacy_structured_result_to_blocks("query_result", query_card)
                    response_blocks.extend(blocks)
                    for block in blocks:
                        yield _sse("response_block", {"block": block})
                    result = query_result
            else:
                text = "I couldn't generate a SQL query from your request. Try rephrasing or use the SQL editor directly."
                yield _sse("token", {"text": text})
                collected_text_parts.append(text)

        elif family == INTENT_DATA_HEALTH:
            yield _sse("status", {"message": "Checking data health...", "stage": "health_check", "progress": 0.3})
            text = "Data health monitoring is available in the Admin Console. Navigate to **Admin & Ops → Data Health** to view quality scores, freshness SLAs, and anomaly alerts."
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

        elif family == INTENT_KNOWLEDGE_SEARCH:
            yield _sse("status", {"message": "Searching knowledge base...", "stage": "search", "progress": 0.3})
            text = "Knowledge search is available through the **Knowledge Explorer**. I'll route your question through the RAG pipeline for now."
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)
            # Fall through to RAG — this intent will be handled by the main LLM pipeline

        elif family == INTENT_BRIEFING_GENERATE:
            yield _sse("status", {"message": "Generating executive briefing...", "stage": "briefing", "progress": 0.3})
            text = "Executive briefing generation is available at **Briefings → Generate**. The briefing wizard will walk you through period selection, KPI snapshots, and AI-generated narratives."
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

        elif family == INTENT_COVENANT_CHECK:
            yield _sse("status", {"message": "Checking covenant compliance...", "stage": "compute", "progress": 0.3})
            tool_params: dict[str, Any] = {
                "env_id": scenario.env_id,
                "business_id": scenario.business_id,
            }
            if scenario.asset_id:
                tool_params["asset_id"] = scenario.asset_id
                result = await _exec_fast_tool(
                    ctx, "finance.check_covenant_compliance", tool_params,
                    tool_timeline, data_sources,
                )
            else:
                if scenario.fund_id:
                    tool_params["fund_id"] = scenario.fund_id
                result = await _exec_fast_tool(
                    ctx, "finance.list_covenant_alerts", tool_params,
                    tool_timeline, data_sources,
                )
            card = _build_covenant_card(result, scenario)
            yield _sse("structured_result", {"result_type": "covenant_compliance", "card": card})
            blocks = legacy_structured_result_to_blocks("covenant_compliance", card)
            response_blocks.extend(blocks)
            for block in blocks:
                yield _sse("response_block", {"block": block})

        elif family == INTENT_DDQ_DRAFT:
            yield _sse("status", {"message": "Processing DDQ — extracting questions and searching document corpus...", "stage": "compute", "progress": 0.2})
            text = (
                "DDQ drafting requires a document upload. Please upload the DDQ document and I'll:\n"
                "1. Extract all questions from the document\n"
                "2. Search your fund's document corpus for answers\n"
                "3. Draft responses with source citations\n"
                "4. Flag questions that need your direct input\n\n"
                "You can upload a DDQ via the **Documents** tab on any fund page, then ask me to process it."
            )
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

        elif family == INTENT_LP_REPORT:
            yield _sse("status", {"message": "Assembling LP report...", "stage": "compute", "progress": 0.2})
            if scenario.fund_id:
                result = await _exec_fast_tool(
                    ctx, "finance.assemble_lp_report", {
                        "fund_id": scenario.fund_id,
                        "quarter": scenario.quarter or "2026Q1",
                        "env_id": scenario.env_id,
                        "business_id": scenario.business_id,
                    },
                    tool_timeline, data_sources,
                )
                card = _build_lp_report_card(result, scenario)
                yield _sse("structured_result", {"result_type": "lp_report", "card": card})
                blocks = legacy_structured_result_to_blocks("lp_report", card)
                response_blocks.extend(blocks)
                for block in blocks:
                    yield _sse("response_block", {"block": block})
            else:
                text = "To generate an LP report, please navigate to a fund page or specify which fund you'd like the report for."
                yield _sse("token", {"text": text})
                collected_text_parts.append(text)

        elif family == INTENT_ISSUE_NOTICES:
            yield _sse("status", {"message": "Preparing notice generation...", "stage": "compute", "progress": 0.2})
            text = (
                "To generate capital call or distribution notices, I need:\n"
                "1. The fund (navigate to a fund page or specify the fund name)\n"
                "2. The capital call or distribution event to issue notices for\n\n"
                "Once on a fund's **Capital** tab, click **Issue Notices** next to the relevant event, "
                "or tell me the specific call/distribution details."
            )
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

        else:
            # Explain returns / fallback — emit as text
            text = f"I recognized this as a **{family.replace('_', ' ')}** request but the fast-path engine doesn't handle it yet. Let me use the full analysis pipeline instead."
            yield _sse("token", {"text": text})
            collected_text_parts.append(text)

        # ── Update session state ───────────────────────────────────────
        conversation_key = str(conversation_id) if conversation_id else None

        # Extract rows from result for conversational transforms
        result_rows: list[dict[str, Any]] | None = None
        if isinstance(result, dict):
            if "rows" in result and isinstance(result["rows"], list):
                result_rows = result["rows"][:200]
            elif "data" in result and isinstance(result["data"], list):
                result_rows = result["data"][:200]

        update_session(
            conversation_key,
            analysis_mode=family,
            last_result=result,
            last_result_data=result_rows,
            last_fund_id=scenario.fund_id,
            last_asset_id=scenario.asset_id,
            last_quarter=scenario.quarter,
        )
        if conversation_key and result:
            run_candidates: list[dict[str, Any]] = []
            if isinstance(result, dict):
                if result.get("run_id"):
                    run_candidates.append(result)
                for key in ("p10", "p50", "p90", "before", "after", "uw", "actual", "base", "construction_adjusted"):
                    candidate = result.get(key)
                    if isinstance(candidate, dict) and candidate.get("run_id"):
                        run_candidates.append(candidate)
            for candidate in run_candidates:
                summary = summarize_waterfall_run(
                    result=candidate,
                    fund_id=scenario.fund_id,
                    fund_name=candidate.get("fund_name"),
                    scenario_name=candidate.get("scenario_name"),
                    quarter=scenario.quarter,
                    overrides=candidate.get("overrides"),
                )
                if summary:
                    update_session(conversation_key, waterfall_run=summary)

        yield _sse("status", {"message": "Done", "stage": "results", "progress": 1.0})

    except Exception as exc:
        emit_log(
            level="error", service="backend", action="ai.gateway.repe_fast_path.error",
            message=f"REPE fast-path error: {exc}",
            context={"intent": intent.family, "error": str(exc)},
        )
        text = f"I encountered an error running the {family.replace('_', ' ')}: {exc}\n\nLet me try the full analysis pipeline instead."
        yield _sse("token", {"text": text})
        collected_text_parts.append(text)

    # ── Done ───────────────────────────────────────────────────────────
    timings["total_ms"] = int((time.time() - start) * 1000)
    if collected_text_parts:
        response_blocks.insert(0, markdown_block("".join(collected_text_parts).strip()))
    yield _sse("done", {
        "session_id": session_id,
        "trace": {
            "execution_path": "repe_fast_path", "lane": "F",
            "model": "none", "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
            "tool_call_count": len(tool_timeline), "tool_timeline": tool_timeline,
            "data_sources": data_sources, "citations": [], "rag_chunks_used": 0, "warnings": [],
            "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
            "repe": {"intent": intent.family, "fast_path": True, "confidence": intent.confidence},
            "visible_context_shortcut": False, "timings": timings,
        },
        "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": len(tool_timeline),
        "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
        "response_blocks": response_blocks,
    })


async def _exec_fast_tool(
    ctx,
    tool_name: str,
    args: dict[str, Any],
    tool_timeline: list,
    data_sources: list,
) -> dict:
    """Execute an MCP tool from the fast-path and track timing."""
    tool_start = time.time()
    tool_def = registry.get(tool_name)
    if not tool_def or not tool_def.handler:
        raise ValueError(f"Tool {tool_name} not found in registry")

    # Build pydantic input from args, filtering None values
    clean_args = {k: v for k, v in args.items() if v is not None}
    inp = tool_def.input_model(**clean_args)

    # Execute synchronously in thread pool
    result = await asyncio.get_event_loop().run_in_executor(
        None, tool_def.handler, ctx, inp,
    )

    duration_ms = int((time.time() - tool_start) * 1000)
    tool_timeline.append({
        "step": len(tool_timeline) + 1,
        "tool_name": tool_name,
        "purpose": tool_def.description[:80],
        "success": True,
        "duration_ms": duration_ms,
        "result_summary": f"Completed in {duration_ms}ms",
    })
    data_sources.append({
        "source_type": "database",
        "tool_name": tool_name,
        "row_count": 1,
    })

    return result if isinstance(result, dict) else {}


# ── Structured result card builders ──────────────────────────────────────────

def _fmt_pct(value, decimals: int = 2) -> str | None:
    """Format a decimal/float as percentage string."""
    if value is None:
        return None
    try:
        v = float(value)
        return f"{v * 100:.{decimals}f}%"
    except (TypeError, ValueError):
        return str(value)


def _fmt_mult(value) -> str | None:
    """Format as multiple (e.g. 1.65x)."""
    if value is None:
        return None
    try:
        return f"{float(value):.2f}x"
    except (TypeError, ValueError):
        return str(value)


def _fmt_dollar(value) -> str | None:
    """Format as dollar amount."""
    if value is None:
        return None
    try:
        v = float(value)
        if abs(v) >= 1_000_000:
            return f"${v / 1_000_000:,.1f}M"
        elif abs(v) >= 1_000:
            return f"${v / 1_000:,.0f}K"
        else:
            return f"${v:,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _delta_str(value, fmt_fn=_fmt_pct, direction_positive: str = "up") -> dict | None:
    """Build a delta display object."""
    if value is None:
        return None
    try:
        v = float(value)
        direction = "positive" if v >= 0 else "negative"
        prefix = "+" if v >= 0 else ""
        return {"value": f"{prefix}{fmt_fn(value)}", "direction": direction}
    except (TypeError, ValueError):
        return None


def _to_num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_scenario_card(result: dict, scenario) -> dict:
    """Build a sale scenario comparison card."""
    entity = scenario.entity_name or "Asset"
    return {
        "title": f"Sale Scenario — {entity}",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Base Gross IRR", "value": _fmt_pct(result.get("base_gross_irr")), "delta": None},
            {"label": "Scenario Gross IRR", "value": _fmt_pct(result.get("scenario_gross_irr")),
             "delta": _delta_str(result.get("irr_delta"))},
            {"label": "Base TVPI", "value": _fmt_mult(result.get("base_gross_tvpi")), "delta": None},
            {"label": "Scenario TVPI", "value": _fmt_mult(result.get("scenario_gross_tvpi")),
             "delta": _delta_str(result.get("tvpi_delta"), _fmt_mult)},
            {"label": "Scenario Net IRR", "value": _fmt_pct(result.get("scenario_net_irr")), "delta": None},
            {"label": "Scenario DPI", "value": _fmt_mult(result.get("scenario_dpi")), "delta": None},
        ],
        "parameters": {
            "Entity": entity,
            "Quarter": scenario.quarter,
            "Sale Proceeds": _fmt_dollar(result.get("total_sale_proceeds")),
            "Carry Estimate": _fmt_dollar(result.get("carry_estimate")),
        },
        "actions": [
            {"label": "Run Waterfall", "action": "run_waterfall", "params": {"fund_id": scenario.fund_id}},
            {"label": "Stress +50bps", "action": "stress_cap_rate", "params": {"fund_id": scenario.fund_id, "cap_rate_delta_bps": 50}},
            {"label": "Compare to Base", "action": "compare_scenarios", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_waterfall_card(result: dict, scenario) -> dict:
    """Build a waterfall breakdown card."""
    allocations = result.get("allocations", [])

    tier_rows = []
    for alloc in allocations:
        tier_rows.append({
            "tier": alloc.get("tier_code", ""),
            "participant": alloc.get("participant_id", ""),
            "payout_type": alloc.get("payout_type", ""),
            "amount": _fmt_dollar(alloc.get("amount")),
        })

    # Build tier-by-tier explanation
    explanation_parts = []
    tier_totals: dict[str, float] = {}
    for alloc in allocations:
        tc = alloc.get("tier_code", "")
        amt = float(alloc.get("amount") or 0)
        tier_totals[tc] = tier_totals.get(tc, 0) + amt

    for tc, total in tier_totals.items():
        label = tc.replace("_", " ").title()
        if "return_of_capital" in tc:
            explanation_parts.append(f"**{label}**: {_fmt_dollar(total)} — LPs receive their invested capital back before any profit split.")
        elif "preferred_return" in tc:
            explanation_parts.append(f"**{label}**: {_fmt_dollar(total)} — LPs receive a preferred return (typically 8%) on contributed capital.")
        elif "catch_up" in tc:
            explanation_parts.append(f"**{label}**: {_fmt_dollar(total)} — GP receives catch-up carry to reach their target share of total profits.")
        elif "carried_interest" in tc or "split" in tc:
            explanation_parts.append(f"**{label}**: {_fmt_dollar(total)} — Remaining profits split between LP and GP per the partnership agreement.")
        else:
            explanation_parts.append(f"**{label}**: {_fmt_dollar(total)}")

    sections = []
    if explanation_parts:
        sections.append({
            "title": "Waterfall Explanation",
            "content": "\n".join(explanation_parts),
        })

    return {
        "title": "Waterfall Distribution",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Total Distributed", "value": _fmt_dollar(result.get("total_distributed")), "delta": None},
            {"label": "GP Carry", "value": _fmt_dollar(result.get("gp_carry")), "delta": None},
            {"label": "LP Return", "value": _fmt_dollar(result.get("lp_total")), "delta": None},
        ],
        "tiers": tier_rows,
        "sections": sections,
        "parameters": {"Quarter": scenario.quarter, "Fund": scenario.fund_id},
        "actions": [
            {"label": "LP Summary", "action": "lp_summary", "params": {"fund_id": scenario.fund_id}},
            {"label": "Fund Metrics", "action": "fund_metrics", "params": {"fund_id": scenario.fund_id}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {
                "context_type": "waterfall",
                "fund_id": scenario.fund_id,
                "quarter": scenario.quarter,
            }},
        ],
    }


def _build_metrics_card(result: dict, scenario) -> dict:
    """Build a fund metrics card."""
    metrics = result.get("metrics", {})
    state = result.get("state", {})
    bridge = result.get("gross_net_bridge", {})

    return {
        "title": "Fund Performance",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Gross IRR", "value": _fmt_pct(metrics.get("gross_irr")), "delta": None},
            {"label": "Net IRR", "value": _fmt_pct(metrics.get("net_irr")), "delta": None},
            {"label": "Gross TVPI", "value": _fmt_mult(metrics.get("gross_tvpi")), "delta": None},
            {"label": "Net TVPI", "value": _fmt_mult(metrics.get("net_tvpi")), "delta": None},
            {"label": "DPI", "value": _fmt_mult(metrics.get("dpi")), "delta": None},
            {"label": "RVPI", "value": _fmt_mult(metrics.get("rvpi")), "delta": None},
        ],
        "parameters": {
            "NAV": _fmt_dollar(state.get("portfolio_nav")),
            "Total Called": _fmt_dollar(state.get("total_called")),
            "Total Distributed": _fmt_dollar(state.get("total_distributed")),
            "Mgmt Fees": _fmt_dollar(bridge.get("mgmt_fees")),
            "Fund Expenses": _fmt_dollar(bridge.get("fund_expenses")),
        },
        "actions": [
            {"label": "Run Waterfall", "action": "run_waterfall", "params": {"fund_id": scenario.fund_id}},
            {"label": "Stress Cap Rate", "action": "stress_cap_rate", "params": {"fund_id": scenario.fund_id}},
            {"label": "LP Summary", "action": "lp_summary", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_stress_card(result: dict, scenario) -> dict:
    """Build a cap rate stress test card."""
    assets = result.get("assets", [])
    top_impacts = sorted(assets, key=lambda a: abs(a.get("nav_impact", 0)), reverse=True)[:5]

    return {
        "title": f"Cap Rate Stress: +{result.get('cap_rate_delta_bps', 50)}bps",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Base NAV", "value": _fmt_dollar(result.get("base_nav")), "delta": None},
            {"label": "Stressed NAV", "value": _fmt_dollar(result.get("stressed_nav")),
             "delta": {"value": f"{result.get('nav_delta_pct', 0):+.1f}%", "direction": "negative" if result.get("nav_delta_pct", 0) < 0 else "positive"}},
            {"label": "NAV Impact", "value": _fmt_dollar(result.get("nav_delta")), "delta": None},
        ],
        "assets": [
            {"name": a.get("asset_name", ""), "base": _fmt_dollar(a.get("base_valuation")),
             "stressed": _fmt_dollar(a.get("stressed_valuation")), "impact": _fmt_dollar(a.get("nav_impact"))}
            for a in top_impacts
        ],
        "parameters": {
            "Delta": f"+{result.get('cap_rate_delta_bps', 50)}bps",
            "Assets Affected": str(len(assets)),
        },
        "actions": [
            {"label": "Run Sale Scenario", "action": "run_sale_scenario", "params": {"fund_id": scenario.fund_id}},
            {"label": "Fund Metrics", "action": "fund_metrics", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_lp_card(result: dict, scenario) -> dict:
    """Build an LP summary card."""
    partners = result.get("partners", [])
    fund_metrics = result.get("fund_metrics", {})

    return {
        "title": "LP Summary",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Gross IRR", "value": _fmt_pct(fund_metrics.get("gross_irr")), "delta": None},
            {"label": "Net IRR", "value": _fmt_pct(fund_metrics.get("net_irr")), "delta": None},
            {"label": "TVPI", "value": _fmt_mult(fund_metrics.get("gross_tvpi")), "delta": None},
            {"label": "DPI", "value": _fmt_mult(fund_metrics.get("dpi")), "delta": None},
        ],
        "partners": [
            {
                "name": p.get("name", ""),
                "type": p.get("partner_type", ""),
                "committed": _fmt_dollar(p.get("committed")),
                "contributed": _fmt_dollar(p.get("contributed")),
                "distributed": _fmt_dollar(p.get("distributed")),
                "nav_share": _fmt_dollar(p.get("nav_share")),
                "tvpi": _fmt_mult(p.get("tvpi")),
                "dpi": _fmt_mult(p.get("dpi")),
            }
            for p in partners
        ],
        "parameters": {
            "Total Committed": _fmt_dollar(result.get("total_committed")),
            "Total Contributed": _fmt_dollar(result.get("total_contributed")),
            "Fund NAV": _fmt_dollar(result.get("fund_nav")),
        },
        "actions": [
            {"label": "Run Waterfall", "action": "run_waterfall", "params": {"fund_id": scenario.fund_id}},
            {"label": "Fund Metrics", "action": "fund_metrics", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_investor_list_card(result: dict, scenario) -> dict:
    """Build an investor list card."""
    investors = result.get("investors", [])
    total_committed = sum(float(inv.get("total_committed") or 0) for inv in investors)
    return {
        "title": "Investors",
        "subtitle": f"Business: {scenario.business_id or 'All'}",
        "metrics": [
            {"label": "Total Investors", "value": str(len(investors)), "delta": None},
            {"label": "Total Committed", "value": _fmt_dollar(total_committed), "delta": None},
        ],
        "table": {
            "columns": ["Name", "Type", "Funds", "Total Committed"],
            "rows": [
                {
                    "Name": inv.get("name", ""),
                    "Type": (inv.get("partner_type") or "").upper(),
                    "Funds": str(inv.get("fund_count", 0)),
                    "Total Committed": _fmt_dollar(inv.get("total_committed")),
                }
                for inv in investors
            ],
        },
        "actions": [
            {"label": "View Investors", "action": "navigate", "params": {"path": "investors"}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {
                "context_type": "investor_list",
                "quarter": scenario.quarter,
            }},
        ],
    }


def _build_capital_activity_card(result: dict, scenario) -> dict:
    """Build a capital activity card."""
    entries = result.get("entries", [])
    totals = result.get("totals", {})
    total_contributed = float(totals.get("contribution", 0)) + float(totals.get("capital_call", 0))
    total_distributed = float(totals.get("distribution", 0))
    net_flow = total_contributed - total_distributed
    return {
        "title": "Capital Activity",
        "subtitle": f"Quarter: {scenario.quarter or 'All'}" if scenario.quarter else "Recent Activity",
        "metrics": [
            {"label": "Total Called", "value": _fmt_dollar(total_contributed), "delta": None},
            {"label": "Total Distributed", "value": _fmt_dollar(total_distributed), "delta": None},
            {"label": "Net Capital Flow", "value": _fmt_dollar(net_flow), "delta": None},
            {"label": "Entries", "value": str(len(entries)), "delta": None},
        ],
        "table": {
            "columns": ["Date", "Type", "Fund", "Partner", "Amount", "Memo"],
            "rows": [
                {
                    "Date": e.get("effective_date", ""),
                    "Type": (e.get("entry_type") or "").replace("_", " ").title(),
                    "Fund": e.get("fund_name", ""),
                    "Partner": e.get("partner_name", ""),
                    "Amount": _fmt_dollar(e.get("amount")),
                    "Memo": e.get("memo") or "",
                }
                for e in entries[:50]
            ],
        },
        "actions": [
            {"label": "Export CSV", "action": "export_csv", "params": {"context_type": "capital_activity"}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {
                "context_type": "capital_activity",
                "quarter": scenario.quarter,
            }},
        ],
    }


def _build_nav_rollforward_card(result: dict, scenario) -> dict:
    """Build a NAV rollforward card."""
    prior_nav = float(result.get("prior_nav") or 0)
    current_nav = float(result.get("current_nav") or 0)
    nav_change = float(result.get("nav_change") or 0)
    nav_change_pct = result.get("nav_change_pct", "0")
    bridge = result.get("bridge", [])
    investment_changes = result.get("investment_changes", [])
    fund_name = result.get("fund_name", "")
    return {
        "title": f"NAV Rollforward — {fund_name}" if fund_name else "NAV Rollforward",
        "subtitle": f"{result.get('quarter_from', '')} → {result.get('quarter_to', '')}",
        "metrics": [
            {"label": "Prior NAV", "value": _fmt_dollar(prior_nav), "delta": None},
            {"label": "Current NAV", "value": _fmt_dollar(current_nav), "delta": None},
            {"label": "Change", "value": _fmt_dollar(nav_change), "delta": f"{nav_change_pct}%"},
        ],
        "table": {
            "columns": ["Driver", "Amount"],
            "rows": [
                {"Driver": item.get("driver", ""), "Amount": _fmt_dollar(item.get("amount"))}
                for item in bridge
            ],
        },
        "sections": ([{
            "title": "Investment-Level Changes",
            "content": "\n".join(
                f"- **{ic['investment']}**: {_fmt_dollar(ic.get('prior_nav'))} → {_fmt_dollar(ic.get('current_nav'))} ({_fmt_dollar(ic.get('change'))})"
                for ic in investment_changes[:10]
            ),
        }] if investment_changes else []),
        "actions": [
            {"label": "Fund Metrics", "action": "fund_metrics", "params": {"fund_id": scenario.fund_id}},
            {"label": "LP Summary", "action": "lp_summary", "params": {"fund_id": scenario.fund_id}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {
                "context_type": "nav_rollforward",
                "fund_id": scenario.fund_id,
                "quarter": scenario.quarter,
            }},
        ],
    }


def _build_comparison_card(result: dict, scenario) -> dict:
    """Build a scenario comparison card."""
    scenarios = result.get("scenarios", [])
    return {
        "title": "Scenario Comparison",
        "subtitle": f"Quarter: {scenario.quarter}",
        "scenarios": [
            {
                "scenario_id": s.get("scenario_id"),
                "gross_irr": _fmt_pct(s.get("gross_irr")),
                "net_irr": _fmt_pct(s.get("net_irr")),
                "tvpi": _fmt_mult(s.get("gross_tvpi")),
                "dpi": _fmt_mult(s.get("dpi")),
                "nav": _fmt_dollar(s.get("portfolio_nav")),
            }
            for s in scenarios
        ],
        "parameters": {"Scenarios Compared": str(len(scenarios))},
        "actions": [
            {"label": "Fund Metrics", "action": "fund_metrics", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_mc_waterfall_card(result: dict, scenario) -> dict:
    def _metric(label: str, key: str) -> dict:
        p10 = result.get("p10", {}).get("summary", {}).get(key)
        p50 = result.get("p50", {}).get("summary", {}).get(key)
        p90 = result.get("p90", {}).get("summary", {}).get(key)
        return {
            "label": label,
            "value": f"P10 {_fmt_dollar(p10) if 'carry' in key or 'total' in key or key == 'nav' else _fmt_mult(p10) if 'tvpi' in key else _fmt_pct(p10)} | "
                     f"P50 {_fmt_dollar(p50) if 'carry' in key or 'total' in key or key == 'nav' else _fmt_mult(p50) if 'tvpi' in key else _fmt_pct(p50)} | "
                     f"P90 {_fmt_dollar(p90) if 'carry' in key or 'total' in key or key == 'nav' else _fmt_mult(p90) if 'tvpi' in key else _fmt_pct(p90)}",
            "delta": None,
        }

    return {
        "title": "Monte Carlo Waterfall",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            _metric("LP Return", "lp_total"),
            _metric("GP Carry", "gp_carry"),
            _metric("Net TVPI", "net_tvpi"),
        ],
        "table": {
            "columns": ["percentile", "nav", "lp_total", "gp_carry", "net_tvpi"],
            "rows": [
                {
                    "percentile": "P10",
                    "nav": _fmt_dollar(result.get("p10", {}).get("summary", {}).get("nav")),
                    "lp_total": _fmt_dollar(result.get("p10", {}).get("summary", {}).get("lp_total")),
                    "gp_carry": _fmt_dollar(result.get("p10", {}).get("summary", {}).get("gp_carry")),
                    "net_tvpi": _fmt_mult(result.get("p10", {}).get("summary", {}).get("net_tvpi")),
                },
                {
                    "percentile": "P50",
                    "nav": _fmt_dollar(result.get("p50", {}).get("summary", {}).get("nav")),
                    "lp_total": _fmt_dollar(result.get("p50", {}).get("summary", {}).get("lp_total")),
                    "gp_carry": _fmt_dollar(result.get("p50", {}).get("summary", {}).get("gp_carry")),
                    "net_tvpi": _fmt_mult(result.get("p50", {}).get("summary", {}).get("net_tvpi")),
                },
                {
                    "percentile": "P90",
                    "nav": _fmt_dollar(result.get("p90", {}).get("summary", {}).get("nav")),
                    "lp_total": _fmt_dollar(result.get("p90", {}).get("summary", {}).get("lp_total")),
                    "gp_carry": _fmt_dollar(result.get("p90", {}).get("summary", {}).get("gp_carry")),
                    "net_tvpi": _fmt_mult(result.get("p90", {}).get("summary", {}).get("net_tvpi")),
                },
            ],
        },
        "parameters": {
            "Fund": scenario.fund_id,
            "Template": scenario.scenario_template,
        },
        "actions": [
            {"label": "Run Waterfall", "action": "run_waterfall", "params": {"fund_id": scenario.fund_id}},
        ],
    }


def _build_portfolio_waterfall_card(result: dict, scenario) -> dict:
    funds = result.get("funds", [])
    portfolio = result.get("portfolio", {})
    return {
        "title": "Portfolio Waterfall",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Total NAV", "value": _fmt_dollar(portfolio.get("total_nav")), "delta": None},
            {"label": "Weighted IRR", "value": _fmt_pct(portfolio.get("weighted_irr")), "delta": None},
            {"label": "Total Carry", "value": _fmt_dollar(portfolio.get("total_carry")), "delta": None},
            {"label": "LP Shortfall", "value": _fmt_dollar(portfolio.get("total_lp_shortfall")), "delta": None},
        ],
        "scenarios": [
            {
                "scenario_id": fund.get("fund_id"),
                "gross_irr": _fmt_pct(fund.get("net_irr")),
                "tvpi": _fmt_mult(fund.get("lp_total")),
                "dpi": _fmt_dollar(fund.get("carry")),
                "nav": _fmt_dollar(fund.get("nav")),
            }
            for fund in funds
        ],
        "table": {
            "columns": ["fund_name", "fund_id", "nav", "net_irr", "carry", "lp_shortfall", "return_share"],
            "rows": [
                {
                    "fund_name": fund.get("fund_name") or fund.get("fund_id"),
                    "fund_id": fund.get("fund_id"),
                    "nav": _fmt_dollar(fund.get("nav")),
                    "net_irr": _fmt_pct(fund.get("net_irr")),
                    "carry": _fmt_dollar(fund.get("carry")),
                    "lp_shortfall": _fmt_dollar(fund.get("lp_shortfall")),
                    "return_share": f"{float(fund.get('return_share') or 0):.1%}" if fund.get("return_share") is not None else "—",
                }
                for fund in funds
            ],
        },
        "parameters": {
            "Funds": str(len(funds)),
            "Diversification": f"{float(result.get('diversification_score') or 0):.1f}",
        },
    }


def _build_pipeline_radar_card(result: dict, scenario) -> dict:
    top_5 = result.get("top_5", [])
    return {
        "title": "Pipeline Radar",
        "subtitle": "Top opportunities by composite score",
        "metrics": [
            {"label": "Deals Scored", "value": str(result.get("count", len(top_5))), "delta": None},
        ],
        "table": {
            "columns": ["deal_name", "opportunity_score", "risk_score", "composite_score"],
            "rows": [
                {
                    "deal_name": deal.get("deal_name", ""),
                    "opportunity_score": f"{float(deal.get('opportunity_score', 0)):.1f}",
                    "risk_score": f"{float(deal.get('risk_score', 0)):.1f}",
                    "composite_score": f"{float(deal.get('composite_score', 0)):.1f}",
                }
                for deal in top_5
            ],
        },
        "assets": [
            {
                "name": deal.get("deal_name", ""),
                "base": f"Opp {deal.get('opportunity_score', 0):.1f}",
                "stressed": f"Risk {deal.get('risk_score', 0):.1f}",
                "impact": f"{deal.get('composite_score', 0):.1f}",
            }
            for deal in top_5
        ],
    }


def _build_capital_call_card(result: dict, scenario) -> dict:
    before = result.get("before", {}).get("summary", {})
    after = result.get("after", {}).get("summary", {})
    return {
        "title": "Capital Call Impact",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Additional Call", "value": _fmt_dollar(result.get("additional_call_amount")), "delta": None},
            {"label": "LP Return", "value": _fmt_dollar(after.get("lp_total")), "delta": _delta_str(result.get("deltas", {}).get("lp_total"), _fmt_dollar)},
            {"label": "GP Carry", "value": _fmt_dollar(after.get("gp_carry")), "delta": _delta_str(result.get("deltas", {}).get("gp_carry"), _fmt_dollar)},
            {"label": "Net TVPI", "value": _fmt_mult(after.get("net_tvpi")), "delta": _delta_str(result.get("deltas", {}).get("net_tvpi"), _fmt_mult)},
        ],
        "parameters": {
            "Before LP Return": _fmt_dollar(before.get("lp_total")),
            "After LP Return": _fmt_dollar(after.get("lp_total")),
        },
    }


def _build_clawback_card(result: dict, scenario) -> dict:
    return {
        "title": "Clawback Risk",
        "subtitle": f"Quarter: {scenario.quarter}",
        "metrics": [
            {"label": "Risk Level", "value": str(result.get("risk_level") or "none").title(), "delta": None},
            {"label": "Clawback Liability", "value": _fmt_dollar(result.get("clawback_liability")), "delta": None},
            {"label": "Outstanding", "value": _fmt_dollar(result.get("clawback_outstanding")), "delta": None},
            {"label": "Promote Outstanding", "value": _fmt_dollar(result.get("promote_outstanding")), "delta": None},
        ],
    }


def _build_uw_vs_actual_card(result: dict, scenario) -> dict:
    uw = result.get("uw", {}).get("summary", {})
    actual = result.get("actual", {}).get("summary", {})
    attribution = result.get("attribution", {})
    return {
        "title": "UW vs Actual Waterfall",
        "subtitle": attribution.get("largest_driver") or scenario.quarter,
        "metrics": [
            {"label": "UW IRR", "value": _fmt_pct(uw.get("net_irr")), "delta": None},
            {"label": "Actual IRR", "value": _fmt_pct(actual.get("net_irr")), "delta": _delta_str(attribution.get("irr_attribution", {}).get("delta"))},
            {"label": "UW NAV", "value": _fmt_dollar(uw.get("nav")), "delta": None},
            {"label": "Actual NAV", "value": _fmt_dollar(actual.get("nav")), "delta": _delta_str(attribution.get("nav_attribution", {}).get("delta"), _fmt_dollar)},
        ],
        "parameters": {
            "Largest Driver": attribution.get("largest_driver"),
            "Narrative": result.get("narrative_hint"),
        },
        "table": {
            "columns": ["tier", "uw_amount", "actual_amount", "delta"],
            "rows": [
                {
                    "tier": row.get("tier") or row.get("tier_code"),
                    "uw_amount": _fmt_dollar(row.get("uw_amount")),
                    "actual_amount": _fmt_dollar(row.get("actual_amount")),
                    "delta": _fmt_dollar(row.get("delta")),
                }
                for row in attribution.get("tier_attribution", [])
            ],
        },
    }


def _build_sensitivity_card(result: dict, scenario) -> dict:
    rows = result.get("rows", [])
    best = None
    for r in rows:
        for value in r:
            if value is None:
                continue
            best = value if best is None else max(best, value)
    return {
        "title": "Sensitivity Matrix",
        "subtitle": f"Metric: {result.get('metric_name')}",
        "metrics": [
            {"label": "Base Value", "value": str(result.get("base_value")), "delta": None},
            {"label": "Best Cell", "value": str(best) if best is not None else "—", "delta": None},
        ],
        "heatmap": {
            "title": "Cap Rate vs NOI Stress",
            "col_headers": result.get("col_headers", []),
            "row_headers": result.get("row_headers", []),
            "rows": result.get("rows", []),
            "base_value": result.get("base_value"),
        },
        "parameters": {
            "Cap Rate Steps": str(len(result.get("col_headers", []))),
            "NOI Steps": str(len(result.get("row_headers", []))),
        },
    }


def _build_construction_waterfall_card(result: dict, scenario) -> dict:
    base = result.get("base", {}).get("summary", {})
    adjusted = result.get("construction_adjusted", {}).get("summary", {})
    return {
        "title": "Construction Impact",
        "subtitle": f"Stabilization: {result.get('stabilization_date')}",
        "metrics": [
            {"label": "Months to Stabilize", "value": str(result.get("months_to_stabilization")), "delta": None},
            {"label": "Base LP Return", "value": _fmt_dollar(base.get("lp_total")), "delta": None},
            {"label": "Adjusted LP Return", "value": _fmt_dollar(adjusted.get("lp_total")), "delta": _delta_str((_to_num(adjusted.get("lp_total")) or 0) - (_to_num(base.get("lp_total")) or 0), _fmt_dollar)},
            {"label": "Exit Shift", "value": f"{result.get('exit_shift_applied', 0)} mo", "delta": None},
        ],
    }


def _build_waterfall_memo_card(result: dict) -> dict:
    sections = result.get("sections") or []
    metadata = result.get("metadata") or {}
    return {
        "title": f"Waterfall Memo: {metadata.get('fund_name') or 'IC Draft'}",
        "subtitle": metadata.get("quarter"),
        "sections": [
            {
                "title": section.get("title") or "Section",
                "content": section.get("body") or section.get("content") or "",
            }
            for section in sections
        ],
        "parameters": {
            "Base Run": metadata.get("scenarios_compared", {}).get("base"),
            "Scenario Run": metadata.get("scenarios_compared", {}).get("scenario"),
        },
    }


def _build_session_waterfall_card(session_state) -> dict:
    runs = list(session_state.waterfall_runs)
    best = max(runs, key=lambda item: _to_num(item.get("key_metrics", {}).get("irr")) or float("-inf"), default=None)
    return {
        "title": "Session Waterfall Runs",
        "subtitle": best.get("scenario_name") if best else None,
        "metrics": [
            {"label": "Tracked Runs", "value": str(len(runs)), "delta": None},
            {"label": "Best IRR", "value": _fmt_pct(best.get("key_metrics", {}).get("irr")) if best else "—", "delta": None},
        ],
        "session_waterfall_runs": runs,
        "scenarios": [
            {
                "scenario_id": item.get("scenario_name") or item.get("run_id"),
                "gross_irr": _fmt_pct(item.get("key_metrics", {}).get("irr")),
                "tvpi": _fmt_mult(item.get("key_metrics", {}).get("tvpi")),
                "dpi": _fmt_dollar(item.get("key_metrics", {}).get("carry")),
                "nav": _fmt_dollar(item.get("key_metrics", {}).get("nav")),
            }
            for item in runs
        ],
    }


def _build_capital_calls_card(result: dict, scenario) -> dict:
    """Build card for capital call list."""
    calls = result.get("capital_calls", [])
    total_requested = sum(float(c.get("amount_requested") or 0) for c in calls)
    total_contributed = sum(float(c.get("total_contributed") or 0) for c in calls)
    return {
        "title": "Capital Calls",
        "subtitle": f"{len(calls)} calls found",
        "metrics": [
            {"label": "Total Calls", "value": str(len(calls)), "delta": None},
            {"label": "Total Requested", "value": _fmt_dollar(total_requested), "delta": None},
            {"label": "Total Contributed", "value": _fmt_dollar(total_contributed), "delta": None},
        ],
        "table": {
            "columns": ["Call #", "Fund", "Call Date", "Due Date", "Requested", "Contributed", "Status"],
            "rows": [
                [
                    c.get("call_number", "—"),
                    c.get("fund_name", "—"),
                    c.get("call_date", "—"),
                    c.get("due_date", "—"),
                    _fmt_dollar(c.get("amount_requested")),
                    _fmt_dollar(c.get("total_contributed")),
                    c.get("status", "—"),
                ]
                for c in calls[:20]
            ],
        },
        "actions": [
            {"label": "View All Capital Calls", "action": "view_capital_calls", "params": {}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {"context_type": "capital_calls", "fund_id": scenario.fund_id, "quarter": scenario.quarter}},
        ],
    }


def _build_distributions_card(result: dict, scenario) -> dict:
    """Build card for distribution list."""
    events = result.get("distributions", [])
    total_amount = sum(float(e.get("total_amount") or 0) for e in events)
    return {
        "title": "Distribution Events",
        "subtitle": f"{len(events)} events found",
        "metrics": [
            {"label": "Total Events", "value": str(len(events)), "delta": None},
            {"label": "Total Distributed", "value": _fmt_dollar(total_amount), "delta": None},
        ],
        "table": {
            "columns": ["Type", "Fund", "Effective Date", "Amount", "Payouts", "Status"],
            "rows": [
                [
                    (e.get("event_type") or "—").replace("_", " ").title(),
                    e.get("fund_name", "—"),
                    e.get("effective_date", "—"),
                    _fmt_dollar(e.get("total_amount")),
                    str(e.get("payout_count", 0)),
                    e.get("status", "—"),
                ]
                for e in events[:20]
            ],
        },
        "actions": [
            {"label": "View All Distributions", "action": "view_distributions", "params": {}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {"context_type": "distributions", "fund_id": scenario.fund_id, "quarter": scenario.quarter}},
        ],
    }


def _build_period_close_card(result: dict, scenario) -> dict:
    """Build card for period close status."""
    runs = result.get("runs", [])
    completed = [r for r in runs if r.get("status") == "completed"]
    return {
        "title": "Period Close Status",
        "subtitle": f"{len(runs)} close runs",
        "metrics": [
            {"label": "Total Runs", "value": str(len(runs)), "delta": None},
            {"label": "Completed", "value": str(len(completed)), "delta": None},
        ],
        "table": {
            "columns": ["Fund", "Quarter", "Status", "Triggered By", "Started", "Completed"],
            "rows": [
                [
                    r.get("fund_name", "—"),
                    r.get("quarter", "—"),
                    r.get("status", "—"),
                    r.get("triggered_by", "—"),
                    (r.get("started_at") or "—")[:19],
                    (r.get("completed_at") or "—")[:19],
                ]
                for r in runs[:20]
            ],
        },
        "actions": [
            {"label": "View Period Close", "action": "view_period_close", "params": {}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {"context_type": "period_close", "fund_id": scenario.fund_id, "quarter": scenario.quarter}},
        ],
    }


def _build_fee_schedule_card(result: dict, scenario) -> dict:
    """Build card for fee schedule."""
    policies = result.get("policies", [])
    accruals = result.get("accruals", [])
    total_accrued = sum(float(a.get("accrued_amount") or 0) for a in accruals)
    return {
        "title": "Fee Schedule",
        "subtitle": f"{len(policies)} policies",
        "metrics": [
            {"label": "Policies", "value": str(len(policies)), "delta": None},
            {"label": "Total Accrued", "value": _fmt_dollar(total_accrued), "delta": None},
        ],
        "table": {
            "columns": ["Fund", "Fee Basis", "Annual Rate", "Start Date", "Stepdown Date", "Stepdown Rate"],
            "rows": [
                [
                    p.get("fund_name", "—"),
                    (p.get("fee_basis") or "—").replace("_", " ").title(),
                    _fmt_pct(p.get("annual_rate")),
                    p.get("start_date", "—"),
                    p.get("stepdown_date", "—"),
                    _fmt_pct(p.get("stepdown_rate")),
                ]
                for p in policies[:20]
            ],
        },
        "actions": [
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {"context_type": "fees", "fund_id": scenario.fund_id, "quarter": scenario.quarter}},
        ],
    }


def _build_variance_card(result: dict, scenario) -> dict:
    """Build card for NOI variance analysis."""
    items = result.get("variance_items", [])
    summary = result.get("summary", {})
    return {
        "title": "Budget vs Actual Variance",
        "subtitle": f"{len(items)} line items",
        "metrics": [
            {"label": "Total Actual", "value": _fmt_dollar(summary.get("total_actual")), "delta": None},
            {"label": "Total Plan", "value": _fmt_dollar(summary.get("total_plan")), "delta": None},
            {"label": "Total Variance", "value": _fmt_dollar(summary.get("total_variance")), "delta": {
                "value": _fmt_pct(summary.get("avg_variance_pct")),
                "direction": "positive" if float(summary.get("avg_variance_pct") or 0) >= 0 else "negative",
            } if summary.get("avg_variance_pct") else None},
        ],
        "table": {
            "columns": ["Asset", "Line Code", "Actual", "Plan", "Variance $", "Variance %"],
            "rows": [
                [
                    i.get("asset_name", "—"),
                    i.get("line_code", "—"),
                    _fmt_dollar(i.get("actual_amount")),
                    _fmt_dollar(i.get("plan_amount")),
                    _fmt_dollar(i.get("variance_amount")),
                    _fmt_pct(i.get("variance_pct")),
                ]
                for i in items[:30]
            ],
        },
        "actions": [
            {"label": "View Variance Dashboard", "action": "view_variance", "params": {}},
            {"label": "Create Follow-Up Task", "action": "create_task", "params": {"context_type": "variance", "fund_id": scenario.fund_id, "quarter": scenario.quarter}},
        ],
    }


def _build_approvals_card(result: dict, scenario) -> dict:
    """Build card for approvals list."""
    approvals = result.get("approvals", [])
    pending = [a for a in approvals if a.get("status") == "pending"]
    return {
        "title": "Approval Queue",
        "subtitle": f"{len(pending)} pending approvals",
        "metrics": [
            {"label": "Total", "value": str(len(approvals)), "delta": None},
            {"label": "Pending", "value": str(len(pending)), "delta": None},
        ],
        "table": {
            "columns": ["Step", "Workflow", "Entity", "Actor", "Status", "Due Date"],
            "rows": [
                [
                    a.get("step_label", "—"),
                    a.get("workflow_name", "—"),
                    a.get("entity_type", "—"),
                    a.get("actor", "—"),
                    a.get("status", "—"),
                    (a.get("due_date") or "—")[:10],
                ]
                for a in approvals[:20]
            ],
        },
        "actions": [],
    }


def _build_documents_card(result: dict, scenario) -> dict:
    """Build card for documents list."""
    docs = result.get("documents", [])
    return {
        "title": "Document Library",
        "subtitle": f"{len(docs)} documents",
        "metrics": [
            {"label": "Documents", "value": str(len(docs)), "delta": None},
        ],
        "table": {
            "columns": ["Title", "Classification", "Domain", "Status", "Updated"],
            "rows": [
                [
                    d.get("title", "—"),
                    (d.get("classification") or "—").replace("_", " ").title(),
                    (d.get("domain") or "—").title(),
                    d.get("status", "—"),
                    (d.get("updated_at") or "—")[:10],
                ]
                for d in docs[:20]
            ],
        },
        "actions": [
            {"label": "View Document Library", "action": "view_documents", "params": {}},
        ],
    }


def _build_saved_analyses_card(result: dict, scenario) -> dict:
    """Build card for saved analyses list."""
    analyses = result.get("analyses", [])
    return {
        "title": "Saved Analyses",
        "subtitle": f"{len(analyses)} saved analyses",
        "metrics": [
            {"label": "Total", "value": str(len(analyses)), "delta": None},
        ],
        "table": {
            "columns": ["Title", "Source Prompt", "Created By", "Created"],
            "rows": [
                [
                    a.get("title", "—"),
                    (a.get("nl_prompt") or "—")[:60],
                    a.get("created_by", "—"),
                    (a.get("created_at") or "—")[:10],
                ]
                for a in analyses[:20]
            ],
        },
        "actions": [],
    }


def _build_covenant_card(result: dict, scenario) -> dict:
    """Build a summary card for covenant compliance check."""
    if "loans" in result:
        # Asset-level compliance check
        total = result.get("total_covenants", 0)
        breaches = result.get("total_breaches", 0)
        loans = result.get("loans", [])
        return {
            "title": "Covenant Compliance",
            "subtitle": f"{total} covenants tested \u2022 {breaches} breach{'es' if breaches != 1 else ''}",
            "metrics": [
                {"label": "Total Covenants", "value": str(total), "delta": None},
                {"label": "Breaches", "value": str(breaches), "delta": f"-{breaches}" if breaches else None},
                {"label": "NOI", "value": f"${result.get('noi', 0):,.0f}", "delta": None},
                {"label": "Asset Value", "value": f"${result.get('asset_value', 0):,.0f}", "delta": None},
            ],
            "parameters": {
                "Quarter": result.get("quarter", scenario.quarter or "N/A"),
                "Loans": str(len(loans)),
            },
            "rows": [
                {
                    "loan": loan.get("loan_name", "Unknown"),
                    "dscr": f"{loan['metrics']['dscr']:.2f}x" if loan.get("metrics", {}).get("dscr") else "N/A",
                    "ltv": f"{loan['metrics']['ltv']:.1%}" if loan.get("metrics", {}).get("ltv") else "N/A",
                    "status": "BREACH" if any(not c["passed"] for c in loan.get("covenants", [])) else "PASS",
                }
                for loan in loans
            ],
        }
    else:
        # Portfolio-level alerts
        alerts = result.get("alerts", [])
        return {
            "title": "Covenant Alerts",
            "subtitle": f"{len(alerts)} active alert{'s' if len(alerts) != 1 else ''}",
            "metrics": [
                {"label": "Total Alerts", "value": str(len(alerts)), "delta": None},
                {"label": "Critical", "value": str(sum(1 for a in alerts if a.get("severity") == "critical")), "delta": None},
                {"label": "Breaches", "value": str(sum(1 for a in alerts if a.get("severity") == "breach")), "delta": None},
                {"label": "Warnings", "value": str(sum(1 for a in alerts if a.get("severity") == "warning")), "delta": None},
            ],
            "rows": [
                {
                    "loan": a.get("loan_name", "Unknown"),
                    "metric": a.get("metric", ""),
                    "current": f"{a['current_value']:.2f}" if a.get("current_value") is not None else "N/A",
                    "threshold": f"{a['threshold']:.2f}" if a.get("threshold") is not None else "N/A",
                    "severity": a.get("severity", ""),
                }
                for a in alerts[:20]
            ],
        }


def _build_lp_report_card(result: dict, scenario) -> dict:
    """Build a summary card for an assembled LP report."""
    fund_summary = result.get("fund_summary", {})
    return {
        "title": f"LP Report — {result.get('fund_name', 'Fund')}",
        "subtitle": f"Quarter {result.get('quarter', scenario.quarter or 'N/A')}",
        "metrics": [
            {"label": "Net IRR", "value": f"{fund_summary.get('net_irr', 0):.1%}", "delta": None},
            {"label": "TVPI", "value": f"{fund_summary.get('tvpi', 0):.2f}x", "delta": None},
            {"label": "DPI", "value": f"{fund_summary.get('dpi', 0):.2f}x", "delta": None},
            {"label": "NAV", "value": f"${fund_summary.get('nav', 0):,.0f}", "delta": None},
        ],
        "parameters": {
            "Investors": str(len(result.get("investor_statements", []))),
            "Assets": str(len(result.get("asset_highlights", []))),
            "Status": result.get("status", "draft"),
        },
        "actions": [
            {"label": "Download Report", "action": "download_lp_report", "params": {"report_id": str(result.get("report_id", ""))}},
            {"label": "Generate GP Narrative", "action": "generate_narrative", "params": {}},
        ],
    }


def _build_dashboard_card(spec: dict) -> dict:
    """Build a summary card for a generated dashboard."""
    widget_count = len(spec.get("widgets", []))
    archetype = spec.get("archetype", "custom").replace("_", " ").title()
    return {
        "title": spec.get("name", "Dashboard"),
        "subtitle": f"{widget_count} widgets \u2022 {archetype}",
        "metrics": [
            {"label": "Widgets", "value": str(widget_count), "delta": None},
            {"label": "Layout", "value": archetype, "delta": None},
        ],
        "parameters": {
            "Archetype": archetype,
            "Entity Scope": (spec.get("entity_scope", {}).get("entity_type") or "asset").title(),
            "Quarter": spec.get("quarter") or "Current",
        },
        "actions": [
            {"label": "View Dashboard", "action": "open_dashboard", "params": {}},
            {"label": "Edit in Builder", "action": "edit_dashboard", "params": {}},
        ],
    }


async def run_gateway_stream(
    *,
    message: str,
    session_id: str | None = None,
    conversation_id: uuid.UUID | None = None,
    env_id: uuid.UUID | None = None,
    business_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    context_envelope: AssistantContextEnvelope | dict[str, Any] | None = None,
    actor: str = "anonymous",
) -> AsyncGenerator[str, None]:
    if not OPENAI_API_KEY:
        yield _sse("error", {"message": "OPENAI_API_KEY not configured"})
        return

    client = _get_openai_client()
    start = time.time()
    timings: dict[str, int] = {}
    session_id = session_id or str(uuid.uuid4())

    # ── Langfuse trace (no-op if not configured) ─────────────────────
    trace = langfuse_client.create_trace(
        name="gateway_stream",
        session_id=session_id,
        user_id=actor,
        input=message,
    )

    # ── Kick off workflow check in parallel with context resolution ──
    _workflow_task = asyncio.ensure_future(
        asyncio.get_event_loop().run_in_executor(
            None, _check_pending_workflow, conversation_id
        )
    )

    normalized_envelope = ensure_context_envelope(
        context_envelope=context_envelope,
        env_id=str(env_id) if env_id else None,
        business_id=str(business_id) if business_id else None,
        conversation_id=str(conversation_id) if conversation_id else None,
        actor=actor,
    )
    resolved_scope = resolve_assistant_scope(
        user=actor,
        context_envelope=normalized_envelope,
        user_message=message,
        fallback_env_id=str(env_id) if env_id else None,
        fallback_business_id=str(business_id) if business_id else None,
    )

    current_request_ctx = get_request_context()
    set_request_context(
        request_id=current_request_ctx.request_id,
        run_id=current_request_ctx.run_id,
        env_id=resolved_scope.environment_id,
        business_id=resolved_scope.business_id,
        user=current_request_ctx.user,
    )

    timings["context_resolution_ms"] = int((time.time() - start) * 1000)
    envelope_dump = normalized_envelope.model_dump()
    scope_dump = resolved_scope.model_dump()

    emit_log(
        level="info",
        service="backend",
        action="ai.gateway.context_resolved",
        message="Resolved Winston application context",
        context={
            "context_envelope": envelope_dump,
            "resolved_scope": scope_dump,
        },
    )
    yield _sse(
        "context",
        {
            "context_envelope": envelope_dump,
            "resolved_scope": scope_dump,
        },
    )

    # ── Visible context policy + request routing ──────────────────────
    visible_context_policy = resolve_visible_context_policy(
        context_envelope=normalized_envelope,
        user_message=message,
    )
    route = classify_request(
        message=message,
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        visible_context_shortcut=visible_context_policy["disable_tools"],
    )

    # ── Workflow-aware routing override (Section I fix) ───────────────
    # Workflow check was kicked off in parallel with context resolution above.
    _pending_workflow = await _workflow_task
    timings["workflow_check_ms"] = int((time.time() - start) * 1000) - timings["context_resolution_ms"]
    _workflow_override_applied = False
    if _pending_workflow:
        route = _override_route_for_workflow(route, _pending_workflow, message)
        _workflow_override_applied = True
        emit_log(
            level="info", service="backend", action="ai.gateway.workflow_override",
            message=f"Active workflow detected ({_pending_workflow['type']}), "
                    f"route overridden to Lane {route.lane} (skip_tools={route.skip_tools})",
            context={"workflow_type": _pending_workflow["type"], "original_lane": route.lane},
        )

    # Emit status immediately so frontend shows processing started
    yield _sse(
        "status",
        {
            "message": f"Processing ({route.lane}): {resolved_scope.entity_name or resolved_scope.environment_id or 'global'}",
            "lane": route.lane,
            "scope": resolved_scope.entity_name or resolved_scope.entity_id or resolved_scope.environment_id,
        },
    )

    emit_log(
        level="info",
        service="backend",
        action="ai.gateway.route_classified",
        message=f"Request routed to Lane {route.lane}",
        context={"lane": route.lane, "skip_rag": route.skip_rag, "skip_tools": route.skip_tools, "max_tool_rounds": route.max_tool_rounds},
    )
    trace.update(metadata={
        "lane": route.lane,
        "model": route.model or OPENAI_CHAT_MODEL,
        "env_id": resolved_scope.environment_id,
        "scope": scope_dump,
    }, tags=[f"lane:{route.lane}"])

    # ── REPE Fast-Path — bypass LLM for high-confidence finance queries ──
    _intent_start = time.time()
    repe_intent = classify_repe_intent(message, resolved_scope, normalized_envelope)
    timings["intent_classification_ms"] = int((time.time() - _intent_start) * 1000)
    if repe_intent and repe_intent.confidence >= 0.85:
        emit_log(
            level="info", service="backend", action="ai.gateway.repe_fast_path",
            message=f"REPE fast-path activated: {repe_intent.family} (confidence={repe_intent.confidence:.2f})",
            context={"intent": repe_intent.family, "confidence": repe_intent.confidence,
                      "extracted_params": {k: str(v) for k, v in repe_intent.extracted_params.items() if not k.startswith("_")}},
        )
        try:
            trace.update(metadata={"repe_fast_path": True, "repe_intent": repe_intent.family})
        except Exception:
            pass

        try:
            async for sse_line in _run_repe_fast_path(
                intent=repe_intent,
                resolved_scope=resolved_scope,
                context_envelope=normalized_envelope,
                session_id=session_id,
                conversation_id=conversation_id,
                scope_dump=scope_dump,
                timings=timings,
                start=start,
                trace=trace,
                actor=actor,
            ):
                yield sse_line
        except Exception as fp_exc:
            emit_log(
                level="error", service="backend", action="ai.gateway.repe_fast_path.outer_error",
                message=f"Fast-path generator error: {fp_exc}",
                context={"intent": repe_intent.family, "error": str(fp_exc)},
            )
            yield _sse("error", {"message": f"Fast-path error ({repe_intent.family}): {fp_exc}"})
        return

    # ── Graceful degradation: write request but no write tools ────────
    if route.is_write and not _has_write_tools():
        text = "Write operations (creating funds, deals, or assets) are not available in the current configuration. I can read and analyze your portfolio data — for creating records, please use the platform UI directly."
        response_blocks = [markdown_block(text)]
        yield _sse("token", {"text": text})
        timings["total_ms"] = int((time.time() - start) * 1000)
        yield _sse("done", {
            "session_id": session_id,
            "trace": {
                "execution_path": "chat", "lane": route.lane, "model": "none",
                "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
                "tool_call_count": 0, "tool_timeline": [], "data_sources": [],
                "citations": [], "rag_chunks_used": 0, "warnings": ["Write tools not registered"],
                "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
                "repe": None, "visible_context_shortcut": False, "timings": timings,
            },
            "prompt_tokens": 0, "completion_tokens": 0, "tool_calls": 0,
            "elapsed_ms": timings["total_ms"], "resolved_scope": scope_dump,
            "response_blocks": response_blocks,
        })
        return

    response_blocks: list[dict[str, Any]] = []

    # ── RAG (conditional — skipped for Lane A/B when not needed) ────
    rag_chunks: list[RetrievedChunk] = []
    rag_business_id = resolved_scope.business_id or (str(business_id) if business_id else None)
    rag_env_id = resolved_scope.environment_id or (str(env_id) if env_id else None)
    rag_entity_type = resolved_scope.entity_type or entity_type
    rag_entity_id = resolved_scope.entity_id or (str(entity_id) if entity_id else None)
    rag_chunks_raw: list[RetrievedChunk] = []
    if not route.skip_rag and rag_business_id:
        effective_top_k = route.rag_top_k if route.rag_top_k > 0 else RAG_TOP_K
        cache_key = _rag_cache_key(message, str(rag_business_id), rag_env_id, rag_entity_id)
        cached = _rag_cache_get(cache_key)
        try:
            if cached is not None:
                rag_chunks_raw = cached
            else:
                _search_kwargs = dict(
                    business_id=uuid.UUID(str(rag_business_id)),
                    env_id=uuid.UUID(str(rag_env_id)) if rag_env_id else None,
                    entity_type=rag_entity_type,
                    entity_id=uuid.UUID(str(rag_entity_id)) if rag_entity_id else None,
                    top_k=effective_top_k,
                    use_hybrid=route.use_hybrid,
                    scope_entity_type=resolved_scope.entity_type,
                    scope_entity_id=resolved_scope.entity_id,
                    scope_env_id=resolved_scope.environment_id,
                    overfetch=RAG_OVERFETCH if route.use_rerank else None,
                    return_all=route.use_rerank,
                    trace=trace,
                )
                # T-2.3: Query expansion (multi-query retrieval)
                if getattr(route, "needs_query_expansion", False) and ENABLE_QUERY_EXPANSION:
                    from app.services.query_rewriter import expand_query
                    queries = await expand_query(message, trace=trace)
                    all_chunks: list[RetrievedChunk] = []
                    for q in queries:
                        all_chunks.extend(semantic_search(query=q, **_search_kwargs))
                    # Deduplicate by chunk_id, keep highest score
                    seen: dict[str, RetrievedChunk] = {}
                    for c in all_chunks:
                        if c.chunk_id not in seen or c.score > seen[c.chunk_id].score:
                            seen[c.chunk_id] = c
                    rag_chunks_raw = list(seen.values())
                else:
                    rag_chunks_raw = semantic_search(query=message, **_search_kwargs)
                _rag_cache_set(cache_key, rag_chunks_raw)
            # Cross-encoder re-ranking FIRST (before threshold) — T-2.1
            if route.use_rerank and len(rag_chunks_raw) > 1:
                rag_chunks = await rerank_chunks(
                    query=message,
                    chunks=rag_chunks_raw,
                    top_k=effective_top_k,
                    trace=trace,
                )
            else:
                rag_chunks = list(rag_chunks_raw)
            # Score threshold filter AFTER rerank
            rag_chunks = [c for c in rag_chunks if c.score >= RAG_MIN_SCORE]
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
                        "source_filename": chunk.source_filename,
                        "retrieval_method": chunk.retrieval_method,
                    },
                )
            if rag_chunks:
                citation_block = citations_block(_citation_items(rag_chunks))
                response_blocks.append(citation_block)
                yield _sse("response_block", {"block": citation_block})
        except Exception as rag_err:
            rag_chunks = []
            yield _sse(
                "citation",
                {"message": f"RAG unavailable: {str(rag_err)[:100]}"},
            )

        # Langfuse RAG span
        rag_elapsed_ms = int((time.time() - start) * 1000) - timings.get("context_resolution_ms", 0)
        trace.span(
            name="rag_retrieval",
            input={"query": message, "use_hybrid": route.use_hybrid, "use_rerank": route.use_rerank},
            output={
                "chunks_raw": len(rag_chunks_raw),
                "chunks_final": len(rag_chunks),
                "scores": [round(c.score, 4) for c in rag_chunks[:10]],
            },
        ).end(metadata={"elapsed_ms": rag_elapsed_ms})

    rag_context = ""
    if rag_chunks:
        rag_context = "\n\nRELEVANT DOCUMENT CONTEXT:\n"
        rag_token_budget = route.rag_max_tokens if route.rag_max_tokens > 0 else 9999
        rag_tokens_used = 0
        for idx, chunk in enumerate(rag_chunks, 1):
            # Approximate token count: ~4 chars per token
            chunk_text = chunk.chunk_text[:800]
            chunk_tokens = len(chunk_text) // 4
            if rag_tokens_used + chunk_tokens > rag_token_budget:
                break
            rag_tokens_used += chunk_tokens
            heading = f" | section={chunk.section_heading}" if chunk.section_heading else ""
            rag_context += (
                f"\n[Doc {idx} | score={chunk.score:.3f}{heading}]\n"
                f"{chunk_text}\n"
            )

    timings["rag_search_ms"] = int((time.time() - start) * 1000) - timings["context_resolution_ms"]
    context_block = build_context_block(
        context_envelope=normalized_envelope,
        resolved_scope=resolved_scope,
        additional_instructions=visible_context_policy["instructions"],
    )
    effective_model = route.model or OPENAI_CHAT_MODEL
    # Reasoning / o-series models use "developer" role instead of "system"
    _caps = get_caps(effective_model)
    system_role = "developer" if (_caps.supports_reasoning_effort and not _caps.supports_temperature) else "system"

    # ── Determine domain blocks for this environment ────────────────
    _is_credit = _is_credit_environment(
        environment_name=normalized_envelope.ui.active_environment_name,
        environment_id=normalized_envelope.ui.active_environment_id,
        industry=getattr(normalized_envelope.ui, "industry", None),
    )
    _is_resume = _is_resume_environment(
        environment_name=normalized_envelope.ui.active_environment_name,
        environment_id=normalized_envelope.ui.active_environment_id,
        industry=getattr(normalized_envelope.ui, "industry", None),
    )
    _domain_blocks: list[tuple[str, str]] = []
    if _is_novendor_environment(
        environment_name=normalized_envelope.ui.active_environment_name,
        environment_id=normalized_envelope.ui.active_environment_id,
    ):
        _domain_blocks.append(("novendor", _NOVENDOR_PREDICTION_MARKET_PROMPT))
    if _is_credit:
        _domain_blocks.append(("credit", _CREDIT_DOMAIN_BLOCK))
    if _is_resume:
        _domain_blocks.append(("resume", _RESUME_DOMAIN_BLOCK))

    # ── Conversation history (token-budgeted per lane) ────────────
    _history_start = time.time()
    history_msgs: list[dict[str, str]] = []
    if conversation_id:
        try:
            from app.services import ai_conversations as convo_svc

            history = await asyncio.get_event_loop().run_in_executor(
                None, convo_svc.get_messages, conversation_id
            )
            max_history = 6 if route.lane in ("A", "B") else 10
            recent = [m for m in history if m["role"] in ("user", "assistant")][-max_history:]
            history_token_budget = route.history_max_tokens
            history_tokens_used = 0
            for msg in reversed(recent):
                content = msg["content"] or ""
                if msg["role"] == "assistant" and msg.get("tool_calls") and not route.skip_tools:
                    stored_tcs = msg["tool_calls"]
                    if isinstance(stored_tcs, str):
                        try:
                            stored_tcs = json.loads(stored_tcs)
                        except Exception:
                            stored_tcs = None
                    if stored_tcs and "[SYSTEM NOTE:" not in content:
                        tc_parts = []
                        for tc in stored_tcs:
                            args = tc.get("args", {})
                            tc_parts.append(f"{tc['name']}({json.dumps(args, default=str)})")
                        content += f"\n\n[Prior tool calls: {'; '.join(tc_parts)}]"
                msg_tokens = len(content) // 4
                if history_tokens_used + msg_tokens > history_token_budget:
                    break
                history_tokens_used += msg_tokens
                history_msgs.append({"role": msg["role"], "content": content})
            history_msgs.reverse()
        except Exception:
            pass
    timings["history_load_ms"] = int((time.time() - _history_start) * 1000)

    # ── Workflow context augmentation ──────────────────────────────────
    _workflow_augmentation = ""
    if _pending_workflow:
        import re as _re
        known_params_parts: list[str] = []
        wf_content = _pending_workflow.get("content") or ""
        kp_match = _re.search(r"Known parameters:\s*(.+?)(?:\.\s*(?:If|The|NEVER))", wf_content)
        if kp_match:
            known_params_parts.append(kp_match.group(1).strip().rstrip("."))
        wf_tool_calls = _pending_workflow.get("tool_calls")
        if wf_tool_calls and isinstance(wf_tool_calls, list):
            for tc in wf_tool_calls:
                tc_args = tc.get("args", {})
                if isinstance(tc_args, str):
                    try:
                        tc_args = json.loads(tc_args)
                    except Exception:
                        tc_args = {}
                if isinstance(tc_args, dict):
                    param_strs = [f"{k}={v}" for k, v in tc_args.items()
                                  if v is not None and k not in ("confirmed", "scope", "resolved_scope")]
                    if param_strs:
                        known_params_parts.append("; ".join(param_strs))
                tc_result = tc.get("result") or tc.get("tool_result")
                if isinstance(tc_result, dict) and tc_result.get("provided"):
                    provided = tc_result["provided"]
                    param_strs = [f"{k}={v}" for k, v in provided.items() if v is not None]
                    if param_strs:
                        known_params_parts.append("; ".join(param_strs))
        if known_params_parts:
            all_params = "; ".join(known_params_parts)
            wf_type = _pending_workflow.get("type", "workflow")
            is_confirm = _CONFIRM_KEYWORDS.search(message.strip())
            if is_confirm:
                _workflow_augmentation = (
                    f"[CONTEXT: User is confirming a pending {wf_type}. "
                    f"Previously collected parameters: {all_params}. "
                    f"Call the SAME tool with confirmed=true and ALL these parameters.]"
                )
            else:
                _workflow_augmentation = (
                    f"[CONTEXT: Active {wf_type}. Previously collected parameters: {all_params}. "
                    f"MERGE the user's new values below with ALL previously collected parameters when calling the tool.]"
                )

    # ── Unified prompt assembly via compose_prompt ────────────────────
    session_context_str = ""
    session_state = get_session(str(conversation_id) if conversation_id else None)
    if session_state and session_state.waterfall_runs:
        session_lines = []
        for item in session_state.waterfall_runs[-10:]:
            session_lines.append(
                f"- {item.get('scenario_name') or item.get('run_id')}: "
                f"IRR={item.get('key_metrics', {}).get('irr')}, "
                f"TVPI={item.get('key_metrics', {}).get('tvpi')}, "
                f"NAV={item.get('key_metrics', {}).get('nav')}, "
                f"Carry={item.get('key_metrics', {}).get('carry')}"
            )
        session_context_str = "## Prior Waterfall Runs This Session\n" + "\n".join(session_lines)

    messages, _prompt_audit = compose_prompt(
        system_base=_SYSTEM_PROMPT_BASE,
        lane=route.lane,
        context_block=context_block,
        rag_context=rag_context,
        history=history_msgs,
        user_message=message,
        domain_blocks=_domain_blocks,
        mutation_rules=_MUTATION_RULES_BLOCK if _has_write_tools() else _READ_ONLY_BLOCK,
        session_context=session_context_str,
        system_role=system_role,
        workflow_augmentation=_workflow_augmentation,
    )
    emit_log(level="info", service="backend", action="ai.gateway.prompt_composed",
             message=f"Lane {route.lane}: {_prompt_audit.total_tokens} est. tokens, "
                     f"domains={_prompt_audit.domain_blocks_applied}, "
                     f"truncated={_prompt_audit.sections_truncated}")

    openai_tools, tool_name_map = _build_openai_tools_for_lane(
        lane=route.lane, is_write=route.is_write, is_credit=_is_credit, is_resume=_is_resume,
    )
    if route.skip_tools:
        emit_log(
            level="info",
            service="backend",
            action="ai.gateway.visible_context_shortcut",
            message=f"Lane {route.lane}: tools disabled",
            context={"instructions": visible_context_policy["instructions"]},
        )
        openai_tools = []
        # Lane A: model must NOT narrate tool use. Inject an explicit override so the
        # model answers directly from the context block instead of saying "I'll fetch...".
        messages.append({
            "role": system_role,
            "content": (
                "IMPORTANT: You have NO tools available in this exchange. "
                "Answer ONLY using the data already provided above in the context block. "
                "Do NOT say you will 'look up', 'fetch', 'retrieve', or 'call' anything. "
                "Respond directly with the information from the context. "
                "If the data is not in the context, say so — do not promise to find it."
            ),
        })
    else:
        emit_log(
            level="info",
            service="backend",
            action="ai.gateway.tool_filter",
            message=f"Lane {route.lane}: {len(openai_tools)} tools (write={route.is_write}, credit={_is_credit})",
        )
    ctx = McpContext(
        actor=actor,
        token_valid=True,
        resolved_scope=scope_dump,
        context_envelope=envelope_dump,
    )

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_cached_tokens = 0
    tool_call_count = 0
    _fallback_used = False
    _failed_tool_names: set[str] = set()  # A11: track hallucinated/failed tool names to avoid loops
    narrator = RunNarrator()
    tool_calls_log: list[dict[str, Any]] = []
    tool_timeline: list[dict[str, Any]] = []
    data_sources: list[dict[str, Any]] = []
    warnings: list[str] = []
    execution_path: str = "chat"
    citations_log: list[dict[str, Any]] = [
        {
            "chunk_id": chunk.chunk_id,
            "doc_id": chunk.document_id,
            "score": round(chunk.score, 4),
        }
        for chunk in rag_chunks
    ]
    collected_content = ""
    timings["prompt_construction_ms"] = int((time.time() - start) * 1000) - timings.get("rag_search_ms", 0) - timings["context_resolution_ms"]
    model_start = time.time()
    first_token_time: float | None = None

    effective_max_rounds = min(route.max_tool_rounds, AI_MAX_TOOL_ROUNDS)
    for round_num in range(effective_max_rounds + 1):
        effective_model = route.model or OPENAI_CHAT_MODEL
        stream_kwargs = sanitize_params(
            effective_model,
            messages=messages,
            max_tokens=route.max_tokens,
            temperature=route.temperature,
            reasoning_effort=route.reasoning_effort,
            tools=openai_tools or None,
            stream=True,
        )

        collected_content = ""
        collected_tool_calls: dict[int, dict[str, Any]] = {}
        llm_span = trace.generation(
            name=f"llm_round_{round_num}",
            model=effective_model,
            input={"message_count": len(messages)},
        )

        # Retry + fallback on model errors
        stream = None
        _models_to_try = [effective_model]
        if OPENAI_CHAT_MODEL_FALLBACK and OPENAI_CHAT_MODEL_FALLBACK != effective_model:
            _models_to_try.append(OPENAI_CHAT_MODEL_FALLBACK)
        for _try_model in _models_to_try:
            try:
                _kwargs = stream_kwargs if _try_model == effective_model else sanitize_params(
                    _try_model, messages=messages, max_tokens=route.max_tokens,
                    tools=openai_tools or None, stream=True,
                )
                stream = await client.chat.completions.create(**_kwargs)
                if _try_model != effective_model:
                    effective_model = _try_model
                    _fallback_used = True
                    emit_log(level="warning", service="backend", action="ai.gateway.fallback",
                             message=f"Using fallback model {_try_model}", context={"original": _models_to_try[0]})
                break
            except Exception as model_err:
                mapped = map_openai_error(model_err, _try_model)
                emit_log(level="error", service="backend", action="ai.gateway.model_error",
                         message=mapped.debug_message, context={"model": _try_model})
                if mapped.is_retryable and _try_model != _models_to_try[-1]:
                    continue  # try fallback
                yield _sse("error", {"message": mapped.user_message, "debug": mapped.debug_message})
                warnings.append(f"Model error: {mapped.debug_message}")
                break
        if stream is None:
            break

        async for chunk in stream:
            if not chunk.choices and chunk.usage:
                total_prompt_tokens += chunk.usage.prompt_tokens or 0
                total_completion_tokens += chunk.usage.completion_tokens or 0
                # T-1.2: Track prompt cache hits
                details = getattr(chunk.usage, "prompt_tokens_details", None)
                if details:
                    total_cached_tokens += getattr(details, "cached_tokens", 0) or 0
                continue

            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            if delta.content:
                if first_token_time is None:
                    first_token_time = time.time()
                collected_content += delta.content
                yield _sse("token", {"text": delta.content})

            if delta.tool_calls:
                for tool_call in delta.tool_calls:
                    idx = tool_call.index
                    if idx not in collected_tool_calls:
                        collected_tool_calls[idx] = {
                            "id": tool_call.id or "",
                            "name": "",
                            "args": "",
                        }
                    if tool_call.id:
                        collected_tool_calls[idx]["id"] = tool_call.id
                    if tool_call.function:
                        if tool_call.function.name:
                            collected_tool_calls[idx]["name"] = tool_call.function.name
                        if tool_call.function.arguments:
                            collected_tool_calls[idx]["args"] += tool_call.function.arguments

        llm_span.update(
            output=collected_content[:500] if collected_content else None,
            usage={"input": total_prompt_tokens, "output": total_completion_tokens},
        )
        llm_span.end()

        if not collected_tool_calls:
            break

        if round_num >= AI_MAX_TOOL_ROUNDS:
            yield _sse("error", {"message": "This query required more processing steps than allowed. Try a simpler question or break it into parts."})
            break

        messages.append(
            {
                "role": "assistant",
                "content": collected_content or None,
                "tool_calls": [
                    {
                        "id": tool_call["id"],
                        "type": "function",
                        "function": {
                            "name": tool_call["name"],
                            "arguments": tool_call["args"],
                        },
                    }
                    for tool_call in collected_tool_calls.values()
                ],
            }
        )

        execution_path = "tool"

        # Prepare all tool calls for parallel execution
        tool_tasks: list[dict[str, Any]] = []
        for tool_call in collected_tool_calls.values():
            sanitized_name = tool_call["name"]
            t_name = tool_name_map.get(sanitized_name, sanitized_name)
            t_def = registry.get(t_name)
            try:
                raw_args = json.loads(tool_call["args"]) if tool_call["args"] else {}
            except json.JSONDecodeError:
                # A10: Attempt JSON repair for common LLM mistakes (trailing comma, unquoted keys)
                _args_str = (tool_call["args"] or "").strip()
                try:
                    # Try stripping trailing commas before closing braces
                    import re as _re
                    _args_str = _re.sub(r",\s*([}\]])", r"\1", _args_str)
                    raw_args = json.loads(_args_str)
                except (json.JSONDecodeError, Exception):
                    emit_log(level="warning", service="backend", action="ai.gateway.tool_args_parse_error",
                             message=f"Malformed tool args for {sanitized_name}: {tool_call['args'][:200]}")
                    raw_args = {}
            if t_def is not None:
                raw_args = _maybe_attach_scope(t_def, raw_args, scope_dump)
            tool_tasks.append({
                "call": tool_call,
                "tool_name": t_name,
                "tool_def": t_def,
                "raw_args": raw_args,
            })

        # Emit status for tool execution (use narrator labels, not raw tool names)
        from app.services.run_narrator import TOOL_STEP_MAP
        narrated_labels = list(dict.fromkeys(
            TOOL_STEP_MAP.get(t["tool_name"], "Processing") for t in tool_tasks
        ))
        yield _sse("status", {"message": f"{', '.join(narrated_labels)}..."})

        # Register tool calls with narrator (emit narrated steps for new logical steps)
        for t in tool_tasks:
            narrated_block = narrator.on_tool_call(t["tool_name"])
            if narrated_block:
                response_blocks.append(narrated_block)
                yield _sse("response_block", {"block": narrated_block})

        # Execute all tool calls concurrently
        async def _run_tool(task: dict[str, Any]) -> dict[str, Any]:
            t_name = task["tool_name"]
            t_def = task["tool_def"]
            raw_args = task["raw_args"]
            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_call",
                message="Executing Winston tool",
                context={"tool_name": t_name, "tool_args": raw_args},
            )
            tool_start = time.time()
            t_success = False
            t_error_msg: str | None = None
            if not t_def:
                # A11: If same tool already failed, give a clearer hint to stop
                if t_name in _failed_tool_names:
                    t_result = {"error": f"Tool '{t_name}' does not exist. Do NOT retry. Available tools: {', '.join(tool_name_map.values())[:300]}"}
                else:
                    t_result = {"error": f"Unknown tool: {t_name}. Available tools: {', '.join(tool_name_map.values())[:300]}"}
                _failed_tool_names.add(t_name)
                t_error_msg = t_result["error"]
            else:
                try:
                    loop = asyncio.get_event_loop()
                    t_result = await loop.run_in_executor(None, execute_tool, t_def, ctx, raw_args)
                    t_success = True
                except Exception as tool_err:
                    t_result = {"error": str(tool_err)[:500]}
                    t_error_msg = str(tool_err)[:200]
            t_duration_ms = int((time.time() - tool_start) * 1000)
            return {
                "tool_name": t_name,
                "tool_def": t_def,
                "raw_args": raw_args,
                "result": t_result,
                "success": t_success,
                "error_msg": t_error_msg,
                "duration_ms": t_duration_ms,
                "call": task["call"],
            }

        results = await asyncio.gather(*[_run_tool(t) for t in tool_tasks], return_exceptions=True)

        # Process results in order (preserves message sequence for OpenAI)
        for res in results:
            if isinstance(res, Exception):
                warnings.append(f"Tool execution exception: {str(res)[:200]}")
                continue

            tool_name = res["tool_name"]
            tool_def = res["tool_def"]
            raw_args = res["raw_args"]
            tool_result = res["result"]
            tool_success = res["success"]
            tool_error_msg = res["error_msg"]
            tool_duration_ms = res["duration_ms"]

            if tool_success:
                tool_call_count += 1
                tool_calls_log.append({"name": tool_name, "success": True, "args": raw_args, "tool_result": tool_result})
            else:
                tool_calls_log.append({"name": tool_name, "success": False, "args": raw_args, "error": tool_error_msg, "tool_result": tool_result})

            # Build timeline entry
            result_summary = _preview(tool_result, max_chars=200)
            row_count = None
            if isinstance(tool_result, dict):
                for count_key in ("total", "count", "row_count"):
                    if count_key in tool_result:
                        row_count = tool_result[count_key]
                        break
                for list_key in ("funds", "deals", "assets", "investments", "items", "rows"):
                    if isinstance(tool_result.get(list_key), list):
                        row_count = len(tool_result[list_key])
                        break

            timeline_entry: dict[str, Any] = {
                "step": len(tool_timeline) + 1,
                "tool_name": tool_name,
                "purpose": tool_def.description[:120] if tool_def and tool_def.description else tool_name,
                "success": tool_success,
                "duration_ms": tool_duration_ms,
                "result_summary": result_summary,
                "row_count": row_count,
            }
            if tool_error_msg:
                timeline_entry["error"] = tool_error_msg
            tool_timeline.append(timeline_entry)

            if tool_success and tool_def:
                source_entry: dict[str, Any] = {
                    "source_type": "database",
                    "tool_name": tool_name,
                    "module": tool_def.module if hasattr(tool_def, "module") else None,
                }
                if row_count is not None:
                    source_entry["row_count"] = row_count
                data_sources.append(source_entry)

            emit_log(
                level="info",
                service="backend",
                action="ai.gateway.tool_result",
                message="Winston tool finished",
                context={"tool_name": tool_name, "result_preview": _preview(tool_result, max_chars=1000), "duration_ms": tool_duration_ms},
            )

            # Detect pending_confirmation from write tools
            is_pending_confirmation = (
                isinstance(tool_result, dict) and tool_result.get("pending_confirmation") is True
            )
            is_write_tool = tool_def and tool_def.permission == "write" if tool_def else False

            # Include narrator label so frontend never needs to show raw tool names
            _narrated_label = TOOL_STEP_MAP.get(tool_name, "Processing")
            yield _sse(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "label": _narrated_label,
                    "args": raw_args,
                    "result_preview": _preview(tool_result, max_chars=400),
                    "duration_ms": tool_duration_ms,
                    "success": tool_success,
                    "error": None if tool_success else get_tool_failure_message(tool_name, tool_error_msg or "Unknown error"),
                    "row_count": row_count,
                    "is_write": is_write_tool,
                    "pending_confirmation": is_pending_confirmation,
                },
            )
            # Emit narrated step update (deduplicated, human-friendly labels)
            narrated_update = narrator.on_tool_result(
                tool_name,
                success=tool_success,
                duration_ms=tool_duration_ms,
                error_msg=tool_error_msg,
                is_retry=tool_name in _failed_tool_names and tool_success,
                is_final_retry=not tool_success,
            )
            if narrated_update:
                response_blocks.append(narrated_update)
                yield _sse("response_block", {"block": narrated_update})
            if is_pending_confirmation:
                confirm_block = confirmation_block(
                    action=tool_result.get("action", tool_name),
                    summary=tool_result.get("message", "Confirm to proceed."),
                    provided_params=tool_result.get("provided") or raw_args,
                    missing_fields=tool_result.get("missing_fields") or tool_result.get("required_fields") or [],
                    confirm_label="Confirm action",
                )
                response_blocks.append(confirm_block)
                yield _sse(
                    "confirmation_required",
                    {
                        "tool_name": tool_name,
                        "action": tool_result.get("action", tool_name),
                        "summary": tool_result.get("summary", {}),
                        "message": tool_result.get("message", "Confirm to proceed."),
                    },
                )
                yield _sse("response_block", {"block": confirm_block})
            elif not tool_success and tool_error_msg:
                tool_error_block = error_block(
                    title=f"{tool_name} failed",
                    message=tool_error_msg,
                    recoverable=True,
                )
                response_blocks.append(tool_error_block)
                yield _sse("response_block", {"block": tool_error_block})
            yield _sse(
                "tool_result",
                {"tool_name": tool_name, "args": raw_args, "result": _json_safe(tool_result)},
            )
            if tool_success and tool_name == "finance.generate_waterfall_memo" and isinstance(tool_result, dict):
                memo_card = _build_waterfall_memo_card(tool_result)
                yield _sse(
                    "structured_result",
                    {
                        "result_type": "waterfall_memo",
                        "card": memo_card,
                    },
                )
                blocks = legacy_structured_result_to_blocks("waterfall_memo", memo_card)
                response_blocks.extend(blocks)
                for block in blocks:
                    yield _sse("response_block", {"block": block})

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": res["call"]["id"],
                    "content": json.dumps(_json_safe(tool_result), ensure_ascii=True),
                }
            )

            if conversation_id and tool_success and isinstance(tool_result, dict):
                conversation_key = str(conversation_id)
                # Track last finance result for session memory
                if tool_name.startswith("finance."):
                    update_session(
                        conversation_key,
                        last_result=tool_result,
                        last_fund_id=str(raw_args.get("fund_id")) if raw_args.get("fund_id") else None,
                        last_quarter=raw_args.get("quarter"),
                    )
                run_candidates: list[dict[str, Any]] = []
                if tool_result.get("run_id"):
                    run_candidates.append(tool_result)
                for key in ("p10", "p50", "p90", "before", "after", "uw", "actual", "base", "construction_adjusted"):
                    candidate = tool_result.get(key)
                    if isinstance(candidate, dict) and candidate.get("run_id"):
                        run_candidates.append(candidate)
                fund_id_hint = raw_args.get("fund_id") or resolved_scope.entity_id
                quarter_hint = raw_args.get("quarter")
                for candidate in run_candidates:
                    summary = summarize_waterfall_run(
                        result=candidate,
                        fund_id=str(fund_id_hint) if fund_id_hint else None,
                        fund_name=candidate.get("fund_name"),
                        scenario_name=candidate.get("scenario_name"),
                        quarter=quarter_hint or candidate.get("quarter"),
                        overrides=candidate.get("overrides"),
                    )
                    if summary:
                        update_session(conversation_key, waterfall_run=summary)

    # ── Final-answer fallback ─────────────────────────────────────────
    # If the tool loop exhausted all rounds without producing text content
    # (model kept requesting tools), make one last call with tools disabled
    # to force a text response that synthesizes available tool results.
    if not collected_content and tool_call_count > 0:
        emit_log(level="info", service="backend", action="ai.gateway.final_answer_fallback",
                 message="No content after tool loop — forcing final answer with tools disabled")
        yield _sse("status", {"message": "Synthesizing answer..."})

        # Build a compact message list for the fallback to avoid context overflow.
        # Keep: system prompt, original user message, a summary of tool results,
        # and the synthesis instruction.
        _fb_messages: list[dict[str, Any]] = []
        # 1) System prompt (first message if role==system)
        if messages and messages[0].get("role") == "system":
            _fb_messages.append(messages[0])
        # 2) Original user message (first user message)
        for _m in messages:
            if _m.get("role") == "user":
                _fb_messages.append(_m)
                break
        # 3) Collect tool results into a single assistant summary
        _tool_summaries: list[str] = []
        for _m in messages:
            if _m.get("role") == "tool":
                _tool_name = _m.get("name", "tool")
                _tool_content = str(_m.get("content", ""))[:1500]
                _tool_summaries.append(f"[{_tool_name}]: {_tool_content}")
        if _tool_summaries:
            _fb_messages.append({
                "role": "user",
                "content": "Here are the tool results from previous calls:\n\n"
                           + "\n\n".join(_tool_summaries[:5])
                           + "\n\nNow answer the original question using these results. "
                           "Be concise and helpful. Do not call any tools."
            })
        else:
            _fb_messages.append({
                "role": "user",
                "content": "Answer the original question as best you can based on your knowledge. "
                           "Be concise and helpful. Do not call any tools."
            })

        _fallback_model = OPENAI_CHAT_MODEL  # gpt-5-mini
        _fallback_kwargs = sanitize_params(
            _fallback_model,
            messages=_fb_messages,
            max_tokens=route.max_tokens,
            temperature=route.temperature,
        )
        # Ensure no tools are included
        _fallback_kwargs.pop("tools", None)
        _fallback_kwargs.pop("tool_choice", None)
        emit_log(level="debug", service="backend", action="ai.gateway.fallback_kwargs",
                 message=f"Fallback model={_fallback_model}, msg_count={len(_fb_messages)}, "
                         f"keys={list(_fallback_kwargs.keys())}")
        try:
            _fb_client = _get_openai_client()
            _fb_stream = await _fb_client.chat.completions.create(**_fallback_kwargs, stream=True)
            _fb_chunk_count = 0
            async for _fb_chunk in _fb_stream:
                _fb_chunk_count += 1
                if not _fb_chunk.choices:
                    if _fb_chunk.usage:
                        total_prompt_tokens += _fb_chunk.usage.prompt_tokens or 0
                        total_completion_tokens += _fb_chunk.usage.completion_tokens or 0
                    continue
                _fb_delta = _fb_chunk.choices[0].delta
                _fb_finish = _fb_chunk.choices[0].finish_reason
                # Check for reasoning content (gpt-5 family internal reasoning)
                _fb_reasoning = getattr(_fb_delta, "reasoning_content", None) or getattr(_fb_delta, "reasoning", None)
                if _fb_delta.content:
                    if first_token_time is None:
                        first_token_time = time.time()
                    collected_content += _fb_delta.content
                    yield _sse("token", {"text": _fb_delta.content})
                elif _fb_reasoning:
                    # Model is reasoning — skip but log
                    pass
                elif _fb_finish:
                    emit_log(level="debug", service="backend", action="ai.gateway.fallback_finish",
                             message=f"Fallback finished: reason={_fb_finish}, chunks={_fb_chunk_count}, "
                                     f"content_len={len(collected_content)}")
            if not collected_content:
                emit_log(level="warn", service="backend", action="ai.gateway.fallback_empty",
                         message=f"Fallback produced 0 content tokens after {_fb_chunk_count} chunks")
        except Exception as fb_err:
            emit_log(level="error", service="backend", action="ai.gateway.final_answer_error",
                     message=f"Final answer fallback failed: {type(fb_err).__name__}: {fb_err}")
            yield _sse("error", {"message": "Winston could not synthesize a response from the available data. Please try rephrasing your question."})

    # ── Compute metrics and emit done BEFORE persistence ─────────────
    # Emit the stream-terminating `done` event before any DB writes so
    # slow/hanging DB calls cannot block the frontend from receiving it.
    elapsed_ms = int((time.time() - start) * 1000)
    timings["model_ms"] = int((time.time() - model_start) * 1000)
    if first_token_time is not None:
        timings["ttft_ms"] = int((first_token_time - model_start) * 1000)
    timings["tool_execution_ms"] = sum(
        t.get("duration_ms", 0) for t in tool_timeline if isinstance(t, dict)
    )
    timings["tools_sent"] = len(openai_tools)
    timings["total_ms"] = elapsed_ms

    if elapsed_ms > 10_000 and route.lane == "B":
        emit_log(
            level="warning",
            service="backend",
            action="ai.gateway.lane_b_slow",
            message=f"Lane B response exceeding 10s target ({elapsed_ms}ms)",
            context={"elapsed_ms": elapsed_ms, "tokens": total_completion_tokens,
                      "tool_calls": tool_call_count, "history_msgs": len(messages)},
        )

    # Track RAG as data source
    if rag_chunks:
        execution_path = "hybrid" if tool_call_count > 0 else "rag"
        for chunk in rag_chunks:
            data_sources.append({
                "source_type": "document",
                "doc_id": chunk.document_id,
                "chunk_id": chunk.chunk_id,
                "score": round(chunk.score, 4),
                "section_heading": chunk.section_heading,
            })

    # Detect REPE-specific metadata from scope
    repe_metadata: dict[str, Any] = {}
    if resolved_scope.industry == "real_estate":
        repe_metadata["industry"] = "real_estate"
        if resolved_scope.entity_type == "fund":
            repe_metadata["rollup_level"] = "fund"
            repe_metadata["fund_id"] = resolved_scope.entity_id
        elif resolved_scope.entity_type == "asset":
            repe_metadata["rollup_level"] = "asset"
            repe_metadata["asset_id"] = resolved_scope.entity_id
        elif resolved_scope.entity_type in ("investment", "deal"):
            repe_metadata["rollup_level"] = "investment"
            repe_metadata["deal_id"] = resolved_scope.entity_id
        else:
            repe_metadata["rollup_level"] = "portfolio"
        repe_metadata["schema_name"] = resolved_scope.schema_name

    # Build RAG quality and cost metrics for trace
    rag_quality = {
        "chunks_retrieved": len(rag_chunks_raw),
        "chunks_after_threshold": len([c for c in rag_chunks_raw if c.score >= RAG_MIN_SCORE]) if rag_chunks_raw else 0,
        "chunks_after_rerank": len(rag_chunks),
        "rerank_method": RAG_RERANK_METHOD if route.use_rerank else "none",
        "hybrid_used": route.use_hybrid,
        "scores": [round(c.score, 4) for c in rag_chunks],
    }
    cost_info = estimate_cost(
        model=route.model or OPENAI_CHAT_MODEL,
        prompt_tokens=total_prompt_tokens,
        completion_tokens=total_completion_tokens,
        rerank_method=RAG_RERANK_METHOD if route.use_rerank else None,
    )
    if collected_content.strip():
        response_blocks.insert(0, markdown_block(collected_content.strip()))

    yield _sse(
        "done",
        {
            "session_id": session_id,
            "trace": {
                "execution_path": execution_path,
                "lane": route.lane,
                "model": route.model or OPENAI_CHAT_MODEL,
                "reasoning_effort": route.reasoning_effort,
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
                "cached_tokens": total_cached_tokens,
                "total_tokens": total_prompt_tokens + total_completion_tokens,
                "tool_call_count": tool_call_count,
                "tool_timeline": tool_timeline,
                "data_sources": data_sources,
                "citations": citations_log,
                "rag_chunks_used": len(rag_chunks),
                "warnings": warnings,
                "elapsed_ms": elapsed_ms,
                "resolved_scope": scope_dump,
                "repe": repe_metadata or None,
                "visible_context_shortcut": visible_context_policy.get("disable_tools", False),
                "timings": timings,
                "rag_quality": rag_quality,
                "cost": cost_info,
                "runtime": {
                    "backend_gateway_reached": True,
                    "canonical_runtime": True,
                    "degraded": False,
                    "tools_enabled": not route.skip_tools,
                    "rag_enabled": not route.skip_rag,
                },
            },
            # Keep flat fields for backward compat
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "tool_calls": tool_call_count,
            "elapsed_ms": elapsed_ms,
            "resolved_scope": scope_dump,
            "response_blocks": response_blocks,
        },
    )

    # ── Unified audit log — single structured record per request ─────
    emit_log(
        level="info",
        service="backend",
        action="ai.gateway.request_complete",
        message=(
            f"[gateway] lane={route.lane} model={route.model or OPENAI_CHAT_MODEL} "
            f"path={execution_path} tokens={total_prompt_tokens + total_completion_tokens} "
            f"(prompt={total_prompt_tokens} completion={total_completion_tokens} cached={total_cached_tokens}) "
            f"tools={tool_call_count} rag_chunks={len(rag_chunks)} "
            f"elapsed={elapsed_ms}ms ttft={timings.get('ttft_ms', 'n/a')}ms"
        ),
        context={
            "lane": route.lane,
            "model": route.model or OPENAI_CHAT_MODEL,
            "execution_path": execution_path,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "cached_tokens": total_cached_tokens,
            "tool_call_count": tool_call_count,
            "tool_names": [t.get("tool_name") for t in tool_timeline if isinstance(t, dict)],
            "rag_chunks_used": len(rag_chunks),
            "rag_rerank_method": RAG_RERANK_METHOD if route.use_rerank else "none",
            "elapsed_ms": elapsed_ms,
            "timings": timings,
            "cost_estimate": cost_info,
            "response_block_count": len(response_blocks),
            "warnings": warnings,
            "session_id": session_id,
            "conversation_id": str(conversation_id) if conversation_id else None,
            "prompt_audit": {
                "total_tokens": _prompt_audit.total_tokens,
                "domains": _prompt_audit.domain_blocks_applied,
                "truncated": _prompt_audit.sections_truncated,
            } if _prompt_audit else None,
        },
        duration_ms=elapsed_ms,
    )

    # ── Post-stream persistence (non-blocking for the client) ─────────
    # Everything below runs after the frontend has received the `done`
    # event. Slow DB writes here cannot cause the UI to stall.

    if conversation_id:
        try:
            from app.services import ai_conversations as convo_svc

            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: convo_svc.append_message(
                    conversation_id=conversation_id,
                    role="user",
                    content=message,
                ),
            )
            # Build enriched content that includes tool call context so
            # the next turn's history gives the LLM full awareness of
            # what happened (especially pending confirmations).
            enriched_content = collected_content or ""
            if tool_calls_log:
                tool_summary_parts: list[str] = []
                for tc in tool_calls_log:
                    tc_line = f"  - {tc['name']}(confirmed={tc.get('args', {}).get('confirmed', 'N/A')})"
                    if tc.get("success"):
                        tc_line += " → success"
                    else:
                        tc_line += f" → error: {tc.get('error', 'unknown')}"
                    tool_summary_parts.append(tc_line)
                # Check for any pending confirmations OR validation-failed tool calls
                # that need more user input (e.g., missing required fields).
                pending_tools = [
                    tc for tc in tool_calls_log
                    if (tc.get("success") and tc.get("args", {}).get("confirmed") is False)
                    or (not tc.get("success") and tc.get("error") and "required" in str(tc.get("error", "")).lower())
                ]
                if pending_tools:
                    pending_names = [tc["name"] for tc in pending_tools]
                    # Include the CUMULATIVE parameters so the LLM never loses them across turns.
                    # Prefer tool_result.provided (echoed by handler) over args (what LLM sent this turn),
                    # because the handler's provided dict is the authoritative cumulative set.
                    param_summaries = []
                    for tc in pending_tools:
                        tr = tc.get("tool_result") or {}
                        provided = tr.get("provided") if isinstance(tr, dict) else None
                        if provided and isinstance(provided, dict):
                            # Use the handler's cumulative provided dict
                            params_str = ", ".join(
                                f"{k}={json.dumps(v, default=str)}" for k, v in provided.items()
                                if v is not None
                            )
                        else:
                            # Fallback: use the LLM's args from this turn
                            args = tc.get("args", {})
                            params_str = ", ".join(
                                f"{k}={json.dumps(v, default=str)}" for k, v in args.items()
                                if k not in ("confirmed", "resolved_scope") and v is not None
                            )
                        param_summaries.append(f"{tc['name']}({params_str})")
                    # Distinguish validation-failed vs confirmed=false
                    has_validation_failure = any(not tc.get("success") for tc in pending_tools)
                    merge_instruction = (
                        "The tool call FAILED due to missing required fields. "
                        "When the user provides the missing values, you MUST call the tool again "
                        "with ALL known parameters PLUS the new values. "
                        "NEVER re-ask for parameters already listed above."
                    ) if has_validation_failure else (
                        "If the user provides missing values, MERGE them with these known params "
                        "and call again with confirmed=false. "
                        "If the user confirms, call with confirmed=true using ALL these parameters."
                    )
                    enriched_content += (
                        "\n\n[SYSTEM NOTE: Tool calls this turn: "
                        + "; ".join(tool_summary_parts)
                        + ". PENDING CONFIRMATION for: " + ", ".join(pending_names) + ". "
                        + "Known parameters: " + "; ".join(param_summaries) + ". "
                        + merge_instruction + "]"
                    )
            # Defensive: if Winston produced a text-only confirmation (no tool call),
            # still annotate the persisted message so "yes" on the next turn has context.
            _CONFIRMATION_PHRASES = [
                "shall i proceed", "would you like me to proceed", "should i proceed",
                "shall i create", "want me to proceed", "shall i go ahead",
                "would you like to proceed", "ready to create",
            ]
            if not tool_calls_log and any(
                phrase in (collected_content or "").lower()
                for phrase in _CONFIRMATION_PHRASES
            ):
                enriched_content += (
                    "\n\n[SYSTEM NOTE: The above was a confirmation request with no tool call executed. "
                    "If the user confirms ('yes', 'go ahead', 'proceed'), identify the proposed action "
                    "from the conversation above and call the appropriate write tool with confirmed=true "
                    "using those parameters.]"
                )
            if enriched_content:
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: convo_svc.append_message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=enriched_content,
                        tool_calls=tool_calls_log or None,
                        citations=citations_log or None,
                        response_blocks=response_blocks,
                        message_meta={
                            "session_id": session_id,
                            "route_lane": route.lane,
                            "execution_path": execution_path,
                            "elapsed_ms": elapsed_ms,
                            "tool_call_count": tool_call_count,
                            "rag_chunks_used": len(rag_chunks),
                            "cost": cost_info,
                        },
                        token_count=total_completion_tokens or None,
                    ),
                )
        except Exception:
            pass

    try:
        audit_svc.record_event(
            actor=actor,
            action="ai.gateway.ask",
            tool_name="ai_gateway",
            success=True,
            latency_ms=elapsed_ms,
            business_id=uuid.UUID(resolved_scope.business_id) if resolved_scope.business_id else None,
            input_data={
                "message": message[:500],
                "session_id": session_id,
                "route": normalized_envelope.ui.route,
                "surface": normalized_envelope.ui.surface,
                "resolved_scope": scope_dump,
            },
            output_data={
                "tool_calls": tool_call_count,
                "tool_log": tool_calls_log,
                "rag_chunks": len(rag_chunks),
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
            },
        )
    except Exception:
        pass

    # ── Langfuse finalize ────────────────────────────────────────────
    trace.update(
        output=collected_content[:1000] if collected_content else None,
        metadata={
            "lane": route.lane,
            "model": route.model or OPENAI_CHAT_MODEL,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "cached_tokens": total_cached_tokens,
            "tool_call_count": tool_call_count,
            "rag_chunks_used": len(rag_chunks),
            "elapsed_ms": elapsed_ms,
            "cost": cost_info,
        },
    )
    langfuse_client.flush()

    # ── Persist gateway log row ───────────────────────────────────────
    try:
        from app.services.ai_gateway_logger import log_request as _log_request
        _log_request(
            conversation_id=conversation_id,
            session_id=session_id,
            business_id=resolved_scope.business_id,
            env_id=str(env_id) if env_id else None,
            actor=actor,
            message_preview=message[:500],
            route_lane=route.lane,
            route_model=effective_model,
            is_write=route.is_write,
            workflow_override=_workflow_override_applied,
            prompt_tokens=total_prompt_tokens,
            completion_tokens=total_completion_tokens,
            cached_tokens=total_cached_tokens,
            reasoning_effort=route.reasoning_effort,
            tool_call_count=tool_call_count,
            tool_calls_json=tool_calls_log or None,
            tools_skipped=route.skip_tools,
            rag_chunks_raw=len(rag_chunks_raw) if rag_chunks_raw else 0,
            rag_chunks_used=len(rag_chunks),
            rag_rerank_method=RAG_RERANK_METHOD if route.use_rerank else None,
            rag_scores=[round(c.score, 4) for c in rag_chunks] if rag_chunks else None,
            cost_total=cost_info.get("total_cost", 0),
            cost_model=cost_info.get("model_cost", 0),
            cost_embedding=cost_info.get("embedding_cost", 0),
            cost_rerank=cost_info.get("rerank_cost", 0),
            elapsed_ms=elapsed_ms,
            ttft_ms=timings.get("ttft_ms"),
            model_ms=timings.get("model_ms"),
            fallback_used=_fallback_used,
        )
    except Exception:
        pass  # never block the response for logging
