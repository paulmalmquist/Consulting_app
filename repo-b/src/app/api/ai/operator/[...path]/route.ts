import { NextRequest } from "next/server";
import { hasSession, unauthorizedJson } from "@/lib/server/sessionAuth";
import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  "http://localhost:8000"
).replace(/\/$/, "");

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

async function readPath(context: RouteContext) {
  const params = await context.params;
  return (params.path || []).map((part) => encodeURIComponent(part)).join("/");
}

function operatorUnavailable(
  requestId: string,
  reason: string,
  detail: string,
  status = 503,
) {
  return new Response(
    JSON.stringify({
      error: "Operator runtime is not available.",
      reason,
      detail: detail.slice(0, 400),
      request_id: requestId,
      runtime: {
        requested: "managed_agent",
        fallback_used: false,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "x-winston-runtime": "managed_agent",
      },
    },
  );
}

async function proxyOperator(req: NextRequest, context: RouteContext) {
  if (!(await hasSession(req))) {
    return unauthorizedJson();
  }

  const requestId = req.headers.get("x-bm-request-id") || req.headers.get("x-request-id") || crypto.randomUUID();
  const path = await readPath(context);
  if (!path) {
    return operatorUnavailable(requestId, "missing_operator_path", "Missing operator path.", 400);
  }

  const search = req.nextUrl.search || "";
  const upstreamUrl = `${FASTAPI_BASE}/api/ai/operator/${path}${search}`;
  const platformHeaders = await buildPlatformSessionHeaders(req);
  const headers = {
    ...platformHeaders,
    "x-bm-request-id": requestId,
    "x-request-id": requestId,
    "x-winston-runtime": "managed_agent",
  };

  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();

  try {
    const connectController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(), 10_000);
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method,
        headers: {
          ...headers,
          ...(body !== undefined ? { "Content-Type": req.headers.get("content-type") || "application/json" } : {}),
        },
        body,
        signal: connectController.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }

    const contentType = upstream.headers.get("content-type") || "application/json";
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      const reason =
        upstream.status === 404
          ? "operator_route_unavailable"
          : upstream.status === 501
            ? "operator_disabled"
            : upstream.status === 401 || upstream.status === 403
              ? "unauthorized"
              : "operator_backend_error";
      return operatorUnavailable(
        requestId,
        reason,
        detail || `Operator backend returned ${upstream.status}`,
        upstream.status === 404 ? 503 : upstream.status,
      );
    }

    if (contentType.includes("text/event-stream")) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "Connection": "keep-alive",
          "x-winston-runtime": "managed_agent",
          "x-winston-conversation-id": upstream.headers.get("x-winston-conversation-id") || "",
        },
      });
    }

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "x-winston-runtime": "managed_agent",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return operatorUnavailable(requestId, "operator_backend_unreachable", detail);
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  return proxyOperator(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return proxyOperator(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return proxyOperator(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return proxyOperator(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return proxyOperator(req, context);
}
