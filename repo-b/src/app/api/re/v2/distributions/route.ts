import { getPool } from "@/lib/server/db";
import { getDistributionsOverview } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

export async function GET(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ distributions: [] as Record<string, unknown>[] });
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

  return Response.json({ distributions: overview.rows });
}
