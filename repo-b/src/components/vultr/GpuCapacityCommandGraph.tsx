"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { getVultrGpuCommandGraph } from "@/lib/vultr-api";
import type { GpuCommandGraphOut } from "@/lib/vultr-contracts";
import { FreshnessRow } from "./FreshnessBadge";
import { GpuCapacityKpiStrip } from "./GpuCapacityKpiStrip";
import { GpuCapacityExceptionDrawer } from "./GpuCapacityExceptionDrawer";
import { GpuCustomerConsumptionTable } from "./GpuCustomerConsumptionTable";
import { buildGraphElements } from "./gpuGraphAdapter";
import { useGpuCapacityFilters } from "@/stores/useGpuCapacityFilters";
import type { GpuPeriod, GpuMetric, GpuSegment } from "./gpuGraphTypes";

import RegionCapacityNode from "./RegionCapacityNode";
import SkuFlowNode from "./SkuFlowNode";
import CustomerNode from "./CustomerNode";
import CapacityFlowEdge from "./CapacityFlowEdge";

const NODE_TYPES: NodeTypes = {
  regionCapacity: RegionCapacityNode as never,
  skuFlow: SkuFlowNode as never,
  customerNode: CustomerNode as never,
};

const EDGE_TYPES: EdgeTypes = {
  capacityFlow: CapacityFlowEdge as never,
};

const PERIODS: GpuPeriod[] = ["7D", "30D", "MTD", "QTD", "90D"];
const METRICS: { key: GpuMetric; label: string }[] = [
  { key: "utilization", label: "Utilization" },
  { key: "revenue", label: "Revenue" },
  { key: "margin", label: "Margin" },
  { key: "exhaustion", label: "Exhaustion" },
];
const SEGMENTS: { key: GpuSegment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "enterprise", label: "Enterprise" },
  { key: "smb", label: "SMB" },
  { key: "startup", label: "Startup" },
];

interface Props {
  envId: string;
}

