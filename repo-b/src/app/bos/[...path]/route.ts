/**
 * BOS API proxy — same-origin catch-all that forwards /bos/* requests
 * to the Business OS backend (FastAPI at backend/).
 *
 * All browser API calls route through this proxy. The upstream is resolved
 * from BOS_API_ORIGIN (server-side only) or inferred from the request hostname.
 */
import { NextRequest } from "next/server";
import {
  getActiveMembership,
  getSessionActor,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

function inferUpstreamOrigin(request: NextRequest): string {
  const configured = (process.env.BOS_API_ORIGIN || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

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

  const session = await parseSessionFromRequest(request);
  const activeMembership = getActiveMembership(session);
  if (session?.platform_user_id) {
    headers.set("x-bm-auth-provider", "platform-session");
    headers.set("x-bm-user-id", session.platform_user_id);
    headers.set("x-bm-platform-admin", String(isPlatformAdminSession(session)));
    headers.set("x-bm-actor", await getSessionActor(request));
  }
  if (activeMembership) {
    headers.set("x-bm-env-id", activeMembership.env_id);
    headers.set("x-bm-env-slug", activeMembership.env_slug);
    headers.set("x-bm-membership-role", activeMembership.role);
    if (activeMembership.business_id) headers.set("x-bm-business-id", activeMembership.business_id);
    if (activeMembership.tenant_id) headers.set("x-tenant-id", activeMembership.tenant_id);
  }

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
