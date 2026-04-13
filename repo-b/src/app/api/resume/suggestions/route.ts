/**
 * Public proxy for resume chat starter suggestions — no authentication required.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN || "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope");
  const upstreamUrl = new URL(`${FASTAPI_BASE}/api/resume/v1/chat/suggestions`);
  if (scope) upstreamUrl.searchParams.set("scope", scope);

  const upstream = await fetch(
    upstreamUrl,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    },
  );

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
