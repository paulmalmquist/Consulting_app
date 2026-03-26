import { getPool } from "@/lib/server/db";
import { computeQuarterlyTimeline } from "@/lib/server/reQuarterlyTimeline";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json(
      { error_code: "DB_UNAVAILABLE", message: "Database not available" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const fromQuarter = searchParams.get("from_quarter") || "2024Q1";
  const toQuarter = searchParams.get("to_quarter") || "2026Q1";
  const scenarioId = searchParams.get("scenario_id");

  try {
    const result = await computeQuarterlyTimeline({
      pool,
      fundId: params.fundId,
      fromQuarter,
      toQuarter,
      scenarioId,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/quarterly-timeline] error", err);
    return Response.json(
      { error_code: "QUARTERLY_TIMELINE_FAILED", message: String(err) },
      { status: 500 }
    );
  }
}
