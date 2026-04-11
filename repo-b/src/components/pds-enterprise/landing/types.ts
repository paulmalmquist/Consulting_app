export type TrendDirection = "up" | "down" | "flat";
export type RowStatus = "stable" | "watching" | "pressured" | "critical";

export interface LandingHeroMetrics {
  posture: RowStatus;
  totalExposure: number;
  netVariance: number;
  accountsAtRisk: number;
  directionalDelta: number;
}

export interface RiskSummaryModel {
  atRiskCount: number;
  watchlistCount: number;
  stableCount: number;
  totalShortfall: number;
  largestNegativeDriver: string;
  largestPositiveDriver: string;
}

export interface AccountRollupRow {
  id: string;
  name: string;
  status: RowStatus;
  exposure: number;
  variance: number;
  trend: TrendDirection;
  openIssuesCount: number;
  nextAction: string;
}

export interface MarketRollupRow {
  id: string;
  name: string;
  aggregatedExposure: number;
  riskScore: number;
  variance: number;
  trend: TrendDirection;
  impactedAccounts: number;
  nextAction: string;
}

export interface PrioritizedItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  exposure: number;
  issueSummary: string;
  whyNow: string;
  nextMove: string;
  status: RowStatus;
  sourceType: "account" | "market";
}
