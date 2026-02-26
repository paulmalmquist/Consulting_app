import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function currentOrigin(request: NextRequest): string {
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  // Reuse the hardened BOS proxy stack (/bos/*), which already supports
  // BOS_API_ORIGIN inference and production-safe header handling.
  const upstreamUrl = new URL("/bos/api/metrics", currentOrigin(request));
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