export function GpuCapacityCommandGraph({ envId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    region, sku, segment, period, metric,
    setRegion, setSku, setSegment, setPeriod, setMetric,
    setFromSearchParams, toSearchParams,
  } = useGpuCapacityFilters();

  const [graph, setGraph] = useState<GpuCommandGraphOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exceptionDrawerOpen, setExceptionDrawerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Sync URL → store on mount
  useEffect(() => {
    setFromSearchParams(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store → URL whenever filters change
  useEffect(() => {
    const params = toSearchParams();
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    router.replace(url, { scroll: false });
  }, [region, sku, segment, period, metric, pathname, router, toSearchParams]);

  // Fetch on filter change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getVultrGpuCommandGraph(envId, {
      period,
      region: region ?? undefined,
      sku: sku ?? undefined,
      segment: segment === "all" ? undefined : segment,
      metric,
    })
      .then((d) => {
        if (!cancelled) {
          setGraph(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [envId, region, sku, segment, period, metric]);

  const handleSelectRegion = useCallback(
    (key: string) => {
      setRegion(region === key ? null : key);
      setSku(null);
    },
    [region, setRegion, setSku],
  );

  const handleSelectSku = useCallback(
    (key: string) => {
      setSku(sku === key ? null : key);
    },
    [sku, setSku],
  );

  const handleSelectCustomer = useCallback((id: string) => {
    setSelectedCustomerId((prev) => (prev === id ? null : id));
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return buildGraphElements(
      graph,
      region,
      sku,
      metric,
      handleSelectRegion,
      handleSelectSku,
      handleSelectCustomer,
    );
  }, [graph, region, sku, metric, handleSelectRegion, handleSelectSku, handleSelectCustomer]);

  const selectedCustomer = graph?.customer_nodes.find(
    (c) => c.customer_id === selectedCustomerId,
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Freshness */}
      {graph && <FreshnessRow freshness={graph.freshness} />}

      {/* KPI strip */}
      {graph && <GpuCapacityKpiStrip kpis={graph.kpis} />}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {/* Period */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-1 transition-colors ${
                period === p
                  ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                  : "border border-bm-divider/30 text-bm-muted2 hover:border-bm-divider/60 hover:text-bm-fg"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-bm-divider/30" />

        {/* Metric */}
        <div className="flex items-center gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded px-2 py-1 transition-colors ${
                metric === m.key
                  ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                  : "border border-bm-divider/30 text-bm-muted2 hover:border-bm-divider/60 hover:text-bm-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-bm-divider/30" />

        {/* Segment */}
        <div className="flex items-center gap-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={`rounded px-2 py-1 transition-colors ${
                segment === s.key
                  ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                  : "border border-bm-divider/30 text-bm-muted2 hover:border-bm-divider/60 hover:text-bm-fg"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Exception badge */}
        {graph && graph.exceptions.length > 0 && (
          <>
            <div className="h-4 w-px bg-bm-divider/30" />
            <button
              onClick={() => setExceptionDrawerOpen(true)}
              className="flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/30 px-2 py-1 text-rose-300 transition-colors hover:bg-rose-950/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              {graph.exceptions.length} exception{graph.exceptions.length !== 1 ? "s" : ""}
            </button>
          </>
        )}

        {loading && (
          <span className="text-[10px] uppercase tracking-wider text-bm-muted2 animate-pulse">
            Loading…
          </span>
        )}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {/* Active filters chips */}
      {(region || sku) && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {region && (
            <span className="flex items-center gap-1 rounded border border-bm-accent/40 bg-bm-accent/10 px-2 py-0.5 text-bm-accent">
              Region: {region}
              <button onClick={() => setRegion(null)} aria-label="Clear region filter">×</button>
            </span>
          )}
          {sku && (
            <span className="flex items-center gap-1 rounded border border-bm-accent/40 bg-bm-accent/10 px-2 py-0.5 text-bm-accent">
              SKU: {sku}
              <button onClick={() => setSku(null)} aria-label="Clear SKU filter">×</button>
            </span>
          )}
        </div>
      )}

      {/* Main content: graph + table */}
      <div className="flex gap-4">
        {/* React Flow graph */}
        <div
          className="relative flex-1 overflow-hidden rounded border border-bm-divider/30"
          style={{ height: Math.max(480, (graph?.regions.length ?? 5) * 90 + 60) }}
          data-testid="gpu-command-graph"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.04)" />
            <Controls showInteractive={false} className="[&_button]:!bg-bm-bg-1 [&_button]:!border-bm-divider/30 [&_button]:!text-bm-muted2" />
          </ReactFlow>

          {!graph && !loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-bm-muted2">
              No data
            </div>
          )}
        </div>

        {/* Customer consumption table */}
        {graph && graph.customer_nodes.length > 0 && (
          <div className="w-[280px] shrink-0">
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Customer consumption
            </p>
            <GpuCustomerConsumptionTable
              customers={graph.customer_nodes}
              onSelectCustomer={handleSelectCustomer}
            />
            {selectedCustomer && (
              <div className="mt-3 rounded border border-bm-divider/30 bg-bm-bg-1/50 p-3 text-xs">
                <p className="font-medium">{selectedCustomer.name}</p>
                <p className="mt-0.5 text-bm-muted2">
                  {selectedCustomer.consumed_gpu_hours.toFixed(0)} GPU-hr consumed
                </p>
                {selectedCustomer.concentration_pct != null && (
                  <p className="text-bm-muted2">
                    {selectedCustomer.concentration_pct.toFixed(1)}% of total capacity
                  </p>
                )}
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="mt-2 text-[10px] text-bm-muted2 hover:text-bm-fg"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exception drawer */}
      {graph && (
        <GpuCapacityExceptionDrawer
          exceptions={graph.exceptions}
          open={exceptionDrawerOpen}
          onClose={() => setExceptionDrawerOpen(false)}
        />
      )}
    </div>
  );
}
