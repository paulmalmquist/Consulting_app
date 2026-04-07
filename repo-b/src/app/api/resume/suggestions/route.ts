/**
 * Public proxy for resume chat starter suggestions — no authentication required.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN || "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(_req: NextRequest) {
  const upstream = await fetch(
    `${FASTAPI_BASE}/api/resume/v1/chat/suggestions`,
    { signal: AbortSignal.timeout(5_000) },
  );

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
