"use client";

import type { OperatorSiteDecisionRisk } from "@/lib/bos-api";
import { SEVERITY_TONE } from "./tones";

function fmtBps(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v} bps IRR`;
}

export function RiskCard({
  risk,
  onAssign,
}: {
  risk: OperatorSiteDecisionRisk;
  onAssign: (risk: OperatorSiteDecisionRisk) => void;
}) {
  const assigned = Boolean(risk.context_task_id);
  return (
    <div
      className={`rounded-2xl border p-4 ${SEVERITY_TONE[risk.severity] || SEVERITY_TONE.amber}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                risk.severity === "red" ? "bg-red-400" : "bg-amber-400"
              }`}
              aria-hidden
            />
            <span className="text-[11px] uppercase tracking-[0.16em]">
              {risk.severity}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-bm-text">{risk.label}</p>
          <p className="mt-1 text-xs text-bm-muted2">{risk.required_action}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-semibold">
            {risk.irr_impact_bps == null ? "—" : fmtBps(risk.irr_impact_bps)}
          </div>
          {risk.null_reason ? (
            <div className="mt-0.5 text-[10px] text-bm-muted2">
              {risk.null_reason}
            </div>
          ) : null}
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-bm-muted2">
            confidence: {risk.confidence}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-bm-muted2">
        <div>
          <span className="font-medium text-bm-text">{risk.owner || "Unassigned"}</span>
          {risk.due_date ? <span> · due {risk.due_date}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => onAssign(risk)}
          disabled={assigned}
          className={`rounded-full border px-3 py-1 text-[11px] transition ${
            assigned
              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
              : "border-white/20 bg-white/5 text-bm-text hover:bg-white/10"
          }`}
        >
          {assigned ? `Assigned · ${String(risk.context_task_id).slice(0, 6)}` : "Assign diligence"}
        </button>
      </div>
    </div>
  );
}
