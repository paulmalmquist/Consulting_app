import { NextRequest } from "next/server";

export const runtime = "nodejs";

function inferUpstreamOrigin(request: NextRequest): string {
  const configured =
    process.env.DEMO_API_ORIGIN ||
    process.env.DEMO_API_BASE_URL ||
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const hostHeader =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8001";
  }

  const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return `https://api.${root}`;
}

async function proxy(request: NextRequest, ctx: { params: { path: string[] } }) {
  const upstreamOrigin = inferUpstreamOrigin(request);

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`/v1/${(ctx.params.path || []).join("/")}`, upstreamOrigin);
  upstreamUrl.search = incomingUrl.search;

  // Forward most headers, but don't leak or forward hop-by-hop or app cookies.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("cookie");

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    // Required by Node fetch when streaming request bodies.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    duplex: "half",
  });

  const resHeaders = new Headers(upstreamRes.headers);
  // Same-origin callers don't need upstream CORS headers (and they can be misleading).
  resHeaders.delete("access-control-allow-origin");
  resHeaders.delete("access-control-allow-credentials");
  resHeaders.delete("access-control-allow-headers");
  resHeaders.delete("access-control-allow-methods");
  resHeaders.delete("access-control-expose-headers");

  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;

