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

    // 3b. Ensure business row exists (required for re_partner FK)
    const bizCheck = await pool.query(
      `SELECT business_id FROM business WHERE business_id = $1::uuid`,
      [business_id]
    );
    if (bizCheck.rows.length === 0) {
      const tenantRes = await pool.query(`SELECT tenant_id FROM tenant LIMIT 1`);
      const tenantId = tenantRes.rows[0]?.tenant_id;
      if (!tenantId) {
        return Response.json({ error: "No tenant found — run backbone migrations first" }, { status: 500 });
      }
      await pool.query(
        `INSERT INTO business (business_id, tenant_id, name, slug)
         VALUES ($1::uuid, $2::uuid, 'Winston Capital', 'winston-capital')
         ON CONFLICT (business_id) DO NOTHING`,
        [business_id, tenantId]
      );
      results.push("Created business row for FK constraint");
    }

    // 4. Seed LP partners and capital data
    const partnerDefs = [
      { name: "Winston Capital",     type: "gp", committed: 10_000_000 },
      { name: "State Pension Fund",  type: "lp", committed: 200_000_000 },
      { name: "University Endowment", type: "lp", committed: 150_000_000 },
      { name: "Sovereign Wealth",    type: "lp", committed: 140_000_000 },
    ];
    const totalCommitted = 500_000_000;
    const totalCalled = 425_000_000;
    const totalDistributed = 34_000_000;
    const calledPct = totalCalled / totalCommitted;
    const distPct = totalDistributed / totalCommitted;

    const partnerCheck = await pool.query(
      `SELECT partner_id::text FROM re_partner
       WHERE business_id = $1::uuid LIMIT 1`,
      [business_id]
    );
    if (partnerCheck.rows.length === 0) {
      for (const pDef of partnerDefs) {
        const partnerId = randomUUID();
        await pool.query(
          `INSERT INTO re_partner (partner_id, business_id, name, partner_type)
           VALUES ($1::uuid, $2::uuid, $3, $4)
           ON CONFLICT DO NOTHING`,
          [partnerId, business_id, pDef.name, pDef.type]
        );
        await pool.query(
          `INSERT INTO re_partner_commitment (partner_id, fund_id, committed_amount, commitment_date, status)
           VALUES ($1::uuid, $2::uuid, $3, '2021-01-15', 'active')
           ON CONFLICT (partner_id, fund_id) DO NOTHING`,
          [partnerId, fund_id, pDef.committed]
        );
        const pCalled = Math.round(pDef.committed * calledPct);
        const pDistributed = Math.round(pDef.committed * distPct);
        // Contribution entry
        await pool.query(
          `INSERT INTO re_capital_ledger_entry
             (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
           VALUES ($1::uuid, $2::uuid, 'contribution', $3, $3, '2026-01-15', '2026Q1', 'Seed contribution', 'generated')
           ON CONFLICT DO NOTHING`,
          [fund_id, partnerId, pCalled]
        );
        // Distribution entry
        await pool.query(
          `INSERT INTO re_capital_ledger_entry
             (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
           VALUES ($1::uuid, $2::uuid, 'distribution', $3, $3, '2026-02-15', '2026Q1', 'Seed distribution', 'generated')
           ON CONFLICT DO NOTHING`,
          [fund_id, partnerId, pDistributed]
        );
        // Partner quarter metrics
        const pNav = Math.round(pCalled * 1.05 - pDistributed);
        await pool.query(
          `INSERT INTO re_partner_quarter_metrics
             (partner_id, fund_id, quarter, run_id, contributed_to_date, distributed_to_date, nav, dpi, tvpi, irr)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [partnerId, fund_id, quarter, runId,
            pCalled, pDistributed, pNav,
            pDistributed / pCalled,
            (pNav + pDistributed) / pCalled,
            pDef.type === "gp" ? 0.18 : 0.12 + Math.random() * 0.03]
        );
      }
      results.push("Seeded 4 partners with commitments, capital ledger, and metrics");
    } else {
      results.push("Partners already exist");
    }

    // Get fund target_size for NAV estimate
    const fundRow = await pool.query(
      `SELECT target_size FROM repe_fund WHERE fund_id = $1::uuid`,
      [fund_id]
    );
    const targetSize = parseFloat(fundRow.rows[0]?.target_size) || totalCommitted;

    const portfolioNav = targetSize * 0.85;
    const dpi = totalDistributed / totalCalled;
    const rvpi = portfolioNav / totalCalled;
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

    // 6b. Backfill historical fund quarter states (2024Q1–2025Q4) with smooth NAV growth (A9 fix)
    {
      const histFundQuarters = [
        "2024Q1", "2024Q2", "2024Q3", "2024Q4",
        "2025Q1", "2025Q2", "2025Q3", "2025Q4",
      ];
      let histFqsSeeded = 0;
      for (let qi = 0; qi < histFundQuarters.length; qi++) {
        const hq = histFundQuarters[qi];
        const growthFactor = 0.80 + (qi / histFundQuarters.length) * 0.17;
        const hNav = Math.round(portfolioNav * growthFactor);
        const hCalled = Math.round(totalCalled * growthFactor);
        const hDistributed = Math.round(totalDistributed * (qi / histFundQuarters.length));
        const hDpi = hCalled > 0 ? hDistributed / hCalled : 0;
        const hRvpi = hCalled > 0 ? hNav / hCalled : 0;
        const hTvpi = hDpi + hRvpi;

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
             'seed-historical', NOW()
           )
           ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
           DO NOTHING`,
          [
            randomUUID(), fund_id, hq, runId,
            hNav, totalCommitted, hCalled, hDistributed,
            hDpi, hRvpi, hTvpi,
            grossIrr * growthFactor, netIrr * growthFactor,
          ]
        );

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
           DO NOTHING`,
          [
            randomUUID(), fund_id, hq, runId,
            hCalled, hDistributed, hNav,
            hDpi, hTvpi, grossIrr * growthFactor,
          ]
        );
        histFqsSeeded++;
      }
      results.push(`Backfilled ${histFqsSeeded} historical fund quarter states (2024Q1–2025Q4)`);
    }

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

        const seedDebt = Math.round(seedValue * (0.40 + Math.random() * 0.20)); // 40-60% LTV
        const seedDebtService = Math.round(seedNoi * (0.25 + Math.random() * 0.15)); // 25-40% of NOI
        await pool.query(
          `INSERT INTO re_asset_quarter_state (
             id, asset_id, quarter, run_id, accounting_basis,
             noi, revenue, opex, occupancy, asset_value, nav,
             debt_balance, debt_service,
             valuation_method, inputs_hash, created_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4::uuid, 'accrual',
             $5, $6, $7, $8, $9, $10,
             $11, $12,
             'cap_rate', 'seed', NOW()
           )
           ON CONFLICT DO NOTHING`,
          [
            randomUUID(), assetId, quarter, runId,
            Math.round(seedNoi), Math.round(seedRevenue), Math.round(seedOpex),
            Math.round(seedOcc * 10000) / 10000,
            Math.round(seedValue),
            Math.round(seedValue * 0.7),
            seedDebt, seedDebtService,
          ]
        );
        qsSeeded++;
      }
      results.push(`Seeded quarter state for ${qsSeeded} assets`);

      // 8b. Backfill historical asset quarter states (2024Q1–2025Q4) with smooth NAV growth
      const historicalQuarters = [
        "2024Q1", "2024Q2", "2024Q3", "2024Q4",
        "2025Q1", "2025Q2", "2025Q3", "2025Q4",
      ];
      let histSeeded = 0;
      for (const assetId of assetIds) {
        // Grab the 2026Q1 values as the "current" anchor
        const currentRow = await pool.query(
          `SELECT noi::float8, revenue::float8, opex::float8, occupancy::float8,
                  asset_value::float8, nav::float8, debt_balance::float8, debt_service::float8
           FROM re_asset_quarter_state
           WHERE asset_id = $1::uuid AND quarter = '2026Q1' AND scenario_id IS NULL LIMIT 1`,
          [assetId]
        );
        if (!currentRow.rows[0]) continue;
        const cur = currentRow.rows[0];

        for (let qi = 0; qi < historicalQuarters.length; qi++) {
          const hq = historicalQuarters[qi];
          // Growth factor: qi=0 is earliest (smallest), qi=7 is most recent
          // Smooth ramp from ~80% to ~97% of current values
          const growthFactor = 0.80 + (qi / historicalQuarters.length) * 0.17;
          const hNoi = Math.round(cur.noi * growthFactor);
          const hRevenue = Math.round(cur.revenue * growthFactor);
          const hOpex = hRevenue - hNoi;
          const hOcc = Math.min(0.99, cur.occupancy * (0.92 + qi * 0.01));
          const hValue = Math.round(cur.asset_value * growthFactor);
          // NAV grows smoothly — no sudden plunge in 2026Q1 (A9 fix)
          const hNav = Math.round(cur.nav * growthFactor);
          const hDebt = Math.round(cur.debt_balance * (1.02 - qi * 0.002)); // debt slowly decreasing
          const hDs = Math.round(cur.debt_service * growthFactor);

          await pool.query(
            `INSERT INTO re_asset_quarter_state (
               id, asset_id, quarter, run_id, accounting_basis,
               noi, revenue, opex, occupancy, asset_value, nav,
               debt_balance, debt_service,
               valuation_method, inputs_hash, created_at
             ) VALUES (
               $1::uuid, $2::uuid, $3, $4::uuid, 'accrual',
               $5, $6, $7, $8, $9, $10,
               $11, $12,
               'cap_rate', 'seed-historical', NOW()
             )
             ON CONFLICT DO NOTHING`,
            [
              randomUUID(), assetId, hq, runId,
              hNoi, hRevenue, Math.round(hOpex),
              Math.round(hOcc * 10000) / 10000,
              hValue, hNav,
              hDebt, hDs,
            ]
          );
          histSeeded++;
        }
      }
      results.push(`Backfilled ${histSeeded} historical asset quarter states (2024Q1–2025Q4)`);

      // 9. Seed investment quarter state for deals
      const dealsResult = await pool.query(
        `SELECT deal_id::text, name FROM repe_deal WHERE fund_id = $1::uuid`,
        [fund_id]
      );
      const dealRows: { deal_id: string; name: string }[] = dealsResult.rows;
      const dealCount = dealRows.length || 1;
      const navPerDeal = portfolioNav / dealCount;
      const committedPerDeal = totalCommitted / dealCount;
      const calledPerDeal = totalCalled / dealCount;
      const distPerDeal = totalDistributed / dealCount;

      // Assign realistic acquisition dates (2019-2023 spread)
      const acquisitionDates = [
        "2019-06-15", "2019-11-01", "2020-03-20", "2020-09-10",
        "2021-01-15", "2021-06-30", "2021-12-01", "2022-04-15",
        "2022-08-22", "2023-01-10", "2023-05-18", "2023-10-01",
      ];

      let iqsSeeded = 0;
      for (let di = 0; di < dealRows.length; di++) {
        const deal = dealRows[di];
        const acqDate = acquisitionDates[di % acquisitionDates.length];
        // Update deal-level committed/invested + acquisition date on repe_deal
        await pool.query(
          `UPDATE repe_deal
           SET committed_capital = $2, invested_capital = $3,
               target_close_date = COALESCE(target_close_date, $4::date)
           WHERE deal_id = $1::uuid`,
          [deal.deal_id, Math.round(committedPerDeal), Math.round(calledPerDeal), acqDate]
        );

        const existing = await pool.query(
          `SELECT 1 FROM re_investment_quarter_state
           WHERE investment_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL LIMIT 1`,
          [deal.deal_id, quarter]
        );
        if (existing.rows.length > 0) continue;

        const irrVal = 0.08 + Math.random() * 0.10;
        await pool.query(
          `INSERT INTO re_investment_quarter_state (
             id, investment_id, quarter, run_id,
             nav, committed_capital, invested_capital, realized_distributions,
             unrealized_value, gross_irr, net_irr, equity_multiple,
             inputs_hash, created_at
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4::uuid,
             $5, $6, $7, $8,
             $9, $10, $11, $12,
             'seed', NOW()
           )
           ON CONFLICT DO NOTHING`,
          [
            randomUUID(), deal.deal_id, quarter, runId,
            Math.round(navPerDeal), Math.round(committedPerDeal),
            Math.round(calledPerDeal), Math.round(distPerDeal),
            Math.round(navPerDeal), irrVal, irrVal * 0.82,
            (navPerDeal + distPerDeal) / calledPerDeal,
          ]
        );
        iqsSeeded++;
      }
      results.push(`Seeded investment quarter state for ${iqsSeeded} deals`);

      // 10. Seed property asset details (units, market, cost_basis)
      const propertyMarkets = [
        "Downtown Chicago", "Midtown Manhattan", "Buckhead Atlanta",
        "South Beach Miami", "Downtown Denver", "Seattle CBD",
        "San Jose", "Austin CBD", "Nashville", "Raleigh-Durham",
        "Charlotte Uptown", "Tampa Bay",
      ];
      let propSeeded = 0;
      for (let i = 0; i < assetIds.length; i++) {
        const assetId = assetIds[i];
        const market = propertyMarkets[i % propertyMarkets.length];
        const units = 50000 + Math.floor(Math.random() * 300000);
        const costBasis = Math.round(20_000_000 + Math.random() * 60_000_000);
        const noi = Math.round(costBasis * (0.05 + Math.random() * 0.03));
        const occ = 0.85 + Math.random() * 0.12;
        await pool.query(
          `INSERT INTO repe_property_asset (asset_id, property_type, units, market, current_noi, occupancy)
           VALUES ($1::uuid, 'Office', $2, $3, $4, $5)
           ON CONFLICT (asset_id) DO UPDATE SET
             units = COALESCE(NULLIF(repe_property_asset.units, 0), EXCLUDED.units),
             market = COALESCE(NULLIF(repe_property_asset.market, ''), EXCLUDED.market),
             current_noi = COALESCE(repe_property_asset.current_noi, EXCLUDED.current_noi),
             occupancy = COALESCE(repe_property_asset.occupancy, EXCLUDED.occupancy)`,
          [assetId, units, market, noi, Math.round(occ * 10000) / 10000]
        );
        propSeeded++;
      }
      results.push(`Seeded property asset details for ${propSeeded} assets`);

      // 10a. Override Cascade Multifamily with accurate property data
      await pool.query(`
        UPDATE repe_property_asset SET
          city = 'Aurora', state = 'CO', market = 'Denver-Aurora, CO MSA', msa = 'Denver-Aurora, CO MSA',
          units = 240, year_built = 2016, property_type = 'multifamily', avg_rent_per_unit = 2187
        WHERE asset_id = (SELECT asset_id FROM repe_asset WHERE LOWER(name) LIKE '%cascade multifamily%' LIMIT 1)
      `);
      results.push("Applied Cascade Multifamily property overrides");
    }

    // 10b. Seed loan details for assets
    if (assetIds.length > 0) {
      const lenders = ["JPMorgan Chase", "Wells Fargo", "Bank of America", "Goldman Sachs", "Morgan Stanley", "Citi"];
      let loanSeeded = 0;
      for (let li = 0; li < assetIds.length; li++) {
        const assetId = assetIds[li];
        const loanCheck = await pool.query(
          `SELECT 1 FROM re_loan_detail WHERE asset_id = $1::uuid LIMIT 1`,
          [assetId]
        );
        if (loanCheck.rows.length > 0) continue;

        // Get asset value to compute realistic loan amounts
        const assetState = await pool.query(
          `SELECT asset_value::float8, noi::float8 FROM re_asset_quarter_state
           WHERE asset_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL LIMIT 1`,
          [assetId, quarter]
        );
        const av = assetState.rows[0]?.asset_value || 30_000_000;
        const noi = assetState.rows[0]?.noi || av * 0.06;

        const ltvTarget = 0.40 + Math.random() * 0.20; // 40-60% LTV
        const loanBal = Math.round(av * ltvTarget);
        const coupon = 0.04 + Math.random() * 0.025; // 4.0-6.5%
        const debtService = loanBal * coupon; // interest-only
        const dscr = debtService > 0 ? (noi * 4) / debtService : 0; // annualized NOI / annual debt service
        const matYears = 3 + Math.floor(Math.random() * 5); // 3-7 years from now
        const matDate = `${2026 + matYears}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-15`;

        // Intentionally make one asset have a covenant-breaching DSCR (< 1.25x)
        const actualDscr = li === 0 ? 1.18 : dscr; // First asset in breach for testing

        await pool.query(
          `INSERT INTO re_loan_detail (asset_id, original_balance, current_balance, coupon, maturity_date, ltv, dscr)
           VALUES ($1::uuid, $2, $3, $4, $5::date, $6, $7)
           ON CONFLICT (asset_id) DO UPDATE SET
             current_balance = EXCLUDED.current_balance,
             coupon = EXCLUDED.coupon,
             ltv = EXCLUDED.ltv,
             dscr = EXCLUDED.dscr`,
          [assetId, loanBal, loanBal, coupon, matDate, ltvTarget, actualDscr]
        );
        loanSeeded++;
      }
      results.push(`Seeded loan details for ${loanSeeded} assets`);
    }

    // 10c. Seed default waterfall definition if missing
    const wfCheck = await pool.query(
      `SELECT definition_id::text FROM re_waterfall_definition WHERE fund_id = $1::uuid AND is_active = true LIMIT 1`,
      [fund_id]
    );
    if (!wfCheck.rows[0]) {
      const wfDefId = randomUUID();
      await pool.query(
        `INSERT INTO re_waterfall_definition (definition_id, fund_id, name, waterfall_type, version, is_active)
         VALUES ($1::uuid, $2::uuid, 'Default', 'european', 1, true)
         ON CONFLICT (fund_id, name, version) DO NOTHING`,
        [wfDefId, fund_id]
      );
      const wfTiers = [
        { order: 1, type: "return_of_capital", hurdle: null, splitGp: 0, splitLp: 1.0, catchUp: null },
        { order: 2, type: "preferred_return", hurdle: 0.08, splitGp: 0, splitLp: 1.0, catchUp: null },
        { order: 3, type: "catch_up", hurdle: null, splitGp: 1.0, splitLp: 0, catchUp: 1.0 },
        { order: 4, type: "split", hurdle: null, splitGp: 0.20, splitLp: 0.80, catchUp: null },
      ];
      for (const t of wfTiers) {
        await pool.query(
          `INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (definition_id, tier_order) DO NOTHING`,
          [randomUUID(), wfDefId, t.order, t.type, t.hurdle, t.splitGp, t.splitLp, t.catchUp]
        );
      }
      results.push("Seeded default waterfall definition with 4 tiers");
    } else {
      results.push("Waterfall definition already exists");
    }

    // 10c. Create and seed benchmark table (NCREIF ODCE)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS re_benchmark (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        benchmark_name  text NOT NULL,
        quarter         text NOT NULL,
        total_return    numeric(18,12),
        income_return   numeric(18,12),
        appreciation    numeric(18,12),
        source          text NOT NULL DEFAULT 'manual',
        created_at      timestamptz NOT NULL DEFAULT now(),
        UNIQUE (benchmark_name, quarter)
      )
    `);
    const bmCheck = await pool.query(
      `SELECT 1 FROM re_benchmark WHERE benchmark_name = 'NCREIF_ODCE' LIMIT 1`
    );
    if (bmCheck.rows.length === 0) {
      const ncreifData = [
        { q: "2024Q1", total: 0.0052, income: 0.0098, appr: -0.0046 },
        { q: "2024Q2", total: 0.0071, income: 0.0097, appr: -0.0026 },
        { q: "2024Q3", total: 0.0089, income: 0.0096, appr: -0.0007 },
        { q: "2024Q4", total: 0.0102, income: 0.0095, appr: 0.0007 },
        { q: "2025Q1", total: 0.0095, income: 0.0094, appr: 0.0001 },
        { q: "2025Q2", total: 0.0114, income: 0.0093, appr: 0.0021 },
        { q: "2025Q3", total: 0.0128, income: 0.0092, appr: 0.0036 },
        { q: "2025Q4", total: 0.0145, income: 0.0091, appr: 0.0054 },
        { q: "2026Q1", total: 0.0118, income: 0.0090, appr: 0.0028 },
      ];
      for (const d of ncreifData) {
        await pool.query(
          `INSERT INTO re_benchmark (benchmark_name, quarter, total_return, income_return, appreciation)
           VALUES ('NCREIF_ODCE', $1, $2, $3, $4)
           ON CONFLICT (benchmark_name, quarter) DO NOTHING`,
          [d.q, d.total, d.income, d.appr]
        );
      }
      results.push("Seeded NCREIF ODCE benchmark data (9 quarters)");
    } else {
      results.push("Benchmark data already exists");
    }

    // 11. Seed run provenance for quarter close
    const runCheck = await pool.query(
      `SELECT 1 FROM re_run_provenance
       WHERE fund_id = $1::uuid AND quarter = $2 AND run_type = 'quarter_close' AND status = 'success' LIMIT 1`,
      [fund_id, quarter]
    );
    if (runCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO re_run_provenance (
           run_id, run_type, fund_id, quarter,
           effective_assumptions_hash, status, triggered_by,
           started_at, completed_at
         ) VALUES (
           $1::uuid, 'quarter_close', $2::uuid, $3,
           'seed', 'success', 'seed-script',
           NOW() - interval '5 minutes', NOW()
         )
         ON CONFLICT DO NOTHING`,
        [runId, fund_id, quarter]
      );
      results.push("Created quarter close run provenance for 2026Q1");
    } else {
      results.push("Quarter close run already exists");
    }

    // 11b. Seed historical capital activity timeline (capital calls & distributions across 2024-2025)
    const capitalEvents = [
      { type: "contribution", date: "2024-02-15", quarter: "2024Q1", amount: 62_500_000, memo: "Capital Call #7 – Q1 2024" },
      { type: "contribution", date: "2024-05-10", quarter: "2024Q2", amount: 45_000_000, memo: "Capital Call #8 – Q2 2024" },
      { type: "distribution", date: "2024-06-30", quarter: "2024Q2", amount: 8_500_000, memo: "Q2 2024 Income Distribution" },
      { type: "contribution", date: "2024-10-01", quarter: "2024Q4", amount: 37_500_000, memo: "Capital Call #9 – Q4 2024" },
      { type: "contribution", date: "2025-03-15", quarter: "2025Q1", amount: 30_000_000, memo: "Capital Call #10 – Q1 2025" },
      { type: "distribution", date: "2025-06-30", quarter: "2025Q2", amount: 12_000_000, memo: "Q2 2025 Income Distribution" },
    ];
    let capitalEventsSeeded = 0;
    // Get first partner to attribute fund-level capital events
    const firstPartner = await pool.query(
      `SELECT partner_id::text FROM re_partner WHERE business_id = $1::uuid LIMIT 1`,
      [business_id]
    );
    const capitalPartnerId = firstPartner.rows[0]?.partner_id;
    if (capitalPartnerId) {
      for (const evt of capitalEvents) {
        const existCheck = await pool.query(
          `SELECT 1 FROM re_capital_ledger_entry
           WHERE fund_id = $1::uuid AND entry_type = $2 AND effective_date = $3::date AND memo = $4 LIMIT 1`,
          [fund_id, evt.type, evt.date, evt.memo]
        );
        if (existCheck.rows.length === 0) {
          await pool.query(
            `INSERT INTO re_capital_ledger_entry
               (fund_id, partner_id, entry_type, amount, amount_base, effective_date, quarter, memo, source)
             VALUES ($1::uuid, $2::uuid, $3, $4, $4, $5::date, $6, $7, 'seed-historical')
             ON CONFLICT DO NOTHING`,
            [fund_id, capitalPartnerId, evt.type, evt.amount, evt.date, evt.quarter, evt.memo]
          );
          capitalEventsSeeded++;
        }
      }
    }
    results.push(`Seeded ${capitalEventsSeeded} historical capital activity events`);

    // 11c. Rename duplicate "Morgan QA Downside" model if any
    await pool.query(`
      UPDATE re_model SET name = 'Morgan QA Downside v2'
      WHERE model_id = (
        SELECT model_id FROM re_model WHERE name = 'Morgan QA Downside'
        ORDER BY created_at DESC LIMIT 1
      ) AND (SELECT COUNT(*) FROM re_model WHERE name = 'Morgan QA Downside') > 1
    `);
    results.push("Checked/renamed duplicate Morgan QA Downside model");

    // 12. Update fund quarter state with correct committed/called/distributed
    await pool.query(
      `UPDATE re_fund_quarter_state
       SET total_committed = $3, total_called = $4, total_distributed = $5
       WHERE fund_id = $1::uuid AND quarter = $2 AND scenario_id IS NULL`,
      [fund_id, quarter, totalCommitted, totalCalled, totalDistributed]
    );
    results.push("Updated fund quarter state with committed/called/distributed");

    // 13. Seed demo documents for Cascade Multifamily (E3)
    try {
      const cascadeAssetRes = await pool.query(
        `SELECT asset_id::text FROM repe_asset WHERE LOWER(name) LIKE '%cascade multifamily%' LIMIT 1`
      );
      const cascadeAssetId = cascadeAssetRes.rows[0]?.asset_id;
      if (cascadeAssetId) {
        // Look up tenant_id from business
        const tenantRes = await pool.query(
          `SELECT tenant_id::text FROM app.businesses WHERE business_id = $1::uuid`,
          [business_id]
        );
        const tenantId = tenantRes.rows[0]?.tenant_id;
        if (tenantId) {
          const demoDocs = [
            { title: "Cascade Multifamily – Rent Roll (2026Q1)", classification: "evidence", domain: "real-estate" },
            { title: "Cascade Multifamily – Operating Statement (2026Q1)", classification: "evidence", domain: "real-estate" },
            { title: "Cascade Multifamily – Appraisal Summary", classification: "evidence", domain: "real-estate" },
            { title: "Cascade Multifamily – Capital Improvement Plan", classification: "other", domain: "real-estate" },
            { title: "Cascade Multifamily – Environmental Phase I", classification: "evidence", domain: "real-estate" },
          ];
          let docsSeeded = 0;
          for (const doc of demoDocs) {
            const docId = randomUUID();
            await pool.query(
              `INSERT INTO app.documents (document_id, tenant_id, domain, classification, title, status, created_at)
               VALUES ($1::uuid, $2::uuid, $3, $4::app.document_classification, $5, 'approved'::app.document_status, NOW())
               ON CONFLICT DO NOTHING`,
              [docId, tenantId, doc.domain, doc.classification, doc.title]
            );
            await pool.query(
              `INSERT INTO app.document_links (tenant_id, document_id, link_type, entity_type, entity_id, created_at)
               VALUES ($1::uuid, $2::uuid, 'reference'::app.document_link_type, 'asset', $3::uuid, NOW())
               ON CONFLICT DO NOTHING`,
              [tenantId, docId, cascadeAssetId]
            );
            docsSeeded++;
          }
          results.push(`Seeded ${docsSeeded} demo documents for Cascade Multifamily`);
        } else {
          results.push("Skipped demo documents: tenant_id not found");
        }
      } else {
        results.push("Skipped demo documents: Cascade Multifamily asset not found");
      }
    } catch (docErr) {
      results.push(`Skipped demo documents: ${String(docErr).slice(0, 100)}`);
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
