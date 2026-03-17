import { getPool } from "@/lib/server/db";
import { getCapitalCallDetail } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { callId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      call: null,
      contributions: [] as Record<string, unknown>[],
      totals: {
        total_contributed: "0.00",
        outstanding: "0.00",
        contribution_count: 0,
      },
    });
  }

  const detail = await getCapitalCallDetail(pool, params.callId);
  return Response.json(detail);
}
