"use client";

import React, { useState, useMemo } from "react";
import type { AssetScope } from "@/lib/trading-lab/decision-engine-types";
import type { DecisionEngineResult } from "@/components/market/hooks/useDecisionEngine";
import type { ApiPrediction } from "@/components/market/hooks/useDecisionEngine";
import { useAssetScopedData } from "@/components/market/hooks/useAssetScopedData";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  safeNum, safePct, safeScore, isValid, hasData, safeStr, scenariosValid,
} from "@/lib/trading-lab/safe-display";

/* ── Scope selector (replaces sidebar on mobile) ─────────── */

const SCOPES: { scope: AssetScope; label: string }[] = [
  { scope: "global", label: "Global" },
  { scope: "equities", label: "Equities" },
  { scope: "crypto", label: "Crypto" },
  { scope: "real-estate", label: "Real Estate" },
];

function ScopeSegmentedControl({
  active,
  onChange,
}: {
  active: AssetScope;
  onChange: (s: AssetScope) => void;
}) {
  return (
    <div className="flex rounded-lg border border-bm-border/50 bg-bm-bg/80 overflow-hidden">
      {SCOPES.map(({ scope, label }) => (
        <button
          key={scope}
          onClick={() => onChange(scope)}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            active === scope
              ? "bg-bm-accent/15 text-bm-accent border-b-2 border-bm-accent"
              : "text-bm-muted hover:text-bm-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── Data integrity logging ──────────────────────────────── */

interface IntegrityReport {
  missingPipelines: string[];
  hasDecisionData: boolean;
  hasAnalogData: boolean;
  hasTrapData: boolean;
  hasAgentData: boolean;
  hasForecastData: boolean;
}

function validateIntegrity(
  de: DecisionEngineResult | null,
  fallback: ReturnType<typeof useAssetScopedData>,
): IntegrityReport {
  const missing: string[] = [];
  const data = de && !de.loading ? de : null;
  const agents = data?.agentData ?? fallback.agentData;
  const traps = data?.trapChecks ?? fallback.trapChecks;
  const forecast = data?.raw?.forecasts.current ?? null;
  const analog = data?.raw?.analogs.topMatch ?? null;

  if (!hasData(agents)) missing.push("agent-calibration");
  if (!hasData(data?.realitySignals ?? fallback.realitySignals)) missing.push("reality-signals");
  if (!hasData(data?.dataSignals ?? fallback.dataSignals)) missing.push("data-signals");
  if (!analog) missing.push("analog-engine");
  if (!hasData(traps)) missing.push("trap-detector");
  if (!forecast) missing.push("forecast-pipeline");

  if (missing.length > 0 && process.env.NODE_ENV === "development") {
    console.warn("[DecisionEngine] Missing pipelines:", missing.join(", "));
  }

  return {
    missingPipelines: missing,
    hasDecisionData: hasData(agents),
    hasAnalogData: !!analog && hasData(analog.matches),
    hasTrapData: hasData(traps),
    hasAgentData: hasData(agents),
    hasForecastData: !!forecast,
  };
}

/* ── Section A: Decision Block (sticky) ──────────────────── */

function DecisionBlock({
  de,
  fallback,
  assetScope,
  integrity,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
  assetScope: AssetScope;
  integrity: IntegrityReport;
}) {
  const data = de && !de.loading ? de : null;
  const agents = data?.agentData ?? fallback.agentData;
  const narrativeState = data?.narrativeState ?? fallback.narrativeState;
  const mismatchData = data?.mismatchData ?? fallback.mismatchData;
  const trapChecks = data?.trapChecks ?? fallback.trapChecks;

  // Compute ensemble direction + confidence
  const totalWeight = agents.reduce((s, a) => s + a.wt, 0);
  const weightedConf = totalWeight > 0
    ? agents.reduce((s, a) => s + a.conf * a.wt, 0) / totalWeight
    : NaN;

  const bearishCount = agents.filter((a) => a.dir === "Bearish").length;
  const confidenceValid = isValid(weightedConf);

  // Recommended action
  const action = !confidenceValid
    ? "Insufficient data"
    : weightedConf < 40
      ? "No edge. Do nothing."
      : bearishCount >= 3
        ? "Reduce Risk"
        : "Hold Current Position";

  const actionColor = !confidenceValid
    ? "text-bm-muted"
    : weightedConf < 40
      ? "text-bm-muted"
      : bearishCount >= 3
        ? "text-bm-danger"
        : "text-bm-accent";

  // Regime
  const exhaustedNarratives = narrativeState.filter(
    (n) => n.lifecycle === "exhaustion"
  ).length;

  // Key risk
  const topTrap = trapChecks?.find(
    (t) => t.variant === "warning" || t.variant === "danger",
  );
  const keyRisk = topTrap
    ? `${topTrap.check}: ${safeStr(topTrap.value)}`
    : mismatchData.filter((m) => m.mismatch > 0.6).length > 0
      ? "Narrative-reality divergence elevated"
      : "No elevated risks detected";

  const scopeLabels: Record<AssetScope, string> = {
    global: "Markets",
    equities: "Equities",
    crypto: "Crypto",
    "real-estate": "Real Estate",
  };

  return (
    <Card className="p-4 border-l-4 border-l-bm-accent">
      {/* Regime classification */}
      <p className="text-[10px] font-mono uppercase tracking-wider text-bm-muted2 mb-1">
        {scopeLabels[assetScope]} Decision Brief
      </p>
      <p className="text-sm text-bm-text leading-relaxed mb-3">
        {scopeLabels[assetScope]} are in a{" "}
        <span className="font-semibold text-bm-warning">late-cycle tightening</span>{" "}
        environment.
        {exhaustedNarratives > 0 && (
          <> {exhaustedNarratives} dominant narratives approaching exhaustion.</>
        )}
      </p>

      {/* Action + Confidence + Risk */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[9px] text-bm-muted2 uppercase">Recommended Action</p>
            <p className={`text-lg font-mono font-bold ${actionColor}`}>{action}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-bm-muted2 uppercase">Confidence</p>
            <p className="text-lg font-mono font-bold text-bm-text">
              {confidenceValid ? safePct(weightedConf) : "Not available"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Key Risk</p>
          <p className="text-xs text-bm-muted">{keyRisk}</p>
        </div>
      </div>
    </Card>
  );
}

/* ── Section B: What Changed Today ───────────────────────── */

function WhatChangedMobile({
  de,
  fallback,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
}) {
  const data = de && !de.loading ? de : null;
  const realitySignals = data?.realitySignals ?? fallback.realitySignals;
  const dataSignals = data?.dataSignals ?? fallback.dataSignals;

  // Only material changes: reality signals with high acceleration + data surprises
  const materialChanges: { signal: string; detail: string; direction: "bullish" | "bearish" | "neutral" }[] = [];

  for (const s of realitySignals) {
    if (Math.abs(s.accel) > 2) {
      materialChanges.push({
        signal: s.signal,
        detail: `${s.accel > 0 ? "+" : ""}${safeNum(s.accel, (n) => n.toFixed(1))} acceleration, now ${safeNum(s.value)}%`,
        direction: s.accel > 0 && s.value > 0 ? "bullish" : s.accel < 0 && s.value < 0 ? "bearish" : "neutral",
      });
    }
  }

  for (const d of dataSignals) {
    if (d.surprise !== 0 && Math.abs(d.surprise) > 0.05) {
      materialChanges.push({
        signal: d.metric,
        detail: `Reported ${safeNum(d.reported)} vs ${safeNum(d.expected)} expected (${d.surprise > 0 ? "+" : ""}${safeNum(d.surprise)})`,
        direction: d.surprise > 0 ? "bearish" : "bullish",
      });
    }
  }

  if (materialChanges.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
          What Changed Today
        </p>
        <p className="text-xs text-bm-muted2">No material changes.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          What Changed Today
        </p>
        <Badge>{materialChanges.length} DELTAS</Badge>
      </div>
      <div className="space-y-1.5">
        {materialChanges.map((c) => {
          const color = c.direction === "bullish" ? "text-emerald-400" : c.direction === "bearish" ? "text-red-400" : "text-bm-muted";
          return (
            <div key={c.signal} className="flex items-start gap-2 py-1.5 border-b border-bm-border/20 last:border-0">
              <span className={`text-sm font-mono font-bold mt-0.5 ${color}`}>
                {c.direction === "bullish" ? "+" : c.direction === "bearish" ? "-" : "~"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-bm-text">{c.signal}</p>
                <p className="text-[10px] text-bm-muted2">{c.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Section C: History Rhymes (primary module) ──────────── */

function HistoryRhymesMobile({
  de,
  fallback,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
}) {
  const data = de && !de.loading ? de : null;
  const topMatch = data?.raw?.analogs.topMatch;
  const topAnalog = topMatch?.matches?.[0];

  if (!topAnalog) return null; // Don't render without real data

  const analogName = safeStr(topAnalog.episode_name);
  const rhymeScore = topAnalog.rhyme_score;
  const keySim = safeStr(topAnalog.key_similarity);
  const keyDiv = safeStr(topAnalog.key_divergence);
  const isSeed = topMatch?.source === "seed";

  // Forward outcome summary from episode library
  const episodes = data?.raw?.analogs.episodeLibrary ?? [];
  const matchedEpisode = episodes.find(
    (e) => e.name === topAnalog.episode_name || e.id === topAnalog.episode_id,
  );

  const forwardOutcome = matchedEpisode
    ? `Historically led to ${Math.abs(matchedEpisode.peak_to_trough_pct).toFixed(0)}% drawdown over ${matchedEpisode.duration_days} days${
        matchedEpisode.recovery_duration_days
          ? `, recovery took ${matchedEpisode.recovery_duration_days} days`
          : ""
      }`
    : null;

  return (
    <Card className="p-4 border-l-4 border-l-bm-warning">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Top Analog
        </p>
        <Badge variant={isSeed ? "accent" : "success"}>{isSeed ? "SEED" : "LIVE"}</Badge>
      </div>

      {/* Analog headline */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-bm-text">{analogName}</p>
          {isValid(rhymeScore) && (
            <p className="text-[10px] text-bm-muted2 mt-0.5">
              Rhyme Score: <span className="font-mono font-bold text-bm-accent text-sm">{safeScore(rhymeScore)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Key similarities & divergences as first-class insights */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
          <p className="text-[9px] text-emerald-400 uppercase font-bold mb-1">Key Similarities</p>
          <p className="text-xs text-bm-text leading-relaxed">{keySim}</p>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
          <p className="text-[9px] text-amber-400 uppercase font-bold mb-1">Key Divergences</p>
          <p className="text-xs text-bm-text leading-relaxed">{keyDiv}</p>
        </div>
      </div>

      {/* What happened next — forward outcome */}
      {forwardOutcome && (
        <div className="rounded-lg bg-bm-surface/30 border border-bm-border/30 p-3 mb-3">
          <p className="text-[9px] text-bm-muted2 uppercase font-bold mb-1">What Happened Next</p>
          <p className="text-xs text-bm-text leading-relaxed">{forwardOutcome}</p>
        </div>
      )}

      {/* Modern analog thesis from episode if available */}
      {matchedEpisode?.modern_analog_thesis && (
        <p className="text-[10px] text-bm-muted leading-relaxed italic">
          {matchedEpisode.modern_analog_thesis}
        </p>
      )}
    </Card>
  );
}

/* ── Section D: Scenario Probabilities ───────────────────── */

function ScenariosMobile({
  de,
}: {
  de: DecisionEngineResult;
}) {
  const forecast = de.raw?.forecasts.current ?? null;
  if (!forecast) return null;

  const bull = Math.round((forecast.scenario_bull_prob ?? 0) * 100);
  const base = Math.round((forecast.scenario_base_prob ?? 0) * 100);
  const bear = Math.round((forecast.scenario_bear_prob ?? 0) * 100);

  if (!scenariosValid(bull, base, bear)) return null;

  const scenarios = [
    { label: "BULL", prob: bull, variant: "success" as const },
    { label: "BASE", prob: base, variant: "accent" as const },
    { label: "BEAR", prob: bear, variant: "danger" as const },
  ];

  return (
    <Card className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-3">
        Scenario Probabilities
      </p>
      <div className="grid grid-cols-3 gap-2">
        {scenarios.map((s) => (
          <div key={s.label} className="text-center rounded-lg border border-bm-border/40 bg-bm-surface/15 p-3">
            <Badge variant={s.variant} className="mb-1">{s.label}</Badge>
            <p className="text-xl font-bold font-mono text-bm-text">{s.prob}%</p>
          </div>
        ))}
      </div>
      {forecast.synthesis_narrative && (
        <p className="text-[10px] text-bm-muted mt-3 leading-relaxed">
          {forecast.synthesis_narrative}
        </p>
      )}
    </Card>
  );
}

/* ── Section E: Trap Detector ────────────────────────────── */

function TrapDetectorMobile({
  de,
  fallback,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
}) {
  const data = de && !de.loading ? de : null;
  const trapChecks = data?.trapChecks ?? fallback.trapChecks;
  const positioningData = data?.positioningData ?? fallback.positioningData;

  const activeTraps = trapChecks.filter(
    (t) => t.variant === "warning" || t.variant === "danger",
  );

  // If no active traps at all, hide the section entirely
  if (activeTraps.length === 0) return null;

  const honeypots = data?.raw?.traps.honeypotPatterns ?? [];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Trap Detector
        </p>
        <Badge variant={activeTraps.length > 2 ? "danger" : "warning"}>
          {activeTraps.length} ACTIVE
        </Badge>
      </div>

      <div className="space-y-2">
        {activeTraps.map((t) => {
          // Narrative-style reasoning instead of numeric junk
          const reasoning = buildTrapNarrative(t.check, t.value, positioningData, honeypots);
          return (
            <div key={t.check} className="rounded-lg bg-bm-surface/15 border border-bm-border/30 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-bm-text">{t.check}</span>
                <Badge variant={t.variant}>{t.status}</Badge>
              </div>
              <p className="text-[11px] text-bm-muted leading-relaxed">{reasoning}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function buildTrapNarrative(
  check: string,
  value: string,
  positioning: { asset: string; crowding: number; extreme: boolean }[],
  honeypots: { name: string; apparent_signal: string; actual_outcome: string; flow_narrative_mismatch: boolean }[],
): string {
  switch (check) {
    case "Flow / Narrative":
      return `Flow vs narrative mismatch: ${safeStr(value, "bearish talk but buying flows detected")}. Actions contradict stated convictions.`;
    case "Crowding Score": {
      const extremes = positioning.filter((p) => p.extreme);
      const crowdedAssets = extremes.map((p) => p.asset).join(", ");
      return `Crowding elevated${crowdedAssets ? ` in ${crowdedAssets}` : ""}. ${safeStr(value)}. Vulnerable to position unwind.`;
    }
    case "Info Provenance":
      return `Low-provenance sources amplified: ${safeStr(value)}. Discount these narratives when making decisions.`;
    case "Consensus Divergence":
      return `Agent disagreement detected: ${safeStr(value)}. Low consensus increases uncertainty.`;
    case "Honeypot Match": {
      const topHoneypot = honeypots[0];
      if (topHoneypot) {
        return `Pattern matches "${topHoneypot.name}": appears to signal ${topHoneypot.apparent_signal}, but historically resulted in ${topHoneypot.actual_outcome}.`;
      }
      return `Nearest historical trap pattern: ${safeStr(value)}.`;
    }
    default:
      return safeStr(value);
  }
}

/* ── Section F: Model Transparency (collapsible) ─────────── */

function ModelTransparencyMobile({
  de,
  fallback,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = de && !de.loading ? de : null;
  const agents = data?.agentData ?? fallback.agentData;
  const brierHist = data?.brierHist ?? fallback.brierHist;
  const ensemble = data?.raw?.agents.ensemble;

  if (!hasData(agents)) return null;

  const totalWeight = agents.reduce((s, a) => s + a.wt, 0);
  const weightedConf = totalWeight > 0
    ? agents.reduce((s, a) => s + a.conf * a.wt, 0) / totalWeight
    : NaN;

  const ensembleDir = ensemble?.direction ?? (
    agents.filter((a) => a.dir === "Bearish").length >= 3 ? "Bearish Lean" : "Mixed"
  );

  return (
    <Card className="p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Model Transparency
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-bm-muted">{agents.length} agents</span>
          <span className="text-bm-muted2 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Summary strip always visible */}
      <div className="flex items-center gap-4 mt-3">
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Ensemble</p>
          <p className="text-sm font-mono font-bold text-bm-warning">{ensembleDir}</p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Confidence</p>
          <p className="text-sm font-mono font-bold text-bm-text">
            {isValid(weightedConf) ? safePct(weightedConf) : "Not available"}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-0.5 border-t border-bm-border/30 pt-3">
          {agents.map((a) => {
            const dirColor =
              a.dir === "Bullish" ? "text-emerald-400"
                : a.dir === "Bearish" ? "text-red-400"
                  : a.dir === "TRAP" ? "text-amber-400"
                    : "text-bm-muted";
            return (
              <div
                key={a.agent}
                className="flex items-center justify-between py-1.5 border-b border-bm-border/20 last:border-0"
              >
                <span className="text-xs font-semibold text-bm-text w-16">{a.agent}</span>
                <span className={`text-[10px] font-bold ${dirColor} w-14`}>{a.dir}</span>
                <div className="flex-1 mx-2">
                  <div className="h-1.5 rounded-full bg-bm-bg overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        a.dir === "Bullish" ? "bg-emerald-400/70"
                          : a.dir === "Bearish" ? "bg-red-400/70"
                            : "bg-amber-400/70"
                      }`}
                      style={{ width: `${a.conf}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono text-[10px] text-bm-muted w-8 text-right">
                  {isValid(a.conf) ? `${a.conf}%` : "—"}
                </span>
              </div>
            );
          })}

          {/* Brier calibration check */}
          {hasData(brierHist) && (
            <div className="mt-2 pt-2 border-t border-bm-border/30">
              <p className="text-[9px] text-bm-muted2 uppercase">Calibration (Brier)</p>
              <p className="text-xs text-bm-muted">
                Latest: {safeScore(brierHist[brierHist.length - 1]?.agg)}{" "}
                <span className="text-bm-muted2">(target: &lt;0.20, coin flip: 0.25)</span>
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Section G: Signal Layers (deep dive, collapsed) ─────── */

function SignalLayersMobile({
  de,
  fallback,
}: {
  de: DecisionEngineResult;
  fallback: ReturnType<typeof useAssetScopedData>;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = de && !de.loading ? de : null;
  const realitySignals = data?.realitySignals ?? fallback.realitySignals;
  const dataSignals = data?.dataSignals ?? fallback.dataSignals;
  const narrativeState = data?.narrativeState ?? fallback.narrativeState;

  const totalSignals = realitySignals.length + dataSignals.length + narrativeState.length;
  if (totalSignals === 0) return null;

  return (
    <Card className="p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Signal Layers
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-bm-muted">{totalSignals} signals</span>
          <span className="text-bm-muted2 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Reality signals */}
          {hasData(realitySignals) && (
            <div>
              <p className="text-[9px] font-bold uppercase text-emerald-500 mb-1">Reality</p>
              <p className="text-[10px] text-bm-muted leading-relaxed">
                {realitySignals
                  .sort((a, b) => Math.abs(b.accel) - Math.abs(a.accel))
                  .slice(0, 5)
                  .map((s) => `${s.signal} (${s.accel > 0 ? "+" : ""}${safeNum(s.accel, (n) => n.toFixed(1))})`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {/* Data signals */}
          {hasData(dataSignals) && (
            <div>
              <p className="text-[9px] font-bold uppercase text-sky-400 mb-1">Data</p>
              <p className="text-[10px] text-bm-muted leading-relaxed">
                {dataSignals
                  .filter((d) => d.surprise !== 0)
                  .map((d) => `${d.metric}: ${safeNum(d.reported)} (${d.surprise > 0 ? "+" : ""}${safeNum(d.surprise)} surprise)`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {/* Narrative state */}
          {hasData(narrativeState) && (
            <div>
              <p className="text-[9px] font-bold uppercase text-amber-400 mb-1">Narrative</p>
              <p className="text-[10px] text-bm-muted leading-relaxed">
                {narrativeState
                  .sort((a, b) => b.intensity - a.intensity)
                  .slice(0, 4)
                  .map((n) => `${n.label} (${n.lifecycle}, ${n.intensity}% intensity)`)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Main component ──────────────────────────────────────── */

interface MobileDecisionEngineProps {
  assetScope: AssetScope;
  onScopeChange: (scope: AssetScope) => void;
  decisionEngine: DecisionEngineResult;
}

export function MobileDecisionEngine({
  assetScope,
  onScopeChange,
  decisionEngine: de,
}: MobileDecisionEngineProps) {
  const fallback = useAssetScopedData(assetScope);

  const integrity = useMemo(
    () => validateIntegrity(de, fallback),
    [de, fallback],
  );

  if (de.loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-bm-surface/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (de.error) {
    return (
      <div className="p-4">
        <Card className="p-4">
          <p className="text-xs text-bm-danger font-mono">
            Decision engine unavailable: {de.error}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky top: scope selector + decision block */}
      <div className="sticky top-0 z-20 bg-bm-bg/95 backdrop-blur-sm pb-2 px-4 pt-3 space-y-3 border-b border-bm-border/30">
        <ScopeSegmentedControl active={assetScope} onChange={onScopeChange} />
        <DecisionBlock
          de={de}
          fallback={fallback}
          assetScope={assetScope}
          integrity={integrity}
        />
      </div>

      {/* Scrollable content — decision-first ordering */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* B. What Changed Today */}
        <WhatChangedMobile de={de} fallback={fallback} />

        {/* C. History Rhymes (primary module) */}
        <HistoryRhymesMobile de={de} fallback={fallback} />

        {/* D. Scenario Probabilities */}
        <ScenariosMobile de={de} />

        {/* E. Trap Detector */}
        <TrapDetectorMobile de={de} fallback={fallback} />

        {/* F. Model Transparency (collapsible) */}
        <ModelTransparencyMobile de={de} fallback={fallback} />

        {/* G. Signal Layers (collapsed by default) */}
        <SignalLayersMobile de={de} fallback={fallback} />
      </div>
    </div>
  );
}
