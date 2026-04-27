/**
 * Unified runtime selector for Winston chat.
 *
 * Provider call sites use this in place of `streamAi()` so a single function
 * handles both runtimes. The gateway path is genuinely untouched: when the
 * runtime resolves to "gateway", we delegate to `streamAi()` with no shape
 * transformation. When it resolves to "managed_agent" we delegate to the
 * Operator transport.
 *
 * Auto-router (Phase: scaffolded). When `runtime === "auto"`, the client
 * conservatively routes to the gateway transport (it cannot guarantee the
 * backend's auto-router flag is on), and the request includes
 * `routing_hint: { runtime: "auto" }` so the operator transport could log
 * decisions if/when the routing flips. To enable end-to-end auto-routing
 * later, set `WINSTON_AUTO_ROUTER_ENABLED=true` server-side AND update
 * `runtimeRouter.isOperatorActive` to include "auto".
 *
 * Conversation CRUD wrappers route to the appropriate endpoint set.
 * Switching runtime invalidates conversation history (different list, no
 * cross-runtime bleed) — that's enforced server-side by the per-runtime
 * filter on `list_conversations`.
 */
import {
  archiveConversation as archiveGatewayConversation,
  createConversation as createGatewayConversation,
  getConversation as getGatewayConversation,
  listConversations as listGatewayConversations,
  streamAi,
  type AskAiDebug,
  type AssistantApiTrace,
  type ConversationDetail,
  type ConversationSummary,
} from "@/lib/commandbar/assistantApi";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import {
  archiveOperatorConversation,
  createOperatorConversation,
  getOperatorConversation,
  listOperatorConversations,
  streamOperator,
  type StreamOperatorInput,
} from "@/lib/winston-companion/transports/operatorTransport";
import {
  isOperatorActive,
  resolveRuntime,
  type WinstonRuntime,
} from "@/lib/winston-companion/runtimeRouter";

/**
 * Flat result shape compatible with `streamAi()`'s return so call sites stay
 * unchanged. Operator-specific extras (`conversation_id` from the response
 * header, `runtime` / `resolved`) are additive and ignored by gateway-only
 * consumers.
 */
export type SendWinstonResult = {
  answer: string;
  blocks: AssistantResponseBlock[];
  trace: AssistantApiTrace;
  debug: AskAiDebug;
  runtime: WinstonRuntime;
  resolved: "gateway" | "managed_agent";
  /** Set when the operator route created a conversation server-side. */
  conversation_id?: string | null;
};

type SendInput = StreamOperatorInput &
  Parameters<typeof streamAi>[0] & {
    /** Force a runtime regardless of resolveRuntime(). Useful for tests. */
    runtimeOverride?: WinstonRuntime;
  };

export async function sendWinstonMessage(input: SendInput): Promise<SendWinstonResult> {
  const requested: WinstonRuntime = input.runtimeOverride ?? resolveRuntime();
  const goesToOperator = isOperatorActive(requested);

  const routingHint = {
    runtime: requested,
    reason:
      requested === "auto"
        ? "auto_resolved_client"
        : requested === "managed_agent"
          ? "manual_operator"
          : "manual_gateway",
  } as const;

  if (goesToOperator) {
    const operator = await streamOperator({
      ...input,
      routingHint,
    });
    return {
      answer: operator.answer,
      blocks: operator.blocks,
      trace: operator.trace,
      debug: operator.debug,
      runtime: requested,
      resolved: "managed_agent",
      conversation_id: operator.conversation_id ?? input.conversation_id ?? null,
    };
  }

  const gateway = await streamAi(input);
  return {
    answer: gateway.answer,
    blocks: gateway.blocks,
    trace: gateway.trace,
    debug: gateway.debug,
    runtime: requested,
    resolved: "gateway",
    conversation_id: input.conversation_id ?? null,
  };
}

// ── Conversation CRUD wrappers ─────────────────────────────────────

export async function createWinstonConversation(input: {
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
  runtimeOverride?: WinstonRuntime;
}): Promise<ConversationDetail> {
  const requested: WinstonRuntime = input.runtimeOverride ?? resolveRuntime();
  if (isOperatorActive(requested)) {
    return createOperatorConversation(input);
  }
  return createGatewayConversation(input);
}

export async function listWinstonConversations(
  businessId: string,
  runtimeOverride?: WinstonRuntime,
): Promise<ConversationSummary[]> {
  const requested: WinstonRuntime = runtimeOverride ?? resolveRuntime();
  if (isOperatorActive(requested)) {
    return listOperatorConversations(businessId);
  }
  return listGatewayConversations(businessId);
}

export async function getWinstonConversation(
  conversationId: string,
  runtimeOverride?: WinstonRuntime,
): Promise<ConversationDetail | null> {
  const requested: WinstonRuntime = runtimeOverride ?? resolveRuntime();
  if (isOperatorActive(requested)) {
    return getOperatorConversation(conversationId);
  }
  return getGatewayConversation(conversationId);
}

export async function archiveWinstonConversation(
  conversationId: string,
  runtimeOverride?: WinstonRuntime,
): Promise<void> {
  const requested: WinstonRuntime = runtimeOverride ?? resolveRuntime();
  if (isOperatorActive(requested)) {
    return archiveOperatorConversation(conversationId);
  }
  return archiveGatewayConversation(conversationId);
}
