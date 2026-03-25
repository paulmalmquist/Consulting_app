import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/assets/[assetId]/accounting/upload/[batchId]/commit
 * Commit a validated batch to the accounting pipeline:
 * 1. Write mapped rows to acct_gl_balance_monthly
 * 2. Normalize via mapping rules → acct_normalized_noi_monthly
 * 3. Update quarter rollup table
 * 4. Mark batch as committed
 */
export async function POST(
  _request: Request,
  { params }: { params: { assetId: string; batchId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    // Load batch
    const batchRes = await pool.query(
      "SELECT * FROM acct_upload_batch WHERE id = $1::uuid",
      [params.batchId],
    );
    if (batchRes.rows.length === 0) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }
    const batch = batchRes.rows[0];

    if (batch.status === "committed") {
      return Response.json({ status: "already_committed", batch_id: params.batchId });
    }
    if (batch.status === "failed") {
      return Response.json({ error: "Batch is in failed state" }, { status: 400 });
    }

    // Check period lock before allowing commit
    const periodMonth = batch.period_month;
    const pm = new Date(periodMonth);
    const pq = Math.ceil((pm.getMonth() + 1) / 3);
    const lockQuarter = `${pm.getFullYear()}Q${pq}`;
    const lockRes = await pool.query(
      `SELECT locked FROM re_period_lock
       WHERE env_id = $1 AND business_id = $2::uuid AND quarter = $3
       LIMIT 1`,
      [batch.env_id, batch.business_id, lockQuarter],
    );
    if (lockRes.rows.length > 0 && lockRes.rows[0].locked) {
      return Response.json(
        { error: `Period ${lockQuarter} is locked. Unlock the period before uploading data.` },
        { status: 409 },
      );
    }

    // Load mapped rows
    const rowRes = await pool.query(
      `SELECT row_num, raw_account_code, raw_debit, raw_credit, raw_balance, mapped_gl_account
       FROM acct_upload_row
       WHERE batch_id = $1::uuid AND mapped_gl_account IS NOT NULL
       ORDER BY row_num`,
      [params.batchId],
    );
    const rows = rowRes.rows;

    if (rows.length === 0) {
      return Response.json({ error: "No mapped rows to commit. Map accounts first." }, { status: 400 });
    }

    const sourceName = `tb_upload_${params.batchId}`;
    const envId = batch.env_id;
    const businessId = batch.business_id;
    let rowsLoaded = 0;
    let rowsNormalized = 0;

    // 1. Write GL balances
    for (const r of rows) {
      // Balance = explicit balance, or debit - credit
      const balance = r.raw_balance ?? ((r.raw_debit ?? 0) - (r.raw_credit ?? 0));

      const insertRes = await pool.query(
        `INSERT INTO acct_gl_balance_monthly
           (env_id, business_id, asset_id, period_month, gl_account, amount, source_id)
         VALUES ($1, $2::uuid, $3::uuid, $4::date, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [envId, businessId, params.assetId, periodMonth, r.mapped_gl_account, balance, sourceName],
      );
      if (insertRes.rows.length > 0) rowsLoaded++;
    }

    // 2. Normalize NOI via mapping rules
    const noiRes = await pool.query(
      `INSERT INTO acct_normalized_noi_monthly
         (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
       SELECT
         g.env_id, g.business_id, g.asset_id, g.period_month,
         m.target_line_code,
         SUM(g.amount * m.sign_multiplier),
         $1
       FROM acct_gl_balance_monthly g
       JOIN acct_mapping_rule m
         ON m.env_id = g.env_id
         AND m.business_id = g.business_id
         AND m.gl_account = g.gl_account
         AND m.target_statement = 'NOI'
       WHERE g.env_id = $2 AND g.business_id = $3::uuid AND g.source_id = $4
       GROUP BY g.env_id, g.business_id, g.asset_id, g.period_month, m.target_line_code
       ON CONFLICT DO NOTHING`,
      [sourceName, envId, businessId, sourceName],
    );
    rowsNormalized = noiRes.rowCount ?? 0;

    // 3. Normalize BS items
    await pool.query(
      `INSERT INTO acct_normalized_bs_monthly
         (env_id, business_id, asset_id, period_month, line_code, amount, source_hash)
       SELECT
         g.env_id, g.business_id, g.asset_id, g.period_month,
         m.target_line_code,
         SUM(g.amount * m.sign_multiplier),
         $1
       FROM acct_gl_balance_monthly g
       JOIN acct_mapping_rule m
         ON m.env_id = g.env_id
         AND m.business_id = g.business_id
         AND m.gl_account = g.gl_account
         AND m.target_statement = 'BS'
       WHERE g.env_id = $2 AND g.business_id = $3::uuid AND g.source_id = $4
       GROUP BY g.env_id, g.business_id, g.asset_id, g.period_month, m.target_line_code
       ON CONFLICT DO NOTHING`,
      [sourceName, envId, businessId, sourceName],
    );

    // 4. Refresh quarter rollup for affected quarter
    const quarter = lockQuarter;
    const qStart = `${pm.getFullYear()}-${String((pq - 1) * 3 + 1).padStart(2, "0")}-01`;
    const qEndMonth = pq * 3;
    const qEndDay = new Date(pm.getFullYear(), qEndMonth, 0).getDate();
    const qEnd = `${pm.getFullYear()}-${String(qEndMonth).padStart(2, "0")}-${String(qEndDay).padStart(2, "0")}`;

    await pool.query(
      `INSERT INTO re_asset_acct_quarter_rollup
         (env_id, business_id, asset_id, quarter, revenue, opex, noi, capex, source)
       SELECT
         n.env_id::uuid, n.business_id, n.asset_id, $5,
         COALESCE(SUM(CASE WHEN n.amount > 0 THEN n.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN n.amount < 0 THEN ABS(n.amount) ELSE 0 END), 0),
         COALESCE(SUM(n.amount), 0),
         0,
         'tb_upload'
       FROM acct_normalized_noi_monthly n
       WHERE n.env_id = $1 AND n.business_id = $2::uuid AND n.asset_id = $3::uuid
         AND n.period_month >= $4::date AND n.period_month <= $6::date
       GROUP BY n.env_id, n.business_id, n.asset_id
       ON CONFLICT (env_id, asset_id, quarter)
       DO UPDATE SET
         revenue = EXCLUDED.revenue,
         opex = EXCLUDED.opex,
         noi = EXCLUDED.noi,
         source = 'tb_upload'`,
      [envId, businessId, params.assetId, qStart, quarter, qEnd],
    );

    // 5. Update batch status
    await pool.query(
      "UPDATE acct_upload_batch SET status = 'committed', committed_at = now() WHERE id = $1::uuid",
      [params.batchId],
    );

    // Mark superseded batch
    if (batch.supersedes_batch_id) {
      await pool.query(
        "UPDATE acct_upload_batch SET status = 'superseded' WHERE id = $1::uuid",
        [batch.supersedes_batch_id],
      );
    }

    return Response.json({
      status: "committed",
      batch_id: params.batchId,
      rows_committed: rows.length,
      rows_loaded: rowsLoaded,
      rows_normalized: rowsNormalized,
      quarter_refreshed: quarter,
    });
  } catch (err) {
    console.error("[accounting/upload/commit] Error:", err);
    // Mark batch as failed
    await pool.query(
      "UPDATE acct_upload_batch SET status = 'failed' WHERE id = $1::uuid",
      [params.batchId],
    ).catch(() => {});
    return Response.json({ error: "Commit failed" }, { status: 500 });
  }
}
