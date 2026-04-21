"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
  ZAxis,
} from "recharts";

import type { ReV2OperatorDiagnosticsAsset } from "@/lib/bos-api";

interface Props {
  assets: ReV2OperatorDiagnosticsAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (assetId: string | null) => void;
}

const PALETTE = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#facc15",
];

function operatorColor(name: string | null, all: string[]): string {
  if (!name) return "#64748b";
  const idx = all.indexOf(name);
  if (idx < 0) return "#64748b";
  return PALETTE[idx % PALETTE.length];
}

export function OperatorScatter({ assets, selectedAssetId, onSelectAsset }: Props) {
  const operators = useMemo(
    () => Array.from(new Set(assets.map((a) => a.operator_name).filter((x): x is string => !!x))).sort(),
    [assets],
  );

  // Partition by operator so legend + color work per-group in recharts.
  const groups = useMemo(() => {
    const byOp = new Map<string, typeof points>();
    const points = assets
      .map((a) => {
        const xRaw = a.occupancy !== null ? Number(a.occupancy) : null;
        const yRaw = a.noi_margin !== null ? Number(a.noi_margin) : null;
        if (xRaw === null || yRaw === null || !Number.isFinite(xRaw) || !Number.isFinite(yRaw)) {
          return null;
        }
        const revenueNum = a.revenue !== null ? Number(a.revenue) : 0;
        return {
          x: xRaw * 100,
          y: yRaw * 100,
          z: Number.isFinite(revenueNum) ? Math.max(50_000, revenueNum) : 50_000,
          asset_id: a.asset_id,
          name: a.name,
          operator_name: a.operator_name,
          acuity_type: a.acuity_type,
          market: a.market,
          released: a.period_exact && a.state_origin === "authoritative",
        };
      })
      .filter(Boolean) as Array<{
      x: number;
      y: number;
      z: number;
      asset_id: string;
      name: string;
      operator_name: string | null;
      acuity_type: string | null;
      market: string | null;
      released: boolean;
    }>;

    for (const p of points) {
      const key = p.operator_name ?? "Unknown";
      const arr = byOp.get(key) ?? [];
      arr.push(p);
      byOp.set(key, arr);
    }
    return byOp;
  }, [assets]);

  return (
    <div
      data-testid="operator-scatter"
      className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-bm-foreground">
            Occupancy × NOI margin
          </h2>
          <p className="text-[10px] text-bm-foreground-muted">
            Color = operator · Size = revenue · Hollow = unreleased
          </p>
        </div>
        {selectedAssetId && (
          <button
            type="button"
            onClick={() => onSelectAsset(null)}
            className="text-xs text-bm-accent hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[50, 100]}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
          >
            <Label
              value="Occupancy %"
              position="bottom"
              offset={10}
              style={{ fill: "#9ca3af", fontSize: 11 }}
            />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
          >
            <Label
              value="NOI margin %"
              angle={-90}
              position="left"
              offset={10}
              style={{ fill: "#9ca3af", fontSize: 11 }}
            />
          </YAxis>
          <ZAxis type="number" dataKey="z" range={[60, 360]} />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload as any;
              return (
                <div className="rounded border border-bm-border bg-bm-surface px-3 py-2 text-xs text-bm-foreground shadow-lg">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-bm-foreground-muted">{d.operator_name ?? "—"} · {d.acuity_type ?? "—"} · {d.market ?? "—"}</div>
                  <div className="mt-1">Occupancy: {d.x.toFixed(1)}%</div>
                  <div>NOI margin: {d.y.toFixed(1)}%</div>
                  {!d.released && (
                    <div className="mt-1 text-amber-300">Unreleased — not in peer math</div>
                  )}
                </div>
              );
            }}
          />
          {Array.from(groups.entries()).map(([op, pts]) => (
            <Scatter
              key={op}
              name={op}
              data={pts}
              fill={operatorColor(op, operators)}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const r = payload.z ? Math.max(5, Math.min(16, Math.sqrt(payload.z) / 40)) : 7;
                const isSelected = payload.asset_id === selectedAssetId;
                const color = operatorColor(payload.operator_name, operators);
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? r + 2 : r}
                    fill={payload.released ? color : "transparent"}
                    fillOpacity={payload.released ? 0.75 : 0}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : 1.25}
                    onClick={() => onSelectAsset(payload.asset_id)}
                    style={{ cursor: "pointer" }}
                  />
                );
              }}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
