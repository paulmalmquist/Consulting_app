import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/environments/[envId]/portfolio-kpis
 *
 * Returns high-level portfolio KPIs for the environment:
 * fund count, total commitments, portfolio NAV, gross/net IRR,
 * weighted DSCR/LTV, pct_invested, and active asset count.
 *
 * SQL aligned with Python backend (re_env_portfolio.get_portfolio_kpis)
 * to ensure header KPIs reconcile with the fund table.
 *
 * If no quarter-state rows match the requested quarter, falls back to
 * the most recent available quarter and sets effective_quarter accordingly.
 */
export async function GET(
  request: Request,
  { params }: { params: { envId: string } }
) {
  const pool = getPool();
  if (!pool) {
    return Response.json({
      env_id: params.envId,
      business_id: null,
      quarter: null,
      effective_quarter: null,
      fund_count: 0,
      total_commitments: "0",
      portfolio_nav: null,
      gross_irr: null,
      net_irr: null,
      weighted_dscr: null,
      weighted_ltv: null,
      pct_invested: null,
      active_assets: 0,
      warnings: ["Database not available"],
    });
  }

  const { searchParams } = new URL(request.url);
  const quarter = searchParams.get("quarter") || "2026Q1";

  try {
    // Resolve business_id
    const ebRes = await pool.query(
      `SELECT business_id::text FROM app.env_business_bindings WHERE env_id = $1::uuid LIMIT 1`,
      [params.envId]
    );
    const businessId = ebRes.rows[0]?.business_id;
    if (!businessId) {
      return Response.json({
        env_id: params.envId,
        business_id: null,
        quarter,
        effective_quarter: quarter,
        fund_count: 0,
        total_commitments: "0",
        portfolio_nav: null,
        gross_irr: null,
        net_irr: null,
        weighted_dscr: null,
        weighted_ltv: null,
        pct_invested: null,
        active_assets: 0,
        warnings: ["No business binding found for environment"],
      });
    }

    // Fund count
    const fundsRes = await pool.query(
      `SELECT COUNT(*)::int AS fund_count FROM repe_fund WHERE business_id = $1::uuid`,
      [businessId]
    );

    // Total commitments: prefer actual LP commitments, fall back to target_size
    const commitmentsRes = await pool.query(
      `SELECT
         COALESCE(
           (SELECT SUM(pc.committed_amount)
            FROM re_partner_commitment pc
            JOIN repe_fund f ON f.fund_id = pc.fund_id
            WHERE f.business_id = $1::uuid AND pc.status IN ('active', 'fully_called')
            HAVING COUNT(*) > 0),
           (SELECT SUM(target_size) FROM repe_fund WHERE business_id = $1::uuid)
         )::text AS total_commitments`,
      [businessId]
    );

    const warnings: string[] = [];

    // Check if partner commitments are incomplete (fewer funds with commitments than total funds)
    const commitCountRes = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT pc.fund_id)
          FROM re_partner_commitment pc
          JOIN repe_fund f ON f.fund_id = pc.fund_id
          WHERE f.business_id = $1::uuid AND pc.status IN ('active', 'fully_called'))::int AS funds_with_commitments,
         (SELECT COUNT(*) FROM repe_fund WHERE business_id = $1::uuid)::int AS total_funds`,
      [businessId]
    );
    const fwc = commitCountRes.rows[0]?.funds_with_commitments ?? 0;
    const tf = commitCountRes.rows[0]?.total_funds ?? 0;
    if (fwc > 0 && fwc < tf) {
      warnings.push(`Partner commitments incomplete: ${fwc} of ${tf} funds have LP commitment data`);
    }

    // Portfolio metrics from fund quarter states using DISTINCT ON per fund (latest row wins)
    // Aligned with Python backend: excludes NULL IRR from weighted average, no COALESCE to 0
    const metricsQuery = `
      WITH latest_state AS (
        SELECT DISTINCT ON (si.fund_id)
          si.fund_id,
          si.portfolio_nav,
          si.gross_irr,
          si.net_irr,
          si.weighted_dscr,
          si.weighted_ltv,
          si.total_committed,
          si.total_called
        FROM re_fund_quarter_state si
        JOIN repe_fund f ON f.fund_id = si.fund_id
        WHERE f.business_id = $1::uuid
          AND si.quarter = $2
          AND si.scenario_id IS NULL
        ORDER BY si.fund_id, si.created_at DESC
      )
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE COALESCE(SUM(portfolio_nav), 0)::text
        END AS portfolio_nav,

        -- NAV-weighted gross IRR: exclude funds with NULL IRR (not COALESCE to 0)
        (SELECT (SUM(s.gross_irr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0))::text
         FROM latest_state s
         WHERE s.gross_irr IS NOT NULL AND s.portfolio_nav > 0
        ) AS gross_irr,

        -- NAV-weighted net IRR: same pattern
        (SELECT (SUM(s.net_irr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0))::text
         FROM latest_state s
         WHERE s.net_irr IS NOT NULL AND s.portfolio_nav > 0
        ) AS net_irr,

        -- NAV-weighted DSCR: exclude NULL
        (SELECT (SUM(s.weighted_dscr * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0))::text
         FROM latest_state s
         WHERE s.weighted_dscr IS NOT NULL AND s.portfolio_nav > 0
        ) AS weighted_dscr,

        -- NAV-weighted LTV: exclude NULL
        (SELECT (SUM(s.weighted_ltv * s.portfolio_nav) / NULLIF(SUM(s.portfolio_nav), 0))::text
         FROM latest_state s
         WHERE s.weighted_ltv IS NOT NULL AND s.portfolio_nav > 0
        ) AS weighted_ltv,

        -- pct_invested: total_called / total_committed across all funds
        CASE WHEN SUM(total_committed) > 0
             THEN (SUM(total_called) / SUM(total_committed))::text
             ELSE NULL
        END AS pct_invested

      FROM latest_state`;

    let metricsRes = await pool.query(metricsQuery, [businessId, quarter]);
    let effectiveQuarter = quarter;

    // If no NAV for the requested quarter, fall back to the most recent available quarter
    const navValue = metricsRes.rows[0]?.portfolio_nav;
    if (!navValue || navValue === "0") {
      const fallbackRes = await pool.query(
        `SELECT quarter FROM re_fund_quarter_state
         WHERE fund_id IN (SELECT fund_id FROM repe_fund WHERE business_id = $1::uuid)
           AND scenario_id IS NULL
         ORDER BY quarter DESC LIMIT 1`,
        [businessId]
      );
      const fallbackQuarter = fallbackRes.rows[0]?.quarter;
      if (fallbackQuarter && fallbackQuarter !== quarter) {
        metricsRes = await pool.query(metricsQuery, [businessId, fallbackQuarter]);
        effectiveQuarter = fallbackQuarter;
        warnings.push(`No data for ${quarter}; showing ${fallbackQuarter}`);
      } else {
        warnings.push(`No portfolio NAV found for ${quarter}. Run a quarter close to compute.`);
      }
    }

    // Active assets count: aligned with Python backend _ACTIVE_STATUS_SQL
    // Includes held, lease_up, operating (not just 'active')
    // Filters to asset_type = 'property' (excludes CMBS/loan assets)
    const assetsRes = await pool.query(
      `SELECT COUNT(*)::int AS active_assets
       FROM repe_asset a
       JOIN repe_deal d ON d.deal_id = a.deal_id
       JOIN repe_fund f ON f.fund_id = d.fund_id
       WHERE f.business_id = $1::uuid
         AND (a.asset_status IS NULL OR a.asset_status IN ('active', 'held', 'lease_up', 'operating'))
         AND a.asset_type = 'property'`,
      [businessId]
    );

    const portfolioNav = metricsRes.rows[0]?.portfolio_nav;

    return Response.json({
      env_id: params.envId,
      business_id: businessId,
      quarter,
      effective_quarter: effectiveQuarter,
      fund_count: fundsRes.rows[0]?.fund_count || 0,
      total_commitments: commitmentsRes.rows[0]?.total_commitments || "0",
      portfolio_nav: portfolioNav !== "0" ? portfolioNav : null,
      gross_irr: metricsRes.rows[0]?.gross_irr ?? null,
      net_irr: metricsRes.rows[0]?.net_irr ?? null,
      weighted_dscr: metricsRes.rows[0]?.weighted_dscr ?? null,
      weighted_ltv: metricsRes.rows[0]?.weighted_ltv ?? null,
      pct_invested: metricsRes.rows[0]?.pct_invested ?? null,
      active_assets: assetsRes.rows[0]?.active_assets || 0,
      warnings,
    });
  } catch (err) {
    console.error("[re/v2/environments/[envId]/portfolio-kpis] DB error", err);
    return Response.json({
      env_id: params.envId,
      business_id: null,
      quarter,
      effective_quarter: quarter,
      fund_count: 0,
      total_commitments: "0",
      portfolio_nav: null,
      gross_irr: null,
      net_irr: null,
      weighted_dscr: null,
      weighted_ltv: null,
      pct_invested: null,
      active_assets: 0,
      warnings: [String(err)],
    });
  }
}
