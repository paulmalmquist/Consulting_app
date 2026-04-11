import {
  type PdsV2CommandCenter,
  type PdsV2InterventionQueueItem,
  type PdsV2PerformanceRow,
} from "@/lib/bos-api";
import type {
  AccountRollupRow,
  LandingHeroMetrics,
  MarketRollupRow,
  PrioritizedItem,
  RiskSummaryModel,
  RowStatus,
  TrendDirection,
} from "./types";

export function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function toCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function toNumber(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function statusFromHealth(health?: string | null): RowStatus {
  const normalized = (health || "").toLowerCase();
  if (["critical", "red", "at_risk"].some((v) => normalized.includes(v))) return "critical";
  if (["warning", "orange", "pressured"].some((v) => normalized.includes(v))) return "pressured";
  if (["watch", "yellow"].some((v) => normalized.includes(v))) return "watching";
  return "stable";
}

function trendFromVariance(variance: number): TrendDirection {
  if (variance > 0) return "up";
  if (variance < 0) return "down";
  return "flat";
}


function severityToStatus(severity: string): RowStatus {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "pressured";
  if (severity === "watch") return "watching";
  return "stable";
}

function summarizeIssue(item: PdsV2InterventionQueueItem) {
  return item.issue_summary || item.cause_summary || "Investigate flagged operating pressure.";
}

function topReason(rows: PdsV2PerformanceRow[], pick: "negative" | "positive") {
  const pool = rows
    .map((row) => ({
      variance: toNumber(row.fee_variance),
      reason: row.reason_codes?.[0]?.replaceAll("_", " ") || "unclassified",
    }))
    .sort((a, b) => (pick === "negative" ? a.variance - b.variance : b.variance - a.variance));
  return pool[0]?.reason || "no dominant driver";
}

export function deriveLandingModels(commandCenter: PdsV2CommandCenter) {
  const performanceRows = commandCenter.performance_table.rows || [];
  const totalExposure = performanceRows.reduce((sum, row) => sum + toNumber(row.fee_actual), 0);
  const netVariance = performanceRows.reduce((sum, row) => sum + toNumber(row.fee_variance), 0);
  const atRiskFromRows = performanceRows.filter((row) => statusFromHealth(row.health_status) === "critical").length;
  const prior = totalExposure - netVariance;
  const directionalDelta = prior === 0 ? 0 : (netVariance / Math.abs(prior)) * 100;

  const accountRollups: AccountRollupRow[] = (commandCenter.account_dashboard?.accounts || []).map((account) => ({
    id: account.account_id,
    name: account.account_name,
    status: account.health_band === "at_risk" ? "critical" : account.health_band === "watch" ? "watching" : "stable",
    exposure: toNumber(account.fee_actual),
    variance: toNumber(account.fee_actual) - toNumber(account.fee_plan),
    trend: account.trend === "improving" ? "up" : account.trend === "deteriorating" ? "down" : "flat",
    openIssuesCount: account.red_projects + account.staffing_gap_resources + account.overloaded_resources,
    nextAction: account.recommended_action || "Open account plan and assign owner follow-up.",
  }));

  const marketRollups: MarketRollupRow[] = (commandCenter.map_summary.points || []).map((point) => ({
    id: point.market_id,
    name: point.name,
    aggregatedExposure: toNumber(point.fee_actual),
    riskScore: toNumber(point.risk_score),
    variance: toNumber(point.fee_actual) - toNumber(point.fee_plan),
    trend: trendFromVariance(toNumber(point.variance_pct)),
    impactedAccounts: toNumber(point.client_risk_accounts),
    nextAction: point.reason_codes?.[0]
      ? `Address ${point.reason_codes[0].replaceAll("_", " ")} with market lead.`
      : "Review market variance drivers and open mitigation plan.",
  }));

  const riskSummary: RiskSummaryModel = {
    atRiskCount: atRiskFromRows,
    watchlistCount: performanceRows.filter((row) => statusFromHealth(row.health_status) === "watching").length,
    stableCount: performanceRows.filter((row) => statusFromHealth(row.health_status) === "stable").length,
    totalShortfall: Math.min(0, netVariance),
    largestNegativeDriver: topReason(performanceRows, "negative"),
    largestPositiveDriver: topReason(performanceRows, "positive"),
  };

  const hero: LandingHeroMetrics = {
    posture: atRiskFromRows > 4 ? "critical" : atRiskFromRows > 2 ? "pressured" : atRiskFromRows > 0 ? "watching" : "stable",
    totalExposure,
    netVariance,
    accountsAtRisk: atRiskFromRows,
    directionalDelta,
  };

  const prioritizedActions: PrioritizedItem[] = (commandCenter.intervention_queue || [])
    .map((item) => ({
      id: item.intervention_id,
      name: item.entity_label,
      description: item.entity_type === "market" ? "Market pressure cluster" : "Account execution pressure",
      tags: [item.entity_type, ...(item.reason_codes || []).slice(0, 2)].map((tag) => tag.replaceAll("_", " ")),
      exposure: item.entity_type === "market"
        ? toNumber(commandCenter.map_summary.points.find((p) => p.market_id === item.entity_id)?.fee_actual)
        : toNumber(commandCenter.account_dashboard?.accounts.find((a) => a.account_id === item.entity_id)?.fee_actual),
      issueSummary: summarizeIssue(item),
      whyNow: item.expected_impact || "Near-term variance and delivery risk are rising.",
      nextMove: item.recommended_action,
      status: severityToStatus(item.severity),
      sourceType: (item.entity_type === "market" ? "market" : "account") as "market" | "account",
    }))
    .sort((a, b) => (statusRank(b.status) - statusRank(a.status)) || b.exposure - a.exposure)
    .slice(0, 8);

  return { hero, riskSummary, accountRollups, marketRollups, prioritizedActions };
}

export function statusRank(status: RowStatus) {
  if (status === "critical") return 4;
  if (status === "pressured") return 3;
  if (status === "watching") return 2;
  return 1;
}

export function statusClasses(status: RowStatus) {
  if (status === "critical") return "border-pds-signalRed/40 bg-pds-signalRed/10 text-pds-signalRed";
  if (status === "pressured") return "border-pds-signalOrange/40 bg-pds-signalOrange/10 text-pds-signalOrange";
  if (status === "watching") return "border-pds-signalOrange/40 bg-pds-signalOrange/10 text-pds-signalOrange";
  return "border-pds-signalGreen/40 bg-pds-signalGreen/10 text-pds-signalGreen";
}
