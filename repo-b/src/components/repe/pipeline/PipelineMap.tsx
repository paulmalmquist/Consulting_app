"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ------------------------------------------------------------------ */
/* Fix Leaflet default icon paths broken by Next.js bundler            */
/* ------------------------------------------------------------------ */
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

/* ------------------------------------------------------------------ */
/* Status -> marker color mapping                                       */
/* ------------------------------------------------------------------ */
const STATUS_COLOR: Record<string, string> = {
  sourced: "#6b7280",      // gray
  screening: "#3b82f6",    // blue
  loi: "#eab308",          // yellow
  dd: "#f97316",           // orange
  ic: "#a855f7",           // purple
  closing: "#14b8a6",      // teal
  closed: "#22c55e",       // green
  dead: "#ef4444",         // red
};

function makeIcon(status: string): L.DivIcon {
  const color = STATUS_COLOR[status] ?? "#6b7280";
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

/* ------------------------------------------------------------------ */
/* Format helpers                                                       */
/* ------------------------------------------------------------------ */
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
/* Types                                                                */
/* ------------------------------------------------------------------ */
type MapMarker = {
  deal_id: string;
  deal_name: string;
  status: string;
  lat: number;
  lon: number;
  property_name?: string;
  property_type?: string;
  headline_price?: number | string | null;
};

type PipelineMapProps = {
  markers: MapMarker[];
  onMarkerClick?: (dealId: string) => void;
};

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */
export default function PipelineMap({ markers, onMarkerClick }: PipelineMapProps) {
  // Ensure Leaflet container renders correctly after mount
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  return (
    <MapContainer
      center={[39.8, -98.5]}
      zoom={4}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {markers.map((m) => (
        <Marker
          key={`${m.deal_id}-${m.lat}-${m.lon}`}
          position={[m.lat, m.lon]}
          icon={makeIcon(m.status)}
          eventHandlers={{
            click: () => onMarkerClick?.(m.deal_id),
          }}
        >
          <Popup>
            <div className="min-w-[180px] text-sm">
              <p className="font-semibold text-gray-900">{m.deal_name}</p>
              {m.property_name && (
                <p className="text-gray-600">{m.property_name}</p>
              )}
              {m.property_type && (
                <p className="text-xs text-gray-500">{m.property_type}</p>
              )}
              {m.headline_price != null && (
                <p className="mt-1 font-medium text-gray-800">
                  {fmtMoney(m.headline_price)}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
