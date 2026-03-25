import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function requestOrigin(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://127.0.0.1:8000";
  }
}

function inferUpstreamOrigin(request: NextRequest): string {
  const candidates = [
    process.env.BOS_API_ORIGIN,
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.DEMO_API_ORIGIN,
    process.env.DEMO_API_BASE_URL,
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL,
  ];

  for (const raw of candidates) {
    const v = (raw || "").trim();
    if (!v) continue;
    if (v.startsWith("/")) {
      return requestOrigin(request);
    }
    try {
      const parsed = new URL(v);
      return parsed.origin;
    } catch {
      continue;
    }
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
  const upstreamOrigin = inferUpstreamOrigin(request);
  const upstreamUrl = new URL("/api/metrics", upstreamOrigin);
  upstreamUrl.search = request.nextUrl.search;

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      headers: {
        "x-bm-request-id": request.headers.get("x-bm-request-id") || "",
      },
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Metrics backend route unavailable." },
      { status: 503 }
    );
  }
}
