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
    if (!downCheck.rows[0]) {
      await pool.query(
        `INSERT INTO re_scenario (scenario_id, fund_id, name, description, scenario_type, is_base, status, created_at)
         VALUES ($1::uuid, $2::uuid, 'Downside CapRate +75bps', 'Stress test with cap rate expansion', 'downside', false, 'active', NOW())
         ON CONFLICT (fund_id, name) DO NOTHING`,
        [randomUUID(), fund_id]
      );
      results.push("Created downside scenario");
    }

    // 3. Create upside scenario if missing
    const upCheck = await pool.query(
      `SELECT scenario_id::text FROM re_scenario WHERE fund_id = $1::uuid AND scenario_type = 'upside' LIMIT 1`,
      [fund_id]
    );
    if (!upCheck.rows[0]) {
      await pool.query(
        `INSERT INTO re_scenario (scenario_id, fund_id, name, description, scenario_type, is_base, status, created_at)
         VALUES ($1::uuid, $2::uuid, 'Upside NOI Growth +10%', 'Optimistic scenario with stronger NOI', 'upside', false, 'active', NOW())
         ON CONFLICT (fund_id, name) DO NOTHING`,
        [randomUUID(), fund_id]
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

    // Estimate NAV
    const portfolioNav = totalCalled > 0 ? totalCalled * 1.25 - totalDistributed : targetSize * 0.85;

    // Compute basic multiples
    const dpi = totalCalled > 0 ? totalDistributed / totalCalled : 0.14;
    const rvpi = totalCalled > 0 ? portfolioNav / totalCalled : 1.07;
    const tvpi = dpi + rvpi;
    const grossIrr = 0.1245;
    const netIrr = 0.0987;

    // 5. Upsert fund quarter state (matches 270_re_institutional_model.sql schema)
    await pool.query(
      `INSERT INTO re_fund_quarter_state (
         id, fund_id, quarter, run_id,
         portfolio_nav, total_committed, total_called, total_distributed,
         dpi, rvpi, tvpi, gross_irr, net_irr,
         inputs_hash, created_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::uuid,
         $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         'seed', NOW()
       )
       ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO UPDATE SET
         portfolio_nav = EXCLUDED.portfolio_nav,
         total_committed = EXCLUDED.total_committed,
         total_called = EXCLUDED.total_called,
         total_distributed = EXCLUDED.total_distributed,
         dpi = EXCLUDED.dpi,
         rvpi = EXCLUDED.rvpi,
         tvpi = EXCLUDED.tvpi,
         gross_irr = EXCLUDED.gross_irr,
         net_irr = EXCLUDED.net_irr,
         run_id = EXCLUDED.run_id,
         inputs_hash = EXCLUDED.inputs_hash`,
      [
        randomUUID(), fund_id, quarter, runId,
        portfolioNav, totalCommitted, totalCalled, totalDistributed,
        dpi, rvpi, tvpi, grossIrr, netIrr,
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

    // 7. Seed accounting data for assets under this fund
    const assetsResult = await pool.query(
      `SELECT a.asset_id::text
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       WHERE d.fund_id = $1::uuid`,
      [fund_id]
    );
    const assetIds: string[] = assetsResult.rows.map(
      (r: { asset_id: string }) => r.asset_id
    );

    if (assetIds.length > 0) {
      // Ensure chart of accounts entries exist
      await pool.query(`
        INSERT INTO acct_chart_of_accounts (gl_account, name, category, is_balance_sheet)
        VALUES
          ('4000', 'Rental Revenue',        'Revenue',            false),
          ('4100', 'Other Income',          'Revenue',            false),
          ('5000', 'Payroll',               'Operating Expenses', false),
          ('5100', 'Repairs & Maintenance', 'Operating Expenses', false),
          ('5200', 'Utilities',             'Operating Expenses', false),
          ('5300', 'Property Taxes',        'Operating Expenses', false),
          ('5400', 'Insurance',             'Operating Expenses', false),
          ('5500', 'Management Fees',       'Operating Expenses', false),
          ('6000', 'Capital Expenditures',  'CapEx',              false),
          ('1000', 'Cash & Equivalents',    'Assets',             true),
          ('2000', 'Mortgage Payable',      'Liabilities',        true)
        ON CONFLICT (gl_account) DO NOTHING
      `);

      const months = ["2026-01-01", "2026-02-01", "2026-03-01"];
      const glAccounts = [
        { gl: "4000", min: 200000, max: 400000 },
        { gl: "4100", min: 10000,  max: 30000 },
        { gl: "5000", min: -40000, max: -20000 },
        { gl: "5100", min: -20000, max: -8000 },
        { gl: "5200", min: -15000, max: -5000 },
        { gl: "5300", min: -25000, max: -10000 },
        { gl: "5400", min: -10000, max: -4000 },
        { gl: "5500", min: -15000, max: -5000 },
      ];
      const noiLines = [
        { code: "RENT",          min: 200000, max: 400000 },
        { code: "OTHER_INCOME",  min: 10000,  max: 30000 },
        { code: "PAYROLL",       min: -40000, max: -20000 },
        { code: "REPAIRS_MAINT", min: -20000, max: -8000 },
        { code: "UTILITIES",     min: -15000, max: -5000 },
        { code: "TAXES",         min: -25000, max: -10000 },
        { code: "INSURANCE",     min: -10000, max: -4000 },
        { code: "MGMT_FEES",     min: -15000, max: -5000 },
      ];

      let acctSeeded = 0;
      for (const assetId of assetIds) {
        const existing = await pool.query(
          `SELECT 1 FROM acct_gl_balance_monthly
           WHERE asset_id = $1::uuid AND period_month >= '2026-01-01' LIMIT 1`,
          [assetId]
        );
        if (existing.rows.length > 0) continue;

        for (const month of months) {
          for (const acct of glAccounts) {
            const amount = acct.min + Math.random() * (acct.max - acct.min);
            await pool.query(
              `INSERT INTO acct_gl_balance_monthly
                 (asset_id, period_month, gl_account, amount, source_id)
               VALUES ($1::uuid, $2::date, $3, $4, 'seed')
               ON CONFLICT DO NOTHING`,
              [assetId, month, acct.gl, Math.round(amount * 100) / 100]
            );
          }
          for (const line of noiLines) {
            const amount = line.min + Math.random() * (line.max - line.min);
            await pool.query(
              `INSERT INTO acct_normalized_noi_monthly
                 (asset_id, period_month, line_code, amount)
               VALUES ($1::uuid, $2::date, $3, $4)
               ON CONFLICT DO NOTHING`,
              [assetId, month, line.code, Math.round(amount * 100) / 100]
            );
          }
        }
        acctSeeded++;
      }
      results.push(`Seeded accounting data for ${acctSeeded} assets`);

      // 8. Seed asset quarter state for assets missing metric data
      let qsSeeded = 0;
      for (const assetId of assetIds) {
        const existing = await pool.query(
          `SELECT 1 FROM re_asset_quarter_state
           WHERE asset_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL LIMIT 1`,
          [assetId, quarter]
        );
        if (existing.rows.length > 0) continue;

        const seedNoi = 500000 + Math.random() * 2000000;
        const seedRevenue = seedNoi * (1.3 + Math.random() * 0.4);
        const seedOpex = seedRevenue - seedNoi;
        const seedOcc = 0.82 + Math.random() * 0.15;
        const seedValue = seedNoi / (0.045 + Math.random() * 0.025);

        await pool.query(
          `INSERT INTO re_asset_quarter_state (
             id, asset_id, quarter, run_id, accounting_basis,
             noi, revenue, opex, occupancy, asset_value, nav,
             valuation_method, inputs_hash, created_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4::uuid, 'accrual',
             $5, $6, $7, $8, $9, $10,
             'cap_rate', 'seed', NOW()
           )
           ON CONFLICT DO NOTHING`,
          [
            randomUUID(), assetId, quarter, runId,
            Math.round(seedNoi), Math.round(seedRevenue), Math.round(seedOpex),
            Math.round(seedOcc * 10000) / 10000,
            Math.round(seedValue),
            Math.round(seedValue * 0.7),
          ]
        );
        qsSeeded++;
      }
      results.push(`Seeded quarter state for ${qsSeeded} assets`);
    }

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
        rvpi,
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
