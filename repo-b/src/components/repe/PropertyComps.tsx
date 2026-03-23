"use client";

import { useState, useEffect } from "react";
import { getAssetComps, type PropertyComp } from "@/lib/bos-api";

type Props = {
  assetId: string;
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(2)}%`;
}

export function PropertyComps({ assetId }: Props) {
  const [comps, setComps] = useState<PropertyComp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "sale" | "lease">("all");

  useEffect(() => {
    setLoading(true);
    getAssetComps(assetId, filter === "all" ? undefined : filter)
      .then(setComps)
      .catch(() => setComps([]))
      .finally(() => setLoading(false));
  }, [assetId, filter]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading comps…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold">Property Comps</h4>
        <div className="flex gap-1">
          {(["all", "sale", "lease"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-xs rounded ${
                filter === f
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {comps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comps available.</p>
      ) : (
        <div className="border rounded overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Address</th>
                <th className="px-3 py-2 text-left">Submarket</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Sale Price</th>
                <th className="px-3 py-2 text-right">Cap Rate</th>
                <th className="px-3 py-2 text-right">$/SF</th>
                <th className="px-3 py-2 text-right">SF</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-1.5">{c.address || "—"}</td>
                  <td className="px-3 py-1.5">{c.submarket || "—"}</td>
                  <td className="px-3 py-1.5">{c.comp_type}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(c.sale_price)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtPct(c.cap_rate)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(c.price_per_sf)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {c.size_sf != null ? Number(c.size_sf).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-1.5">{c.source || "—"}</td>
                  <td className="px-3 py-1.5">{c.close_date || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
