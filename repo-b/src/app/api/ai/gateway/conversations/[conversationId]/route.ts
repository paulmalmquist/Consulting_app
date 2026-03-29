/**
 * AI Gateway — Single conversation proxy.
 *
 * GET    /api/ai/gateway/conversations/:id — get conversation + messages
 * DELETE /api/ai/gateway/conversations/:id — archive conversation
 */
import { NextRequest } from "next/server";
import { hasSession, unauthorizedJson } from "@/lib/server/sessionAuth";
import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!(await hasSession(req))) return unauthorizedJson();
  const { conversationId } = await params;

  const upstream = await fetch(
    `${FASTAPI_BASE}/api/ai/gateway/conversations/${conversationId}`,
    { headers: await buildPlatformSessionHeaders(req), signal: AbortSignal.timeout(10_000) },
  );

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  if (!(await hasSession(req))) return unauthorizedJson();
  const { conversationId } = await params;

  const upstream = await fetch(
    `${FASTAPI_BASE}/api/ai/gateway/conversations/${conversationId}`,
    { method: "DELETE", headers: await buildPlatformSessionHeaders(req), signal: AbortSignal.timeout(10_000) },
  );

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
