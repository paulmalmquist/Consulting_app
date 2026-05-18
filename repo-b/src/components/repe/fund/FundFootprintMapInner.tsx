"use client";

import React, { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { FundFootprintAssetPoint, FundFootprintMarketRollup } from "@/lib/bos-api";
import { fmtMoney, fmtPct } from "@/lib/format-utils";

/* Fix Leaflet default icon paths broken by Next.js bundler */
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: typeof iconUrl === "string" ? iconUrl : (iconUrl as { src: string }).src,
  iconRetinaUrl: typeof iconRetinaUrl === "string" ? iconRetinaUrl : (iconRetinaUrl as { src: string }).src,
  shadowUrl: typeof shadowUrl === "string" ? shadowUrl : (shadowUrl as { src: string }).src,
});

type ViewMode = "assets" | "markets";

function fitBoundsToPoints(map: L.Map, points: Array<[number, number]>) {
  if (!points.length) return;
  const bounds = L.latLngBounds(points);
  map.fitBounds(bounds, { padding: [42, 42], maxZoom: 9 });
}

function FitBounds({
  assetPoints,
  marketPoints,
  viewMode,
  fitKey,
}: {
  assetPoints: FundFootprintAssetPoint[];
  marketPoints: FundFootprintMarketRollup[];
  viewMode: ViewMode;
  fitKey: string;
}) {
  const map = useMap();

  // Only re-fit when fitKey changes (new data load or explicit re-center),
  // not on every client-side filter recompute.
  useEffect(() => {
    const rawPoints = viewMode === "assets"
      ? assetPoints.map((point) => [point.lat, point.lon] as [number, number])
      : marketPoints.map((point) => [point.lat, point.lon] as [number, number]);
    fitBoundsToPoints(map, rawPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map, viewMode]);

  return null;
}

function assetColor(status: FundFootprintAssetPoint["status"]): string {
  if (status === "owned") return "#16A34A";
  if (status === "pipeline") return "#2563EB";
  return "#94A3B8";
}

function lifecycleShape(lifecycle: FundFootprintAssetPoint["lifecycle"]) {
  if (lifecycle === "development") {
    return `<polygon points="14,2 26,14 14,26 2,14" fill="currentColor" stroke="white" stroke-width="1.5" />`;
  }
  if (lifecycle === "distressed") {
    return `<polygon points="14,2 26,26 2,26" fill="currentColor" stroke="white" stroke-width="1.5" />`;
  }
  return `<circle cx="14" cy="14" r="10" fill="currentColor" stroke="white" stroke-width="1.5" />`;
}

function assetRadius(asset: FundFootprintAssetPoint): number {
  const basis = asset.asset_value ?? asset.cost_basis ?? 0;
  if (basis >= 200_000_000) return 34;
  if (basis >= 100_000_000) return 30;
  if (basis >= 50_000_000) return 26;
  if (basis >= 10_000_000) return 22;
  return 18;
}

function makeAssetIcon(asset: FundFootprintAssetPoint, selected: boolean): L.DivIcon {
  const size = assetRadius(asset);
  const color = assetColor(asset.status);
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="width:${size}px;height:${size}px;color:${color};filter:${selected ? "drop-shadow(0 0 0.5rem rgba(37,99,235,0.45))" : "none"};">
        <svg viewBox="0 0 28 28" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          ${lifecycleShape(asset.lifecycle)}
        </svg>
      </div>
    `,
  });
}

function marketFill(market: FundFootprintMarketRollup): string {
  if (market.performance_state === "outperforming") return "#16A34A";
  if (market.performance_state === "underperforming") return "#DC2626";
  return "#D97706";
}

function marketRadius(market: FundFootprintMarketRollup): number {
  if (market.total_nav >= 300_000_000) return 28;
  if (market.total_nav >= 150_000_000) return 24;
  if (market.total_nav >= 75_000_000) return 20;
  return 16;
}

function AssetTooltip({ asset }: { asset: FundFootprintAssetPoint }) {
  return (
    <div className="min-w-[220px]">
      <p className="font-semibold text-[#0F172A]">{asset.name}</p>
      <p className="text-xs text-[#64748B]">
        {asset.market ?? [asset.city, asset.state].filter(Boolean).join(", ")} · {asset.status}
      </p>
      <div className="mt-2 space-y-1 text-xs text-[#334155]">
        <p>NOI: <span className="font-medium">{fmtMoney(asset.noi)}</span></p>
        <p>Occupancy: <span className="font-medium">{fmtPct(asset.occupancy)}</span></p>
        <p>DSCR: <span className="font-medium">{asset.dscr != null ? `${asset.dscr.toFixed(2)}x` : "Unavailable"}</span></p>
        <p>Valuation quarter: <span className="font-medium">{asset.valuation_quarter ?? "Unavailable"}</span></p>
        {asset.integrity_reason ? (
          <p className="text-[#B91C1C]">Integrity issue: {asset.integrity_reason}</p>
        ) : null}
      </div>
    </div>
  );
}

function MarketTooltip({ market }: { market: FundFootprintMarketRollup }) {
  return (
    <div className="min-w-[220px]">
      <p className="font-semibold text-[#0F172A]">{market.market_label}</p>
      <p className="text-xs text-[#64748B]">{market.asset_count} assets · {market.performance_state}</p>
      <div className="mt-2 space-y-1 text-xs text-[#334155]">
        <p>Total NAV: <span className="font-medium">{fmtMoney(market.total_nav)}</span></p>
        <p>Avg occupancy: <span className="font-medium">{fmtPct(market.avg_occupancy)}</span></p>
        <p>Avg DSCR: <span className="font-medium">{market.avg_dscr != null ? `${market.avg_dscr.toFixed(2)}x` : "Unavailable"}</span></p>
        {market.integrity_issues > 0 ? (
          <p className="text-[#B91C1C]">Integrity issues: {market.integrity_issues}</p>
        ) : null}
      </div>
    </div>
  );
}

function useDarkMode(): boolean {
  const [dark, setDark] = React.useState(
    () => typeof window !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export default function FundFootprintMapInner({
  assetPoints,
  marketPoints,
  viewMode,
  selectedAssetId,
  selectedMarketKey,
  onSelectAsset,
  onSelectMarket,
  fitKey,
}: {
  assetPoints: FundFootprintAssetPoint[];
  marketPoints: FundFootprintMarketRollup[];
  viewMode: ViewMode;
  selectedAssetId: string | null;
  selectedMarketKey: string | null;
  onSelectAsset: (assetId: string) => void;
  onSelectMarket: (marketKey: string) => void;
  fitKey: string;
}) {
  const isDark = useDarkMode();

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  const assetIcons = useMemo(
    () =>
      new Map(
        assetPoints.map((asset) => [
          asset.asset_id,
          makeAssetIcon(asset, asset.asset_id === selectedAssetId),
        ]),
      ),
    [assetPoints, selectedAssetId],
  );

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  return (
    <MapContainer center={[39.8, -98.5]} zoom={4} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution={tileAttribution} url={tileUrl} />
      <FitBounds assetPoints={assetPoints} marketPoints={marketPoints} viewMode={viewMode} fitKey={fitKey} />

      {viewMode === "assets"
        ? assetPoints.map((asset) => (
            <Marker
              key={asset.asset_id}
              position={[asset.lat, asset.lon]}
              icon={assetIcons.get(asset.asset_id) ?? makeAssetIcon(asset, false)}
              eventHandlers={{ click: () => onSelectAsset(asset.asset_id) }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <AssetTooltip asset={asset} />
              </Tooltip>
            </Marker>
          ))
        : marketPoints.map((market) => (
            <CircleMarker
              key={market.market_key}
              center={[market.lat, market.lon]}
              radius={marketRadius(market)}
              pathOptions={{
                color: selectedMarketKey === market.market_key ? "#1D4ED8" : marketFill(market),
                fillColor: marketFill(market),
                fillOpacity: 0.32,
                weight: selectedMarketKey === market.market_key ? 3 : market.integrity_issues > 0 ? 2.5 : 2,
                dashArray: market.integrity_issues > 0 ? "4 4" : undefined,
              }}
              eventHandlers={{ click: () => onSelectMarket(market.market_key) }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <MarketTooltip market={market} />
              </Tooltip>
            </CircleMarker>
          ))}
    </MapContainer>
  );
}
