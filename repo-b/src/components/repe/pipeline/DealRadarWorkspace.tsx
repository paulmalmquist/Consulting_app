"use client";

import React from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Crosshair, List, Loader2, Map as MapIcon, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { bosFetch } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import DealStatusBadge from "@/components/repe/pipeline/DealStatusBadge";
import { cn } from "@/lib/cn";
import { DealIntelligencePanel } from "@/components/repe/pipeline/radar/DealIntelligencePanel";
import { DealRadarCanvas } from "@/components/repe/pipeline/radar/DealRadarCanvas";
import { RadarSummaryPanel } from "@/components/repe/pipeline/radar/RadarSummaryPanel";
import { DealGeoWorkspace } from "@/components/repe/pipeline/geo/DealGeoWorkspace";
import type {
  DealRadarDetailBundle,
  DealRadarFilters,
  DealRadarMode,
  DealRadarNode,
  PipelineActivitySummary,
  PipelineContactSummary,
  PipelineDealSummary,
  PipelinePropertySummary,
  PipelineTrancheSummary,
} from "@/components/repe/pipeline/radar/types";
import type { GeoPipelineMarker } from "@/components/repe/pipeline/geo/types";
import {
  buildDealRadarNodes,
  formatMoney,
  formatRelativeDate,
  matchesDealRadarFilters,
  RADAR_MODE_LABELS,
  RADAR_SECTOR_LABELS,
  RADAR_STAGE_LABELS,
  summarizeDealRadar,
} from "@/components/repe/pipeline/radar/utils";

type PipelineView = "radar" | "list" | "map";

const VIEW_OPTIONS: Array<{ value: PipelineView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "radar", label: "Radar", icon: Crosshair },
  { value: "list", label: "List", icon: List },
  { value: "map", label: "Map", icon: MapIcon },
];

const MODE_OPTIONS: DealRadarMode[] = ["stage", "capital", "risk", "fit", "market"];

function readView(value: string | null): PipelineView {
  return value === "list" || value === "map" || value === "radar" ? value : "radar";
}

function readMode(value: string | null): DealRadarMode {
  return value === "capital" || value === "risk" || value === "fit" || value === "market" || value === "stage"
    ? value
    : "stage";
}

function readFilters(searchParams: Pick<URLSearchParams, "get">): DealRadarFilters {
  return {
    fund: searchParams.get("fund"),
    strategy: searchParams.get("strategy"),
    sector: searchParams.get("sector"),
    stage: searchParams.get("stage"),
    q: searchParams.get("q") ?? "",
  };
}

function dispatchWinstonPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent("winston-prefill-prompt", { detail: { prompt } }));
}

function StageChip({ stage }: { stage: string }) {
  if (stage in RADAR_STAGE_LABELS) {
    return (
      <span className="inline-flex items-center rounded-full border border-bm-border/50 bg-bm-bg/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
        {RADAR_STAGE_LABELS[stage as keyof typeof RADAR_STAGE_LABELS]}
      </span>
    );
  }
  return <DealStatusBadge status={stage} />;
}

