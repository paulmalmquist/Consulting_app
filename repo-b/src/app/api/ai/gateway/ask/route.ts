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
  const body = await req.text();

  // Try FastAPI backend first
  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bm-actor": actor,
        "x-bm-request-id": req.headers.get("x-bm-request-id") || crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(10_000),
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
    // Backend returned error — fall through to direct OpenAI
  } catch {
    // Backend unreachable — fall through to direct OpenAI
  }

  // Fallback: call OpenAI directly
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI backend unavailable and no OPENAI_API_KEY configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const parsed = JSON.parse(body) as {
    messages?: Array<{ role: string; content: string }>;
    stream?: boolean;
  };

  const messages = parsed.messages || [];
  // Prepend system prompt if not already present
  if (!messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

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
