import { getPool } from "@/lib/server/db";
import { createCapitalCallAction } from "@/lib/server/reFinanceOperations";

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
  const callDate = body.call_date as string | undefined;
  const amountRequested = body.amount_requested as string | undefined;

  if (!repeFundId || !callDate || !amountRequested) {
    return Response.json({ error: "repe_fund_id, call_date, and amount_requested are required" }, { status: 400 });
  }

  try {
    const result = await createCapitalCallAction(pool, {
      envId: (body.env_id as string | undefined) || null,
      businessId: (body.business_id as string | undefined) || null,
      repeFundId,
      callDate,
      dueDate: (body.due_date as string | undefined) || null,
      amountRequested,
      callType: (body.call_type as string | undefined) || null,
      purpose: (body.purpose as string | undefined) || null,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create capital call";
    return Response.json({ error: message }, { status: 400 });
  }
}
