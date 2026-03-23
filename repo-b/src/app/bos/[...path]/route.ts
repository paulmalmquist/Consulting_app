/**
 * BOS API proxy — same-origin catch-all that forwards /bos/* requests
 * to the Business OS backend (FastAPI at backend/).
 *
 * This mirrors the pattern used by /v1/[...path]/route.ts for the Demo Lab
 * backend, but targets the BOS API (port 8000 by default).
 *
 * WHY: bos-api.ts previously called the backend directly from the browser,
 * requiring NEXT_PUBLIC_BOS_API_BASE_URL to be set correctly in production.
 * In production (Vercel), this meant cross-origin requests that either
 * failed due to CORS or because the env var defaulted to localhost:8000.
 * Using a same-origin proxy eliminates both failure modes.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";

function inferUpstreamOrigin(request: NextRequest): string {
  // Explicit BOS API origin takes priority
  const configured =
    process.env.BOS_API_ORIGIN ||
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Fall back to the Demo Lab backend — in a unified deployment,
  // both /v1/* and /api/* are served by the same process.
  const demoOrigin =
    process.env.DEMO_API_ORIGIN ||
    process.env.DEMO_API_BASE_URL ||
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL;
  if (demoOrigin) return demoOrigin.replace(/\/+$/, "");

  const hostHeader =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return `https://api.${root}`;
}

async function proxy(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const start = Date.now();
  const upstreamOrigin = inferUpstreamOrigin(request);
  const { path } = await ctx.params;

  const incomingUrl = new URL(request.url);

  // Reconstruct the original path: /bos/api/repe/context → /api/repe/context
  const upstreamPath = `/${(path || []).join("/")}`;
  let upstreamUrl: URL;
  if (upstreamOrigin.startsWith("/")) {
    const currentOrigin = new URL(request.url).origin;
    upstreamUrl = new URL(upstreamPath, currentOrigin);
  } else {
    upstreamUrl = new URL(upstreamPath, upstreamOrigin);
  }
  upstreamUrl.search = incomingUrl.search;

  const requestId =
    request.headers.get("x-bm-request-id") ||
    request.headers.get("X-Request-Id") ||
    `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("cookie");
  headers.set("accept-encoding", "identity");
  headers.set("x-bm-request-id", requestId);
  headers.set("X-Request-Id", requestId);

  let upstreamRes: Response;
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.duplex = "half";
    }

    upstreamRes = await fetch(upstreamUrl.toString(), { ...init });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bos-proxy] upstream fetch failed", {
      requestId,
      method: request.method,
      path: incomingUrl.pathname,
      upstream: upstreamUrl.toString(),
      ms: Date.now() - start,
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return new Response(
      JSON.stringify({
        error_code: "UPSTREAM_UNREACHABLE",
        message: "Backend API is unreachable",
        detail: "The BOS API server did not respond. This is a server-side connectivity issue.",
        request_id: requestId,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
      },
    );
  }

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete("access-control-allow-origin");
  resHeaders.delete("access-control-allow-credentials");
  resHeaders.delete("access-control-allow-headers");
  resHeaders.delete("access-control-allow-methods");
  resHeaders.delete("access-control-expose-headers");
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  resHeaders.delete("transfer-encoding");
  resHeaders.set("X-Request-Id", requestId);

  const elapsed = Date.now() - start;
  if (!upstreamRes.ok) {
    let snippet = "";
    try {
      snippet = (await upstreamRes.clone().text()).slice(0, 2000);
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.warn("[bos-proxy] upstream non-2xx", {
      requestId,
      method: request.method,
      path: incomingUrl.pathname,
      upstream: upstreamUrl.toString(),
      status: upstreamRes.status,
      ms: elapsed,
      body_snippet: snippet,
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
