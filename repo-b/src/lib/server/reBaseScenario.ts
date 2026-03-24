import type { Pool } from "pg";

type QueryResultRow = Record<string, unknown>;
type Queryable = Pick<Pool, "query">;

export type BaseScenarioLiquidationMode = "current_state" | "hypothetical_sale";

type Cashflow = {
  amount: number;
  date: Date;
};

type PartnerLedgerEntry = {
  partnerId: string;
  entryType: string;
  amount: number;
  effectiveDate: Date;
};

type AssetRow = {
  asset_id: string;
  asset_name: string;
  asset_status: string | null;
  investment_id: string;
  investment_name: string;
  investment_type: string | null;
  investment_stage: string | null;
  committed_capital: number | null;
  invested_capital: number | null;
  realized_distributions: number | null;
  cost_basis: number | null;
  property_type: string | null;
  market: string | null;
  city: string | null;
  state: string | null;
  msa: string | null;
  ownership_percent: number | null;
  noi: number | null;
  net_cash_flow: number | null;
  asset_value: number | null;
  nav: number | null;
  debt_balance: number | null;
  cash_balance: number | null;
  occupancy: number | null;
  valuation_method: string | null;
};

type AssetHistoricalRealization = {
  asset_id: string;
  sale_date: string | null;
  gross_sale_price: number | null;
  sale_costs: number | null;
  debt_payoff: number | null;
  net_sale_proceeds: number | null;
  attributable_proceeds: number | null;
  source: string | null;
  notes: string | null;
};

type SaleAssumption = {
  id: number;
  deal_id: string;
  asset_id: string | null;
  sale_price: number;
  sale_date: string;
  buyer_costs: number;
  disposition_fee_pct: number;
};

type WaterfallTierRow = {
  tier_order: number;
  tier_type: string;
  hurdle_rate: number | null;
  split_gp: number | null;
  split_lp: number | null;
  catch_up_percent: number | null;
};

type FundTermRow = {
  preferred_return_rate: number | null;
  carry_rate: number | null;
  management_fee_rate: number | null;
  management_fee_basis: string | null;
  waterfall_style: string | null;
  catch_up_style: string | null;
};

type FundInfo = {
  fund_id: string;
  fund_name: string;
  target_size: number | null;
  inception_date: string | null;
};

type PartnerInput = {
  partner_id: string;
  name: string;
  partner_type: string;
  committed: number;
  contributed: number;
  distributed: number;
  ledgerEntries: PartnerLedgerEntry[];
};

type Lot = {
  amount: number;
  date: Date;
};

type PartnerWaterfallState = {
  partnerId: string;
  role: "lp" | "gp";
  committed: number;
  contributed: number;
  distributed: number;
  lots: Lot[];
  prefDue: number;
};

export type BaseScenarioAssetContribution = {
  asset_id: string;
  asset_name: string;
  investment_id: string;
  investment_name: string;
  investment_type: string | null;
  asset_status: string | null;
  status_category: "active" | "disposed" | "pipeline";
  property_type: string | null;
  market: string | null;
  city: string | null;
  state: string | null;
  msa: string | null;
  valuation_method: string | null;
  ownership_percent: number;
  attributable_equity_basis: number;
  gross_asset_value: number;
  debt_balance: number;
  net_asset_value: number;
  attributable_gross_value: number;
  attributable_nav: number;
  attributable_noi: number;
  attributable_net_cash_flow: number;
  gross_sale_price: number;
  sale_costs: number;
  debt_payoff: number;
  net_sale_proceeds: number;
  attributable_realized_proceeds: number;
  attributable_hypothetical_proceeds: number;
  current_value_contribution: number;
  realized_gain_loss: number;
  unrealized_gain_loss: number;
  has_sale_assumption: boolean;
  sale_assumption_id: number | null;
  sale_date: string | null;
  source: string;
  notes: string[];
};

export type BaseScenarioWaterfallAllocation = {
  return_of_capital: number;
  preferred_return: number;
  catch_up: number;
  split: number;
  total: number;
};

export type BaseScenarioPartnerAllocation = {
  partner_id: string;
  name: string;
  partner_type: string;
  committed: number;
  contributed: number;
  distributed: number;
  nav_share: number;
  dpi: number | null;
  rvpi: number | null;
  tvpi: number | null;
  irr: number | null;
  waterfall_allocation: BaseScenarioWaterfallAllocation;
};

export type BaseScenarioTierSummary = {
  tier_code: string;
  tier_label: string;
  lp_amount: number;
  gp_amount: number;
  total_amount: number;
  remaining_after: number;
};

export type BaseScenarioBridgeRow = {
  label: string;
  amount: number;
  kind: "base" | "positive" | "negative" | "total";
};

export type FundBaseScenarioResult = {
  fund_id: string;
  fund_name: string | null;
  quarter: string;
  scenario_id: string | null;
  liquidation_mode: BaseScenarioLiquidationMode;
  as_of_date: string;
  summary: {
    active_assets: number;
    disposed_assets: number;
    pipeline_assets: number;
    attributable_nav: number;
    attributable_unrealized_nav: number;
    hypothetical_asset_value: number;
    realized_proceeds: number;
    retained_realized_cash: number;
    current_distributable_proceeds: number;
    remaining_value: number;
    total_value: number;
    paid_in_capital: number;
    distributed_capital: number;
    total_committed: number;
    dpi: number | null;
    rvpi: number | null;
    tvpi: number | null;
    gross_irr: number | null;
    net_irr: number | null;
    net_tvpi: number | null;
    unrealized_gain_loss: number;
    realized_gain_loss: number;
    management_fees: number;
    fund_expenses: number;
    carry_shadow: number;
    lp_historical_distributed: number;
    gp_historical_distributed: number;
    lp_liquidation_allocation: number;
    gp_liquidation_allocation: number;
    promote_earned: number;
    preferred_return_shortfall: number;
    preferred_return_excess: number;
  };
  value_composition: {
    historical_realized_proceeds: number;
    retained_realized_cash: number;
    attributable_unrealized_nav: number;
    hypothetical_liquidation_value: number;
    remaining_value: number;
    total_value: number;
  };
  waterfall: {
    definition_id: string | null;
    waterfall_type: string;
    total_liquidation_value: number;
    lp_total: number;
    gp_total: number;
    promote_total: number;
    tiers: BaseScenarioTierSummary[];
    partner_allocations: BaseScenarioPartnerAllocation[];
  };
  bridge: BaseScenarioBridgeRow[];
  assets: BaseScenarioAssetContribution[];
  assumptions: {
    ownership_model: string;
    realized_allocation_method: string;
    liquidation_mode: BaseScenarioLiquidationMode;
    notes: string[];
  };
};

const DEFAULT_SALE_COST_PCT = 0.02;
const DAY_COUNT_BASIS = 365.25;

function toNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function quarterEndDate(quarter: string): Date {
  const year = Number(quarter.slice(0, 4));
  const quarterNumber = Number(quarter.slice(-1));
  const month = quarterNumber * 3;
  return new Date(Date.UTC(year, month, 0));
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function yearFraction(a: Date, b: Date): number {
  return Math.max(daysBetween(a, b), 0) / DAY_COUNT_BASIS;
}

function aggregateCashflows(cashflows: Cashflow[]): Cashflow[] {
  const grouped = new Map<string, number>();
  for (const cashflow of cashflows) {
    const key = cashflow.date.toISOString().slice(0, 10);
    grouped.set(key, (grouped.get(key) || 0) + cashflow.amount);
  }
  return [...grouped.entries()]
    .map(([dateKey, amount]) => ({
      amount,
      date: new Date(`${dateKey}T00:00:00.000Z`),
    }))
    .filter((cashflow) => Math.abs(cashflow.amount) > 0.000001)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function npv(rate: number, cashflows: Cashflow[]): number {
  const baseDate = cashflows[0]?.date;
  if (!baseDate) return 0;
  return cashflows.reduce((sum, cashflow) => {
    const t = yearFraction(baseDate, cashflow.date);
    return sum + cashflow.amount / Math.pow(1 + rate, t);
  }, 0);
}

function npvDerivative(rate: number, cashflows: Cashflow[]): number {
  const baseDate = cashflows[0]?.date;
  if (!baseDate) return 0;
  return cashflows.reduce((sum, cashflow) => {
    const t = yearFraction(baseDate, cashflow.date);
    return sum - (t * cashflow.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

export function computeXirr(cashflows: Cashflow[]): number | null {
  const normalized = aggregateCashflows(cashflows);
  if (normalized.length < 2) return null;
  const hasPositive = normalized.some((cashflow) => cashflow.amount > 0);
  const hasNegative = normalized.some((cashflow) => cashflow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let guess = 0.1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const value = npv(guess, normalized);
    const derivative = npvDerivative(guess, normalized);
    if (Math.abs(value) < 1e-8) return guess;
    if (Math.abs(derivative) < 1e-10) break;
    const nextGuess = guess - value / derivative;
    if (!Number.isFinite(nextGuess) || nextGuess <= -0.999999) break;
    if (Math.abs(nextGuess - guess) < 1e-10) return nextGuess;
    guess = nextGuess;
  }

  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low, normalized);
  let highValue = npv(high, normalized);

  if (Math.sign(lowValue) === Math.sign(highValue)) {
    return null;
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const midValue = npv(mid, normalized);
    if (Math.abs(midValue) < 1e-8) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
      highValue = midValue;
    }
    if (Math.abs(high - low) < 1e-10 || Math.abs(highValue - lowValue) < 1e-8) {
      return (low + high) / 2;
    }
  }

  return null;
}

function buildOutstandingLots(entries: PartnerLedgerEntry[]): Lot[] {
  const lots: Lot[] = [];
  const sorted = [...entries].sort(
    (left, right) => left.effectiveDate.getTime() - right.effectiveDate.getTime()
  );

  for (const entry of sorted) {
    const normalizedType = entry.entryType.toLowerCase();
    if (normalizedType === "contribution") {
      lots.push({ amount: entry.amount, date: entry.effectiveDate });
      continue;
    }
    if (normalizedType !== "distribution" && normalizedType !== "recallable_dist") {
      continue;
    }

    let remaining = entry.amount;
    for (const lot of lots) {
      if (remaining <= 0) break;
      if (lot.amount <= 0) continue;
      const reduction = Math.min(lot.amount, remaining);
      lot.amount -= reduction;
      remaining -= reduction;
    }
  }

  return lots.filter((lot) => lot.amount > 0.000001);
}

function computePrefDue(lots: Lot[], rate: number, asOfDate: Date): number {
  return lots.reduce((sum, lot) => sum + lot.amount * rate * yearFraction(lot.date, asOfDate), 0);
}

function normalizeRole(partnerType: string): "lp" | "gp" {
  const normalized = partnerType.toLowerCase();
  if (normalized === "gp" || normalized === "sponsor") return "gp";
  return "lp";
}

function allocateProRata(
  totalAmount: number,
  items: Array<{ key: string; weight: number }>
): Map<string, number> {
  const positiveItems = items.filter((item) => item.weight > 0);
  const totalWeight = positiveItems.reduce((sum, item) => sum + item.weight, 0);
  const allocations = new Map<string, number>();
  if (totalAmount <= 0 || totalWeight <= 0) return allocations;

  let allocated = 0;
  positiveItems.forEach((item, index) => {
    const isLast = index === positiveItems.length - 1;
    const raw = isLast ? totalAmount - allocated : totalAmount * (item.weight / totalWeight);
    const amount = roundMoney(raw);
    allocations.set(item.key, amount);
    allocated += amount;
  });
  return allocations;
}

type WaterfallComputation = {
  partnerAllocations: Map<string, BaseScenarioWaterfallAllocation>;
  tierSummaries: BaseScenarioTierSummary[];
  lpTotal: number;
  gpTotal: number;
  promoteTotal: number;
  preferredReturnShortfall: number;
  preferredReturnExcess: number;
};

function buildDefaultTiers(term: FundTermRow | null): WaterfallTierRow[] {
  return [
    {
      tier_order: 1,
      tier_type: "return_of_capital",
      hurdle_rate: null,
      split_gp: 0,
      split_lp: 1,
      catch_up_percent: null,
    },
    {
      tier_order: 2,
      tier_type: "preferred_return",
      hurdle_rate: term?.preferred_return_rate ?? 0.08,
      split_gp: 0,
      split_lp: 1,
      catch_up_percent: null,
    },
    {
      tier_order: 3,
      tier_type: "catch_up",
      hurdle_rate: null,
      split_gp: 1,
      split_lp: 0,
      catch_up_percent: 1,
    },
    {
      tier_order: 4,
      tier_type: "split",
      hurdle_rate: null,
      split_gp: term?.carry_rate ?? 0.2,
      split_lp: 1 - (term?.carry_rate ?? 0.2),
      catch_up_percent: null,
    },
  ];
}

function tierLabel(tierCode: string): string {
  switch (tierCode) {
    case "return_of_capital":
      return "Return of Capital";
    case "preferred_return":
      return "Preferred Return";
    case "catch_up":
      return "GP Catch-Up";
    case "split":
      return "Residual Split";
    default:
      return tierCode.replace(/_/g, " ");
  }
}

function ensurePartnerAllocation(
  partnerAllocations: Map<string, BaseScenarioWaterfallAllocation>,
  partnerId: string
): BaseScenarioWaterfallAllocation {
  const existing = partnerAllocations.get(partnerId);
  if (existing) return existing;
  const created: BaseScenarioWaterfallAllocation = {
    return_of_capital: 0,
    preferred_return: 0,
    catch_up: 0,
    split: 0,
    total: 0,
  };
  partnerAllocations.set(partnerId, created);
  return created;
}

function runWaterfallComputation({
  partners,
  tiers,
  term,
  liquidationValue,
  asOfDate,
}: {
  partners: PartnerInput[];
  tiers: WaterfallTierRow[];
  term: FundTermRow | null;
  liquidationValue: number;
  asOfDate: Date;
}): WaterfallComputation {
  const partnerStates: PartnerWaterfallState[] = partners.map((partner) => {
    const lots = buildOutstandingLots(partner.ledgerEntries);
    const role = normalizeRole(partner.partner_type);
    const prefRate = term?.preferred_return_rate ?? 0.08;
    return {
      partnerId: partner.partner_id,
      role,
      committed: partner.committed,
      contributed: partner.contributed,
      distributed: partner.distributed,
      lots,
      prefDue: role === "lp" ? computePrefDue(lots, prefRate, asOfDate) : 0,
    };
  });

  const waterfallTiers = tiers.length > 0 ? tiers : buildDefaultTiers(term);
  const partnerAllocations = new Map<string, BaseScenarioWaterfallAllocation>();
  const tierSummaries: BaseScenarioTierSummary[] = [];
  let remaining = roundMoney(liquidationValue);
  let totalPreferredDue = partnerStates
    .filter((state) => state.role === "lp")
    .reduce((sum, state) => sum + state.prefDue, 0);
  let totalPreferredPaid = 0;
  let promoteTotal = 0;

  for (const tier of waterfallTiers.sort((left, right) => left.tier_order - right.tier_order)) {
    if (remaining <= 0.000001) {
      tierSummaries.push({
        tier_code: tier.tier_type,
        tier_label: tierLabel(tier.tier_type),
        lp_amount: 0,
        gp_amount: 0,
        total_amount: 0,
        remaining_after: 0,
      });
      continue;
    }

    let tierLpAmount = 0;
    let tierGpAmount = 0;
    const normalizedType = tier.tier_type.toLowerCase();

    if (normalizedType === "return_of_capital") {
      const totalUnreturned = partnerStates.reduce(
        (sum, state) => sum + state.lots.reduce((lotSum, lot) => lotSum + lot.amount, 0),
        0
      );
      const tierPool = Math.min(remaining, totalUnreturned);
      const allocations = allocateProRata(
        tierPool,
        partnerStates.map((state) => ({
          key: state.partnerId,
          weight: state.lots.reduce((sum, lot) => sum + lot.amount, 0),
        }))
      );
      for (const state of partnerStates) {
        const payout = allocations.get(state.partnerId) || 0;
        if (payout <= 0) continue;
        const allocation = ensurePartnerAllocation(partnerAllocations, state.partnerId);
        allocation.return_of_capital = roundMoney(allocation.return_of_capital + payout);
        allocation.total = roundMoney(allocation.total + payout);
        let remainingReduction = payout;
        for (const lot of state.lots) {
          if (remainingReduction <= 0) break;
          if (lot.amount <= 0) continue;
          const reduction = Math.min(lot.amount, remainingReduction);
          lot.amount -= reduction;
          remainingReduction -= reduction;
        }
        if (state.role === "lp") {
          tierLpAmount += payout;
        } else {
          tierGpAmount += payout;
        }
      }
      remaining = roundMoney(remaining - tierPool);
    } else if (normalizedType === "preferred_return") {
      const lpStates = partnerStates.filter((state) => state.role === "lp");
      const totalPref = lpStates.reduce((sum, state) => sum + state.prefDue, 0);
      const tierPool = Math.min(remaining, totalPref);
      const allocations = allocateProRata(
        tierPool,
        lpStates.map((state) => ({ key: state.partnerId, weight: state.prefDue }))
      );
      for (const state of lpStates) {
        const payout = allocations.get(state.partnerId) || 0;
        if (payout <= 0) continue;
        const allocation = ensurePartnerAllocation(partnerAllocations, state.partnerId);
        allocation.preferred_return = roundMoney(allocation.preferred_return + payout);
        allocation.total = roundMoney(allocation.total + payout);
        state.prefDue = Math.max(state.prefDue - payout, 0);
        tierLpAmount += payout;
        totalPreferredPaid += payout;
      }
      remaining = roundMoney(remaining - tierPool);
    } else if (normalizedType === "catch_up") {
      const carryRate = tier.split_gp ?? term?.carry_rate ?? 0.2;
      const targetCatchUp = carryRate > 0 && carryRate < 1
        ? Math.max((totalPreferredPaid * carryRate) / (1 - carryRate), 0)
        : 0;
      const gpStates = partnerStates.filter((state) => state.role === "gp");
      const tierPool = Math.min(remaining, targetCatchUp);
      const allocations = allocateProRata(
        tierPool,
        gpStates.map((state) => ({
          key: state.partnerId,
          weight: state.contributed || state.committed || 1,
        }))
      );
      for (const state of gpStates) {
        const payout = allocations.get(state.partnerId) || 0;
        if (payout <= 0) continue;
        const allocation = ensurePartnerAllocation(partnerAllocations, state.partnerId);
        allocation.catch_up = roundMoney(allocation.catch_up + payout);
        allocation.total = roundMoney(allocation.total + payout);
        tierGpAmount += payout;
        promoteTotal += payout;
      }
      remaining = roundMoney(remaining - tierPool);
    } else if (normalizedType === "split" || normalizedType === "promote") {
      const splitGp = tier.split_gp ?? term?.carry_rate ?? 0.2;
      const splitLp = tier.split_lp ?? (1 - splitGp);
      const gpPool = roundMoney(remaining * splitGp);
      const lpPool = roundMoney(remaining - gpPool);

      const gpStates = partnerStates.filter((state) => state.role === "gp");
      const lpStates = partnerStates.filter((state) => state.role === "lp");
      const gpAllocations = allocateProRata(
        gpPool,
        gpStates.map((state) => ({
          key: state.partnerId,
          weight: state.contributed || state.committed || 1,
        }))
      );
      const lpAllocations = allocateProRata(
        lpPool,
        lpStates.map((state) => ({
          key: state.partnerId,
          weight: state.contributed || state.committed || 1,
        }))
      );

      for (const state of gpStates) {
        const payout = gpAllocations.get(state.partnerId) || 0;
        if (payout <= 0) continue;
        const allocation = ensurePartnerAllocation(partnerAllocations, state.partnerId);
        allocation.split = roundMoney(allocation.split + payout);
        allocation.total = roundMoney(allocation.total + payout);
        tierGpAmount += payout;
        promoteTotal += payout;
      }

      for (const state of lpStates) {
        const payout = lpAllocations.get(state.partnerId) || 0;
        if (payout <= 0) continue;
        const allocation = ensurePartnerAllocation(partnerAllocations, state.partnerId);
        allocation.split = roundMoney(allocation.split + payout);
        allocation.total = roundMoney(allocation.total + payout);
        tierLpAmount += payout;
      }

      remaining = 0;
      if (splitLp === 0 && splitGp === 1) {
        promoteTotal += gpPool;
      }
    }

    tierSummaries.push({
      tier_code: tier.tier_type,
      tier_label: tierLabel(tier.tier_type),
      lp_amount: roundMoney(tierLpAmount),
      gp_amount: roundMoney(tierGpAmount),
      total_amount: roundMoney(tierLpAmount + tierGpAmount),
      remaining_after: roundMoney(remaining),
    });
  }

  const lpTotal = roundMoney(
    [...partnerAllocations.entries()].reduce((sum, [partnerId, allocation]) => {
      const state = partnerStates.find((candidate) => candidate.partnerId === partnerId);
      return sum + (state?.role === "lp" ? allocation.total : 0);
    }, 0)
  );
  const gpTotal = roundMoney(
    [...partnerAllocations.entries()].reduce((sum, [partnerId, allocation]) => {
      const state = partnerStates.find((candidate) => candidate.partnerId === partnerId);
      return sum + (state?.role === "gp" ? allocation.total : 0);
    }, 0)
  );

  const preferredReturnShortfall = roundMoney(
    partnerStates.filter((state) => state.role === "lp").reduce((sum, state) => sum + state.prefDue, 0)
  );
  const preferredReturnExcess = roundMoney(Math.max(totalPreferredPaid - totalPreferredDue, 0));

  return {
    partnerAllocations,
    tierSummaries,
    lpTotal,
    gpTotal,
    promoteTotal: roundMoney(promoteTotal),
    preferredReturnShortfall,
    preferredReturnExcess,
  };
}

function determineStatusCategory(asset: AssetRow, hasHistoricalRealization: boolean): "active" | "disposed" | "pipeline" {
  const assetStatus = (asset.asset_status || "").toLowerCase();
  const investmentStage = (asset.investment_stage || "").toLowerCase();
  if (assetStatus === "pipeline") return "pipeline";
  if (hasHistoricalRealization || assetStatus === "exited" || assetStatus === "written_off" || investmentStage === "exited") {
    return "disposed";
  }
  return "active";
}

function deriveHistoricalRealizations({
  assets,
  explicitRealizations,
}: {
  assets: AssetRow[];
  explicitRealizations: AssetHistoricalRealization[];
}): Map<string, AssetHistoricalRealization> {
  const realizationMap = new Map<string, AssetHistoricalRealization>();
  for (const realization of explicitRealizations) {
    realizationMap.set(realization.asset_id, realization);
  }

  const assetsByDeal = new Map<string, AssetRow[]>();
  for (const asset of assets) {
    const existing = assetsByDeal.get(asset.investment_id) || [];
    existing.push(asset);
    assetsByDeal.set(asset.investment_id, existing);
  }

  for (const [investmentId, investmentAssets] of assetsByDeal.entries()) {
    const explicitTotal = investmentAssets.reduce((sum, asset) => {
      const explicit = realizationMap.get(asset.asset_id);
      return sum + (explicit ? toNumber(explicit.attributable_proceeds) : 0);
    }, 0);
    const dealRealized = toNumber(investmentAssets[0]?.realized_distributions);
    const remainingAttributableProceeds = Math.max(dealRealized - explicitTotal, 0);
    if (remainingAttributableProceeds <= 0) continue;

    const candidateAssets = investmentAssets.filter((asset) => {
      if (realizationMap.has(asset.asset_id)) return false;
      const status = (asset.asset_status || "").toLowerCase();
      const stage = (asset.investment_stage || "").toLowerCase();
      return status === "exited" || status === "written_off" || stage === "exited";
    });
    const allocationTargets = candidateAssets.length > 0
      ? candidateAssets
      : investmentAssets;
    const totalWeight = allocationTargets.reduce((sum, asset) => {
      const basis = Math.max(toNumber(asset.cost_basis), toNumber(asset.asset_value), 1);
      return sum + basis;
    }, 0);

    allocationTargets.forEach((asset, index) => {
      const ownershipPercent = Math.max(toNumber(asset.ownership_percent), 0.000001);
      const weight = totalWeight > 0
        ? Math.max(toNumber(asset.cost_basis), toNumber(asset.asset_value), 1) / totalWeight
        : 1 / allocationTargets.length;
      const attributableProceeds = roundMoney(
        index === allocationTargets.length - 1
          ? remainingAttributableProceeds - allocationTargets
              .slice(0, -1)
              .reduce((sum, previousAsset) => {
                const previousWeight = totalWeight > 0
                  ? Math.max(toNumber(previousAsset.cost_basis), toNumber(previousAsset.asset_value), 1) / totalWeight
                  : 1 / allocationTargets.length;
                return sum + roundMoney(remainingAttributableProceeds * previousWeight);
              }, 0)
          : remainingAttributableProceeds * weight
      );

      const netSaleProceeds = roundMoney(attributableProceeds / ownershipPercent);
      const debtPayoff = roundMoney(Math.max(toNumber(asset.debt_balance), 0));
      const grossSalePrice = roundMoney((netSaleProceeds + debtPayoff) / (1 - DEFAULT_SALE_COST_PCT));
      const saleCosts = roundMoney(grossSalePrice * DEFAULT_SALE_COST_PCT);

      realizationMap.set(asset.asset_id, {
        asset_id: asset.asset_id,
        sale_date: null,
        gross_sale_price: grossSalePrice,
        sale_costs: saleCosts,
        debt_payoff: debtPayoff,
        net_sale_proceeds: roundMoney(grossSalePrice - saleCosts - debtPayoff),
        attributable_proceeds: attributableProceeds,
        source: "deal_realized_allocation",
        notes: `Allocated from investment ${investmentId} realized distributions.`,
      });
    });
  }

  return realizationMap;
}

function allocateDealLevelAssumptions({
  assets,
  assumptions,
}: {
  assets: AssetRow[];
  assumptions: SaleAssumption[];
}): Map<string, SaleAssumption[]> {
  const allocations = new Map<string, SaleAssumption[]>();
  const assetMap = new Map<string, AssetRow>(assets.map((asset) => [asset.asset_id, asset]));

  for (const assumption of assumptions) {
    if (assumption.asset_id && assetMap.has(assumption.asset_id)) {
      const existing = allocations.get(assumption.asset_id) || [];
      existing.push(assumption);
      allocations.set(assumption.asset_id, existing);
      continue;
    }

    const targetAssets = assets.filter((asset) => {
      if (asset.investment_id !== assumption.deal_id) return false;
      const status = determineStatusCategory(asset, false);
      return status === "active";
    });
    if (targetAssets.length === 0) continue;

    const totalWeight = targetAssets.reduce((sum, asset) => {
      return sum + Math.max(toNumber(asset.asset_value), toNumber(asset.nav), toNumber(asset.cost_basis), 1);
    }, 0);

    let saleAllocated = 0;
    let costsAllocated = 0;

    targetAssets.forEach((asset, index) => {
      const weight = totalWeight > 0
        ? Math.max(toNumber(asset.asset_value), toNumber(asset.nav), toNumber(asset.cost_basis), 1) / totalWeight
        : 1 / targetAssets.length;
      const allocatedSalePrice = roundMoney(
        index === targetAssets.length - 1
          ? assumption.sale_price - saleAllocated
          : assumption.sale_price * weight
      );
      const allocatedBuyerCosts = roundMoney(
        index === targetAssets.length - 1
          ? assumption.buyer_costs - costsAllocated
          : assumption.buyer_costs * weight
      );
      saleAllocated += allocatedSalePrice;
      costsAllocated += allocatedBuyerCosts;

      const existing = allocations.get(asset.asset_id) || [];
      existing.push({
        ...assumption,
        asset_id: asset.asset_id,
        sale_price: allocatedSalePrice,
        buyer_costs: allocatedBuyerCosts,
      });
      allocations.set(asset.asset_id, existing);
    });
  }

  return allocations;
}

async function queryOptionalNumber(
  pool: Queryable,
  sql: string,
  params: unknown[]
): Promise<number> {
  try {
    const result = await pool.query(sql, params);
    return toNumber(result.rows[0]?.total);
  } catch {
    return 0;
  }
}

async function loadFundInfo(pool: Queryable, fundId: string): Promise<FundInfo | null> {
  const result = await pool.query(
    `SELECT fund_id::text, name AS fund_name, target_size::float8, inception_date::text
     FROM repe_fund
     WHERE fund_id = $1::uuid`,
    [fundId]
  );
  return (result.rows[0] as FundInfo | undefined) ?? null;
}

async function loadFundTerm(pool: Queryable, fundId: string, asOfDate: Date): Promise<FundTermRow | null> {
  const result = await pool.query(
    `SELECT
       preferred_return_rate::float8,
       carry_rate::float8,
       management_fee_rate::float8,
       management_fee_basis,
       waterfall_style,
       catch_up_style
     FROM repe_fund_term
     WHERE fund_id = $1::uuid
       AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)
     ORDER BY effective_from DESC, created_at DESC
     LIMIT 1`,
    [fundId, asOfDate.toISOString().slice(0, 10)]
  );
  return (result.rows[0] as FundTermRow | undefined) ?? null;
}

async function loadWaterfallDefinition(
  pool: Queryable,
  fundId: string
): Promise<{ definitionId: string | null; waterfallType: string; tiers: WaterfallTierRow[] }> {
  const definitionResult = await pool.query(
    `SELECT definition_id::text, waterfall_type
     FROM re_waterfall_definition
     WHERE fund_id = $1::uuid AND is_active = true
     ORDER BY version DESC, created_at DESC
     LIMIT 1`,
    [fundId]
  );
  const definition = definitionResult.rows[0] as QueryResultRow | undefined;
  if (!definition) {
    return {
      definitionId: null,
      waterfallType: "european",
      tiers: [],
    };
  }

  const tiersResult = await pool.query(
    `SELECT
       tier_order,
       tier_type,
       hurdle_rate::float8,
       split_gp::float8,
       split_lp::float8,
       catch_up_percent::float8
     FROM re_waterfall_tier
     WHERE definition_id = $1::uuid
     ORDER BY tier_order`,
    [definition.definition_id]
  );

  return {
    definitionId: String(definition.definition_id),
    waterfallType: String(definition.waterfall_type || "european"),
    tiers: tiersResult.rows as WaterfallTierRow[],
  };
}

async function loadAssets(
  pool: Queryable,
  fundId: string,
  quarter: string,
  scenarioId: string | null
): Promise<AssetRow[]> {
  const scenarioClause = scenarioId
    ? "AND qs.scenario_id = $3::uuid"
    : "AND qs.scenario_id IS NULL";
  const params = scenarioId ? [fundId, quarter, scenarioId] : [fundId, quarter];

  const result = await pool.query(
    `WITH latest_qs AS (
       SELECT DISTINCT ON (qs.asset_id)
         qs.asset_id,
         qs.noi::float8,
         COALESCE(qs.net_cash_flow::float8, (COALESCE(qs.noi, 0) - COALESCE(qs.debt_service, 0))::float8) AS net_cash_flow,
         qs.asset_value::float8,
         qs.nav::float8,
         qs.debt_balance::float8,
         qs.cash_balance::float8,
         qs.occupancy::float8,
         qs.valuation_method
       FROM re_asset_quarter_state qs
       WHERE qs.quarter = $2
         ${scenarioClause}
       ORDER BY qs.asset_id, qs.created_at DESC
     )
     SELECT
       a.asset_id::text,
       a.name AS asset_name,
       COALESCE(a.asset_status, 'active') AS asset_status,
       d.deal_id::text AS investment_id,
       d.name AS investment_name,
       d.deal_type AS investment_type,
       d.stage AS investment_stage,
       d.committed_capital::float8,
       d.invested_capital::float8,
       d.realized_distributions::float8,
       a.cost_basis::float8,
       pa.property_type,
       COALESCE(NULLIF(pa.msa, ''), NULLIF(pa.market, ''), NULLIF(pa.city, '')) AS market,
       NULLIF(pa.city, '') AS city,
       NULLIF(pa.state, '') AS state,
       NULLIF(pa.msa, '') AS msa,
       COALESCE(j.ownership_percent::float8, 1.0) AS ownership_percent,
       lqs.noi,
       lqs.net_cash_flow,
       lqs.asset_value,
       lqs.nav,
       lqs.debt_balance,
       lqs.cash_balance,
       lqs.occupancy,
       lqs.valuation_method
     FROM repe_asset a
     JOIN repe_deal d ON d.deal_id = a.deal_id
     LEFT JOIN re_jv j ON j.jv_id = a.jv_id
     LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
     LEFT JOIN latest_qs lqs ON lqs.asset_id = a.asset_id
     WHERE d.fund_id = $1::uuid
     ORDER BY d.name, a.name`,
    params
  );

  return result.rows as AssetRow[];
}

async function loadHistoricalRealizations(
  pool: Queryable,
  fundId: string
): Promise<AssetHistoricalRealization[]> {
  try {
    const result = await pool.query(
      `SELECT
         asset_id::text,
         sale_date::text,
         gross_sale_price::float8,
         sale_costs::float8,
         debt_payoff::float8,
         net_sale_proceeds::float8,
         attributable_proceeds::float8,
         source,
         notes
       FROM re_asset_realization
       WHERE fund_id = $1::uuid`,
      [fundId]
    );
    return result.rows as AssetHistoricalRealization[];
  } catch {
    return [];
  }
}

async function loadSaleAssumptions(
  pool: Queryable,
  fundId: string,
  scenarioId: string | null
): Promise<SaleAssumption[]> {
  if (!scenarioId) return [];
  try {
    const result = await pool.query(
      `SELECT
         id,
         deal_id::text,
         asset_id::text,
         sale_price::float8,
         sale_date::text,
         buyer_costs::float8,
         disposition_fee_pct::float8
       FROM re_sale_assumption
       WHERE fund_id = $1::uuid AND scenario_id = $2::uuid
       ORDER BY sale_date, id`,
      [fundId, scenarioId]
    );
    return result.rows as SaleAssumption[];
  } catch {
    return [];
  }
}

async function loadPartners(
  pool: Queryable,
  fundId: string,
  quarter: string
): Promise<PartnerInput[]> {
  const partnersResult = await pool.query(
    `SELECT
       p.partner_id::text,
       p.name,
       p.partner_type,
       pc.committed_amount::float8 AS committed,
       COALESCE(SUM(CASE WHEN cle.entry_type = 'contribution' THEN cle.amount_base ELSE 0 END), 0)::float8 AS contributed,
       COALESCE(SUM(CASE WHEN cle.entry_type IN ('distribution', 'recallable_dist') THEN cle.amount_base ELSE 0 END), 0)::float8 AS distributed
     FROM re_partner p
     JOIN re_partner_commitment pc
       ON pc.partner_id = p.partner_id
      AND pc.fund_id = $1::uuid
      AND pc.status = 'active'
     LEFT JOIN re_capital_ledger_entry cle
       ON cle.partner_id = p.partner_id
      AND cle.fund_id = $1::uuid
      AND cle.quarter <= $2
     GROUP BY p.partner_id, p.name, p.partner_type, pc.committed_amount
     ORDER BY p.partner_type, p.name`,
    [fundId, quarter]
  );

  const ledgerResult = await pool.query(
    `SELECT
       partner_id::text,
       entry_type,
       COALESCE(amount_base::float8, amount::float8) AS amount,
       effective_date::text
     FROM re_capital_ledger_entry
     WHERE fund_id = $1::uuid
       AND quarter <= $2
     ORDER BY effective_date, created_at`,
    [fundId, quarter]
  );

  const ledgerByPartner = new Map<string, PartnerLedgerEntry[]>();
  for (const row of ledgerResult.rows as QueryResultRow[]) {
    const partnerId = String(row.partner_id);
    const existing = ledgerByPartner.get(partnerId) || [];
    existing.push({
      partnerId,
      entryType: String(row.entry_type || ""),
      amount: toNumber(row.amount),
      effectiveDate: new Date(`${String(row.effective_date)}T00:00:00.000Z`),
    });
    ledgerByPartner.set(partnerId, existing);
  }

  return (partnersResult.rows as QueryResultRow[]).map((row) => ({
    partner_id: String(row.partner_id),
    name: String(row.name || "Unknown"),
    partner_type: String(row.partner_type || "lp"),
    committed: toNumber(row.committed),
    contributed: toNumber(row.contributed),
    distributed: toNumber(row.distributed),
    ledgerEntries: ledgerByPartner.get(String(row.partner_id)) || [],
  }));
}

function buildAssetContributions({
  assets,
  historicalRealizations,
  saleAssumptions,
  liquidationMode,
}: {
  assets: AssetRow[];
  historicalRealizations: AssetHistoricalRealization[];
  saleAssumptions: SaleAssumption[];
  liquidationMode: BaseScenarioLiquidationMode;
}): BaseScenarioAssetContribution[] {
  const realizationMap = deriveHistoricalRealizations({
    assets,
    explicitRealizations: historicalRealizations,
  });
  const saleAssumptionMap = allocateDealLevelAssumptions({
    assets,
    assumptions: saleAssumptions,
  });

  const assetsByDeal = new Map<string, AssetRow[]>();
  for (const asset of assets) {
    const existing = assetsByDeal.get(asset.investment_id) || [];
    existing.push(asset);
    assetsByDeal.set(asset.investment_id, existing);
  }

  return assets.map((asset) => {
    const historicalRealization = realizationMap.get(asset.asset_id);
    const ownershipPercent = Math.max(toNumber(asset.ownership_percent), 0.000001);
    const statusCategory = determineStatusCategory(asset, Boolean(historicalRealization));
    const dealAssets = assetsByDeal.get(asset.investment_id) || [asset];
    const totalDealCostBasis = dealAssets.reduce((sum, candidate) => {
      return sum + Math.max(toNumber(candidate.cost_basis), 1);
    }, 0);
    const costBasisWeight = totalDealCostBasis > 0
      ? Math.max(toNumber(asset.cost_basis), 1) / totalDealCostBasis
      : 1 / dealAssets.length;
    const attributableEquityBasis = roundMoney(toNumber(asset.invested_capital) * costBasisWeight);

    const grossAssetValue = roundMoney(toNumber(asset.asset_value));
    const debtBalance = roundMoney(toNumber(asset.debt_balance));
    const netAssetValue = roundMoney(
      toNumber(asset.nav) || Math.max(grossAssetValue - debtBalance + toNumber(asset.cash_balance), 0)
    );
    const attributableGrossValue = roundMoney(grossAssetValue * ownershipPercent);
    const attributableNav = roundMoney(netAssetValue * ownershipPercent);
    const attributableNoi = roundMoney(toNumber(asset.noi) * ownershipPercent);
    const attributableNetCashFlow = roundMoney(toNumber(asset.net_cash_flow) * ownershipPercent);

    let grossSalePrice = roundMoney(toNumber(historicalRealization?.gross_sale_price));
    let saleCosts = roundMoney(toNumber(historicalRealization?.sale_costs));
    let debtPayoff = roundMoney(toNumber(historicalRealization?.debt_payoff));
    let netSaleProceeds = roundMoney(
      historicalRealization?.net_sale_proceeds != null
        ? toNumber(historicalRealization.net_sale_proceeds)
        : grossSalePrice - saleCosts - debtPayoff
    );
    let attributableRealizedProceeds = roundMoney(
      historicalRealization?.attributable_proceeds != null
        ? toNumber(historicalRealization.attributable_proceeds)
        : netSaleProceeds * ownershipPercent
    );

    const appliedSaleAssumptions = saleAssumptionMap.get(asset.asset_id) || [];
    const hasSaleAssumption = appliedSaleAssumptions.length > 0;
    let hypotheticalAttributedProceeds = 0;
    let saleAssumptionId: number | null = null;
    let saleDate: string | null = historicalRealization?.sale_date || null;
    const notes: string[] = [];
    let source = historicalRealization?.source || (statusCategory === "disposed" ? "deal_realized_allocation" : "current_mark");

    if (historicalRealization?.notes) {
      notes.push(historicalRealization.notes);
    }

    if (statusCategory === "disposed" && historicalRealization) {
      saleDate = historicalRealization.sale_date;
    }

    if (hasSaleAssumption && statusCategory === "active") {
      const assumption = appliedSaleAssumptions[0];
      saleAssumptionId = assumption.id;
      saleDate = assumption.sale_date;
      const salePrice = roundMoney(assumption.sale_price);
      const buyerCosts = roundMoney(assumption.buyer_costs);
      const dispositionFee = roundMoney(salePrice * assumption.disposition_fee_pct);
      const debtPaydown = roundMoney(Math.max(debtBalance, 0));
      const scenarioNetProceeds = roundMoney(salePrice - buyerCosts - dispositionFee - debtPaydown);
      hypotheticalAttributedProceeds = roundMoney(scenarioNetProceeds * ownershipPercent);
      notes.push("Hypothetical sale assumption applied.");
      source = "scenario_sale_assumption";
      if (liquidationMode === "hypothetical_sale") {
        grossSalePrice = salePrice;
        saleCosts = roundMoney(buyerCosts + dispositionFee);
        debtPayoff = debtPaydown;
        netSaleProceeds = scenarioNetProceeds;
      }
    }

    const currentValueContribution = roundMoney(
      statusCategory === "active"
        ? liquidationMode === "hypothetical_sale" && hasSaleAssumption
          ? hypotheticalAttributedProceeds
          : attributableNav
        : 0
    );

    const realizedGainLoss = roundMoney(
      statusCategory === "disposed"
        ? attributableRealizedProceeds - attributableEquityBasis
        : 0
    );
    const unrealizedGainLoss = roundMoney(
      statusCategory === "active"
        ? currentValueContribution - attributableEquityBasis
        : 0
    );

    return {
      asset_id: asset.asset_id,
      asset_name: asset.asset_name,
      investment_id: asset.investment_id,
      investment_name: asset.investment_name,
      investment_type: asset.investment_type,
      asset_status: asset.asset_status,
      status_category: statusCategory,
      property_type: asset.property_type,
      market: asset.market,
      city: asset.city,
      state: asset.state,
      msa: asset.msa,
      valuation_method: asset.valuation_method,
      ownership_percent: roundRatio(ownershipPercent) || ownershipPercent,
      attributable_equity_basis: attributableEquityBasis,
      gross_asset_value: grossAssetValue,
      debt_balance: debtBalance,
      net_asset_value: netAssetValue,
      attributable_gross_value: attributableGrossValue,
      attributable_nav: attributableNav,
      attributable_noi: attributableNoi,
      attributable_net_cash_flow: attributableNetCashFlow,
      gross_sale_price: grossSalePrice,
      sale_costs: saleCosts,
      debt_payoff: debtPayoff,
      net_sale_proceeds: netSaleProceeds,
      attributable_realized_proceeds: attributableRealizedProceeds,
      attributable_hypothetical_proceeds: roundMoney(hypotheticalAttributedProceeds),
      current_value_contribution: currentValueContribution,
      realized_gain_loss: realizedGainLoss,
      unrealized_gain_loss: unrealizedGainLoss,
      has_sale_assumption: hasSaleAssumption,
      sale_assumption_id: saleAssumptionId,
      sale_date: saleDate,
      source,
      notes,
    };
  });
}

function buildBridgeRows({
  paidInCapital,
  distributedCapital,
  attributableUnrealizedNav,
  remainingValue,
  historicalRealizedProceeds,
  managementFees,
  fundExpenses,
  carryShadow,
}: {
  paidInCapital: number;
  distributedCapital: number;
  attributableUnrealizedNav: number;
  remainingValue: number;
  historicalRealizedProceeds: number;
  managementFees: number;
  fundExpenses: number;
  carryShadow: number;
}): BaseScenarioBridgeRow[] {
  return [
    {
      label: "Paid-In Capital",
      amount: roundMoney(-paidInCapital),
      kind: "base",
    },
    {
      label: "Distributed Capital",
      amount: roundMoney(distributedCapital),
      kind: "positive",
    },
    {
      label: "Historical Realized Proceeds",
      amount: roundMoney(historicalRealizedProceeds),
      kind: "positive",
    },
    {
      label: "Remaining Asset Value",
      amount: roundMoney(attributableUnrealizedNav),
      kind: "positive",
    },
    {
      label: "Fees and Expenses",
      amount: roundMoney(-(managementFees + fundExpenses)),
      kind: "negative",
    },
    {
      label: "Promote / Carry",
      amount: roundMoney(-carryShadow),
      kind: "negative",
    },
    {
      label: "Ending Total Value",
      amount: roundMoney(distributedCapital + remainingValue),
      kind: "total",
    },
  ];
}

export async function computeFundBaseScenario({
  pool,
  fundId,
  quarter,
  scenarioId = null,
  liquidationMode = "current_state",
}: {
  pool: Queryable;
  fundId: string;
  quarter: string;
  scenarioId?: string | null;
  liquidationMode?: BaseScenarioLiquidationMode;
}): Promise<FundBaseScenarioResult> {
  const asOfDate = quarterEndDate(quarter);
  const [fundInfo, fundTerm, waterfallDefinition, assets, explicitRealizations, saleAssumptions, partners] =
    await Promise.all([
      loadFundInfo(pool, fundId),
      loadFundTerm(pool, fundId, asOfDate),
      loadWaterfallDefinition(pool, fundId),
      loadAssets(pool, fundId, quarter, scenarioId),
      loadHistoricalRealizations(pool, fundId),
      loadSaleAssumptions(pool, fundId, scenarioId),
      loadPartners(pool, fundId, quarter),
    ]);

  const assetContributions = buildAssetContributions({
    assets,
    historicalRealizations: explicitRealizations,
    saleAssumptions,
    liquidationMode,
  });

  const activeAssets = assetContributions.filter((asset) => asset.status_category === "active");
  const disposedAssets = assetContributions.filter((asset) => asset.status_category === "disposed");
  const pipelineAssets = assetContributions.filter((asset) => asset.status_category === "pipeline");

  const attributableNav = roundMoney(activeAssets.reduce((sum, asset) => sum + asset.attributable_nav, 0));
  const attributableUnrealizedNav = attributableNav;
  const hypotheticalAssetValue = roundMoney(
    activeAssets.reduce((sum, asset) => sum + asset.current_value_contribution, 0)
  );
  const realizedProceeds = roundMoney(
    disposedAssets.reduce((sum, asset) => sum + asset.attributable_realized_proceeds, 0)
  );
  const totalCommittedFromPartners = roundMoney(
    partners.reduce((sum, partner) => sum + partner.committed, 0)
  );
  const paidInCapital = roundMoney(
    partners.reduce((sum, partner) => sum + partner.contributed, 0)
  );
  const distributedCapital = roundMoney(
    partners.reduce((sum, partner) => sum + partner.distributed, 0)
  );
  const retainedRealizedCash = roundMoney(Math.max(realizedProceeds - distributedCapital, 0));
  const remainingValue = roundMoney(retainedRealizedCash + hypotheticalAssetValue);
  const totalValue = roundMoney(distributedCapital + remainingValue);
  const realizedGainLoss = roundMoney(
    disposedAssets.reduce((sum, asset) => sum + asset.realized_gain_loss, 0)
  );
  const unrealizedGainLoss = roundMoney(
    activeAssets.reduce((sum, asset) => sum + asset.unrealized_gain_loss, 0)
  );

  const earliestFlowDate = partners
    .flatMap((partner) => partner.ledgerEntries)
    .reduce<Date | null>((earliest, entry) => {
      if (!earliest) return entry.effectiveDate;
      return entry.effectiveDate < earliest ? entry.effectiveDate : earliest;
    }, fundInfo?.inception_date ? new Date(`${fundInfo.inception_date}T00:00:00.000Z`) : null);
  const feeBasisYears = earliestFlowDate ? Math.max(yearFraction(earliestFlowDate, asOfDate), 0.25) : 0;

  const explicitMgmtFees = await queryOptionalNumber(
    pool,
    `SELECT COALESCE(SUM(amount), 0)::float8 AS total
     FROM re_fee_accrual_qtr
     WHERE fund_id = $1::uuid AND quarter <= $2`,
    [fundId, quarter]
  );
  const explicitFundExpenses = await queryOptionalNumber(
    pool,
    `SELECT COALESCE(SUM(amount), 0)::float8 AS total
     FROM re_fund_expense_qtr
     WHERE fund_id = $1::uuid AND quarter <= $2`,
    [fundId, quarter]
  );
  const fallbackMgmtBasis =
    fundTerm?.management_fee_basis === "nav"
      ? attributableNav
      : fundTerm?.management_fee_basis === "invested"
        ? paidInCapital
        : totalCommittedFromPartners || toNumber(fundInfo?.target_size);
  const managementFees = roundMoney(
    explicitMgmtFees > 0
      ? explicitMgmtFees
      : (fundTerm?.management_fee_rate || 0) * fallbackMgmtBasis * feeBasisYears
  );
  const fundExpenses = roundMoney(explicitFundExpenses);

  const waterfallComputation = runWaterfallComputation({
    partners,
    tiers: waterfallDefinition.tiers,
    term: fundTerm,
    liquidationValue: remainingValue,
    asOfDate,
  });

  const carryShadow = waterfallComputation.promoteTotal;
  const netRemainingValue = roundMoney(
    Math.max(remainingValue - managementFees - fundExpenses - carryShadow, 0)
  );

  const fundCashflows = partners
    .flatMap((partner) =>
      partner.ledgerEntries.map((entry) => {
        const normalizedType = entry.entryType.toLowerCase();
        let amount = 0;
        if (normalizedType === "contribution") amount = -Math.abs(entry.amount);
        if (normalizedType === "distribution" || normalizedType === "recallable_dist") amount = Math.abs(entry.amount);
        if (amount === 0) return null;
        return { amount, date: entry.effectiveDate };
      })
    )
    .filter((cashflow): cashflow is Cashflow => Boolean(cashflow));
  if (netRemainingValue > 0) {
    fundCashflows.push({ amount: netRemainingValue, date: asOfDate });
  }
  const grossFundCashflows = [...fundCashflows.filter((cashflow) => cashflow.amount < 0 || cashflow.date.getTime() !== asOfDate.getTime())];
  if (remainingValue > 0) {
    grossFundCashflows.push({ amount: remainingValue, date: asOfDate });
  }

  const grossIrr = computeXirr(grossFundCashflows);
  const netIrr = computeXirr(fundCashflows);
  const dpi = paidInCapital > 0 ? distributedCapital / paidInCapital : null;
  const rvpi = paidInCapital > 0 ? remainingValue / paidInCapital : null;
  const tvpi = paidInCapital > 0 ? totalValue / paidInCapital : null;
  const netTvpi = paidInCapital > 0 ? (distributedCapital + netRemainingValue) / paidInCapital : null;

  const partnerAllocations: BaseScenarioPartnerAllocation[] = partners.map((partner) => {
    const liquidationAllocation = waterfallComputation.partnerAllocations.get(partner.partner_id) || {
      return_of_capital: 0,
      preferred_return: 0,
      catch_up: 0,
      split: 0,
      total: 0,
    };
    const currentValueShare = roundMoney(liquidationAllocation.total);
    const partnerCashflows = partner.ledgerEntries
      .map((entry) => {
        const normalizedType = entry.entryType.toLowerCase();
        if (normalizedType === "contribution") {
          return { amount: -Math.abs(entry.amount), date: entry.effectiveDate };
        }
        if (normalizedType === "distribution" || normalizedType === "recallable_dist") {
          return { amount: Math.abs(entry.amount), date: entry.effectiveDate };
        }
        return null;
      })
      .filter((cashflow): cashflow is Cashflow => Boolean(cashflow));
    if (currentValueShare > 0) {
      partnerCashflows.push({ amount: currentValueShare, date: asOfDate });
    }
    const partnerIrr = computeXirr(partnerCashflows);
    return {
      partner_id: partner.partner_id,
      name: partner.name,
      partner_type: partner.partner_type,
      committed: roundMoney(partner.committed),
      contributed: roundMoney(partner.contributed),
      distributed: roundMoney(partner.distributed),
      nav_share: currentValueShare,
      dpi: roundRatio(partner.contributed > 0 ? partner.distributed / partner.contributed : null),
      rvpi: roundRatio(partner.contributed > 0 ? currentValueShare / partner.contributed : null),
      tvpi: roundRatio(
        partner.contributed > 0
          ? (partner.distributed + currentValueShare) / partner.contributed
          : null
      ),
      irr: roundRatio(partnerIrr),
      waterfall_allocation: {
        return_of_capital: roundMoney(liquidationAllocation.return_of_capital),
        preferred_return: roundMoney(liquidationAllocation.preferred_return),
        catch_up: roundMoney(liquidationAllocation.catch_up),
        split: roundMoney(liquidationAllocation.split),
        total: currentValueShare,
      },
    };
  });

  const lpHistoricalDistributed = roundMoney(
    partnerAllocations
      .filter((partner) => normalizeRole(partner.partner_type) === "lp")
      .reduce((sum, partner) => sum + partner.distributed, 0)
  );
  const gpHistoricalDistributed = roundMoney(
    partnerAllocations
      .filter((partner) => normalizeRole(partner.partner_type) === "gp")
      .reduce((sum, partner) => sum + partner.distributed, 0)
  );

  return {
    fund_id: fundId,
    fund_name: fundInfo?.fund_name || null,
    quarter,
    scenario_id: scenarioId,
    liquidation_mode: liquidationMode,
    as_of_date: asOfDate.toISOString().slice(0, 10),
    summary: {
      active_assets: activeAssets.length,
      disposed_assets: disposedAssets.length,
      pipeline_assets: pipelineAssets.length,
      attributable_nav: attributableNav,
      attributable_unrealized_nav: attributableUnrealizedNav,
      hypothetical_asset_value: hypotheticalAssetValue,
      realized_proceeds: realizedProceeds,
      retained_realized_cash: retainedRealizedCash,
      current_distributable_proceeds: roundMoney(
        retainedRealizedCash +
          (liquidationMode === "hypothetical_sale"
            ? activeAssets.reduce((sum, asset) => {
                return sum + (asset.has_sale_assumption ? asset.current_value_contribution : 0);
              }, 0)
            : 0)
      ),
      remaining_value: remainingValue,
      total_value: totalValue,
      paid_in_capital: paidInCapital,
      distributed_capital: distributedCapital,
      total_committed: totalCommittedFromPartners || roundMoney(toNumber(fundInfo?.target_size)),
      dpi: roundRatio(dpi),
      rvpi: roundRatio(rvpi),
      tvpi: roundRatio(tvpi),
      gross_irr: roundRatio(grossIrr),
      net_irr: roundRatio(netIrr),
      net_tvpi: roundRatio(netTvpi),
      unrealized_gain_loss: unrealizedGainLoss,
      realized_gain_loss: realizedGainLoss,
      management_fees: managementFees,
      fund_expenses: fundExpenses,
      carry_shadow: roundMoney(carryShadow),
      lp_historical_distributed: lpHistoricalDistributed,
      gp_historical_distributed: gpHistoricalDistributed,
      lp_liquidation_allocation: waterfallComputation.lpTotal,
      gp_liquidation_allocation: waterfallComputation.gpTotal,
      promote_earned: roundMoney(waterfallComputation.promoteTotal),
      preferred_return_shortfall: roundMoney(waterfallComputation.preferredReturnShortfall),
      preferred_return_excess: roundMoney(waterfallComputation.preferredReturnExcess),
    },
    value_composition: {
      historical_realized_proceeds: realizedProceeds,
      retained_realized_cash: retainedRealizedCash,
      attributable_unrealized_nav: attributableUnrealizedNav,
      hypothetical_liquidation_value: hypotheticalAssetValue,
      remaining_value: remainingValue,
      total_value: totalValue,
    },
    waterfall: {
      definition_id: waterfallDefinition.definitionId,
      waterfall_type: waterfallDefinition.waterfallType,
      total_liquidation_value: remainingValue,
      lp_total: waterfallComputation.lpTotal,
      gp_total: waterfallComputation.gpTotal,
      promote_total: roundMoney(waterfallComputation.promoteTotal),
      tiers: waterfallComputation.tierSummaries,
      partner_allocations: partnerAllocations,
    },
    bridge: buildBridgeRows({
      paidInCapital,
      distributedCapital,
      attributableUnrealizedNav,
      remainingValue,
      historicalRealizedProceeds: realizedProceeds,
      managementFees,
      fundExpenses,
      carryShadow,
    }),
    assets: assetContributions,
    assumptions: {
      ownership_model: "Direct asset ownership uses JV ownership when present; LP/GP economics are applied in the fund waterfall layer.",
      realized_allocation_method: "Historical asset realizations use explicit asset events when available and otherwise allocate deal-level realized distributions by cost basis.",
      liquidation_mode: liquidationMode,
      notes: [
        "Paid-in capital uses contribution ledger entries through the selected quarter.",
        "Distributed capital uses historical distributions already posted through the selected quarter.",
        "Current waterfall allocations treat remaining value as a liquidation-at-as-of-date pool.",
      ],
    },
  };
}
