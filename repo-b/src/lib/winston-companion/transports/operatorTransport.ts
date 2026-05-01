/**
 * Operator (Anthropic Managed Agent) transport.
 *
 * Mirrors the public surface of `streamAi()` from
 * `@/lib/commandbar/assistantApi` so the Winston companion provider can
 * call either runtime through `sendWinstonMessage` without conditional logic
 * downstream.
 *
 * Why a focused parser (instead of reusing the gateway parser):
 *   * The operator backend emits a stricter subset — no REPE structured_result
 *     cards, no OpenAI-format fallbacks, no winstonLoader narration coupling.
 *   * Reusing the gateway parser would require touching `streamAi()`, risking
 *     regressions on the canonical chat path. Keeping operator parsing
 *     self-contained preserves the "add, don't replace" invariant from the
 *     plan.
 *   * Both transports still emit identical event shapes back to the provider
 *     (the same `StreamAiHandlers` callbacks and the same
 *     `AssistantResponseBlock` discriminated union), so the chat renderer is
 *     unchanged.
 */
import type {
  AskAiDebug,
  AssistantApiTrace,
  AssistantToolEvent,
  ConversationDetail,
  ConversationSummary,
  SSEEvent,
  StreamAiHandlers,
  WinstonTrace,
} from "@/lib/commandbar/assistantApi";
import type {
  AssistantContextEnvelope,
  AssistantResponseBlock,
} from "@/lib/commandbar/types";
import { winstonLoader } from "@/lib/loading-state";

const OPERATOR_BASE = "/api/ai/operator";

let _opRequestSeq = 0;
function nextOperatorRequestId(): string {
  _opRequestSeq += 1;
  return `op-${Date.now().toString(36)}-${_opRequestSeq.toString(36)}`;
}

function operatorError(message: string, status?: number) {
  const err = new Error(message) as Error & { status?: number; errorCode?: string };
  err.status = status;
  err.errorCode = "WINSTON_OPERATOR_UNAVAILABLE";
  return err;
}

export type StreamOperatorInput = {
  message: string;
  business_id?: string;
  env_id?: string;
  conversation_id?: string;
  context_envelope?: AssistantContextEnvelope;
  /** Forwarded to the backend so receipts capture the routing decision. */
  routingHint?: { runtime: "gateway" | "managed_agent" | "auto"; reason: string };
  signal?: AbortSignal;
} & Pick<
  StreamAiHandlers,
  | "onContext"
  | "onStatus"
  | "onProgress"
  | "onToken"
  | "onToolActivity"
  | "onResponseBlock"
  | "onConfirmationRequired"
  | "onDone"
  | "onError"
>;

export type StreamOperatorResult = {
  answer: string;
  blocks: AssistantResponseBlock[];
  trace: AssistantApiTrace;
  debug: AskAiDebug;
  /** Operator-specific: the conversation we wrote to (created if absent). */
  conversation_id?: string | null;
};

