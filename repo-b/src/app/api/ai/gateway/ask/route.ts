/**
 * AI Gateway — SSE proxy with direct OpenAI fallback.
 *
 * 1. Try the FastAPI backend at BOS_API_ORIGIN
 * 2. If backend is unavailable (404/5xx/network), fall back to direct OpenAI call
 * 3. Keeps OPENAI_API_KEY server-side only
 */
import { NextRequest } from "next/server";
import { hasSession, getSessionActor, unauthorizedJson } from "@/lib/server/sessionAuth";

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

  // Build the payload matching FastAPI GatewayAskRequest
  const gatewayBody = JSON.stringify({
    message,
    business_id: parsed.business_id || null,
    env_id: parsed.env_id || null,
    session_id: parsed.session_id || null,
    conversation_id: parsed.conversation_id || null,
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
    { role: "system", content: SYSTEM_PROMPT },
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
      temperature: 0.3,
      max_tokens: 2048,
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
