"""Async SSE bridge to the Anthropic Managed Agent (Operator runtime).

Wraps the synchronous `winston_managed_agent.run_session_turn` in a worker
thread, normalizes Anthropic events into the existing AssistantResponseBlock /
SSE event vocabulary the Winston chat UI already consumes, and persists
conversation messages + per-turn receipts.

Design goals:
  * The chat renderer is unchanged — operator events become the same SSE event
    names (status / response_block / tool_call / tool_result /
    confirmation_required / done / error) and the same 11-variant
    AssistantResponseBlock shapes the gateway emits.
  * Anthropic session ownership is held in first-class columns on
    ai_conversations (NOT message_meta), so health can be validated before each
    turn and a stale session can be transparently re-provisioned.
  * The async-over-sync bridge uses a bounded queue and a token-coalescing
    drop policy so a slow frontend cannot blow up backend memory.
  * Multiple in-flight tool confirmations within one Anthropic session are
    keyed by (anthropic_session_id, tool_call_id) and persisted in
    operator_pending_confirmations — they cannot be cross-wired and they
    survive backend restart.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator
from uuid import UUID

from app.config import (
    ANTHROPIC_API_KEY,
    MCP_API_TOKEN,
    WINSTON_OPERATOR_CONFIRM_TIMEOUT_SECONDS,
    WINSTON_MANAGED_AGENT_PROFILE_PATH,
)
from app.db import get_cursor
from app.services import ai_conversations as convo_svc
from app.services import operator_confirm_registry as confirm_registry
from app.services.winston_managed_agent import (
    ManagedAgentProfile,
    MCPPreflightResult,
    SessionStreamError,
    ToolConfirmationDecision,
    build_anthropic_client,
    create_session,
    ensure_agent,
    ensure_environment,
    ensure_static_bearer_credential,
    ensure_vault,
    extract_text_blocks,
    perform_mcp_preflight,
    retrieve_latest_agent,
    run_session_turn,
    sdk_to_dict,
    sdk_to_jsonable,
)


logger = logging.getLogger(__name__)


# ── Module-level singletons ──────────────────────────────────────────


_profile: ManagedAgentProfile | None = None
_client: Any = None
_agent_id: str | None = None
_agent_version: int | None = None
_environment_id: str | None = None
_vault_id: str | None = None
_credential_token: str | None = None
_bootstrap_lock = asyncio.Lock()
_preflight_cache: tuple[float, MCPPreflightResult] | None = None
_PREFLIGHT_TTL_SECONDS = 60.0


def _load_profile() -> ManagedAgentProfile:
    """Load the agent profile, mtime-checked so file edits during dev pick up."""
    global _profile
    if _profile is None:
        _profile = ManagedAgentProfile.load(WINSTON_MANAGED_AGENT_PROFILE_PATH or None)
    return _profile


def _get_client() -> Any:
    global _client
    if _client is None:
        _client = build_anthropic_client(ANTHROPIC_API_KEY or None)
    return _client


async def _ensure_bootstrap() -> tuple[ManagedAgentProfile, Any, str, int | None, str, str | None]:
    """Resolve agent / environment / vault, caching results.

    Preflight is INFORMATIONAL — its result is cached but never blocks bootstrap.
    Health endpoint surfaces preflight failures as warnings; runtime
    `session.error` events still produce visible chat error blocks.
    """
    async with _bootstrap_lock:
        global _agent_id, _agent_version, _environment_id, _vault_id, _credential_token
        profile = _load_profile()
        client = _get_client()
        if _agent_id is None or _environment_id is None:
            agent, _ = await asyncio.to_thread(ensure_agent, client, profile)
            environment, _ = await asyncio.to_thread(ensure_environment, client, profile)
            vault, _ = await asyncio.to_thread(ensure_vault, client, profile)
            token_for_credential = MCP_API_TOKEN or "operator-bootstrap-token"
            credential, _ = await asyncio.to_thread(
                ensure_static_bearer_credential,
                client,
                vault_id=getattr(vault, "id"),
                mcp_url=profile.mcp_url,
                token=token_for_credential,
                display_name=profile.credential_display_name,
                metadata=profile.credential_metadata,
            )
            latest = await asyncio.to_thread(retrieve_latest_agent, client, getattr(agent, "id"))
            _agent_id = getattr(agent, "id")
            _agent_version = profile.pinned_agent_version or getattr(latest, "version", None)
            _environment_id = getattr(environment, "id")
            _vault_id = getattr(vault, "id")
            _credential_token = token_for_credential
        return profile, client, _agent_id, _agent_version, _environment_id, _vault_id


def _preflight_cached() -> MCPPreflightResult | None:
    if _preflight_cache is None:
        return None
    cached_at, result = _preflight_cache
    if (time.time() - cached_at) > _PREFLIGHT_TTL_SECONDS:
        return None
    return result


def run_preflight() -> MCPPreflightResult:
    """Synchronous preflight wrapper used by /health. Caches for 60s."""
    global _preflight_cache
    cached = _preflight_cached()
    if cached is not None:
        return cached
    profile = _load_profile()
    result = perform_mcp_preflight(
        profile.mcp_url,
        token=MCP_API_TOKEN or _credential_token,
    )
    _preflight_cache = (time.time(), result)
    return result


# ── SSE serialization ────────────────────────────────────────────────


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True, default=str)}\n\n"


def _new_block_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# ── Event normalization (Anthropic → AssistantResponseBlock + SSE) ──


@dataclass
class _ToolState:
    block_id: str
    tool_name: str
    tool_input: dict[str, Any]
    status: str = "proposed"
    label: str | None = None
    is_write: bool = False
    duration_ms: int | None = None
    summary: str | None = None
    started_at: float = field(default_factory=time.time)


@dataclass
class _Segment:
    kind: str  # "text" | "tool_use"
    block_id: str
    text: str | None = None
    tool_call_id: str | None = None


@dataclass
class TurnAccumulator:
    """Accumulator for one operator turn.

    Anthropic interleaves text content blocks with tool-use events. We track:
      * `segments` ordered as they arrived, so the persisted assistant message
        replays the same shape the user saw.
      * `open_text_block_id` so consecutive text events flow into the same
        markdown block; a tool-use boundary flushes and resets it.
      * `tool_calls` keyed by tool_call_id (the Anthropic event_id), mutable
        because their status flips from proposed → awaiting_approval → running →
        completed/failed/denied as the session progresses.
    """
    segments: list[_Segment] = field(default_factory=list)
    open_text_block_id: str | None = None
    open_text_buf: list[str] = field(default_factory=list)
    tool_calls: dict[str, _ToolState] = field(default_factory=dict)
    text_messages: list[str] = field(default_factory=list)
    transcript_chunks: list[str] = field(default_factory=list)

    def flush_open_text(self) -> dict | None:
        """Close the current text segment and return a markdown_text block dict."""
        if not self.open_text_block_id:
            return None
        text = "".join(self.open_text_buf).strip()
        block_id = self.open_text_block_id
        self.open_text_block_id = None
        self.open_text_buf = []
        if not text:
            return None
        block = {"type": "markdown_text", "block_id": block_id, "markdown": text}
        self.segments.append(_Segment(kind="text", block_id=block_id, text=text))
        self.transcript_chunks.append(text)
        return block

    def append_text(self, text: str) -> tuple[str, bool]:
        """Append text into the current open block. Returns (block_id, is_new_block)."""
        is_new_block = self.open_text_block_id is None
        if is_new_block:
            self.open_text_block_id = _new_block_id("md")
            self.open_text_buf = []
        self.open_text_buf.append(text)
        return self.open_text_block_id, is_new_block

    def record_tool_use(
        self,
        *,
        tool_call_id: str,
        tool_name: str,
        tool_input: dict[str, Any],
        is_write: bool = False,
        label: str | None = None,
    ) -> _ToolState:
        state = self.tool_calls.get(tool_call_id) or _ToolState(
            block_id=_new_block_id("tool"),
            tool_name=tool_name,
            tool_input=tool_input,
            label=label,
            is_write=is_write,
        )
        state.tool_name = tool_name
        state.tool_input = tool_input
        state.label = label or state.label
        state.is_write = is_write or state.is_write
        self.tool_calls[tool_call_id] = state
        self.segments.append(
            _Segment(kind="tool_use", block_id=state.block_id, tool_call_id=tool_call_id)
        )
        return state

    def to_response_blocks(self) -> list[dict[str, Any]]:
        """Final list of response_block dicts in the order they were emitted."""
        out: list[dict[str, Any]] = []
        for seg in self.segments:
            if seg.kind == "text" and seg.text:
                out.append({"type": "markdown_text", "block_id": seg.block_id, "markdown": seg.text})
            elif seg.kind == "tool_use" and seg.tool_call_id:
                state = self.tool_calls.get(seg.tool_call_id)
                if state is None:
                    continue
                out.append({
                    "type": "tool_activity",
                    "block_id": state.block_id,
                    "items": [{
                        "tool_name": state.tool_name,
                        "label": state.label or state.tool_name,
                        "status": state.status,
                        "summary": state.summary or state.status,
                        "duration_ms": state.duration_ms,
                        "is_write": state.is_write,
                    }],
                })
        return out


def _tool_activity_block(state: _ToolState) -> dict[str, Any]:
    return {
        "type": "tool_activity",
        "block_id": state.block_id,
        "items": [{
            "tool_name": state.tool_name,
            "label": state.label or state.tool_name,
            "status": state.status,
            "summary": state.summary or state.status,
            "duration_ms": state.duration_ms,
            "is_write": state.is_write,
        }],
    }


def _is_write_tool(tool_name: str | None) -> bool:
    """Best-effort write detection from tool name. The agent's permission
    policy is the source of truth (always_ask), but this drives the UI hint.
    """
    if not tool_name:
        return False
    name = tool_name.lower()
    write_markers = ("create", "update", "delete", "set_", "post_", "send_", "schedule_", "deploy_", ".write", "_write", "execute_")
    return any(m in name for m in write_markers)


# ── Worker thread: queue plumbing ────────────────────────────────────


@dataclass
class _QueuedEvent:
    kind: str   # "anthropic" | "terminal" | "error"
    payload: Any | None = None
    error: str | None = None


def _make_event_pump(
    *,
    queue: asyncio.Queue["_QueuedEvent"],
    loop: asyncio.AbstractEventLoop,
    state: dict[str, Any],
):
    """Return an `on_event` callback safe to call from the worker thread.

    Implements bounded backpressure: when the queue is full, drop the OLDEST
    queued token-coalescable event before pushing the new one. tool_use,
    session.status, session.error, and session.status_idle are never silently
    dropped — those increment `dropped_high_freq_count` and we keep going.
    """
    def _put(ev: "_QueuedEvent") -> None:
        if queue.full():
            try:
                old = queue.get_nowait()
                # Treat agent.message text events as the only freely-droppable kind.
                ev_type = ""
                if old.kind == "anthropic" and old.payload is not None:
                    ev_type = getattr(old.payload, "type", "") or ""
                if ev_type != "agent.message":
                    state["dropped_high_freq_count"] = state.get("dropped_high_freq_count", 0) + 1
            except asyncio.QueueEmpty:
                pass
        queue.put_nowait(ev)

    def on_event(event: Any) -> None:
        try:
            loop.call_soon_threadsafe(_put, _QueuedEvent(kind="anthropic", payload=event))
        except RuntimeError:
            # Loop closed mid-stream; drop silently.
            pass

    return on_event


# ── Anthropic event mapper ───────────────────────────────────────────


def _anthropic_event_to_sse(
    event: Any,
    *,
    accumulator: TurnAccumulator,
    anthropic_session_id: str,
    conversation_id: UUID,
    business_id: UUID,
    env_id: UUID | None,
    state: dict[str, Any],
    last_events_ring: list[dict[str, Any]],
) -> list[str]:
    """Translate one Anthropic session event into 0..N SSE lines."""
    out: list[str] = []
    payload = sdk_to_dict(event)
    event_type = payload.get("type") or ""
    event_id = payload.get("id")

    # Maintain the dev-tab ring buffer (last 20 events).
    last_events_ring.append({
        "type": event_type,
        "id": event_id,
        "ts": time.time(),
    })
    if len(last_events_ring) > 20:
        del last_events_ring[: len(last_events_ring) - 20]

    if event_type == "agent.message":
        text = extract_text_blocks(payload.get("content"))
        if text:
            accumulator.text_messages.append(text)
            block = accumulator.flush_open_text() if accumulator.open_text_block_id else None
            if block is not None:
                out.append(_sse("response_block", {"block": block}))
            block_id, _ = accumulator.append_text(text)
            flushed = accumulator.flush_open_text()
            if flushed is not None:
                out.append(_sse("response_block", {"block": flushed}))
        return out

    if event_type in {"agent.tool_use", "agent.mcp_tool_use", "agent.custom_tool_use"}:
        # Flush any pending text so block ordering is preserved.
        flushed = accumulator.flush_open_text()
        if flushed is not None:
            out.append(_sse("response_block", {"block": flushed}))

        tool_name = payload.get("name") or "unknown_tool"
        tool_input = payload.get("input") or {}
        if isinstance(tool_input, str):
            with suppress(json.JSONDecodeError):
                tool_input = json.loads(tool_input)
        tool_call_id = event_id or _new_block_id("tc")
        is_write = _is_write_tool(tool_name)
        st = accumulator.record_tool_use(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            tool_input=tool_input if isinstance(tool_input, dict) else {"_": tool_input},
            is_write=is_write,
        )
        # Initial state: proposed (will flip to awaiting_approval / running below).
        st.status = "proposed"
        st.summary = "proposed"
        out.append(_sse("tool_call", {
            "tool_name": tool_name,
            "tool_call_id": tool_call_id,
            "args": st.tool_input,
            "is_write": st.is_write,
            "pending_confirmation": False,
            "label": st.label or tool_name,
        }))
        out.append(_sse("response_block", {"block": _tool_activity_block(st)}))
        return out

    if event_type in {"agent.tool_result", "agent.mcp_tool_result", "agent.custom_tool_result"}:
        tool_use_id = payload.get("tool_use_id") or payload.get("tool_call_id")
        st = accumulator.tool_calls.get(tool_use_id) if tool_use_id else None
        if st is None:
            # Result for a tool we never recorded (rare). Synthesize.
            tool_use_id = tool_use_id or _new_block_id("tc")
            st = accumulator.record_tool_use(
                tool_call_id=tool_use_id,
                tool_name=payload.get("name") or "unknown_tool",
                tool_input={},
            )
        is_error = bool(payload.get("is_error") or payload.get("error"))
        st.status = "failed" if is_error else "completed"
        st.summary = "failed" if is_error else "completed"
        st.duration_ms = int((time.time() - st.started_at) * 1000)
        out.append(_sse("tool_result", {
            "tool_call_id": tool_use_id,
            "tool_name": st.tool_name,
            "success": not is_error,
            "duration_ms": st.duration_ms,
            "result_preview": (sdk_to_jsonable(payload.get("content")) if "content" in payload else None),
        }))
        out.append(_sse("response_block", {"block": _tool_activity_block(st)}))
        return out

    if event_type == "session.status_running":
        out.append(_sse("status", {"value": "running"}))
        return out

    if event_type == "session.status_idle":
        # If stop_reason is requires_action, emit confirmation_required + persist
        # rows. The actual blocking happens inside the worker thread's
        # confirmation_callback (see run_operator_stream).
        stop = payload.get("stop_reason") or {}
        stop_type = stop.get("type") if isinstance(stop, dict) else None
        if stop_type == "requires_action":
            event_ids = (stop.get("event_ids") if isinstance(stop, dict) else []) or []
            for eid in event_ids:
                st = accumulator.tool_calls.get(eid)
                if st is None:
                    continue
                st.status = "awaiting_approval"
                st.summary = "awaiting_approval"
                # Persist DB row so the decision survives backend restart.
                with suppress(Exception):
                    confirm_registry.register(
                        anthropic_session_id=anthropic_session_id,
                        tool_call_id=eid,
                        conversation_id=conversation_id,
                        business_id=business_id,
                        env_id=env_id,
                        tool_name=st.tool_name,
                        tool_input=st.tool_input,
                    )
                out.append(_sse("response_block", {"block": _tool_activity_block(st)}))
                out.append(_sse("confirmation_required", {
                    "anthropic_session_id": anthropic_session_id,
                    "tool_call_id": eid,
                    "tool_name": st.tool_name,
                    "is_write": st.is_write,
                    "block": {
                        "type": "confirmation",
                        "block_id": _new_block_id("confirm"),
                        "action": st.label or st.tool_name,
                        "summary": _summarize_tool_intent(st.tool_name, st.tool_input),
                        "provided_params": st.tool_input,
                        "missing_fields": [],
                        "confirm_label": "Approve",
                        "tool_call_id": eid,
                        "anthropic_session_id": anthropic_session_id,
                    },
                }))
        else:
            state["final_stop_reason"] = stop_type or "idle"
        return out

    if event_type == "session.status_terminated":
        state["final_stop_reason"] = "terminated"
        out.append(_sse("status", {"value": "terminated"}))
        return out

    if event_type == "session.error":
        err = payload.get("error") or {}
        err_type = (err.get("type") if isinstance(err, dict) else None) or "session_error"
        message = (err.get("message") if isinstance(err, dict) else None) or "Operator session error"
        recoverable = err_type not in {
            "mcp_authentication_failed_error",
            "mcp_connection_failed_error",
            "agent_not_found_error",
        }
        state["session_error"] = {"type": err_type, "message": message}
        out.append(_sse("response_block", {"block": {
            "type": "error",
            "block_id": _new_block_id("err"),
            "title": err_type,
            "message": message,
            "recoverable": recoverable,
        }}))
        return out

    return out


def _summarize_tool_intent(tool_name: str, tool_input: dict[str, Any]) -> str:
    """One-line human summary for the confirmation card."""
    keys = ", ".join(list(tool_input.keys())[:4])
    if keys:
        return f"Operator wants to call {tool_name}({keys})"
    return f"Operator wants to call {tool_name}"


# ── Session ownership: get-or-create with health validation ──────────


@dataclass
class _SessionInfo:
    anthropic_session_id: str
    agent_id: str
    agent_version: int | None
    environment_id: str
    vault_id: str | None
    was_replaced: bool


async def _ensure_anthropic_session_for_conversation(
    *,
    conversation_id: UUID,
    title: str | None,
    actor: str,
) -> _SessionInfo:
    """Resolve a healthy Anthropic session for this Winston conversation.

    Validates an existing session via client.beta.sessions.retrieve when the
    last health check is older than 60s; if the session is missing or
    expired/invalidated, transparently provisions a new one and stamps the
    new ids onto the conversation row. The user perceives one continuous
    Winston conversation.
    """
    profile, client, agent_id, agent_version, environment_id, vault_id = await _ensure_bootstrap()
    convo = convo_svc.get_conversation(conversation_id=conversation_id) or {}
    existing_session = convo.get("anthropic_session_id")
    last_check = convo.get("session_health_checked_at")
    health = convo.get("session_health_status")
    needs_check = (
        existing_session
        and (last_check is None or (time.time() - last_check.timestamp() > 60.0))
    )

    if existing_session and (health in (None, "healthy") and not needs_check):
        return _SessionInfo(
            anthropic_session_id=existing_session,
            agent_id=convo.get("anthropic_agent_id") or agent_id,
            agent_version=convo.get("anthropic_agent_version") or agent_version,
            environment_id=convo.get("anthropic_environment_id") or environment_id,
            vault_id=convo.get("anthropic_vault_id") or vault_id,
            was_replaced=False,
        )

    if existing_session and needs_check:
        try:
            await asyncio.to_thread(client.beta.sessions.retrieve, session_id=existing_session)
            convo_svc.mark_session_health(conversation_id=conversation_id, status="healthy")
            return _SessionInfo(
                anthropic_session_id=existing_session,
                agent_id=convo.get("anthropic_agent_id") or agent_id,
                agent_version=convo.get("anthropic_agent_version") or agent_version,
                environment_id=convo.get("anthropic_environment_id") or environment_id,
                vault_id=convo.get("anthropic_vault_id") or vault_id,
                was_replaced=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "Operator session %s for conversation %s failed health check: %s — re-provisioning",
                existing_session,
                conversation_id,
                exc,
            )
            convo_svc.clear_anthropic_session(conversation_id=conversation_id)

    # Fresh provision.
    new_session = await asyncio.to_thread(
        create_session,
        client,
        agent_id=agent_id,
        environment_id=environment_id,
        vault_id=vault_id,
        title=title or "Operator session",
        agent_version=agent_version,
        metadata={"conversation_id": str(conversation_id), "actor": actor},
    )
    new_id = getattr(new_session, "id")
    convo_svc.set_anthropic_session(
        conversation_id=conversation_id,
        session_id=new_id,
        agent_id=agent_id,
        agent_version=agent_version,
        environment_id=environment_id,
        vault_id=vault_id,
    )
    return _SessionInfo(
        anthropic_session_id=new_id,
        agent_id=agent_id,
        agent_version=agent_version,
        environment_id=environment_id,
        vault_id=vault_id,
        was_replaced=existing_session is not None,
    )


# ── Receipts ─────────────────────────────────────────────────────────


def _insert_receipt(
    *,
    conversation_id: UUID,
    message_id: str | None,
    business_id: UUID,
    env_id: UUID | None,
    runtime: str,
    model: str | None,
    tokens_in: int | None,
    tokens_out: int | None,
    tool_calls: int | None,
    session_runtime_ms: int | None,
    routing_decision: str | None,
    routing_reason: str | None,
    anthropic_session_id: str | None,
    stop_reason_type: str | None,
    errors: dict[str, Any] | None,
) -> None:
    with suppress(Exception):
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_runtime_receipts (
                       conversation_id, message_id, business_id, env_id, runtime,
                       model, tokens_in, tokens_out, tool_calls, session_runtime_ms,
                       routing_decision, routing_reason, anthropic_session_id,
                       stop_reason_type, errors
                   ) VALUES (%s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s)""",
                (
                    str(conversation_id),
                    str(message_id) if message_id else None,
                    str(business_id),
                    str(env_id) if env_id else None,
                    runtime,
                    model,
                    tokens_in,
                    tokens_out,
                    tool_calls,
                    session_runtime_ms,
                    routing_decision,
                    routing_reason,
                    anthropic_session_id,
                    stop_reason_type,
                    json.dumps(errors) if errors else None,
                ),
            )


