export type UnderwritingAssumptions = {
  rentGrowthPct: number;
  expenseRatio: number;
  exitCapRate: number;
  otherIncomeGrowthPct: number;
  capexReservePct: number;
};

export type AssetUnderwritingInput = {
  assetId: string;
  assetName: string;
  assetType?: string | null;
  currentNoi?: number | null;
  occupancy?: number | null;
  units?: number | null;
  leasableSf?: number | null;
  avgRentPerUnit?: number | null;
  marketRentPsf?: number | null;
  latestRevenue?: number | null;
  latestOtherIncome?: number | null;
  latestOpex?: number | null;
  latestCapex?: number | null;
  latestDebtService?: number | null;
  latestLeasingCosts?: number | null;
  latestTenantImprovements?: number | null;
};

export type MetricBlock = {
  revenue: number;
  otherIncome: number;
  opex: number;
  noi: number;
  capex: number;
  debtService: number;
  leasingCosts: number;
  tenantImprovements: number;
  cashFlow: number;
  exitValue: number;
};

export type AssetUnderwritingOutput = {
  assetId: string;
  assetName: string;
  assumptionsUsed: UnderwritingAssumptions;
  base: MetricBlock;
  modeled: MetricBlock;
  variance: MetricBlock;
  calcTrace: string[];
};

export type FundUnderwritingOutput = {
  assumptions: UnderwritingAssumptions;
  assets: AssetUnderwritingOutput[];
  totals: {
    base: MetricBlock;
    modeled: MetricBlock;
    variance: MetricBlock;
  };
  calcTrace: string[];
};

export const DEFAULT_UNDERWRITING_ASSUMPTIONS: UnderwritingAssumptions = {
  rentGrowthPct: 0.03,
  expenseRatio: 0.35,
  exitCapRate: 0.055,
  otherIncomeGrowthPct: 0.01,
  capexReservePct: 0.02,
};

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function emptyMetrics(): MetricBlock {
  return {
    revenue: 0,
    otherIncome: 0,
    opex: 0,
    noi: 0,
    capex: 0,
    debtService: 0,
    leasingCosts: 0,
    tenantImprovements: 0,
    cashFlow: 0,
    exitValue: 0,
  };
}

function deriveBaseRevenue(
  asset: AssetUnderwritingInput,
  expenseRatio: number,
  trace: string[]
): { revenue: number; otherIncome: number } {
  const latestRevenue = asset.latestRevenue ?? null;
  const latestOtherIncome = asset.latestOtherIncome ?? 0;
  if (latestRevenue && latestRevenue > 0) {
    trace.push("Base revenue sourced from latest operating quarter revenue.");
    return {
      revenue: roundMetric(latestRevenue),
      otherIncome: roundMetric(latestOtherIncome),
    };
  }

  if (asset.currentNoi && expenseRatio < 0.95) {
    const impliedRevenue = asset.currentNoi / (1 - expenseRatio);
    trace.push("Base revenue inferred from current NOI and expense ratio.");
    return {
      revenue: roundMetric(impliedRevenue),
      otherIncome: roundMetric(0),
    };
  }

  if (asset.avgRentPerUnit && asset.units) {
    const occupancy = clamp(asset.occupancy ?? 0.93, 0.5, 0.99);
    const impliedRevenue = asset.avgRentPerUnit * asset.units * 12 * occupancy;
    trace.push("Base revenue inferred from average rent per unit and occupancy.");
    return {
      revenue: roundMetric(impliedRevenue),
      otherIncome: 0,
    };
  }

  if (asset.marketRentPsf && asset.leasableSf) {
    const occupancy = clamp(asset.occupancy ?? 0.9, 0.5, 0.99);
    const impliedRevenue = asset.marketRentPsf * asset.leasableSf * occupancy;
    trace.push("Base revenue inferred from market rent PSF and leased area.");
    return {
      revenue: roundMetric(impliedRevenue),
      otherIncome: 0,
    };
  }

  trace.push("Base revenue defaulted to zero because no operating or rent basis exists.");
  return { revenue: 0, otherIncome: 0 };
}

