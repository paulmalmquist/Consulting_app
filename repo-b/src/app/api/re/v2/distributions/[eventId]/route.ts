import { getPool } from "@/lib/server/db";
import { getDistributionDetail } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(
  request: Request,
  { params }: { params: { eventId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      event: null,
      payouts: [] as Record<string, unknown>[],
      totals: {
        total_payouts: "0.00",
        payout_count: 0,
        by_type: {},
      },
    });
  }

  const detail = await getDistributionDetail(pool, params.eventId);
  return Response.json(detail);
}
