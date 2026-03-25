"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Layers, Loader2, X } from "lucide-react";

import { bosFetch } from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

/* ------------------------------------------------------------------ */
/* Dynamic import — Leaflet requires browser APIs                      */
/* ------------------------------------------------------------------ */
const ChoroplethMap = dynamic(
  () => import("@/components/repe/pipeline/ChoroplethMap"),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
type MetricCatalogItem = {
  metric_key: string;
  display_name: string;
  description: string | null;
  units: string;
  color_scale: string;
  source_name: string;
  source_url: string | null;
  grain_supported: string[];
  geography_types_supported: string[];
  is_active: boolean;
};

type ChoroplethEntry = {
  geography_id: string;
  value: number | null;
  units: string | null;
  dataset_vintage: string | null;
  source_name: string | null;
};

type GeoJSONFeature = {
  type: "Feature";
  id: string;
  properties: {
    geography_id: string;
    geography_type: string;
    name: string;
    state_fips?: string;
    county_fips?: string;
    centroid_lat?: number;
    centroid_lon?: number;
    area_sq_miles?: number;
  };
  geometry: GeoJSON.Geometry | null;
};

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  total_count: number;
};

type PipelineMarker = {
  property_id: string;
  deal_id: string | null;
  property_name: string;
  address: string | null;
  lat: number;
  lon: number;
  deal_name: string | null;
  deal_status: string | null;
  geographies: Array<{ geography_type: string; geography_id: string; name: string }>;
};

type PipelineMapFeed = {
  markers: PipelineMarker[];
  total_count: number;
};

/* ------------------------------------------------------------------ */
/* Color scale utilities                                               */
/* ------------------------------------------------------------------ */
const COLOR_SCALES: Record<string, string[]> = {
  green_sequential: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  blue_sequential: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  red_sequential: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  orange_sequential: ["#fff5eb", "#fdd0a2", "#fd8d3c", "#d94801", "#7f2704"],
  purple_sequential: ["#f2f0f7", "#cbc9e2", "#9e9ac8", "#6a51a3", "#3f007d"],
};

function getColor(value: number | null, min: number, max: number, scaleName: string): string {
  if (value == null || min === max) return "#cccccc";
  const scale = COLOR_SCALES[scaleName] ?? COLOR_SCALES.blue_sequential;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.min(Math.floor(ratio * scale.length), scale.length - 1);
  return scale[idx];
}

