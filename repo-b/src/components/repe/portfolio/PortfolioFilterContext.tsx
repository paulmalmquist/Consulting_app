"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// 1. Filter State — pure, serializable, URL-synced
// ---------------------------------------------------------------------------

export interface MetricFilter {
  field: string;   // "gross_irr" | "dscr" | "ltv" | "nav" | "occupancy" etc.
  operator: "<" | ">" | "<=" | ">=" | "=";
  value: number;
}

export interface AttributeFilter {
  field: string;   // "property_type" | "state" | "market" | "strategy" | "vintage"
  value: string;
}

export interface FilterState {
  strategy: string | null;
  vintage: string | null;
  status: string | null;
  metricFilters: MetricFilter[];
  attributeFilters: AttributeFilter[];
  quarter: string;
  compareQuarter: string | null;
  activeModelId: string | null;
}

// ---------------------------------------------------------------------------
// 2. UI Interaction State — ephemeral, not URL-synced
// ---------------------------------------------------------------------------

export interface ChartSelection {
  dimension: string; // "fund" | "sector" | "geography"
  value: string;     // fund_id or sector name
}

export interface MapHighlight {
  assetIds: string[];
}

export interface SignalScope {
  signalId: string;
  filterOverrides: Record<string, string>;
}

export interface UIInteractionState {
  chartSelection: ChartSelection | null;
  mapHighlight: MapHighlight | null;
  hoveredFundId: string | null;
  signalScope: SignalScope | null;
}

// ---------------------------------------------------------------------------
// 3. Command State — search input lifecycle
// ---------------------------------------------------------------------------

export interface QueryResolverFilter {
  field: string;
  operator: string;
  value: string | number;
}

export interface QueryResolverEntity {
  entity_type: string;
  entity_id: string;
  name: string;
  secondary?: string | null;
  metric?: { label: string; value: string } | null;
}

export interface QueryResolverAction {
  command: string;
  label: string;
  params?: Record<string, string> | null;
}

export interface QueryResolverResponse {
  filters: QueryResolverFilter[];
  entities: QueryResolverEntity[];
  actions: QueryResolverAction[];
  slash_command: string | null;
}

