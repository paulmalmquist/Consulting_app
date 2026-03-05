"use client";

import React from "react";
import type { PdsExecutiveBriefingPack } from "@/lib/bos-api";

type Props = {
  briefings: PdsExecutiveBriefingPack[];
  loading: boolean;
  generating: boolean;
  hasError?: boolean;
  onGenerate: (briefingType: "board" | "investor") => Promise<void>;
};

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

export default function BoardInvestorBriefingsTab({ briefings, loading, generating, hasError, onGenerate }: Props) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-executive-briefings">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Board / Investor</p>
          <h2 className="text-lg font-semibold">Briefing Generator</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onGenerate("board")}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
          >
            {generating && <Spinner />}
            {generating ? "Generating..." : "Generate Board Pack"}
          </button>
          <button
            type="button"
            onClick={() => void onGenerate("investor")}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
          >
            {generating && <Spinner />}
            {generating ? "Generating..." : "Generate Investor Pack"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading briefing packs...</p>
        ) : hasError ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700">
            Could not load briefing packs — service may be temporarily unavailable.
          </div>
        ) : briefings.length ? (
          briefings.map((pack) => (
            <article key={pack.briefing_pack_id} className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{pack.title || `${pack.briefing_type} briefing`}</p>
                <span className="rounded-full border border-bm-border/60 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{pack.period}</span>
              </div>
              <p className="mt-2 text-sm text-bm-muted2">{pack.summary_text || "No summary"}</p>
            </article>
          ))
        ) : (
          <p className="text-sm text-bm-muted2">No briefing packs generated yet.</p>
        )}
      </div>
    </section>
  );
}
