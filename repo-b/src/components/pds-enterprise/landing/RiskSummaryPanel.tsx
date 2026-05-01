import type { RiskSummaryModel } from "./types";
import { toCompactCurrency } from "./utils";

interface Driver {
  label: string;
  value: string;
  barWidth: number;
  tone: "bad" | "good" | "neutral";
}

export function RiskSummaryPanel({ summary }: { summary: RiskSummaryModel }) {
  const drivers: Driver[] = [];

  if (summary.largestNegativeDriver && summary.largestNegativeDriver !== "no dominant driver") {
    drivers.push({
      label: summary.largestNegativeDriver,
      value: toCompactCurrency(summary.totalShortfall),
      barWidth: 75,
      tone: "bad",
    });
  }

  if (summary.largestPositiveDriver && summary.largestPositiveDriver !== "no dominant driver") {
    drivers.push({
      label: summary.largestPositiveDriver,
      value: "+",
      barWidth: 40,
      tone: "good",
    });
  }

  const summaryLabel = `${summary.atRiskCount} at risk · ${summary.watchlistCount} watching · ${summary.stableCount} stable`;
  drivers.push({
    label: summaryLabel,
    value: `${summary.watchlistCount} monitoring`,
    barWidth: summary.watchlistCount > 0 ? Math.min(100, summary.watchlistCount * 15) : 8,
    tone: "neutral",
  });

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Risk Drivers</p>
      <ul className="mt-3 space-y-2">
        {drivers.map((driver, idx) => (
          <li key={idx} className="rounded-xl border border-bm-border/50 bg-bm-surface/10 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bm-surface/30 text-[10px] font-semibold text-bm-muted2">
                  {idx + 1}
                </span>
                <span className="truncate text-bm-text capitalize">{driver.label}</span>
              </div>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${driver.tone === "bad" ? "text-pds-signalRed" : driver.tone === "good" ? "text-pds-signalGreen" : "text-bm-muted2"}`}>
                {driver.value}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bm-surface/30">
              <div
                className={`h-full rounded-full ${driver.tone === "bad" ? "bg-pds-signalRed/60" : driver.tone === "good" ? "bg-pds-signalGreen/60" : "bg-bm-muted2/40"}`}
                style={{ width: `${driver.barWidth}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
