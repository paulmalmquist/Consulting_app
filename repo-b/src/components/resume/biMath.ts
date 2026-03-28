"use client";

import type { ResumeBi, ResumeBiEntity } from "@/lib/bos-api";

export type ResumeBiSlice = {
  entity: ResumeBiEntity;
  breadcrumb: ResumeBiEntity[];
  descendants: ResumeBiEntity[];
  visibleChildren: ResumeBiEntity[];
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
  }));

  return {
    entity,
    breadcrumb,
    descendants,
    visibleChildren,
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
