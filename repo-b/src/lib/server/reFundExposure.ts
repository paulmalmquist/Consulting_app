import type { Pool } from "pg";

import {
  computeFundBaseScenario,
  type BaseScenarioAssetContribution,
} from "@/lib/server/reBaseScenario";

type Queryable = Pick<Pool, "query">;

type WeightBasis = "current_nav" | "current_value" | "cost_basis" | "none";

type BucketAccumulator = {
  value: number;
  sourceIds: Set<string>;
};

export type FundExposureAllocationRow = {
  label: string;
  value: number;
  pct: number;
  source_count: number;
};

export type FundExposureSummary = {
  total_weight: number;
  classified_weight: number;
  unclassified_weight: number;
  coverage_pct: number;
};

export type FundExposureDebug = {
  assets_scanned: number;
  investments_scanned: number;
  nav_weight_rows: number;
  current_value_fallback_rows: number;
  cost_basis_fallback_rows: number;
  skipped_zero_weight_rows: number;
  missing_sector_rows: number;
  missing_geography_rows: number;
};

export type FundExposureInsightsResult = {
  fund_id: string;
  quarter: string;
  scenario_id: string | null;
  sector_allocation: FundExposureAllocationRow[];
  geographic_allocation: FundExposureAllocationRow[];
  total_weight: number;
  sector_summary: FundExposureSummary;
  geographic_summary: FundExposureSummary;
  weighting_basis_used: "current_nav" | "current_value" | "cost_basis" | "mixed" | "none";
  debug?: FundExposureDebug;
};

function toPositiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function deriveAssetGeographyLabel(asset: BaseScenarioAssetContribution): string | null {
  const msa = normalizeLabel(asset.msa);
  if (msa) return msa;

  const market = normalizeLabel(asset.market);
  if (market) return market;

  const city = normalizeLabel(asset.city);
  const state = normalizeLabel(asset.state);
  if (city && state) return `${city}, ${state}`;
  return state;
}

function determineWeight(asset: BaseScenarioAssetContribution): { weight: number; basis: WeightBasis } {
  const navWeight = toPositiveNumber(asset.attributable_nav);
  if (navWeight > 0) {
    return { weight: navWeight, basis: "current_nav" };
  }

  const currentValueWeight = toPositiveNumber(asset.current_value_contribution);
  if (currentValueWeight > 0) {
    return { weight: currentValueWeight, basis: "current_value" };
  }

  const isDisposed = asset.status_category === "disposed";
  const costBasisWeight = isDisposed ? 0 : toPositiveNumber(asset.attributable_equity_basis);
  if (costBasisWeight > 0) {
    return { weight: costBasisWeight, basis: "cost_basis" };
  }

  return { weight: 0, basis: "none" };
}

function addBucketValue(
  buckets: Map<string, BucketAccumulator>,
  label: string,
  weight: number,
  sourceId: string
) {
  const current = buckets.get(label) ?? { value: 0, sourceIds: new Set<string>() };
  current.value += weight;
  current.sourceIds.add(sourceId);
  buckets.set(label, current);
}

function pickDominantLabel(values: Map<string, number>): string | null {
  let bestLabel: string | null = null;
  let bestWeight = -1;

  for (const [label, weight] of values.entries()) {
    if (weight > bestWeight || (weight === bestWeight && bestLabel !== null && label.localeCompare(bestLabel) < 0)) {
      bestLabel = label;
      bestWeight = weight;
    }
  }

  return bestLabel;
}

function buildInvestmentFallbacks(assets: BaseScenarioAssetContribution[]): {
  sectorByInvestment: Map<string, string>;
  geographyByInvestment: Map<string, string>;
} {
  const sectorWeightsByInvestment = new Map<string, Map<string, number>>();
  const geographyWeightsByInvestment = new Map<string, Map<string, number>>();

  for (const asset of assets) {
    const { weight } = determineWeight(asset);
    if (weight <= 0) continue;

    const sector = normalizeLabel(asset.property_type);
    if (sector) {
      const sectors = sectorWeightsByInvestment.get(asset.investment_id) ?? new Map<string, number>();
      sectors.set(sector, (sectors.get(sector) ?? 0) + weight);
      sectorWeightsByInvestment.set(asset.investment_id, sectors);
    }

    const geography = deriveAssetGeographyLabel(asset);
    if (geography) {
      const geographies = geographyWeightsByInvestment.get(asset.investment_id) ?? new Map<string, number>();
      geographies.set(geography, (geographies.get(geography) ?? 0) + weight);
      geographyWeightsByInvestment.set(asset.investment_id, geographies);
    }
  }

  const sectorByInvestment = new Map<string, string>();
  const geographyByInvestment = new Map<string, string>();

  for (const [investmentId, weights] of sectorWeightsByInvestment.entries()) {
    const dominant = pickDominantLabel(weights);
    if (dominant) sectorByInvestment.set(investmentId, dominant);
  }

  for (const [investmentId, weights] of geographyWeightsByInvestment.entries()) {
    const dominant = pickDominantLabel(weights);
    if (dominant) geographyByInvestment.set(investmentId, dominant);
  }

  return { sectorByInvestment, geographyByInvestment };
}

