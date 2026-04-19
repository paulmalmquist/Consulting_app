import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * GET /api/re/v2/environments/[envId]/fund-trend
 *
 * Thin proxy to FastAPI: /api/re/v2/environments/{env_id}/fund-trend
 *
 * Fixes the 404 the frontend was hitting because the Next.js router had
 * no route at this path. Backend is the single source of truth — we do
 * not reimplement the query here (per INV-5 revised plan, no duplicated
 * data access paths).
 *
 * The backend handles env+business scoping, returns null points for
 * missing/untrusted data, and prefers gross_irr_bottom_up when present.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { envId: string } }
) {
  const url = new URL(req.url);
  const forwardedParams = new URLSearchParams();
  for (const key of ["metric", "quarters"]) {
    const value = url.searchParams.get(key);
    if (value) forwardedParams.set(key, value);
  }

  const target = `${FASTAPI_BASE}/api/re/v2/environments/${encodeURIComponent(
    params.envId,
  )}/fund-trend${forwardedParams.toString() ? `?${forwardedParams.toString()}` : ""}`;

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
        metric: "ending_nav",
        quarters: 0,
        funds: [],
      },
      { status: 502 },
    );
  }
}
