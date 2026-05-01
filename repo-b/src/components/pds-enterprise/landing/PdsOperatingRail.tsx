import { useRouter } from "next/navigation";
import type { PdsGrain } from "./GrainToggleBar";
import type { LandingHeroMetrics } from "./types";

const HERO_METRIC_KEYS: Array<{ metric: string; label: string }> = [
  { metric: "total_managed", label: "Total managed" },
  { metric: "net_variance", label: "Net variance" },
  { metric: "directional_delta", label: "Directional" },
  { metric: "accounts_at_risk", label: "Accounts at risk" },
  { metric: "posture", label: "Posture" },
];

const GRAIN_DESCRIPTIONS: Record<PdsGrain, string> = {
  portfolio: "Metrics resolve across all accounts and projects in the portfolio.",
  account: "Metrics resolve per client account.",
  project: "Metrics resolve at the individual project level.",
  issue: "Metrics resolve per flagged issue or intervention.",
};

export function PdsOperatingRail({
  envId,
  hero,
  grain,
  hasDefinitions,
  onMetricClick,
}: {
  envId: string;
  hero: LandingHeroMetrics;
  grain: PdsGrain;
  hasDefinitions: boolean;
  onMetricClick: (metric: string) => void;
}) {
  const router = useRouter();
  void hero;

  return (
    <aside className="hidden lg:flex flex-col gap-5 rounded-2xl border border-bm-border/60 bg-bm-surface/15 p-4 self-start sticky top-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2 mb-2">
          Context
        </p>
        <p className="text-xs text-bm-muted2 leading-relaxed">
          {GRAIN_DESCRIPTIONS[grain]}
        </p>
      </div>

      {hasDefinitions && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2 mb-2">
            Definitions
          </p>
          <div className="flex flex-col gap-1">
            {HERO_METRIC_KEYS.map((m) => (
              <button
                key={m.metric}
                type="button"
                onClick={() => onMetricClick(m.metric)}
                className="w-full rounded-lg border border-bm-border/50 bg-bm-surface/10 px-2.5 py-1.5 text-left text-xs text-bm-muted2 hover:text-bm-text"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bm-muted2 mb-2">
          AI
        </p>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => router.push(`/lab/env/${envId}/pds/ai-command-layer?intent=explain-posture`)}
            className="w-full rounded-lg border border-bm-border/50 bg-bm-surface/10 px-2.5 py-1.5 text-left text-xs text-bm-muted2 hover:text-bm-text"
          >
            Explain current posture
          </button>
          <button
            type="button"
            onClick={() => router.push(`/lab/env/${envId}/pds/ai-command-layer?intent=recovery-plan`)}
            className="w-full rounded-lg border border-pds-accent/40 bg-pds-accent/5 px-2.5 py-1.5 text-left text-xs text-pds-accentText hover:bg-pds-accent/10"
          >
            Generate recovery plan
          </button>
        </div>
      </div>
    </aside>
  );
}
