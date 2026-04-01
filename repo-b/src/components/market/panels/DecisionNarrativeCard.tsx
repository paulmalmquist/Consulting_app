"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type {
  AgentDataItem,
  NarrativeItem,
  RealitySignal,
  MismatchItem,
  SilenceEvent,
  TrapCheckRaw,
  AssetScope,
} from "@/lib/trading-lab/decision-engine-types";
import type { ApiPrediction } from "@/components/market/hooks/useDecisionEngine";
import { isValid, safeStr, scenariosValid } from "@/lib/trading-lab/safe-display";

interface DecisionNarrativeCardProps {
  agentData: AgentDataItem[];
  narrativeState: NarrativeItem[];
  realitySignals: RealitySignal[];
  mismatchData: MismatchItem[];
  silenceEvents: SilenceEvent[];
  assetScope: AssetScope;
  forecast?: ApiPrediction | null;
  trapChecks?: TrapCheckRaw[];
}

const SCOPE_LABELS: Record<AssetScope, string> = {
  global: "Markets",
  equities: "Equities",
  crypto: "Crypto",
  "real-estate": "Real Estate",
};

export function DecisionNarrativeCard({
  agentData,
  narrativeState,
  realitySignals,
  mismatchData,
  silenceEvents,
  assetScope,
  forecast,
  trapChecks,
}: DecisionNarrativeCardProps) {
  const bearishCount = agentData.filter((a) => a.dir === "Bearish").length;
  const totalWeight = agentData.reduce((s, a) => s + a.wt, 0);
  const totalConf = totalWeight > 0
    ? agentData.reduce((s, a) => s + a.conf * a.wt, 0) / totalWeight
    : NaN;
  const confidenceValid = isValid(totalConf);

  const mismatchCount = mismatchData.filter((m) => m.mismatch > 0.6).length;
  const accelCount = realitySignals.filter((s) => Math.abs(s.accel) > 3).length;
  const silenceCount = silenceEvents.length;
  const exhaustedNarratives = narrativeState.filter(
    (n) => n.lifecycle === "exhaustion"
  ).length;

  const scopeLabel = SCOPE_LABELS[assetScope];

  // Determine recommended action — guard against NaN
  const isNoEdge = !confidenceValid || totalConf < 40;
  const isBearish = bearishCount >= 3;
  const action = !confidenceValid
    ? "Insufficient data"
    : isNoEdge
      ? "No edge. Do nothing."
      : isBearish
        ? "Reduce Risk"
        : "Hold Current Position";
  const actionColor = !confidenceValid
    ? "text-bm-muted"
    : isNoEdge
      ? "text-bm-muted"
      : isBearish
        ? "text-bm-danger"
        : "text-bm-accent";

  // Key risk — dynamic from trap checks
  const topTrap = trapChecks?.find(
    (t) => t.variant === "warning" || t.variant === "danger",
  );
  const keyRisk = topTrap
    ? `${topTrap.check}: ${safeStr(topTrap.value)}`
    : mismatchCount > 0
      ? "Narrative-reality divergence elevated"
      : "No elevated risks detected";

  // Scenarios — only render if data is valid and sums to ~100%
  const bullProb = forecast
    ? Math.round((forecast.scenario_bull_prob ?? 0) * 100)
    : NaN;
  const baseProb = forecast
    ? Math.round((forecast.scenario_base_prob ?? 0) * 100)
    : NaN;
  const bearProb = forecast
    ? Math.round((forecast.scenario_bear_prob ?? 0) * 100)
    : NaN;

  const showScenarios = scenariosValid(bullProb, baseProb, bearProb);

  const scenarios = showScenarios ? [
    {
      label: "BULL",
      prob: bullProb,
      variant: "success" as const,
      note: forecast?.synthesis_narrative ? "" : "Requires dovish pivot + stabilization",
    },
    {
      label: "BASE",
      prob: baseProb,
      variant: "accent" as const,
      note: forecast?.synthesis_narrative ? "" : "Grinding chop, data-dependent, slow deterioration",
    },
    {
      label: "BEAR",
      prob: bearProb,
      variant: "danger" as const,
      note: forecast?.synthesis_narrative ? "" : "Credit contagion, tightening, positioning unwind",
    },
  ] : [];

  return (
    <section data-testid="decision-narrative">
      <Card className="p-6">
        {/* Narrative paragraph */}
        <div className="mb-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-bm-muted2 mb-3">
            MARKET STORY
          </p>
          <p className="text-sm text-bm-text leading-relaxed">
            {scopeLabel} are in a <span className="font-semibold text-bm-warning">late-cycle tightening</span> environment
            similar to 2022.{" "}
            {mismatchCount > 0 && (
              <>
                <span className="font-semibold text-bm-danger">
                  Signals are highly conflicted
                </span>
                : reality diverges from narrative on {mismatchCount} of{" "}
                {mismatchData.length} topics.{" "}
              </>
            )}
            {accelCount > 0 && (
              <>
                Change is speeding up in {accelCount} areas.{" "}
              </>
            )}
            {silenceCount > 0 && (
              <>
                {silenceCount} narratives fading (pre-move signal).{" "}
              </>
            )}
            {exhaustedNarratives > 0 && (
              <>
                {exhaustedNarratives} dominant narratives approaching exhaustion.
              </>
            )}
          </p>
        </div>

        {/* Action + Confidence strip */}
        <div className="flex flex-wrap items-center gap-6 mb-5 pb-5 border-b border-bm-border/30">
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">
              Recommended Action
            </p>
            <p className={`text-xl font-mono font-bold ${actionColor}`}>
              {action}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">
              Confidence
            </p>
            <p className="text-xl font-mono font-bold text-bm-text">
              {confidenceValid ? (isNoEdge ? "Low" : `${totalConf.toFixed(0)}%`) : "Not available"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-1">
              Key Risk
            </p>
            <p className="text-sm text-bm-muted">
              {keyRisk}
            </p>
          </div>
        </div>

        {/* Scenario probabilities — only shown if data validates */}
        {showScenarios && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-bm-muted2 mb-3">
              SCENARIO PROBABILITIES
            </p>
            <div className="grid grid-cols-3 gap-3">
              {scenarios.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-bm-border/50 bg-bm-surface/20 p-3 text-center"
                >
                  <Badge variant={s.variant} className="mb-1.5">
                    {s.label}
                  </Badge>
                  <p className="text-2xl font-bold font-mono text-bm-text">
                    {s.prob}%
                  </p>
                  {s.note && (
                    <p className="text-[10px] text-bm-muted2 mt-1.5 leading-relaxed">
                      {s.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {forecast?.synthesis_narrative && (
              <p className="text-[10px] text-bm-muted mt-3 leading-relaxed">
                {forecast.synthesis_narrative}
              </p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
