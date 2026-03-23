"use client";

import { cn } from "@/lib/cn";

import { fmtDate, fmtMoney } from '@/lib/format-utils';
interface PdsExecution {
  project_name: string;
  project_type: string | null;
  stage: string;
  market: string | null;
  budget: string;
  percent_complete: string;
  start_date: string | null;
  planned_end_date: string | null;
  fee_type: string | null;
  fee_percentage: string | null;
}

const stageBadge: Record<string, { bg: string; text: string }> = {
  planning: { bg: "bg-slate-500/15", text: "text-slate-400" },
  preconstruction: { bg: "bg-blue-500/15", text: "text-blue-400" },
  procurement: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  construction: { bg: "bg-amber-500/15", text: "text-amber-400" },
  closeout: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  completed: { bg: "bg-green-500/15", text: "text-green-400" },
  active: { bg: "bg-indigo-500/15", text: "text-indigo-400" },
};

export function DevExecutionPanel({
  execution,
  asset,
}: {
  execution: PdsExecution;
  asset: { name: string | null; property_type: string | null; market: string | null; units: number | null };
}) {
  const stage = stageBadge[execution.stage] ?? stageBadge.active;
  const pctComplete = parseFloat(execution.percent_complete) || 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
        <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          PDS Execution
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-lg font-semibold text-bm-text">{execution.project_name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", stage.bg, stage.text)}>
                {execution.stage}
              </span>
              {execution.project_type && (
                <span className="text-xs text-bm-muted2">{execution.project_type}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Budget</p>
              <p className="text-sm font-medium text-bm-text">{fmtMoney(execution.budget)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Market</p>
              <p className="text-sm font-medium text-bm-text">{execution.market ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Start</p>
              <p className="text-sm font-medium text-bm-text">{fmtDate(execution.start_date)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Target End</p>
              <p className="text-sm font-medium text-bm-text">{fmtDate(execution.planned_end_date)}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2">Progress</p>
              <p className="text-xs font-medium text-bm-text">{pctComplete.toFixed(0)}%</p>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bm-surface/30">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(pctComplete, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Linked Asset Card */}
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-5">
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Linked Asset
        </h3>
        <p className="text-sm font-semibold text-bm-text">{asset.name ?? "—"}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-bm-muted2">
          {asset.property_type && <span>{asset.property_type}</span>}
          {asset.market && <span>{asset.market}</span>}
          {asset.units && <span>{asset.units} units</span>}
        </div>
      </div>
    </div>
  );
}
