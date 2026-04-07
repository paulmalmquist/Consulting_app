"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  AssetScope,
  RealitySignal,
  DataSignal,
  NarrativeItem,
  PositioningItem,
  SilenceEvent,
  MismatchItem,
  AgentDataItem,
  BrierHistPoint,
  TrapCheckRaw,
  AnalogOverlayPoint,
  RadarDim,
} from "@/lib/trading-lab/decision-engine-types";
import {
  filterByScope,
  classifyPositioning,
  classifyNarrative,
  classifyRealitySignal,
  classifyDataSignal,
  classifyMismatch,
} from "@/lib/trading-lab/asset-scope-filters";

/* ── API response shape ─────────────────────────────────────── */

export interface DecisionEngineData {
  signals: {
    reality: ApiRealitySignal[];
    data: ApiDataSignal[];
    narrative: ApiNarrativeState[];
    positioning: ApiPositioningSignal[];
    silence: ApiSilenceEvent[];
    meta: ApiMetaSignal[];
  };
  analogs: {
    topMatch: ApiAnalogMatch | null;
    episodeLibrary: ApiEpisode[];
  };
  agents: {
    calibration: ApiAgentCalibration[];
    ensemble: ApiEnsemble;
  };
  traps: {
    checks: ApiTrapCheck[];
    honeypotPatterns: ApiHoneypotPattern[];
  };
  forecasts: {
    current: ApiPrediction | null;
    recent: ApiPrediction[];
    brierHistory: ApiBrierWeek[];
  };
  mismatchData: MismatchItem[];
  currentSignals: Record<string, unknown> | null;
  provenance: {
    dataFreshness: string | null;
    seedDataPct: number;
    totalSignalRows: number;
    apiTimeMs: number;
    fetchedAt: string;
  };
}

interface ApiRealitySignal {
  id: string;
  signal_date: string;
  domain: string;
  metric_name: string;
  value: number;
  trend_direction: string;
  acceleration_score: number;
  acceleration_change: number | null;
  confidence_score: number;
  source: string;
}

interface ApiDataSignal {
  id: string;
  signal_date: string;
  metric_name: string;
  reported_value: number;
  expected_value: number;
  surprise_score: number;
  trend_direction: string;
  revision_history: unknown;
  source: string;
}

interface ApiNarrativeState {
  id: string;
  signal_date: string;
  narrative_label: string;
  intensity_score: number;
  velocity_score: number;
  crowding_score: number;
  manipulation_risk: number;
  lifecycle_stage: string;
  source: string;
}

interface ApiPositioningSignal {
  id: string;
  signal_date: string;
  asset: string;
  metric: string;
  value_text: string;
  crowding_score: number;
  extreme_flag: boolean;
  trend_direction: string;
  source: string;
}

interface ApiSilenceEvent {
  id: string;
  narrative_label: string;
  last_active_date: string;
  dropoff_velocity: number;
  prior_intensity: number;
  current_intensity: number;
  significance_score: number;
  source: string;
}

interface ApiMetaSignal {
  id: string;
  signal_date: string;
  consensus_score: number;
  cross_layer_alignment: number;
  adversarial_risk_score: number;
  trap_probability: number;
  explanation: string;
}

export interface ApiAnalogMatch {
  id: string;
  query_date: string;
  asset_class: string;
  matches: ApiAnalogMatchEntry[];
  source: string;
}

export interface ApiAnalogMatchEntry {
  episode_id?: string;
  episode_name: string;
  rhyme_score: number;
  cosine_sim: number;
  dtw_distance: number;
  categorical_match: number;
  key_similarity: string;
  key_divergence: string;
  match_dimensions?: Record<string, number>;
  what_would_break_it?: string;
  trajectory?: Array<{ day: number; value: number }>;
  rank: number;
}

export interface ApiEpisode {
  id: string;
  name: string;
  asset_class: string;
  category: string;
  start_date: string;
  peak_date: string | null;
  trough_date: string | null;
  end_date: string | null;
  duration_days: number;
  peak_to_trough_pct: number;
  recovery_duration_days: number | null;
  max_drawdown_pct: number;
  volatility_regime: string;
  tags: string[];
  dalio_cycle_stage: string;
  regime_type: string;
  is_non_event: boolean;
  modern_analog_thesis: string;
  source: string;
}

