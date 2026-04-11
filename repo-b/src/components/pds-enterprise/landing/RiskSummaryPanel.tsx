import type { RiskSummaryModel } from "./types";
import { toCompactCurrency } from "./utils";

export function RiskSummaryPanel({ summary }: { summary: RiskSummaryModel }) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Pressure Points</p>
      <h3 className="mt-1 text-xl font-semibold text-bm-text">Risk Summary</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Cell label="Accounts at risk" value={String(summary.atRiskCount)} tone="bad" />
        <Cell label="Watchlist" value={String(summary.watchlistCount)} tone="warn" />
        <Cell label="Stable" value={String(summary.stableCount)} tone="good" />
        <Cell label="Total shortfall" value={toCompactCurrency(summary.totalShortfall)} tone={summary.totalShortfall < 0 ? "bad" : "good"} />
        <Cell label="Largest negative driver" value={summary.largestNegativeDriver} />
        <Cell label="Largest positive driver" value={summary.largestPositiveDriver} />
      </div>
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "bad" | "warn" | "good" }) {
  const toneClass = tone === "bad" ? "text-pds-signalRed" : tone === "warn" ? "text-pds-signalOrange" : tone === "good" ? "text-pds-signalGreen" : "text-bm-text";
  return (
    <article className="rounded-xl border border-bm-border/60 bg-bm-surface/10 p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-sm font-semibold capitalize ${toneClass}`}>{value}</p>
    </article>
  );
}
