"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/format-utils";
import type { BaseScenarioAssetContribution } from "@/lib/bos-api";

type SortKey = "asset_name" | "property_type" | "market" | "ownership_percent" | "attributable_nav" | "attributable_noi" | "current_value_contribution";

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-400",
  disposed: "bg-zinc-400",
  pipeline: "bg-blue-400",
};

export function AssetContributionTable({
  assets,
  onAssetClick,
}: {
  assets: BaseScenarioAssetContribution[];
  onAssetClick?: (assetId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("attributable_nav");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...assets];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [assets, sortKey, sortAsc]);

  const totalNav = assets.reduce((sum, a) => sum + a.attributable_nav, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="text-right font-medium py-2 cursor-pointer select-none hover:text-bm-text"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && <ArrowUpDown size={10} />}
      </span>
    </th>
  );

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
      <div className="flex items-center justify-between px-4 py-3 border-b border-bm-border/30">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          Asset Contribution to Fund
        </h3>
        <span className="text-xs text-bm-muted2">
          {assets.length} asset{assets.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-bm-muted border-b border-bm-border/20">
              <th
                className="text-left font-medium py-2 pl-4 cursor-pointer select-none hover:text-bm-text"
                onClick={() => toggleSort("asset_name")}
              >
                <span className="inline-flex items-center gap-1">
                  Asset
                  {sortKey === "asset_name" && <ArrowUpDown size={10} />}
                </span>
              </th>
              <SortHeader label="Type" field="property_type" />
              <SortHeader label="Market" field="market" />
              <SortHeader label="Own%" field="ownership_percent" />
              <SortHeader label="Attr. NAV" field="attributable_nav" />
              <SortHeader label="Attr. NOI" field="attributable_noi" />
              <SortHeader label="Value Contrib." field="current_value_contribution" />
              <th className="w-6 py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset) => {
              const navPct = totalNav > 0 ? asset.attributable_nav / totalNav : 0;
              return (
                <tr
                  key={asset.asset_id}
                  onClick={() => onAssetClick?.(asset.asset_id)}
                  className={`border-t border-bm-border/10 transition-colors ${
                    onAssetClick ? "cursor-pointer hover:bg-bm-surface/20" : ""
                  }`}
                >
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[asset.status_category] ?? "bg-zinc-400"}`} />
                      <span className="font-medium text-bm-text">{asset.asset_name}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-bm-muted">
                      {asset.investment_name}
                    </div>
                  </td>
                  <td className="text-right text-bm-muted2 capitalize">
                    {asset.property_type ?? "—"}
                  </td>
                  <td className="text-right text-bm-muted2">
                    {asset.market ?? asset.city ?? "—"}
                  </td>
                  <td className="text-right text-bm-muted2">
                    {fmtPct(asset.ownership_percent)}
                  </td>
                  <td className="text-right font-medium text-bm-text">
                    {fmtMoney(asset.attributable_nav)}
                    <div className="text-[9px] text-bm-muted">{fmtPct(navPct)} of fund</div>
                  </td>
                  <td className="text-right text-bm-muted2">
                    {fmtMoney(asset.attributable_noi)}
                  </td>
                  <td className="text-right">
                    <span
                      className={`font-medium ${
                        asset.current_value_contribution >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {fmtMoney(asset.current_value_contribution)}
                    </span>
                  </td>
                  <td className="pr-4">
                    {onAssetClick && (
                      <ChevronRight size={12} className="text-bm-muted" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {assets.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-bm-muted2">
          No assets in this scenario. Add assets to see their contribution to fund performance.
        </div>
      )}
    </div>
  );
}
