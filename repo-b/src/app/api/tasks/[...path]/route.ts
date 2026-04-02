import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_BASE =
  process.env.BOS_API_ORIGIN ||
  "http://127.0.0.1:8000";

async function forward(request: NextRequest, path: string[]) {
  const upstreamPath = path.length ? `/api/tasks/${path.join("/")}` : "/api/tasks";
  const upstreamUrl = new URL(upstreamPath, API_BASE);
  upstreamUrl.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      body,
      cache: "no-store",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { detail: "Tasks backend route unavailable." },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(request, params.path || []);
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(request, params.path || []);
}

export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(request, params.path || []);
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(request, params.path || []);
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(request, params.path || []);
}
