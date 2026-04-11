import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";
import {
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

async function requireAdminSession(request: NextRequest) {
  const session = await parseSessionFromRequest(request);
  if (!session || !isPlatformAdminSession(session)) {
    return null;
  }
  return session;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const forwardedParams = new URLSearchParams();
  for (const key of [
    "conversation_id",
    "request_id",
    "env_id",
    "composition_profile",
    "limit",
  ]) {
    const value = url.searchParams.get(key);
    if (value) forwardedParams.set(key, value);
  }

  const target = `${FASTAPI_BASE}/api/admin/ai/prompt-receipts${
    forwardedParams.toString() ? `?${forwardedParams.toString()}` : ""
  }`;

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        ...(await buildPlatformSessionHeaders(req)),
      },
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach backend";
    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 },
    );
  }
}
