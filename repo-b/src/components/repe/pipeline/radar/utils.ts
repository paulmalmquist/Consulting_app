import {
  type DealRadarAlert,
  type DealRadarBottleneck,
  type DealRadarDetailBundle,
  type DealRadarFilters,
  type DealRadarLayoutNode,
  type DealRadarMode,
  type DealRadarNode,
  type DealRadarRecommendation,
  type DealRadarSector,
  type DealRadarStage,
  type DealRadarSummary,
  type PipelineDealSummary,
  RADAR_SECTOR_ORDER,
  RADAR_STAGE_ORDER,
} from "./types";

export const RADAR_SECTOR_LABELS: Record<DealRadarSector, string> = {
  multifamily: "Multifamily",
  industrial: "Industrial",
  office: "Office",
  retail: "Retail",
  student_housing: "Student Housing",
  medical_office: "Medical Office",
  mixed_use: "Mixed Use",
  hospitality: "Hospitality",
};

export const RADAR_STAGE_LABELS: Record<DealRadarStage, string> = {
  sourced: "Sourced",
  screening: "Screening",
  loi: "LOI",
  dd: "Due Diligence",
  ic: "IC",
  closing: "Closing",
  ready: "Execution Ready",
};

export const RADAR_MODE_LABELS: Record<DealRadarMode, string> = {
  stage: "Stage",
  capital: "Capital",
  risk: "Risk",
  fit: "Strategy Fit",
  market: "Market",
};

const ACTIVE_STATUS_ORDER = {
  sourced: 0,
  screening: 1,
  loi: 2,
  dd: 3,
  ic: 4,
  closing: 5,
} as const;

const STAGE_PROGRESS_WEIGHT: Record<DealRadarStage, number> = {
  sourced: 0.12,
  screening: 0.24,
  loi: 0.42,
  dd: 0.6,
  ic: 0.78,
  closing: 0.9,
  ready: 1,
};

