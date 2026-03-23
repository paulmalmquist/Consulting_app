import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/accounting/upload/[batchId]/validate
 * Run validation checks on a batch and return results.
 */
export async function GET(
  _request: Request,
  { params }: { params: { assetId: string; batchId: string } },
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "Database unavailable" }, { status: 503 });

  try {
    // Load rows
    const rowRes = await pool.query(
      `SELECT row_num, raw_account_code, raw_account_name,
              raw_debit, raw_credit, raw_balance,
              mapped_gl_account, mapping_confidence
       FROM acct_upload_row
       WHERE batch_id = $1::uuid
       ORDER BY row_num`,
      [params.batchId],
    );
    const rows = rowRes.rows;

    if (rows.length === 0) {
      return Response.json({
        valid: false,
        errors: ["No rows found for this batch."],
        warnings: [],
        summary: {},
      });
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Debit/Credit balance check
    let totalDebit = 0;
    let totalCredit = 0;
    let totalBalance = 0;
    const hasDrCr = rows.some(
      (r: { raw_debit: number | null; raw_credit: number | null }) =>
        r.raw_debit !== null || r.raw_credit !== null,
    );

    for (const r of rows) {
      if (r.raw_debit != null) totalDebit += Number(r.raw_debit);
      if (r.raw_credit != null) totalCredit += Number(r.raw_credit);
      if (r.raw_balance != null) totalBalance += Number(r.raw_balance);
    }

    if (hasDrCr) {
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.01) {
        errors.push(
          `Trial balance does not balance: Debits=${totalDebit.toFixed(2)}, Credits=${totalCredit.toFixed(2)}, Difference=${diff.toFixed(2)}`,
        );
      } else if (diff > 0) {
        warnings.push(`Minor rounding difference: ${diff.toFixed(4)}`);
      }
    }

    // 2. Duplicate account codes
    const codes = rows
      .map((r: { raw_account_code: string | null }) => r.raw_account_code)
      .filter(Boolean) as string[];
    const dupes = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
    if (dupes.length > 0) {
      warnings.push(`Duplicate account codes: ${dupes.join(", ")}`);
    }

    // 3. Unmapped accounts
    const unmapped = rows.filter((r: { mapped_gl_account: string | null }) => !r.mapped_gl_account);
    if (unmapped.length > 0) {
      const unmappedCodes = unmapped
        .slice(0, 10)
        .map(
          (r: { raw_account_code: string | null; row_num: number }) =>
            r.raw_account_code || `row ${r.row_num}`,
        );
      warnings.push(
        `${unmapped.length} unmapped account(s): ${unmappedCodes.join(", ")}${unmapped.length > 10 ? "..." : ""}`,
      );
    }

    // 4. Check period lock
    const batchRes = await pool.query(
      "SELECT env_id, business_id, asset_id, period_month FROM acct_upload_batch WHERE id = $1::uuid",
      [params.batchId],
    );
    if (batchRes.rows.length > 0) {
      const batch = batchRes.rows[0];
      // Derive quarter from period_month (date → YYYYQn)
      const pm = new Date(batch.period_month);
      const pq = Math.ceil((pm.getMonth() + 1) / 3);
      const lockQuarter = `${pm.getFullYear()}Q${pq}`;
      const lockRes = await pool.query(
        `SELECT locked FROM re_period_lock
         WHERE env_id = $1 AND business_id = $2::uuid AND quarter = $3 AND locked = true
         LIMIT 1`,
        [batch.env_id, batch.business_id, lockQuarter],
      );
      if (lockRes.rows.length > 0) {
        errors.push(`Period ${lockQuarter} is locked. Unlock the period before committing.`);
      }
    }

    // Update batch validation summary
    const summary = {
      row_count: rows.length,
      total_debit: totalDebit,
      total_credit: totalCredit,
      total_balance: totalBalance,
      mapped_count: rows.length - unmapped.length,
      unmapped_count: unmapped.length,
      duplicate_codes: dupes,
    };

    await pool.query(
      "UPDATE acct_upload_batch SET validation_summary = $1::jsonb, status = CASE WHEN status = 'pending' THEN 'validated' ELSE status END WHERE id = $2::uuid",
      [JSON.stringify({ valid: errors.length === 0, errors, warnings, summary }), params.batchId],
    );

    return Response.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary,
    });
  } catch (err) {
    console.error("[accounting/upload/validate] Error:", err);
    return Response.json({ error: "Validation failed" }, { status: 500 });
  }
}
