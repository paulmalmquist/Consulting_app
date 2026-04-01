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
import type { ApiAnalogMatch, ApiEpisode } from "@/components/market/hooks/useDecisionEngine";
import { safeStr, safeScore, isValid, hasData } from "@/lib/trading-lab/safe-display";

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
  episodes?: ApiEpisode[];
}

export function TopAnalogCard({ analogOverlay, radarDims, topMatch, episodes }: TopAnalogCardProps) {
  const topAnalog = topMatch?.matches?.[0];

  // Don't render if no analog data exists
  if (!topAnalog) return null;

  const analogName = safeStr(topAnalog.episode_name);
  const rhymeScore = topAnalog.rhyme_score;
  const keySim = safeStr(topAnalog.key_similarity);
  const keyDiv = safeStr(topAnalog.key_divergence);
  const isSeed = topMatch?.source === "seed";

  // Find matching episode for forward outcome
  const matchedEpisode = episodes?.find(
    (e) => e.name === topAnalog.episode_name || e.id === topAnalog.episode_id,
  );

  const forwardOutcome = matchedEpisode
    ? `Historically led to ${Math.abs(matchedEpisode.peak_to_trough_pct).toFixed(0)}% drawdown over ${matchedEpisode.duration_days} days${
        matchedEpisode.recovery_duration_days
          ? `. Recovery took ${matchedEpisode.recovery_duration_days} days`
          : ""
      }.`
    : null;

  const hasOverlayData = hasData(analogOverlay);
  const hasRadarData = hasData(radarDims);

  return (
    <Card className="p-4 border-l-4 border-l-bm-warning">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Top Analog
        </p>
        <Badge variant={isSeed ? "accent" : "success"}>{isSeed ? "SEED" : "LIVE"}</Badge>
      </div>

      {/* Analog callout */}
      <div className="flex items-start justify-between mb-4 pb-3 border-b border-bm-border/30">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-bm-text">
            {analogName}
          </p>
          {isValid(rhymeScore) && (
            <p className="text-[10px] text-bm-muted2 mt-0.5">
              Rhyme Score: <span className="font-mono font-bold text-bm-accent text-lg">{safeScore(rhymeScore)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Divergence + Similarity as first-class insights */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
          <p className="text-[9px] text-emerald-400 uppercase font-bold mb-1">Key Similarities</p>
          <p className="text-xs text-bm-text leading-relaxed">{keySim}</p>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
          <p className="text-[9px] text-amber-400 uppercase font-bold mb-1">Key Divergences</p>
          <p className="text-xs text-bm-text leading-relaxed">{keyDiv}</p>
        </div>
      </div>

      {/* What happened next — forward outcome */}
      {forwardOutcome && (
        <div className="rounded-lg bg-bm-surface/30 border border-bm-border/30 p-3 mb-4">
          <p className="text-[9px] text-bm-muted2 uppercase font-bold mb-1">What Happened Next</p>
          <p className="text-xs text-bm-text leading-relaxed">{forwardOutcome}</p>
          {matchedEpisode?.modern_analog_thesis && (
            <p className="text-[10px] text-bm-muted mt-2 italic leading-relaxed">
              {matchedEpisode.modern_analog_thesis}
            </p>
          )}
        </div>
      )}

      {/* Charts — only render with real data */}
      {(hasOverlayData || hasRadarData) && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
          {hasOverlayData && (
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
          )}
          {hasRadarData && (
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
          )}
        </div>
      )}
    </Card>
  );
}
