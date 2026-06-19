"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

/** Per-gate pass/missing/failed view. Renders the EXACT C4 blocked-reason
 * strings — never a generic "validation failed" banner. */
const GATES: { key: string; label: string; reason: string; check: (c: PromotionCandidate) => boolean }[] = [
  { key: "calibration", label: "Calibration evidence", reason: "missing_calibration_evidence",
    check: (c) => !!c.calibration_evidence_json && Object.keys(c.calibration_evidence_json).length > 0 },
  { key: "no_lookahead", label: "No-lookahead audit", reason: "missing_no_lookahead_audit",
    check: (c) => !!c.no_lookahead_audit_json && Object.keys(c.no_lookahead_audit_json).length > 0 },
  { key: "non_event", label: "Non-event context", reason: "missing_non_event_context",
    check: (c) => !!c.non_event_context_json && Object.keys(c.non_event_context_json).length > 0 },
  { key: "features", label: "Features snapshot", reason: "missing_features_snapshot",
    check: (c) => !!c.features_snapshot && Object.keys(c.features_snapshot).length > 0 },
  { key: "lineage", label: "Lineage", reason: "missing_lineage",
    check: (c) => !!c.lineage_json && Object.keys(c.lineage_json).length > 0 },
  { key: "narrative", label: "Narrative summary", reason: "missing_narrative_summary",
    check: (c) => !!(c.narrative_summary && c.narrative_summary.trim()) },
];

export function EvidenceGatePanel({ candidate }: { candidate: PromotionCandidate }) {
  const blocked = new Set(candidate.blocked_reasons ?? []);
  const lookaheadFailed = candidate.no_lookahead_audit_json?.passed === false;

  return (
    <section data-testid="hr-evidence-gate" className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="text-xs font-semibold text-neutral-300 mb-2">Evidence gate</h3>
      <ul className="space-y-1">
        {GATES.map((g) => {
          const present = g.check(candidate);
          const failedReason = g.key === "no_lookahead" && lookaheadFailed ? "no_lookahead_failed" : !present ? g.reason : null;
          return (
            <li key={g.key} className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">{g.label}</span>
              {failedReason ? (
                <code data-testid={`gate-reason-${g.key}`} className="text-rose-300">{failedReason}</code>
              ) : (
                <span className="text-emerald-300">pass</span>
              )}
            </li>
          );
        })}
        <li className="flex items-center justify-between text-xs">
          <span className="text-neutral-400">Approval actor</span>
          {candidate.approval_actor ? (
            <span className="text-emerald-300">{candidate.approval_actor}</span>
          ) : (
            <code className="text-amber-300">missing_approval_actor</code>
          )}
        </li>
      </ul>
      {blocked.size > 0 && (
        <div data-testid="gate-blocked-reasons" className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 p-2">
          <p className="text-[11px] text-rose-200 mb-1">Blocked reasons (from the airlock):</p>
          <ul className="space-y-0.5">
            {[...blocked].map((r) => (
              <li key={r}><code className="text-xs text-rose-200">{r}</code></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
