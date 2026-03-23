import { getPool } from "@/lib/server/db";
import { createDistributionAction } from "@/lib/server/reFinanceOperations";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const repeFundId = body.repe_fund_id as string | undefined;
  const eventDate = body.event_date as string | undefined;
  const grossProceeds = body.gross_proceeds as string | undefined;
  const netDistributable = body.net_distributable as string | undefined;
  const eventType = body.event_type as string | undefined;

  if (!repeFundId || !eventDate || !grossProceeds || !netDistributable || !eventType) {
    return Response.json(
      { error: "repe_fund_id, event_date, gross_proceeds, net_distributable, and event_type are required" },
      { status: 400 }
    );
  }

  try {
    const result = await createDistributionAction(pool, {
      envId: (body.env_id as string | undefined) || null,
      businessId: (body.business_id as string | undefined) || null,
      repeFundId,
      eventDate,
      grossProceeds,
      netDistributable,
      eventType,
      reference: (body.reference as string | undefined) || null,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create distribution event";
    return Response.json({ error: message }, { status: 400 });
  }
}