export async function streamOperator(input: StreamOperatorInput): Promise<StreamOperatorResult> {
  const requestId = nextOperatorRequestId();
  const startedAt = Date.now();
  const endpoint = `${OPERATOR_BASE}/ask`;

  const trace: AssistantApiTrace = {
    requestId,
    endpoint,
    method: "POST",
    startedAt,
    durationMs: 0,
    status: 0,
    ok: false,
  };

  const debug: AskAiDebug = {
    contextEnvelope: input.context_envelope,
    resolvedScope: null,
    toolCalls: [],
    toolResults: [],
    citations: [],
    responseBlocks: [],
    trace: null,
    turnReceipt: null,
    eventLog: [],
  };

  let answer = "";
  let conversationIdHeader: string | null = null;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bm-request-id": requestId,
        "x-request-id": requestId,
        "x-winston-runtime": "managed_agent",
      },
      body: JSON.stringify({
        message: input.message,
        session_id: requestId,
        conversation_id: input.conversation_id || null,
        env_id: input.env_id || null,
        business_id: input.business_id || null,
        context_envelope: input.context_envelope || null,
        routing_hint: input.routingHint || { runtime: "managed_agent", reason: "manual_operator" },
      }),
      signal: input.signal,
    });
  } catch (err) {
    trace.durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "operator_fetch_failed";
    debug.eventLog.push({
      seq: 0,
      timestamp: Date.now(),
      elapsedMs: 0,
      eventType: "error",
      payload: { message },
      summary: `Operator fetch failed: ${message}`,
    });
    input.onError?.(message);
    throw operatorError(`Operator fetch failed: ${message}`);
  }

  trace.status = response.status;
  trace.ok = response.ok;
  conversationIdHeader = response.headers.get("x-winston-conversation-id");

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    trace.durationMs = Date.now() - startedAt;
    const message = body || `HTTP ${response.status}`;
    debug.eventLog.push({
      seq: 0,
      timestamp: Date.now(),
      elapsedMs: 0,
      eventType: "error",
      payload: { status: response.status, body: body.slice(0, 400) },
      summary: `Operator unavailable: ${response.status}`,
    });
    input.onError?.(message, { status: response.status });
    throw operatorError(message, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    trace.durationMs = Date.now() - startedAt;
    throw operatorError("Operator response did not include a stream.", response.status);
  }

  winstonLoader.aiStart();
  const decoder = new TextDecoder();
  let lineBuffer = "";
  let currentEvent = "";
  let sseSeq = 0;
  const sseStartMs = Date.now();
  let sawTerminal = false;
  let streamError: string | null = null;

  const onAbort = () => reader.cancel();
  input.signal?.addEventListener("abort", onAbort, { once: true });

  const log = (eventType: string, payload: unknown, summary: string) => {
    const now = Date.now();
    const evt: SSEEvent = {
      seq: sseSeq++,
      timestamp: now,
      elapsedMs: now - sseStartMs,
      eventType,
      payload,
      summary,
    };
    debug.eventLog.push(evt);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
          currentEvent = "";
          continue;
        }
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (!line.startsWith("data: ")) continue;
        const dataRaw = line.slice(6).trim();
        if (!dataRaw || dataRaw === "[DONE]") continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataRaw);
        } catch {
          log("parse_error", { raw: dataRaw.slice(0, 120) }, "Failed to parse operator SSE payload");
          continue;
        }

        switch (currentEvent) {
          case "status": {
            const value = String((parsed.value as string | undefined) || "");
            const summary = (parsed.stage as string | undefined) || value || "operator status";
            log("status", parsed, summary);
            input.onStatus?.(value || summary, parsed);
            break;
          }
          case "tool_call": {
            const evt: AssistantToolEvent = {
              tool_name: String(parsed.tool_name || "unknown"),
              label: (parsed.label as string | undefined) || (parsed.tool_name as string | undefined),
              args: parsed.args,
              is_write: Boolean(parsed.is_write),
              pending_confirmation: Boolean(parsed.pending_confirmation),
            };
            debug.toolCalls.push(evt);
            log("tool_call", parsed, `${evt.label || evt.tool_name}`);
            input.onToolActivity?.(evt);
            break;
          }
          case "tool_result": {
            const evt: AssistantToolEvent = {
              tool_name: String(parsed.tool_name || "unknown"),
              success: Boolean(parsed.success),
              duration_ms:
                typeof parsed.duration_ms === "number" ? parsed.duration_ms : undefined,
              result_preview:
                typeof parsed.result_preview === "string"
                  ? (parsed.result_preview as string)
                  : parsed.result_preview
                    ? JSON.stringify(parsed.result_preview).slice(0, 200)
                    : undefined,
            };
            debug.toolResults.push(evt);
            log("tool_result", parsed, `result for ${evt.tool_name}`);
            break;
          }
          case "confirmation_required": {
            log("confirmation_required", parsed, `awaiting confirmation: ${parsed.tool_name || "tool"}`);
            input.onConfirmationRequired?.(parsed);
            break;
          }
          case "response_block": {
            const block = parsed.block as AssistantResponseBlock | undefined;
            if (!block) break;
            debug.responseBlocks?.push(block);
            if (block.type === "markdown_text" && typeof block.markdown === "string") {
              answer += (answer ? "\n\n" : "") + block.markdown;
            }
            log("response_block", { type: block.type, block_id: block.block_id }, `block: ${block.type}`);
            input.onResponseBlock?.(block);
            break;
          }
          case "done": {
            sawTerminal = true;
            debug.done = parsed;
            const incomingTrace = parsed.trace as WinstonTrace | undefined;
            if (incomingTrace) debug.trace = incomingTrace;
            log("done", parsed, `operator done (${incomingTrace?.tool_call_count ?? 0} tools)`);
            input.onDone?.(parsed);
            break;
          }
          case "error": {
            sawTerminal = true;
            const message = String(parsed.message || "operator_error");
            streamError = message;
            log("error", parsed, `error: ${message}`);
            input.onError?.(message, parsed);
            break;
          }
          default: {
            log(currentEvent || "unknown", parsed, `unhandled operator event: ${currentEvent || "?"}`);
            break;
          }
        }
      }
    }
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
  }

  trace.durationMs = Date.now() - startedAt;
  if (streamError) {
    throw operatorError(streamError, trace.status);
  }
  if (!sawTerminal) {
    throw operatorError("Operator stream ended without a terminal event.", trace.status);
  }
  return {
    answer,
    blocks: debug.responseBlocks ?? [],
    trace,
    debug,
    conversation_id: conversationIdHeader,
  };
}

