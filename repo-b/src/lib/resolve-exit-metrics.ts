/**
 * resolve-exit-metrics.ts
 *
 * Resolves display metrics for asset detail pages based on asset status.
 * For active assets, metrics come from the current quarter state.
 * For exited assets, metrics resolve from:
 *   1. Realization data (sale price, proceeds) when available
 *   2. Last meaningful pre-exit quarter state (before zeroes)
 *   3. Property-level fallback (repe_property_asset.occupancy / current_noi)
 *   4. Em-dash (null) — never a misleading zero
 */

import type { ReV2AssetDetail, ReV2AssetQuarterState } from "./bos-api";

export interface ResolvedMetric {
  value: number | null;
  label: string;
  /** If true, this is an exit snapshot metric, not a live value */
  isExitSnapshot: boolean;
}

export interface ResolvedAssetMetrics {
  isExited: boolean;
  saleDate: string | null;
  holdPeriodMonths: number | null;

  // Operations
  revenue: ResolvedMetric;
  noi: ResolvedMetric;
  occupancy: ResolvedMetric;
  noiMargin: ResolvedMetric;

  // Value
  assetValue: ResolvedMetric;
  capRate: ResolvedMetric;
  nav: ResolvedMetric;
  /** For exited assets: sale price */
  salePrice: ResolvedMetric | null;
  /** For exited assets: net proceeds after costs */
  netProceeds: ResolvedMetric | null;
  /** For exited assets: gain/loss on sale */
  gainOnSale: ResolvedMetric | null;

  // Capital
  debtBalance: ResolvedMetric;
  ltv: ResolvedMetric;
  dscr: ResolvedMetric;
  /** For exited assets: debt payoff amount */
  debtPayoff: ResolvedMetric | null;

  // Banner info
  exitBannerText: string | null;
}

function metric(value: number | null | undefined, label: string, isExit: boolean): ResolvedMetric {
  return {
    value: value != null && isFinite(Number(value)) ? Number(value) : null,
    label,
    isExitSnapshot: isExit,
  };
}

/**
 * Compute hold period in months between acquisition and sale.
 */
function holdPeriod(acqDate?: string, saleDate?: string): number | null {
  if (!acqDate || !saleDate) return null;
  const a = new Date(acqDate);
  const s = new Date(saleDate);
  if (isNaN(a.getTime()) || isNaN(s.getTime())) return null;
  return Math.round((s.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function resolveAssetMetrics(
  detail: ReV2AssetDetail,
  financialState: ReV2AssetQuarterState | null,
): ResolvedAssetMetrics {
  const { asset, property, realization, exit_quarter_state } = detail;
  const isExited = asset.status === "exited" || asset.status === "written_off";

  if (!isExited) {
    // ─── ACTIVE ASSET: use current quarter state as-is ───
    const rev = n(financialState?.revenue);
    const noi_ = n(financialState?.noi);
    const occ = n(financialState?.occupancy) ?? n(property.occupancy);
    const av = n(financialState?.asset_value);
    const cr = av && noi_ ? (noi_ * 4) / av : null;
    const nm = noi_ && rev ? noi_ / rev : null;

    return {
      isExited: false,
      saleDate: null,
      holdPeriodMonths: null,
      revenue: metric(rev, "Revenue (QTD)", false),
      noi: metric(noi_, "NOI (TTM)", false),
      occupancy: metric(occ, "Occupancy (Current)", false),
      noiMargin: metric(nm, "NOI Margin (TTM)", false),
      assetValue: metric(av, "Asset Value", false),
      capRate: metric(cr, "Cap Rate", false),
      nav: metric(n(financialState?.nav), "NAV", false),
      salePrice: null,
      netProceeds: null,
      gainOnSale: null,
      debtBalance: metric(n(financialState?.debt_balance), "Debt Balance", false),
      ltv: metric(n(financialState?.ltv), "LTV", false),
      dscr: metric(n(financialState?.dscr), "DSCR", false),
      debtPayoff: null,
      exitBannerText: null,
    };
  }

  // ─── EXITED ASSET: resolve from exit snapshot data ───
  const eqs = exit_quarter_state;
  const real = realization;
  const saleDateStr = real?.sale_date ?? null;

  // Prefer exit_quarter_state, fallback to property-level data, never default to 0
  const rev = nz(eqs?.revenue);
  const noi_ = nz(eqs?.noi) ?? nz(property.current_noi);
  const occ = nz(eqs?.occupancy) ?? nz(property.occupancy);
  const av = nz(eqs?.asset_value);
  const cr = av && noi_ ? (noi_ * 4) / av : null;
  const nm = noi_ && rev ? noi_ / rev : null;
  const debt = nz(eqs?.debt_balance);

  // Gain on sale = net proceeds - cost basis
  const costBasis = n(asset.cost_basis);
  const netProc = real ? n(real.net_sale_proceeds) : null;
  const gain = costBasis != null && netProc != null ? netProc - costBasis : null;

  const hpMonths = holdPeriod(asset.acquisition_date, saleDateStr ?? undefined);
  const exitDate = formatDate(saleDateStr);

  return {
    isExited: true,
    saleDate: saleDateStr,
    holdPeriodMonths: hpMonths,

    // Operations — "at exit" labels
    revenue: metric(rev, "Revenue at Exit", true),
    noi: metric(noi_, "NOI at Exit", true),
    occupancy: metric(occ, "Occupancy at Exit", true),
    noiMargin: metric(nm, "NOI Margin at Exit", true),

    // Value — exit-specific
    assetValue: metric(
      real ? n(real.gross_sale_price) : av,
      real ? "Sale Price" : "Asset Value at Exit",
      true,
    ),
    capRate: metric(cr, "Exit Cap Rate", true),
    nav: metric(nz(eqs?.nav), "NAV at Exit", true),
    salePrice: real ? metric(n(real.gross_sale_price), "Gross Sale Price", true) : null,
    netProceeds: real ? metric(netProc, "Net Sale Proceeds", true) : null,
    gainOnSale: gain != null ? metric(gain, "Gain on Sale", true) : null,

    // Capital — exit-specific
    debtBalance: metric(debt, "Debt at Exit", true),
    ltv: metric(nz(eqs?.ltv), "LTV at Exit", true),
    dscr: metric(nz(eqs?.dscr), "DSCR at Exit", true),
    debtPayoff: real && n(real.debt_payoff) != null
      ? metric(n(real.debt_payoff), "Debt Payoff", true)
      : null,

    // Banner
    exitBannerText: exitDate
      ? `This asset was sold on ${exitDate}. Metrics below reflect the exit snapshot${eqs?.quarter ? ` (${eqs.quarter})` : ""} and realized performance.`
      : `This asset has been exited. Metrics below reflect the last available snapshot and realized performance.`,
  };
}

/** Convert to number or null — never returns 0 for genuinely missing data */
function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return isFinite(num) ? num : null;
}

/** Convert to number or null, treating zero as null (for exit snapshot fallback) */
function nz(v: unknown): number | null {
  const num = n(v);
  return num === 0 ? null : num;
}
