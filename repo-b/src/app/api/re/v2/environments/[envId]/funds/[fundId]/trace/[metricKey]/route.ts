import { NextRequest, NextResponse } from "next/server";

import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * GET /api/re/v2/environments/[envId]/funds/[fundId]/trace/[metricKey]
 *
 * Drill-through for a fund-level metric. Backed by:
 *   - re_trace_gate.assert_fund_traceable (gate on re_fund_portfolio_included_v)
 *   - re_nav_trace.get_nav_trace        (metricKey = "nav")
 *   - re_irr_trace.get_irr_trace        (metricKey = "gross_irr")
 *
 * The route 404s if the fund is not in the canonical inclusion view for the
 * requested period or if no released snapshot exists.
 *
 * In Playwright bypass mode (PLAYWRIGHT_BYPASS_AUTH=1) returns a deterministic
 * synthetic payload keyed on the fund_ids used by the fund-portfolio stub.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { envId: string; fundId: string; metricKey: string } },
) {
  const url = new URL(req.url);
  const quarter = url.searchParams.get("quarter") ?? "2026Q2";
  const metric = params.metricKey.toLowerCase();

  if (metric !== "nav" && metric !== "gross_irr") {
    return NextResponse.json(
      {
        detail: {
          code: "metric_not_traceable",
          message: `Metric '${params.metricKey}' is not traceable. Supported: ["gross_irr","nav"].`,
        },
      },
      { status: 400 },
    );
  }

  if (process.env.PLAYWRIGHT_BYPASS_AUTH === "1") {
    return buildBypassResponse(params.envId, params.fundId, metric as "nav" | "gross_irr", quarter);
  }

  const target = `${FASTAPI_BASE}/api/re/v2/environments/${encodeURIComponent(
    params.envId,
  )}/funds/${encodeURIComponent(params.fundId)}/trace/${encodeURIComponent(metric)}?quarter=${encodeURIComponent(quarter)}`;

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
      { error: `Proxy error: ${message}`, env_id: params.envId, fund_id: params.fundId, metric, quarter },
      { status: 502 },
    );
  }
}

// ── Playwright stub ──────────────────────────────────────────────────────────
// Three included fund_ids match the fund-portfolio stub. A fourth, the
// quarantined fund_id from the diagnostics list, is used to simulate the 404.
// The IRR fixture for the third fund returns lineage_missing on purpose so the
// Playwright spec can assert that case end-to-end.

const INCLUDED_FUND_FIXTURES: Record<
  string,
  {
    name: string;
    audit_run_id: string;
    snapshot_version: string;
    fund_nav: string;
    gross_irr: string;
    cf_hash: string;
  }
> = {
  "a1b2c3d4-0001-0010-0001-000000000001": {
    name: "Meridian Real Estate Fund III",
    audit_run_id: "11111111-1111-1111-1111-000000000003",
    snapshot_version: "meridian-20260409T120000Z-mref3",
    fund_nav: "34300000",
    gross_irr: "0.18",
    cf_hash: "hash-mref3-20260409",
  },
  "a1b2c3d4-0002-0020-0001-000000000001": {
    name: "Meridian Credit Opportunities Fund I",
    audit_run_id: "11111111-1111-1111-1111-000000000004",
    snapshot_version: "meridian-20260409T120000Z-mcof1",
    fund_nav: "116700000",
    gross_irr: "0.12",
    cf_hash: "hash-mcof1-20260409",
  },
  "a1b2c3d4-0003-0030-0001-000000000001": {
    name: "IGF VII",
    audit_run_id: "11111111-1111-1111-1111-000000000007",
    snapshot_version: "meridian-20260409T120000Z-igf7",
    fund_nav: "1200000000",
    gross_irr: "0.534",
    cf_hash: "", // intentionally missing — exercises the lineage_missing path
  },
};

