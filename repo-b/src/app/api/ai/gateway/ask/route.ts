/**
 * SSE proxy: browser → Next.js → FastAPI AI Gateway
 *
 * - Keeps OPENAI_API_KEY on the server (never exposed to browser)
 * - Adds session auth check
 * - Same-origin for Vercel (avoids CORS)
 */
import { NextRequest } from "next/server";
import { hasDemoSession, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.DEMO_API_ORIGIN ||
  process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  if (!hasDemoSession(req)) {
    return unauthorizedJson();
  }

  const body = await req.text();

  const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bm-actor": "demo_user",
      "x-bm-request-id": req.headers.get("x-bm-request-id") || crypto.randomUUID(),
    },
    body,
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return new Response(
      JSON.stringify({ error: errorText.slice(0, 500) }),
      { status: upstream.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pass through the SSE stream without buffering
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
