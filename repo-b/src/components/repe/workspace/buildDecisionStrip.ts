import type {
  FiCovenantResult,
  ReV2FundInvestmentRollupRow,
  ReV2FundQuarterState,
} from "@/lib/bos-api";
import {
  concentrationFlags,
  covenantFlags,
  dscrLtvFlags,
  rankFlags,
  toNumberSafe,
  underperformerFlags,
  type FlagSeverity,
  type RiskFlag,
} from "./repePortfolioFlags";

export type DecisionSeverity = FlagSeverity;

export type DecisionBullet = {
  key: string;
  headline: string;
  detail?: string;
  severity: DecisionSeverity;
  metricCitation?: {
    metric: string;
    value: number | string | null;
    snapshotVersion?: string | null;
  };
};

export type DecisionRecommendation = {
  headline: string;
  action: string;
  targetInvestmentId?: string | null;
  severity: DecisionSeverity;
};

export type DecisionStripData = {
  issues: DecisionBullet[];
  drivers: DecisionBullet[];
  recommendation: DecisionRecommendation | null;
  recommendationRejectionReason:
    | "restate_of_top_issue"
    | "no_candidate_available"
    | null;
};

export type DecisionStripInputs = {
  fundState: ReV2FundQuarterState | null | undefined;
  investmentRollup: ReV2FundInvestmentRollupRow[];
  covenants?: FiCovenantResult[] | null;
  snapshotVersion?: string | null;
  concentrationThresholdPct?: number;
};

const STOPWORDS = new Set([
  "asset",
  "assets",
  "fund",
  "funds",
  "investment",
  "investments",
  "portfolio",
  "review",
  "issue",
  "issues",
  "days",
  "recommendation",
  "status",
  "current",
  "quarter",
  "property",
  "below",
  "above",
  "flag",
]);

function actionFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word))
    .sort()
    .join(" ");
}

function flagToBullet(flag: RiskFlag): DecisionBullet {
  return {
    key: flag.key,
    headline: flag.label,
    detail: flag.detail,
    severity: flag.severity,
    metricCitation: { metric: flag.metric, value: flag.value },
  };
}

function topDrivers(
  rollup: ReV2FundInvestmentRollupRow[],
  totalFundNav: number
): DecisionBullet[] {
  if (totalFundNav <= 0) return [];
  const contributions = rollup
    .map((row) => ({
      id: row.investment_id,
      name: row.name,
      irr: toNumberSafe(row.gross_irr) ?? toNumberSafe(row.net_irr),
      nav: Math.max(0, toNumberSafe(row.fund_nav_contribution) ?? toNumberSafe(row.nav) ?? 0),
    }))
    .filter((row) => row.nav > 0)
    .sort((left, right) => right.nav - left.nav)
    .slice(0, 3);

  return contributions.map((row) => {
    const pct = (row.nav / totalFundNav) * 100;
    const irrText = row.irr !== null ? ` at ${(row.irr * 100).toFixed(1)}% IRR` : "";
    return {
      key: `driver:${row.id}`,
      headline: `${row.name} = ${pct.toFixed(0)}% of NAV${irrText}`,
      severity: "low" as DecisionSeverity,
      metricCitation: { metric: "fund_nav_contribution_pct", value: pct },
    };
  });
}

function pickRecommendation(
  issues: DecisionBullet[],
  drivers: DecisionBullet[]
): { rec: DecisionRecommendation | null; rejectionReason: DecisionStripData["recommendationRejectionReason"] } {
  if (issues.length === 0 && drivers.length === 0) {
    return { rec: null, rejectionReason: "no_candidate_available" };
  }
  const topIssue = issues[0];
  const candidates: DecisionRecommendation[] = [];

  const underperformer = issues.find((issue) => issue.key.startsWith("underperformer:"));
  if (underperformer) {
    const investmentId = underperformer.key.split(":")[1];
    candidates.push({
      headline: `Model exit or recap for ${underperformer.headline.split(" IRR")[0]}`,
      action: `Model exit or recap path for ${underperformer.headline.split(" IRR")[0]}`,
      targetInvestmentId: investmentId,
      severity: "high",
    });
  }

  const concentration = issues.find((issue) => issue.key.startsWith("concentration:"));
  if (concentration) {
    const parts = concentration.key.split(":");
    const dimension = parts[1];
    const value = parts[2];
    candidates.push({
      headline: `Rebalance ${dimension} exposure away from ${value}`,
      action: `Plan new allocation targets to reduce ${dimension} concentration in ${value}`,
      severity: "medium",
    });
  }

  const leverage = issues.find((issue) => issue.key.startsWith("dscr:") || issue.key.startsWith("ltv:"));
  if (leverage) {
    candidates.push({
      headline: `Engage lender on ${leverage.headline}`,
      action: `Start refinancing conversation for ${leverage.headline}`,
      severity: "medium",
    });
  }

  const topDriver = drivers[0];
  if (topDriver) {
    const investmentId = topDriver.key.split(":")[1];
    candidates.push({
      headline: `Explore follow-on with ${topDriver.headline.split(" =")[0]}`,
      action: `Evaluate follow-on capital deployment in ${topDriver.headline.split(" =")[0]}`,
      targetInvestmentId: investmentId,
      severity: "low",
    });
  }

  const topIssueFingerprint = topIssue ? actionFingerprint(topIssue.headline) : "";
  for (const candidate of candidates) {
    const candidateFp = actionFingerprint(candidate.action);
    const overlap = candidateFp
      .split(" ")
      .filter((token) => token && topIssueFingerprint.split(" ").includes(token)).length;
    if (topIssueFingerprint && overlap >= 2 && candidateFp === topIssueFingerprint) {
      continue;
    }
    return { rec: candidate, rejectionReason: null };
  }

  if (topIssue) {
    return { rec: null, rejectionReason: "restate_of_top_issue" };
  }
  return { rec: null, rejectionReason: "no_candidate_available" };
}

export function buildDecisionStrip(inputs: DecisionStripInputs): DecisionStripData {
  const rollup = (inputs.investmentRollup ?? []).filter(Boolean);
  const totalFundNav =
    Math.max(0, toNumberSafe(inputs.fundState?.portfolio_nav) ?? 0) ||
    rollup.reduce(
      (sum, row) => sum + Math.max(0, toNumberSafe(row.fund_nav_contribution) ?? toNumberSafe(row.nav) ?? 0),
      0
    );

  const issues = rankFlags([
    ...underperformerFlags(rollup),
    ...concentrationFlags(rollup, inputs.concentrationThresholdPct),
    ...covenantFlags(inputs.covenants),
    ...dscrLtvFlags(rollup),
  ]).map(flagToBullet);

  const drivers = topDrivers(rollup, totalFundNav);

  const { rec, rejectionReason } = pickRecommendation(issues, drivers);

  return {
    issues,
    drivers,
    recommendation: rec,
    recommendationRejectionReason: rejectionReason,
  };
}