const MODE_SORTER: Record<DealRadarMode, (node: DealRadarNode) => number> = {
  stage: (node) => STAGE_PROGRESS_WEIGHT[node.stage] * 100 + node.readinessScore,
  capital: (node) => node.equityRequired ?? node.headlinePrice ?? 0,
  risk: (node) => node.riskScore,
  fit: (node) => node.fitScore,
  market: (node) => node.marketScore,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dedupeAlerts(alerts: Array<DealRadarAlert | null | undefined>): DealRadarAlert[] {
  const next = new Set<DealRadarAlert>();
  alerts.forEach((alert) => {
    if (alert) next.add(alert);
  });
  return Array.from(next);
}

export function coerceNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value: string | null | undefined): number | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  const diff = parsed.getTime() - Date.now();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function daysSince(value: string | null | undefined): number | null {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  const diff = Date.now() - parsed.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function formatMoney(value: number | string | null | undefined): string {
  const numeric = coerceNumber(value);
  if (numeric == null || numeric === 0) return "—";
  if (Math.abs(numeric) >= 1e9) return `$${(numeric / 1e9).toFixed(2)}B`;
  if (Math.abs(numeric) >= 1e6) return `$${(numeric / 1e6).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1e3) return `$${(numeric / 1e3).toFixed(0)}K`;
  return `$${numeric.toFixed(0)}`;
}

export function formatPercent(value: number | string | null | undefined): string {
  const numeric = coerceNumber(value);
  if (numeric == null) return "—";
  if (numeric >= 0 && numeric <= 1) return `${(numeric * 100).toFixed(1)}%`;
  return `${numeric.toFixed(1)}%`;
}

export function formatMultiple(value: number | string | null | undefined): string {
  const numeric = coerceNumber(value);
  return numeric == null ? "—" : `${numeric.toFixed(2)}x`;
}

export function formatRelativeDate(value: string | null | undefined): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return "—";
  const diffDays = daysSince(value);
  if (diffDays == null) return "—";
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.round(diffDays / 30)} mo ago`;
  return `${Math.round(diffDays / 365)} yr ago`;
}

export function buildLocationLabel(city?: string | null, state?: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "Location pending";
}

export function normalizeSector(sector: string | null | undefined): DealRadarSector | null {
  if (!sector) return null;
  const normalized = sector.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return RADAR_SECTOR_ORDER.includes(normalized as DealRadarSector)
    ? (normalized as DealRadarSector)
    : null;
}

export function deriveReadinessScore(deal: PipelineDealSummary): number {
  const status = deal.status as keyof typeof ACTIVE_STATUS_ORDER;
  const propertyCount = Number(deal.property_count || 0);
  const equityRequired = coerceNumber(deal.equity_required);
  const lastActivityDays = daysSince(deal.last_activity_at);
  const alerts = deal.attention_flags || [];
  const base = {
    sourced: 12,
    screening: 24,
    loi: 38,
    dd: 56,
    ic: 72,
    closing: 84,
    closed: 100,
    dead: 4,
  }[deal.status] ?? 12;

  let score = base;
  if (propertyCount > 0) score += 6;
  if (deal.broker_name || deal.broker_org || deal.source) score += 5;
  if (deal.target_close_date) score += 4;
  if (equityRequired != null && equityRequired > 0) score += 7;
  if (coerceNumber(deal.target_irr) != null && coerceNumber(deal.target_moic) != null) score += 4;
  if (lastActivityDays != null) {
    if (lastActivityDays <= 7) score += 8;
    else if (lastActivityDays <= 14) score += 5;
    else if (lastActivityDays <= 30) score += 2;
  }
  if (alerts.includes("capital_gap")) score -= 12;
  if (alerts.includes("missing_diligence")) score -= 10;
  if (alerts.includes("stale")) score -= 8;
  if (status === "closing" && deal.target_close_date && (daysUntil(deal.target_close_date) ?? 999) <= 30) {
    score += 5;
  }
  return clamp(Math.round(score), 0, 100);
}

export function normalizeStageForRadar(
  status: string,
  readinessScore: number,
  alerts: DealRadarAlert[],
): DealRadarStage | null {
  if (status === "closed" || status === "dead") return null;
  if (status === "closing" && readinessScore >= 88 && !alerts.includes("capital_gap") && !alerts.includes("missing_diligence")) {
    return "ready";
  }
  return RADAR_STAGE_ORDER.includes(status as DealRadarStage)
    ? (status as DealRadarStage)
    : null;
}

function deriveBaseAlerts(deal: PipelineDealSummary): DealRadarAlert[] {
  const statusRank = ACTIVE_STATUS_ORDER[deal.status as keyof typeof ACTIVE_STATUS_ORDER] ?? 0;
  const existing = new Set<DealRadarAlert>();
  (deal.attention_flags || []).forEach((flag) => {
    if (flag === "stale" || flag === "capital_gap" || flag === "missing_diligence" || flag === "priority") {
      existing.add(flag);
    }
  });

  if (statusRank >= 1 && (!deal.broker_name && !deal.broker_org && !deal.source)) existing.add("missing_diligence");
  if (statusRank >= 1 && Number(deal.property_count || 0) === 0) existing.add("missing_diligence");
  if (statusRank >= 2 && (coerceNumber(deal.equity_required) == null || coerceNumber(deal.equity_required) === 0)) {
    existing.add("capital_gap");
  }
  const staleDays = daysSince(deal.last_activity_at);
  if (staleDays == null || staleDays > 10) existing.add("stale");
  const closeDays = daysUntil(deal.target_close_date);
  if ((deal.status === "ic" || deal.status === "closing") && closeDays != null && closeDays <= 45) {
    existing.add("priority");
  }

  return Array.from(existing);
}

function buildBlockers(deal: PipelineDealSummary, alerts: DealRadarAlert[]): string[] {
  const blockers: string[] = [];
  if (alerts.includes("capital_gap")) blockers.push("Capital stack is incomplete or equity requirement is unresolved.");
  if (alerts.includes("missing_diligence")) {
    if (!deal.broker_name && !deal.broker_org && !deal.source) {
      blockers.push("Broker coverage is not confirmed in the pipeline record.");
    }
    if (Number(deal.property_count || 0) === 0) {
      blockers.push("Property detail is missing from the deal record.");
    }
  }
  if (alerts.includes("stale")) blockers.push("No recent activity has been logged in the last 10 days.");
  if ((deal.status === "ic" || deal.status === "closing") && !deal.target_close_date) {
    blockers.push("Target close timing is missing for a late-stage deal.");
  }
  if (
    (deal.status === "ic" || deal.status === "closing") &&
    (daysSince(deal.last_activity_at) ?? 999) > 5
  ) {
    blockers.push("Late-stage diligence has not been refreshed recently.");
  }
  return blockers.slice(0, 4);
}

function computeRiskScore(
  deal: PipelineDealSummary,
  alerts: DealRadarAlert[],
  sectorShare: number,
  marketShare: number,
): number {
  const strategyRisk = {
    core: 22,
    core_plus: 35,
    value_add: 52,
    opportunistic: 68,
    development: 72,
    debt: 30,
  }[deal.strategy || ""] ?? 40;
  const irr = coerceNumber(deal.target_irr) ?? 12;
  let score = strategyRisk + clamp((irr - 10) * 2.2, 0, 22);
  if (alerts.includes("capital_gap")) score += 16;
  if (alerts.includes("missing_diligence")) score += 12;
  if (alerts.includes("stale")) score += 10;
  score += sectorShare * 28;
  score += marketShare * 36;
  return clamp(Math.round(score), 10, 100);
}

function computeFitScore(strategy: string | null | undefined, riskScore: number, irr: number | null): number {
  const targetRisk = {
    core: 24,
    core_plus: 38,
    value_add: 56,
    opportunistic: 74,
    development: 78,
    debt: 32,
  }[strategy || ""] ?? 48;
  const targetReturn = {
    core: 11.5,
    core_plus: 13.5,
    value_add: 17,
    opportunistic: 20,
    development: 22,
    debt: 12,
  }[strategy || ""] ?? 15;
  const riskDistance = Math.abs(riskScore - targetRisk);
  const irrDistance = irr == null ? 4 : Math.abs(irr - targetReturn);
  const score = 100 - riskDistance * 1.15 - irrDistance * 4.5;
  return clamp(Math.round(score), 8, 98);
}

function computeMarketScore(
  deal: PipelineDealSummary,
  sectorShare: number,
  marketShare: number,
  alerts: DealRadarAlert[],
): number {
  let score = 84;
  score -= sectorShare * 14;
  score -= marketShare * 30;
  const lastActivity = daysSince(deal.last_activity_at);
  if (lastActivity != null && lastActivity <= 7) score += 8;
  if (Number(deal.property_count || 0) > 0) score += 4;
  if (alerts.includes("concentration")) score -= 12;
  return clamp(Math.round(score), 12, 99);
}

function buildSearchText(deal: PipelineDealSummary, sector: DealRadarSector) {
  return [
    deal.deal_name,
    deal.city,
    deal.state,
    deal.broker_name,
    deal.broker_org,
    deal.sponsor_name,
    deal.source,
    deal.fund_name,
    deal.strategy,
    sector,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sumValue(nodes: DealRadarNode[]): number {
  return nodes.reduce((total, node) => total + (node.headlinePrice ?? node.equityRequired ?? 0), 0);
}

function buildArchivedCounts(
  deals: PipelineDealSummary[],
  filters: DealRadarFilters,
): { closed: number; dead: number } {
  const archived = deals.filter((deal) => deal.status === "closed" || deal.status === "dead");
  const matchSector = (deal: PipelineDealSummary) => !filters.sector || normalizeSector(deal.property_type) === filters.sector;
  const haystack = filters.q.trim().toLowerCase();
  const matchSearch = (deal: PipelineDealSummary) => {
    if (!haystack) return true;
    return buildSearchText(deal, normalizeSector(deal.property_type) ?? "mixed_use").includes(haystack);
  };
  const matchFund = (deal: PipelineDealSummary) => !filters.fund || (deal.fund_id || "__unassigned__") === filters.fund;
  const matchStrategy = (deal: PipelineDealSummary) => !filters.strategy || deal.strategy === filters.strategy;
  return archived.reduce(
    (acc, deal) => {
      if (!matchSector(deal) || !matchSearch(deal) || !matchFund(deal) || !matchStrategy(deal)) return acc;
      if (deal.status === "closed") acc.closed += 1;
      if (deal.status === "dead") acc.dead += 1;
      return acc;
    },
    { closed: 0, dead: 0 },
  );
}

export function buildDealRadarNodes(deals: PipelineDealSummary[]): DealRadarNode[] {
  const activeDeals = deals.filter((deal) => deal.status !== "closed" && deal.status !== "dead");
  const sectorValue = new Map<DealRadarSector, number>();
  const marketValue = new Map<string, number>();
  let totalValue = 0;

  activeDeals.forEach((deal) => {
    const sector = normalizeSector(deal.property_type);
    if (!sector) return;
    const value = coerceNumber(deal.headline_price) ?? coerceNumber(deal.equity_required) ?? 0;
    totalValue += value;
    sectorValue.set(sector, (sectorValue.get(sector) || 0) + value);
    const market = buildLocationLabel(deal.city, deal.state);
    marketValue.set(market, (marketValue.get(market) || 0) + value);
  });

  return activeDeals.flatMap((deal) => {
    const sector = normalizeSector(deal.property_type);
    if (!sector) return [];
    const baseAlerts = deriveBaseAlerts(deal);
    const valueForSizing = coerceNumber(deal.equity_required) ?? coerceNumber(deal.headline_price) ?? 0;
    const sectorShare = totalValue > 0 ? (sectorValue.get(sector) || 0) / totalValue : 0;
    const marketLabel = buildLocationLabel(deal.city, deal.state);
    const marketShare = totalValue > 0 ? (marketValue.get(marketLabel) || 0) / totalValue : 0;
    const alerts = dedupeAlerts([
      ...baseAlerts,
      sectorShare >= 0.34 || marketShare >= 0.28 ? "concentration" : null,
    ]);
    const readinessScore = deriveReadinessScore({ ...deal, attention_flags: alerts });
    if (deal.status === "ic" || deal.status === "closing") {
      if (readinessScore >= 80) alerts.push("priority");
    }
    const normalizedAlerts = dedupeAlerts(alerts);
    const stage = normalizeStageForRadar(deal.status, readinessScore, normalizedAlerts);
    if (!stage) return [];
    const riskScore = computeRiskScore(deal, normalizedAlerts, sectorShare, marketShare);
    const fitScore = computeFitScore(deal.strategy, riskScore, coerceNumber(deal.target_irr));
    const marketScore = computeMarketScore(deal, sectorShare, marketShare, normalizedAlerts);

    return [{
      dealId: deal.deal_id,
      dealName: deal.deal_name,
      sector,
      stage,
      originalStage: deal.status,
      fundId: deal.fund_id || undefined,
      fundName: deal.fund_name || undefined,
      city: deal.city || undefined,
      state: deal.state || undefined,
      strategy: deal.strategy || undefined,
      source: deal.source || undefined,
      headlinePrice: coerceNumber(deal.headline_price) || undefined,
      equityRequired: coerceNumber(deal.equity_required) || undefined,
      targetIrr: coerceNumber(deal.target_irr) || undefined,
      targetMoic: coerceNumber(deal.target_moic) || undefined,
      brokerName: deal.broker_name || undefined,
      brokerOrg: deal.broker_org || undefined,
      sponsorName: deal.sponsor_name || undefined,
      lastUpdatedAt: deal.last_activity_at || deal.updated_at || deal.created_at,
      propertyCount: Number(deal.property_count || 0),
      activityCount: Number(deal.activity_count || 0),
      blockers: buildBlockers(deal, normalizedAlerts),
      alerts: normalizedAlerts,
      readinessScore,
      riskScore,
      fitScore,
      marketScore,
      valueForSizing,
      locationLabel: marketLabel,
      searchText: buildSearchText(deal, sector),
    }];
  });
}

export function matchesDealRadarFilters(node: DealRadarNode, filters: DealRadarFilters): boolean {
  if (filters.fund && (node.fundId || "__unassigned__") !== filters.fund) return false;
  if (filters.strategy && node.strategy !== filters.strategy) return false;
  if (filters.sector && node.sector !== filters.sector) return false;
  if (filters.stage && node.stage !== filters.stage) return false;
  if (filters.q.trim()) {
    const needle = filters.q.trim().toLowerCase();
    if (!node.searchText.includes(needle)) return false;
  }
  return true;
}

export function sortNodesForMode(nodes: DealRadarNode[], mode: DealRadarMode): DealRadarNode[] {
  return [...nodes].sort((a, b) => {
    const delta = MODE_SORTER[mode](b) - MODE_SORTER[mode](a);
    if (delta !== 0) return delta;
    return a.dealName.localeCompare(b.dealName);
  });
}

export function summarizeDealRadar(
  visibleNodes: DealRadarNode[],
  allDeals: PipelineDealSummary[],
  filters: DealRadarFilters,
): DealRadarSummary {
  const totalPipelineValue = visibleNodes.reduce((sum, node) => sum + (node.headlinePrice || 0), 0);
  const totalEquityRequired = visibleNodes.reduce((sum, node) => sum + (node.equityRequired || 0), 0);
  const dealCount = visibleNodes.length;
  const averageDealSize = dealCount > 0 ? totalPipelineValue / dealCount : 0;
  const weightedBase = visibleNodes.reduce(
    (sum, node) => sum + (node.headlinePrice || node.equityRequired || 1) * STAGE_PROGRESS_WEIGHT[node.stage],
    0,
  );
  const weightedDenominator = visibleNodes.reduce(
    (sum, node) => sum + (node.headlinePrice || node.equityRequired || 1),
    0,
  );
  const weightedPipeline = weightedDenominator > 0 ? Math.round((weightedBase / weightedDenominator) * 100) : 0;

  const stageCounts = RADAR_STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = visibleNodes.filter((node) => node.stage === stage).length;
    return acc;
  }, {} as Record<DealRadarStage, number>);

  const totalValue = Math.max(sumValue(visibleNodes), 1);
  const sectorExposure = RADAR_SECTOR_ORDER.map((sector) => {
    const sectorNodes = visibleNodes.filter((node) => node.sector === sector);
    const value = sectorNodes.reduce((sum, node) => sum + (node.headlinePrice || node.equityRequired || 0), 0);
    return {
      sector,
      label: RADAR_SECTOR_LABELS[sector],
      value,
      share: value / totalValue,
      dealCount: sectorNodes.length,
    };
  }).sort((a, b) => b.value - a.value);

  const fundMap = new Map<string, { fundId: string | null; fundName: string; value: number; dealCount: number }>();
  visibleNodes.forEach((node) => {
    const key = node.fundId || "__unassigned__";
    const existing = fundMap.get(key) || {
      fundId: node.fundId || null,
      fundName: node.fundName || "Unassigned",
      value: 0,
      dealCount: 0,
    };
    existing.value += node.headlinePrice || node.equityRequired || 0;
    existing.dealCount += 1;
    fundMap.set(key, existing);
  });
  const fundExposure = Array.from(fundMap.values())
    .map((row) => ({ ...row, share: row.value / totalValue }))
    .sort((a, b) => b.value - a.value);

  const marketMap = new Map<string, { market: string; value: number; dealCount: number }>();
  visibleNodes.forEach((node) => {
    const key = node.locationLabel;
    const existing = marketMap.get(key) || { market: key, value: 0, dealCount: 0 };
    existing.value += node.headlinePrice || node.equityRequired || 0;
    existing.dealCount += 1;
    marketMap.set(key, existing);
  });
  const marketExposure = Array.from(marketMap.values())
    .map((row) => ({ ...row, share: row.value / totalValue }))
    .sort((a, b) => b.value - a.value);

  const staleCount = visibleNodes.filter((node) => node.alerts.includes("stale")).length;
  const capitalGapCount = visibleNodes.filter((node) => node.alerts.includes("capital_gap")).length;
  const diligenceCount = visibleNodes.filter((node) => node.alerts.includes("missing_diligence")).length;
  const concentrationHotspot = sectorExposure.find((item) => item.share >= 0.34) || marketExposure.find((item) => item.share >= 0.28);

  const bottlenecks: DealRadarBottleneck[] = [];
  if (capitalGapCount > 0) {
    bottlenecks.push({
      id: "capital-gap",
      label: `${capitalGapCount} late-stage deals need capital stack resolution`,
      detail: "Equity requirement or committed debt is incomplete for LOI-and-beyond deals.",
      severity: capitalGapCount >= 2 ? "critical" : "warning",
    });
  }
  if (diligenceCount > 0) {
    bottlenecks.push({
      id: "diligence-gap",
      label: `${diligenceCount} deals are missing diligence coverage`,
      detail: "Broker coverage or linked property detail is incomplete in the pipeline record.",
      severity: "warning",
    });
  }
  if (staleCount > 0) {
    bottlenecks.push({
      id: "stale-activity",
      label: `${staleCount} deals have stale activity`,
      detail: "No recent update has been recorded in the last 10 days.",
      severity: staleCount >= 3 ? "critical" : "info",
    });
  }
  if (concentrationHotspot) {
    bottlenecks.push({
      id: "concentration",
      label: `${concentrationHotspot.dealCount} deals now cluster in ${"market" in concentrationHotspot ? concentrationHotspot.market : concentrationHotspot.label}`,
      detail: "Concentration is above the target threshold and should be reviewed before prioritizing additional allocation.",
      severity: "warning",
    });
  }

  return {
    totalPipelineValue,
    totalEquityRequired,
    dealCount,
    averageDealSize,
    weightedPipeline,
    stageCounts,
    sectorExposure,
    fundExposure,
    marketExposure,
    bottlenecks,
    archivedCounts: buildArchivedCounts(allDeals, filters),
  };
}

function scaleNodeSize(value: number, minValue: number, maxValue: number): number {
  if (maxValue <= minValue) return 22;
  const normalized = (Math.sqrt(Math.max(value, 1)) - Math.sqrt(Math.max(minValue, 1))) /
    (Math.sqrt(Math.max(maxValue, 1)) - Math.sqrt(Math.max(minValue, 1)));
  return clamp(16 + normalized * 18, 16, 34);
}

function cellGeometry(sector: DealRadarSector, stage: DealRadarStage) {
  const sectorIndex = RADAR_SECTOR_ORDER.indexOf(sector);
  const stageIndex = RADAR_STAGE_ORDER.indexOf(stage);
  const wedgeAngle = 360 / RADAR_SECTOR_ORDER.length;
  const outerRadius = 452;
  const coreRadius = 86;
  const band = (outerRadius - coreRadius) / RADAR_STAGE_ORDER.length;
  const angleStart = -90 - wedgeAngle / 2 + sectorIndex * wedgeAngle + 5;
  const angleEnd = angleStart + wedgeAngle - 10;
  const radiusOuter = outerRadius - stageIndex * band - 8;
  const radiusInner = radiusOuter - band + 16;
  return { angleStart, angleEnd, radiusInner, radiusOuter };
}

function toCartesian(angleDeg: number, radius: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: 500 + Math.cos(radians) * radius,
    y: 500 + Math.sin(radians) * radius,
  };
}

