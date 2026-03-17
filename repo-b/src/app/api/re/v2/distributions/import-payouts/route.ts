import { getPool } from "@/lib/server/db";
import { importDistributionPayoutsAction } from "@/lib/server/reFinanceOperations";

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
  const eventId = body.event_id as string | undefined;
  if (!eventId) {
    return Response.json({ error: "event_id is required" }, { status: 400 });
  }

  try {
    const result = await importDistributionPayoutsAction(pool, {
      eventId,
      payoutType: (body.payout_type as string | undefined) || "return_of_capital",
      allocationRate: Number(body.allocation_rate ?? 1),
      markPaid: body.mark_paid !== false,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import payouts";
    return Response.json({ error: message }, { status: 400 });
  }
}
