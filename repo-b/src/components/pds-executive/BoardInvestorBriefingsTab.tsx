"use client";

import React from "react";
import type { PdsExecutiveBriefingPack } from "@/lib/bos-api";

type Props = {
  briefings: PdsExecutiveBriefingPack[];
  loading: boolean;
  generating: boolean;
  onGenerate: (briefingType: "board" | "investor") => Promise<void>;
};

export default function BoardInvestorBriefingsTab({ briefings, loading, generating, onGenerate }: Props) {
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
            className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
          >
            Generate Board Pack
          </button>
          <button
            type="button"
            onClick={() => void onGenerate("investor")}
            disabled={generating}
            className="rounded-lg border border-bm-border px-3 py-2 text-xs hover:bg-bm-surface/40 disabled:opacity-60"
          >
            Generate Investor Pack
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-bm-muted2">Loading briefing packs...</p>
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