function FilterFields({
  filters,
  fundOptions,
  strategyOptions,
  sectorOptions,
  onChange,
}: {
  filters: DealRadarFilters;
  fundOptions: Array<{ value: string; label: string }>;
  strategyOptions: Array<{ value: string; label: string }>;
  sectorOptions: Array<{ value: string; label: string }>;
  onChange: (key: keyof DealRadarFilters, value: string | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Select value={filters.fund ?? ""} onChange={(event) => onChange("fund", event.target.value || null)}>
        <option value="">All Funds</option>
        {fundOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <Select value={filters.strategy ?? ""} onChange={(event) => onChange("strategy", event.target.value || null)}>
        <option value="">All Strategies</option>
        {strategyOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <Select value={filters.sector ?? ""} onChange={(event) => onChange("sector", event.target.value || null)}>
        <option value="">All Sectors</option>
        {sectorOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      <Select value={filters.stage ?? ""} onChange={(event) => onChange("stage", event.target.value || null)}>
        <option value="">All Active Stages</option>
        {Object.entries(RADAR_STAGE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>
    </div>
  );
}

function DealsTable({
  nodes,
  selectedDealId,
  onSelectDeal,
}: {
  nodes: DealRadarNode[];
  selectedDealId?: string | null;
  onSelectDeal: (dealId: string | null) => void;
}) {
  if (!nodes.length) {
    return (
      <div className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 px-4 py-10 text-center text-sm text-bm-muted">
        No active pipeline deals match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-bm-border/40 bg-bm-surface/35">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-bm-border/35 bg-bm-bg/55">
            <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Deal</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Sector</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Fund</th>
              <th className="px-4 py-3 font-medium text-right">Deal Size</th>
              <th className="px-4 py-3 font-medium text-right">Equity</th>
              <th className="px-4 py-3 font-medium text-right">Readiness</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.dealId}
                className={cn(
                  "cursor-pointer border-b border-bm-border/25 transition-colors last:border-b-0 hover:bg-bm-bg/35",
                  selectedDealId === node.dealId && "bg-bm-accent/8",
                )}
                onClick={() => onSelectDeal(node.dealId)}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-bm-text">{node.dealName}</p>
                    <p className="mt-1 text-xs text-bm-muted">{node.strategy || "Strategy pending"}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-bm-muted">{node.locationLabel}</td>
                <td className="px-4 py-3 text-bm-text">{RADAR_SECTOR_LABELS[node.sector]}</td>
                <td className="px-4 py-3"><StageChip stage={node.stage} /></td>
                <td className="px-4 py-3 text-bm-muted">{node.fundName || "Unassigned"}</td>
                <td className="px-4 py-3 text-right font-medium text-bm-text">{formatMoney(node.headlinePrice)}</td>
                <td className="px-4 py-3 text-right font-medium text-bm-text">{formatMoney(node.equityRequired)}</td>
                <td className="px-4 py-3 text-right font-medium text-bm-text">{node.readinessScore}%</td>
                <td className="px-4 py-3 text-bm-muted">{formatRelativeDate(node.lastUpdatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DealListRail({
  nodes,
  selectedDealId,
  onSelectDeal,
}: {
  nodes: DealRadarNode[];
  selectedDealId?: string | null;
  onSelectDeal: (dealId: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {nodes.length === 0 ? (
        <div className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 px-4 py-10 text-center text-sm text-bm-muted">
          No active pipeline deals match the current filters.
        </div>
      ) : (
        nodes.map((node) => (
          <button
            key={node.dealId}
            type="button"
            onClick={() => onSelectDeal(node.dealId)}
            className={cn(
              "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
              selectedDealId === node.dealId
                ? "border-bm-accent/60 bg-bm-accent/10"
                : "border-bm-border/40 bg-bm-surface/35 hover:bg-bm-bg/35",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-bm-text">{node.dealName}</p>
                <p className="mt-1 text-xs text-bm-muted">{node.locationLabel}</p>
              </div>
              <StageChip stage={node.stage} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-bm-muted">
              <span>{RADAR_SECTOR_LABELS[node.sector]}</span>
              <span>•</span>
              <span>{formatMoney(node.headlinePrice)}</span>
              <span>•</span>
              <span>{formatRelativeDate(node.lastUpdatedAt)}</span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

export function DealRadarWorkspace() {
  const { envId } = useReEnv();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = readView(searchParams.get("view"));
  const mode = readMode(searchParams.get("mode"));
  const selectedDealId = searchParams.get("deal");
  const filters = readFilters(searchParams);
  const deferredSearch = useDeferredValue(filters.q);
  const effectiveFilters = useMemo(() => ({ ...filters, q: deferredSearch }), [filters, deferredSearch]);

  const [deals, setDeals] = useState<PipelineDealSummary[]>([]);
  const [markers, setMarkers] = useState<GeoPipelineMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [markersLoading, setMarkersLoading] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailCache, setDetailCache] = useState<Record<string, DealRadarDetailBundle>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const updateQuery = useCallback((patch: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const fetchDeals = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const rows = await bosFetch<PipelineDealSummary[]>("/api/re/v2/pipeline/deals", {
        params: { env_id: envId },
      });
      setDeals(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setFetchError(message);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [envId]);

  const fetchMarkers = useCallback(async () => {
    if (!envId || markers.length > 0 || markersLoading) return;
      setMarkersLoading(true);
    try {
      const rows = await bosFetch<GeoPipelineMarker[]>("/api/re/v2/pipeline/map/markers", {
        params: {
          env_id: envId,
          sw_lat: "24.0",
          sw_lon: "-125.0",
          ne_lat: "50.0",
          ne_lon: "-66.0",
        },
      });
      setMarkers(rows);
    } catch {
      setMarkers([]);
    } finally {
      setMarkersLoading(false);
    }
  }, [envId, markers.length, markersLoading]);

  useEffect(() => {
    void fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    if (view === "map") {
      void fetchMarkers();
    }
  }, [fetchMarkers, view]);

  const allNodes = useMemo(() => buildDealRadarNodes(deals), [deals]);
  const filteredNodes = useMemo(
    () => allNodes.filter((node) => matchesDealRadarFilters(node, effectiveFilters)),
    [allNodes, effectiveFilters],
  );
  const sortedNodes = useMemo(
    () => [...filteredNodes].sort((a, b) => b.readinessScore - a.readinessScore || a.dealName.localeCompare(b.dealName)),
    [filteredNodes],
  );
  const summary = useMemo(
    () => summarizeDealRadar(filteredNodes, deals, effectiveFilters),
    [deals, effectiveFilters, filteredNodes],
  );

  const selectedNode = useMemo(
    () => filteredNodes.find((node) => node.dealId === selectedDealId) || null,
    [filteredNodes, selectedDealId],
  );
  const selectedDetails = selectedNode ? detailCache[selectedNode.dealId] || null : null;

  useEffect(() => {
    if (selectedDealId && !filteredNodes.some((node) => node.dealId === selectedDealId)) {
      updateQuery({ deal: null });
    }
  }, [filteredNodes, selectedDealId, updateQuery]);

  useEffect(() => {
    if (!selectedNode || detailCache[selectedNode.dealId] || detailLoadingId === selectedNode.dealId) return;
    let cancelled = false;
    setDetailLoadingId(selectedNode.dealId);
    Promise.all([
      bosFetch<PipelinePropertySummary[]>(`/api/re/v2/pipeline/deals/${selectedNode.dealId}/properties`),
      bosFetch<PipelineTrancheSummary[]>(`/api/re/v2/pipeline/deals/${selectedNode.dealId}/tranches`),
      bosFetch<PipelineActivitySummary[]>(`/api/re/v2/pipeline/deals/${selectedNode.dealId}/activities`),
      bosFetch<PipelineContactSummary[]>(`/api/re/v2/pipeline/deals/${selectedNode.dealId}/contacts`),
    ])
      .then(([properties, tranches, activities, contacts]) => {
        if (cancelled) return;
        setDetailCache((current) => ({
          ...current,
          [selectedNode.dealId]: { properties, tranches, activities, contacts },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setDetailCache((current) => ({
          ...current,
          [selectedNode.dealId]: { properties: [], tranches: [], activities: [], contacts: [] },
        }));
      })
      .finally(() => {
        if (!cancelled) setDetailLoadingId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [detailCache, detailLoadingId, selectedNode]);

  const fundOptions = useMemo(() => {
    const seen = new Map<string, string>();
    allNodes.forEach((node) => {
      seen.set(node.fundId || "__unassigned__", node.fundName || "Unassigned");
    });
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allNodes]);

  const strategyOptions = useMemo(() => {
    return Array.from(new Set(allNodes.map((node) => node.strategy).filter(Boolean) as string[]))
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, " ") }));
  }, [allNodes]);

  const sectorOptions = useMemo(() => {
    return Object.entries(RADAR_SECTOR_LABELS).map(([value, label]) => ({ value, label }));
  }, []);

  const filteredMarkers = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map((node) => node.dealId));
    return markers.filter((marker) => visibleIds.has(marker.deal_id));
  }, [filteredNodes, markers]);

  const setView = (nextView: PipelineView) => {
    updateQuery({ view: nextView === "radar" ? null : nextView });
  };

  const setMode = (nextMode: DealRadarMode) => {
    updateQuery({ mode: nextMode === "stage" ? null : nextMode });
  };

  const setFilter = (key: keyof DealRadarFilters, value: string | null) => {
    updateQuery({ [key]: value, deal: selectedDealId && value !== null ? null : selectedDealId });
  };

  const askWinston = (node: DealRadarNode) => {
    dispatchWinstonPrompt(
      `Review ${node.dealName} in ${node.locationLabel}. Focus on stage readiness, blockers, capital concentration, and the next best action.`,
    );
  };

  const pageTitle = loading ? "Deal Radar" : `${summary.dealCount} active deals · ${formatMoney(summary.totalPipelineValue)}`;

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-20 rounded-2xl border border-bm-border/40 bg-bm-bg/85 p-4 backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Acquisitions Command Center</p>
              <h1 className="mt-1 text-2xl font-semibold text-bm-text">Deal Radar</h1>
              <p className="mt-1 text-sm text-bm-muted">{pageTitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl border border-bm-border/40 bg-bm-surface/35 p-1 md:flex">
                {VIEW_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = option.value === view;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setView(option.value)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                        active ? "bg-bm-accent text-bm-accentContrast" : "text-bm-muted hover:bg-bm-bg/55 hover:text-bm-text",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <Button variant="secondary" size="sm" className="xl:hidden" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bm-muted2" />
              <Input
                value={filters.q}
                onChange={(event) => updateQuery({ q: event.target.value || null, deal: null })}
                placeholder="Search deal, city, sponsor, or broker"
                className="pl-9"
              />
            </div>
            {view === "radar" ? (
              <div className="hidden flex-wrap items-center gap-2 xl:flex">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs uppercase tracking-[0.12em] transition-colors",
                      option === mode
                        ? "border-bm-accent/60 bg-bm-accent/12 text-bm-text"
                        : "border-bm-border/50 text-bm-muted hover:text-bm-text",
                    )}
                  >
                    {RADAR_MODE_LABELS[option]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden xl:block">
            <FilterFields
              filters={filters}
              fundOptions={fundOptions}
              strategyOptions={strategyOptions}
              sectorOptions={sectorOptions}
              onChange={setFilter}
            />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.value === view;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setView(option.value)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-bm-accent text-bm-accentContrast" : "border border-bm-border/40 text-bm-muted hover:bg-bm-bg/55 hover:text-bm-text",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          {view === "radar" ? (
            <div className="flex flex-wrap gap-2 xl:hidden">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors",
                    option === mode
                      ? "border-bm-accent/60 bg-bm-accent/12 text-bm-text"
                      : "border-bm-border/50 text-bm-muted hover:text-bm-text",
                  )}
                >
                  {RADAR_MODE_LABELS[option]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="xl:hidden">
        <RadarSummaryPanel summary={summary} mode={mode} compact />
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/30 bg-red-500/8 px-6 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-red-400" />
          <div>
            <p className="text-sm font-medium text-bm-text">Pipeline data unavailable</p>
            <p className="mt-1 text-xs text-bm-muted">{fetchError}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchDeals()}
            className="inline-flex items-center gap-2 rounded-lg border border-bm-border/40 px-3 py-2 text-xs text-bm-muted transition-colors hover:text-bm-text"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : view === "radar" ? (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <div className="hidden xl:block">
            <RadarSummaryPanel summary={summary} mode={mode} />
          </div>
          <DealRadarCanvas
            envId={envId}
            mode={mode}
            nodes={filteredNodes}
            selectedDealId={selectedDealId}
            onSelectDeal={(dealId) => updateQuery({ deal: dealId })}
            onAskWinston={askWinston}
          />
          <div className="hidden xl:block">
            <DealIntelligencePanel
              envId={envId}
              node={selectedNode}
              details={selectedDetails}
              loading={detailLoadingId === selectedNode?.dealId}
              onAskWinston={askWinston}
            />
          </div>
          <div className="hidden md:block xl:hidden md:col-span-1">
            <DealIntelligencePanel
              envId={envId}
              node={selectedNode}
              details={selectedDetails}
              loading={detailLoadingId === selectedNode?.dealId}
              onAskWinston={askWinston}
            />
          </div>
        </div>
      ) : view === "list" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DealsTable
            nodes={sortedNodes}
            selectedDealId={selectedDealId}
            onSelectDeal={(dealId) => updateQuery({ deal: dealId })}
          />
          <div className="hidden xl:block">
            <DealIntelligencePanel
              envId={envId}
              node={selectedNode}
              details={selectedDetails}
              loading={detailLoadingId === selectedNode?.dealId}
              onAskWinston={askWinston}
            />
          </div>
          <div className="hidden md:block xl:hidden md:col-span-1">
            <DealIntelligencePanel
              envId={envId}
              node={selectedNode}
              details={selectedDetails}
              loading={detailLoadingId === selectedNode?.dealId}
              onAskWinston={askWinston}
            />
          </div>
        </div>
      ) : (
        <DealGeoWorkspace
          envId={envId}
          filters={effectiveFilters}
          nodes={filteredNodes}
          markers={filteredMarkers}
          selectedDealId={selectedDealId}
          onSelectDeal={(dealId) => updateQuery({ deal: dealId })}
        />
      )}

      {selectedNode ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close selected deal intelligence"
            onClick={() => updateQuery({ deal: null })}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-3xl border border-bm-border/40 bg-bm-bg p-4 shadow-[0_-24px_40px_-28px_rgba(0,0,0,0.85)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Selected Deal</p>
              <button
                type="button"
                onClick={() => updateQuery({ deal: null })}
                className="rounded-full border border-bm-border/40 p-2 text-bm-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DealIntelligencePanel
              envId={envId}
              node={selectedNode}
              details={selectedDetails}
              loading={detailLoadingId === selectedNode.dealId}
              onAskWinston={askWinston}
            />
          </div>
        </div>
      ) : null}

      <SlideOver
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Pipeline Filters"
        subtitle="Adjust the visible pipeline scope for radar, list, and map views."
        width="max-w-md"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bm-muted2" />
            <Input
              value={filters.q}
              onChange={(event) => updateQuery({ q: event.target.value || null, deal: null })}
              placeholder="Search deal, city, sponsor, or broker"
              className="pl-9"
            />
          </div>
          <FilterFields
            filters={filters}
            fundOptions={fundOptions}
            strategyOptions={strategyOptions}
            sectorOptions={sectorOptions}
            onChange={setFilter}
          />
          {view === "radar" ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Radar Mode</p>
              <div className="flex flex-wrap gap-2">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors",
                      option === mode
                        ? "border-bm-accent/60 bg-bm-accent/12 text-bm-text"
                        : "border-bm-border/50 text-bm-muted hover:text-bm-text",
                    )}
                  >
                    {RADAR_MODE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SlideOver>
    </div>
  );
}
