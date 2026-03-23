/**
 * AI Gateway — Conversation CRUD proxy.
 *
 * POST /api/ai/gateway/conversations — create conversation
 * GET  /api/ai/gateway/conversations?business_id=... — list conversations
 */
import { NextRequest } from "next/server";
import { hasSession, getSessionActor, unauthorizedJson } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  if (!hasSession(req)) return unauthorizedJson();

  const actor = getSessionActor(req);
  const body = await req.text();

  const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bm-actor": actor,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  if (!hasSession(req)) return unauthorizedJson();

  const businessId = req.nextUrl.searchParams.get("business_id") || "";
  if (!businessId) {
    return new Response(JSON.stringify({ error: "business_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(
    `${FASTAPI_BASE}/api/ai/gateway/conversations?business_id=${encodeURIComponent(businessId)}`,
    {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  );

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
