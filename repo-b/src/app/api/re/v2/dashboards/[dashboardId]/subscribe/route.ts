import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, POST, DELETE, OPTIONS" } });
}

/**
 * GET /api/re/v2/dashboards/[dashboardId]/subscribe
 * List subscriptions for a dashboard.
 */
export async function GET(
  _request: Request,
  { params }: { params: { dashboardId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const res = await pool.query(
      `SELECT id, subscriber, frequency, delivery_format, filter_preset, active, next_delivery, created_at
       FROM re_dashboard_subscription
       WHERE dashboard_id = $1::uuid
       ORDER BY created_at DESC`,
      [params.dashboardId],
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error("[dashboards/subscribe] List error:", err);
    return Response.json({ error: "Failed to list subscriptions" }, { status: 500 });
  }
}

/**
 * POST /api/re/v2/dashboards/[dashboardId]/subscribe
 * Create a new subscription.
 */
export async function POST(
  request: Request,
  { params }: { params: { dashboardId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    const { subscriber, frequency, delivery_format, filter_preset } = body;

    if (!subscriber) {
      return Response.json({ error: "subscriber is required" }, { status: 400 });
    }

    // Compute next delivery
    const freqDays: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 };
    const days = freqDays[frequency || "weekly"] || 7;
    const nextDelivery = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const res = await pool.query(
      `INSERT INTO re_dashboard_subscription
         (dashboard_id, subscriber, frequency, delivery_format, filter_preset, next_delivery)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::timestamptz)
       RETURNING id, subscriber, frequency, delivery_format, active, next_delivery`,
      [
        params.dashboardId,
        subscriber,
        frequency || "weekly",
        delivery_format || "pdf",
        JSON.stringify(filter_preset || {}),
        nextDelivery,
      ],
    );

    return Response.json(res.rows[0], { status: 201 });
  } catch (err) {
    console.error("[dashboards/subscribe] Create error:", err);
    return Response.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

/**
 * DELETE /api/re/v2/dashboards/[dashboardId]/subscribe
 * Deactivate a subscription by id (passed as query param).
 */
export async function DELETE(
  request: Request,
  { params }: { params: { dashboardId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const subId = searchParams.get("subscription_id");

  if (!subId) {
    return Response.json({ error: "subscription_id is required" }, { status: 400 });
  }

  try {
    await pool.query(
      `UPDATE re_dashboard_subscription SET active = false
       WHERE id = $1::uuid AND dashboard_id = $2::uuid`,
      [subId, params.dashboardId],
    );
    return Response.json({ status: "deactivated" });
  } catch (err) {
    console.error("[dashboards/subscribe] Delete error:", err);
    return Response.json({ error: "Failed to deactivate subscription" }, { status: 500 });
  }
}