function toPolar(x: number, y: number) {
  const dx = x - 500;
  const dy = y - 500;
  return {
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    radius: Math.sqrt(dx * dx + dy * dy),
  };
}

function makeCellSlots(count: number, sector: DealRadarSector, stage: DealRadarStage) {
  const { angleStart, angleEnd, radiusInner, radiusOuter } = cellGeometry(sector, stage);
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const slots: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const angle = angleStart + ((col + 1) / (cols + 1)) * (angleEnd - angleStart);
    const radius = radiusOuter - ((row + 1) / (rows + 1)) * (radiusOuter - radiusInner);
    slots.push(toCartesian(angle, radius));
  }

  return slots;
}

function resolveCellCollisions(
  nodes: DealRadarLayoutNode[],
  sector: DealRadarSector,
  stage: DealRadarStage,
) {
  const { angleStart, angleEnd, radiusInner, radiusOuter } = cellGeometry(sector, stage);
  const adjusted = [...nodes];
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < adjusted.length; i += 1) {
      for (let j = i + 1; j < adjusted.length; j += 1) {
        const a = adjusted[i];
        const b = adjusted[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (a.size + b.size) / 2 + 6;
        if (distance >= minDistance) continue;

        const polar = toPolar(b.x, b.y);
        const nextAngle = clamp(polar.angle + (j % 2 === 0 ? 2.5 : -2.5), angleStart, angleEnd);
        const nextRadius = clamp(polar.radius + (pass % 2 === 0 ? 8 : -8), radiusInner, radiusOuter);
        const nextPoint = toCartesian(nextAngle, nextRadius);
        adjusted[j] = { ...b, ...nextPoint };
      }
    }
  }
  return adjusted;
}

