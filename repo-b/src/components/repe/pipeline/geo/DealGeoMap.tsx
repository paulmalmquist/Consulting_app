"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { GeoDealMarker, GeoMapContextFeature } from "./types";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

const COLOR_SCALES: Record<string, string[]> = {
  green_sequential: ["#15251e", "#254431", "#35684a", "#4e9668", "#7fc29a"],
  blue_sequential: ["#13212f", "#1c3a54", "#285781", "#4679a8", "#76a4d2"],
  red_sequential: ["#2c1416", "#5d2226", "#8f3137", "#bf5655", "#e08e88"],
  orange_sequential: ["#2f1c11", "#5e341d", "#8d5429", "#b97841", "#d8a06d"],
  purple_sequential: ["#24192d", "#463157", "#65497f", "#8663a2", "#af92ca"],
};

const STAGE_COLOR: Record<string, string> = {
  sourced: "#7d8696",
  screening: "#5d8bd8",
  loi: "#c4a35f",
  dd: "#d57a4b",
  ic: "#8c79d6",
  closing: "#45a492",
  ready: "#7eb67f",
  closed: "#6eac6f",
  dead: "#a35e62",
};

/**
 * Validate that a lat/lon pair is a finite number within legal geographic bounds.
 * Returns true only if both values are safe to pass to Leaflet.
 */
function isValidCoord(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    isFinite(lat) &&
    isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function markerShape(sector: string) {
  switch (sector) {
    case "industrial":
      return "border-radius: 5px;";
    case "retail":
      return "transform: rotate(45deg); border-radius: 4px;";
    case "student_housing":
      return "clip-path: polygon(25% 6%, 75% 6%, 94% 50%, 75% 94%, 25% 94%, 6% 50%);";
    case "medical_office":
      return "clip-path: polygon(36% 0, 64% 0, 64% 36%, 100% 36%, 100% 64%, 64% 64%, 64% 100%, 36% 100%, 36% 64%, 0 64%, 0 36%, 36% 36%);";
    case "mixed_use":
      return "clip-path: polygon(50% 4%, 96% 82%, 4% 82%);";
    case "hospitality":
      return "clip-path: polygon(50% 4%, 82% 18%, 96% 50%, 82% 82%, 50% 96%, 18% 82%, 4% 50%, 18% 18%);";
    default:
      return "border-radius: 999px;";
  }
}

/**
 * Scale marker diameter using a log₁₀ curve calibrated for typical RE deal values.
 * $1M → 18px, $50M → 25px, $500M → 33px, $5B → 38px.
 * All invalid/zero values fall back to the minimum 18px.
 */
function markerSize(value: number | undefined): number {
  if (!value || value <= 0 || !isFinite(value)) return 18;
  const log = Math.log10(Math.max(value, 1_000_000)) - 6; // 0 at $1M, 3 at $1B
  return Math.max(18, Math.min(38, Math.round(18 + log * 6.67)));
}

function buildMarkerIcon(marker: GeoDealMarker): L.DivIcon {
  const color = STAGE_COLOR[marker.node.stage] ?? "#7d8696";
  const size = markerSize(marker.node.equityRequired ?? marker.node.headlinePrice);
  const shape = markerShape(marker.node.sector);
  const halo =
    marker.node.alerts.includes("priority")
      ? "0 0 0 6px rgba(212, 170, 96, 0.20)"
      : marker.node.alerts.includes("capital_gap")
        ? "0 0 0 5px rgba(197, 92, 92, 0.18)"
        : "0 10px 18px -12px rgba(0, 0, 0, 0.85)";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px;
      height:${size}px;
      ${shape}
      background:${color};
      border:1.5px solid rgba(245,245,245,0.88);
      box-shadow:${halo};
      opacity:0.96;
    "></div>`,
  });
}

function getFeatureColor(value: number | null, palette: string[]) {
  if (value == null) return "#263241";
  return palette[Math.min(palette.length - 1, Math.max(0, Math.floor((value / 1000000) % palette.length)))] ?? palette[0];
}

function colorFromBins(value: number | null, bins: Array<{ min: number; max: number }>, scale: string) {
  const palette = COLOR_SCALES[scale] ?? COLOR_SCALES.blue_sequential;
  if (value == null || bins.length === 0) return "#1f2937";
  const index = bins.findIndex((bin, idx) => value >= bin.min && (idx === bins.length - 1 || value <= bin.max));
  if (index === -1) return getFeatureColor(value, palette);
  return palette[Math.min(index, palette.length - 1)];
}

/**
 * Fires the bounds-change and zoom callbacks after map pan or zoom events,
 * using a debounce to avoid hammering the overlay fetch on every animation frame.
 */
function BoundsListener({
  onChange,
  onZoomChange,
}: {
  onChange: (sw: [number, number], ne: [number, number]) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMapEvents({
    moveend(event) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const bounds = event.target.getBounds();
        onChange(
          [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
          [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
        );
        onZoomChange(event.target.getZoom());
      }, 350);
    },
    // Report zoom immediately so the parent can gate overlay requests without
    // waiting for the full moveend debounce.
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
  });

  return null;
}

