"use client";

import { useState, useEffect } from "react";
import {
  getCapitalSnapshots,
  computeCapitalSnapshots,
  type CapitalAccountSnapshot,
} from "@/lib/bos-api";
import { Button } from "@/components/ui/Button";

type Props = {
  fundId: string;
  quarter: string;
};

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMultiple(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(2)}x`;
}

export function LPBreakdown({ fundId, quarter }: Props) {
  const [snapshots, setSnapshots] = useState<CapitalAccountSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    setLoading(true);
    getCapitalSnapshots({ fund_id: fundId, quarter })
      .then((results) => {
        if (results.length === 0) {
          return computeCapitalSnapshots(fundId, quarter);
        }
        return results;
      })
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [fundId, quarter]);

  async function handleCompute() {
    setComputing(true);
    try {
      const result = await computeCapitalSnapshots(fundId, quarter);
      setSnapshots(result);
    } catch {
      // ignore
    } finally {
      setComputing(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading capital accounts…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Capital Account Snapshots — {quarter}</h4>
        <Button size="sm" variant="secondary" onClick={handleCompute} disabled={computing}>
          {computing ? "Computing…" : "Recompute"}
        </Button>
      </div>

      {snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No snapshots yet. Click Recompute to generate.
        </p>
      ) : (
        <div className="border rounded overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Partner</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Committed</th>
                <th className="px-3 py-2 text-right">Contributed</th>
                <th className="px-3 py-2 text-right">Distributed</th>
                <th className="px-3 py-2 text-right">NAV Share</th>
                <th className="px-3 py-2 text-right">DPI</th>
                <th className="px-3 py-2 text-right">RVPI</th>
                <th className="px-3 py-2 text-right">TVPI</th>
                <th className="px-3 py-2 text-right">Carry</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.partner_id} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{s.partner_name || s.partner_id}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        s.partner_type === "gp"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {(s.partner_type || "").toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(s.committed)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(s.contributed)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(s.distributed)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(s.nav_share)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMultiple(s.dpi)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMultiple(s.rvpi)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{fmtMultiple(s.tvpi)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(s.carry_allocation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
