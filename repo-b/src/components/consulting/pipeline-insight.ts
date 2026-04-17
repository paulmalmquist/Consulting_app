import type { ExecutionBoardColumn, ExecutionCard } from "@/lib/cro-api";

export type StageRow = {
  stage_key: string;
  stage_label: string;
  _total: number;
  _noAction: number;
  _stale: number;
  _hot: number;
  _moved24h: number;
  _healthLabel?: string | null;
  _momentum?: "up" | "flat" | "down";
  [industry: string]: string | number | null | undefined;
};

export type InsightSeverity = "critical" | "warning" | "info";

export type InsightRecommendation = {
  label: string;
  focusStage?: string | null;
  focusIndustry?: string | null;
};

export type Insight = {
  severity: InsightSeverity;
  headline: string;
  subline: string;
  recommendation: InsightRecommendation;
};

export function healthLabel(row: StageRow): string | null {
  const total = row._total;
  if (!total) return null;
  const noAction = row._noAction / total;
  const stale = row._stale / total;
  const hot = row._hot / total;

  const dims = [
    { key: "NEED ACTION", pct: noAction, threshold: 0.3 },
    { key: "STALE", pct: stale, threshold: 0.3 },
    { key: "PROGRESSING", pct: hot, threshold: 0.3 },
  ]
    .filter((d) => d.pct >= d.threshold)
    .sort((a, b) => b.pct - a.pct);

  if (!dims.length) return `${total} DEAL${total === 1 ? "" : "S"}`;
  return `${Math.round(dims[0].pct * 100)}% ${dims[0].key}`;
}

export function momentumArrow(row: StageRow): "up" | "flat" | "down" {
  if (!row._total) return "flat";
  const ratio = row._moved24h / row._total;
  if (ratio >= 0.4) return "up";
  if (ratio <= 0.1) return "down";
  return "flat";
}

const CLOSED_KEYS = new Set(["closed_won", "closed_lost"]);

export function computeInsight(cols: ExecutionBoardColumn[]): Insight {
  const openCols = cols.filter((c) => !CLOSED_KEYS.has(c.execution_column_key));

  // Single pass: compute all metrics needed for every insight rule
  const by: Record<string, number> = {};
  const industryTotals: Record<string, number> = {};
  const stalledByStage: Record<string, number> = {};
  let totalCards = 0;
  let totalStalled = 0;

  for (const col of openCols) {
    const key = col.execution_column_key;
    by[key] = col.cards.length;
    for (const card of col.cards) {
      totalCards += 1;
      const ind = (card.industry || "Other").trim() || "Other";
      industryTotals[ind] = (industryTotals[ind] ?? 0) + 1;
      if (
        card.risk_flags.includes("inactive_3d") ||
        card.risk_flags.includes("stalled_7d")
      ) {
        totalStalled += 1;
        stalledByStage[key] = (stalledByStage[key] ?? 0) + 1;
      }
    }
  }

  // Derive top industry from the single pass
  let topIndustry: { name: string; count: number; share: number } | null = null;
  for (const [name, count] of Object.entries(industryTotals)) {
    if (!topIndustry || count > topIndustry.count) {
      topIndustry = { name, count, share: totalCards > 0 ? count / totalCards : 0 };
    }
  }

  // Stalest stage from the pre-computed per-stage stall counts
  function stalestStage(): string | null {
    let worstKey: string | null = null;
    let worstPct = 0;
    for (const col of openCols) {
      if (!col.cards.length) continue;
      const pct = (stalledByStage[col.execution_column_key] ?? 0) / col.cards.length;
      if (pct > worstPct) { worstPct = pct; worstKey = col.execution_column_key; }
    }
    return worstKey;
  }

  const early = by.target_identified ?? 0;
  const outreach = by.outreach ?? 0;
  const contacted = outreach + (by.engaged ?? 0);
  const stalePct = totalCards > 0 ? totalStalled / totalCards : 0;

  // 1. No outreach happening
  if (early >= 5 && contacted === 0) {
    return {
      severity: "critical",
      headline: `${early} deals stuck pre-outreach · 0 contacted`,
      subline: "You are not doing outreach.",
      recommendation: {
        label: `Send ${Math.min(5, early)} outreach messages now`,
        focusStage: "target_identified",
      },
    };
  }

  // 3. Dominant industry exposure
  if (topIndustry && topIndustry.share > 0.5 && totalCards >= 4) {
    return {
      severity: "info",
      headline: `${topIndustry.name} is ${Math.round(topIndustry.share * 100)}% of your pipeline`,
      subline: "Concentrated exposure — focus execution here.",
      recommendation: {
        label: `Filter to ${topIndustry.name}`,
        focusIndustry: topIndustry.name,
      },
    };
  }

  // 4. Pipeline stalling
  if (stalePct > 0.4 && totalCards >= 4) {
    return {
      severity: "warning",
      headline: "Pipeline is stalling",
      subline: `${Math.round(stalePct * 100)}% of deals have risk flags.`,
      recommendation: {
        label: "Focus stalest stage",
        focusStage: stalestStage(),
      },
    };
  }

  // 5. No open deals at all
  if (totalCards === 0) {
    return {
      severity: "warning",
      headline: "Pipeline is empty",
      subline: "No open deals in any stage.",
      recommendation: {
        label: "Add new targets",
        focusStage: "target_identified",
      },
    };
  }

  // 6. Default — keep feeding
  return {
    severity: "info",
    headline: "Pipeline is moving",
    subline: "Nothing urgent. Keep feeding the top of funnel.",
    recommendation: {
      label: "Add new targets",
      focusStage: "target_identified",
    },
  };
}

export function pressureRank(p: ExecutionCard["execution_pressure"]): number {
  switch (p) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}
