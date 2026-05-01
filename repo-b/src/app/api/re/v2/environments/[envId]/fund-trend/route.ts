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
  const metric = url.searchParams.get("metric") ?? "ending_nav";
  const quartersParam = url.searchParams.get("quarters");
  const quarters = quartersParam ? parseInt(quartersParam, 10) : 12;

  // Playwright bypass: return the same canonical fund set as the
  // fund-portfolio stub so the chart's series count equals the primary
  // table's row count by construction. Production path (FastAPI) reads
  // re_fund_portfolio_included_funds_v which enforces the same predicate.
  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return NextResponse.json(
      buildPlaywrightTrendStub(metric, isNaN(quarters) ? 12 : quarters),
      { headers: { "cache-control": "no-store" } },
    );
  }

  const forwardedParams = new URLSearchParams();
  forwardedParams.set("metric", metric);
  if (quartersParam) forwardedParams.set("quarters", quartersParam);

  const target = `${FASTAPI_BASE}/api/re/v2/environments/${encodeURIComponent(
    params.envId,
  )}/fund-trend?${forwardedParams.toString()}`;

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

// ── Playwright stub: trend series for the canonical fund set ─────────────
// Mirrors the fund-portfolio stub. Three series, one per included fund.
// Series count == fund-portfolio's fund_rows.length is asserted by the
// re-fund-portfolio-coherence Playwright spec.
function buildPlaywrightTrendStub(metric: string, quarters: number) {
  const allQuarters = ["2025Q3", "2025Q4", "2026Q1", "2026Q2"].slice(-quarters);

  function series(fund_id: string, name: string, base: number) {
    return {
      fund_id,
      name,
      points: allQuarters.map((q, i) => ({
        quarter: q,
        // Deterministic, monotonic-ish values; nulls would also be valid here.
        value: Number((base * (1 + i * 0.04)).toFixed(2)),
      })),
    };
  }

  return {
    metric,
    quarters,
    funds: [
      series("a1b2c3d4-0001-0010-0001-000000000001", "Meridian Real Estate Fund III", 34_300_000),
      series("a1b2c3d4-0002-0020-0001-000000000001", "Meridian Credit Opportunities Fund I", 116_700_000),
      series("a1b2c3d4-0003-0030-0001-000000000001", "IGF VII", 1_200_000_000),
    ],
  };
}