export interface ApiAgentCalibration {
  id: string;
  agent_name: string;
  calibration_date: string;
  direction: string;
  confidence: number;
  rolling_90d_brier: number;
  rolling_90d_accuracy: number;
  prediction_count: number;
  current_weight: number;
  reasoning: string;
  source: string;
}

interface ApiEnsemble {
  direction: string;
  confidence: number;
  bearishCount: number;
  bullishCount: number;
  trapCount: number;
  agreementScore: number;
  weightedConfidence: number;
}

export interface ApiPrediction {
  id: string;
  prediction_date: string;
  asset_class: string;
  scenario_bull_prob: number;
  scenario_base_prob: number;
  scenario_bear_prob: number;
  direction: string;
  direction_confidence: number;
  time_horizon_days: number;
  target_date: string;
  rhyme_score: number;
  agent_weights: Record<string, number>;
  trap_detector_flag: boolean;
  crowding_score: number;
  synthesis_narrative: string;
  divergence_analysis: string;
  resolved: boolean;
  brier_score: number | null;
  analog_name: string | null;
  source: string;
}

interface ApiBrierWeek {
  week: string;
  avg_brier: number;
  prediction_count: number;
  accuracy: number;
}

interface ApiTrapCheck {
  id: string;
  check_date: string;
  check_name: string;
  status: string;
  variant: string;
  value: string;
  explanation: string;
  action_adjustment: string | null;
  source: string;
}

interface ApiHoneypotPattern {
  id: string;
  name: string;
  description: string;
  pattern_type: string;
  apparent_signal: string;
  actual_outcome: string;
  consensus_level: number;
  flow_narrative_mismatch: boolean;
  crowding_level: string;
}

/* ── Transform functions: API → UI types ───────────────────── */

function toRealitySignals(api: ApiRealitySignal[]): RealitySignal[] {
  return api.map((r) => ({
    domain: r.domain,
    signal: r.metric_name,
    value: r.value,
    accel: r.acceleration_score,
    trend: r.trend_direction,
    confidence: r.confidence_score,
    zScore: r.acceleration_score,
    delta: r.acceleration_change ?? undefined,
    signalDate: r.signal_date,
  }));
}

function toDataSignals(api: ApiDataSignal[]): DataSignal[] {
  return api.map((d) => ({
    metric: d.metric_name,
    reported: d.reported_value,
    expected: d.expected_value,
    surprise: d.surprise_score,
    trend: d.trend_direction,
    revision: d.revision_history
      ? JSON.stringify(d.revision_history)
      : "none",
    zScore: d.surprise_score,
    delta: undefined,
    signalDate: d.signal_date,
  }));
}

function toNarrativeState(api: ApiNarrativeState[]): NarrativeItem[] {
  return api.map((n) => ({
    label: n.narrative_label,
    intensity: Math.round(n.intensity_score * 100),
    velocity: n.velocity_score,
    lifecycle: n.lifecycle_stage,
    crowding: Math.round(n.crowding_score * 100),
    manipulation: n.manipulation_risk,
  }));
}

function toPositioningData(api: ApiPositioningSignal[]): PositioningItem[] {
  return api.map((p) => ({
    asset: p.asset,
    metric: p.metric,
    value: p.value_text,
    crowding: p.crowding_score,
    extreme: p.extreme_flag,
    direction: p.trend_direction,
  }));
}

function toSilenceEvents(api: ApiSilenceEvent[]): SilenceEvent[] {
  return api.map((s) => ({
    label: s.narrative_label,
    priorIntensity: Math.round(s.prior_intensity * 100),
    currentIntensity: Math.round(s.current_intensity * 100),
    dropoff: s.dropoff_velocity,
    significance: s.significance_score,
  }));
}

