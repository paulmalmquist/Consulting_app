"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchLatestResearchBrief,
  type ResearchBriefSummary,
  type IngestResult,
} from "@/lib/historyrhymes/client";
import { ResearchBriefUpload } from "./ResearchBriefUpload";

interface Props {
  envId: string;
}

// Research archive page (PR 14): upload + latest brief view.
// This is the front door for brief ingestion; /planning keeps candidates only.
export function ResearchArchiveClient({ envId }: Props) {
  const [brief, setBrief] = useState<ResearchBriefSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const b = await fetchLatestResearchBrief();
    setBrief(b);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleIngested(_result: IngestResult) {
    void refresh();
  }

  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-200 p-6"
      data-testid="hr-research-page"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-lg font-semibold text-neutral-100">
            History Rhymes — Research Archive
          </h1>
          <p className="text-xs text-neutral-500">
            env: {envId} · weekly briefs are archive evidence; extracted JSON drives{" "}
            <a
              href={`/lab/env/${envId}/historyrhymes/planning`}
              className="underline text-neutral-400 hover:text-neutral-200"
            >
              planning candidates
            </a>
          </p>
        </header>

        <ResearchBriefUpload onIngested={handleIngested} />

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-neutral-100">
              Latest ingested brief
            </h2>
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="text-xs text-neutral-500">Loading…</div>
          )}
          {!loading && !brief && (
            <div className="text-xs text-neutral-500">
              No brief ingested yet. Paste or upload a 7-section brief above.
            </div>
          )}
          {brief && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400 space-y-1">
              <div className="font-medium text-neutral-200">
                {brief.title ?? brief.brief_date}
              </div>
              <div>
                {brief.week_type} · {brief.pillar_name}
              </div>
              <div>
                confidence {brief.confidence ?? "—"} · freshness{" "}
                {brief.freshness_score != null
                  ? brief.freshness_score.toFixed(2)
                  : "—"}{" "}
                · {brief.candidate_count} candidate(s)
              </div>
              <div className="text-neutral-600">
                ingested {new Date(brief.created_at).toLocaleString()}
                {brief.source_filename ? ` · ${brief.source_filename}` : ""}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
