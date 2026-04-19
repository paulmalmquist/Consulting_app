import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * GET /api/re/v2/environments/[envId]/portfolio-states?quarter=
 *
 * Proxies to FastAPI backend. Returns one authoritative-state payload per
 * released fund in the environment, in a single round trip. Replaces the
 * N+1 pattern that previously called the per-fund authoritative-state
 * endpoint once per fund row on the portfolio list page.
 *
 * Backend is the single source of truth — no query logic duplicated here.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { envId: string } },
) {
  const url = new URL(req.url);
  const forwardedParams = new URLSearchParams();
  const quarter = url.searchParams.get("quarter");
  if (quarter) forwardedParams.set("quarter", quarter);

  const target = `${FASTAPI_BASE}/api/re/v2/environments/${encodeURIComponent(
    params.envId,
  )}/portfolio-states${
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
      {
        error: `Proxy error: ${message}`,
        env_id: params.envId,
        quarter: quarter ?? null,
        count: 0,
        states: [],
      },
      { status: 502 },
    );
  }
}
