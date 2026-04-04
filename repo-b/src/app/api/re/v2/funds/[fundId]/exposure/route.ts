import { getPool } from "@/lib/server/db";
import { computeFundExposureInsights } from "@/lib/server/reFundExposure";

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
  const quarter = searchParams.get("quarter");
  const scenarioId = searchParams.get("scenario_id");
  const envId = searchParams.get("env_id");

  if (!envId) {
    console.warn("[re/v2/funds/exposure] env_id not provided — tenant isolation cannot be verified", {
      fundId: params.fundId,
      quarter,
    });
  }

  if (!quarter) {
    return Response.json(
      { error_code: "MISSING_PARAM", message: "quarter is required" },
      { status: 400 }
    );
  }

  try {
    const result = await computeFundExposureInsights({
      pool,
      fundId: params.fundId,
      quarter,
      scenarioId,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[re/v2/funds/[fundId]/exposure] error", err);
    return Response.json(
      { error_code: "EXPOSURE_FAILED", message: String(err) },
      { status: 500 }
    );
  }
}
