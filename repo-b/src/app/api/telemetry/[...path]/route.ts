import { NextRequest, NextResponse } from "next/server";
import {
  isPlatformAdminSession,
  parseSessionFromNextRequest,
  sessionHasEnvironmentAccess,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request: NextRequest): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://127.0.0.1:8000";
  }
}

function inferUpstreamOrigin(request: NextRequest): string {
  const configured = (process.env.BOS_API_ORIGIN || "").trim();
  if (configured) {
    if (configured.startsWith("/")) return requestOrigin(request);
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }

  const hostHeader =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  if (hostname) {
    const root = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return `https://api.${root}`;
  }

  return "http://127.0.0.1:8000";
}

async function forward(request: NextRequest, context: { params: { path: string[] } }) {
  const upstreamOrigin = inferUpstreamOrigin(request);
  const path = (context.params.path || []).map(encodeURIComponent).join("/");

  if (path === "metadata/graph") {
    const session = await parseSessionFromNextRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const servingEnvId = request.nextUrl.searchParams.get("env_id");
    const routeEnvId = request.headers.get("x-telemetry-route-env-id");
    if (!servingEnvId) {
      return NextResponse.json({ error: "env_id is required" }, { status: 400 });
    }
    if (!routeEnvId) {
      return NextResponse.json({ error: "route environment is required" }, { status: 400 });
    }
    const configuredServingEnv =
      (process.env.TELEMETRY_SERVING_ENV_ID || "telemetry-demo").trim();
    if (servingEnvId !== configuredServingEnv) {
      return NextResponse.json(
        { error: "Telemetry serving scope is not available" },
        { status: 403 },
      );
    }
    if (
      !isPlatformAdminSession(session) &&
      !sessionHasEnvironmentAccess(session, { envId: routeEnvId })
    ) {
      return NextResponse.json(
        { error: "You do not have access to this environment" },
        { status: 403 },
      );
    }
  }

  const upstreamUrl = new URL(`/api/telemetry/${path}`, upstreamOrigin);
  upstreamUrl.search = request.nextUrl.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: request.method,
      cache: "no-store",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "x-bm-request-id": request.headers.get("x-bm-request-id") || "",
      },
      body,
    });
    const contentType = upstream.headers.get("content-type") || "application/json";
    // Binary/download responses (e.g. the XLSX export) must not go through .text(),
    // which corrupts non-text bytes. Forward the raw body and the disposition header.
    const isDownload =
      !contentType.includes("json") &&
      !contentType.startsWith("text/") &&
      (contentType.includes("spreadsheetml") ||
        contentType.includes("octet-stream") ||
        upstream.headers.has("content-disposition"));
    if (isDownload) {
      const buffer = await upstream.arrayBuffer();
      const headers: Record<string, string> = { "Content-Type": contentType };
      const disposition = upstream.headers.get("content-disposition");
      if (disposition) headers["Content-Disposition"] = disposition;
      return new NextResponse(buffer, { status: upstream.status, headers });
    }
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json(
      { detail: "Telemetry backend route unavailable." },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return forward(request, context);
}
