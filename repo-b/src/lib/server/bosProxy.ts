import type { NextRequest } from "next/server";

import {
  getActiveMembership,
  getSessionActor,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

function inferBosOrigin(request: NextRequest | Request): string {
  // Single canonical env var for the backend origin (server-side only).
  const configured = (process.env.BOS_API_ORIGIN || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  // Fallback: infer from the incoming request hostname.
  const hostHeader =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return `https://api.${root}`;
}

function buildUpstreamUrl(request: NextRequest | Request, origin: string, upstreamPath: string) {
  if (!origin) {
    throw new Error("Missing BOS upstream origin");
  }
  if (origin.startsWith("/")) {
    return new URL(`${origin}${upstreamPath}`, new URL(request.url).origin);
  }
  return new URL(upstreamPath, origin);
}

async function buildForwardHeaders(request: NextRequest | Request, requestId: string) {
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

  return headers;
}

function passthrough(upstream: Response, requestId: string) {
  const headers = new Headers(upstream.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-credentials");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-expose-headers");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("x-bm-request-id", requestId);
  headers.set("X-Request-Id", requestId);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function proxyToBos(request: NextRequest | Request, upstreamPath: string) {
  const requestId =
    request.headers.get("x-bm-request-id") ||
    request.headers.get("X-Request-Id") ||
    `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  let upstreamUrl: URL;
  try {
    upstreamUrl = buildUpstreamUrl(request, inferBosOrigin(request), upstreamPath);
  } catch {
    return Response.json(
      {
        error_code: "UPSTREAM_UNCONFIGURED",
        message: "Backend API upstream is not configured for this route.",
        request_id: requestId,
      },
      { status: 503, headers: { "x-bm-request-id": requestId } }
    );
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.clone().arrayBuffer();

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      headers: await buildForwardHeaders(request, requestId),
      body,
    });
    return passthrough(upstream, requestId);
  } catch {
    return Response.json(
      {
        error_code: "UPSTREAM_UNREACHABLE",
        message: "Failed to reach Backend API upstream.",
        request_id: requestId,
      },
      { status: 502, headers: { "x-bm-request-id": requestId } }
    );
  }
}