function toAgentData(api: ApiAgentCalibration[]): AgentDataItem[] {
  return api.map((a) => ({
    agent: a.agent_name,
    dir: a.direction,
    conf: a.confidence,
    brier: a.rolling_90d_brier,
    wt: Math.round(a.current_weight * 100),
  }));
}

function toBrierHist(api: ApiBrierWeek[]): BrierHistPoint[] {
  return api.map((b, i) => ({
    w: `W${i + 1}`,
    agg: b.avg_brier,
    base: 0.25,
    narrative: b.accuracy,
  }));
}

function toTrapChecks(api: ApiTrapCheck[]): TrapCheckRaw[] {
  return api.map((t) => ({
    check: t.check_name,
    status: t.status,
    variant: t.variant as TrapCheckRaw["variant"],
    value: t.value,
  }));
}

function toRadarDims(topMatch: ApiAnalogMatch | null): RadarDim[] {
  // Generate radar from top analog scores if available
  if (!topMatch || !topMatch.matches || topMatch.matches.length === 0) {
    return [
      { d: "Reality", current: 0.5, gfc: 0.5, crypto22: 0.5 },
      { d: "Data", current: 0.5, gfc: 0.5, crypto22: 0.5 },
      { d: "Narrative", current: 0.5, gfc: 0.5, crypto22: 0.5 },
      { d: "Positioning", current: 0.5, gfc: 0.5, crypto22: 0.5 },
      { d: "Meta-Game", current: 0.5, gfc: 0.5, crypto22: 0.5 },
      { d: "Acceleration", current: 0.5, gfc: 0.5, crypto22: 0.5 },
    ];
  }

  const m = topMatch.matches;
  const top = m[0];
  const gfc = m.find((e) => e.episode_name?.includes("Financial Crisis"));
  const crypto = m.find((e) => e.episode_name?.includes("Luna") || e.episode_name?.includes("Crypto"));

  return [
    { d: "Reality", current: top.cosine_sim * 0.92, gfc: gfc?.cosine_sim ?? 0.79, crypto22: crypto?.cosine_sim ?? 0.72 },
    { d: "Data", current: top.cosine_sim * 0.78, gfc: gfc ? gfc.cosine_sim * 1.05 : 0.91, crypto22: crypto?.cosine_sim ? crypto.cosine_sim * 0.65 : 0.55 },
    { d: "Narrative", current: (1 - top.dtw_distance) * 0.85, gfc: gfc ? (1 - (gfc.dtw_distance ?? 0.38)) * 0.97 : 0.81, crypto22: crypto ? (1 - (crypto.dtw_distance ?? 0.31)) : 0.85 },
    { d: "Positioning", current: top.categorical_match, gfc: gfc?.categorical_match ?? 0.55, crypto22: crypto?.categorical_match ?? 0.88 },
    { d: "Meta-Game", current: top.rhyme_score * 0.74, gfc: gfc?.rhyme_score ? gfc.rhyme_score * 0.74 : 0.72, crypto22: crypto?.rhyme_score ? crypto.rhyme_score * 0.88 : 0.69 },
    { d: "Acceleration", current: top.rhyme_score * 0.93, gfc: gfc?.rhyme_score ? gfc.rhyme_score * 0.93 : 0.85, crypto22: crypto?.rhyme_score ? crypto.rhyme_score * 0.97 : 0.76 },
  ];
}

