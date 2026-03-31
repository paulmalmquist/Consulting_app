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
const APPROX_COLOR = "#94A3B8";  // slate-400 (centroid-resolved)

function makeIcon(status: string, isApproximate = false): L.DivIcon {
  const color = isApproximate ? APPROX_COLOR : status === "owned" ? OWNED_COLOR : PIPELINE_COLOR;
  const fill = isApproximate ? "transparent" : status === "owned" ? color : "transparent";
  const stroke = color;
  const dashArray = isApproximate ? 'stroke-dasharray="3 2"' : "";
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dashArray}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
    </svg>`,
  });
}

/* Market centroid fallback for assets missing exact coordinates */
const MARKET_CENTROIDS: Record<string, [number, number]> = {
  "Austin-Round Rock-Georgetown": [30.267, -97.743],
  "Dallas-Fort Worth-Arlington": [32.776, -96.797],
  "Houston-The Woodlands-Sugar Land": [29.760, -95.370],
  "New York-Newark-Jersey City": [40.713, -74.006],
  "Los Angeles-Long Beach-Anaheim": [34.052, -118.244],
  "Chicago-Naperville-Elgin": [41.878, -87.630],
  "Miami-Fort Lauderdale-Pompano Beach": [25.762, -80.192],
  "Atlanta-Sandy Springs-Alpharetta": [33.749, -84.388],
  "Phoenix-Mesa-Chandler": [33.449, -112.074],
  "San Francisco-Oakland-Berkeley": [37.775, -122.419],
  "Seattle-Tacoma-Bellevue": [47.606, -122.332],
  "Denver-Aurora-Lakewood": [39.739, -104.990],
  "Boston-Cambridge-Newton": [42.361, -71.057],
  "Nashville-Davidson-Murfreesboro": [36.163, -86.781],
  "Charlotte-Concord-Gastonia": [35.227, -80.843],
  "San Diego-Chula Vista-Carlsbad": [32.716, -117.161],
  "Minneapolis-St. Paul-Bloomington": [44.978, -93.265],
  "Tampa-St. Petersburg-Clearwater": [27.951, -82.458],
  "Portland-Vancouver-Hillsboro": [45.523, -122.676],
  "Detroit-Warren-Dearborn": [42.331, -83.046],
  "Raleigh-Cary": [35.780, -78.639],
  "Salt Lake City": [40.761, -111.891],
  "Kansas City": [39.100, -94.578],
  "Las Vegas-Henderson-Paradise": [36.169, -115.140],
  "Columbus": [39.962, -83.000],
  "Indianapolis-Carmel-Anderson": [39.768, -86.158],
  "San Antonio-New Braunfels": [29.425, -98.495],
  "Orlando-Kissimmee-Sanford": [28.538, -81.379],
  "Washington-Arlington-Alexandria": [38.907, -77.037],
  "Philadelphia-Camden-Wilmington": [39.953, -75.164],
};

type ResolvedPoint = AssetMapPoint & { coords: [number, number]; isApproximate: boolean };

function resolveCoords(p: AssetMapPoint): { coords: [number, number]; isApproximate: boolean } | null {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
    return { coords: [lat, lon], isApproximate: false };
  }
  // Try market centroid fallback
  if (p.market) {
    const marketLc = p.market.toLowerCase();
    const centroid = MARKET_CENTROIDS[p.market] ??
      Object.entries(MARKET_CENTROIDS).find(([k]) => {
        const kLc = k.toLowerCase();
        return kLc.startsWith(marketLc) || marketLc.startsWith(kLc);
      })?.[1];
    if (centroid) return { coords: centroid, isApproximate: true };
  }
  return null;
}

/* Auto-fit bounds to data */
function FitBounds({ points }: { points: ResolvedPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => p.coords));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [map, points]);
  return null;
}

export default function PortfolioAssetMapInner({ points }: { points: AssetMapPoint[] }) {
  // Force Leaflet to recalculate tile sizes on mount
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  // Resolve coordinates with fallback
  const resolved = useMemo(() => {
    const out: ResolvedPoint[] = [];
    for (const p of points) {
      const result = resolveCoords(p);
      if (result) out.push({ ...p, ...result });
    }
    return out;
  }, [points]);

  const ownedIcon = useMemo(() => makeIcon("owned"), []);
  const pipelineIcon = useMemo(() => makeIcon("pipeline"), []);
  const approxOwnedIcon = useMemo(() => makeIcon("owned", true), []);
  const approxPipelineIcon = useMemo(() => makeIcon("pipeline", true), []);

  return (
    <>
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
        <FitBounds points={resolved} />
        {resolved.map((p) => {
          const icon = p.isApproximate
            ? (p.status === "owned" ? approxOwnedIcon : approxPipelineIcon)
            : (p.status === "owned" ? ownedIcon : pipelineIcon);
          return (
            <Marker key={p.asset_id} position={p.coords} icon={icon}>
              <Popup>
                <div className="min-w-[220px] text-sm">
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
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    {p.cost_basis && Number(p.cost_basis) > 0 && (
                      <p className="text-gray-600"><span className="text-gray-400">Basis:</span> {fmtMoney(p.cost_basis)}</p>
                    )}
                    {p.current_noi && Number(p.current_noi) > 0 && (
                      <p className="text-gray-600"><span className="text-gray-400">NOI:</span> {fmtMoney(p.current_noi)}</p>
                    )}
                    {p.occupancy != null && Number(p.occupancy) > 0 && (
                      <p className="text-gray-600"><span className="text-gray-400">Occ:</span> {(Number(p.occupancy) * 100).toFixed(0)}%</p>
                    )}
                  </div>
                  {p.isApproximate && (
                    <p className="mt-1 text-[10px] text-gray-400 italic">Approximate (market centroid)</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </>
  );
}