export function computeRadarLayout(
  nodes: DealRadarNode[],
  mode: DealRadarMode,
  isCompact = false,
): DealRadarLayoutNode[] {
  const sorted = sortNodesForMode(nodes, mode);
  const minValue = Math.min(...sorted.map((node) => Math.max(node.valueForSizing || 1, 1)), 1);
  const maxValue = Math.max(...sorted.map((node) => Math.max(node.valueForSizing || 1, 1)), 1);
  const maxVisiblePerCell = isCompact ? 8 : 12;

  const grouped = new Map<string, DealRadarNode[]>();
  sorted.forEach((node) => {
    const key = `${node.sector}:${node.stage}`;
    const current = grouped.get(key) || [];
    current.push(node);
    grouped.set(key, current);
  });

  const layout: DealRadarLayoutNode[] = [];
  grouped.forEach((group, key) => {
    const [sector, stage] = key.split(":") as [DealRadarSector, DealRadarStage];
    const visibleDeals = group.length > maxVisiblePerCell ? group.slice(0, maxVisiblePerCell - 1) : group;
    const clusteredDeals = group.length > maxVisiblePerCell ? group.slice(maxVisiblePerCell - 1) : [];
    const slots = makeCellSlots(visibleDeals.length + (clusteredDeals.length ? 1 : 0), sector, stage);

    const cellNodes: DealRadarLayoutNode[] = visibleDeals.map((deal, index) => ({
      key: deal.dealId,
      kind: "deal" as const,
      ...slots[index],
      size: scaleNodeSize(deal.valueForSizing || 1, minValue, maxValue),
      sector,
      stage,
      alerts: deal.alerts,
      label: deal.dealName,
      deal,
    }));

    if (clusteredDeals.length) {
      const slot = slots[slots.length - 1];
      cellNodes.push({
        key: `${sector}-${stage}-cluster`,
        kind: "cluster",
        ...slot,
        size: 34,
        sector,
        stage,
        alerts: dedupeAlerts(clusteredDeals.flatMap((node) => node.alerts)),
        label: `+${clusteredDeals.length}`,
        clusterCount: clusteredDeals.length,
        clusterDeals: clusteredDeals,
      });
    }

    layout.push(...resolveCellCollisions(cellNodes, sector, stage));
  });

  return layout;
}

