"use client";

import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE,
} from "@/components/charts/chart-theme";
import type { AnalogOverlayPoint, RadarDim } from "@/lib/trading-lab/decision-engine-types";
import type { ApiAnalogMatch } from "@/components/market/hooks/useDecisionEngine";

const CH = {
  cyan: CHART_COLORS.scenario[0],
  red: CHART_COLORS.opex,
  purple: CHART_COLORS.scenario[4],
  grid: CHART_COLORS.grid,
  axis: CHART_COLORS.axis,
} as const;

interface TopAnalogCardProps {
  analogOverlay: AnalogOverlayPoint[];
  radarDims: RadarDim[];
  topMatch?: ApiAnalogMatch | null;
}

export function TopAnalogCard({ analogOverlay, radarDims, topMatch }: TopAnalogCardProps) {
  const topAnalog = topMatch?.matches?.[0];
  const analogName = topAnalog?.episode_name ?? "2022 Rate Cycle";
  const rhymeScore = topAnalog?.rhyme_score ?? 0.78;
  const keySim = topAnalog?.key_similarity ?? "tightening + leverage stress";
  const keyDiv = topAnalog?.key_divergence ?? "labor market holding longer this cycle";
  const isSeed = topMatch?.source === "seed";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Top Analog
        </p>
        <Badge variant={isSeed ? "accent" : "success"}>{isSeed ? "SEED" : "LIVE"}</Badge>
      </div>

      {/* Analog callout */}
      <div className="flex items-start justify-between mb-4 pb-3 border-b border-bm-border/30">
        <div>
          <p className="text-sm font-semibold text-bm-text">
            {analogName}
          </p>
          <p className="text-[10px] text-bm-muted mt-1">
            Key similarity: {keySim}
          </p>
          <p className="text-[10px] text-bm-muted2 mt-0.5">
            Key divergence: {keyDiv}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-bm-muted2 uppercase">Rhyme Score</p>
          <p className="text-2xl font-bold font-mono text-bm-accent">{rhymeScore.toFixed(2)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
            Trajectory Overlay (60d)
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={analogOverlay}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="day"
                tick={AXIS_TICK_STYLE}
                tickLine={false}
                axisLine={{ stroke: CH.grid }}
              />
              <YAxis
                tick={AXIS_TICK_STYLE}
                tickLine={false}
                axisLine={{ stroke: CH.grid }}
                domain={["auto", "auto"]}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="current"
                stroke={CH.cyan}
                strokeWidth={2.5}
                dot={false}
                name="Current"
              />
              <Line
                type="monotone"
                dataKey="gfc"
                stroke={CH.red}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                name="GFC 2008"
                opacity={0.7}
              />
              <Line
                type="monotone"
                dataKey="crypto22"
                stroke={CH.purple}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="Crypto 2022"
                opacity={0.7}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-bm-muted2 mb-2">
            5-Layer Match
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarDims}>
              <PolarGrid stroke={CH.grid} />
              <PolarAngleAxis
                dataKey="d"
                tick={{ fill: CH.axis, fontSize: 9 }}
              />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 1]} />
              <Radar
                name="Current"
                dataKey="current"
                stroke={CH.cyan}
                fill={CH.cyan}
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Radar
                name="GFC"
                dataKey="gfc"
                stroke={CH.red}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
              <Radar
                name="Crypto 22"
                dataKey="crypto22"
                stroke={CH.purple}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
