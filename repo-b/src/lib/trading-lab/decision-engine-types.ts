/* ── Decision Engine Types ─────────────────────────────────── */

export type AssetScope = "global" | "equities" | "crypto" | "real-estate";

export type DecisionTab =
  | "command-center"
  | "history-rhymes"
  | "machine-forecasts"
  | "trap-detector"
  | "paper-portfolio"
  | "calibration"
  | "research-briefs";

export const DECISION_TAB_LABELS: Record<DecisionTab, string> = {
  "command-center": "Command Center",
  "history-rhymes": "History Rhymes",
  "machine-forecasts": "Machine Forecasts",
  "trap-detector": "Trap Detector",
  "paper-portfolio": "Paper Portfolio",
  "calibration": "Calibration",
  "research-briefs": "Research Briefs",
};

export const ASSET_SCOPE_LABELS: Record<AssetScope, string> = {
  global: "Global View",
  equities: "Equities",
  crypto: "Crypto",
  "real-estate": "Real Estate",
};

/* ── Panel data contracts ─────────────────────────────────── */

export interface DecisionNarrative {
  regime: string;
  regimeDescription: string;
  narrativeParagraph: string;
  baseCase: { probability: number; description: string; expectedReturn: string };
  bearCase: { probability: number; description: string; expectedReturn: string };
  bullCase: { probability: number; description: string; expectedReturn: string };
  recommendedAction: string;
  confidence: number;
  keyRisk: string;
  doNothingReason: string | null;
}

export interface AgentOutput {
  agent: "Macro" | "Quant" | "Narrative" | "Contrarian" | "Red Team";
  direction: string;
  confidence: number;
  brierScore: number;
  weight: number;
  reasoning: string;
}

export interface TrapCheckItem {
  check: string;
  status: string;
  value: string;
  variant: "success" | "warning" | "danger" | "accent";
  actionAdjustment: string | null;
  explanation: string;
}

export interface WhatChangedDelta {
  signal: string;
  previousValue: string;
  currentValue: string;
  delta: string;
  impactOnProbability: string;
  direction: "bullish" | "bearish" | "neutral";
}

export interface AnalogMatch {
  name: string;
  rhymeScore: number;
  keySimilarity: string;
  keyDivergence: string;
}

/* ── Raw mock data shapes (matching HistoryRhymesTab) ─────── */

export interface RealitySignal {
  domain: string;
  signal: string;
  value: number;
  accel: number;
  trend: string;
  confidence: number;
}

export interface DataSignal {
  metric: string;
  reported: number;
  expected: number;
  surprise: number;
  trend: string;
  revision: string;
}

export interface NarrativeItem {
  label: string;
  intensity: number;
  velocity: number;
  lifecycle: string;
  crowding: number;
  manipulation: number;
}

export interface PositioningItem {
  asset: string;
  metric: string;
  value: string;
  crowding: number;
  extreme: boolean;
  direction: string;
}

export interface AgentDataItem {
  agent: string;
  dir: string;
  conf: number;
  brier: number;
  wt: number;
}

export interface TrapCheckRaw {
  check: string;
  status: string;
  variant: "success" | "warning" | "danger" | "accent";
  value: string;
}

export interface MismatchItem {
  topic: string;
  reality: string;
  data: string;
  narrative: string;
  mismatch: number;
}

export interface SilenceEvent {
  label: string;
  priorIntensity: number;
  currentIntensity: number;
  dropoff: number;
  significance: number;
}

export interface RadarDim {
  d: string;
  current: number;
  gfc: number;
  crypto22: number;
}

export interface BrierHistPoint {
  w: string;
  agg: number;
  base: number;
  narrative: number;
}

export interface AnalogOverlayPoint {
  day: number;
  current: number;
  gfc: number;
  crypto22: number;
}