function deriveBaseOpex(
  asset: AssetUnderwritingInput,
  totalRevenue: number,
  expenseRatio: number,
  trace: string[]
): number {
  if (asset.latestOpex !== null && asset.latestOpex !== undefined) {
    trace.push("Base opex sourced from latest operating quarter.");
    return roundMetric(asset.latestOpex);
  }

  const impliedOpex = totalRevenue * clamp(expenseRatio, 0.1, 0.85);
  trace.push("Base opex inferred from revenue and expense ratio.");
  return roundMetric(impliedOpex);
}

function deriveBaseCapex(
  asset: AssetUnderwritingInput,
  totalRevenue: number,
  capexReservePct: number,
  trace: string[]
): number {
  if (asset.latestCapex !== null && asset.latestCapex !== undefined) {
    trace.push("Base capex sourced from latest operating quarter.");
    return roundMetric(asset.latestCapex);
  }

  const reserve = totalRevenue * clamp(capexReservePct, 0, 0.2);
  trace.push("Base capex inferred from a revenue reserve.");
  return roundMetric(reserve);
}

function buildMetricBlock(args: {
  revenue: number;
  otherIncome: number;
  opex: number;
  capex: number;
  debtService: number;
  leasingCosts: number;
  tenantImprovements: number;
  exitCapRate: number;
}): MetricBlock {
  const noi = args.revenue + args.otherIncome - args.opex;
  const cashFlow =
    noi -
    args.capex -
    args.debtService -
    args.leasingCosts -
    args.tenantImprovements;

  return {
    revenue: roundMetric(args.revenue),
    otherIncome: roundMetric(args.otherIncome),
    opex: roundMetric(args.opex),
    noi: roundMetric(noi),
    capex: roundMetric(args.capex),
    debtService: roundMetric(args.debtService),
    leasingCosts: roundMetric(args.leasingCosts),
    tenantImprovements: roundMetric(args.tenantImprovements),
    cashFlow: roundMetric(cashFlow),
    exitValue: roundMetric(noi / clamp(args.exitCapRate, 0.02, 0.2)),
  };
}

function varianceMetric(modeled: MetricBlock, base: MetricBlock): MetricBlock {
  return {
    revenue: roundMetric(modeled.revenue - base.revenue),
    otherIncome: roundMetric(modeled.otherIncome - base.otherIncome),
    opex: roundMetric(modeled.opex - base.opex),
    noi: roundMetric(modeled.noi - base.noi),
    capex: roundMetric(modeled.capex - base.capex),
    debtService: roundMetric(modeled.debtService - base.debtService),
    leasingCosts: roundMetric(modeled.leasingCosts - base.leasingCosts),
    tenantImprovements: roundMetric(
      modeled.tenantImprovements - base.tenantImprovements
    ),
    cashFlow: roundMetric(modeled.cashFlow - base.cashFlow),
    exitValue: roundMetric(modeled.exitValue - base.exitValue),
  };
}

function addMetrics(total: MetricBlock, delta: MetricBlock): MetricBlock {
  return {
    revenue: roundMetric(total.revenue + delta.revenue),
    otherIncome: roundMetric(total.otherIncome + delta.otherIncome),
    opex: roundMetric(total.opex + delta.opex),
    noi: roundMetric(total.noi + delta.noi),
    capex: roundMetric(total.capex + delta.capex),
    debtService: roundMetric(total.debtService + delta.debtService),
    leasingCosts: roundMetric(total.leasingCosts + delta.leasingCosts),
    tenantImprovements: roundMetric(
      total.tenantImprovements + delta.tenantImprovements
    ),
    cashFlow: roundMetric(total.cashFlow + delta.cashFlow),
    exitValue: roundMetric(total.exitValue + delta.exitValue),
  };
}

export function normalizeAssumptions(
  overrides?: Partial<UnderwritingAssumptions>
): UnderwritingAssumptions {
  return {
    rentGrowthPct: overrides?.rentGrowthPct ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.rentGrowthPct,
    expenseRatio: overrides?.expenseRatio ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.expenseRatio,
    exitCapRate: overrides?.exitCapRate ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.exitCapRate,
    otherIncomeGrowthPct:
      overrides?.otherIncomeGrowthPct ??
      DEFAULT_UNDERWRITING_ASSUMPTIONS.otherIncomeGrowthPct,
    capexReservePct:
      overrides?.capexReservePct ?? DEFAULT_UNDERWRITING_ASSUMPTIONS.capexReservePct,
  };
}

