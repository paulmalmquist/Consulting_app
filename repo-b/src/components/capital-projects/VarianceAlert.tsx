"use client";

import { cn } from "@/lib/cn";
import type { DrawVarianceFlag } from "@/types/capital-projects";

function severityStyles(severity: string) {
  switch (severity) {
    case "critical": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    case "warning": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    default: return "border-blue-500/50 bg-blue-500/10 text-blue-300";
  }
}

export function VarianceAlert({ flags }: { flags: DrawVarianceFlag[] }) {
  if (!flags || flags.length === 0) return null;

  const criticals = flags.filter(f => f.severity === "critical");
  const warnings = flags.filter(f => f.severity === "warning");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-bm-text">
          {flags.length} variance flag{flags.length > 1 ? "s" : ""}
        </span>
        {criticals.length > 0 && (
          <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">
            {criticals.length} critical
          </span>
        )}
        {warnings.length > 0 && (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
            {warnings.length} warning
          </span>
        )}
      </div>
      <div className="space-y-1">
        {flags.map((flag, i) => (
          <div key={i} className={cn("rounded-lg border px-3 py-2 text-xs", severityStyles(flag.severity))}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono font-bold uppercase">{flag.severity}</span>
                {flag.cost_code && <span className="ml-2 font-mono opacity-75">[{flag.cost_code}]</span>}
                <p className="mt-0.5">{flag.message}</p>
              </div>
              <span className="shrink-0 font-mono font-medium">
                ${Number(flag.amount_at_risk).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
