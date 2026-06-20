"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-800 text-neutral-300",
  needs_evidence: "bg-amber-500/15 text-amber-200",
  needs_review: "bg-sky-500/15 text-sky-200",
  approved: "bg-emerald-500/15 text-emerald-200",
  rejected: "bg-rose-500/15 text-rose-200",
  superseded: "bg-neutral-700 text-neutral-300",
  promoted: "bg-violet-500/15 text-violet-200",
};

export function PromotionCandidateQueue({
  candidates, selectedId, onSelect,
}: {
  candidates: PromotionCandidate[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div data-testid="hr-queue-empty" className="rounded border border-neutral-800 bg-neutral-900/60 p-4 text-xs text-neutral-400">
        No promotion candidates yet. Feature-store observations remain separate from historical episodes until a reviewed candidate is created and approved.
      </div>
    );
  }
  return (
    <div data-testid="hr-queue" className="rounded border border-neutral-800 overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-neutral-900 text-neutral-500">
          <tr>
            {["candidate", "status", "type", "label", "cluster", "observation", "as_of", "src", "readiness", "ratio", "coverage", "updated"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const ratio = c.coverage?.non_event_to_event_ratio ?? c.non_event_context_json?.non_event_to_event_ratio;
            const coverage = c.coverage?.coverage_status ?? c.non_event_context_json?.coverage_status;
            const lookaheadFailed = c.no_lookahead_audit_json?.passed === false;
            const blocked = (c.blocked_reasons?.length ?? 0) > 0;
            return (
              <tr key={c.candidate_id} data-testid={`queue-row-${c.candidate_id}`}
                onClick={() => onSelect(c.candidate_id)}
                className={`border-t border-neutral-900 cursor-pointer hover:bg-neutral-800/50 ${
                  c.candidate_id === selectedId ? "bg-neutral-800/70" : ""}`}>
                <td className="px-2 py-1.5 text-neutral-100 font-medium whitespace-nowrap">{c.candidate_id}</td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLE[c.approval_status] ?? "bg-neutral-800 text-neutral-300"}`}>
                    {c.approval_status}
                  </span>
                  {blocked && <span data-testid={`badge-blocked-${c.candidate_id}`} className="ml-1 text-rose-300">●</span>}
                  {lookaheadFailed && <span data-testid={`badge-leakage-${c.candidate_id}`} className="ml-1 text-rose-400" title="no_lookahead_failed">⚠</span>}
                </td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.candidate_type ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.candidate_label ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.condition_cluster ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.observation_id ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.as_of_date ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-400 whitespace-nowrap">{c.source_quality ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-300">{c.readiness_score ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-300">{ratio ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-300">{coverage ?? "—"}</td>
                <td className="px-2 py-1.5 text-neutral-500 whitespace-nowrap">{c.updated_at ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
