"use client";

import { NON_EVENT_RATIO_TARGET, type PromotionCandidate } from "@/lib/historyrhymes/promotions";

export function NonEventCoveragePanel({ candidate }: { candidate: PromotionCandidate }) {
  const cov = candidate.coverage ?? candidate.non_event_context_json ?? {};
  const ratio = cov.non_event_to_event_ratio;
  const belowTarget = cov.override_required === true ||
    (typeof ratio === "number" && ratio < NON_EVENT_RATIO_TARGET);

  return (
    <section data-testid="hr-non-event-coverage" className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="text-xs font-semibold text-neutral-300 mb-2">Non-event coverage</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-neutral-500">Condition cluster</dt>
        <dd className="text-neutral-200">{cov.condition_cluster ?? "—"}</dd>
        <dt className="text-neutral-500">Crisis anchors</dt>
        <dd className="text-neutral-200">{cov.crisis_anchor_count ?? 0}</dd>
        <dt className="text-neutral-500">Non-events</dt>
        <dd className="text-neutral-200">{cov.non_event_count ?? 0}</dd>
        <dt className="text-neutral-500">Ratio (target ≥ {NON_EVENT_RATIO_TARGET})</dt>
        <dd className={belowTarget ? "text-amber-300" : "text-emerald-300"}>
          {ratio == null ? "—" : ratio}
        </dd>
        <dt className="text-neutral-500">Status</dt>
        <dd className="text-neutral-200">{cov.coverage_status ?? "missing"}</dd>
        {cov.override_reason && (
          <>
            <dt className="text-neutral-500">Override reason</dt>
            <dd className="text-neutral-200">{cov.override_reason}</dd>
          </>
        )}
      </dl>
      {belowTarget && (
        <p data-testid="coverage-override-warning" className="mt-2 text-[11px] text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded p-2">
          This promotion weakens non-event coverage for this condition cluster. Approval requires an audited override reason.
        </p>
      )}
    </section>
  );
}
