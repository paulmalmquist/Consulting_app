/* ── Decision Engine Types ─────────────────────────────────── */

export type AssetScope = "global" | "equities" | "crypto" | "real-estate";

export type DecisionTab =
  | "command-center"
  | "history-rhymes"
  | "machine-forecasts"
  | "trap-detector"
  | "paper-portfolio"
  | "calibration"
  | "research-briefs"
  | "market-segments";

export const DECISION_TAB_LABELS: Record<DecisionTab, string> = {
  "command-center": "Command Center",
  "history-rhymes": "History Rhymes",
  "machine-forecasts": "Machine Forecasts",
  "trap-detector": "Trap Detector",
  "paper-portfolio": "Paper Portfolio",
  "calibration": "Calibration",
  "research-briefs": "Research Briefs",
  "market-segments": "Market Segments",
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

/* ── Ensemble & Multi-Agent Forecast Contracts ───────────── */

/** Aggregated ensemble output from extremized logarithmic opinion pooling (α=1.5) */
export interface EnsembleOutput {
  /** Weighted direction: bullish / bearish / neutral */
  direction: "bullish" | "bearish" | "neutral";
  /** Aggregated confidence after extremization (0–100) */
  confidence: number;
  /** Probability distribution over scenarios */
  scenarios: ScenarioProbability[];
  /** Agent-level outputs that fed the ensemble */
  agents: AgentOutput[];
  /** Ensemble-level Brier score (walk-forward, last 52 weeks) */
  ensembleBrier: number;
  /** Plain-English summary of the ensemble conclusion */
  narrativeSummary: string;
  /** When this ensemble was last computed */
  computedAt: string; // ISO timestamp
}

export interface ScenarioProbability {
  label: string; // e.g. "BULL", "BASE", "BEAR"
  probability: number; // 0–1
  expectedReturn: string; // e.g. "+12%"
  description: string;
}

/** Individual forecast agent with walk-forward evaluation history */
export interface ForecastAgent {
  agentId: string;
  name: "Macro" | "Quant" | "Narrative" | "Contrarian" | "Red Team";
  /** Current default weight from model_registry.json */
  defaultWeight: number;
  /** Dynamically adjusted weight based on recent Brier performance */
  adjustedWeight: number;
  /** Rolling Brier score (52-week window) */
  brierScore: number;
  /** Brier score trend: improving / degrading / stable */
  brierTrend: "improving" | "degrading" | "stable";
  /** Last N predictions with outcomes for transparency */
  recentPredictions: PredictionRecord[];
  /** Model/methodology description */
  methodology: string;
}

export interface PredictionRecord {
  predictionId: string;
  date: string; // ISO date
  asset: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  outcome: "correct" | "incorrect" | "pending";
  actualReturn?: number;
  brierContribution: number;
}

/* ── Calibration & Brier Tracking ────────────────────────── */

export interface CalibrationState {
  /** Overall system Brier score */
  overallBrier: number;
  /** Per-agent Brier scores */
  agentBriers: Record<string, number>;
  /** Historical Brier by week for chart */
  brierHistory: BrierHistPoint[];
  /** Calibration curve data: binned predicted vs actual frequencies */
  calibrationCurve: CalibrationBin[];
  /** Total predictions made */
  totalPredictions: number;
  /** Predictions resolved (with known outcome) */
  resolvedPredictions: number;
  /** Whether the system is well-calibrated (Brier < 0.25) */
  isCalibrated: boolean;
  /** Worst-performing agent */
  weakestAgent: string;
  /** Best-performing agent */
  strongestAgent: string;
}

export interface CalibrationBin {
  /** Predicted probability bucket (e.g. 0.1 = 10%) */
  predictedProbability: number;
  /** Actual observed frequency */
  actualFrequency: number;
  /** Number of predictions in this bin */
  count: number;
}

/* ── Data Freshness & System Ops ─────────────────────────── */

export interface DataFreshness {
  source: string; // e.g. "Databricks MVRV", "Housing Starts API", "BLS NFP"
  lastUpdated: string; // ISO timestamp
  staleness: "fresh" | "aging" | "stale"; // <1h, 1-24h, >24h
  nextExpectedUpdate: string | null; // ISO timestamp
  isBlocking: boolean; // whether stale data blocks a decision
}

export interface SystemHealthStatus {
  databricksConnected: boolean;
  supabaseConnected: boolean;
  signalPipelineStatus: "running" | "degraded" | "down";
  lastPipelineRun: string; // ISO timestamp
  dataFreshness: DataFreshness[];
  activeAlerts: SystemAlert[];
}

export interface SystemAlert {
  alertId: string;
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  timestamp: string; // ISO timestamp
  acknowledged: boolean;
}

/* ── History Rhymes Episode Library ──────────────────────── */

/** A historical episode for analog matching */
export interface HistoricalEpisode {
  episodeId: string;
  name: string; // e.g. "GFC 2008", "Crypto Winter 2022"
  category: "macro_crisis" | "sector_rotation" | "bubble_burst" | "policy_shift" | "black_swan" | "regime_change";
  startDate: string; // ISO date
  endDate: string; // ISO date
  /** 256-dim state vector (64 quant + 128 text embedding + 64 derived) */
  stateVectorId: string;
  /** Key characteristics of this episode */
  characteristics: string[];
  /** How it resolved */
  resolution: string;
  /** Asset class most affected */
  primaryAssetClass: "equity" | "crypto" | "bond" | "real_estate" | "commodity" | "multi";
  /** Peak-to-trough drawdown during episode */
  maxDrawdown: number;
  /** Recovery time in trading days */
  recoveryDays: number | null;
}

/** Result of matching current conditions against episode library */
export interface AnalogMatchResult {
  episode: HistoricalEpisode;
  /** Composite rhyme score: 0.6*cosine + 0.3*(1 - norm_DTW) + 0.1*categorical */
  rhymeScore: number;
  /** Cosine similarity of 256-dim state vectors */
  cosineSimilarity: number;
  /** Dynamic Time Warping distance (lower = more similar) */
  dtwDistance: number;
  /** Categorical match score (regime, asset class, policy context) */
  categoricalMatch: number;
  /** What's similar between now and this episode */
  keySimilarities: string[];
  /** Critical differences to watch */
  keyDivergences: string[];
  /** Implied trajectory if this analog plays out */
  impliedTrajectory: TrajectoryPoint[];
}

export interface TrajectoryPoint {
  dayOffset: number; // relative to "today"
  analogValue: number; // normalized price path from the episode
  currentValue: number; // actual current path
  confidenceBand: { upper: number; lower: number };
}

/* ── MSA Zone Intelligence (Real Estate Scope) ───────────── */

export interface MSAZone {
  zoneId: string;
  name: string; // e.g. "Sun Belt Growth"
  tier: 1 | 2 | 3;
  msaList: string[]; // MSA names in this zone
  centroidLat: number;
  centroidLng: number;
}

export interface MSAZoneIntelBrief {
  briefId: string;
  zoneId: string;
  zoneName: string;
  briefDate: string; // ISO date
  /** Composite score: permits, jobs, cap rates, rent growth, migration */
  compositeScore: number;
  /** Signal direction for the zone */
  direction: "bullish" | "bearish" | "neutral";
  /** Key metrics driving the score */
  keyMetrics: MSAMetric[];
  /** Plain-English one-paragraph summary */
  summary: string;
  /** Recommended actions */
  actions: string[];
}

export interface MSAMetric {
  metric: string; // e.g. "Permit Growth YoY", "Net Migration"
  value: number;
  trend: "up" | "down" | "flat";
  nationalComparison: "above" | "below" | "inline";
}

export interface MSAFeatureCard {
  cardId: string;
  zoneId: string;
  msaName: string;
  propertyType: "multifamily" | "office" | "industrial" | "retail" | "mixed";
  capRate: number;
  rentGrowthYoY: number;
  vacancyRate: number;
  permitsYoY: number;
  employmentGrowthYoY: number;
  signal: "buy" | "hold" | "sell" | "watch";
  confidence: number;
}

/* ── Market Rotation Engine (Cross-Vertical) ─────────────── */

export interface MarketSegment {
  segmentId: string;
  name: string;
  vertical: "equities" | "crypto" | "derivatives" | "macro";
  /** Current rotation signal */
  rotationSignal: "overweight" | "neutral" | "underweight";
  /** Momentum score (-100 to 100) */
  momentum: number;
  /** Mean reversion score (-100 to 100) */
  meanReversion: number;
  /** REPE cross-bridge: does this segment have real estate implications? */
  repeBridge: string | null;
  /** Credit cross-bridge: credit market implications */
  creditBridge: string | null;
}

/* ── Podcast Intelligence (Research Tab) ─────────────────── */

export interface PodcastEpisodeSummary {
  episodeId: string;
  podcastName: string;
  title: string;
  publishedAt: string; // ISO date
  speakers: PodcastSpeaker[];
  /** Extracted macro views */
  macroViews: PodcastMacroView[];
  /** Trade ideas mentioned */
  tradeIdeas: PodcastTradeIdea[];
  /** Narrative velocity — how fast narratives are shifting across episodes */
  narrativeVelocity: number;
  /** Adversarial score — how contrarian vs consensus this episode is */
  adversarialScore: number;
  /** Suggested analog matches from podcast mentions */
  rhymeSuggestions: string[];
}

export interface PodcastSpeaker {
  speakerId: string;
  name: string;
  role: string;
  firm: string;
  /** Rolling prediction accuracy */
  trackRecordAccuracy: number | null;
}

export interface PodcastMacroView {
  viewId: string;
  topic: string;
  stance: "bullish" | "bearish" | "neutral" | "uncertain";
  confidence: "high" | "medium" | "low";
  timeHorizon: string;
  supportingEvidence: string;
}

export interface PodcastTradeIdea {
  ideaId: string;
  asset: string;
  direction: "long" | "short" | "hedge";
  conviction: "high" | "medium" | "low";
  rationale: string;
  speakerName: string;
}

/* ── Aggregated Decision Summary ─────────────────────────── */

/** Top-level contract combining all decision engine outputs for a given scope */
export interface DecisionSummary {
  assetScope: AssetScope;
  timestamp: string; // ISO timestamp

  /** Regime classification from Databricks */
  regime: {
    label: string;
    phase: string; // e.g. "Dalio Phase 3"
    confidence: number;
    changedRecently: boolean;
  };

  /** Multi-agent ensemble conclusion */
  ensemble: EnsembleOutput;

  /** Top 3 analog matches */
  topAnalogs: AnalogMatchResult[];

  /** Active traps */
  traps: TrapCheckItem[];

  /** Narrative-reality divergence score (0–1) */
  divergenceScore: number;

  /** Silence events — major narratives gone quiet */
  silenceEvents: SilenceEvent[];

  /** Data freshness across all signal sources */
  dataFreshness: DataFreshness[];

  /** MSA zone briefs (only populated for real-estate scope) */
  msaZoneBriefs: MSAZoneIntelBrief[];

  /** Recent podcast intelligence */
  podcastIntel: PodcastEpisodeSummary[];

  /** Plain-English decision narrative */
  narrative: DecisionNarrative;
}

/* ── Databricks Signal Pipeline Contracts ────────────────── */

/** P0 signals that must flow from Databricks for the engine to function */
export interface DatabricksP0Signals {
  /** Bitcoin MVRV Z-Score */
  mvrvZScore: { value: number; updatedAt: string };
  /** Housing starts (SAAR) */
  housingStarts: { value: number; updatedAt: string };
  /** Building permits (SAAR) */
  buildingPermits: { value: number; updatedAt: string };
  /** Yield curve spread (10Y-2Y) */
  yieldCurveSpread: { value: number; updatedAt: string };
  /** VIX term structure (front/back ratio) */
  vixTermStructure: { value: number; updatedAt: string };
  /** BTC-SPX 30-day rolling correlation */
  btcSpxCorrelation: { value: number; updatedAt: string };
}

/** State vector for analog matching — produced by autoencoder on Databricks */
export interface StateVector {
  vectorId: string;
  /** 64 quantitative features */
  quantitative: number[];
  /** 128-dim text embedding (text-embedding-3-large MRL truncation) */
  textEmbedding: number[];
  /** 64 derived/cross features */
  derived: number[];
  /** Total 256 dimensions */
  dimensions: 256;
  computedAt: string; // ISO timestamp
}
