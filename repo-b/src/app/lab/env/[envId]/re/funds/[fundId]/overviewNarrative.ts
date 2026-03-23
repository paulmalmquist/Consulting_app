import type {
  CapitalTimelinePoint,
  IrrContributionItem,
  IrrTimelinePoint,
  ReV2FundInvestmentRollupRow,
  ReV2FundQuarterState,
  ReV2Investment,
} from "@/lib/bos-api";

export type HealthLabel = "Strong" | "Stable" | "Developing";

export type ValueCreationPoint = {
  quarter: string;
  calledCapital: number;
  distributions: number;
  nav: number;
  totalValue: number;
};

export type ExposureDatum = {
  label: string;
  value: number;
  pct: number;
};

export type ExposureInsights = {
  sector: ExposureDatum[];
  geography: ExposureDatum[];
};

export type PerformanceDriver = {
  investmentId: string;
  investmentName: string;
  irr: number | null;
  navContributionValue: number;
  navContributionPct: number;
  barPct: number;
};

export type FundHealthSummary = {
  label: HealthLabel;
  headline: string;
  detail: string;
};

export type PortfolioTableRow = {
  investment: ReV2Investment;
  rollup?: ReV2FundInvestmentRollupRow;
  propertyTypeKey: string | null;
  market: string | null;
  equityInvested: number | null;
  currentValue: number | null;
  irr: number | null;
  noi: number | null;
  occupancy: number | null;
  ltv: number | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quarterSortValue(quarter: string): number {
  const match = quarter.match(/^(\d{4})Q([1-4])$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 10 + Number(match[2]);
}

function sortQuarters(quarters: Iterable<string>): string[] {
  return [...quarters].sort((left, right) => {
    const diff = quarterSortValue(left) - quarterSortValue(right);
    return diff !== 0 ? diff : left.localeCompare(right);
  });
}

function formatMultiple(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}x`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function leadingNarrative(exposureInsights: ExposureInsights, performanceDrivers: PerformanceDriver[]): string {
  const sectorLead = exposureInsights.sector[0]?.label;
  const geographyLead = exposureInsights.geography[0]?.label;
  const driverLead = performanceDrivers[0]?.investmentName;

  if (sectorLead && driverLead) {
    return `${sectorLead} exposure, led by ${driverLead}`;
  }
  if (geographyLead && driverLead) {
    return `${geographyLead} exposure, led by ${driverLead}`;
  }
  if (sectorLead) return `${sectorLead} exposure`;
  if (geographyLead) return `${geographyLead} exposure`;
  if (driverLead) return `${driverLead} as the top NAV contributor`;
  return "portfolio value creation still coming into view";
}

function realizedNarrative(
  realizedValue: number,
  navValue: number,
  exposureInsights: ExposureInsights,
  performanceDrivers: PerformanceDriver[]
): string {
  const totalValue = realizedValue + navValue;
  const sectorLead = exposureInsights.sector[0]?.label;
  const geographyLead = exposureInsights.geography[0]?.label;
  const driverLead = performanceDrivers[0]?.investmentName;

  if (totalValue <= 0) {
    if (sectorLead || geographyLead || driverLead) {
      return `Value creation mix is still sparse, with ${sectorLead || geographyLead || driverLead} currently providing the clearest signal.`;
    }
    return "Quarter-close value creation and exposure detail will populate as capital activity and valuations accumulate.";
  }

  const realizedPct = Math.round((realizedValue / totalValue) * 100);
  const unrealizedPct = Math.max(0, 100 - realizedPct);
  const leadDetail = sectorLead
    ? `${sectorLead} remains the largest portfolio exposure`
    : geographyLead
      ? `${geographyLead} remains the largest market exposure`
      : driverLead
        ? `${driverLead} is the top current NAV contributor`
        : "portfolio drivers are still accumulating";

  return `${unrealizedPct}% of value remains unrealized versus ${realizedPct}% realized, and ${leadDetail}.`;
}

export function mergeValueCreationSeries(
  irrTimeline: IrrTimelinePoint[],
  capitalTimeline: CapitalTimelinePoint[]
): ValueCreationPoint[] {
  const quarterSet = new Set<string>();
  for (const point of irrTimeline) quarterSet.add(point.quarter);
  for (const point of capitalTimeline) quarterSet.add(point.quarter);

  const irrByQuarter = new Map(irrTimeline.map((point) => [point.quarter, point]));
  const capitalByQuarter = new Map(capitalTimeline.map((point) => [point.quarter, point]));

  let lastCalledCapital = 0;
  let lastDistributions = 0;
  let lastNav = 0;

  return sortQuarters(quarterSet).map((quarter) => {
    const irrPoint = irrByQuarter.get(quarter);
    const capitalPoint = capitalByQuarter.get(quarter);
    const calledCapital = toNumber(capitalPoint?.total_called);
    const distributions = toNumber(capitalPoint?.total_distributed);
    const nav = toNumber(irrPoint?.portfolio_nav);

    if (calledCapital !== null) lastCalledCapital = calledCapital;
    if (distributions !== null) lastDistributions = distributions;
    if (nav !== null) lastNav = nav;

    return {
      quarter,
      calledCapital: lastCalledCapital,
      distributions: lastDistributions,
      nav: lastNav,
      totalValue: lastDistributions + lastNav,
    };
  });
}

export function getDominantPropertyTypeKey(
  sectorMix: Record<string, number> | null | undefined
): string | null {
  if (!sectorMix) return null;
  return Object.entries(sectorMix)
    .filter(([, value]) => toNumber(value) !== null)
    .sort((left, right) => {
      const diff = (toNumber(right[1]) ?? 0) - (toNumber(left[1]) ?? 0);
      return diff !== 0 ? diff : left[0].localeCompare(right[0]);
    })[0]?.[0] ?? null;
}

function buildExposureRows(values: Map<string, number>): ExposureDatum[] {
  const entries = [...values.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => {
      const diff = right[1] - left[1];
      return diff !== 0 ? diff : left[0].localeCompare(right[0]);
    })
    .slice(0, 5);

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return [];

  return entries.map(([label, value]) => ({
    label,
    value,
    pct: (value / total) * 100,
  }));
}

export function buildExposureInsights(
  investmentRollup: ReV2FundInvestmentRollupRow[]
): ExposureInsights {
  const sectorWeights = new Map<string, number>();
  const geographyWeights = new Map<string, number>();

  for (const row of investmentRollup) {
    const weight = Math.max(
      0,
      toNumber(row.fund_nav_contribution) ??
        toNumber(row.total_asset_value) ??
        toNumber(row.gross_asset_value) ??
        0
    );

    if (weight <= 0) continue;

    if (row.sector_mix) {
      for (const [sector, shareRaw] of Object.entries(row.sector_mix)) {
        const share = Math.max(0, toNumber(shareRaw) ?? 0);
        if (share <= 0) continue;
        sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + weight * share);
      }
    }

    const market = row.primary_market?.trim();
    if (market) {
      geographyWeights.set(market, (geographyWeights.get(market) ?? 0) + weight);
    }
  }

  return {
    sector: buildExposureRows(sectorWeights),
    geography: buildExposureRows(geographyWeights),
  };
}

export function buildPerformanceDrivers(
  irrContrib: IrrContributionItem[],
  totalFundNav?: number | null,
  limit = 5
): PerformanceDriver[] {
  const rows = irrContrib
    .map((item) => {
      const contribution =
        toNumber(item.fund_nav_contribution) ??
        toNumber(item.irr_contribution) ??
        0;
      return {
        investmentId: item.investment_id,
        investmentName: item.investment_name,
        irr: toNumber(item.investment_irr),
        navContributionValue: contribution,
      };
    })
    .sort((left, right) => {
      const irrDiff = (right.irr ?? Number.NEGATIVE_INFINITY) - (left.irr ?? Number.NEGATIVE_INFINITY);
      if (irrDiff !== 0) return irrDiff;
      return right.navContributionValue - left.navContributionValue;
    })
    .slice(0, limit);

  const pctBase =
    (toNumber(totalFundNav) ?? 0) > 0
      ? (toNumber(totalFundNav) ?? 0)
      : rows.reduce((sum, row) => sum + Math.max(0, row.navContributionValue), 0);
  const barBase = Math.max(...rows.map((row) => Math.abs(row.navContributionValue)), 1);

  return rows.map((row) => ({
    ...row,
    navContributionPct: pctBase > 0 ? (row.navContributionValue / pctBase) * 100 : 0,
    barPct: (Math.abs(row.navContributionValue) / barBase) * 100,
  }));
}

export function buildFundHealthSummary(params: {
  fundState: ReV2FundQuarterState | null | undefined;
  exposureInsights: ExposureInsights;
  performanceDrivers: PerformanceDriver[];
}): FundHealthSummary {
  const tvpi = toNumber(params.fundState?.tvpi);
  const netIrr = toNumber(params.fundState?.net_irr);
  const distributed = Math.max(0, toNumber(params.fundState?.total_distributed) ?? 0);
  const nav = Math.max(0, toNumber(params.fundState?.portfolio_nav) ?? 0);

  let label: HealthLabel = "Developing";
  if ((tvpi ?? 0) >= 1.5 || (netIrr ?? 0) >= 0.15) {
    label = "Strong";
  } else if ((tvpi ?? 0) >= 1.15 || (netIrr ?? 0) >= 0.08) {
    label = "Stable";
  }

  if (tvpi === null && netIrr === null) {
    return {
      label,
      headline: `${label} performance with limited fund-level return history.`,
      detail: realizedNarrative(distributed, nav, params.exposureInsights, params.performanceDrivers),
    };
  }

  return {
    label,
    headline: `${label} performance with TVPI of ${formatMultiple(tvpi)} and Net IRR of ${formatPercent(netIrr)} across ${leadingNarrative(params.exposureInsights, params.performanceDrivers)}.`,
    detail: realizedNarrative(distributed, nav, params.exposureInsights, params.performanceDrivers),
  };
}

export function buildPortfolioTableRows(
  investments: ReV2Investment[],
  rollupById: Map<string, ReV2FundInvestmentRollupRow>
): PortfolioTableRow[] {
  return investments.map((investment) => {
    const rollup = rollupById.get(investment.investment_id);
    return {
      investment,
      rollup,
      propertyTypeKey: getDominantPropertyTypeKey(rollup?.sector_mix),
      market: rollup?.primary_market ?? null,
      equityInvested:
        toNumber(rollup?.invested_capital) ??
        toNumber(rollup?.committed_capital) ??
        toNumber(investment.invested_capital) ??
        toNumber(investment.committed_capital),
      currentValue:
        toNumber(rollup?.total_asset_value) ??
        toNumber(rollup?.gross_asset_value) ??
        toNumber(rollup?.nav) ??
        toNumber(investment.gross_asset_value) ??
        toNumber(investment.nav),
      irr:
        toNumber(rollup?.gross_irr) ??
        toNumber(rollup?.net_irr) ??
        toNumber(investment.gross_irr) ??
        toNumber(investment.net_irr),
      noi: toNumber(rollup?.total_noi) ?? toNumber(investment.total_noi),
      occupancy: toNumber(rollup?.weighted_occupancy),
      ltv: toNumber(rollup?.computed_ltv) ?? toNumber(investment.ltv),
    };
  });
}
