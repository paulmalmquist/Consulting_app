import { getPool } from "@/lib/server/db";
import { getCapitalCallsOverview } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      meta: { business_id: "", live_partition_id: null, has_data: false, total_rows: 0, now_date: new Date().toISOString().slice(0, 10) },
      summary: {
        open_calls: 0,
        total_requested: "0.00",
        total_received: "0.00",
        collection_rate: "0.0000",
        outstanding_balance: "0.00",
        overdue_investors: 0,
      },
      lifecycle: [],
      rows: [],
      options: { funds: [], investors: [], call_types: [], open_calls: [] },
      insights: {
        top_outstanding_investors: [],
        upcoming_due_dates: [],
        overdue_watchlist: [],
        collection_progress_by_fund: [],
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const overview = await getCapitalCallsOverview(pool, {
    envId: searchParams.get("env_id"),
    businessId: searchParams.get("business_id"),
    status: searchParams.get("status"),
    fundId: searchParams.get("fund_id"),
    investorId: searchParams.get("investor_id"),
    dateFrom: searchParams.get("date_from"),
    dateTo: searchParams.get("date_to"),
    callType: searchParams.get("call_type"),
  });

  return Response.json(overview);
}
