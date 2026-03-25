"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AssetMapPoint } from "@/lib/bos-api";

/* Fix Leaflet default icon paths broken by Next.js bundler */
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

import { fmtMoney } from "@/lib/format-utils";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

/* Status → marker colors */
const OWNED_COLOR = "#34D399";    // emerald-400
const PIPELINE_COLOR = "#FBBF24"; // amber-400
const DISPOSED_COLOR = "#94A3B8"; // slate-400

function makeIcon(status: string): L.DivIcon {
  let fill: string;
  let stroke: string;
  let opacity: string;

  if (status === "owned") {
    fill = OWNED_COLOR;
    stroke = OWNED_COLOR;
    opacity = "1";
  } else if (status === "pipeline") {
    fill = "transparent";
    stroke = PIPELINE_COLOR;
    opacity = "1";
  } else {
    // disposed — muted hollow
    fill = `${DISPOSED_COLOR}33`; // ~20% opacity fill
    stroke = DISPOSED_COLOR;
    opacity = "0.7";
  }

  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="${opacity}">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`,
  });
}

const STATUS_LABELS: Record<string, string> = {
  owned: "Owned",
  pipeline: "Pipeline",
  disposed: "Disposed",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  owned: "bg-emerald-400",
  pipeline: "bg-amber-400",
  disposed: "bg-slate-400",
};

/* Auto-fit bounds to data */
function FitBounds({ points }: { points: AssetMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const valid = points.filter(
      (p) => isFinite(Number(p.lat)) && isFinite(Number(p.lon))
    );
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(
      valid.map((p) => [Number(p.lat), Number(p.lon)] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [map, points]);
  return null;
}

function PopupContent({ p }: { p: AssetMapPoint }) {
  return (
    <div className="min-w-[210px] text-sm">
      <p className="font-semibold text-gray-900">{p.name}</p>
      <p className="text-xs text-gray-500">
        <span className={`inline-block mr-1 h-2 w-2 rounded-full ${STATUS_DOT_CLASS[p.status] ?? "bg-slate-300"}`} />
        {STATUS_LABELS[p.status] ?? p.status}
        {p.property_type ? ` · ${p.property_type}` : ""}
      </p>
      {p.city && (
        <p className="text-xs text-gray-500">
          {p.city}{p.state ? `, ${p.state}` : ""}
        </p>
      )}

      {/* Owned-specific */}
      {p.status === "owned" && (
        <div className="mt-1.5 space-y-0.5 text-xs text-gray-700">
          {p.cost_basis && Number(p.cost_basis) > 0 && (
            <p>Basis: <span className="font-medium">{fmtMoney(p.cost_basis)}</span></p>
          )}
          {p.current_noi && Number(p.current_noi) > 0 && (
            <p>NOI: <span className="font-medium">{fmtMoney(p.current_noi)}</span></p>
          )}
          {p.occupancy && Number(p.occupancy) > 0 && (
            <p>Occupancy: <span className="font-medium">{(Number(p.occupancy) * 100).toFixed(1)}%</span></p>
          )}
        </div>
      )}

      {/* Pipeline-specific */}
      {p.status === "pipeline" && p.cost_basis && Number(p.cost_basis) > 0 && (
        <p className="mt-1 text-xs text-gray-700">
          Basis: <span className="font-medium">{fmtMoney(p.cost_basis)}</span>
        </p>
      )}

      {/* Disposed-specific */}
      {p.status === "disposed" && (
        <div className="mt-1.5 space-y-0.5 text-xs text-gray-700">
          {p.sale_date && (
            <p>Sale Date: <span className="font-medium">{p.sale_date}</span></p>
          )}
          {p.gross_sale_price && Number(p.gross_sale_price) > 0 && (
            <p>Gross Sale: <span className="font-medium">{fmtMoney(p.gross_sale_price)}</span></p>
          )}
          {p.net_sale_proceeds && Number(p.net_sale_proceeds) > 0 && (
            <p>Net Proceeds: <span className="font-medium">{fmtMoney(p.net_sale_proceeds)}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FundFootprintMapInner({ points }: { points: AssetMapPoint[] }) {
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const ownedIcon = useMemo(() => makeIcon("owned"), []);
  const pipelineIcon = useMemo(() => makeIcon("pipeline"), []);
  const disposedIcon = useMemo(() => makeIcon("disposed"), []);

  const iconForStatus = (status: string) => {
    if (status === "owned") return ownedIcon;
    if (status === "pipeline") return pipelineIcon;
    return disposedIcon;
  };

  return (
    <MapContainer
      center={[39.8, -98.5]}
      zoom={4}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {points.map((p) => (
        <Marker
          key={p.asset_id}
          position={[Number(p.lat), Number(p.lon)]}
          icon={iconForStatus(p.status)}
        >
          <Popup>
            <PopupContent p={p} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
