/**
 * Converts GpuCommandGraphOut business arrays into React Flow nodes and edges.
 *
 * Layout: 3 columns
 *   col 0 (x=60):   regions
 *   col 1 (x=340):  SKUs
 *   col 2 (x=620):  customers
 *
 * Exception badges are not separate RF nodes — they overlay the region or SKU
 * node via the data passed into those node components.
 */
import type { Node, Edge } from "@xyflow/react";
import type { GpuCommandGraphOut, GpuMetric } from "@/components/vultr/gpuGraphTypes";

const COL_X = [60, 340, 620] as const;
const ROW_GAP = 90;

export type RegionNodeData = {
  region_key: string;
  region_name: string;
  available_gpu_hours: number;
  utilized_gpu_hours: number;
  utilization_pct: number | null;
  capacity_risk: "low" | "medium" | "high" | "critical";
  exhaustion_forecast_days: number | null | undefined;
  exhaustion_null_reason: string | null | undefined;
  exceptionCount: number;
  selected: boolean;
  onSelect: (key: string) => void;
};

export type SkuNodeData = {
  sku_key: string;
  gpu_model: string | null;
  utilized_gpu_hours: number;
  realized_price_per_hour_usd: number | null;
  gross_margin_per_hour_usd: number | null;
  margin_null_reason: string | null | undefined;
  selected: boolean;
  onSelect: (key: string) => void;
};

export type CustomerNodeData = {
  customer_id: string;
  name: string;
  segment: string | null;
  consumed_gpu_hours: number;
  concentration_pct: number | null;
  onSelect: (id: string) => void;
};

export function buildGraphElements(
  graph: GpuCommandGraphOut,
  activeRegion: string | null,
  activeSku: string | null,
  metric: GpuMetric,
  onSelectRegion: (key: string) => void,
  onSelectSku: (key: string) => void,
  onSelectCustomer: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { regions, sku_nodes, customer_nodes, flows, exceptions } = graph;

  const exceptionCountByRegion: Record<string, number> = {};
  for (const exc of exceptions) {
    // exceptions don't have a region_key directly — distribute equally for now
    // a future phase can join via customer → region
    exceptionCountByRegion["__global"] =
      (exceptionCountByRegion["__global"] ?? 0) + 1;
  }

  // Compute per-node total flow weight for edge scaling
  const maxRegionFlow = Math.max(
    ...flows
      .filter((f) => regions.some((r) => r.region_key === f.from))
      .map((f) => f.weight),
    1,
  );
  const maxSkuFlow = Math.max(
    ...flows
      .filter((f) => sku_nodes.some((s) => s.sku_key === f.from))
      .map((f) => f.weight),
    1,
  );

  // Nodes — regions
  const regionNodes: Node[] = regions.map((r, i) => ({
    id: `region__${r.region_key}`,
    type: "regionCapacity",
    position: { x: COL_X[0], y: i * ROW_GAP + 20 },
    data: {
      region_key: r.region_key,
      region_name: r.region_name,
      available_gpu_hours: r.available_gpu_hours,
      utilized_gpu_hours: r.utilized_gpu_hours,
      utilization_pct: r.utilization_pct,
      capacity_risk: r.capacity_risk,
      exhaustion_forecast_days: r.exhaustion_forecast_days,
      exhaustion_null_reason: r.exhaustion_null_reason,
      exceptionCount: exceptions.length > 0 && i === 0 ? exceptions.length : 0,
      selected: activeRegion === r.region_key,
      onSelect: onSelectRegion,
    } satisfies RegionNodeData,
  }));

  // Nodes — SKUs
  const skuNodes: Node[] = sku_nodes.map((s, i) => ({
    id: `sku__${s.sku_key}`,
    type: "skuFlow",
    position: { x: COL_X[1], y: i * ROW_GAP + 20 },
    data: {
      sku_key: s.sku_key,
      gpu_model: s.gpu_model,
      utilized_gpu_hours: s.utilized_gpu_hours,
      realized_price_per_hour_usd: s.realized_price_per_hour_usd,
      gross_margin_per_hour_usd: s.gross_margin_per_hour_usd,
      margin_null_reason: s.margin_null_reason,
      selected: activeSku === s.sku_key,
      onSelect: onSelectSku,
    } satisfies SkuNodeData,
  }));

  // Nodes — customers
  const customerNodes: Node[] = customer_nodes.map((c, i) => ({
    id: `customer__${c.customer_id}`,
    type: "customerNode",
    position: { x: COL_X[2], y: i * ROW_GAP + 20 },
    data: {
      customer_id: c.customer_id,
      name: c.name,
      segment: c.segment,
      consumed_gpu_hours: c.consumed_gpu_hours,
      concentration_pct: c.concentration_pct,
      onSelect: onSelectCustomer,
    } satisfies CustomerNodeData,
  }));

  // Edges — region → sku
  const regionSkuEdges: Edge[] = flows
    .filter(
      (f) =>
        regions.some((r) => r.region_key === f.from) &&
        sku_nodes.some((s) => s.sku_key === f.to),
    )
    .map((f, i) => {
      const strokeWidth = 1 + (f.weight / maxRegionFlow) * 5;
      return {
        id: `edge__r_s__${f.from}__${f.to}__${i}`,
        source: `region__${f.from}`,
        target: `sku__${f.to}`,
        type: "capacityFlow",
        data: { weight: f.weight, maxWeight: maxRegionFlow, metric },
        style: { strokeWidth },
        animated: false,
      };
    });

  // Edges — sku → customer
  const skuCustomerEdges: Edge[] = flows
    .filter(
      (f) =>
        sku_nodes.some((s) => s.sku_key === f.from) &&
        customer_nodes.some((c) => c.customer_id === f.to),
    )
    .map((f, i) => {
      const strokeWidth = 1 + (f.weight / maxSkuFlow) * 5;
      return {
        id: `edge__s_c__${f.from}__${f.to}__${i}`,
        source: `sku__${f.from}`,
        target: `customer__${f.to}`,
        type: "capacityFlow",
        data: { weight: f.weight, maxWeight: maxSkuFlow, metric },
        style: { strokeWidth },
        animated: false,
      };
    });

  return {
    nodes: [...regionNodes, ...skuNodes, ...customerNodes],
    edges: [...regionSkuEdges, ...skuCustomerEdges],
  };
}
