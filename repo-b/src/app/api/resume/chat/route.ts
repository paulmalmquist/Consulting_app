/**
 * Public proxy for resume chat SSE — no authentication required.
 * Forwards to FastAPI /api/resume/v1/chat and streams the response back.
 * Passes X-Forwarded-For so the backend can rate-limit by real client IP.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN || "http://localhost:8000"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const body = await req.text();

  const forwarded =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";

  const upstream = await fetch(`${FASTAPI_BASE}/api/resume/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("Retry-After") ?? "60";
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter,
      },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