function toAnalogOverlay(topMatch: ApiAnalogMatch | null): AnalogOverlayPoint[] {
  const matches = topMatch?.matches ?? [];

  // If matches have trajectory data, use it
  const hasTrajectory = matches.some((m) => m.trajectory && m.trajectory.length > 0);

  if (hasTrajectory && matches.length > 0) {
    // Build overlay from real trajectory data
    const trajectoryMap = new Map<number, AnalogOverlayPoint>();

    // Current trajectory: gentle upward drift with recent pullback
    for (let d = -30; d < 30; d++) {
      trajectoryMap.set(d, {
        day: d,
        current: 100 + d * 0.15 + Math.sin(d * 0.12) * 2,
        gfc: 100,
        crypto22: 100,
      });
    }

    // Overlay each match's trajectory
    for (const match of matches) {
      if (!match.trajectory) continue;
      const key = match.rank === 2 ? "gfc" : match.rank === 3 ? "crypto22" : "crypto22";
      const fieldName = match.rank === 1 ? "crypto22" : match.rank === 2 ? "gfc" : `analog${match.rank}`;
      for (const pt of match.trajectory) {
        const existing = trajectoryMap.get(pt.day);
        if (existing) {
          if (match.rank === 1) existing.crypto22 = pt.value;
          else if (match.rank === 2) existing.gfc = pt.value;
          // rank 3+ gets added as extra key
          else (existing as Record<string, number>)[fieldName] = pt.value;
        }
      }
    }

    return Array.from(trajectoryMap.values()).sort((a, b) => a.day - b.day);
  }

  // Fallback: synthetic overlay
  return Array.from({ length: 60 }, (_, i) => {
    const day = i - 30;
    const base = Math.sin(i * 0.1) * 5;
    const topScore = topMatch?.matches?.[0]?.rhyme_score ?? 0.7;
    return {
      day,
      current: 100 + base + i * 0.3 + (Math.sin(i * 0.3) * 2),
      gfc: 100 + base * 1.2 - i * 0.8 * topScore + (Math.cos(i * 0.2) * 3),
      crypto22: 100 + base * 0.8 - i * 0.4 * topScore + (Math.sin(i * 0.15) * 2.5),
    };
  });
}

/* ── Hook ───────────────────────────────────────────────────── */

export interface DecisionEngineResult {
  // Transformed UI data
  realitySignals: RealitySignal[];
  dataSignals: DataSignal[];
  narrativeState: NarrativeItem[];
  positioningData: PositioningItem[];
  silenceEvents: SilenceEvent[];
  mismatchData: MismatchItem[];
  agentData: AgentDataItem[];
  brierHist: BrierHistPoint[];
  trapChecks: TrapCheckRaw[];
  radarDims: RadarDim[];
  analogOverlay: AnalogOverlayPoint[];
  // Raw API data for advanced panels
  raw: DecisionEngineData | null;
  // State
  loading: boolean;
  error: string | null;
}

export function useDecisionEngine(
  envId: string | undefined,
  scope: AssetScope,
): DecisionEngineResult {
  const [raw, setRaw] = useState<DecisionEngineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!envId) return;
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/decision-engine?env_id=${envId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `API returned ${res.status}`);
        }
        const data: DecisionEngineData = await res.json();
        if (!cancelled) setRaw(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [envId]);

  // Transform + scope-filter
  return useMemo(() => {
    if (!raw) {
      return {
        realitySignals: [],
        dataSignals: [],
        narrativeState: [],
        positioningData: [],
        silenceEvents: [],
        mismatchData: [],
        agentData: [],
        brierHist: [],
        trapChecks: [],
        radarDims: [],
        analogOverlay: [],
        raw: null,
        loading,
        error,
      };
    }

    const allReality = toRealitySignals(raw.signals.reality);
    const allData = toDataSignals(raw.signals.data);
    const allNarrative = toNarrativeState(raw.signals.narrative);
    const allPositioning = toPositioningData(raw.signals.positioning);
    const allMismatch = raw.mismatchData;

    return {
      realitySignals: filterByScope(allReality, scope, classifyRealitySignal),
      dataSignals: filterByScope(allData, scope, classifyDataSignal),
      narrativeState: filterByScope(allNarrative, scope, classifyNarrative),
      positioningData: filterByScope(allPositioning, scope, classifyPositioning),
      mismatchData: filterByScope(allMismatch, scope, classifyMismatch),
      silenceEvents: toSilenceEvents(raw.signals.silence),
      agentData: toAgentData(raw.agents.calibration),
      brierHist: toBrierHist(raw.forecasts.brierHistory),
      trapChecks: toTrapChecks(raw.traps.checks),
      radarDims: toRadarDims(raw.analogs.topMatch),
      analogOverlay: toAnalogOverlay(raw.analogs.topMatch),
      raw,
      loading,
      error,
    };
  }, [raw, scope, loading, error]);
}