export function getModeColor(node: DealRadarNode, mode: DealRadarMode): string {
  if (mode === "stage") {
    return {
      sourced: "#7b8598",
      screening: "#4f8fd9",
      loi: "#d8a845",
      dd: "#d07a3d",
      ic: "#8a69d8",
      closing: "#3fb5a5",
      ready: "#7ad39a",
    }[node.stage];
  }
  if (mode === "capital") {
    const rank = clamp((node.equityRequired ?? node.headlinePrice ?? 0) / 60000000, 0.15, 1);
    return rank > 0.75 ? "#d1a15a" : rank > 0.45 ? "#a7b4ca" : "#6b778d";
  }
  if (mode === "risk") {
    if (node.riskScore >= 74) return "#d96e5d";
    if (node.riskScore >= 54) return "#d7a454";
    return "#7db9a5";
  }
  if (mode === "fit") {
    if (node.fitScore >= 75) return "#6fc29a";
    if (node.fitScore >= 50) return "#d2b068";
    return "#be6872";
  }
  if (node.marketScore >= 75) return "#7ab5e2";
  if (node.marketScore >= 55) return "#a2afc7";
  return "#6a788f";
}

export function getSectorEmphasis(
  nodes: DealRadarNode[],
  mode: DealRadarMode,
): Record<DealRadarSector, number> {
  const totalValue = Math.max(sumValue(nodes), 1);
  const grouped = RADAR_SECTOR_ORDER.reduce((acc, sector) => {
    const sectorNodes = nodes.filter((node) => node.sector === sector);
    let emphasis = 0.1;
    if (mode === "capital") {
      const share = sectorNodes.reduce((sum, node) => sum + (node.headlinePrice || node.equityRequired || 0), 0) / totalValue;
      emphasis = clamp(share * 2.1, 0.12, 0.42);
    } else if (mode === "risk") {
      const avgRisk = sectorNodes.length ? sectorNodes.reduce((sum, node) => sum + node.riskScore, 0) / sectorNodes.length : 0;
      emphasis = clamp(avgRisk / 220, 0.12, 0.4);
    } else if (mode === "fit") {
      const avgFit = sectorNodes.length ? sectorNodes.reduce((sum, node) => sum + node.fitScore, 0) / sectorNodes.length : 0;
      emphasis = clamp(avgFit / 220, 0.12, 0.38);
    } else if (mode === "market") {
      const avgMarket = sectorNodes.length ? sectorNodes.reduce((sum, node) => sum + node.marketScore, 0) / sectorNodes.length : 0;
      emphasis = clamp(avgMarket / 220, 0.12, 0.38);
    } else {
      const avgStage = sectorNodes.length
        ? sectorNodes.reduce((sum, node) => sum + STAGE_PROGRESS_WEIGHT[node.stage], 0) / sectorNodes.length
        : 0;
      emphasis = clamp(avgStage / 2.4, 0.12, 0.34);
    }
    acc[sector] = emphasis;
    return acc;
  }, {} as Record<DealRadarSector, number>);

  return grouped;
}

