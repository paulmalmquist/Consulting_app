"use client";

import type { PromotionCandidate } from "@/lib/historyrhymes/promotions";

export function ReceiptHistoryPanel({ candidate }: { candidate: PromotionCandidate }) {
  const r = candidate.promotion_receipt_json ?? {};
  const history = r.receipt_history ?? [];
  const hasReceipt = (r.version ?? 0) > 0;

  return (
    <section data-testid="hr-receipt-history" className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="text-xs font-semibold text-neutral-300 mb-2">Receipt history</h3>
      {!hasReceipt ? (
        <p className="text-xs text-neutral-500">No receipts yet — issued on approval and promotion.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-neutral-500">Current version</dt>
            <dd className="text-neutral-200" data-testid="receipt-version">{r.version}</dd>
            <dt className="text-neutral-500">Approval actor</dt>
            <dd className="text-neutral-200">{r.approval_actor ?? "—"}</dd>
            <dt className="text-neutral-500">Approval timestamp</dt>
            <dd className="text-neutral-200">{r.approval_timestamp ?? "—"}</dd>
            <dt className="text-neutral-500">Created episode id</dt>
            <dd className="text-neutral-200">{r.created_episode_id ?? "—"}</dd>
          </dl>
          <div className="mt-2 text-[11px] text-neutral-500 space-y-0.5">
            {([
              ["calibration", r.calibration_evidence_hash],
              ["no-lookahead", r.no_lookahead_audit_hash],
              ["non-event", r.non_event_context_hash],
              ["lineage", r.lineage_hash],
              ["features", r.features_snapshot_hash],
            ] as const).map(([label, hash]) => hash ? (
              <p key={label}><span className="text-neutral-600">{label}:</span> <code>{hash}</code></p>
            ) : null)}
          </div>
          {history.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-neutral-400 cursor-pointer" data-testid="receipt-history-count">
                {history.length} prior receipt{history.length === 1 ? "" : "s"}
              </summary>
              <pre className="mt-1 text-[10px] text-neutral-500 overflow-auto max-h-48">
                {JSON.stringify(history, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </section>
  );
}
