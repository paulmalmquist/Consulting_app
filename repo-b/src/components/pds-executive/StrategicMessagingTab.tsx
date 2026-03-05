"use client";

import React from "react";
import type { PdsExecutiveNarrativeDraft } from "@/lib/bos-api";

type Props = {
  drafts: PdsExecutiveNarrativeDraft[];
  loading: boolean;
  generating: boolean;
  hasError?: boolean;
  onGenerate: () => Promise<void>;
  onApprove: (draft: PdsExecutiveNarrativeDraft) => Promise<void>;
};

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

export default function StrategicMessagingTab({ drafts, loading, generating, hasError, onGenerate, onApprove }: Props) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-executive-messaging">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Strategic Messaging</p>
          <h2 className="text-lg font-semibold">Executive Narrative Engine</h2>
        </div>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-bm-accent/60 bg-bm-accent/15 px-3 py-2 text-xs font-medium hover:bg-bm-accent/25 disabled:opacity-60"
        >
          {generating && <Spinner />}
          {generating ? "Generating..." : "Generate Drafts"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading drafts...</p>
        ) : hasError ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700">
            Could not load messaging drafts — service may be temporarily unavailable.
          </div>
        ) : drafts.length ? (
          drafts.map((draft) => (
            <article key={draft.draft_id} className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{draft.title || draft.draft_type}</p>
                <span className="rounded-full border border-bm-border/60 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{draft.status}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-bm-muted2">{draft.body_text || "No content"}</p>
              {draft.status !== "approved" ? (
                <button
                  type="button"
                  onClick={() => void onApprove(draft)}
                  className="mt-3 rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40"
                >
                  Approve Draft
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-bm-muted2">No drafts yet. Generate messaging drafts to begin.</p>
        )}
      </div>
    </section>
  );
}