export function buildReadinessChecklist(node: DealRadarNode, details?: DealRadarDetailBundle | null) {
  const recentActivity = daysSince(node.lastUpdatedAt);
  const debtCoverage = details?.tranches.some((tranche) =>
    ["senior_debt", "bridge", "mezz", "note_purchase"].includes(String(tranche.tranche_type || "")) &&
    ["committed", "funded", "open"].includes(String(tranche.status || "")),
  ) ?? false;
  return [
    {
      id: "location",
      label: "Location and property coverage",
      complete: node.propertyCount > 0 || (details?.properties.length || 0) > 0,
      detail: node.propertyCount > 0 ? `${node.propertyCount} linked propert${node.propertyCount === 1 ? "y" : "ies"}` : "No linked property records",
    },
    {
      id: "broker",
      label: "Broker or source coverage",
      complete: Boolean(node.brokerName || node.brokerOrg || node.source),
      detail: node.brokerName || node.brokerOrg || node.source || "Broker/source missing",
    },
    {
      id: "capital",
      label: "Capital stack readiness",
      complete: Boolean(node.equityRequired && node.equityRequired > 0 && (details?.tranches.length || 0) > 0),
      detail: debtCoverage ? "Debt and equity tranches are present" : "Debt quotes or tranche structure need refresh",
    },
    {
      id: "timing",
      label: "Timing clarity",
      complete: Boolean(recentActivity != null && recentActivity <= 10),
      detail: recentActivity == null ? "No recent activity" : `Updated ${recentActivity} day${recentActivity === 1 ? "" : "s"} ago`,
    },
    {
      id: "returns",
      label: "Underwriting targets",
      complete: Boolean(node.targetIrr != null && node.targetMoic != null),
      detail: node.targetIrr != null && node.targetMoic != null
        ? `${formatPercent(node.targetIrr)} IRR / ${formatMultiple(node.targetMoic)} MOIC`
        : "Target IRR or MOIC missing",
    },
  ];
}

