"use client";

/**
 * DiagnosticsPanel — REPE Fund Portfolio
 *
 * Renders excluded funds with reason codes. NOT a metrics surface — this is a
 * roll-call: fund name, exclusion_reason badge, fund_id, snapshot_id (if any),
 * promotion_state, and any null_reasons carried by the latest snapshot.
 *
 * Quarantined / archived / draft-only / scope-incomplete funds appear here and
 * are explicitly excluded from the primary fund table. The contract is:
 *   - rows in this panel must NEVER appear as primary table rows
 *   - rows here must NEVER contribute to portfolio_summary aggregates
 *
 * Plan: audit/fund_portfolio_coherence/gap_report.md.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { FundDiagnosticEntry, FundExclusionReason } from "@/lib/bos-api";

const REASON_BADGE: Record<string, { label: string; color: string }> = {
  quarantined: {
    label: "Quarantined",
    color: "bg-red-900/40 text-red-300 border border-red-800/50",
  },
  archived: {
    label: "Archived",
    color: "bg-slate-800/60 text-slate-300 border border-slate-700/60",
  },
  draft_only: {
    label: "Draft only",
    color: "bg-amber-900/40 text-amber-300 border border-amber-800/50",
  },
  no_released_snapshot: {
    label: "No released snapshot",
    color: "bg-amber-900/40 text-amber-300 border border-amber-800/50",
  },
  scope_incomplete: {
    label: "Scope incomplete",
    color: "bg-amber-900/40 text-amber-300 border border-amber-800/50",
  },
};

function reasonBadge(reason: FundExclusionReason | string) {
  const cfg = REASON_BADGE[reason] ?? {
    label: reason,
    color: "bg-slate-800/60 text-slate-300 border border-slate-700/60",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export interface DiagnosticsPanelProps {
  diagnostics: FundDiagnosticEntry[];
  defaultOpen?: boolean;
}

export default function DiagnosticsPanel({
  diagnostics,
  defaultOpen = false,
}: DiagnosticsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (diagnostics.length === 0) return null;

  return (
    <section
      data-testid="diagnostics-panel"
      className="rounded-lg border border-amber-800/40 bg-amber-950/10"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-amber-400/80" />
          ) : (
            <ChevronRight size={14} className="text-amber-400/80" />
          )}
          <AlertTriangle size={14} className="text-amber-400/80" />
          <span className="text-sm font-semibold text-amber-200">
            Excluded records
          </span>
          <span className="text-xs text-amber-400/80">
            {diagnostics.length} fund{diagnostics.length === 1 ? "" : "s"} not
            counted in headline metrics
          </span>
        </div>
        <span className="text-[10px] text-amber-400/60 font-mono">
          {open ? "click to collapse" : "click to expand"}
        </span>
      </button>

      {open && (
        <div className="border-t border-amber-800/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-amber-800/30 bg-amber-950/20">
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-amber-300/80">
                  Fund
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-amber-300/80">
                  Reason
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-amber-300/80">
                  Latest snapshot
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-amber-300/80">
                  Fund ID
                </th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.map((d) => (
                <tr
                  key={d.fund_id}
                  data-testid={`diagnostics-row-${d.exclusion_reason}`}
                  data-fund-id={d.fund_id}
                  className="border-b border-amber-800/15 hover:bg-amber-950/15"
                >
                  <td className="px-3 py-2 text-bm-text">
                    <span data-testid="diagnostics-fund-name">{d.fund_name}</span>
                    {d.status && (
                      <span className="ml-2 text-[10px] text-amber-400/60 uppercase font-mono">
                        {d.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{reasonBadge(d.exclusion_reason)}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-amber-300/80">
                    {d.latest_quarter ? (
                      <span>
                        {d.latest_quarter}{" "}
                        <span className="text-amber-400/50">
                          ({d.latest_promotion_state ?? "—"})
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-400/50">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-amber-400/60 break-all">
                    {d.fund_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
