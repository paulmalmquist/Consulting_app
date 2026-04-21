/**
 * History Rhymes Trading Routine — the morning surface.
 *
 * Loads the current HR state + latest decision + latest brief and renders:
 *   1. Regime header with freshness/confidence indicator
 *   2. 8-signal pulse strip
 *   3. Top 3 "Act" decision cards (rest collapsed / deferred to v2)
 *   4. Active alert banner (only when alerts present)
 *   5. "Open full brief" link
 *
 * This is the new default landing for /lab/env/[envId]/historyrhymes/. The
 * existing runner-style workspace moves to a sub-route in v2.
 */

"use client";

import React, { useEffect, useState } from "react";
import {
  fetchHrState,
  fetchLatestDecision,
  fetchLatestBrief,
  type HrState,
  type HrDecision,
  type HrBrief,
  type Position,
} from "@/lib/historyrhymes/client";
import { RoutineHeader } from "@/components/historyrhymes/RoutineHeader";
import { PulseStrip } from "@/components/historyrhymes/PulseStrip";
import { DecisionCard } from "@/components/historyrhymes/DecisionCard";
import { AlertBanner } from "@/components/historyrhymes/AlertBanner";

const TOP_ACT_LIMIT = 3;

export default function TradingRoutinePage() {
  const [state, setState] = useState<HrState | null>(null);
  const [decision, setDecision] = useState<HrDecision | null>(null);
  const [brief, setBrief] = useState<HrBrief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, d, b] = await Promise.all([
        fetchHrState(),
        fetchLatestDecision(),
        fetchLatestBrief(),
      ]);
      if (cancelled) return;
      setState(s);
      setDecision(d);
      setBrief(b);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6 text-neutral-400">
        Loading Trading Routine…
      </main>
    );
  }

  const freshness = state?.freshness_verdict ?? "no_brief";
  const regime = decision?.regime ?? state?.latest_regime ?? null;
  const confidence = decision?.confidence ?? state?.latest_confidence ?? null;

  const positions: Position[] = decision?.positions ?? [];
  const actPositions = positions.slice(0, TOP_ACT_LIMIT);
  const restPositions = positions.slice(TOP_ACT_LIMIT);

  const signalsJson =
    (brief?.parsed_json?.latest_signals as Record<string, unknown> | undefined) ?? null;

  return (
    <main className="max-w-6xl mx-auto p-6" data-testid="hr-routine-page">
      <RoutineHeader
        regime={regime}
        confidence={confidence}
        latestDecisionAt={decision?.prediction_date ?? state?.latest_decision_at ?? null}
        freshness={freshness}
      />

      <PulseStrip signalsJson={signalsJson} />

      <AlertBanner alerts={decision?.alerts ?? []} />

      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
          Top {Math.min(TOP_ACT_LIMIT, actPositions.length)} to act on
        </h2>
        {actPositions.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-700 p-6 text-center text-neutral-400">
            No actionable positions this cycle. {freshness !== "fresh" && (
              <>Freshness: <span className="text-amber-400">{freshness.replace("_", " ")}</span>.</>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {actPositions.map((p, i) => (
              <DecisionCard key={`${p.asset}-${i}`} position={p} tier="act" />
            ))}
          </div>
        )}
      </section>

      {restPositions.length > 0 && (
        <details className="mb-6">
          <summary className="text-xs uppercase tracking-wider text-neutral-500 cursor-pointer select-none hover:text-neutral-300">
            {restPositions.length} more position{restPositions.length === 1 ? "" : "s"} (watch / research)
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            {restPositions.map((p, i) => (
              <DecisionCard key={`rest-${p.asset}-${i}`} position={p} tier="watch" />
            ))}
          </div>
        </details>
      )}

      <section className="mt-8 pt-4 border-t border-neutral-800 text-sm text-neutral-400">
        {brief ? (
          <a
            href={brief.markdown_uri ?? "#"}
            className="underline hover:text-neutral-200"
            target={brief.markdown_uri?.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            Open full weekly brief
          </a>
        ) : (
          <span>No weekly brief on record yet.</span>
        )}
        {state && (
          <span className="ml-4 text-xs text-neutral-500">
            input age: {state.worst_input_age_hours.toFixed(1)}h · verdict: {state.freshness_verdict}
          </span>
        )}
      </section>
    </main>
  );
}
