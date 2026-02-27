import { getPool } from "@/lib/server/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const pool = getPool();
  if (!pool) {
    return Response.json({ error: "DB not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { fund_id, business_id } = body;

  if (!fund_id || !business_id) {
    return Response.json({ error: "fund_id and business_id required" }, { status: 400 });
  }

  const results: string[] = [];
  const quarter = "2026Q1";
  const runId = randomUUID();

  try {
    // 1. Ensure base scenario exists
    const baseCheck = await pool.query(
      `SELECT scenario_id::text FROM re_scenario WHERE fund_id = $1::uuid AND is_base = true LIMIT 1`,
      [fund_id]
    );
    let baseScenarioId = baseCheck.rows[0]?.scenario_id;
    if (!baseScenarioId) {
      baseScenarioId = randomUUID();
      await pool.query(
        `INSERT INTO re_scenario (scenario_id, fund_id, name, scenario_type, is_base, status, created_at)
         VALUES ($1::uuid, $2::uuid, 'Base Case', 'base', true, 'active', NOW())
         ON CONFLICT (fund_id, name) DO NOTHING`,
        [baseScenarioId, fund_id]
      );
      results.push("Created base scenario");
    } else {
      results.push("Base scenario already exists");
    }

    // 2. Create downside scenario if missing
    const downCheck = await pool.query(
      `SELECT scenario_id::text FROM re_scenario WHERE fund_id = $1::uuid AND scenario_type = 'downside' LIMIT 1`,
      [fund_id]
    );
    let downsideId = downCheck.rows[0]?.scenario_id;
    if (!downsideId) {
      downsideId = randomUUID();
      await pool.query(
        `INSERT INTO re_scenario (scenario_id, fund_id, name, description, scenario_type, is_base, status, created_at)
         VALUES ($1::uuid, $2::uuid, 'Downside CapRate +75bps', 'Stress test with cap rate expansion', 'downside', false, 'active', NOW())
         ON CONFLICT (fund_id, name) DO NOTHING`,
        [downsideId, fund_id]
      );
      results.push("Created downside scenario");
    }

    // 3. Create upside scenario if missing
    const upCheck = await pool.query(
      `SELECT scenario_id::text FROM re_scenario WHERE fund_id = $1::uuid AND scenario_type = 'upside' LIMIT 1`,
      [fund_id]
    );
    let upsideId = upCheck.rows[0]?.scenario_id;
    if (!upsideId) {
      upsideId = randomUUID();
      await pool.query(
        `INSERT INTO re_scenario (scenario_id, fund_id, name, description, scenario_type, is_base, status, created_at)
         VALUES ($1::uuid, $2::uuid, 'Upside NOI Growth +10%', 'Optimistic scenario with stronger NOI', 'upside', false, 'active', NOW())
         ON CONFLICT (fund_id, name) DO NOTHING`,
        [upsideId, fund_id]
      );
      results.push("Created upside scenario");
    }

    // 4. Compute aggregate KPIs from repe_deal data
    const dealAgg = await pool.query(
      `SELECT
         COALESCE(SUM(committed_capital), 0) AS total_committed,
         COALESCE(SUM(invested_capital), 0) AS total_called,
         COALESCE(SUM(realized_distributions), 0) AS total_distributed,
         COUNT(*) AS deal_count
       FROM repe_deal
       WHERE fund_id = $1::uuid`,
      [fund_id]
    );
    const agg = dealAgg.rows[0];
    const totalCommitted = parseFloat(agg.total_committed) || 0;
    const totalCalled = parseFloat(agg.total_called) || 0;
    const totalDistributed = parseFloat(agg.total_distributed) || 0;

    // Get fund target_size for NAV estimate
    const fundRow = await pool.query(
      `SELECT target_size FROM repe_fund WHERE fund_id = $1::uuid`,
      [fund_id]
    );
    const targetSize = parseFloat(fundRow.rows[0]?.target_size) || totalCommitted || 500000000;

    // Estimate NAV (invested capital minus distributions plus unrealized appreciation)
    const portfolioNav = totalCalled > 0 ? totalCalled * 1.25 - totalDistributed : targetSize * 0.85;
    const unrealizedValue = portfolioNav;

    // Compute basic multiples
    const dpi = totalCalled > 0 ? totalDistributed / totalCalled : 0;
    const tvpi = totalCalled > 0 ? (totalDistributed + unrealizedValue) / totalCalled : 0;
    const grossIrr = 0.1245;
    const netIrr = 0.0987;

    // 5. Upsert fund quarter state
    await pool.query(
      `INSERT INTO re_fund_quarter_state (
         id, fund_id, quarter, run_id, accounting_basis,
         portfolio_nav, total_committed, total_called, total_distributed,
         unrealized_value, gross_irr, net_irr, cash_balance, debt_balance,
         inputs_hash, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::uuid, 'accrual',
         $5, $6, $7, $8,
         $9, $10, $11, 0, 0,
         'seed', NOW()
       )
       ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET
         portfolio_nav = EXCLUDED.portfolio_nav,
         total_committed = EXCLUDED.total_committed,
         total_called = EXCLUDED.total_called,
         total_distributed = EXCLUDED.total_distributed,
         unrealized_value = EXCLUDED.unrealized_value,
         gross_irr = EXCLUDED.gross_irr,
         net_irr = EXCLUDED.net_irr,
         run_id = EXCLUDED.run_id,
         inputs_hash = EXCLUDED.inputs_hash`,
      [
        randomUUID(), fund_id, quarter, runId,
        portfolioNav, totalCommitted, totalCalled, totalDistributed,
        unrealizedValue, grossIrr, netIrr,
      ]
    );
    results.push(`Upserted fund quarter state for ${quarter}`);

    // 6. Upsert fund quarter metrics
    await pool.query(
      `INSERT INTO re_fund_quarter_metrics (
         id, fund_id, quarter, run_id,
         contributed_to_date, distributed_to_date, nav,
         dpi, tvpi, irr, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::uuid,
         $5, $6, $7,
         $8, $9, $10, NOW()
       )
       ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET
         contributed_to_date = EXCLUDED.contributed_to_date,
         distributed_to_date = EXCLUDED.distributed_to_date,
         nav = EXCLUDED.nav,
         dpi = EXCLUDED.dpi,
         tvpi = EXCLUDED.tvpi,
         irr = EXCLUDED.irr,
         run_id = EXCLUDED.run_id`,
      [
        randomUUID(), fund_id, quarter, runId,
        totalCalled, totalDistributed, portfolioNav,
        dpi, tvpi, grossIrr,
      ]
    );
    results.push(`Upserted fund quarter metrics for ${quarter}`);

    return Response.json({
      status: "success",
      quarter,
      fund_id,
      results,
      kpis: {
        portfolio_nav: portfolioNav,
        total_committed: totalCommitted,
        total_called: totalCalled,
        total_distributed: totalDistributed,
        dpi,
        tvpi,
        gross_irr: grossIrr,
        net_irr: netIrr,
      },
    });
  } catch (err) {
    console.error("[re/v2/seed] Error:", err);
    return Response.json(
      { error: String(err), results },
      { status: 500 }
    );
  }
}
