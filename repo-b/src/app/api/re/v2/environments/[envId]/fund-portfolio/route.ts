import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * GET /api/re/v2/environments/[envId]/fund-portfolio?quarter=
 *
 * Proxies to FastAPI backend's coherent fund portfolio endpoint. Returns a
 * single canonical payload (portfolio_summary + fund_rows + diagnostics +
 * provenance) used by the Fund Portfolio page. See plan at
 * audit/fund_portfolio_coherence/gap_report.md.
 *
 * In Playwright bypass mode (PLAYWRIGHT_BYPASS_AUTH=1) returns a deterministic
 * synthetic payload. The test fixture is keyed on the Meridian env_id and
 * mirrors the post-migration-463 state: 3 included funds, 2 quarantined.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { envId: string } },
) {
  const url = new URL(req.url);
  const quarter = url.searchParams.get("quarter");

  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return NextResponse.json(
      buildPlaywrightStubPayload(params.envId, quarter ?? "2026Q2"),
      { headers: { "cache-control": "no-store" } },
    );
  }

  const forwardedParams = new URLSearchParams();
  if (quarter) forwardedParams.set("quarter", quarter);

  const target = `${FASTAPI_BASE}/api/re/v2/environments/${encodeURIComponent(
    params.envId,
  )}/fund-portfolio${
    forwardedParams.toString() ? `?${forwardedParams.toString()}` : ""
  }`;

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        ...(await buildPlatformSessionHeaders(req)),
      },
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach backend";
    return NextResponse.json(
      { error: `Proxy error: ${message}`, env_id: params.envId, quarter },
      { status: 502 },
    );
  }
}

// ── Playwright stub payload ──────────────────────────────────────────────────
// Synthetic portfolio that mirrors the Meridian post-migration-463 state.
// Three included funds (released), two excluded (quarantined). NAV reconciles
// exactly. Used only when PLAYWRIGHT_BYPASS_AUTH=1.

