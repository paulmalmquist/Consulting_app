"use client";

import type { ResumeBi, ResumeBiEntity } from "@/lib/bos-api";

export type ResumeBiInspectionView = {
  title: string;
  summary: string;
  sql: string;
  sourceTables: string[];
  joins: string[];
  transformations: string[];
  filters: string[];
  metricDefinitions: Array<{ label: string; definition: string }>;
};

export type ResumeBiSlice = {
  entity: ResumeBiEntity;
  breadcrumb: ResumeBiEntity[];
  descendants: ResumeBiEntity[];
  visibleChildren: ResumeBiEntity[];
  filteredAssetCount: number;
  hasMeaningfulData: boolean;
  kpiContext: "demo" | "awaiting_selection";
  kpis: {
    portfolio_value: number;
    noi: number;
    occupancy: number;
    irr: number;
  };
  sectorBreakdown: Array<{ name: string; value: number }>;
  marketBreakdown: Array<{ name: string; value: number; x: number; y: number }>;
  trend: Array<{ quarter: string; noi: number; value: number; occupancy: number; irr: number }>;
};

function isAsset(entity: ResumeBiEntity) {
  return entity.level === "asset";
}

function buildIndex(entities: ResumeBiEntity[]) {
  const byId = new Map<string, ResumeBiEntity>();
  const children = new Map<string, ResumeBiEntity[]>();

  entities.forEach((entity) => {
    byId.set(entity.entity_id, entity);
    if (entity.parent_id) {
      const existing = children.get(entity.parent_id) ?? [];
      existing.push(entity);
      children.set(entity.parent_id, existing);
    }
  });

  return { byId, children };
}

function collectDescendants(rootId: string, children: Map<string, ResumeBiEntity[]>): ResumeBiEntity[] {
  const collected: ResumeBiEntity[] = [];
  const visit = (id: string) => {
    const next = children.get(id) ?? [];
    next.forEach((item) => {
      collected.push(item);
      visit(item.entity_id);
    });
  };
  visit(rootId);
  return collected;
}

function scoreEntity(entity: ResumeBiEntity, children: Map<string, ResumeBiEntity[]>) {
  const descendants = collectDescendants(entity.entity_id, children);
  const assets = [entity, ...descendants].filter(isAsset);
  return assets.reduce((score, asset) => {
    const value = Number(asset.metrics.portfolio_value ?? 0);
    const noi = Number(asset.metrics.noi ?? 0);
    const occ = Number(asset.metrics.occupancy ?? 0);
    const irr = Number(asset.metrics.irr ?? 0);
    const trendScore = asset.trend.length * 10;
    return score + value + noi * 100 + occ * 1_000 + irr * 1_000 + trendScore;
  }, 0);
}

export function findDefaultResumeBiEntityId(bi: ResumeBi) {
  const { children } = buildIndex(bi.entities);
  const candidates = bi.entities.filter((entity) => entity.level === "fund");
  if (candidates.length === 0) return bi.root_entity_id;
  return candidates
    .map((entity) => ({ entityId: entity.entity_id, score: scoreEntity(entity, children) }))
    .sort((left, right) => right.score - left.score)[0]?.entityId ?? bi.root_entity_id;
}

function getEntityScopeTable(level: ResumeBiEntity["level"]) {
  switch (level) {
    case "portfolio":
      return "gold.portfolio_rollup_quarter";
    case "fund":
      return "gold.fund_performance";
    case "investment":
      return "gold.investment_quarter";
    case "asset":
      return "gold.asset_quarter";
    default:
      return "gold.asset_quarter";
  }
}

export function buildResumeBiInspectionView(
  slice: ResumeBiSlice,
  filters: { market?: string; propertyType?: string; period?: string },
  focusLabel?: string,
): ResumeBiInspectionView {
  const scopeTable = getEntityScopeTable(slice.entity.level);
  const tableAlias = "scope";
  const appliedFilters = [
    `entity scope = ${slice.entity.level}:${slice.entity.name}`,
    filters.market && filters.market !== "All Markets" ? `market = ${filters.market}` : "market = all",
    filters.propertyType && filters.propertyType !== "All Types"
      ? `property_type = ${filters.propertyType}`
      : "property_type = all",
    filters.period ? `period <= ${filters.period}` : "period = latest available",
    focusLabel ? `inspection focus = ${focusLabel}` : null,
  ].filter(Boolean) as string[];

  const whereClauses = [
    `${tableAlias}.entity_id = '${slice.entity.entity_id}'`,
    filters.market && filters.market !== "All Markets" ? `${tableAlias}.market = '${filters.market}'` : null,
    filters.propertyType && filters.propertyType !== "All Types"
      ? `${tableAlias}.property_type = '${filters.propertyType}'`
      : null,
    filters.period ? `${tableAlias}.period <= '${filters.period}'` : null,
  ].filter(Boolean);

  return {
    title: focusLabel ? `${slice.entity.name} inspection - ${focusLabel}` : `${slice.entity.name} inspection`,
    summary: "Readable lineage for the current BI slice, combining business-language notes with governed pseudo-SQL.",
    sql: [
      "SELECT",
      `  ${tableAlias}.period,`,
      `  SUM(${tableAlias}.portfolio_value) AS portfolio_value,`,
      `  SUM(${tableAlias}.noi) AS noi,`,
      `  AVG(${tableAlias}.occupancy) AS occupancy,`,
      `  AVG(${tableAlias}.irr) AS irr`,
      `FROM ${scopeTable} ${tableAlias}`,
      "LEFT JOIN gold.asset_quarter asset_q",
      `  ON ${tableAlias}.entity_id = asset_q.parent_entity_id`,
      "LEFT JOIN semantic.fund_analytics semantic_model",
      `  ON semantic_model.entity_id = ${tableAlias}.entity_id`,
      whereClauses.length > 0 ? `WHERE ${whereClauses.join("\n  AND ")}` : "",
      `GROUP BY ${tableAlias}.period`,
      `ORDER BY ${tableAlias}.period DESC;`,
    ]
      .filter(Boolean)
      .join("\n"),
    sourceTables: [
      scopeTable,
      "gold.asset_quarter",
      "semantic.fund_analytics",
      "bi.executive_dashboard_dataset",
    ],
    joins: [
      "LEFT JOIN asset grain so parent rows survive even when a child slice is sparse.",
      "Semantic model overlays standardized KPI logic on top of governed gold tables.",
      "BI dataset consumes semantic outputs for drillable dashboard rendering.",
    ],
    transformations: [
      "Warehouse -> ETL standardizes source extracts into governed silver/gold layers.",
      "Gold tables enforce canonical finance and operating definitions before BI exposure.",
      "Semantic layer defines shared KPI formulas so every drill level stays consistent.",
      "Dashboard rollups aggregate by the active entity scope while preserving child drill paths.",
    ],
    filters: appliedFilters,
    metricDefinitions: [
      { label: "Portfolio Value", definition: "SUM(governed portfolio_value) across the active drill slice." },
      { label: "NOI", definition: "SUM(asset or investment NOI) rolled up through the selected hierarchy." },
      { label: "Occupancy", definition: "AVG(occupancy) across visible asset rows in the active slice." },
      { label: "IRR", definition: "AVG(IRR) across visible asset rows for comparability within the slice." },
    ],
  };
}

