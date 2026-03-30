import { getFundChainValidation } from "@/lib/server/reFundChainValidation";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/funds/[fundId]/chain-validation
 *
 * End-to-end validation report: Asset → JV → Investment → Fund → LP/GP Waterfall.
 *
 * Query params:
 *   asset_id  — UUID of the asset to trace (defaults to golden-path asset)
 *   quarter   — terminal quarter for waterfall (defaults to 2026Q4)
 *
 * Returns a structured report with:
 *   1. Asset CF bridge (per-period)
 *   2. JV ownership split
 *   3. Fund cash flow allocation
 *   4. Fee drag (gross-to-net bridge)
 *   5. Waterfall tier audit (LP/GP split)
 *   6. Return metrics (IRR, TVPI, DPI, RVPI, NAV)
 *   7. Reconciliation assertions (pass/fail)
 *
 * Golden-path expected values (from 432_re_golden_path_seed.sql):
 *   total_operating_ncf = 334,343
 *   fund_share (80%)    = 267,474 (operating)
 *   sale_net_proceeds   = 4,690,656
 *   fund_sale_share     = 3,752,525
 *   total_equity_distrib= 5,024,999
 *   TVPI (asset level)  = 1.38x
 */

export async function GET(
  request: Request,
  { params }: { params: { fundId: string } }
) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get("asset_id") || undefined;
  const terminalQuarter = searchParams.get("quarter") || "2026Q4";
  const fundId = params.fundId;

  try {
    const payload = await getFundChainValidation(fundId, assetId, terminalQuarter);
    if (!payload) return Response.json({ error: "DB not configured" }, { status: 503 });
    if ("error" in payload) return Response.json({ error: payload.error }, { status: payload.status });
    return Response.json(payload);
  } catch (err) {
    console.error("[re/v2/funds/chain-validation] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
