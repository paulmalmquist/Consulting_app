import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import { parseSessionFromRequest } from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only proxy for the AI Provider Dispatch admin panel. GET-only by design:
// the dispatch execution endpoint (POST /run) and dry-run POST /route are NOT
// forwarded here, so the admin UI cannot trigger a provider call. Forwards to the
// backend /api/ai/dispatch/* surface, independent of ai_gateway.
const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  // Fail closed on auth: no session -> 401, never an empty success.
  const session = await parseSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const path = (ctx.params.path || []).map(encodeURIComponent).join("/");
  const target = new URL(`/api/ai/dispatch/${path}`, FASTAPI_BASE);
  target.search = req.nextUrl.search;

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(await buildPlatformSessionHeaders(req)),
      },
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
