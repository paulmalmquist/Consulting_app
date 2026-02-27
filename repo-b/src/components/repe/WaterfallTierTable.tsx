"use client";

import { useState, useEffect } from "react";
import {
  getWaterfallBreakdown,
  type WaterfallBreakdown,
  type WaterfallTierAllocation,
} from "@/lib/bos-api";

type Props = {
  fundId: string;
  quarter: string;
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WaterfallTierTable({ fundId, quarter }: Props) {
  const [data, setData] = useState<WaterfallBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getWaterfallBreakdown({ fund_id: fundId, quarter })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [fundId, quarter]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading waterfall…</p>;
  if (!data || data.allocations.length === 0)
    return <p className="text-sm text-muted-foreground">No waterfall data for {quarter}.</p>;

  // Group by tier
  const tiers: Record<string, WaterfallTierAllocation[]> = {};
  for (const a of data.allocations) {
    if (!tiers[a.tier_name]) tiers[a.tier_name] = [];
    tiers[a.tier_name].push(a);
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Waterfall Breakdown — {quarter}</h4>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">Partner</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(tiers).map(([tierName, allocs]) =>
              allocs.map((a, i) => (
                <tr key={`${tierName}-${a.partner_name}`} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{i === 0 ? tierName : ""}</td>
                  <td className="px-3 py-1.5">{a.partner_name}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        a.partner_type === "gp"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {a.partner_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(a.amount)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
