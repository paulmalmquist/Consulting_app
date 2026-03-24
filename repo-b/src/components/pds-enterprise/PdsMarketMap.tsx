"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { MarketMapPoint } from "./PdsMarketMapInner";

const MapInner = dynamic(() => import("./PdsMarketMapInner"), { ssr: false });

export type { MarketMapPoint };

export function PdsMarketMap({
  points,
  selectedMarketId,
  onMarketClick,
}: {
  points: MarketMapPoint[];
  selectedMarketId?: string | null;
  onMarketClick?: (marketId: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-slate-700/30 bg-bm-surface/10 text-sm text-bm-muted2">
        No market locations available.
      </div>
    );
  }

  return (
    <div className="h-full rounded-lg overflow-hidden border border-slate-700/30" data-testid="pds-market-map">
      {mounted ? (
        <MapInner
          points={points}
          selectedMarketId={selectedMarketId}
          onMarketClick={onMarketClick}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-bm-muted2">
          Loading map...
        </div>
      )}
    </div>
  );
}
