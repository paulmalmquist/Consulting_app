"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE, GRID_STYLE,
} from "@/components/charts/chart-theme";
import type { AgentDataItem, BrierHistPoint } from "@/lib/trading-lab/decision-engine-types";

const CH = {
  cyan: CHART_COLORS.scenario[0],
  red: CHART_COLORS.opex,
  green: CHART_COLORS.noi,
  grid: CHART_COLORS.grid,
} as const;

const AGENT_REASONING: Record<string, string> = {
  Macro: "Late-cycle tightening with sticky inflation. Labor market cooling but not cracking. Credit spreads widening modestly.",
  Quant: "Mean-reversion signals mixed. Momentum fading but not reversed. Vol surface showing mild put skew.",
  Narrative: "Soft landing narrative exhausting (crowding 85). AI bubble narrative accelerating. Rate cut rally losing steam.",
  Contrarian: "Positioning already defensive. Crowded Office REIT shorts. Potential for squeeze if data improves.",
  "Red Team": "Flow/narrative mismatch detected: bearish narrative but net buying flows. 3 low-provenance sources amplified.",
};

interface ModelTransparencyPanelProps {
  agentData: AgentDataItem[];
  brierHist: BrierHistPoint[];
}

export function ModelTransparencyPanel({ agentData, brierHist }: ModelTransparencyPanelProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const totalConf =
    agentData.reduce((s, a) => s + a.conf * a.wt, 0) /
    agentData.reduce((s, a) => s + a.wt, 0);

  const latestBrier = brierHist[brierHist.length - 1]?.agg ?? 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Model Transparency
        </p>
        <Badge>5 AGENTS</Badge>
      </div>

      {/* Aggregate output */}
      <div className="flex items-center gap-4 mb-4 pb-3 border-b border-bm-border/30">
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Ensemble</p>
          <p className="text-lg font-mono font-bold text-bm-warning">
            Bearish Lean
          </p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">Confidence</p>
          <p className="text-lg font-mono font-bold text-bm-text">
            {totalConf.toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-bm-muted2 uppercase">90d Brier</p>
          <p
            className={`text-lg font-mono font-bold ${
              latestBrier < 0.2 ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {latestBrier.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Agent rows */}
      <div className="space-y-0.5 mb-4">
        {agentData.map((a) => {
          const isExpanded = expandedAgent === a.agent;
          const dirColor =
            a.dir === "Bullish"
              ? "text-emerald-400"
              : a.dir === "Bearish"
                ? "text-red-400"
                : a.dir === "TRAP"
                  ? "text-amber-400"
                  : "text-bm-muted";

          return (
            <div key={a.agent}>
              <button
                onClick={() =>
                  setExpandedAgent(isExpanded ? null : a.agent)
                }
                className="w-full grid grid-cols-[80px_60px_1fr_45px_45px] items-center py-2 border-b border-bm-border/30 hover:bg-bm-surface/20 transition-colors text-left"
              >
                <span className="text-xs font-semibold text-bm-text">
                  {a.agent}
                </span>
                <span className={`text-[10px] font-bold ${dirColor}`}>
                  {a.dir}
                </span>
                <div className="flex items-center gap-2 pr-2">
                  <div className="flex-1 h-1.5 rounded-full bg-bm-bg overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        a.dir === "Bullish"
                          ? "bg-emerald-400/70"
                          : a.dir === "Bearish"
                            ? "bg-red-400/70"
                            : "bg-amber-400/70"
                      }`}
                      style={{ width: `${a.conf}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-bm-muted w-7 text-right">
                    {a.conf}%
                  </span>
                </div>
                <span
                  className={`font-mono text-[10px] text-center ${
                    a.brier < 0.2 ? "text-emerald-400" : "text-bm-muted"
                  }`}
                >
                  {a.brier}
                </span>
                <span className="font-mono text-[10px] text-bm-muted2 text-center">
                  {a.wt}%
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 py-2 bg-bm-surface/10 border-b border-bm-border/20">
                  <p className="text-[11px] text-bm-muted leading-relaxed">
                    {AGENT_REASONING[a.agent] ?? "No reasoning available."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[80px_60px_1fr_45px_45px] text-[8px] text-bm-muted2 pb-0.5 -mt-1 mb-2">
        <span>Agent</span>
        <span>Dir</span>
        <span>Confidence</span>
        <span className="text-center">Brier</span>
        <span className="text-center">Wt</span>
      </div>

      {/* Brier sparkline */}
      <div>
        <p className="text-[9px] text-bm-muted2 uppercase tracking-wider mb-1">
          Calibration History (24w)
        </p>
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart
            data={brierHist}
            margin={{ top: 2, right: 4, left: 0, bottom: 2 }}
          >
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="w" tick={false} axisLine={false} />
            <YAxis
              tick={false}
              axisLine={false}
              domain={[0.05, 0.35]}
              width={0}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="base"
              stroke={CH.red}
              fill={CH.red}
              fillOpacity={0.04}
              strokeDasharray="4 4"
              name="Coin Flip"
            />
            <Area
              type="monotone"
              dataKey="agg"
              stroke={CH.cyan}
              fill={CH.cyan}
              fillOpacity={0.08}
              strokeWidth={1.5}
              name="Aggregate"
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[9px] text-bm-muted2 mt-1">
          Lower = better. Red = coin flip baseline. Target: &lt;0.20
        </p>
      </div>
    </Card>
  );
}