function buildBypassResponse(
  envId: string,
  fundId: string,
  metric: "nav" | "gross_irr",
  quarter: string,
) {
  const fixture = INCLUDED_FUND_FIXTURES[fundId];
  if (!fixture) {
    return NextResponse.json(
      {
        detail: {
          code: "fund_not_traceable",
          message:
            "Fund is not in the canonical fund-portfolio inclusion view for the requested env/business/quarter.",
          env_id: envId,
          fund_id: fundId,
          quarter,
        },
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  if (metric === "nav") {
    return NextResponse.json(buildNavStub(fundId, fixture, quarter), {
      headers: { "cache-control": "no-store" },
    });
  }
  return NextResponse.json(buildIrrStub(fundId, fixture, quarter), {
    headers: { "cache-control": "no-store" },
  });
}

function buildNavStub(
  fundId: string,
  fx: (typeof INCLUDED_FUND_FIXTURES)[string],
  quarter: string,
) {
  const fundNav = Number(fx.fund_nav);
  const splits = [0.55, 0.3, 0.15];
  const assetRows = splits.map((pct, i) => {
    const nav = (fundNav * pct).toFixed(2);
    return {
      asset_id: `${fundId.slice(0, 8)}-asset-${i + 1}`,
      asset_name: `Asset ${i + 1}`,
      investment_id: `${fundId.slice(0, 8)}-inv-${(i % 2) + 1}`,
      investment_name: `Investment ${(i % 2) + 1}`,
      ending_nav: nav,
      ownership_pct: "1.0",
      fund_attributed_nav: nav,
      trust_status: "trusted",
      null_reasons: {},
      source_table: "re_authoritative_asset_state_qtr",
      audit_run_id: fx.audit_run_id,
    };
  });
  const sum = assetRows
    .map((r) => Number(r.fund_attributed_nav))
    .reduce((a, b) => a + b, 0);
  const delta = fundNav - sum;
  return {
    fund_id: fundId,
    fund_name: fx.name,
    quarter,
    audit_run_id: fx.audit_run_id,
    snapshot_version: fx.snapshot_version,
    fund_nav: fx.fund_nav,
    asset_rows: assetRows,
    reconciliation: {
      fund_nav: fx.fund_nav,
      asset_sum: sum.toFixed(2),
      delta: delta.toFixed(2),
      soft_tolerance: "1.00",
      hard_tolerance: Math.max(1, fundNav * 0.0001).toFixed(2),
      soft_pass: Math.abs(delta) <= 1,
      hard_pass: Math.abs(delta) <= Math.max(1, fundNav * 0.0001),
      status: Math.abs(delta) <= 1 ? "reconciled" : "soft_fail",
    },
    null_reason: null,
    provenance: {
      source_table: "re_authoritative_asset_state_qtr",
      scope: "audit_run_id = fund_snapshot.audit_run_id",
      asset_count: assetRows.length,
      contributing_asset_count: assetRows.length,
    },
  };
}

function buildIrrStub(
  fundId: string,
  fx: (typeof INCLUDED_FUND_FIXTURES)[string],
  quarter: string,
) {
  // The IGF VII fixture has cf_hash = "" → exercise lineage_missing path.
  if (!fx.cf_hash) {
    return {
      fund_id: fundId,
      fund_name: fx.name,
      quarter,
      audit_run_id: fx.audit_run_id,
      snapshot_version: fx.snapshot_version,
      snapshot_gross_irr: fx.gross_irr,
      cf_rows: [],
      reconciliation: {
        snapshot_gross_irr: fx.gross_irr,
        recomputed_irr: null,
        delta_bps: null,
        soft_tolerance_bps: "0.0001",
        hard_tolerance_bps: "1",
        soft_pass: null,
        hard_pass: null,
        status: "lineage_missing",
        lineage_note:
          "Fund snapshot is missing a cf_series_hash, or provenance and inputs_hash disagree.",
      },
      null_reason: "source_lineage_missing",
      provenance: {
        source_table: "re_investment_cf_series_mat",
        scope: "source_hash = fund_snapshot.provenance[0].cf_series_hash",
        matched_row_count: 0,
        lineage_status: "lineage_missing",
      },
    };
  }

  const cfRows = [
    {
      investment_id: `${fundId.slice(0, 8)}-inv-1`,
      investment_name: "Investment 1",
      quarter: "2024Q2",
      quarter_end_date: "2024-06-30",
      cash_flow_base: "-50000000",
      asset_contributions: [],
      source_hash: fx.cf_hash,
      source_table: "re_investment_cf_series_mat",
    },
    {
      investment_id: `${fundId.slice(0, 8)}-inv-2`,
      investment_name: "Investment 2",
      quarter: "2025Q4",
      quarter_end_date: "2025-12-31",
      cash_flow_base: "-30000000",
      asset_contributions: [],
      source_hash: fx.cf_hash,
      source_table: "re_investment_cf_series_mat",
    },
    {
      investment_id: `${fundId.slice(0, 8)}-inv-1`,
      investment_name: "Investment 1",
      quarter: "2026Q2",
      quarter_end_date: "2026-06-30",
      cash_flow_base: "100000000",
      asset_contributions: [],
      source_hash: fx.cf_hash,
      source_table: "re_investment_cf_series_mat",
    },
  ];

  return {
    fund_id: fundId,
    fund_name: fx.name,
    quarter,
    audit_run_id: fx.audit_run_id,
    snapshot_version: fx.snapshot_version,
    snapshot_gross_irr: fx.gross_irr,
    cf_rows: cfRows,
    reconciliation: {
      snapshot_gross_irr: fx.gross_irr,
      recomputed_irr: fx.gross_irr,
      delta_bps: "0",
      soft_tolerance_bps: "0.0001",
      hard_tolerance_bps: "1",
      soft_pass: true,
      hard_pass: true,
      status: "reconciled",
      lineage_note: null,
    },
    null_reason: null,
    provenance: {
      source_table: "re_investment_cf_series_mat",
      scope: "source_hash = fund_snapshot.provenance[0].cf_series_hash",
      cf_series_hash: fx.cf_hash,
      matched_row_count: cfRows.length,
      candidate_row_count: cfRows.length,
      investment_count: 2,
      lineage_status: "verified",
    },
  };
}
