import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "POST, OPTIONS" } });
}

/**
 * POST /api/re/v2/funds/[fundId]/waterfall/run
 *
 * Computes LP/GP waterfall distribution using the fund's waterfall definition
 * (or creates a default 4-tier European waterfall if none exists).
 *
 * Standard 2-and-20 structure:
 * Tier 1: Return of Capital — each partner gets back contributed capital
 * Tier 2: Preferred Return (8% hurdle) — LPs receive preferred return
 * Tier 3: GP Catch-Up — GP catches up to carry percentage of total profit
 * Tier 4: Residual Split — 80% LP / 20% GP
 */
export async function POST(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const pool = getPool();
  if (!pool) return Response.json({ error: "DB not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const quarter: string = body.quarter || "2026Q1";
  const scenarioId: string | null = body.scenario_id || null;
  const runType: string = body.run_type || "shadow";
  const fundId = params.fundId;

  try {
    // 1. Get or create waterfall definition
    let defRes = await pool.query(
      `SELECT definition_id::text, waterfall_type
       FROM re_waterfall_definition
       WHERE fund_id = $1::uuid AND is_active = true
       ORDER BY version DESC LIMIT 1`,
      [fundId]
    );

    let definitionId: string;
    if (defRes.rows[0]) {
      definitionId = defRes.rows[0].definition_id;
    } else {
      // Create default 4-tier European waterfall
      definitionId = randomUUID();
      await pool.query(
        `INSERT INTO re_waterfall_definition (definition_id, fund_id, name, waterfall_type, version, is_active)
         VALUES ($1::uuid, $2::uuid, 'Default', 'european', 1, true)
         ON CONFLICT (fund_id, name, version) DO NOTHING`,
        [definitionId, fundId]
      );

      const tiers = [
        { order: 1, type: "return_of_capital", hurdle: null, splitGp: 0, splitLp: 1.0, catchUp: null },
        { order: 2, type: "preferred_return", hurdle: 0.08, splitGp: 0, splitLp: 1.0, catchUp: null },
        { order: 3, type: "catch_up", hurdle: null, splitGp: 1.0, splitLp: 0, catchUp: 1.0 },
        { order: 4, type: "split", hurdle: null, splitGp: 0.20, splitLp: 0.80, catchUp: null },
      ];
      for (const t of tiers) {
        await pool.query(
          `INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (definition_id, tier_order) DO NOTHING`,
          [randomUUID(), definitionId, t.order, t.type, t.hurdle, t.splitGp, t.splitLp, t.catchUp]
        );
      }
    }

    // 2. Read tiers
    const tiersRes = await pool.query(
      `SELECT tier_id::text, tier_order, tier_type, hurdle_rate::float8, split_gp::float8, split_lp::float8, catch_up_percent::float8
       FROM re_waterfall_tier
       WHERE definition_id = $1::uuid
       ORDER BY tier_order`,
      [definitionId]
    );
    const tiers = tiersRes.rows;

    // 3. Read fund state (total distributable = NAV + cumulative distributions)
    const fundState = await pool.query(
      `SELECT portfolio_nav::float8, total_called::float8, total_distributed::float8,
              total_committed::float8
       FROM re_fund_quarter_state
       WHERE fund_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [fundId, quarter]
    );
    if (!fundState.rows[0]) {
      return Response.json({ error: "No fund state for this quarter. Run Quarter Close first." }, { status: 404 });
    }
    const fs = fundState.rows[0];
    const totalDistributable = (fs.portfolio_nav || 0) + (fs.total_distributed || 0);
    const totalCalled = fs.total_called || 0;

    // 4. Read partner contributions
    const partnersRes = await pool.query(
      `SELECT
         p.partner_id::text,
         p.name,
         p.partner_type,
         c.committed_amount::float8 AS committed,
         COALESCE(pm.contributed_to_date, 0)::float8 AS contributed,
         COALESCE(pm.distributed_to_date, 0)::float8 AS distributed
       FROM re_partner p
       JOIN re_partner_commitment c ON c.partner_id = p.partner_id AND c.fund_id = $1::uuid
       LEFT JOIN re_partner_quarter_metrics pm
         ON pm.partner_id = p.partner_id AND pm.fund_id = $1::uuid AND pm.quarter = $2
       WHERE p.business_id = (SELECT business_id FROM repe_fund WHERE fund_id = $1::uuid)
       ORDER BY p.name`,
      [fundId, quarter]
    );
    const partners = partnersRes.rows as {
      partner_id: string; name: string; partner_type: string;
      committed: number; contributed: number; distributed: number;
    }[];

    if (partners.length === 0) {
      return Response.json({ error: "No partners found. Seed LP data first." }, { status: 404 });
    }

    // 5. Execute waterfall
    // Assume ~5 year hold for preferred return calculation
    const yearsInvested = 5;
    const results: { partner_id: string; tier_code: string; payout_type: string; amount: number }[] = [];

    let remainingPool = totalDistributable;
    const partnerCapital: Record<string, number> = {};
    for (const p of partners) {
      partnerCapital[p.partner_id] = p.contributed;
    }

    // Identify GP vs LP partners
    const gpPartners = partners.filter((p) => p.partner_type === "gp");
    const lpPartners = partners.filter((p) => p.partner_type === "lp");

    let totalPreferredOwed = 0;
    let totalPreferredPaid = 0;

    for (const tier of tiers) {
      const tierCode = tier.tier_type as string;

      if (tierCode === "return_of_capital") {
        // Return each partner's contributed capital pro-rata from available pool
        const totalContributed = partners.reduce((s, p) => s + p.contributed, 0);
        const available = Math.min(remainingPool, totalContributed);
        for (const p of partners) {
          const share = totalContributed > 0 ? p.contributed / totalContributed : 0;
          const payout = Math.round(available * share);
          results.push({ partner_id: p.partner_id, tier_code: "return_of_capital", payout_type: p.partner_type, amount: payout });
        }
        remainingPool -= available;
      } else if (tierCode === "preferred_return") {
        // LPs receive preferred return on contributed capital
        const hurdleRate = (tier.hurdle_rate as number) || 0.08;
        const preferredMultiplier = Math.pow(1 + hurdleRate, yearsInvested) - 1;

        for (const p of lpPartners) {
          const preferredAmount = Math.round(p.contributed * preferredMultiplier);
          totalPreferredOwed += preferredAmount;
          const payout = Math.min(preferredAmount, Math.round(remainingPool * (p.contributed / totalCalled)));
          totalPreferredPaid += payout;
          results.push({ partner_id: p.partner_id, tier_code: "preferred_return", payout_type: "lp", amount: payout });
          remainingPool -= payout;
        }
      } else if (tierCode === "catch_up") {
        // GP catches up to carry percentage of total profit
        // Only if preferred return has been fully paid
        if (totalPreferredPaid < totalPreferredOwed) {
          // Preferred return not met — GP gets $0
          for (const gp of gpPartners) {
            results.push({ partner_id: gp.partner_id, tier_code: "catch_up", payout_type: "gp", amount: 0 });
          }
        } else {
          const carryRate = 0.20; // standard 20% carry
          const catchUpTarget = (totalPreferredPaid * carryRate) / (1 - carryRate);
          const available = Math.min(remainingPool, catchUpTarget);
          for (const gp of gpPartners) {
            const share = gpPartners.length > 1
              ? gp.contributed / gpPartners.reduce((s, g) => s + g.contributed, 0)
              : 1;
            results.push({ partner_id: gp.partner_id, tier_code: "catch_up", payout_type: "gp", amount: Math.round(available * share) });
          }
          remainingPool -= available;
        }
      } else if (tierCode === "split" || tierCode === "promote") {
        // Residual split: 80% LP / 20% GP
        const splitGp = (tier.split_gp as number) || 0.20;
        const splitLp = (tier.split_lp as number) || 0.80;

        // Only split if preferred return was met
        if (totalPreferredPaid < totalPreferredOwed) {
          // No residual — everything went to return of capital + partial preferred
          for (const p of partners) {
            results.push({ partner_id: p.partner_id, tier_code: "split", payout_type: p.partner_type, amount: 0 });
          }
        } else {
          const gpPool = Math.round(remainingPool * splitGp);
          const lpPool = Math.round(remainingPool * splitLp);

          // Split GP portion among GPs
          for (const gp of gpPartners) {
            const share = gpPartners.length > 1
              ? gp.contributed / gpPartners.reduce((s, g) => s + g.contributed, 0)
              : 1;
            results.push({ partner_id: gp.partner_id, tier_code: "split", payout_type: "gp", amount: Math.round(gpPool * share) });
          }
          // Split LP portion among LPs pro-rata by contribution
          const totalLpContributed = lpPartners.reduce((s, p) => s + p.contributed, 0);
          for (const lp of lpPartners) {
            const share = totalLpContributed > 0 ? lp.contributed / totalLpContributed : 0;
            results.push({ partner_id: lp.partner_id, tier_code: "split", payout_type: "lp", amount: Math.round(lpPool * share) });
          }
          remainingPool -= (gpPool + lpPool);
        }
      }
    }

    // 6. Write waterfall run
    const waterfallRunId = randomUUID();
    await pool.query(
      `INSERT INTO re_waterfall_run (run_id, fund_id, definition_id, quarter, scenario_id, run_type, total_distributable, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, 'success')`,
      [waterfallRunId, fundId, definitionId, quarter, scenarioId, runType, Math.round(totalDistributable)]
    );

    // 7. Write results
    for (const r of results) {
      await pool.query(
        `INSERT INTO re_waterfall_run_result (result_id, run_id, partner_id, tier_code, payout_type, amount)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)`,
        [randomUUID(), waterfallRunId, r.partner_id, r.tier_code, r.payout_type, r.amount]
      );
    }

    return Response.json({
      run_id: waterfallRunId,
      fund_id: fundId,
      definition_id: definitionId,
      quarter,
      run_type: runType,
      total_distributable: totalDistributable,
      status: "success",
      created_at: new Date().toISOString(),
      results: results.map((r) => ({
        result_id: randomUUID(),
        run_id: waterfallRunId,
        partner_id: r.partner_id,
        tier_code: r.tier_code,
        payout_type: r.payout_type,
        amount: r.amount,
        created_at: new Date().toISOString(),
      })),
    });
  } catch (err) {
    console.error("[re/v2/funds/[id]/waterfall/run] Error:", err);
    return Response.json({ error: String(err), status: "failed" }, { status: 500 });
  }
}
