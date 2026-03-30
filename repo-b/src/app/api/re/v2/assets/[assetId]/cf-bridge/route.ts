import { getAssetCashFlowBridge } from "@/lib/server/reAssetCashFlowBridge";

export const runtime = "nodejs";

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: { Allow: "GET, OPTIONS" } });
}

/**
 * GET /api/re/v2/assets/[assetId]/cf-bridge
 *
 * Returns the complete cash flow bridge for an asset across all available quarters.
 * Each row traces: Revenue → OpEx → NOI → CapEx → TI/LC → Reserves → Debt Service → NCF
 *
 * Used by the golden-path validation harness to prove the asset-level math.
 * For the golden path asset (Gateway Industrial Center), all values are locked;
 * any row where reconciles=false is a data integrity failure.
 */
export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } }
) {
  const { assetId } = params;

  try {
    const payload = await getAssetCashFlowBridge(assetId);
    if (!payload) return Response.json({ error: "DB not configured" }, { status: 503 });
    return Response.json(payload);
  } catch (err) {
    console.error("[re/v2/assets/cf-bridge] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
