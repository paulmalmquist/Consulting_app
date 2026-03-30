import { NextRequest, NextResponse } from "next/server";
import { getDecisionEnginePayload } from "@/lib/server/decisionEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/decision-engine
 *
 * Returns all data needed by the Decision Engine tabs:
 * Command Center, History Rhymes, Machine Forecasts, Trap Detector.
 *
 * Data flows from WSS tables + episode library + agent calibration.
 * Tables are global (not tenant-scoped) — these are market-wide signals.
 */
export async function GET(_request: NextRequest) {
  try {
    const payload = await getDecisionEnginePayload();
    if (!payload) {
      return NextResponse.json(
        { error: "Database pool not available" },
        { status: 503 },
      );
    }
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Decision engine API error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
