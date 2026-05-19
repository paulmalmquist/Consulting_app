"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  discardCandidate,
  fetchEnhancementCandidates,
  fetchLatestResearchBrief,
  promoteCandidate,
  type EnhancementCandidate,
  type ResearchBriefSummary,
} from "@/lib/historyrhymes/client";
import { ResearchBriefUpload } from "./ResearchBriefUpload";
import { EnhancementCandidateCard } from "./EnhancementCandidateCard";
import { PlanningMarkdownDrawer } from "./PlanningMarkdownDrawer";

interface Props {
  envId: string;
}

export function HistoryRhymesPlanningClient({ envId }: Props) {
  const [brief, setBrief] = useState<ResearchBriefSummary | null>(null);
  const [candidates, setCandidates] = useState<EnhancementCandidate[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [b, c] = await Promise.all([
      fetchLatestResearchBrief(),
      fetchEnhancementCandidates(),
    ]);
    setBrief(b);
    setCandidates(c?.candidates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(
    id: string,
    fn: (id: string) => Promise<unknown>,
  ): Promise<void> {
    setBusyId(id);
    try {
      await fn(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-200 p-6"
      data-testid="hr-planning-page"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-lg font-semibold text-neutral-100">
            History Rhymes — Research → Planning
          </h1>
          <p className="text-xs text-neutral-500">
            env: {envId} · markdown is archive, extracted JSON is the
            operational source
          </p>
        </header>

        <ResearchBriefUpload onIngested={() => void refresh()} />

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-neutral-100">
              Latest brief
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
              No brief ingested yet.
            </div>
          )}
          {brief && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400">
              {brief.title ?? brief.brief_date} · {brief.week_type} ·{" "}
              {brief.pillar_name} · confidence {brief.confidence ?? "—"} ·{" "}
              {brief.candidate_count} candidate(s)
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-neutral-100 mb-2">
            Enhancement candidates ({candidates.length})
          </h2>
          {!loading && candidates.length === 0 && (
            <div className="text-xs text-neutral-500">
              No candidates. Ingest a 7-section brief above; weak briefs fail
              closed (degraded, no candidates).
            </div>
          )}
          <div className="space-y-3">
            {candidates.map((c) => (
              <EnhancementCandidateCard
                key={c.candidate_id}
                candidate={c}
                busy={busyId === c.candidate_id}
                onPromote={(id) => void act(id, promoteCandidate)}
                onDiscard={(id) => void act(id, discardCandidate)}
                onViewPlan={(id) => setDrawerId(id)}
              />
            ))}
          </div>
        </section>
      </div>

      <PlanningMarkdownDrawer
        candidateId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}
