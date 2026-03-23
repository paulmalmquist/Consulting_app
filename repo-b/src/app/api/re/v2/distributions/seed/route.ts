import { getPool } from "@/lib/server/db";
import { seedDistributionsDemo } from "@/lib/server/reFinanceOperations";

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
  try {
    const result = await seedDistributionsDemo(pool, {
      envId: (body.env_id as string | undefined) || null,
      businessId: (body.business_id as string | undefined) || null,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed distribution demo data";
    return Response.json({ error: message }, { status: 400 });
  }
}
