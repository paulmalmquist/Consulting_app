"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

export function NoLookaheadAuditPanel({ candidate }: { candidate: PromotionCandidate }) {
  const audit = candidate.no_lookahead_audit_json ?? {};
  const present = Object.keys(audit).length > 0;
  const passed = audit.passed === true;
  const failed = audit.passed === false;
  const violations = audit.violations ?? [];

  return (
    <section data-testid="hr-no-lookahead" className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="text-xs font-semibold text-neutral-300 mb-2">No-lookahead audit</h3>
      {!present ? (
        <p className="text-xs text-amber-300"><code>missing_no_lookahead_audit</code></p>
      ) : (
        <>
          <p className="text-xs mb-1">
            Result:{" "}
            <span className={passed ? "text-emerald-300" : "text-rose-300"} data-testid="lookahead-result">
              {passed ? "pass" : "fail"}
            </span>
          </p>
          {audit.knowable_as_of && (
            <p className="text-[11px] text-neutral-400">Knowable as of: {audit.knowable_as_of}</p>
          )}
          {violations.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {violations.map((v) => (
                <li key={v}><code className="text-xs text-rose-200">{v}</code></li>
              ))}
            </ul>
          )}
          {failed && (
            <p data-testid="lookahead-non-overridable" className="mt-2 text-[11px] text-rose-200 border border-rose-500/40 bg-rose-500/10 rounded p-2">
              No-lookahead failed. This candidate cannot be approved from the review surface.
            </p>
          )}
        </>
      )}
    </section>
  );
}