function buildPlaywrightStubPayload(envId: string, quarter: string) {
  const businessId = "b1b2c3d4-0001-0001-0001-000000000001";

  const included = [
    {
      fund_id: "a1b2c3d4-0001-0010-0001-000000000001",
      name: "Meridian Real Estate Fund III",
      vintage_year: 2019,
      fund_type: "closed_end",
      strategy: "equity",
      sub_strategy: null,
      target_size: "750000000",
      status: "investing",
      base_currency: "USD",
      inception_date: null,
      env_id: envId,
      quarter,
      snapshot_version: "meridian-20260409T120000Z-mref3",
      audit_run_id: "11111111-1111-1111-1111-000000000003",
      promotion_state: "released",
      trust_status: "trusted",
      breakpoint_layer: null,
      portfolio_nav: "34300000",
      total_committed: "750000000",
      total_called: "525000000",
      total_distributed: "180000000",
      gross_irr: "0.18",
      net_irr: "0.16",
      dpi: "0.34",
      rvpi: "0.07",
      tvpi: "0.41",
      weighted_dscr: { value: "1.45", provenance: "legacy_quarter_state", null_reason: null },
      weighted_ltv: { value: "0.62", provenance: "legacy_quarter_state", null_reason: null },
      null_reasons: {},
      canonical_metrics_excerpt: { asset_count: 12, investment_count: 5, scope: { scope_completeness: "complete" } },
    },
    {
      fund_id: "a1b2c3d4-0002-0020-0001-000000000001",
      name: "Meridian Credit Opportunities Fund I",
      vintage_year: 2020,
      fund_type: "closed_end",
      strategy: "debt",
      sub_strategy: null,
      target_size: "500000000",
      status: "investing",
      base_currency: "USD",
      inception_date: null,
      env_id: envId,
      quarter,
      snapshot_version: "meridian-20260409T120000Z-mcof1",
      audit_run_id: "11111111-1111-1111-1111-000000000004",
      promotion_state: "released",
      trust_status: "trusted",
      breakpoint_layer: null,
      portfolio_nav: "116700000",
      total_committed: "500000000",
      total_called: "350000000",
      total_distributed: "75000000",
      gross_irr: "0.12",
      net_irr: "0.105",
      dpi: "0.21",
      rvpi: "0.33",
      tvpi: "0.54",
      weighted_dscr: { value: "1.30", provenance: "legacy_quarter_state", null_reason: null },
      weighted_ltv: { value: "0.55", provenance: "legacy_quarter_state", null_reason: null },
      null_reasons: {},
      canonical_metrics_excerpt: { asset_count: 8, investment_count: 8, scope: { scope_completeness: "complete" } },
    },
    {
      fund_id: "a1b2c3d4-0003-0030-0001-000000000001",
      name: "IGF VII",
      vintage_year: 2018,
      fund_type: "closed_end",
      strategy: "equity",
      sub_strategy: null,
      target_size: "1500000000",
      status: "investing",
      base_currency: "USD",
      inception_date: null,
      env_id: envId,
      quarter,
      snapshot_version: "meridian-20260409T120000Z-igf7",
      audit_run_id: "11111111-1111-1111-1111-000000000007",
      promotion_state: "released",
      trust_status: "trusted",
      breakpoint_layer: null,
      portfolio_nav: "1200000000",
      total_committed: "1500000000",
      total_called: "1350000000",
      total_distributed: "650000000",
      gross_irr: "0.534",
      net_irr: "0.510",
      dpi: "0.48",
      rvpi: "0.89",
      tvpi: "1.37",
      weighted_dscr: { value: "1.55", provenance: "legacy_quarter_state", null_reason: null },
      weighted_ltv: { value: "0.58", provenance: "legacy_quarter_state", null_reason: null },
      null_reasons: {},
      canonical_metrics_excerpt: { asset_count: 32, investment_count: 14, scope: { scope_completeness: "complete" } },
    },
  ];

  const diagnostics = [
    {
      fund_id: "d4560000-0003-0030-0004-000000000001",
      fund_name: "[QUARANTINED] Meridian Real Estate Fund III",
      status: "closed",
      exclusion_reason: "quarantined",
      latest_quarter: null,
      latest_audit_run_id: null,
      latest_promotion_state: null,
      null_reasons: {},
      source_table: "repe_fund + re_authoritative_fund_state_qtr",
    },
    {
      fund_id: "d4560000-0003-0030-0005-000000000001",
      fund_name: "[QUARANTINED] Meridian Credit Opportunities Fund I",
      status: "closed",
      exclusion_reason: "quarantined",
      latest_quarter: null,
      latest_audit_run_id: null,
      latest_promotion_state: null,
      null_reasons: {},
      source_table: "repe_fund + re_authoritative_fund_state_qtr",
    },
  ];

  // NAV-weighted IRR computed deterministically from the fixture above.
  // gross_irr: (0.18*34.3M + 0.12*116.7M + 0.534*1200M) / (34.3M+116.7M+1200M)
  //         = (6.174M + 14.004M + 640.8M) / 1351M
  //         ≈ 0.4894 → "0.4894"
  const portfolioNav = 34300000 + 116700000 + 1200000000; // 1,351,000,000
  const grossWeighted = 0.18 * 34300000 + 0.12 * 116700000 + 0.534 * 1200000000;
  const netWeighted = 0.16 * 34300000 + 0.105 * 116700000 + 0.510 * 1200000000;
  const grossIrr = (grossWeighted / portfolioNav).toFixed(6);
  const netIrr = (netWeighted / portfolioNav).toFixed(6);
  const dscrWeighted = 1.45 * 34300000 + 1.30 * 116700000 + 1.55 * 1200000000;
  const weightedDscr = (dscrWeighted / portfolioNav).toFixed(6);

  return {
    env_id: envId,
    business_id: businessId,
    quarter,
    portfolio_summary: {
      fund_count: 3,
      diagnostics_count: 2,
      total_commitments: "2750000000",
      portfolio_nav: String(portfolioNav),
      active_assets: 52,
      gross_irr: grossIrr,
      net_irr: netIrr,
      weighted_dscr: { value: weightedDscr, provenance: "legacy_quarter_state", null_reason: null },
      nav_reconciliation: {
        displayed_fund_nav_sum: String(portfolioNav),
        portfolio_nav: String(portfolioNav),
        rounding_delta: "0",
        tolerance: "135100",
        status: "reconciled",
      },
      warnings: [
        "2 fund(s) excluded from investor-facing rollups. See diagnostics panel for fund_id and exclusion_reason.",
      ],
      null_reasons: {},
    },
    fund_rows: included,
    diagnostics,
    provenance: {
      irr_method: "nav_weighted_average",
      irr_method_n_funds: 3,
      irr_method_denominator_nav: String(portfolioNav),
      source_snapshots: included.map((f) => ({
        fund_id: f.fund_id,
        audit_run_id: f.audit_run_id,
        snapshot_version: f.snapshot_version,
        promotion_state: f.promotion_state,
        trust_status: f.trust_status,
      })),
      mixed_release_states: false,
      per_fund_snapshot_version: Object.fromEntries(included.map((f) => [f.fund_id, f.snapshot_version])),
      weighted_dscr_provenance: "legacy_quarter_state",
      weighted_ltv_provenance: "legacy_quarter_state",
    },
  };
}