// ── Conversation CRUD (operator-scoped) ─────────────────────────────

export async function createOperatorConversation(input: {
  business_id: string;
  env_id?: string;
  title?: string | null;
  thread_kind?: "contextual" | "general";
  scope_type?: string | null;
  scope_id?: string | null;
  scope_label?: string | null;
  launch_source?: string | null;
  context_summary?: string | null;
  last_route?: string | null;
}): Promise<ConversationDetail> {
  const res = await fetch(`${OPERATOR_BASE}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: input.business_id,
      env_id: input.env_id || null,
      title: input.title ?? null,
      thread_kind: input.thread_kind || "general",
      scope_type: input.scope_type ?? null,
      scope_id: input.scope_id ?? null,
      scope_label: input.scope_label ?? null,
      launch_source: input.launch_source ?? null,
      context_summary: input.context_summary ?? null,
      last_route: input.last_route ?? null,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(body || `Operator createConversation failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as ConversationDetail;
}

export async function listOperatorConversations(businessId: string): Promise<ConversationSummary[]> {
  const res = await fetch(
    `${OPERATOR_BASE}/conversations?business_id=${encodeURIComponent(businessId)}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { conversations?: ConversationSummary[] };
  return data.conversations || [];
}

export async function getOperatorConversation(conversationId: string): Promise<ConversationDetail | null> {
  const res = await fetch(`${OPERATOR_BASE}/conversations/${conversationId}`);
  if (!res.ok) return null;
  return (await res.json()) as ConversationDetail;
}

export async function archiveOperatorConversation(conversationId: string): Promise<void> {
  await fetch(`${OPERATOR_BASE}/conversations/${conversationId}`, { method: "DELETE" });
}

// ── Tool confirmation handoff ───────────────────────────────────────

export async function confirmOperatorAction(input: {
  anthropic_session_id: string;
  tool_call_id: string;
  result: "allow" | "deny";
  deny_message?: string | null;
}): Promise<{ tool_call_id: string; status: string; decided_by: string | null }> {
  const res = await fetch(
    `${OPERATOR_BASE}/sessions/${encodeURIComponent(input.anthropic_session_id)}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool_call_id: input.tool_call_id,
        result: input.result,
        deny_message: input.deny_message ?? null,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(body || `Operator confirm failed: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as { tool_call_id: string; status: string; decided_by: string | null };
}

// ── Receipts ───────────────────────────────────────────────────────

export type OperatorReceipt = {
  receipt_id: string;
  conversation_id: string;
  runtime: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tool_calls: number | null;
  session_runtime_ms: number | null;
  routing_decision: string | null;
  routing_reason: string | null;
  anthropic_session_id: string | null;
  stop_reason_type: string | null;
  errors: Record<string, unknown> | null;
  created_at: string | null;
};

export async function listOperatorReceipts(
  conversationId: string,
  limit = 5,
): Promise<OperatorReceipt[]> {
  const res = await fetch(
    `${OPERATOR_BASE}/receipts?conversation_id=${encodeURIComponent(conversationId)}&limit=${limit}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { receipts?: OperatorReceipt[] };
  return data.receipts || [];
}
