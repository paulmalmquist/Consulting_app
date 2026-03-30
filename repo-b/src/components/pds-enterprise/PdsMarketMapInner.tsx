"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatCurrency, formatPercent, toNumber } from "@/components/pds-enterprise/pdsEnterprise";

export interface MarketMapPoint {
  market_id: string;
  name: string;
  lat: number;
  lng: number;
  fee_actual: number | string;
  fee_plan: number | string;
  variance_pct: number | string;
  backlog: number | string;
  forecast: number | string;
  staffing_pressure_count: number;
  delinquent_timecards: number;
  red_projects: number;
  closeout_risk_count: number;
  client_risk_accounts: number;
  risk_score: number | string;
  health_status: string;
  top_accounts: string[];
  owner_name?: string | null;
}

export type MapColorMode = "revenue_variance" | "staffing_pressure" | "backlog" | "closeout_risk";

function varianceColor(pct: number): string {
  if (pct < -0.05) return "#f87171"; // red-400
  if (pct < -0.01) return "#fb923c"; // orange-400
  if (pct >= 0.01) return "#34d399"; // emerald-400
  return "#94a3b8"; // slate-400
}

function colorForPoint(point: MarketMapPoint, mode: MapColorMode): string {
  if (mode === "staffing_pressure") {
    return point.staffing_pressure_count >= 4 ? "#f87171" : point.staffing_pressure_count > 0 ? "#fb923c" : "#34d399";
  }
  if (mode === "backlog") {
    const coverage = toNumber(point.forecast) > 0 ? toNumber(point.backlog) / toNumber(point.forecast) : 0;
    return coverage < 0.5 ? "#f87171" : coverage < 0.75 ? "#fb923c" : "#34d399";
  }
  if (mode === "closeout_risk") {
    return point.closeout_risk_count >= 2 ? "#f87171" : point.closeout_risk_count > 0 ? "#fb923c" : "#34d399";
  }
  return varianceColor(toNumber(point.variance_pct));
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
  colorMode,
  onMarketClick,
}: {
  points: MarketMapPoint[];
  selectedMarketId?: string | null;
  colorMode: MapColorMode;
  onMarketClick?: (marketId: string) => void;
}) {
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const maxRevenue = useMemo(
    () => Math.max(...points.map((p) => toNumber(p.fee_actual)), 1),
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
        const isSelected = selectedMarketId === p.market_id;
        const color = colorForPoint(p, colorMode);
        const radius = radiusFromRevenue(toNumber(p.fee_actual), maxRevenue);

        return (
          <CircleMarker
            key={p.market_id}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{
              color: isSelected ? "#60a5fa" : color,
              fillColor: color,
              fillOpacity: isSelected ? 0.7 : 0.45,
              weight: isSelected ? 3 : 1.5,
            }}
            eventHandlers={{
              click: () => onMarketClick?.(p.market_id),
            }}
          >
            <Tooltip direction="top" offset={[0, -radius]}>
              <div className="min-w-[220px] text-xs">
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-gray-600">Fee Revenue: {formatCurrency(p.fee_actual)}</p>
                <p className={`font-medium ${toNumber(p.variance_pct) < -0.01 ? "text-red-600" : "text-green-600"}`}>
                  vs Plan: {toNumber(p.variance_pct) >= 0 ? "+" : ""}{formatPercent(p.variance_pct, 1)}
                </p>
                <p className="text-gray-600">Staffing pressure: {p.staffing_pressure_count}</p>
                <p className="text-gray-600">Red projects: {p.red_projects}</p>
                <p className="text-gray-600">Closeout risk: {p.closeout_risk_count}</p>
                <p className="text-gray-500">Key accounts: {p.top_accounts.join(", ") || "None"}</p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
