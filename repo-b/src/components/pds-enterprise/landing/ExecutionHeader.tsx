import { useRouter } from "next/navigation";
import type { LandingHeroMetrics, RiskSummaryModel } from "./types";
import { statusClasses } from "./utils";

function postureGlowClass(posture: string) {
  if (posture === "critical" || posture === "pressured") return "[box-shadow:0_0_20px_rgba(239,68,68,0.22)]";
  if (posture === "watching") return "[box-shadow:0_0_20px_rgba(249,115,22,0.20)]";
  return "[box-shadow:0_0_20px_rgba(34,197,94,0.18)]";
}

export function ExecutionHeader({
  envId,
  hero,
  riskSummary,
  openActionCount,
  onScrollToQueue,
}: {
  envId: string;
  hero: LandingHeroMetrics;
  riskSummary: RiskSummaryModel;
  openActionCount: number;
  onScrollToQueue: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bm-border/50 pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-bm-text">Stone PDS</h1>
        <p className="text-sm text-bm-muted2">Executive Recovery System</p>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span
          className={`rounded-lg border px-5 py-2 text-sm font-semibold uppercase tracking-[0.14em] ${statusClasses(hero.posture)} ${postureGlowClass(hero.posture)}`}
        >
          {hero.posture}
        </span>
        <p className="text-[11px] text-bm-muted2 tabular-nums">
          {riskSummary.atRiskCount} at risk&nbsp;·&nbsp;
          {riskSummary.watchlistCount} watchlist&nbsp;·&nbsp;
          {riskSummary.stableCount} stable
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onScrollToQueue}
          className="rounded-lg border border-pds-signalOrange/40 bg-pds-signalOrange/10 px-3 py-1.5 text-sm font-semibold text-pds-signalOrange hover:bg-pds-signalOrange/15"
        >
          {openActionCount} action{openActionCount !== 1 ? "s" : ""} required
        </button>
        <button
          type="button"
          onClick={() => router.push(`/lab/env/${envId}/pds/ai-command-layer?intent=explain-posture`)}
          className="rounded-lg border border-bm-border/60 bg-bm-surface/20 px-3 py-1.5 text-sm text-bm-muted2 hover:text-bm-text"
        >
          Explain posture
        </button>
        <button
          type="button"
          onClick={() => router.push(`/lab/env/${envId}/pds/ai-command-layer?intent=recovery-plan`)}
          className="rounded-lg border border-pds-accent/40 bg-pds-accent/10 px-3 py-1.5 text-sm font-semibold text-pds-accentText hover:bg-pds-accent/15"
        >
          Generate recovery plan
        </button>
      </div>
    </div>
  );
}
