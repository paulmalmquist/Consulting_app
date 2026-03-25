import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/fees?env_id=X&business_id=Y&fund_id=Z
 *
 * Returns fee policies and latest accruals for funds in the business.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = {
    policies: [] as Record<string, unknown>[],
    accruals: [] as Record<string, unknown>[],
  };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const fundId = searchParams.get("fund_id");

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    // ── Fee Policies ────────────────────────────────────────────────────
    const policyConditions: string[] = ["f.business_id = $1::uuid"];
    const policyParams: (string | null)[] = [businessId];

    if (fundId) {
      policyConditions.push("fp.fund_id = $2::uuid");
      policyParams.push(fundId);
    }

    const policyWhere = policyConditions.join(" AND ");

    const policiesRes = await pool.query(
      `SELECT
         fp.id::text,
         fp.fund_id::text,
         f.name AS fund_name,
         fp.fee_basis,
         fp.annual_rate::text,
         fp.start_date::text,
         fp.stepdown_date::text,
         fp.stepdown_rate::text,
         fp.created_at::text
       FROM re_fee_policy fp
       JOIN repe_fund f ON f.fund_id = fp.fund_id
       WHERE ${policyWhere}
       ORDER BY f.name, fp.fee_basis`,
      policyParams
    );

    // ── Recent Accruals ─────────────────────────────────────────────────
    const accrualConditions: string[] = ["f.business_id = $1::uuid"];
    const accrualParams: (string | null)[] = [businessId];

    if (fundId) {
      accrualConditions.push("faq.fund_id = $2::uuid");
      accrualParams.push(fundId);
    }

    const accrualWhere = accrualConditions.join(" AND ");

    const accrualsRes = await pool.query(
      `SELECT
         faq.id::text,
         faq.fund_id::text,
         f.name AS fund_name,
         faq.quarter,
         faq.fee_basis,
         faq.base_amount::text,
         faq.annual_rate::text,
         faq.accrued_amount::text,
         faq.created_at::text
       FROM re_fee_accrual_qtr faq
       JOIN repe_fund f ON f.fund_id = faq.fund_id
       WHERE ${accrualWhere}
       ORDER BY faq.quarter DESC, f.name
       LIMIT 200`,
      accrualParams
    );

    return Response.json({
      policies: policiesRes.rows,
      accruals: accrualsRes.rows,
    });
  } catch (err) {
    console.error("[re/v2/fees] DB error", err);
    return Response.json(empty);
  }
}
