import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE =
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const upstreamUrl = new URL("/api/metrics", API_BASE);
  upstreamUrl.search = request.nextUrl.search;

  try {
    const upstream = await fetch(upstreamUrl.toString(), { cache: "no-store" });
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
