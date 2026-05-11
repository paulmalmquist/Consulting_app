import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE = process.env.BOS_API_ORIGIN || "http://127.0.0.1:8000";

async function forward(request: NextRequest, subpath: string = "") {
  const upstreamUrl = new URL(`/api/nv-tasks${subpath}`, API_BASE);
  upstreamUrl.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      body,
      cache: "no-store",
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/json",
      },
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

export async function GET(request: NextRequest) {
  return forward(request);
}

export async function POST(request: NextRequest) {
  return forward(request);
}
