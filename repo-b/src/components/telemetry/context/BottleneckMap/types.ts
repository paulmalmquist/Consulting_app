// Shared types for the Bottleneck Map context module. One event model drives all four panels.

export type InnovationKey = "mission" | "cost" | "reuse" | "manufacturing" | "dataops";
export type FundingKey = "government" | "costplus" | "fixedprice" | "venture";
export type DimensionKey = InnovationKey | FundingKey;
export type ColorByKey = "type" | "funding";
export type OutcomeKey = "success" | "partial" | "planned";
export type FocusPanelKey = "map" | "cost" | "mix";
export type SizeModeKey = "scale" | "payload";

export type TimeWindow = readonly [number, number];

export interface DimensionEntry {
  color: string;
  label: string;
}

// Optional era backdrop for the Overview hero (Phase 9B). Decorative/illustrative only — never a
// historical photograph and never a source of evidence. Rendered as a CSS background behind a scrim,
// so a missing `image` degrades to the `tone` wash (no broken-image glyph).
export interface EventBackdrop {
  /** Path under /public, e.g. "/telemetry/backdrops/dataops.svg". Optional — tone wash is the floor. */
  image?: string;
  /** Accessible description. Must not imply the asset is a real photo of the event. */
  alt: string;
  /** Base wash color, tied to the era for relevance. */
  tone: string;
  /** CSS background-position; defaults to "center". */
  focus?: string;
  /** CSS background-size; defaults to "cover". Use e.g. "62% auto" to show a centered logo at scale. */
  size?: string;
  /** Honesty label shown in the UI — these assets are generative/curated, never evidence. */
  sourceKind: "generative" | "curated" | "illustrative";
  credit?: string;
}

export interface CostPoint {
  v: string;
  nominal: number;
  adj: number;
  basis: string;
}

export interface YearPoint {
  year: number;
  attempts: number | null;
  commercialPct: number | null;
  governmentPct: number | null;
  costNominal: number | null;
  costAdj: number | null;
  costMeta: CostPoint | null;
}

export interface LaunchEvent {
  id: string;
  name: string;
  date: string;
  year: number;
  band: number;
  scale: number;
  payloadT: number;
  type: InnovationKey;
  funding: FundingKey;
  outcome: OutcomeKey;
  focusPanel: FocusPanelKey;
  vehicle: string;
  era: string;
  caption: string;
  detail: string;
  metrics: [label: string, value: string][];
  bottleneckSolved: string;
  bottleneckCreated: string;
  dataProduct: string;
  rhyme: string;
  /** Optional per-event override for the Overview hero backdrop; falls back to the era theme. */
  backdrop?: EventBackdrop;
}

// Event decorated with the values the active color/size dimension resolves to.
export interface DecoratedEvent extends LaunchEvent {
  sizeValue: number;
  color: string;
  dimLabel: string;
}

export interface KpiSummary {
  window: string;
  attempts: string;
  share: string;
  shareYear: number | null;
  cost: string;
  costLabel: string;
  events: number;
}
