import type { FiCovenantResult, ReV2FundInvestmentRollupRow } from "@/lib/bos-api";

export type FlagSeverity = "high" | "medium" | "low";

export type ConcentrationEntry = {
  dimension: "sector" | "geography";
  label: string;
  pct: number;
  navShare: number;
};

export type RiskFlag = {
  key: string;
  label: string;
  severity: FlagSeverity;
  detail?: string;
  metric: string;
  value: number | string | null;
};

export const DSCR_WATCH = 1.2;
export const LTV_WATCH = 0.7;
export const DEFAULT_CONCENTRATION_THRESHOLD_PCT = 25;

export function toNumberSafe(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function navWeight(row: ReV2FundInvestmentRollupRow): number {
  return Math.max(
    0,
    toNumberSafe(row.fund_nav_contribution) ??
      toNumberSafe(row.total_asset_value) ??
      toNumberSafe(row.nav) ??
      0
  );
}

export function computeConcentrations(
  rollup: ReV2FundInvestmentRollupRow[],
  limit = 5
): { sector: ConcentrationEntry[]; geography: ConcentrationEntry[]; totalNav: number } {
  const sectorWeights = new Map<string, number>();
  const geoWeights = new Map<string, number>();
  let totalNav = 0;
  for (const row of rollup) {
    const weight = navWeight(row);
    if (weight <= 0) continue;
    totalNav += weight;
    if (row.sector_mix) {
      for (const [sector, shareRaw] of Object.entries(row.sector_mix)) {
        const share = Math.max(0, toNumberSafe(shareRaw) ?? 0);
        if (share <= 0) continue;
        sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + weight * share);
      }
    }
    const market = row.primary_market?.trim();
    if (market) {
      geoWeights.set(market, (geoWeights.get(market) ?? 0) + weight);
    }
  }

  const asEntries = (map: Map<string, number>, dimension: "sector" | "geography"): ConcentrationEntry[] =>
    [...map.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([label, navShare]) => ({
        dimension,
        label,
        navShare,
        pct: totalNav > 0 ? (navShare / totalNav) * 100 : 0,
      }));

  return {
    sector: asEntries(sectorWeights, "sector"),
    geography: asEntries(geoWeights, "geography"),
    totalNav,
  };
}

export function concentrationFlags(
  rollup: ReV2FundInvestmentRollupRow[],
  thresholdPct: number = DEFAULT_CONCENTRATION_THRESHOLD_PCT
): RiskFlag[] {
  const { sector, geography } = computeConcentrations(rollup, 1);
  const flags: RiskFlag[] = [];
  for (const entry of [sector[0], geography[0]]) {
    if (!entry) continue;
    if (entry.pct < thresholdPct) continue;
    flags.push({
      key: `concentration:${entry.dimension}:${entry.label}`,
      label: `${entry.dimension === "sector" ? "Sector" : "Geography"} concentration in ${entry.label} at ${entry.pct.toFixed(0)}% of NAV`,
      severity: entry.pct >= thresholdPct + 15 ? "high" : "medium",
      detail: `Single ${entry.dimension} exceeds ${thresholdPct}% threshold`,
      metric: `${entry.dimension}_concentration_pct`,
      value: entry.pct,
    });
  }
  return flags;
}

export function dscrLtvFlags(rollup: ReV2FundInvestmentRollupRow[]): RiskFlag[] {
  const flags: RiskFlag[] = [];
  let worstDscr: { name: string; value: number } | null = null;
  let worstLtv: { name: string; value: number } | null = null;
  for (const row of rollup) {
    const dscr = toNumberSafe(row.computed_dscr);
    const ltv = toNumberSafe(row.computed_ltv);
    if (dscr !== null && dscr < DSCR_WATCH && (worstDscr === null || dscr < worstDscr.value)) {
      worstDscr = { name: row.name, value: dscr };
    }
    if (ltv !== null && ltv > LTV_WATCH && (worstLtv === null || ltv > worstLtv.value)) {
      worstLtv = { name: row.name, value: ltv };
    }
  }
  if (worstDscr) {
    flags.push({
      key: `dscr:${worstDscr.name}`,
      label: `${worstDscr.name} DSCR at ${worstDscr.value.toFixed(2)}x`,
      severity: worstDscr.value < 1.0 ? "high" : "medium",
      detail: `Below ${DSCR_WATCH}x watch threshold`,
      metric: "computed_dscr",
      value: worstDscr.value,
    });
  }
  if (worstLtv) {
    flags.push({
      key: `ltv:${worstLtv.name}`,
      label: `${worstLtv.name} LTV at ${(worstLtv.value * 100).toFixed(0)}%`,
      severity: worstLtv.value > 0.8 ? "high" : "medium",
      detail: `Above ${(LTV_WATCH * 100).toFixed(0)}% watch threshold`,
      metric: "computed_ltv",
      value: worstLtv.value,
    });
  }
  return flags;
}

export function covenantFlags(covenants: FiCovenantResult[] | null | undefined): RiskFlag[] {
  if (!covenants?.length) return [];
  return covenants
    .filter((row) => row.breached || !row.pass)
    .slice(0, 3)
    .map((row) => {
      const descriptor =
        row.dscr !== null && row.dscr !== undefined
          ? `DSCR at ${row.dscr.toFixed(2)}x`
          : row.ltv !== null && row.ltv !== undefined
            ? `LTV at ${(row.ltv * 100).toFixed(0)}%`
            : "covenant threshold";
      return {
        key: `covenant:${row.id}`,
        label: `Loan covenant breach — ${descriptor}`,
        severity: (row.breached ? "high" : "medium") as FlagSeverity,
        detail: row.headroom !== null && row.headroom !== undefined ? `Headroom ${row.headroom.toFixed(2)}` : undefined,
        metric: "covenant_result",
        value: row.breached ? "breached" : "failing",
      };
    });
}

export function underperformerFlags(rollup: ReV2FundInvestmentRollupRow[]): RiskFlag[] {
  return rollup
    .map((row) => ({
      id: row.investment_id,
      name: row.name,
      irr: toNumberSafe(row.gross_irr) ?? toNumberSafe(row.net_irr),
      nav: navWeight(row),
    }))
    .filter((row) => row.irr !== null && row.irr < 0 && row.nav > 0)
    .sort((left, right) => (left.irr ?? 0) - (right.irr ?? 0))
    .slice(0, 2)
    .map(
      (row): RiskFlag => ({
        key: `underperformer:${row.id}`,
        label: `${row.name} IRR at ${((row.irr ?? 0) * 100).toFixed(1)}%`,
        severity: "high",
        detail: "Negative IRR drags fund-level performance",
        metric: "investment_irr",
        value: row.irr,
      })
    );
}

export function rankFlags(flags: RiskFlag[]): RiskFlag[] {
  const order: Record<FlagSeverity, number> = { high: 2, medium: 1, low: 0 };
  return [...flags].sort((a, b) => order[b.severity] - order[a.severity]);
}
