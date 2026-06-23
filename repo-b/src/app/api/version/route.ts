import { NextRequest, NextResponse } from "next/server";

// Same-origin proxy for the backend root `GET /version` (app/routes/health.py),
// which is not under the /api/telemetry catch-all. The Deployment/CI evidence
// card reads the live backend git SHA through here. Fails closed (503) when the
// backend is unreachable, so the card degrades to a backend-only error state.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://127.0.0.1:8000";
  }
}

function inferUpstreamOrigin(request: NextRequest): string {
  const configured = (process.env.BOS_API_ORIGIN || "").trim();
  if (configured) {
    if (configured.startsWith("/")) return requestOrigin(request);
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }

  const hostHeader =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  if (hostname) {
    const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return `https://api.${root}`;
  }

  return "http://127.0.0.1:8000";
}

export async function GET(request: NextRequest) {
  const upstreamUrl = new URL("/version", inferUpstreamOrigin(request));
  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "Backend version route unavailable." }, { status: 503 });
  }
}
