"use client";

import React from "react";
import type { PdsExecutiveOverview } from "@/lib/bos-api";

type Props = {
  overview: PdsExecutiveOverview | null;
  loading: boolean;
  running: boolean;
  onRunConnectors: () => Promise<void>;
  onRunFull: () => Promise<void>;
};

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function metricCard(label: string, value: number, tone: "neutral" | "warn" | "danger") {
  const toneClass =
    tone === "danger"
      ? "border-red-500/40 bg-red-500/10"
      : tone === "warn"
        ? "border-amber-400/40 bg-amber-400/10"
        : "border-bm-border/60 bg-bm-surface/30";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default function ExecutiveOverview({ overview, loading, running, onRunConnectors, onRunFull }: Props) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-executive-overview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Executive Command</p>
          <h2 className="text-lg font-semibold">PDS Executive Overview</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onRunConnectors()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-2 text-xs font-medium hover:bg-bm-surface/40 disabled:opacity-60"
          >
            {running && <Spinner />}
            {running ? "Running..." : "Run Connectors"}
          </button>
          <button
            type="button"
            onClick={() => void onRunFull()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-bm-accent/60 bg-bm-accent/15 px-3 py-2 text-xs font-medium hover:bg-bm-accent/25 disabled:opacity-60"
          >
            {running && <Spinner />}
            {running ? "Running..." : "Run Full Cycle"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-bm-muted2">Loading executive overview...</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metricCard("Open Queue", overview?.open_queue ?? 0, "warn")}
            {metricCard("Critical Queue", overview?.critical_queue ?? 0, "danger")}
            {metricCard("High Queue", overview?.high_queue ?? 0, "warn")}
            {metricCard("Open Signals", overview?.open_signals ?? 0, "neutral")}
            {metricCard("High Signals", overview?.high_signals ?? 0, "danger")}
          </div>
          <div className="mt-4 rounded-xl border border-bm-border/60 bg-bm-surface/25 p-3 text-sm text-bm-muted2">
            Decision coverage: <span className="font-medium text-bm-text">{overview?.decisions_total ?? 20}</span> decision loops in catalog.
          </div>
        </>
      )}
    </section>
  );
}
