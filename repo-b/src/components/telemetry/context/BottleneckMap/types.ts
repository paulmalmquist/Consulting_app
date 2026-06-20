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
