import { getPool } from "@/lib/server/db";
import { importCapitalCallContributionsAction } from "@/lib/server/reFinanceOperations";

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
  const callId = body.call_id as string | undefined;
  if (!callId) {
    return Response.json({ error: "call_id is required" }, { status: 400 });
  }

  try {
    const result = await importCapitalCallContributionsAction(pool, {
      callId,
      contributionDate: (body.contribution_date as string | undefined) || new Date().toISOString().slice(0, 10),
      collectionRate: Number(body.collection_rate ?? 1),
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import contributions";
    return Response.json({ error: message }, { status: 400 });
  }
}
