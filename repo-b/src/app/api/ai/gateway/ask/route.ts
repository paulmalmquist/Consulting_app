/**
 * AI Gateway — SSE proxy with direct OpenAI fallback.
 *
 * 1. Try the FastAPI backend at BOS_API_ORIGIN
 * 2. If backend is unavailable (404/5xx/network), fall back to direct OpenAI call
 * 3. Keeps OPENAI_API_KEY server-side only
 */
import { NextRequest } from "next/server";
import type { AssistantContextEnvelope } from "@/lib/commandbar/types";
import { getSessionActor, hasSession, parseSessionFromRequest, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `You are Winston, an AI assistant for real estate private equity portfolio managers.
You help analyze assets, funds, and investments. Be concise and data-driven.
Key metrics you understand: TVPI, IRR, DPI, NAV, DSCR, LTV, Cap Rate, NOI, Debt Yield.
Format numbers clearly. Use bullet points for lists. Flag when data may need verification.`;

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

function buildFallbackContextEnvelope(
  req: NextRequest,
  parsed: {
    business_id?: string;
    env_id?: string;
    conversation_id?: string;
    entity_type?: string;
    entity_id?: string;
    context_envelope?: AssistantContextEnvelope;
  },
): AssistantContextEnvelope {
  const session = parseSessionFromRequest(req);
  const route = parsed.context_envelope?.ui?.route || routeFromRequest(req);
  const activeEnvironmentId = parsed.context_envelope?.ui?.active_environment_id || parsed.env_id || session?.env_id || envIdFromRoute(route);
  const activeBusinessId = parsed.context_envelope?.ui?.active_business_id || parsed.business_id || null;

  const fallback: AssistantContextEnvelope = {
    session: {
      user_id: null,
      org_id: activeBusinessId,
      actor: getSessionActor(req),
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

function buildHiddenContextBlock(envelope: AssistantContextEnvelope) {
  const selected = envelope.ui.selected_entities.length
    ? envelope.ui.selected_entities.map((entity) => `${entity.entity_type}:${entity.name || entity.entity_id}`).join(", ")
    : "none";
  return [
    "CURRENT APPLICATION CONTEXT",
    `Route: ${envelope.ui.route || "unknown"}`,
    `Surface: ${envelope.ui.surface || "unknown"}`,
    `Active Environment: ${envelope.ui.active_environment_name || envelope.ui.active_environment_id || "unknown"}`,
    `Business ID: ${envelope.ui.active_business_id || envelope.session.org_id || "unknown"}`,
    `Schema: ${envelope.ui.schema_name || "unknown"}`,
    `Industry: ${envelope.ui.industry || "unknown"}`,
    `Page Entity: ${envelope.ui.page_entity_type || "unknown"}:${envelope.ui.page_entity_id || "unknown"}`,
    `Selected Entities: ${selected}`,
    "Instructions:",
    "- Default questions to the active environment.",
    "- Never ask for identifiers already present in context.",
    "- Trust visible UI data over a conflicting assumption.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  if (!hasSession(req)) {
    return unauthorizedJson();
  }

  const actor = getSessionActor(req);
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

  const contextEnvelope = buildFallbackContextEnvelope(req, parsed);

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

  // Try FastAPI backend first (60s timeout — tool-calling workflows take 15-20s)
  const requestId = req.headers.get("x-bm-request-id") || crypto.randomUUID();
  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bm-actor": actor,
        "x-bm-request-id": requestId,
        "x-request-id": requestId,
      },
      body: gatewayBody,
      signal: AbortSignal.timeout(60_000),
    });

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
    console.warn(`[ai-gateway] Backend returned ${upstream.status} for ${requestId}; falling back to OpenAI`);
  } catch (err) {
    console.warn(`[ai-gateway] Backend unreachable for ${requestId}: ${err instanceof Error ? err.message : err}; falling back to OpenAI`);
  }

  // Fallback: call OpenAI directly (no tools, no RAG — just basic chat)
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI backend unavailable and no OPENAI_API_KEY configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const messages = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${buildHiddenContextBlock(contextEnvelope)}` },
    { role: "user", content: message },
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      stream: true,
      // GPT-5 family and o-series don't support custom temperature — only include for GPT-4o
      ...(!/^(gpt-5|o[13])/.test(OPENAI_MODEL.toLowerCase()) && { temperature: 0.3 }),
      // GPT-5 and o-series use max_completion_tokens; GPT-4o uses max_tokens
      ...(/^(gpt-5|o[13])/.test(OPENAI_MODEL.toLowerCase())
        ? { max_completion_tokens: 2048 }
        : { max_tokens: 2048 }),
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `OpenAI error (${openaiRes.status}): ${errText.slice(0, 300)}` }),
      { status: openaiRes.status, headers: { "Content-Type": "application/json" } },
    );
  }

  // Pass through OpenAI SSE stream
  return new Response(openaiRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