def list_receipts_for_conversation(*, conversation_id: UUID, limit: int = 25) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT receipt_id, conversation_id, runtime, model, tokens_in, tokens_out,
                      tool_calls, session_runtime_ms, routing_decision, routing_reason,
                      anthropic_session_id, stop_reason_type, errors, created_at
               FROM ai_runtime_receipts
               WHERE conversation_id = %s
               ORDER BY created_at DESC
               LIMIT %s""",
            (str(conversation_id), limit),
        )
        return cur.fetchall() or []


# ── Public entry point ───────────────────────────────────────────────


async def run_operator_stream(
    *,
    message: str,
    request_id: str,
    conversation_id: UUID,
    env_id: UUID | None,
    business_id: UUID,
    actor: str,
    routing_decision: str,
    routing_reason: str,
    context_envelope: dict[str, Any] | None = None,
) -> AsyncGenerator[str, None]:
    """Async generator yielding SSE lines for a single operator turn.

    Mirrors `services.ai_gateway.run_gateway_stream`'s contract so the route
    handler can call it the same way.
    """
    started_at = time.time()
    profile = _load_profile()

    yield _sse("status", {"value": "starting", "stage": "bootstrap"})

    try:
        session_info = await _ensure_anthropic_session_for_conversation(
            conversation_id=conversation_id,
            title=None,
            actor=actor,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Operator bootstrap failed: %s", exc)
        yield _sse("response_block", {"block": {
            "type": "error",
            "block_id": _new_block_id("err"),
            "title": "Operator bootstrap failed",
            "message": str(exc)[:400],
            "recoverable": False,
        }})
        yield _sse("done", {
            "session_id": request_id,
            "trace": {
                "execution_path": "managed_agent",
                "lane": "operator",
                "model": profile.agent_model,
                "tool_call_count": 0,
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "managed_agent": {
                    "anthropic_session_id": None,
                    "session_was_replaced": False,
                    "stop_reason_type": "bootstrap_failed",
                },
            },
        })
        return

    yield _sse("status", {
        "value": "session_ready",
        "session_id": session_info.anthropic_session_id,
        "session_was_replaced": session_info.was_replaced,
    })

    queue: asyncio.Queue["_QueuedEvent"] = asyncio.Queue(maxsize=128)
    loop = asyncio.get_running_loop()
    accumulator = TurnAccumulator()
    state: dict[str, Any] = {
        "dropped_high_freq_count": 0,
        "final_stop_reason": None,
        "session_error": None,
    }
    last_events_ring: list[dict[str, Any]] = []

    on_event = _make_event_pump(queue=queue, loop=loop, state=state)

    # Confirmation callback runs IN THE WORKER THREAD. We coordinate via
    # operator_confirm_registry's per-(session, tool_call_id) asyncio.Event,
    # blocking the worker thread on a future scheduled into the request loop.
    def _confirmation_callback(tool_event: Any) -> ToolConfirmationDecision:
        ev_payload = sdk_to_dict(tool_event)
        tc_id = ev_payload.get("id") or ev_payload.get("tool_use_id") or ""
        if not tc_id:
            return ToolConfirmationDecision(result="deny", deny_message="missing tool_call_id")
        slot_future = asyncio.run_coroutine_threadsafe(
            confirm_registry.acquire_slot(
                anthropic_session_id=session_info.anthropic_session_id,
                tool_call_id=tc_id,
            ),
            loop,
        )
        slot = slot_future.result()
        timeout = max(30, WINSTON_OPERATOR_CONFIRM_TIMEOUT_SECONDS)
        wait_future = asyncio.run_coroutine_threadsafe(
            asyncio.wait_for(slot.event.wait(), timeout=timeout),
            loop,
        )
        try:
            wait_future.result()
        except asyncio.TimeoutError:
            confirm_registry.abort(
                anthropic_session_id=session_info.anthropic_session_id,
                tool_call_id=tc_id,
                reason="confirmation_timeout",
            )
            return ToolConfirmationDecision(result="deny", deny_message="confirmation_timeout")
        finally:
            confirm_registry.cleanup_slot(
                anthropic_session_id=session_info.anthropic_session_id,
                tool_call_id=tc_id,
            )
        decision = slot.decision or {"result": "deny", "deny_message": "no_decision"}
        return ToolConfirmationDecision(
            result="allow" if decision.get("result") == "allow" else "deny",
            deny_message=decision.get("deny_message"),
        )

    client = _get_client()

    def _worker() -> dict[str, Any]:
        try:
            result = run_session_turn(
                client,
                session_id=session_info.anthropic_session_id,
                message=message,
                confirmation_callback=_confirmation_callback,
                on_event=on_event,
            )
            return {"ok": True, "result": result}
        except SessionStreamError as exc:
            return {"ok": False, "error_type": "session_error", "message": str(exc)}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Operator worker thread crashed: %s", exc)
            return {"ok": False, "error_type": "worker_exception", "message": str(exc)}

    worker_task = asyncio.create_task(asyncio.to_thread(_worker))

    try:
        while True:
            # Pull events as they arrive; exit when the worker is done AND the
            # queue is drained.
            done = worker_task.done()
            try:
                qe = await asyncio.wait_for(queue.get(), timeout=0.25)
            except asyncio.TimeoutError:
                if done and queue.empty():
                    break
                continue

            if qe.kind == "anthropic":
                lines = _anthropic_event_to_sse(
                    qe.payload,
                    accumulator=accumulator,
                    anthropic_session_id=session_info.anthropic_session_id,
                    conversation_id=conversation_id,
                    business_id=business_id,
                    env_id=env_id,
                    state=state,
                    last_events_ring=last_events_ring,
                )
                for line in lines:
                    yield line

        worker_outcome = await worker_task
    except asyncio.CancelledError:
        worker_task.cancel()
        with suppress(BaseException):
            await worker_task
        raise

    # Flush any unflushed open text segment.
    flushed = accumulator.flush_open_text()
    if flushed is not None:
        yield _sse("response_block", {"block": flushed})

    elapsed_ms = int((time.time() - started_at) * 1000)
    transcript = "\n\n".join(c for c in accumulator.transcript_chunks if c).strip()

    if not worker_outcome.get("ok"):
        err_msg = worker_outcome.get("message") or "operator_failed"
        yield _sse("response_block", {"block": {
            "type": "error",
            "block_id": _new_block_id("err"),
            "title": worker_outcome.get("error_type") or "operator_error",
            "message": err_msg[:400],
            "recoverable": worker_outcome.get("error_type") != "session_error",
        }})

    snapshot: dict[str, Any] = {}
    usage: dict[str, Any] = {}
    stop_reason_type = state.get("final_stop_reason")
    tool_use_count = len(accumulator.tool_calls)
    if worker_outcome.get("ok"):
        result = worker_outcome["result"]
        snapshot = result.session_snapshot or {}
        usage = (snapshot.get("usage") or {}) if isinstance(snapshot, dict) else {}
        stop_reason_type = stop_reason_type or result.stop_reason_type
        tool_use_count = max(tool_use_count, len(result.tool_uses or []))

    # Persist messages.
    assistant_msg = None
    with suppress(Exception):
        convo_svc.append_message(
            conversation_id=conversation_id,
            role="user",
            content=message,
            message_meta={"runtime": "managed_agent", "request_id": request_id},
        )
    with suppress(Exception):
        assistant_msg = convo_svc.append_message(
            conversation_id=conversation_id,
            role="assistant",
            content=transcript or "",
            tool_calls=[
                {
                    "tool_call_id": tc_id,
                    "tool_name": st.tool_name,
                    "status": st.status,
                    "is_write": st.is_write,
                    "duration_ms": st.duration_ms,
                }
                for tc_id, st in accumulator.tool_calls.items()
            ] or None,
            response_blocks=accumulator.to_response_blocks(),
            message_meta={
                "runtime": "managed_agent",
                "anthropic_session_id": session_info.anthropic_session_id,
                "agent_id": session_info.agent_id,
                "agent_version": session_info.agent_version,
                "stop_reason_type": stop_reason_type,
                "request_id": request_id,
            },
        )

    _insert_receipt(
        conversation_id=conversation_id,
        message_id=str(assistant_msg["message_id"]) if assistant_msg else None,
        business_id=business_id,
        env_id=env_id,
        runtime="managed_agent",
        model=profile.agent_model,
        tokens_in=int(usage.get("input_tokens") or 0) or None,
        tokens_out=int(usage.get("output_tokens") or 0) or None,
        tool_calls=tool_use_count,
        session_runtime_ms=elapsed_ms,
        routing_decision=routing_decision,
        routing_reason=routing_reason,
        anthropic_session_id=session_info.anthropic_session_id,
        stop_reason_type=stop_reason_type,
        errors=({"session_error": state.get("session_error")} if state.get("session_error") else None),
    )

    yield _sse("done", {
        "session_id": request_id,
        "trace": {
            "execution_path": "managed_agent",
            "lane": "operator",
            "model": profile.agent_model,
            "tool_call_count": tool_use_count,
            "tool_timeline": [
                {
                    "step": idx,
                    "tool_name": st.tool_name,
                    "purpose": st.label or st.tool_name,
                    "success": st.status == "completed",
                    "duration_ms": st.duration_ms,
                    "result_summary": st.summary,
                    "row_count": None,
                    "error": None if st.status != "failed" else "tool_failed",
                }
                for idx, st in enumerate(accumulator.tool_calls.values())
            ],
            "elapsed_ms": elapsed_ms,
            "dropped_high_freq_count": state.get("dropped_high_freq_count", 0),
            "managed_agent": {
                "anthropic_session_id": session_info.anthropic_session_id,
                "agent_id": session_info.agent_id,
                "agent_version": session_info.agent_version,
                "environment_id": session_info.environment_id,
                "mcp_server_name": profile.mcp_server_name,
                "stop_reason_type": stop_reason_type,
                "session_health_status": "healthy",
                "session_was_replaced": session_info.was_replaced,
                "last_events": last_events_ring,
                "conversation_id": str(conversation_id),
            },
        },
        "tool_calls": tool_use_count,
        "elapsed_ms": elapsed_ms,
    })


# ── Bootstrap status (for /health) ───────────────────────────────────


def operator_health_snapshot() -> dict[str, Any]:
    """Synchronous health summary. Never raises; surfaces preflight as a warning."""
    profile_loaded = False
    profile_summary: dict[str, Any] = {}
    try:
        profile = _load_profile()
        profile_loaded = True
        profile_summary = {
            "agent_name": profile.agent_name,
            "agent_model": profile.agent_model,
            "mcp_server_name": profile.mcp_server_name,
            "mcp_url": profile.mcp_url,
        }
    except Exception as exc:  # noqa: BLE001
        profile_summary = {"error": str(exc)[:200]}

    preflight: dict[str, Any] | None = None
    if profile_loaded:
        try:
            preflight = run_preflight().to_dict()
        except Exception as exc:  # noqa: BLE001
            preflight = {"ok": False, "error": str(exc)[:200]}

    return {
        "anthropic_key_present": bool(ANTHROPIC_API_KEY),
        "profile_loaded": profile_loaded,
        **profile_summary,
        "mcp_preflight": preflight,
    }
