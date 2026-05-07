import type { ReV2AssetListItem } from "@/lib/bos-api";

export function getAssetDiagnostics(assets: ReV2AssetListItem[]): string[] {
  const negativeValue = assets.filter((a) => Number(a.latest_value) < 0).length;
  const nullOccupancy = assets.filter((a) => a.latest_occupancy == null).length;
  const missingCanonicalMap = assets.filter((a) => !a.fund_id || !a.investment_id).length;
  const dscrUnavailable = assets.length;
  return [
    negativeValue
      ? `${negativeValue} asset${negativeValue === 1 ? "" : "s"} with negative value/NAV proxy`
      : null,
    nullOccupancy
      ? `${nullOccupancy} asset${nullOccupancy === 1 ? "" : "s"} missing occupancy`
      : null,
    missingCanonicalMap
      ? `${missingCanonicalMap} asset${missingCanonicalMap === 1 ? "" : "s"} missing canonical fund/investment mapping`
      : null,
    dscrUnavailable
      ? "DSCR is not returned by the Assets list API; row-level DSCR requires authoritative asset-state diagnostics"
      : null,
  ].filter((item): item is string => Boolean(item));
}
