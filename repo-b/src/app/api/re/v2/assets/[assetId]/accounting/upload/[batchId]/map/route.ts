import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/assets/[assetId]/accounting/upload/[batchId]/map
 * Update account mappings for a batch.
 * Body: { mappings: [{row_num: 1, mapped_gl_account: "4000"}, ...] }
 */
export async function POST(
  request: Request,
  { params }: { params: { assetId: string; batchId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const body = await request.json();
    const mappings = body.mappings as Array<{ row_num: number; mapped_gl_account: string }>;

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      return Response.json({ error: "mappings array required" }, { status: 400 });
    }

    let updated = 0;
    for (const m of mappings) {
      const res = await pool.query(
        `UPDATE acct_upload_row
         SET mapped_gl_account = $1, mapping_confidence = 1.0
         WHERE batch_id = $2::uuid AND row_num = $3`,
        [m.mapped_gl_account, params.batchId, m.row_num],
      );
      updated += res.rowCount ?? 0;
    }

    // Update batch status to 'mapped'
    await pool.query(
      "UPDATE acct_upload_batch SET status = 'mapped' WHERE id = $1::uuid AND status = 'pending'",
      [params.batchId],
    );

    // Optionally save as template
    if (body.save_template_name) {
      const envId = body.env_id;
      const businessId = body.business_id;
      if (envId && businessId) {
        const tplRows = await pool.query(
          `SELECT raw_account_code, raw_account_name, mapped_gl_account
           FROM acct_upload_row
           WHERE batch_id = $1::uuid AND mapped_gl_account IS NOT NULL
           ORDER BY row_num`,
          [params.batchId],
        );
        await pool.query(
          `INSERT INTO acct_mapping_template (env_id, business_id, name, mappings, source_count)
           VALUES ($1, $2::uuid, $3, $4::jsonb, $5)`,
          [envId, businessId, body.save_template_name, JSON.stringify(tplRows.rows), tplRows.rows.length],
        );
      }
    }

    return Response.json({ updated, status: "mapped" });
  } catch (err) {
    console.error("[accounting/upload/map] Error:", err);
    return Response.json({ error: "Mapping update failed" }, { status: 500 });
  }
}
