"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  discardCandidate,
  fetchEnhancementCandidates,
  promoteCandidate,
  type EnhancementCandidate,
} from "@/lib/historyrhymes/client";
import { EnhancementCandidateCard } from "./EnhancementCandidateCard";
import { PlanningMarkdownDrawer } from "./PlanningMarkdownDrawer";

interface Props {
  envId: string;
}

// Planning page (PR 14): candidates-only. Upload moved to /research.
// client.ts is untouched — all API contracts are the same.
export function HistoryRhymesPlanningClient({ envId }: Props) {
  const [candidates, setCandidates] = useState<EnhancementCandidate[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const c = await fetchEnhancementCandidates();
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
            History Rhymes — Planning
          </h1>
          <p className="text-xs text-neutral-500">
            env: {envId} ·{" "}
            <a
              href={`/lab/env/${envId}/historyrhymes/research`}
              className="underline text-neutral-400 hover:text-neutral-200"
            >
              ingest a brief in Research
            </a>{" "}
            to generate candidates
          </p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-neutral-100">
              Enhancement candidates ({candidates.length})
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
          {!loading && candidates.length === 0 && (
            <div className="text-xs text-neutral-500">
              No candidates yet.{" "}
              <a
                href={`/lab/env/${envId}/historyrhymes/research`}
                className="underline text-neutral-400 hover:text-neutral-200"
              >
                Ingest a 7-section brief in Research
              </a>{" "}
              to generate candidates; weak briefs fail closed (degraded, no candidates).
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
