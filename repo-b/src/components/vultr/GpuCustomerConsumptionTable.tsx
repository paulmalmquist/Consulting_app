"use client";

import type { GpuCustomerNode } from "@/lib/vultr-contracts";

interface Props {
  customers: GpuCustomerNode[];
  onSelectCustomer: (id: string) => void;
}

const SEGMENT_CHIP: Record<string, string> = {
  enterprise: "bg-violet-900/50 text-violet-200",
  smb: "bg-sky-900/50 text-sky-200",
  startup: "bg-emerald-900/50 text-emerald-200",
};

export function GpuCustomerConsumptionTable({ customers, onSelectCustomer }: Props) {
  const sorted = [...customers].sort(
    (a, b) => b.consumed_gpu_hours - a.consumed_gpu_hours,
  );

  return (
    <div className="overflow-hidden rounded border border-bm-divider/30">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bm-divider/20 text-left text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2 text-right">GPU-hr</th>
            <th className="px-3 py-2 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr
              key={c.customer_id}
              onClick={() => onSelectCustomer(c.customer_id)}
              className="cursor-pointer border-b border-bm-divider/10 transition-colors hover:bg-bm-bg-1/40 last:border-0"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] text-bm-muted2 w-4 text-right shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate max-w-[120px]">{c.name}</span>
                  {c.segment && (
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 text-[8px] uppercase tracking-wider ${
                        SEGMENT_CHIP[c.segment] ?? "bg-bm-bg-2/50 text-bm-muted2"
                      }`}
                    >
                      {c.segment}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {c.consumed_gpu_hours.toFixed(0)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-bm-muted2">
                {c.concentration_pct != null
                  ? `${c.concentration_pct.toFixed(1)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
