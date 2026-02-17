import type { NextRequest } from "next/server";

const FALLBACK_STATUSES = new Set([404, 501]);

function configuredDemoOrigin() {
  return (
    process.env.DEMO_API_ORIGIN ||
    process.env.DEMO_API_BASE_URL ||
    process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
}

function shouldSkipProxy(request: NextRequest, origin: string) {
  if (!origin) return true;
  if (origin.startsWith("/")) return true;
  try {
    const incoming = new URL(request.url);
    const upstream = new URL(origin);
    return incoming.host === upstream.host;
  } catch {
    return true;
  }
}

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function passthrough(upstream: Response) {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function unavailable(message: string) {
  return Response.json({ message }, { status: 503 });
}

export async function proxyOrFallback(
  request: NextRequest,
  upstreamPath: string,
  fallback: () => Promise<Response> | Response
) {
  const origin = configuredDemoOrigin();
  if (shouldSkipProxy(request, origin)) {
    return fallback();
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.clone().arrayBuffer();

  const url = new URL(upstreamPath, origin);
  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: buildForwardHeaders(request),
      body,
    });
    if (upstream.ok) {
      return passthrough(upstream);
    }
    if (FALLBACK_STATUSES.has(upstream.status)) {
      return fallback();
    }
    return passthrough(upstream);
  } catch {
    return fallback();
  }
}

export async function proxyOrFail(request: NextRequest, upstreamPath: string) {
  const origin = configuredDemoOrigin();
  if (shouldSkipProxy(request, origin)) {
    return unavailable("Demo API upstream is not configured for this route.");
  }

  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.clone().arrayBuffer();

  const url = new URL(upstreamPath, origin);
  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: buildForwardHeaders(request),
      body,
    });
    return passthrough(upstream);
  } catch {
    return unavailable("Failed to reach Demo API upstream.");
  }
}
