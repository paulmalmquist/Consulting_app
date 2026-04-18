"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchToolingMom } from "@/lib/accounting-api";

export type TrendsBandProps = {
  envId: string;
  businessId?: string;
};

type MomRow = { month: string; total_spend: string | number | null };

function fmtMonth(s: string): string {
  return s.slice(0, 7); // YYYY-MM
}

export default function TrendsBand({ envId, businessId }: TrendsBandProps) {
  const [rows, setRows] = useState<MomRow[]>([]);

  useEffect(() => {
    fetchToolingMom({ envId, businessId, months: 6 })
      .then((r) => setRows(r.rows as MomRow[]))
      .catch(() => setRows([]));
  }, [envId, businessId]);

  const max = useMemo(() => {
    return rows.reduce((m, r) => Math.max(m, Number(r.total_spend ?? 0)), 0) || 1;
  }, [rows]);

  return (
    <div className="grid h-[180px] flex-none grid-cols-1 gap-2 border-t border-slate-800 bg-slate-950 p-3 md:grid-cols-3">
      <Panel title="Tooling Spend (6 mo)" testId="trends-tooling">
        <div className="flex h-full items-end gap-2 pt-2">
          {rows.length === 0 ? (
            <span className="m-auto font-mono text-[11px] text-slate-500">awaiting data</span>
          ) : (
            rows.map((r, i) => {
              const v = Number(r.total_spend ?? 0);
              const h = Math.max(4, (v / max) * 100);
              const current = i === rows.length - 1;
              return (
                <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-sm ${current ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" : "bg-slate-600"}`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="font-mono text-[9px] text-slate-500">{fmtMonth(r.month)}</span>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <Panel title="Expense by Category" testId="trends-category">
        <div className="m-auto font-mono text-[11px] text-slate-500">
          wired once expense drafts are confirmed
        </div>
      </Panel>

      <Panel title="Cash Movement" testId="trends-cash">
        <div className="m-auto font-mono text-[11px] text-slate-500">
          requires transaction import (phase 2)
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col rounded border border-slate-800 bg-slate-900/40"
      data-testid={testId}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400/60 via-transparent to-transparent" />
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">expand</span>
      </div>
      <div className="flex-1 overflow-hidden px-3 pb-2">{children}</div>
    </div>
  );
}
