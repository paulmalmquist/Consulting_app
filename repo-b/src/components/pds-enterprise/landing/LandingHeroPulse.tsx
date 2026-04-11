import type { LandingHeroMetrics } from "./types";
import { statusClasses, toCompactCurrency } from "./utils";

export function LandingHeroPulse({
  metrics,
  onMetricClick,
}: {
  metrics: LandingHeroMetrics;
  onMetricClick?: (key: "atRisk" | "variance") => void;
}) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Portfolio Pulse</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-bm-text">Operating Snapshot</h2>
          <p className="text-sm text-bm-muted2">Single-line truth: posture, exposure, variance, and directional change.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusClasses(metrics.posture)}`}>
          {metrics.posture}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Total managed" value={toCompactCurrency(metrics.totalExposure)} />
        <Metric
          label="Net variance"
          value={toCompactCurrency(metrics.netVariance)}
          tone={metrics.netVariance < 0 ? "bad" : "good"}
          onClick={() => onMetricClick?.("variance")}
        />
        <Metric label="Directional change" value={`${metrics.directionalDelta.toFixed(1)}%`} tone={metrics.directionalDelta < 0 ? "bad" : "good"} />
        <Metric label="Accounts at risk" value={String(metrics.accountsAtRisk)} onClick={() => onMetricClick?.("atRisk")} tone={metrics.accountsAtRisk > 0 ? "bad" : "good"} />
        <Metric label="Current posture" value={metrics.posture} />
      </div>
    </section>
  );
}

function Metric({ label, value, tone, onClick }: { label: string; value: string; tone?: "bad" | "good"; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-bm-border/60 bg-bm-surface/10 p-3 text-left disabled:cursor-default"
      disabled={!onClick}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone === "bad" ? "text-pds-signalRed" : tone === "good" ? "text-pds-signalGreen" : "text-bm-text"}`}>{value}</p>
    </button>
  );
}
