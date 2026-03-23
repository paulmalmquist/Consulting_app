import { getPool } from "@/lib/server/db";
import { getCapitalCallsOverview } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ capital_calls: [] as Record<string, unknown>[] });
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

  return Response.json({ capital_calls: overview.rows });
}
