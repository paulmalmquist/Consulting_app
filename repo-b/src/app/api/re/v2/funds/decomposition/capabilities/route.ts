/**
 * Fund Decomposition — capability probe proxy.
 *
 * Forwards GET /api/re/v2/funds/decomposition/capabilities[?fund_id=…] to
 * FastAPI. The backend service owns the probe; this route only handles
 * auth headers and upstream resolution.
 */
import { NextRequest } from "next/server";
import {
  getSessionActor,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";
import { getActiveRichMembership } from "@/lib/server/platformMembershipRehydrate";

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

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(request: NextRequest) {
  const requestId =
    request.headers.get("x-bm-request-id") ||
    request.headers.get("X-Request-Id") ||
    `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  const upstreamOrigin = inferUpstreamOrigin(request);
  const incoming = new URL(request.url);
  const upstreamPath = `/api/re/v2/funds/decomposition/capabilities`;
  const upstreamUrl = upstreamOrigin.startsWith("/")
    ? new URL(upstreamPath, new URL(request.url).origin)
    : new URL(upstreamPath, upstreamOrigin);
  upstreamUrl.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("cookie");
  headers.set("accept-encoding", "identity");
  headers.set("x-bm-request-id", requestId);
  headers.set("X-Request-Id", requestId);

  const session = await parseSessionFromRequest(request);
  const activeMembership = await getActiveRichMembership(session);
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
    upstreamRes = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
  } catch (err) {
    console.error("[fund-decomposition/capabilities] upstream fetch failed", {
      requestId,
      upstream: upstreamUrl.toString(),
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    // Fail-open probe: surface unreachability as non-capable rather than 502.
    return Response.json(
      {
        capable: false,
        error_code: "CAPABILITY_PROBE_FAILED",
        reasons: ["backend unreachable"],
        missing_migrations: [],
        missing_tables: [],
        fund_count: 0,
        fund: null,
      },
      { status: 503 },
    );
  }

  const resHeaders = new Headers(upstreamRes.headers);
  resHeaders.delete("access-control-allow-origin");
  resHeaders.delete("access-control-allow-credentials");
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  resHeaders.delete("transfer-encoding");
  resHeaders.set("X-Request-Id", requestId);

  return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
}
