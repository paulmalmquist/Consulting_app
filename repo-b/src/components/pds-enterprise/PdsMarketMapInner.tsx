"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatCurrency, formatPercent, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

export interface MarketMapPoint {
  marketId: string;
  name: string;
  lat: number;
  lng: number;
  feeActual: number;
  feePlan: number;
  variancePct: number;
  riskScore: number;
  healthStatus: string;
  selected?: boolean;
}

function varianceColor(pct: number): string {
  if (pct < -0.05) return "#f87171"; // red-400
  if (pct < -0.01) return "#fb923c"; // orange-400
  if (pct >= 0.01) return "#34d399"; // emerald-400
  return "#94a3b8"; // slate-400
}

function radiusFromRevenue(revenue: number, maxRevenue: number): number {
  if (maxRevenue <= 0) return 8;
  const ratio = revenue / maxRevenue;
  return Math.max(6, Math.min(22, 6 + ratio * 16));
}

function FitBounds({ points }: { points: MarketMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as L.LatLngTuple),
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 7 });
  }, [map, points]);
  return null;
}

export default function PdsMarketMapInner({
  points,
  selectedMarketId,
  onMarketClick,
}: {
  points: MarketMapPoint[];
  selectedMarketId?: string | null;
  onMarketClick?: (marketId: string) => void;
}) {
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const maxRevenue = useMemo(
    () => Math.max(...points.map((p) => p.feeActual), 1),
    [points],
  );

  return (
    <MapContainer
      center={[39.8, -98.5]}
      zoom={4}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={points} />
      {points.map((p) => {
        const isSelected = selectedMarketId === p.marketId;
        const color = varianceColor(p.variancePct);
        const radius = radiusFromRevenue(p.feeActual, maxRevenue);

        return (
          <CircleMarker
            key={p.marketId}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{
              color: isSelected ? "#60a5fa" : color,
              fillColor: color,
              fillOpacity: isSelected ? 0.7 : 0.45,
              weight: isSelected ? 3 : 1.5,
            }}
            eventHandlers={{
              click: () => onMarketClick?.(p.marketId),
            }}
          >
            <Tooltip direction="top" offset={[0, -radius]}>
              <div className="min-w-[160px] text-xs">
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-gray-600">Revenue: {formatCurrency(p.feeActual)}</p>
                <p className={`font-medium ${p.variancePct < -0.01 ? "text-red-600" : "text-green-600"}`}>
                  vs Plan: {p.variancePct >= 0 ? "+" : ""}{formatPercent(p.variancePct, 1)}
                </p>
                <p className="text-gray-500">Risk: {p.riskScore}</p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
