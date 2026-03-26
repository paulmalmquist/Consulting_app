import { getPool } from "@/lib/server/db";
import { computeJvDetail } from "@/lib/server/reJvDetail";

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
  const quarter = searchParams.get("quarter") || "2026Q1";
  const scenarioId = searchParams.get("scenario_id");

  try {
    const result = await computeJvDetail({
      pool,
      fundId: params.fundId,
      quarter,
      scenarioId,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/jv-detail] error", err);
    return Response.json(
      { error_code: "JV_DETAIL_FAILED", message: String(err) },
      { status: 500 }
    );
  }
}