export interface CommandState {
  query: string;
  isOpen: boolean;
  results: QueryResolverResponse | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Active filter display
// ---------------------------------------------------------------------------

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  source: "dimension" | "metric" | "attribute" | "signal" | "chart" | "model" | "time";
  onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export interface PortfolioFilterContextValue {
  // Filter state
  filters: FilterState;
  setDimensionFilter: (dim: "strategy" | "vintage" | "status", value: string | null) => void;
  setMetricFilters: (filters: MetricFilter[]) => void;
  addMetricFilter: (filter: MetricFilter) => void;
  removeMetricFilter: (field: string) => void;
  setAttributeFilters: (filters: AttributeFilter[]) => void;
  addAttributeFilter: (filter: AttributeFilter) => void;
  removeAttributeFilter: (field: string) => void;
  setQuarter: (q: string) => void;
  setCompareQuarter: (q: string | null) => void;
  setActiveModelId: (id: string | null) => void;

  // UI interaction state
  ui: UIInteractionState;
  setChartSelection: (sel: ChartSelection | null) => void;
  setMapHighlight: (hl: MapHighlight | null) => void;
  setHoveredFundId: (id: string | null) => void;
  setSignalScope: (scope: SignalScope | null) => void;

  // Command state
  command: CommandState;
  setCommandQuery: (q: string) => void;
  setCommandOpen: (open: boolean) => void;
  setCommandResults: (results: QueryResolverResponse | null) => void;
  setCommandLoading: (loading: boolean) => void;

  // Derived
  activeFilters: ActiveFilter[];
  activeFilterCount: number;
  hasActiveFilters: boolean;
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Quarter helpers
// ---------------------------------------------------------------------------

export function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

export function formatQuarterLabel(quarter: string): string {
  return quarter.replace("Q", " Q");
}

function previousQuarter(quarter: string): string {
  const match = quarter.match(/^(\d{4})Q(\d)$/);
  if (!match) return quarter;
  let year = parseInt(match[1], 10);
  let q = parseInt(match[2], 10);
  q -= 1;
  if (q < 1) {
    q = 4;
    year -= 1;
  }
  return `${year}Q${q}`;
}

export function getAvailableQuarters(count = 12): string[] {
  const quarters: string[] = [];
  let current = pickCurrentQuarter();
  for (let i = 0; i < count; i++) {
    quarters.push(current);
    current = previousQuarter(current);
  }
  return quarters;
}

// ---------------------------------------------------------------------------
// URL param helpers
// ---------------------------------------------------------------------------

const URL_PARAM_MAP = {
  strategy: "strategy",
  vintage: "vintage",
  status: "status",
  quarter: "q_period",
  compareQuarter: "q_compare",
  activeModelId: "model_id",
} as const;

function serializeMetricFilters(filters: MetricFilter[]): string {
  if (filters.length === 0) return "";
  return filters.map((f) => `${f.field}${f.operator}${f.value}`).join(",");
}

function deserializeMetricFilters(raw: string): MetricFilter[] {
  if (!raw) return [];
  return raw.split(",").map((segment) => {
    const match = segment.match(/^(\w+)(<=|>=|<|>|=)(.+)$/);
    if (!match) return null;
    return { field: match[1], operator: match[2] as MetricFilter["operator"], value: parseFloat(match[3]) };
  }).filter((f): f is MetricFilter => f !== null && !isNaN(f.value));
}

function serializeAttributeFilters(filters: AttributeFilter[]): string {
  if (filters.length === 0) return "";
  return filters.map((f) => `${f.field}:${f.value}`).join(",");
}

function deserializeAttributeFilters(raw: string): AttributeFilter[] {
  if (!raw) return [];
  return raw.split(",").map((segment) => {
    const idx = segment.indexOf(":");
    if (idx < 0) return null;
    return { field: segment.slice(0, idx), value: segment.slice(idx + 1) };
  }).filter((f): f is AttributeFilter => f !== null);
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

const PortfolioFilterCtx = createContext<PortfolioFilterContextValue | null>(null);

export function usePortfolioFilters(): PortfolioFilterContextValue {
  const ctx = useContext(PortfolioFilterCtx);
  if (!ctx) throw new Error("usePortfolioFilters must be used within <PortfolioFilterProvider>");
  return ctx;
}

export function PortfolioFilterProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // --- Read initial state from URL ---
  const readFilters = useCallback((): FilterState => ({
    strategy: searchParams.get(URL_PARAM_MAP.strategy) || null,
    vintage: searchParams.get(URL_PARAM_MAP.vintage) || null,
    status: searchParams.get(URL_PARAM_MAP.status) || null,
    metricFilters: deserializeMetricFilters(searchParams.get("mf") || ""),
    attributeFilters: deserializeAttributeFilters(searchParams.get("af") || ""),
    quarter: searchParams.get(URL_PARAM_MAP.quarter) || pickCurrentQuarter(),
    compareQuarter: searchParams.get(URL_PARAM_MAP.compareQuarter) || null,
    activeModelId: searchParams.get(URL_PARAM_MAP.activeModelId) || null,
  }), [searchParams]);

  // --- URL sync ---
  const syncToUrl = useCallback((next: FilterState) => {
    const params = new URLSearchParams();

    if (next.strategy) params.set(URL_PARAM_MAP.strategy, next.strategy);
    if (next.vintage) params.set(URL_PARAM_MAP.vintage, next.vintage);
    if (next.status) params.set(URL_PARAM_MAP.status, next.status);

    const mf = serializeMetricFilters(next.metricFilters);
    if (mf) params.set("mf", mf);

    const af = serializeAttributeFilters(next.attributeFilters);
    if (af) params.set("af", af);

    // Only set quarter if not the current default
    const defaultQ = pickCurrentQuarter();
    if (next.quarter && next.quarter !== defaultQ) params.set(URL_PARAM_MAP.quarter, next.quarter);
    if (next.compareQuarter) params.set(URL_PARAM_MAP.compareQuarter, next.compareQuarter);
    if (next.activeModelId) params.set(URL_PARAM_MAP.activeModelId, next.activeModelId);

    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [router]);

  // --- Filter state ---
  const [filters, setFiltersRaw] = useState<FilterState>(readFilters);

  const updateFilters = useCallback((updater: (prev: FilterState) => FilterState) => {
    setFiltersRaw((prev) => {
      const next = updater(prev);
      syncToUrl(next);
      return next;
    });
  }, [syncToUrl]);

  const setDimensionFilter = useCallback((dim: "strategy" | "vintage" | "status", value: string | null) => {
    updateFilters((prev) => ({ ...prev, [dim]: value }));
  }, [updateFilters]);

  const setMetricFilters = useCallback((mf: MetricFilter[]) => {
    updateFilters((prev) => ({ ...prev, metricFilters: mf }));
  }, [updateFilters]);

  const addMetricFilter = useCallback((filter: MetricFilter) => {
    updateFilters((prev) => ({
      ...prev,
      metricFilters: [...prev.metricFilters.filter((f) => f.field !== filter.field), filter],
    }));
  }, [updateFilters]);

  const removeMetricFilter = useCallback((field: string) => {
    updateFilters((prev) => ({
      ...prev,
      metricFilters: prev.metricFilters.filter((f) => f.field !== field),
    }));
  }, [updateFilters]);

  const setAttributeFilters = useCallback((af: AttributeFilter[]) => {
    updateFilters((prev) => ({ ...prev, attributeFilters: af }));
  }, [updateFilters]);

  const addAttributeFilter = useCallback((filter: AttributeFilter) => {
    updateFilters((prev) => ({
      ...prev,
      attributeFilters: [...prev.attributeFilters.filter((f) => f.field !== filter.field), filter],
    }));
  }, [updateFilters]);

  const removeAttributeFilter = useCallback((field: string) => {
    updateFilters((prev) => ({
      ...prev,
      attributeFilters: prev.attributeFilters.filter((f) => f.field !== field),
    }));
  }, [updateFilters]);

  const setQuarter = useCallback((q: string) => {
    updateFilters((prev) => ({ ...prev, quarter: q }));
  }, [updateFilters]);

  const setCompareQuarter = useCallback((q: string | null) => {
    updateFilters((prev) => ({ ...prev, compareQuarter: q }));
  }, [updateFilters]);

  const setActiveModelId = useCallback((id: string | null) => {
    updateFilters((prev) => ({ ...prev, activeModelId: id }));
  }, [updateFilters]);

  // --- UI interaction state ---
  const [ui, setUi] = useState<UIInteractionState>({
    chartSelection: null,
    mapHighlight: null,
    hoveredFundId: null,
    signalScope: null,
  });

  const setChartSelection = useCallback((sel: ChartSelection | null) => {
    setUi((prev) => ({ ...prev, chartSelection: sel }));
  }, []);

  const setMapHighlight = useCallback((hl: MapHighlight | null) => {
    setUi((prev) => ({ ...prev, mapHighlight: hl }));
  }, []);

  const setHoveredFundId = useCallback((id: string | null) => {
    setUi((prev) => ({ ...prev, hoveredFundId: id }));
  }, []);

  const setSignalScope = useCallback((scope: SignalScope | null) => {
    setUi((prev) => ({ ...prev, signalScope: scope }));
  }, []);

  // --- Command state ---
  const [command, setCommand] = useState<CommandState>({
    query: "",
    isOpen: false,
    results: null,
    loading: false,
  });

  const setCommandQuery = useCallback((q: string) => {
    setCommand((prev) => ({ ...prev, query: q }));
  }, []);

  const setCommandOpen = useCallback((open: boolean) => {
    setCommand((prev) => ({ ...prev, isOpen: open }));
  }, []);

  const setCommandResults = useCallback((results: QueryResolverResponse | null) => {
    setCommand((prev) => ({ ...prev, results, loading: false }));
  }, []);

  const setCommandLoading = useCallback((loading: boolean) => {
    setCommand((prev) => ({ ...prev, loading }));
  }, []);

  // --- Derived: active filters for display ---
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const result: ActiveFilter[] = [];

    if (filters.strategy) {
      result.push({
        key: "strategy",
        label: "Strategy",
        value: filters.strategy,
        source: "dimension",
        onRemove: () => setDimensionFilter("strategy", null),
      });
    }
    if (filters.vintage) {
      result.push({
        key: "vintage",
        label: "Vintage",
        value: filters.vintage,
        source: "dimension",
        onRemove: () => setDimensionFilter("vintage", null),
      });
    }
    if (filters.status) {
      result.push({
        key: "status",
        label: "Status",
        value: filters.status,
        source: "dimension",
        onRemove: () => setDimensionFilter("status", null),
      });
    }

    for (const mf of filters.metricFilters) {
      result.push({
        key: `mf_${mf.field}`,
        label: mf.field.toUpperCase().replace("_", " "),
        value: `${mf.operator} ${mf.value}`,
        source: "metric",
        onRemove: () => removeMetricFilter(mf.field),
      });
    }

    for (const af of filters.attributeFilters) {
      result.push({
        key: `af_${af.field}`,
        label: af.field.replace("_", " "),
        value: af.value,
        source: "attribute",
        onRemove: () => removeAttributeFilter(af.field),
      });
    }

    if (ui.signalScope) {
      result.push({
        key: "signal",
        label: "Signal",
        value: ui.signalScope.signalId.replace(/_/g, " "),
        source: "signal",
        onRemove: () => setSignalScope(null),
      });
    }

    if (ui.chartSelection) {
      result.push({
        key: "chart",
        label: ui.chartSelection.dimension,
        value: ui.chartSelection.value,
        source: "chart",
        onRemove: () => setChartSelection(null),
      });
    }

    if (filters.activeModelId) {
      result.push({
        key: "model",
        label: "Model overlay",
        value: filters.activeModelId,
        source: "model",
        onRemove: () => setActiveModelId(null),
      });
    }

    if (filters.compareQuarter) {
      result.push({
        key: "compare",
        label: "Comparing to",
        value: formatQuarterLabel(filters.compareQuarter),
        source: "time",
        onRemove: () => setCompareQuarter(null),
      });
    }

    return result;
  }, [
    filters, ui.signalScope, ui.chartSelection,
    setDimensionFilter, removeMetricFilter, removeAttributeFilter,
    setSignalScope, setChartSelection, setActiveModelId, setCompareQuarter,
  ]);

  // --- Clear all ---
  const clearAll = useCallback(() => {
    const defaultQ = pickCurrentQuarter();
    setFiltersRaw({
      strategy: null,
      vintage: null,
      status: null,
      metricFilters: [],
      attributeFilters: [],
      quarter: defaultQ,
      compareQuarter: null,
      activeModelId: null,
    });
    setUi({
      chartSelection: null,
      mapHighlight: null,
      hoveredFundId: null,
      signalScope: null,
    });
    router.replace("?", { scroll: false });
  }, [router]);

  // --- Context value ---
  const value = useMemo<PortfolioFilterContextValue>(() => ({
    filters,
    setDimensionFilter,
    setMetricFilters,
    addMetricFilter,
    removeMetricFilter,
    setAttributeFilters,
    addAttributeFilter,
    removeAttributeFilter,
    setQuarter,
    setCompareQuarter,
    setActiveModelId,

    ui,
    setChartSelection,
    setMapHighlight,
    setHoveredFundId,
    setSignalScope,

    command,
    setCommandQuery,
    setCommandOpen,
    setCommandResults,
    setCommandLoading,

    activeFilters,
    activeFilterCount: activeFilters.length,
    hasActiveFilters: activeFilters.length > 0,
    clearAll,
  }), [
    filters, setDimensionFilter, setMetricFilters, addMetricFilter, removeMetricFilter,
    setAttributeFilters, addAttributeFilter, removeAttributeFilter,
    setQuarter, setCompareQuarter, setActiveModelId,
    ui, setChartSelection, setMapHighlight, setHoveredFundId, setSignalScope,
    command, setCommandQuery, setCommandOpen, setCommandResults, setCommandLoading,
    activeFilters, clearAll,
  ]);

  return (
    <PortfolioFilterCtx.Provider value={value}>
      {children}
    </PortfolioFilterCtx.Provider>
  );
}