/**
 * On first render, fit the map viewport to the bounding box of all valid markers.
 * Only runs once per mount — subsequent panning is left to the user.
 * This ensures deals are always visible without requiring manual pan/zoom.
 */
function FitBoundsToMarkers({ markers }: { markers: GeoDealMarker[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || markers.length === 0) return;

    const validPositions = markers
      .filter((m) => isValidCoord(m.marker.lat, m.marker.lon))
      .map((m) => [m.marker.lat, m.marker.lon] as [number, number]);

    if (validPositions.length === 0) return;

    const bounds = L.latLngBounds(validPositions);
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 12 });
    fittedRef.current = true;
  }, [markers, map]);

  return null;
}

export function DealGeoMap({
  features,
  colorScale,
  bins,
  markers,
  selectedDealId,
  hoveredGeoid,
  selectedGeoid,
  onBoundsChange,
  onFeatureHover,
  onFeatureSelect,
  onDealSelect,
  onZoomChange,
}: {
  features: GeoMapContextFeature[];
  colorScale: string;
  bins: Array<{ min: number; max: number }>;
  markers: GeoDealMarker[];
  selectedDealId?: string | null;
  hoveredGeoid?: string | null;
  selectedGeoid?: string | null;
  onBoundsChange: (sw: [number, number], ne: [number, number]) => void;
  onFeatureHover: (geoid: string | null) => void;
  onFeatureSelect: (geoid: string | null) => void;
  onDealSelect: (dealId: string | null) => void;
  onZoomChange: (zoom: number) => void;
}) {
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  // Filter markers to only those with valid geographic coordinates.
  // Invalid coords are logged in development so data issues are surfaced.
  const validMarkers = useMemo(() => {
    return markers.filter((m) => {
      const valid = isValidCoord(m.marker.lat, m.marker.lon);
      if (!valid && process.env.NODE_ENV === "development") {
        console.warn(
          "[DealGeoMap] Skipping marker with invalid coordinates",
          m.node.dealId,
          { lat: m.marker.lat, lon: m.marker.lon },
        );
      }
      return valid;
    });
  }, [markers]);

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: features
      .filter((feature) => feature.geometry != null)
      .map((feature) => ({
        type: "Feature" as const,
        id: feature.geoid,
        properties: {
          geoid: feature.geoid,
          name: feature.name,
          metric_value: feature.metric_value,
          fill: colorFromBins(feature.metric_value, bins, colorScale),
        },
        geometry: feature.geometry!,
      })),
  }), [bins, colorScale, features]);

  const featureStyle = useCallback((feature?: GeoJSON.Feature): L.PathOptions => {
    const geoid = (feature?.id as string | undefined) ?? "";
    const selected = geoid === selectedGeoid;
    const hovered = geoid === hoveredGeoid;
    return {
      fillColor: (feature?.properties as Record<string, unknown>)?.fill as string ?? "#243140",
      fillOpacity: selected ? 0.5 : 0.34,
      color: selected ? "#d0d8e6" : hovered ? "#8cb4ff" : "#334155",
      weight: selected ? 2.2 : hovered ? 1.8 : 1,
      opacity: selected ? 0.95 : 0.7,
    };
  }, [hoveredGeoid, selectedGeoid]);

  const onEachFeature = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    const geoid = (feature.id as string | undefined) ?? "";
    layer.on({
      mouseover: () => onFeatureHover(geoid),
      mouseout: () => onFeatureHover(null),
      click: () => onFeatureSelect(geoid),
    });
  }, [onFeatureHover, onFeatureSelect]);

  return (
    <MapContainer
      center={[39.8, -98.5]}
      zoom={4}
      className="h-full w-full"
      style={{ minHeight: 420 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {/* Overlay polygons: rendered when present, absent never suppresses markers */}
      {features.length > 0 ? (
        <GeoJSON
          key={`${features.length}-${colorScale}-${selectedGeoid}-${hoveredGeoid}`}
          data={geojsonData}
          style={featureStyle}
          onEachFeature={onEachFeature}
        />
      ) : null}

      {/* Deal markers: always rendered for valid coords, independent of overlay state */}
      {validMarkers.map((item) => (
        <Marker
          key={`${item.marker.deal_id}-${item.marker.lat}-${item.marker.lon}`}
          position={[item.marker.lat, item.marker.lon]}
          icon={buildMarkerIcon(item)}
          opacity={selectedDealId && selectedDealId !== item.node.dealId ? 0.65 : 1}
          eventHandlers={{ click: () => onDealSelect(item.node.dealId) }}
        />
      ))}

      {/* Auto-fit to markers on first load so deals are visible without manual pan */}
      <FitBoundsToMarkers markers={validMarkers} />

      <BoundsListener onChange={onBoundsChange} onZoomChange={onZoomChange} />
    </MapContainer>
  );
}
