/**
 * AI Gateway — SSE proxy to the canonical FastAPI backend.
 *
 * Product rule: the backend AI Gateway is the ONLY valid runtime for
 * user-facing Winston chat.  If the backend is unavailable, broken, or
 * unauthorized, we return a controlled error — we do NOT silently fall
 * back to a direct OpenAI call (which would strip tools, RAG, and
 * change product semantics).
 *
 * Fail closed.  Loud > degraded.
 */
import { NextRequest } from "next/server";
import type { AssistantContextEnvelope } from "@/lib/commandbar/types";
import { getSessionActor, hasSession, parseSessionFromRequest, unauthorizedJson } from "@/lib/server/sessionAuth";
import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  "http://localhost:8000"
).replace(/\/$/, "");

/* Direct OpenAI fallback intentionally removed — see product rule above. */

function routeFromRequest(req: NextRequest): string | null {
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).pathname || null;
  } catch {
    return null;
  }
}

function envIdFromRoute(route: string | null): string | null {
  const match = route?.match(/^\/lab\/env\/([^/]+)/);
  return match?.[1] || null;
}

async function buildFallbackContextEnvelope(
  req: NextRequest,
  parsed: {
    business_id?: string;
    env_id?: string;
    conversation_id?: string;
    entity_type?: string;
    entity_id?: string;
    context_envelope?: AssistantContextEnvelope;
  },
): Promise<AssistantContextEnvelope> {
  const session = await parseSessionFromRequest(req);
  const route = parsed.context_envelope?.ui?.route || routeFromRequest(req);
  const activeEnvironmentId = parsed.context_envelope?.ui?.active_environment_id || parsed.env_id || session?.env_id || envIdFromRoute(route);
  const activeBusinessId = parsed.context_envelope?.ui?.active_business_id || parsed.business_id || null;

  const fallback: AssistantContextEnvelope = {
    session: {
      user_id: null,
      org_id: activeBusinessId,
      actor: await getSessionActor(req),
      roles: session?.role ? [session.role] : [],
      session_env_id: session?.env_id || activeEnvironmentId || null,
    },
    ui: {
      route,
      surface: null,
      active_module: route?.startsWith("/lab") ? "lab" : route?.startsWith("/app") ? "bos" : null,
      active_environment_id: activeEnvironmentId,
      active_environment_name: null,
      active_business_id: activeBusinessId,
      active_business_name: null,
      schema_name: null,
      industry: null,
      page_entity_type: parsed.entity_type || null,
      page_entity_id: parsed.entity_id || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: null,
    },
    thread: {
      thread_id: parsed.conversation_id || null,
      assistant_mode: "environment_copilot",
      scope_type: parsed.entity_type || (activeEnvironmentId ? "environment" : "global"),
      scope_id: parsed.entity_id || activeEnvironmentId || activeBusinessId || null,
      launch_source: "winston_commandbar",
    },
  };

  return {
    session: {
      ...fallback.session,
      ...(parsed.context_envelope?.session || {}),
    },
    ui: {
      ...fallback.ui,
      ...(parsed.context_envelope?.ui || {}),
      selected_entities: parsed.context_envelope?.ui?.selected_entities || fallback.ui.selected_entities,
      visible_data: parsed.context_envelope?.ui?.visible_data ?? fallback.ui.visible_data,
    },
    thread: {
      ...fallback.thread,
      ...(parsed.context_envelope?.thread || {}),
    },
  };
}


export async function POST(req: NextRequest) {
  if (!(await hasSession(req))) {
    return unauthorizedJson();
  }

  const actor = await getSessionActor(req);
  const raw = await req.text();

  // Parse the frontend payload
  let parsed: {
    message?: string;
    business_id?: string;
    env_id?: string;
    session_id?: string;
    conversation_id?: string;
    entity_type?: string;
    entity_id?: string;
    context_envelope?: AssistantContextEnvelope;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = parsed.message || "";
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contextEnvelope = await buildFallbackContextEnvelope(req, parsed);

  // Build the payload matching FastAPI GatewayAskRequest
  const gatewayBody = JSON.stringify({
    message,
    business_id: parsed.business_id || null,
    env_id: parsed.env_id || null,
    session_id: parsed.session_id || null,
    conversation_id: parsed.conversation_id || null,
    entity_type: parsed.entity_type || null,
    entity_id: parsed.entity_id || null,
    context_envelope: contextEnvelope,
  });

  // Proxy to canonical FastAPI backend (fail-closed — no fallback).
  // Connection-only timeout (10s) — once headers arrive, let the SSE body
  // stream as long as needed. Tool-calling workflows can take 40-70s across
  // multiple LLM rounds; a body timeout would silently kill the stream mid-flight.
  const requestId = req.headers.get("x-bm-request-id") || crypto.randomUUID();
  try {
    const proxyCtrl = new AbortController();
    const connectTimer = setTimeout(() => proxyCtrl.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bm-request-id": requestId,
          "x-request-id": requestId,
          ...(await buildPlatformSessionHeaders(req)),
        },
        body: gatewayBody,
        signal: proxyCtrl.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }

    if (upstream.ok) {
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "Connection": "keep-alive",
        },
      });
    }

    // Backend returned an error — fail closed, no fallback.
    const status = upstream.status;
    const detail = await upstream.text().catch(() => "");
    console.error(`[ai-gateway] Backend returned ${status} for ${requestId}. No fallback. Detail: ${detail.slice(0, 300)}`);

    const reason =
      status === 401 || status === 403
        ? "unauthorized"
        : status === 404
          ? "backend_not_found"
          : status >= 500
            ? "backend_error"
            : "backend_error";

    return new Response(
      JSON.stringify({
        error: "Winston is not available right now.",
        reason,
        status,
        detail: detail.slice(0, 300),
        request_id: requestId,
        runtime: { backend_gateway_reached: true, canonical_runtime: false, degraded: true },
      }),
      {
        status: status >= 500 ? 503 : status,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-gateway] Backend unreachable for ${requestId}. No fallback. Error: ${errMsg}`);

    return new Response(
      JSON.stringify({
        error: "Winston is not available right now.",
        reason: "backend_unreachable",
        detail: errMsg.slice(0, 300),
        request_id: requestId,
        runtime: { backend_gateway_reached: false, canonical_runtime: false, degraded: true },
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
