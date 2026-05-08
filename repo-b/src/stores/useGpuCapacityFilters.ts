"use client";

import { create } from "zustand";

export type GpuPeriod = "7D" | "30D" | "MTD" | "QTD" | "90D";
export type GpuMetric = "utilization" | "revenue" | "margin" | "exhaustion";
export type GpuSegment = "all" | "enterprise" | "smb" | "startup";

export interface GpuCapacityFilters {
  region: string | null;
  sku: string | null;
  segment: GpuSegment;
  period: GpuPeriod;
  metric: GpuMetric;
}

interface GpuCapacityFiltersStore extends GpuCapacityFilters {
  setRegion: (region: string | null) => void;
  setSku: (sku: string | null) => void;
  setSegment: (segment: GpuSegment) => void;
  setPeriod: (period: GpuPeriod) => void;
  setMetric: (metric: GpuMetric) => void;
  setFromSearchParams: (params: URLSearchParams) => void;
  toSearchParams: () => URLSearchParams;
}

export const useGpuCapacityFilters = create<GpuCapacityFiltersStore>((set, get) => ({
  region: null,
  sku: null,
  segment: "all",
  period: "30D",
  metric: "utilization",

  setRegion: (region) => set({ region }),
  setSku: (sku) => set({ sku }),
  setSegment: (segment) => set({ segment }),
  setPeriod: (period) => set({ period }),
  setMetric: (metric) => set({ metric }),

  setFromSearchParams: (params) => {
    const region = params.get("region") ?? null;
    const sku = params.get("sku") ?? null;
    const segment = (params.get("segment") as GpuSegment | null) ?? "all";
    const period = (params.get("period") as GpuPeriod | null) ?? "30D";
    const metric = (params.get("metric") as GpuMetric | null) ?? "utilization";
    set({ region, sku, segment, period, metric });
  },

  toSearchParams: () => {
    const { region, sku, segment, period, metric } = get();
    const p = new URLSearchParams();
    if (region) p.set("region", region);
    if (sku) p.set("sku", sku);
    if (segment !== "all") p.set("segment", segment);
    if (period !== "30D") p.set("period", period);
    if (metric !== "utilization") p.set("metric", metric);
    return p;
  },
}));
