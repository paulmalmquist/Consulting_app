import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import { parseSessionFromRequest } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Own proxy for the ADE Ops Orchestrator, deliberately under `ade-ops` (not
// `ade`) so it never collides with the separate, deletable ADE product surface.
const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  // Fail closed on auth: no session -> 401, never an empty success.
  const session = await parseSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const path = (ctx.params.path || []).map(encodeURIComponent).join("/");
  const target = new URL(`/api/ade/ops/${path}`, FASTAPI_BASE);
  target.search = req.nextUrl.search;

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
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
  return forward(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
