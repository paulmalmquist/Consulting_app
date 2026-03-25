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

import { fmtMoney } from '@/lib/format-utils';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

/* Status → marker icon */
const OWNED_COLOR = "#34D399";   // emerald-400
const PIPELINE_COLOR = "#FBBF24"; // amber-400

function makeIcon(status: string): L.DivIcon {
  const color = status === "owned" ? OWNED_COLOR : PIPELINE_COLOR;
  const fill = status === "owned" ? color : "transparent";
  const stroke = color;
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`,
  });
}

/* Auto-fit bounds to data */
function FitBounds({ points }: { points: AssetMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(
      points.map((p) => [Number(p.lat), Number(p.lon)] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [map, points]);
  return null;
}

export default function PortfolioAssetMapInner({ points }: { points: AssetMapPoint[] }) {
  // Force Leaflet to recalculate tile sizes on mount
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const ownedIcon = useMemo(() => makeIcon("owned"), []);
  const pipelineIcon = useMemo(() => makeIcon("pipeline"), []);

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
          icon={p.status === "owned" ? ownedIcon : pipelineIcon}
        >
          <Popup>
            <div className="min-w-[200px] text-sm">
              <p className="font-semibold text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500">
                <span
                  className={`inline-block mr-1 h-2 w-2 rounded-full ${
                    p.status === "owned" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {p.status === "owned" ? "Owned" : "Pipeline"}
                {p.property_type ? ` · ${p.property_type}` : ""}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{p.fund_name}</p>
              {p.city && (
                <p className="text-xs text-gray-500">
                  {p.city}{p.state ? `, ${p.state}` : ""}
                </p>
              )}
              {p.cost_basis && Number(p.cost_basis) > 0 && (
                <p className="mt-1 text-xs font-medium text-gray-800">
                  Basis: {fmtMoney(p.cost_basis)}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
