"use client";

import { useState } from "react";

import type { PromotionActionResult, PromotionCandidate } from "@/lib/historyrhymes/promotions";

export interface ActionHandlers {
  needsEvidence: () => Promise<PromotionActionResult>;
  needsReview: () => Promise<PromotionActionResult>;
  approve: (body: { reviewer_notes?: string; override_reason?: string }) => Promise<PromotionActionResult>;
  reject: (body: { rejection_reason: string }) => Promise<PromotionActionResult>;
  supersede: (body: { superseded_by_candidate_id: string }) => Promise<PromotionActionResult>;
  linkEpisode: (body: { created_episode_id: string }) => Promise<PromotionActionResult>;
  refresh: () => void;
}

// status target each button drives; the button is enabled only if that target is
// in the candidate's allowed_actions (which the C6 API derives from the C4 machine).
const ACTION_TARGET: Record<string, string> = {
  needs_evidence: "needs_evidence",
  needs_review: "needs_review",
  approve: "approved",
  reject: "rejected",
  supersede: "superseded",
  link: "promoted",
};

export function PromotionActionBar({
  candidate, handlers, onResult,
}: {
  candidate: PromotionCandidate;
  handlers: ActionHandlers;
  onResult?: (r: PromotionActionResult) => void;
}) {
  const allowed = new Set(candidate.allowed_actions ?? []);
  const can = (a: keyof typeof ACTION_TARGET) => allowed.has(ACTION_TARGET[a]);
  const lookaheadFailed = candidate.no_lookahead_audit_json?.passed === false;

  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [replacement, setReplacement] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<PromotionActionResult>) {
    setBusy(true);
    try {
      const r = await fn();
      onResult?.(r);
    } finally {
      setBusy(false);
    }
  }

  const btn = "text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section data-testid="hr-action-bar" className="rounded border border-neutral-800 bg-neutral-900/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button data-testid="action-needs-evidence" className={`${btn} bg-neutral-900 text-neutral-300 border-neutral-700`}
          disabled={busy || !can("needs_evidence")} onClick={() => run(handlers.needsEvidence)}>
          Mark needs evidence
        </button>
        <button data-testid="action-needs-review" className={`${btn} bg-neutral-900 text-neutral-300 border-neutral-700`}
          disabled={busy || !can("needs_review")} onClick={() => run(handlers.needsReview)}>
          Mark needs review
        </button>
        <button data-testid="action-approve" className={`${btn} bg-emerald-500/15 text-emerald-200 border-emerald-500/40`}
          disabled={busy || !can("approve") || lookaheadFailed}
          title={lookaheadFailed ? "no_lookahead_failed — not approvable" : undefined}
          onClick={() => run(() => handlers.approve({
            reviewer_notes: notes || undefined,
            override_reason: overrideReason || undefined,
          }))}>
          Approve
        </button>
        <button data-testid="action-reject" className={`${btn} bg-rose-500/15 text-rose-200 border-rose-500/40`}
          disabled={busy || !can("reject") || !rejectReason.trim()}
          onClick={() => run(() => handlers.reject({ rejection_reason: rejectReason }))}>
          Reject
        </button>
        <button data-testid="action-supersede" className={`${btn} bg-neutral-900 text-neutral-300 border-neutral-700`}
          disabled={busy || !can("supersede") || !replacement.trim()}
          onClick={() => run(() => handlers.supersede({ superseded_by_candidate_id: replacement }))}>
          Supersede
        </button>
        <button data-testid="action-link" className={`${btn} bg-sky-500/15 text-sky-200 border-sky-500/40`}
          disabled={busy || !can("link") || !episodeId.trim()}
          onClick={() => run(() => handlers.linkEpisode({ created_episode_id: episodeId }))}>
          Link promoted episode
        </button>
        <button data-testid="action-refresh" className={`${btn} bg-neutral-900 text-neutral-400 border-neutral-800`}
          disabled={busy} onClick={handlers.refresh}>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <textarea aria-label="Reviewer notes" placeholder="Reviewer notes (optional)" value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200" rows={2} />
        <textarea aria-label="Coverage override reason" placeholder="Coverage override reason (required if below target)"
          value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
          className="text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200" rows={2} />
        <input aria-label="Rejection reason" placeholder="Rejection reason (required to reject)" value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200" />
        <input aria-label="Superseded by candidate id" placeholder="Replacement candidate_id (required to supersede)"
          value={replacement} onChange={(e) => setReplacement(e.target.value)}
          className="text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200" />
        <div className="sm:col-span-2">
          <input aria-label="Created episode id" placeholder="Externally-created episode_id (required to link)"
            value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}
            className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-200" />
          <p className="text-[11px] text-neutral-500 mt-1">
            This links an episode created elsewhere. It does not create an episode or write embeddings.
          </p>
        </div>
      </div>
    </section>
  );
}