export function buildDealRecommendations(
  node: DealRadarNode,
  details?: DealRadarDetailBundle | null,
): DealRadarRecommendation[] {
  const recommendations: DealRadarRecommendation[] = [];
  const lateStage = node.stage === "ic" || node.stage === "closing" || node.stage === "ready";
  const hasDebt = details?.tranches.some((tranche) =>
    ["senior_debt", "bridge", "mezz", "note_purchase"].includes(String(tranche.tranche_type || "")),
  ) ?? false;

  if (node.alerts.includes("capital_gap")) {
    recommendations.push({
      id: "capital-gap",
      title: "Refresh debt and equity stack",
      detail: lateStage && !hasDebt
        ? "This deal is close to committee or closing but still lacks current debt coverage."
        : "Capital coverage should be updated before the next stage gate.",
      actionLabel: "Open Model",
    });
  }
  if (node.alerts.includes("missing_diligence")) {
    recommendations.push({
      id: "diligence-gap",
      title: "Close the diligence record gaps",
      detail: "Broker coverage or linked property detail is incomplete for this stage of the pipeline.",
      actionLabel: "View Deal",
    });
  }
  if (node.alerts.includes("concentration")) {
    recommendations.push({
      id: "concentration",
      title: "Review concentration before committing more capital",
      detail: `${node.locationLabel} or ${RADAR_SECTOR_LABELS[node.sector]} exposure is above the working allocation threshold.`,
      actionLabel: "Ask Winston",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      id: "advance",
      title: node.stage === "ready" ? "Move toward execution" : "Advance the next gate",
      detail: node.stage === "ready"
        ? "The record is structurally ready for execution, subject to final approvals."
        : `Prepare the next stage package for ${RADAR_STAGE_LABELS[node.stage]}.`,
      actionLabel: lateStage ? "Open Model" : "View Deal",
    });
  }

  return recommendations.slice(0, 3);
}
