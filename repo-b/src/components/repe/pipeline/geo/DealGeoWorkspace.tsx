"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, Layers3, Loader2, SearchSlash } from "lucide-react";
import { bosFetch } from "@/lib/bos-api";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import type { DealRadarNode } from "../radar/types";
import { formatMoney, formatPercent } from "../radar/utils";
import { DealGeoIntelligencePanel } from "./DealGeoIntelligencePanel";
import type {
  CompareMode,
  DealGeoWorkspaceProps,
  GeoDealContextResponse,
  GeoDealMarker,
  GeoMapContextFeature,
  GeoMapContextResponse,
  GeoOverlayCatalogItem,
  GeographyLevel,
} from "./types";

const DealGeoMap = dynamic(
  () => import("./DealGeoMap").then((mod) => mod.DealGeoMap),
  { ssr: false },
);

const GEO_LEVEL_OPTIONS: GeographyLevel[] = ["county", "tract", "block_group"];
const COMPARE_MODES: CompareMode[] = ["tract", "county", "metro"];

function dispatchWinstonPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent("winston-prefill-prompt", { detail: { prompt } }));
}

function HoverCard({
  feature,
  onCompare,
  onAskWinston,
}: {
  feature: GeoMapContextFeature;
  onCompare: () => void;
  onAskWinston: () => void;
}) {
  return (
    <div className="absolute left-4 top-4 z-[500] w-80 rounded-2xl border border-bm-border/60 bg-bm-surface/95 p-4 shadow-[0_24px_40px_-24px_rgba(0,0,0,0.92)] backdrop-blur">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{feature.geography_level.replace("_", " ")}</p>
      <p className="mt-2 text-lg font-semibold text-bm-text">{feature.name}</p>
      <p className="mt-1 text-xs text-bm-muted">GEOID {feature.geoid}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">{feature.metric_label}</p>
          <p className="mt-1 text-sm text-bm-text">
            {feature.metric_value == null
              ? "—"
              : feature.units === "USD"
                ? formatMoney(feature.metric_value)
                : feature.units === "%"
                  ? `${feature.metric_value.toFixed(1)}%`
                  : Number.isInteger(feature.metric_value)
                    ? feature.metric_value.toLocaleString()
                    : feature.metric_value.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Nearby Deals</p>
          <p className="mt-1 text-sm text-bm-text">{feature.nearby_deals.length}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {feature.nearby_deals.slice(0, 3).map((deal) => (
          <div key={deal.deal_id} className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2">
            <p className="text-sm font-medium text-bm-text">{deal.deal_name}</p>
            <p className="mt-1 text-xs text-bm-muted">
              {deal.stage} · {deal.sector || "sector pending"}
            </p>
          </div>
        ))}
        {feature.nearby_deals.length === 0 ? (
          <div className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2 text-sm text-bm-muted">
            No nearby pipeline deals are linked to this geography yet.
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onCompare}>Compare to Asset</Button>
        <Button variant="secondary" size="sm" onClick={onCompare}>View Tract Profile</Button>
        <Button variant="primary" size="sm" onClick={onAskWinston}>
          <BrainCircuit className="mr-1 h-4 w-4" />
          Ask Winston
        </Button>
      </div>
    </div>
  );
}

export function DealGeoWorkspace({
  envId,
  filters,
  nodes,
  markers,
  selectedDealId,
  onSelectDeal,
}: DealGeoWorkspaceProps) {
  const [overlayCatalog, setOverlayCatalog] = useState<GeoOverlayCatalogItem[]>([]);
  const [geographyLevel, setGeographyLevel] = useState<GeographyLevel>("tract");
  const [compareMode, setCompareMode] = useState<CompareMode>("tract");
  const [overlayKey, setOverlayKey] = useState("median_hh_income");
  const [bounds, setBounds] = useState({
    sw_lat: 24.0,
    sw_lon: -125.0,
    ne_lat: 50.0,
    ne_lon: -66.0,
  });
  const [mapContext, setMapContext] = useState<GeoMapContextResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hoveredGeoid, setHoveredGeoid] = useState<string | null>(null);
  const [selectedGeoid, setSelectedGeoid] = useState<string | null>(null);
  const [geoContext, setGeoContext] = useState<GeoDealContextResponse | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const markerMap = useMemo(() => {
    const map = new Map<string, GeoDealMarker>();
    const nodeByDealId = new Map(nodes.map((node) => [node.dealId, node]));
    markers.forEach((marker) => {
      const node = nodeByDealId.get(marker.deal_id);
      if (!node) return;
      map.set(marker.deal_id, { node, marker });
    });
    return map;
  }, [markers, nodes]);

  const mapMarkers = useMemo(() => Array.from(markerMap.values()), [markerMap]);
  const selectedNode = selectedDealId ? markerMap.get(selectedDealId)?.node ?? null : null;
  const hoveredFeature = mapContext?.features.find((feature) => feature.geoid === (selectedGeoid || hoveredGeoid)) ?? null;
  const activeOverlay = overlayCatalog.find((item) => item.metric_key === overlayKey) ?? null;

  useEffect(() => {
    bosFetch<GeoOverlayCatalogItem[]>("/api/re/v2/geography/overlay-catalog")
      .then((rows) => {
        setOverlayCatalog(rows.filter((row) => row.is_active));
        if (rows.length > 0 && !rows.find((row) => row.metric_key === overlayKey)) {
          setOverlayKey(rows[0].metric_key);
        }
      })
      .catch(() => {
        setOverlayCatalog([]);
      });
  }, [overlayKey]);

  useEffect(() => {
    setMapLoading(true);
    setMapError(null);
    bosFetch<GeoMapContextResponse>("/api/re/v2/geography/map-context", {
      params: {
        env_id: envId,
        geography_level: geographyLevel,
        overlay_key: overlayKey,
        fund_id: filters.fund === "__unassigned__" ? undefined : filters.fund ?? undefined,
        strategy: filters.strategy ?? undefined,
        sector: filters.sector ?? undefined,
        stage: filters.stage ?? undefined,
        q: filters.q || undefined,
        sw_lat: String(bounds.sw_lat),
        sw_lon: String(bounds.sw_lon),
        ne_lat: String(bounds.ne_lat),
        ne_lon: String(bounds.ne_lon),
        simplify: "true",
      },
    })
      .then((payload) => {
        setMapContext(payload);
      })
      .catch((error) => {
        setMapError(error instanceof Error ? error.message : "Failed to load map context.");
      })
      .finally(() => setMapLoading(false));
  }, [bounds.ne_lat, bounds.ne_lon, bounds.sw_lat, bounds.sw_lon, envId, filters.fund, filters.q, filters.sector, filters.stage, filters.strategy, geographyLevel, overlayKey]);

  useEffect(() => {
    if (!selectedDealId) {
      setGeoContext(null);
      return;
    }
    setContextLoading(true);
    bosFetch<GeoDealContextResponse>(`/api/re/v2/geography/deals/${selectedDealId}/geo-context`)
      .then((payload) => setGeoContext(payload))
      .catch(() => setGeoContext(null))
      .finally(() => setContextLoading(false));
  }, [selectedDealId]);

  useEffect(() => {
    if (selectedNode && geoContext?.deal) {
      setSelectedGeoid(
        compareMode === "county"
          ? geoContext.deal.county_geoid || null
          : compareMode === "metro"
            ? geoContext.deal.county_geoid || null
            : geoContext.deal.tract_geoid || null,
      );
    }
  }, [compareMode, geoContext?.deal, selectedNode]);

  function askFeatureWinston() {
    if (!hoveredFeature) return;
    dispatchWinstonPrompt(
      `Review ${hoveredFeature.name} (${hoveredFeature.geoid}) for ${activeOverlay?.display_name || hoveredFeature.metric_label}. Nearby deals: ${hoveredFeature.nearby_deals.map((deal) => deal.deal_name).join(", ") || "none"}. Use only the provided geography facts.`,
    );
  }

  function askDealWinston() {
    if (!selectedNode) return;
    const facts = geoContext?.commentary_seed?.facts || {};
    dispatchWinstonPrompt(
      `Review ${selectedNode.dealName} in ${selectedNode.locationLabel}. Sector: ${selectedNode.sector}. Facts: ${JSON.stringify(facts)}. Use only these geo-market fields and summarize tract, county, benchmark, and hazard context.`,
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Geo Controls</p>
          <div className="mt-4 space-y-3">
            <Select value={geographyLevel} onChange={(event) => setGeographyLevel(event.target.value as GeographyLevel)}>
              {GEO_LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option.replace("_", " ")}</option>
              ))}
            </Select>
            <Select value={overlayKey} onChange={(event) => setOverlayKey(event.target.value)}>
              {overlayCatalog.map((overlay) => (
                <option key={overlay.metric_key} value={overlay.metric_key}>{overlay.display_name}</option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              {COMPARE_MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCompareMode(option)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors",
                    option === compareMode
                      ? "border-bm-accent/60 bg-bm-accent/12 text-bm-text"
                      : "border-bm-border/50 text-bm-muted hover:text-bm-text",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Overlay Detail</p>
          <p className="mt-3 text-lg font-semibold text-bm-text">{mapContext?.overlay.label || activeOverlay?.display_name || "Overlay"}</p>
          <p className="mt-2 text-sm text-bm-muted">
            {activeOverlay?.description || "Viewport-aware choropleth layer for acquisitions diligence."}
          </p>
          <div className="mt-4 space-y-2">
            {(mapContext?.overlay.bins || []).map((bin) => (
              <div key={`${bin.min}-${bin.max}`} className="flex items-center justify-between rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2 text-xs text-bm-text">
                <span>{bin.label}</span>
                <span className="text-bm-muted2">{mapContext?.overlay.units || "value"}</span>
              </div>
            ))}
            {!mapContext?.overlay.bins?.length ? (
              <div className="rounded-lg border border-bm-border/35 bg-bm-bg/45 px-3 py-2 text-xs text-bm-muted">
                No metric distribution available for the current viewport yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-bm-border/40 bg-bm-surface/35 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Viewport Summary</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Polygons</p>
              <p className="mt-1 text-lg font-semibold text-bm-text">{mapContext?.total_count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Deals Visible</p>
              <p className="mt-1 text-lg font-semibold text-bm-text">{mapMarkers.length}</p>
            </div>
            <div className="rounded-xl border border-bm-border/35 bg-bm-bg/45 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Overlay Source</p>
              <p className="mt-1 text-sm text-bm-text">{mapContext?.overlay.source_name || activeOverlay?.source_name || "Unknown"}</p>
            </div>
          </div>
        </section>
      </aside>

      <section className="relative overflow-hidden rounded-3xl border border-bm-border/40 bg-bm-bg">
        {hoveredFeature ? (
          <HoverCard
            feature={hoveredFeature}
            onCompare={() => {
              const candidate = hoveredFeature.nearby_deals[0]?.deal_id;
              if (candidate) onSelectDeal(candidate);
            }}
            onAskWinston={askFeatureWinston}
          />
        ) : null}

        {mapLoading ? (
          <div className="flex h-[720px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
          </div>
        ) : mapError ? (
          <div className="flex h-[720px] items-center justify-center px-6 text-center text-sm text-bm-text">
            <div>
              <AlertTriangle className="mx-auto h-5 w-5 text-bm-warning" />
              <p className="mt-3">{mapError}</p>
            </div>
          </div>
        ) : mapContext?.features.length ? (
          <div className="h-[720px]">
            <DealGeoMap
              features={mapContext.features}
              colorScale={mapContext.overlay.color_scale}
              bins={mapContext.overlay.bins}
              markers={mapMarkers}
              selectedDealId={selectedDealId}
              hoveredGeoid={hoveredGeoid}
              selectedGeoid={selectedGeoid}
              onFeatureHover={setHoveredGeoid}
              onFeatureSelect={setSelectedGeoid}
              onDealSelect={onSelectDeal}
              onBoundsChange={(sw, ne) => setBounds({
                sw_lat: sw[0],
                sw_lon: sw[1],
                ne_lat: ne[0],
                ne_lon: ne[1],
              })}
            />
          </div>
        ) : (
          <div className="flex h-[720px] items-center justify-center px-6 text-center text-sm text-bm-muted">
            <div>
              <SearchSlash className="mx-auto h-5 w-5" />
              <p className="mt-3">No polygon context is available for the current viewport and filters.</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 right-4 z-[400] rounded-2xl border border-bm-border/40 bg-bm-bg/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Map Mode</p>
              <p className="mt-1 text-sm text-bm-text">
                {mapContext?.overlay.label || "Overlay"} · {compareMode} compare · {geographyLevel.replace("_", " ")}
              </p>
            </div>
            {selectedNode ? (
              <div className="flex items-center gap-2 text-xs text-bm-muted">
                <Layers3 className="h-4 w-4" />
                {selectedNode.dealName} · {formatMoney(selectedNode.headlinePrice)} · {formatPercent(selectedNode.targetIrr)}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <DealGeoIntelligencePanel
        envId={envId}
        node={selectedNode}
        context={contextLoading ? geoContext : geoContext}
        compareMode={compareMode}
        onAskWinston={askDealWinston}
      />
    </div>
  );
}
