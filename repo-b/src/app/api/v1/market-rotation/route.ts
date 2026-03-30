import { NextRequest, NextResponse } from "next/server";
import { getMarketRotationPayload } from "@/lib/server/marketRotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/market-rotation
 *
 * Returns Market Rotation Engine data: active segments, recent intel briefs,
 * and feature cards. Used by the Decision Engine "Market Segments" tab.
 *
 * Query params:
 *   limit_briefs  — max intel briefs to return (default 20)
 *   limit_cards   — max feature cards to return (default 50)
 *   status        — filter feature cards by status (optional)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limitBriefs = Math.min(parseInt(searchParams.get("limit_briefs") ?? "20", 10), 100);
  const limitCards = Math.min(parseInt(searchParams.get("limit_cards") ?? "50", 10), 200);
  const statusFilter = searchParams.get("status");

  try {
    const payload = await getMarketRotationPayload({ limitBriefs, limitCards, statusFilter });
    if (!payload) {
      return NextResponse.json(
        { error: "Database pool not available" },
        { status: 503 }
      );
    }
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Market rotation API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
