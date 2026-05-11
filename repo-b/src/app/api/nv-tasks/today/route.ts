import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = process.env.BOS_API_ORIGIN || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const upstreamUrl = new URL("/api/nv-tasks/today", API_BASE);
  upstreamUrl.search = request.nextUrl.search;

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "NV Tasks backend unavailable." },
      { status: 503 }
    );
  }
}
