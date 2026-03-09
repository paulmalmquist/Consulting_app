"use client";
import React from "react";

/* ── AttributionBridgeChart ───────────────────────────────────────
   Waterfall-style bar chart using recharts. Each bar shows one
   driver's IRR impact in basis points. Green for positive impact,
   red for negative.
   ────────────────────────────────────────────────────────────────── */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface BridgeDriver {
  driver: string;
  uw_value: number | null;
  actual_value: number | null;
  irr_impact_bps: number;
}

interface AttributionBridgeChartProps {
  drivers: BridgeDriver[];
  uw_irr: number;
  actual_irr: number;
}

interface WaterfallDatum {
  driver: string;
  /** Bottom of the visible bar (invisible base) */
  base: number;
  /** Height of the visible bar (signed) */
  value: number;
  /** Raw bps impact for tooltip */
  bps: number;
  /** Whether this is a summary bar (UW / Actual totals) */
  isSummary: boolean;
}

function buildWaterfallData(
  drivers: BridgeDriver[],
  uwIrr: number,
  actualIrr: number,
): WaterfallDatum[] {
  const uwBps = Math.round(uwIrr * 10000);
  const actualBps = Math.round(actualIrr * 10000);

  const data: WaterfallDatum[] = [];

  // Starting bar: UW IRR
  data.push({
    driver: "UW IRR",
    base: 0,
    value: uwBps,
    bps: uwBps,
    isSummary: true,
  });

  // Waterfall drivers
  let running = uwBps;
  for (const d of drivers) {
    const impact = d.irr_impact_bps;
    if (impact >= 0) {
      data.push({
        driver: d.driver,
        base: running,
        value: impact,
        bps: impact,
        isSummary: false,
      });
    } else {
      data.push({
        driver: d.driver,
        base: running + impact,
        value: Math.abs(impact),
        bps: impact,
        isSummary: false,
      });
    }
    running += impact;
  }

  // Ending bar: Actual IRR
  data.push({
    driver: "Actual IRR",
    base: 0,
    value: actualBps,
    bps: actualBps,
    isSummary: true,
  });

  return data;
}

function barColor(datum: WaterfallDatum): string {
  if (datum.isSummary) return "#6366f1"; // indigo for summary bars
  return datum.bps >= 0 ? "#34d399" : "#f87171"; // green / red
}

export default function AttributionBridgeChart({
  drivers,
  uw_irr,
  actual_irr,
}: AttributionBridgeChartProps) {
  const data = buildWaterfallData(drivers, uw_irr, actual_irr);

  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center text-sm text-bm-muted2">
        No attribution bridge data available.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
      data-testid="attribution-bridge-chart"
    >
      <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3 font-medium">
        IRR Attribution Bridge (bps)
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, bottom: 30, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="driver"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(v: number) => `${v} bps`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(_value: number, _name: string, props: { payload?: WaterfallDatum }) => {
              const d = props.payload;
              if (!d) return [String(_value), _name];
              const sign = d.bps >= 0 ? "+" : "";
              return [`${sign}${d.bps} bps`, d.driver];
            }}
            labelStyle={{ color: "#d1d5db" }}
          />
          <ReferenceLine y={0} stroke="#6b7280" />
          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          {/* Visible value bar */}
          <Bar dataKey="value" stackId="waterfall" radius={[3, 3, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={barColor(entry)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
