import { NextRequest, NextResponse } from "next/server";

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

async function forward(request: NextRequest, context: { params: { path: string[] } }) {
  const upstreamOrigin = inferUpstreamOrigin(request);
  const path = (context.params.path || []).map(encodeURIComponent).join("/");
  const upstreamUrl = new URL(`/api/v1/dissensus/${path}`, upstreamOrigin);
  upstreamUrl.search = request.nextUrl.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: request.method,
      cache: "no-store",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "x-bm-request-id": request.headers.get("x-bm-request-id") || "",
      },
      body,
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Dissensus backend route unavailable." },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context);
}
