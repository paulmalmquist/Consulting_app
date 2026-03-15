import { getPool, resolveBusinessId } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/waterfall-comparison?run_id_a=X&run_id_b=Y&env_id=Z
 *
 * Compares two waterfall runs side-by-side with delta calculations.
 */
export async function GET(request: Request) {
  const pool = getPool();
  const empty = { run_a: null, run_b: null, deltas: null };
  if (!pool) return Response.json(empty);

  const { searchParams } = new URL(request.url);
  const envId = searchParams.get("env_id");
  const runIdA = searchParams.get("run_id_a");
  const runIdB = searchParams.get("run_id_b");

  if (!runIdA || !runIdB) {
    return Response.json({ error: "run_id_a and run_id_b are required" }, { status: 400 });
  }

  try {
    const businessId = await resolveBusinessId(pool, envId, searchParams.get("business_id"));
    if (!businessId) return Response.json(empty);

    // Fetch run metadata for both runs
    const runsRes = await pool.query(
      `SELECT
         wr.run_id::text,
         wr.fund_id::text,
         wr.quarter,
         wr.run_type,
         wr.total_distributable::text,
         wr.status,
         wr.created_at::text,
         s.name AS scenario_name,
         s.scenario_type
       FROM re_waterfall_run wr
       LEFT JOIN re_scenario s ON s.scenario_id = wr.scenario_id
       WHERE wr.run_id = ANY($1::uuid[])`,
      [[runIdA, runIdB]]
    );

    const runMap: Record<string, Record<string, unknown>> = {};
    for (const row of runsRes.rows) {
      runMap[row.run_id as string] = row;
    }

    const runAMeta = runMap[runIdA];
    const runBMeta = runMap[runIdB];

    if (!runAMeta || !runBMeta) {
      return Response.json({ error: "One or both runs not found" }, { status: 404 });
    }

    // Fetch allocations for both runs, joined with partner names
    const allocsRes = await pool.query(
      `SELECT
         wrr.run_id::text,
         wrr.result_id::text,
         wrr.partner_id::text,
         p.name AS partner_name,
         wrr.tier_code,
         wrr.payout_type,
         wrr.amount::text,
         wrr.ending_capital_balance::text
       FROM re_waterfall_run_result wrr
       LEFT JOIN re_partner p ON p.partner_id = wrr.partner_id
       WHERE wrr.run_id = ANY($1::uuid[])
       ORDER BY wrr.tier_code, p.name`,
      [[runIdA, runIdB]]
    );

    const allocsA: Record<string, unknown>[] = [];
    const allocsB: Record<string, unknown>[] = [];
    for (const row of allocsRes.rows) {
      if (row.run_id === runIdA) allocsA.push(row);
      else allocsB.push(row);
    }

    // Compute deltas
    const totalDistA = parseFloat((runAMeta.total_distributable as string) || "0");
    const totalDistB = parseFloat((runBMeta.total_distributable as string) || "0");

    // By-tier deltas
    const tierTotalsA: Record<string, number> = {};
    const tierTotalsB: Record<string, number> = {};
    for (const a of allocsA) {
      const tier = a.tier_code as string;
      tierTotalsA[tier] = (tierTotalsA[tier] || 0) + parseFloat((a.amount as string) || "0");
    }
    for (const b of allocsB) {
      const tier = b.tier_code as string;
      tierTotalsB[tier] = (tierTotalsB[tier] || 0) + parseFloat((b.amount as string) || "0");
    }
    const allTiers = new Set([...Object.keys(tierTotalsA), ...Object.keys(tierTotalsB)]);
    const byTier: Record<string, string> = {};
    for (const tier of allTiers) {
      const delta = (tierTotalsB[tier] || 0) - (tierTotalsA[tier] || 0);
      byTier[tier] = delta.toFixed(2);
    }

    // By-partner deltas
    const partnerTotalsA: Record<string, number> = {};
    const partnerTotalsB: Record<string, number> = {};
    for (const a of allocsA) {
      const name = (a.partner_name as string) || (a.partner_id as string) || "Unknown";
      partnerTotalsA[name] = (partnerTotalsA[name] || 0) + parseFloat((a.amount as string) || "0");
    }
    for (const b of allocsB) {
      const name = (b.partner_name as string) || (b.partner_id as string) || "Unknown";
      partnerTotalsB[name] = (partnerTotalsB[name] || 0) + parseFloat((b.amount as string) || "0");
    }
    const allPartners = new Set([...Object.keys(partnerTotalsA), ...Object.keys(partnerTotalsB)]);
    const byPartner: Record<string, string> = {};
    for (const partner of allPartners) {
      const delta = (partnerTotalsB[partner] || 0) - (partnerTotalsA[partner] || 0);
      byPartner[partner] = delta.toFixed(2);
    }

    return Response.json({
      run_a: {
        ...runAMeta,
        allocations: allocsA,
      },
      run_b: {
        ...runBMeta,
        allocations: allocsB,
      },
      deltas: {
        total_distributable: (totalDistB - totalDistA).toFixed(2),
        by_tier: byTier,
        by_partner: byPartner,
      },
    });
  } catch (err) {
    console.error("[re/v2/waterfall-comparison] DB error", err);
    return Response.json(empty);
  }
}
