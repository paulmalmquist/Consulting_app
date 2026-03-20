import { getPool } from "@/lib/server/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { draftId } = await params;

  try {
    const { rows } = await pool.query(
      `SELECT d.*, f.name AS fund_name
       FROM re_ir_drafts d
       LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
       WHERE d.id = $1`,
      [draftId],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }
    return Response.json(rows[0]);
  } catch (err) {
    console.error("ir-drafts get error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  const { draftId } = await params;
  const body = await request.json();
  const { action, actor = "gp_principal", notes = "" } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  try {
    const { rows } = await pool.query(
      `UPDATE re_ir_drafts
       SET status = $1, reviewed_by = $2, reviewed_at = now(),
           review_notes = $3, updated_at = now()
       WHERE id = $4 AND status IN ('draft', 'pending_review')
       RETURNING *`,
      [newStatus, actor, notes, draftId],
    );
    if (rows.length === 0) {
      return Response.json({ error: "Draft not found or already finalized" }, { status: 404 });
    }
    return Response.json(rows[0]);
  } catch (err) {
    console.error("ir-drafts patch error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
