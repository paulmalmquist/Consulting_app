import type { PdsExecutiveQueueMetrics } from "@/types/pds";
import { toCompactCurrency } from "./utils";

export function CloseLoopStrip({ metrics }: { metrics: PdsExecutiveQueueMetrics | null }) {
  if (!metrics) return null;
  const tiles = [
    {
      label: "Recovered value",
      value: toCompactCurrency(metrics.total_recovered_value || 0),
      hint: "Sum of recovery_value on closed interventions",
    },
    {
      label: "Open variance exposure",
      value: toCompactCurrency(metrics.open_variance_exposure || 0),
      hint: "ABS variance across open queue rows",
    },
    {
      label: "Median time to fix",
      value:
        metrics.median_time_to_fix_hours == null
          ? "—"
          : `${metrics.median_time_to_fix_hours.toFixed(1)}h`,
      hint: "Created → resolved_at, closed interventions only",
    },
  ];
  return (
    <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-bm-border/60 bg-bm-surface/20 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">
            {tile.label}
          </p>
          <p className="mt-1 text-lg font-semibold text-bm-text">{tile.value}</p>
          <p className="mt-1 text-[11px] text-bm-muted2">{tile.hint}</p>
        </div>
      ))}
    </section>
  );
}