export function deriveResumeBiSlice(
  bi: ResumeBi,
  selectedEntityId: string,
  filters: { market?: string; propertyType?: string; period?: string },
): ResumeBiSlice {
  const { byId, children } = buildIndex(bi.entities);
  const entity = byId.get(selectedEntityId) ?? byId.get(bi.root_entity_id)!;
  const descendants = collectDescendants(entity.entity_id, children);
  const allAssets = [entity, ...descendants].filter(isAsset);
  const filteredAssets = allAssets.filter((asset) => {
    if (filters.market && filters.market !== "All Markets" && asset.market !== filters.market) return false;
    if (
      filters.propertyType &&
      filters.propertyType !== "All Types" &&
      asset.property_type !== filters.propertyType
    ) {
      return false;
    }
    return true;
  });

  const assetPool = filteredAssets.length > 0 ? filteredAssets : allAssets;
  const visibleChildren = (children.get(entity.entity_id) ?? []).filter((item) => {
    if (item.level === "asset") {
      return assetPool.some((asset) => asset.entity_id === item.entity_id);
    }
    return true;
  });

  const breadcrumb: ResumeBiEntity[] = [];
  let cursor: ResumeBiEntity | undefined = entity;
  while (cursor) {
    breadcrumb.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }

  const kpis = assetPool.reduce(
    (acc, asset) => {
      acc.portfolio_value += Number(asset.metrics.portfolio_value ?? 0);
      acc.noi += Number(asset.metrics.noi ?? 0);
      acc.occupancy += Number(asset.metrics.occupancy ?? 0);
      acc.irr += Number(asset.metrics.irr ?? 0);
      return acc;
    },
    { portfolio_value: 0, noi: 0, occupancy: 0, irr: 0 },
  );
  if (assetPool.length > 0) {
    kpis.occupancy /= assetPool.length;
    kpis.irr /= assetPool.length;
  }

  const sectorMap = new Map<string, number>();
  const marketMap = new Map<string, { total: number; x: number; y: number }>();
  const trendIndex = new Map<string, { noi: number; value: number; occupancy: number; irr: number; count: number }>();

  assetPool.forEach((asset) => {
    const sector = asset.sector || "Other";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + Number(asset.metrics.portfolio_value ?? 0));

    const market = asset.market || "Unknown";
    const existingMarket = marketMap.get(market) ?? {
      total: 0,
      x: asset.coordinates?.x ?? 0.5,
      y: asset.coordinates?.y ?? 0.5,
    };
    existingMarket.total += Number(asset.metrics.portfolio_value ?? 0);
    marketMap.set(market, existingMarket);

    asset.trend.forEach((point) => {
      const existing = trendIndex.get(point.period) ?? { noi: 0, value: 0, occupancy: 0, irr: 0, count: 0 };
      existing.noi += point.noi;
      existing.value += point.value;
      existing.occupancy += point.occupancy;
      existing.irr += point.irr;
      existing.count += 1;
      trendIndex.set(point.period, existing);
    });
  });

  const trend = [...trendIndex.entries()].map(([period, totals]) => ({
    quarter: period,
    noi: totals.noi,
    value: totals.value,
    occupancy: totals.count ? totals.occupancy / totals.count : 0,
    irr: totals.count ? totals.irr / totals.count : 0,
  })).sort((left, right) => left.quarter.localeCompare(right.quarter));

  const hasMeaningfulData =
    assetPool.length > 0 &&
    (kpis.portfolio_value > 0 || kpis.noi > 0 || trend.length > 0 || marketMap.size > 0 || sectorMap.size > 0);

  return {
    entity,
    breadcrumb,
    descendants,
    visibleChildren,
    filteredAssetCount: assetPool.length,
    hasMeaningfulData,
    kpiContext: hasMeaningfulData ? "demo" : "awaiting_selection",
    kpis,
    sectorBreakdown: [...sectorMap.entries()].map(([name, value]) => ({ name, value })),
    marketBreakdown: [...marketMap.entries()].map(([name, market]) => ({
      name,
      value: market.total,
      x: market.x,
      y: market.y,
    })),
    trend,
  };
}
