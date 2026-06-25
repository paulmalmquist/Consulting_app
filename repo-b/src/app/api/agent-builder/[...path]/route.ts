import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import { parseSessionFromRequest } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  const session = await parseSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const path = (ctx.params.path || []).map(encodeURIComponent).join("/");
  const target = new URL(`/api/agent-builder/${path}`, FASTAPI_BASE);
  target.search = req.nextUrl.search;
  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      cache: "no-store",
      headers: {
        "content-type": req.headers.get("content-type") || "application/json",
        "x-bm-request-id": req.headers.get("x-bm-request-id") || "",
        ...(await buildPlatformSessionHeaders(req)),
      },
      body,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach backend";
    return NextResponse.json({ error: `Agent Builder proxy error: ${message}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
