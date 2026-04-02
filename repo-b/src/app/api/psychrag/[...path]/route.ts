import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join("/");
  const search = req.nextUrl.search || "";
  const upstreamUrl = `${FASTAPI_BASE}/api/psychrag/v1/${path}${search}`;
  const contentType = req.headers.get("content-type") || "";
  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : contentType.includes("application/json")
      ? await req.text()
      : await req.arrayBuffer();

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(req.headers.get("authorization") ? { authorization: req.headers.get("authorization") as string } : {}),
    },
    body,
  });

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
  if (upstreamContentType?.includes("text/event-stream")) {
    responseHeaders.set("cache-control", "no-cache, no-transform");
    responseHeaders.set("connection", "keep-alive");
    responseHeaders.set("x-accel-buffering", "no");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params);
}
