import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import { parseSessionFromRequest } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy for the AI Provider Dispatch admin panel. GET is open for read-only inspection.
// POST is allowed ONLY for `config` (the Gemma on/off toggle) — never for `run`/`route`, so the
// admin UI still cannot trigger a provider call. Forwards to /api/ai/dispatch/*, independent of
// ai_gateway.
const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

const POST_ALLOWED = new Set(["config"]);

async function forward(
  req: NextRequest,
  ctx: { params: { path: string[] } },
  method: "GET" | "POST",
) {
  // Fail closed on auth: no session -> 401, never an empty success.
  const session = await parseSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const segments = ctx.params.path || [];
  if (method === "POST" && !POST_ALLOWED.has(segments[0] || "")) {
    // The UI may only POST the config toggle — never run/route.
    return NextResponse.json({ error: "Not permitted from this surface" }, { status: 405 });
  }

  const path = segments.map(encodeURIComponent).join("/");
  const target = new URL(`/api/ai/dispatch/${path}`, FASTAPI_BASE);
  target.search = req.nextUrl.search;
  const body = method === "POST" ? await req.text() : undefined;

  try {
    const upstream = await fetch(target.toString(), {
      method,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(await buildPlatformSessionHeaders(req)),
      },
      body,
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach backend";
    return NextResponse.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx, "GET");
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx, "POST");
}