function formatMetricValue(value: number | null, units: string | null): string {
  if (value == null) return "—";
  if (units === "USD" || units === "dollars") {
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (units === "percent" || units === "%") return `${value.toFixed(1)}%`;
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Inner component (reads hooks)                                       */
/* ------------------------------------------------------------------ */
function PipelineMapInner() {
  const { envId } = useReEnv();

  // Layer controls
  const [geoType, setGeoType] = useState("county");
  const [metrics, setMetrics] = useState<MetricCatalogItem[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("median_hh_income");
  const [opacity, setOpacity] = useState(0.6);
  const [showControls, setShowControls] = useState(true);

  // Data
  const [geojson, setGeojson] = useState<GeoJSONFeatureCollection | null>(null);
  const [choropleth, setChoropleth] = useState<Map<string, ChoroplethEntry>>(new Map());
  const [pipelineFeed, setPipelineFeed] = useState<PipelineMapFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail panel
  const [selectedMarker, setSelectedMarker] = useState<PipelineMarker | null>(null);
  const [hoveredGeo, setHoveredGeo] = useState<{
    name: string;
    value: number | null;
    units: string | null;
    source: string | null;
    vintage: string | null;
  } | null>(null);

  // Bounding box (default: Florida)
  const [bounds, setBounds] = useState({
    sw_lat: 24.4,
    sw_lon: -87.7,
    ne_lat: 31.0,
    ne_lon: -79.8,
  });

  // ---- Fetch metric catalog ----
  useEffect(() => {
    bosFetch<MetricCatalogItem[]>("/api/re/v2/geography/metrics/catalog")
      .then((items) => {
        setMetrics(items.filter((m) => m.is_active));
        if (items.length > 0 && !items.find((m) => m.metric_key === selectedMetric)) {
          setSelectedMetric(items[0].metric_key);
        }
      })
      .catch(() => {
        // Catalog unavailable — use hardcoded fallback
        setMetrics([
          { metric_key: "median_hh_income", display_name: "Median Household Income", description: null, units: "USD", color_scale: "green_sequential", source_name: "ACS 5-Year", source_url: null, grain_supported: ["annual"], geography_types_supported: ["county", "tract"], is_active: true },
          { metric_key: "population", display_name: "Population", description: null, units: "count", color_scale: "blue_sequential", source_name: "ACS 5-Year", source_url: null, grain_supported: ["annual"], geography_types_supported: ["county", "tract"], is_active: true },
          { metric_key: "unemployment_rate", display_name: "Unemployment Rate", description: null, units: "percent", color_scale: "red_sequential", source_name: "BLS LAUS", source_url: null, grain_supported: ["monthly"], geography_types_supported: ["county"], is_active: true },
        ]);
      });
  }, []);

  // ---- Fetch geographies + choropleth + pipeline markers ----
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [geoRes, choroRes, feedRes] = await Promise.all([
        bosFetch<GeoJSONFeatureCollection>("/api/re/v2/geography/geographies", {
          params: {
            geography_type: geoType,
            sw_lat: String(bounds.sw_lat),
            sw_lon: String(bounds.sw_lon),
            ne_lat: String(bounds.ne_lat),
            ne_lon: String(bounds.ne_lon),
            simplify: "true",
            max_features: "2000",
          },
        }).catch(() => null),
        bosFetch<ChoroplethEntry[]>("/api/re/v2/geography/metrics", {
          params: {
            geography_type: geoType,
            metric_key: selectedMetric,
            sw_lat: String(bounds.sw_lat),
            sw_lon: String(bounds.sw_lon),
            ne_lat: String(bounds.ne_lat),
            ne_lon: String(bounds.ne_lon),
          },
        }).catch(() => []),
        bosFetch<PipelineMapFeed>("/api/re/v2/geography/pipeline-map-feed", {
          params: { env_id: envId },
        }).catch(() => ({ markers: [], total_count: 0 })),
      ]);

      if (geoRes) setGeojson(geoRes);
      const choroMap = new Map<string, ChoroplethEntry>();
      for (const entry of choroRes) {
        choroMap.set(entry.geography_id, entry);
      }
      setChoropleth(choroMap);
      setPipelineFeed(feedRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load map data");
    } finally {
      setLoading(false);
    }
  }, [envId, geoType, selectedMetric, bounds]);

  useEffect(() => {
    if (!envId) return;
    fetchData();
  }, [envId, fetchData]);

  // Compute choropleth min/max for color scaling
  const { min, max } = useMemo(() => {
    const vals = Array.from(choropleth.values())
      .map((e) => e.value)
      .filter((v): v is number => v != null);
    if (vals.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [choropleth]);

  const activeMetric = metrics.find((m) => m.metric_key === selectedMetric);

  // Build styled features for the map
  const styledFeatures = useMemo(() => {
    if (!geojson) return [];
    return geojson.features
      .filter((f) => f.geometry != null)
      .map((f) => {
        const entry = choropleth.get(f.id);
        const color = getColor(entry?.value ?? null, min, max, activeMetric?.color_scale ?? "blue_sequential");
        return { ...f, _color: color, _entry: entry ?? null };
      });
  }, [geojson, choropleth, min, max, activeMetric]);

  function handleMarkerClick(marker: PipelineMarker) {
    setSelectedMarker(marker);
  }

  function handleFeatureHover(featureId: string | null) {
    if (!featureId) {
      setHoveredGeo(null);
      return;
    }
    const feature = geojson?.features.find((f) => f.id === featureId);
    const entry = choropleth.get(featureId);
    if (feature) {
      setHoveredGeo({
        name: feature.properties.name,
        value: entry?.value ?? null,
        units: entry?.units ?? activeMetric?.units ?? null,
        source: entry?.source_name ?? activeMetric?.source_name ?? null,
        vintage: entry?.dataset_vintage ?? null,
      });
    }
  }

  function handleBoundsChange(sw: [number, number], ne: [number, number]) {
    setBounds({ sw_lat: sw[0], sw_lon: sw[1], ne_lat: ne[0], ne_lon: ne[1] });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-bm-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/lab/env/${envId}/re/pipeline`}
            className="rounded p-1 text-bm-muted hover:bg-bm-surface hover:text-bm-text"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-bm-text">Pipeline Map</h1>
            <p className="text-xs text-bm-muted">
              {pipelineFeed?.total_count ?? 0} properties
              {geojson ? ` · ${geojson.features.length} ${geoType} polygons` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowControls((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-sm text-bm-muted hover:bg-bm-surface hover:text-bm-text"
        >
          <Layers className="h-4 w-4" />
          Layers
        </button>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1">
          {loading && !geojson ? (
            <div className="flex h-full items-center justify-center bg-bm-bg">
              <Loader2 className="h-6 w-6 animate-spin text-bm-muted" />
            </div>
          ) : error && !geojson ? (
            <div className="flex h-full items-center justify-center bg-bm-bg">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300">
                {error}
              </div>
            </div>
          ) : (
            <ChoroplethMap
              features={styledFeatures}
              markers={pipelineFeed?.markers ?? []}
              opacity={opacity}
              onMarkerClick={handleMarkerClick}
              onFeatureHover={handleFeatureHover}
              onBoundsChange={handleBoundsChange}
            />
          )}
        </div>

        {/* Layer Control Panel */}
        {showControls && (
          <div className="absolute right-3 top-3 z-[1000] w-64 rounded-lg border border-bm-border bg-bm-bg/95 shadow-lg backdrop-blur">
            <div className="border-b border-bm-border px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-bm-text">Layer Controls</h3>
                <button onClick={() => setShowControls(false)} className="text-bm-muted hover:text-bm-text">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {/* Geography Type */}
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-bm-muted2">Geography</span>
                <select
                  value={geoType}
                  onChange={(e) => setGeoType(e.target.value)}
                  className="w-full rounded border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm text-bm-text"
                >
                  <option value="county">County</option>
                  <option value="tract">Census Tract</option>
                  <option value="cbsa">CBSA / Metro</option>
                </select>
              </label>

              {/* Metric */}
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-bm-muted2">Metric</span>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value)}
                  className="w-full rounded border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm text-bm-text"
                >
                  {metrics.map((m) => (
                    <option key={m.metric_key} value={m.metric_key}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Opacity */}
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-bm-muted2">
                  Opacity ({Math.round(opacity * 100)}%)
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full accent-bm-accent"
                />
              </label>

              {/* Legend */}
              {activeMetric && (
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-bm-muted2">Legend</span>
                  <div className="flex h-3 overflow-hidden rounded">
                    {(COLOR_SCALES[activeMetric.color_scale] ?? COLOR_SCALES.blue_sequential).map((c, i) => (
                      <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-bm-muted2">
                    <span>{formatMetricValue(min, activeMetric.units)}</span>
                    <span>{formatMetricValue(max, activeMetric.units)}</span>
                  </div>
                  <p className="text-[10px] text-bm-muted2">
                    Source: {activeMetric.source_name}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hover Tooltip */}
        {hoveredGeo && (
          <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-bm-border bg-bm-bg/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="text-sm font-medium text-bm-text">{hoveredGeo.name}</p>
            <p className="mt-0.5 text-lg font-semibold text-bm-text">
              {formatMetricValue(hoveredGeo.value, hoveredGeo.units)}
            </p>
            {hoveredGeo.source && (
              <p className="mt-0.5 text-[10px] text-bm-muted2">
                {hoveredGeo.source}
                {hoveredGeo.vintage ? ` · ${hoveredGeo.vintage}` : ""}
              </p>
            )}
          </div>
        )}

        {/* Property Detail Sidebar */}
        {selectedMarker && (
          <div className="absolute bottom-0 left-0 top-0 z-[1000] w-80 overflow-y-auto border-r border-bm-border bg-bm-bg shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-bm-border bg-bm-bg px-4 py-3">
              <h3 className="text-sm font-semibold text-bm-text">Property Detail</h3>
              <button onClick={() => setSelectedMarker(null)} className="text-bm-muted hover:text-bm-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium text-bm-text">{selectedMarker.property_name}</p>
                {selectedMarker.address && (
                  <p className="mt-0.5 text-xs text-bm-muted">{selectedMarker.address}</p>
                )}
              </div>

              {selectedMarker.deal_name && (
                <div className="rounded-lg border border-bm-border p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-bm-muted2">Deal</p>
                  <p className="mt-0.5 text-sm font-medium text-bm-text">{selectedMarker.deal_name}</p>
                  {selectedMarker.deal_status && (
                    <span className="mt-1 inline-block rounded-full bg-bm-accent/20 px-2 py-0.5 text-[10px] font-medium text-bm-accent">
                      {selectedMarker.deal_status}
                    </span>
                  )}
                  {selectedMarker.deal_id && (
                    <Link
                      href={`/lab/env/${envId}/re/pipeline/${selectedMarker.deal_id}`}
                      className="mt-2 block text-xs text-bm-accent hover:underline"
                    >
                      View Deal Details
                    </Link>
                  )}
                </div>
              )}

              {selectedMarker.geographies.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-bm-muted2">Linked Geographies</p>
                  <div className="mt-1.5 space-y-1.5">
                    {selectedMarker.geographies.map((geo) => (
                      <div
                        key={`${geo.geography_type}-${geo.geography_id}`}
                        className="rounded border border-bm-border/60 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-medium text-bm-text">{geo.name}</span>
                        <span className="ml-1.5 text-bm-muted2">({geo.geography_type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-bm-muted2">
                {selectedMarker.lat.toFixed(4)}, {selectedMarker.lon.toFixed(4)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Default export wrapped in Suspense                                   */
/* ------------------------------------------------------------------ */
export default function PipelineMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
        </div>
      }
    >
      <PipelineMapInner />
    </Suspense>
  );
}