export function projectAssetUnderwriting(
  asset: AssetUnderwritingInput,
  overrides?: Partial<UnderwritingAssumptions>
): AssetUnderwritingOutput {
  const assumptions = normalizeAssumptions(overrides);
  const trace: string[] = [];
  const derivedRevenue = deriveBaseRevenue(asset, assumptions.expenseRatio, trace);
  const baseRevenue = derivedRevenue.revenue;
  const baseOtherIncome = derivedRevenue.otherIncome;
  const totalRevenue = baseRevenue + baseOtherIncome;
  const baseOpex = deriveBaseOpex(asset, totalRevenue, assumptions.expenseRatio, trace);
  const baseCapex = deriveBaseCapex(
    asset,
    totalRevenue,
    assumptions.capexReservePct,
    trace
  );
  const baseDebtService = roundMetric(asset.latestDebtService ?? 0);
  const baseLeasingCosts = roundMetric(asset.latestLeasingCosts ?? 0);
  const baseTenantImprovements = roundMetric(asset.latestTenantImprovements ?? 0);

  const base = buildMetricBlock({
    revenue: baseRevenue,
    otherIncome: baseOtherIncome,
    opex: baseOpex,
    capex: baseCapex,
    debtService: baseDebtService,
    leasingCosts: baseLeasingCosts,
    tenantImprovements: baseTenantImprovements,
    exitCapRate: assumptions.exitCapRate,
  });

  const modeledRevenue = roundMetric(base.revenue * (1 + assumptions.rentGrowthPct));
  const modeledOtherIncome = roundMetric(
    base.otherIncome * (1 + assumptions.otherIncomeGrowthPct)
  );
  const modeledGrossRevenue = modeledRevenue + modeledOtherIncome;
  const modeledOpex = roundMetric(modeledGrossRevenue * assumptions.expenseRatio);
  const modeledCapex = roundMetric(
    Math.max(base.capex, modeledGrossRevenue * assumptions.capexReservePct)
  );

  trace.push(
    `Modeled revenue grows by ${(assumptions.rentGrowthPct * 100).toFixed(1)}%.`
  );
  trace.push(
    `Modeled opex targets ${(assumptions.expenseRatio * 100).toFixed(1)}% of total revenue.`
  );
  trace.push(
    `Exit value capitalizes NOI at ${(assumptions.exitCapRate * 100).toFixed(2)}%.`
  );

  const modeled = buildMetricBlock({
    revenue: modeledRevenue,
    otherIncome: modeledOtherIncome,
    opex: modeledOpex,
    capex: modeledCapex,
    debtService: base.debtService,
    leasingCosts: base.leasingCosts,
    tenantImprovements: base.tenantImprovements,
    exitCapRate: assumptions.exitCapRate,
  });

  return {
    assetId: asset.assetId,
    assetName: asset.assetName,
    assumptionsUsed: assumptions,
    base,
    modeled,
    variance: varianceMetric(modeled, base),
    calcTrace: trace,
  };
}

export function projectFundUnderwriting(
  assets: AssetUnderwritingInput[],
  overrides?: Partial<UnderwritingAssumptions>
): FundUnderwritingOutput {
  const assumptions = normalizeAssumptions(overrides);
  const assetOutputs = assets.map((asset) =>
    projectAssetUnderwriting(asset, assumptions)
  );
  const totals = assetOutputs.reduce(
    (acc, asset) => ({
      base: addMetrics(acc.base, asset.base),
      modeled: addMetrics(acc.modeled, asset.modeled),
      variance: addMetrics(acc.variance, asset.variance),
    }),
    {
      base: emptyMetrics(),
      modeled: emptyMetrics(),
      variance: emptyMetrics(),
    }
  );

  return {
    assumptions,
    assets: assetOutputs,
    totals,
    calcTrace: [
      `${assetOutputs.length} assets were modeled.`,
      ...assetOutputs.flatMap((asset) =>
        asset.calcTrace.map((entry) => `${asset.assetName}: ${entry}`)
      ),
    ],
  };
}