function finalizeBuckets(
  buckets: Map<string, BucketAccumulator>,
  totalWeight: number
): FundExposureAllocationRow[] {
  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.value > 0)
    .sort((left, right) => {
      const diff = right[1].value - left[1].value;
      return diff !== 0 ? diff : left[0].localeCompare(right[0]);
    })
    .map(([label, bucket]) => ({
      label,
      value: bucket.value,
      pct: totalWeight > 0 ? (bucket.value / totalWeight) * 100 : 0,
      source_count: bucket.sourceIds.size,
    }));
}

function buildSummary(totalWeight: number, classifiedWeight: number): FundExposureSummary {
  const boundedClassifiedWeight = Math.max(0, Math.min(totalWeight, classifiedWeight));
  const unclassifiedWeight = Math.max(0, totalWeight - boundedClassifiedWeight);

  return {
    total_weight: totalWeight,
    classified_weight: boundedClassifiedWeight,
    unclassified_weight: unclassifiedWeight,
    coverage_pct: totalWeight > 0 ? (boundedClassifiedWeight / totalWeight) * 100 : 0,
  };
}

export function aggregateFundExposureFromAssets(
  assets: BaseScenarioAssetContribution[],
  options?: { includeDebug?: boolean }
): FundExposureInsightsResult {
  const includeDebug = options?.includeDebug ?? false;
  const sectorBuckets = new Map<string, BucketAccumulator>();
  const geographicBuckets = new Map<string, BucketAccumulator>();
  const basisCounts: Record<Exclude<WeightBasis, "none">, number> = {
    current_nav: 0,
    current_value: 0,
    cost_basis: 0,
  };
  const debug: FundExposureDebug = {
    assets_scanned: assets.length,
    investments_scanned: new Set(assets.map((asset) => asset.investment_id)).size,
    nav_weight_rows: 0,
    current_value_fallback_rows: 0,
    cost_basis_fallback_rows: 0,
    skipped_zero_weight_rows: 0,
    missing_sector_rows: 0,
    missing_geography_rows: 0,
  };

  const { sectorByInvestment, geographyByInvestment } = buildInvestmentFallbacks(assets);

  let totalWeight = 0;
  let sectorClassifiedWeight = 0;
  let geographyClassifiedWeight = 0;

  for (const asset of assets) {
    const { weight, basis } = determineWeight(asset);
    if (weight <= 0) {
      debug.skipped_zero_weight_rows += 1;
      continue;
    }

    totalWeight += weight;

    if (basis === "current_nav") {
      basisCounts.current_nav += 1;
      debug.nav_weight_rows += 1;
    } else if (basis === "current_value") {
      basisCounts.current_value += 1;
      debug.current_value_fallback_rows += 1;
    } else if (basis === "cost_basis") {
      basisCounts.cost_basis += 1;
      debug.cost_basis_fallback_rows += 1;
    }

    const directSector = normalizeLabel(asset.property_type);
    const fallbackSector = sectorByInvestment.get(asset.investment_id);
    const dealTypeSector = asset.investment_type === "debt" ? "debt" : null;
    const sectorLabel = directSector ?? fallbackSector ?? dealTypeSector ?? "Unclassified";

    const directGeography = deriveAssetGeographyLabel(asset);
    const fallbackGeography = geographyByInvestment.get(asset.investment_id);
    const geographyLabel = directGeography ?? fallbackGeography ?? "Unknown";

    addBucketValue(sectorBuckets, sectorLabel, weight, asset.asset_id);
    addBucketValue(geographicBuckets, geographyLabel, weight, asset.asset_id);

    if (sectorLabel !== "Unclassified") {
      sectorClassifiedWeight += weight;
    } else {
      debug.missing_sector_rows += 1;
    }

    if (geographyLabel !== "Unknown") {
      geographyClassifiedWeight += weight;
    } else {
      debug.missing_geography_rows += 1;
    }
  }

  const nonZeroBases = Object.entries(basisCounts)
    .filter(([, count]) => count > 0)
    .map(([basis]) => basis as keyof typeof basisCounts);
  const weightingBasisUsed =
    nonZeroBases.length === 0
      ? "none"
      : nonZeroBases.length === 1
        ? nonZeroBases[0]
        : "mixed";

  return {
    fund_id: "",
    quarter: "",
    scenario_id: null,
    sector_allocation: finalizeBuckets(sectorBuckets, totalWeight),
    geographic_allocation: finalizeBuckets(geographicBuckets, totalWeight),
    total_weight: totalWeight,
    sector_summary: buildSummary(totalWeight, sectorClassifiedWeight),
    geographic_summary: buildSummary(totalWeight, geographyClassifiedWeight),
    weighting_basis_used: weightingBasisUsed,
    ...(includeDebug ? { debug } : {}),
  };
}

export async function computeFundExposureInsights(params: {
  pool: Queryable;
  fundId: string;
  quarter: string;
  scenarioId?: string | null;
  includeDebug?: boolean;
}): Promise<FundExposureInsightsResult> {
  const { pool, fundId, quarter, scenarioId, includeDebug } = params;
  const baseScenario = await computeFundBaseScenario({
    pool,
    fundId,
    quarter,
    scenarioId: scenarioId ?? undefined,
    liquidationMode: "current_state",
  });
  const exposure = aggregateFundExposureFromAssets(baseScenario.assets, { includeDebug });

  return {
    ...exposure,
    fund_id: fundId,
    quarter,
    scenario_id: scenarioId ?? null,
  };
}
