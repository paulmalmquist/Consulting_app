"use client";

import { useCallback, useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ------------------------------------------------------------------ */
/* Fix Leaflet default icon paths broken by Next.js bundler            */
/* ------------------------------------------------------------------ */
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */
type StyledFeature = {
  type: "Feature";
  id: string;
  properties: {
    geography_id: string;
    geography_type: string;
    name: string;
    [key: string]: unknown;
  };
  geometry: GeoJSON.Geometry | null;
  _color: string;
  _entry: {
    value: number | null;
    units: string | null;
    source_name: string | null;
    dataset_vintage: string | null;
  } | null;
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

type ChoroplethMapProps = {
  features: StyledFeature[];
  markers: PipelineMarker[];
  opacity: number;
  onMarkerClick?: (marker: PipelineMarker) => void;
  onFeatureHover?: (featureId: string | null) => void;
  onBoundsChange?: (sw: [number, number], ne: [number, number]) => void;
};

/* ------------------------------------------------------------------ */
/* Status -> marker color mapping (matches PipelineMap.tsx)             */
/* ------------------------------------------------------------------ */
const STATUS_COLOR: Record<string, string> = {
  sourced: "#6b7280",
  screening: "#3b82f6",
  loi: "#eab308",
  dd: "#f97316",
  ic: "#a855f7",
  closing: "#14b8a6",
  closed: "#22c55e",
  dead: "#ef4444",
};

function makeIcon(status: string | null): L.DivIcon {
  const color = STATUS_COLOR[status ?? ""] ?? "#6b7280";
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1.5">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`,
  });
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "--";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "--";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ------------------------------------------------------------------ */
/* Bounds listener child component                                     */
/* ------------------------------------------------------------------ */
function BoundsListener({ onChange }: { onChange: (sw: [number, number], ne: [number, number]) => void }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMapEvents({
    moveend(e) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const map = e.target;
        const b = map.getBounds();
        onChange(
          [b.getSouthWest().lat, b.getSouthWest().lng],
          [b.getNorthEast().lat, b.getNorthEast().lng],
        );
      }, 500);
    },
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function ChoroplethMap({
  features,
  markers,
  opacity,
  onMarkerClick,
  onFeatureHover,
  onBoundsChange,
}: ChoroplethMapProps) {
  // Ensure Leaflet container renders correctly after mount
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  // Build GeoJSON FeatureCollection for the polygon layer
  const geojsonData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature" as const,
      id: f.id,
      properties: { ...f.properties, _color: f._color },
      geometry: f.geometry!,
    })),
  };

  // Style each polygon based on its _color property
  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const props = feature.properties as { name?: string; geography_id?: string };
      const geoId = (feature.id as string) ?? props?.geography_id ?? "";

      layer.on({
        mouseover: () => onFeatureHover?.(geoId),
        mouseout: () => onFeatureHover?.(null),
      });
    },
    [onFeatureHover],
  );

  const featureStyle = useCallback(
    (feature?: GeoJSON.Feature): L.PathOptions => {
      const color = (feature?.properties as Record<string, unknown>)?._color as string ?? "#cccccc";
      return {
        fillColor: color,
        fillOpacity: opacity,
        color: "#374151",
        weight: 1,
        opacity: 0.6,
      };
    },
    [opacity],
  );

  const handleBoundsChange = useCallback(
    (sw: [number, number], ne: [number, number]) => {
      onBoundsChange?.(sw, ne);
    },
    [onBoundsChange],
  );

  // Key the GeoJSON layer so it re-renders when features or opacity change
  const geoKey = `${features.length}-${opacity}-${features[0]?._color ?? "x"}`;

  return (
    <MapContainer
      center={[27.8, -83.5]}
      zoom={7}
      className="h-full w-full"
      style={{ minHeight: 400 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      {features.length > 0 && (
        <GeoJSON
          key={geoKey}
          data={geojsonData}
          style={featureStyle}
          onEachFeature={onEachFeature}
        />
      )}

      {markers.map((m) => (
        <Marker
          key={m.property_id}
          position={[m.lat, m.lon]}
          icon={makeIcon(m.deal_status)}
          eventHandlers={{
            click: () => onMarkerClick?.(m),
          }}
        >
          <Popup>
            <div className="min-w-[180px] text-sm">
              <p className="font-semibold text-gray-900">{m.property_name}</p>
              {m.deal_name && <p className="text-gray-600">{m.deal_name}</p>}
              {m.address && <p className="text-xs text-gray-500">{m.address}</p>}
              {m.deal_status && (
                <p className="mt-1 text-xs font-medium text-gray-700">{m.deal_status}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {onBoundsChange && <BoundsListener onChange={handleBoundsChange} />}
    </MapContainer>
  );
}
