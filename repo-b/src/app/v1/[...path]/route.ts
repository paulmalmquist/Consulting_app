import { NextRequest } from "next/server";

export const runtime = "nodejs";

function nowMs() {
  return Date.now();
}

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
    return "http://localhost:8000";
  }

  const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return `https://api.${root}`;
}

async function proxy(request: NextRequest, ctx: { params: { path: string[] } }) {
  const start = nowMs();
  const upstreamOrigin = inferUpstreamOrigin(request);

  const incomingUrl = new URL(request.url);

  // Handle same-origin API routes (e.g., DEMO_API_ORIGIN="/api")
  let upstreamUrl: URL;
  if (upstreamOrigin.startsWith("/")) {
    // Relative path: construct URL relative to current origin
    const currentOrigin = new URL(request.url).origin;
    upstreamUrl = new URL(`${upstreamOrigin}/v1/${(ctx.params.path || []).join("/")}`, currentOrigin);
  } else {
    // Absolute origin: use as-is
    upstreamUrl = new URL(`/v1/${(ctx.params.path || []).join("/")}`, upstreamOrigin);
  }
  upstreamUrl.search = incomingUrl.search;

  const requestId =
    request.headers.get("x-bm-request-id") ||
    `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  // Forward most headers, but don't leak or forward hop-by-hop or app cookies.
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("cookie");
  // Avoid upstream compression: Node/undici transparently decompresses but keeps
  // the `content-encoding` header, which can cause browsers to fail decoding.
  headers.set("accept-encoding", "identity");
  headers.set("x-bm-request-id", requestId);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      // Required by Node fetch when streaming request bodies.
      // @ts-ignore
      duplex: "half",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[v1-proxy] upstream fetch failed", {
      requestId,
      method: request.method,
      path: incomingUrl.pathname,
      upstream: upstreamUrl.toString(),
      ms: nowMs() - start,
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return new Response(
      JSON.stringify({ message: "Upstream unreachable", request_id: requestId }),
      { status: 502, headers: { "Content-Type": "application/json", "x-bm-request-id": requestId } }
    );
  }

  const resHeaders = new Headers(upstreamRes.headers);
  // Same-origin callers don't need upstream CORS headers (and they can be misleading).
  resHeaders.delete("access-control-allow-origin");
  resHeaders.delete("access-control-allow-credentials");
  resHeaders.delete("access-control-allow-headers");
  resHeaders.delete("access-control-allow-methods");
  resHeaders.delete("access-control-expose-headers");
  // Node fetch transparently decompresses but keeps upstream encoding/length.
  // If we forward those headers, browsers can throw ERR_CONTENT_DECODING_FAILED.
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  resHeaders.delete("transfer-encoding");
  resHeaders.set("x-bm-request-id", requestId);

  const elapsed = nowMs() - start;
  if (!upstreamRes.ok) {
    let snippet = "";
    try {
      // Log a small snippet for debugging; avoid large responses.
      snippet = (await upstreamRes.clone().text()).slice(0, 2000);
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.warn("[v1-proxy] upstream non-2xx", {
      requestId,
      method: request.method,
      path: incomingUrl.pathname,
      upstream: upstreamUrl.toString(),
      status: upstreamRes.status,
      ms: elapsed,
      body_snippet: snippet,
    });
  } else {
    // eslint-disable-next-line no-console
    console.log("[v1-proxy] ok", {
      requestId,
      method: request.method,
      path: incomingUrl.pathname,
      upstream: upstreamUrl.toString(),
      status: upstreamRes.status,
      ms: elapsed,
    });
  }

  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
