"use client";

import Link from "next/link";
import {
  reIndexTableShellClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableBodyClass,
  reIndexTableRowClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
  reIndexNumericCellClass,
} from "@/components/repe/RepeIndexScaffold";
import type { DevProjectRow } from "@/lib/bos-api";
import { cn } from "@/lib/cn";

const healthBadge: Record<string, { bg: string; text: string; label: string }> = {
  on_track: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "On Track" },
  at_risk: { bg: "bg-amber-500/15", text: "text-amber-400", label: "At Risk" },
  delayed: { bg: "bg-red-500/15", text: "text-red-400", label: "Delayed" },
};

const linkTypeBadge: Record<string, string> = {
  ground_up: "Ground-Up",
  major_renovation: "Major Reno",
  value_add: "Value-Add",
  repositioning: "Repositioning",
};

function fmtMoney(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function DevProjectTable({
  projects,
  basePath,
}: {
  projects: DevProjectRow[];
  basePath: string;
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] px-8 py-16 text-center">
        <p className="text-sm text-bm-muted2">
          No development projects linked to REPE assets.
        </p>
      </div>
    );
  }

  return (
    <div className={reIndexTableShellClass}>
      <table className={reIndexTableClass}>
        <thead>
          <tr className={reIndexTableHeadRowClass}>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3 text-right">Budget</th>
            <th className="px-4 py-3 text-right">Complete</th>
            <th className="px-4 py-3">Health</th>
            <th className="px-4 py-3 text-right">YOC</th>
            <th className="px-4 py-3 text-right">IRR</th>
          </tr>
        </thead>
        <tbody className={reIndexTableBodyClass}>
          {projects.map((p) => {
            const h = healthBadge[p.health] ?? healthBadge.on_track;
            return (
              <tr key={p.link_id} className={reIndexTableRowClass}>
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/${p.link_id}`}
                    className={reIndexPrimaryCellClass}
                  >
                    {p.project_name}
                  </Link>
                </td>
                <td className={cn("px-4 py-3", reIndexSecondaryCellClass)}>
                  {p.asset_name}
                </td>
                <td className={cn("px-4 py-3", reIndexSecondaryCellClass)}>
                  {linkTypeBadge[p.link_type] ?? p.link_type}
                </td>
                <td className={cn("px-4 py-3", reIndexSecondaryCellClass)}>
                  {p.market ?? "—"}
                </td>
                <td className={cn("px-4 py-3", reIndexNumericCellClass)}>
                  {fmtMoney(p.total_development_cost)}
                </td>
                <td className={cn("px-4 py-3", reIndexNumericCellClass)}>
                  {parseFloat(p.percent_complete).toFixed(0)}%
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium", h.bg, h.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", h.text.replace("text-", "bg-"))} />
                    {h.label}
                  </span>
                </td>
                <td className={cn("px-4 py-3", reIndexNumericCellClass)}>
                  {fmtPct(p.yield_on_cost)}
                </td>
                <td className={cn("px-4 py-3", reIndexNumericCellClass)}>
                  {fmtPct(p.projected_irr)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
