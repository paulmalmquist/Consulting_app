import { getPool } from "@/lib/server/db";
import { getDistributionsOverview } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      meta: {
        business_id: "",
        live_partition_id: null,
        has_data: false,
        total_rows: 0,
        now_date: new Date().toISOString().slice(0, 10),
        current_quarter: "",
      },
      summary: {
        distribution_events: 0,
        total_declared: "0.00",
        total_paid: "0.00",
        pending_amount: "0.00",
        paid_this_quarter: "0.00",
        pending_recipients: 0,
      },
      lifecycle: [],
      rows: [],
      options: { funds: [], investors: [], distribution_types: [], pending_events: [] },
      insights: {
        largest_recipients: [],
        pending_payout_watchlist: [],
        recent_distribution_events: [],
        allocation_mix_by_type: [],
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const overview = await getDistributionsOverview(pool, {
    envId: searchParams.get("env_id"),
    businessId: searchParams.get("business_id"),
    status: searchParams.get("status"),
    fundId: searchParams.get("fund_id"),
    investorId: searchParams.get("investor_id"),
    dateFrom: searchParams.get("date_from"),
    dateTo: searchParams.get("date_to"),
    eventType: searchParams.get("event_type"),
    distributionType: searchParams.get("distribution_type"),
  });

  return Response.json(overview);
}
