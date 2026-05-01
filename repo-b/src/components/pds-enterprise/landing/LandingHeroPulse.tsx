import type { LandingHeroMetrics, RiskSummaryModel } from "./types";
import { toCompactCurrency } from "./utils";

export function LandingHeroPulse({
  metrics,
  riskSummary,
  onMetricClick,
}: {
  metrics: LandingHeroMetrics;
  riskSummary: RiskSummaryModel;
  onMetricClick?: (key: "atRisk" | "variance") => void;
}) {
  const trendArrow = metrics.directionalDelta > 0 ? "↑" : metrics.directionalDelta < 0 ? "↓" : "→";
  const negativeDriver =
    riskSummary.largestNegativeDriver && riskSummary.largestNegativeDriver !== "no dominant driver"
      ? riskSummary.largestNegativeDriver
      : null;

  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Portfolio metrics</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {/* Dominant: Net Variance — col-span-2 */}
        <button
          type="button"
          onClick={() => onMetricClick?.("variance")}
          className="col-span-2 rounded-xl border border-bm-border/60 bg-bm-surface/10 p-4 text-left"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Net variance</p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${metrics.netVariance < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}`}>
            {toCompactCurrency(metrics.netVariance)}
          </p>
          {negativeDriver && (
            <p className="mt-1 text-xs text-bm-muted2 truncate">
              Driven by: {negativeDriver}
            </p>
          )}
        </button>

        {/* Directional change */}
        <button
          type="button"
          disabled
          className="col-span-1 rounded-xl border border-bm-border/60 bg-bm-surface/10 p-3 text-left disabled:cursor-default sm:col-span-1"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Directional</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${metrics.directionalDelta < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}`}>
            {trendArrow} {Math.abs(metrics.directionalDelta).toFixed(1)}%
          </p>
        </button>

        {/* Accounts at risk */}
        <button
          type="button"
          onClick={() => onMetricClick?.("atRisk")}
          className="col-span-1 rounded-xl border border-bm-border/60 bg-bm-surface/10 p-3 text-left"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">At risk</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${metrics.accountsAtRisk > 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}`}>
            {metrics.accountsAtRisk}
          </p>
        </button>

        {/* Total managed — subordinate */}
        <button
          type="button"
          disabled
          className="col-span-2 rounded-xl border border-bm-border/50 bg-bm-surface/5 p-3 text-left disabled:cursor-default sm:col-span-2 lg:col-span-2"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Total managed</p>
          <p className="mt-1 text-base font-semibold text-bm-text tabular-nums">
            {toCompactCurrency(metrics.totalExposure)}
          </p>
        </button>
      </div>
    </section>
  );
}
