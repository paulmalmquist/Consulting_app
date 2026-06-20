"use client";

import React from "react";
import type { EnhancementCandidate } from "@/lib/historyrhymes/client";

interface Props {
  candidate: EnhancementCandidate;
  busy?: boolean;
  onPromote: (id: string) => void;
  onDiscard: (id: string) => void;
  onViewPlan: (id: string) => void;
}

const STATUS_CLASS: Record<string, string> = {
  new: "bg-neutral-700 text-neutral-200",
  promoted: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  discarded: "bg-neutral-800 text-neutral-500 line-through",
  planned: "bg-sky-500/20 text-sky-300 border border-sky-500/40",
  shipped: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
};

const VERDICT_CLASS: Record<string, string> = {
  PASS: "text-emerald-400",
  FAIL: "text-red-400",
  HOLD: "text-amber-400",
  CAUTION: "text-amber-400",
  ABSTAIN: "text-neutral-400",
};

export function EnhancementCandidateCard({
  candidate: c,
  busy = false,
  onPromote,
  onDiscard,
  onViewPlan,
}: Props) {
  const statusClass = STATUS_CLASS[c.status] ?? STATUS_CLASS.new;
  const verdictClass = c.adversarial_verdict
    ? VERDICT_CLASS[c.adversarial_verdict] ?? "text-neutral-300"
    : "text-neutral-500";

  return (
    <article
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
      data-testid="hr-candidate-card"
      data-status={c.status}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-neutral-100">{c.title}</h3>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${statusClass}`}
        >
          {c.status}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Priority</dt>
          <dd className="text-neutral-200 capitalize">{c.priority}</dd>
        </div>
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Effort</dt>
          <dd className="text-neutral-200">
            {c.effort_days != null ? `${c.effort_days}d` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500 uppercase tracking-wider">Verdict</dt>
          <dd className={`font-semibold ${verdictClass}`}>
            {c.adversarial_verdict ?? "—"}
          </dd>
        </div>
      </dl>

      {c.what && (
        <p className="text-xs text-neutral-300 mb-1">
          <span className="text-neutral-500">What: </span>
          {c.what}
        </p>
      )}
      {c.why && (
        <p className="text-xs text-neutral-300 mb-1">
          <span className="text-neutral-500">Why: </span>
          {c.why}
        </p>
      )}
      {c.expected_impact && (
        <p className="text-xs text-neutral-300 mb-1">
          <span className="text-neutral-500">Impact: </span>
          {c.expected_impact}
        </p>
      )}
      {c.dependencies.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {c.dependencies.map((d, i) => (
            <li
              key={i}
              className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700"
            >
              {d}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-neutral-800 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onViewPlan(c.candidate_id)}
          className="text-xs px-3 py-1 rounded border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          View plan
        </button>
        <button
          type="button"
          disabled={busy || c.status === "promoted"}
          onClick={() => onPromote(c.candidate_id)}
          className="text-xs px-3 py-1 rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
        >
          Promote
        </button>
        <button
          type="button"
          disabled={busy || c.status === "discarded"}
          onClick={() => onDiscard(c.candidate_id)}
          className="text-xs px-3 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </article>
  );
}
