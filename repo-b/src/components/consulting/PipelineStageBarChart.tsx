"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Customized,
  type TooltipProps,
} from "recharts";
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  GRID_STYLE,
  fmtCompact,
} from "@/components/charts/chart-theme";
import { buildIndustryColorMap } from "./pipeline-industry-colors";
import type { Insight, StageRow } from "./pipeline-insight";

export type ChartMode = "count" | "value";

type Props = {
  data: StageRow[];
  industries: string[];
  insight: Insight;
  mode: ChartMode;
  selectedIndustries: Set<string>;
  focusedStage: string | null;
  hasActiveFilters: boolean;
  onToggleMode: () => void;
  onToggleIndustry: (industry: string) => void;
  onSelectStage: (stageKey: string) => void;
  onSelectSegment: (stageKey: string, industry: string) => void;
  onInsightAction: () => void;
  onClearFilters: () => void;
};

export default function PipelineStageBarChart({
  data,
  industries,
  insight,
  mode,
  selectedIndustries,
  focusedStage,
  hasActiveFilters,
  onToggleMode,
  onToggleIndustry,
  onSelectStage,
  onSelectSegment,
  onInsightAction,
  onClearFilters,
}: Props) {
  const industryColors = useMemo(
    () => buildIndustryColorMap(industries),
    [industries],
  );

  const totalDeals = useMemo(
    () => data.reduce((s, row) => s + Number(row._total || 0), 0),
    [data],
  );

  const hasData = data.length > 0 && totalDeals > 0;

  return (
    <section className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-4 pt-3 pb-4 space-y-3">
      <InsightStrip insight={insight} onAction={onInsightAction} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          Stage × Industry
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-bm-border/60 overflow-hidden text-[10px] font-semibold">
            <button
              type="button"
              onClick={mode === "count" ? undefined : onToggleMode}
              className={`px-2 py-1 transition-colors ${
                mode === "count"
                  ? "bg-bm-accent/15 text-bm-accent"
                  : "text-bm-muted2 hover:bg-bm-surface/40"
              }`}
            >
              COUNT
            </button>
            <button
              type="button"
              onClick={mode === "value" ? undefined : onToggleMode}
              className={`px-2 py-1 border-l border-bm-border/60 transition-colors ${
                mode === "value"
                  ? "bg-bm-accent/15 text-bm-accent"
                  : "text-bm-muted2 hover:bg-bm-surface/40"
              }`}
            >
              VALUE
            </button>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-md border border-bm-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-bm-muted2 hover:bg-bm-surface/40"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <IndustryChips
        industries={industries}
        colors={industryColors}
        selected={selectedIndustries}
        onToggle={onToggleIndustry}
      />

      {hasData ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={data}
            margin={{ top: 28, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid vertical={false} {...GRID_STYLE} />
            <XAxis
              dataKey="stage_label"
              tick={<StageTick />}
              axisLine={false}
              tickLine={false}
              height={44}
              interval={0}
            />
            <YAxis
              tick={AXIS_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={mode === "value" ? 56 : 36}
              tickFormatter={
                mode === "value" ? (v: number) => fmtCompact(v, "$") : undefined
              }
            />
            <Tooltip
              content={
                <StageTooltip
                  mode={mode}
                  industries={industries}
                  colors={industryColors}
                />
              }
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
            />
            {industries.map((ind) => (
              <Bar
                key={ind}
                dataKey={ind}
                stackId="stages"
                fill={industryColors[ind]}
                fillOpacity={0.88}
                onClick={(entry: unknown) => {
                  const row = entry as { stage_key?: string } | undefined;
                  if (row?.stage_key) onSelectSegment(row.stage_key, ind);
                }}
                cursor="pointer"
              />
            ))}
            <Customized
              component={(chartProps: unknown) => (
                <StageOverlays
                  chartProps={chartProps}
                  data={data}
                  focusedStage={focusedStage}
                  onSelectStage={onSelectStage}
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[260px] items-center justify-center text-sm text-bm-muted2">
          No open deals match the current filter.
        </div>
      )}

      <p className="text-[10px] text-bm-muted2">
        {data.length} stage{data.length === 1 ? "" : "s"} · {totalDeals} deal
        {totalDeals === 1 ? "" : "s"} · {industries.length} industr
        {industries.length === 1 ? "y" : "ies"}
      </p>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── */

function InsightStrip({
  insight,
  onAction,
}: {
  insight: Insight;
  onAction: () => void;
}) {
  const borderClass =
    insight.severity === "critical"
      ? "border-red-500/70"
      : insight.severity === "warning"
        ? "border-amber-500/70"
        : "border-bm-accent/60";
  const icon =
    insight.severity === "critical"
      ? "●"
      : insight.severity === "warning"
        ? "●"
        : "●";
  const iconColor =
    insight.severity === "critical"
      ? "text-red-400"
      : insight.severity === "warning"
        ? "text-amber-400"
        : "text-bm-accent";

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border-l-4 ${borderClass} bg-bm-surface/30 pl-3 pr-3 py-2`}
    >
      <span className={`mt-0.5 text-xs leading-none ${iconColor}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-bm-text leading-tight">
          {insight.headline}
        </p>
        <p className="text-xs text-bm-muted2 leading-tight mt-0.5">
          {insight.subline}
        </p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-md border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-semibold text-bm-accent hover:bg-bm-accent/20 transition-colors"
      >
        {insight.recommendation.label} →
      </button>
    </div>
  );
}

function IndustryChips({
  industries,
  colors,
  selected,
  onToggle,
}: {
  industries: string[];
  colors: Record<string, string>;
  selected: Set<string>;
  onToggle: (ind: string) => void;
}) {
  if (industries.length === 0) return null;
  const noneSelected = selected.size === 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {industries.map((ind) => {
        const active = noneSelected || selected.has(ind);
        return (
          <button
            key={ind}
            type="button"
            onClick={() => onToggle(ind)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "border-bm-accent/50 bg-bm-accent/10 text-bm-text"
                : "border-bm-border/50 bg-transparent text-bm-muted2 hover:bg-bm-surface/40"
            }`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: active ? colors[ind] : "rgba(148,163,184,0.5)",
              }}
            />
            {ind}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */

type StageTickProps = {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
};

function StageTick(props: StageTickProps) {
  const { x = 0, y = 0, payload } = props;
  if (!payload) return null;
  // The payload index maps to the chart data row index. Recharts doesn't hand
  // us the row directly — we pull the momentum glyph off a data attribute
  // threaded through the chart via <text> below. Fallback: just render label.
  return (
    <g transform={`translate(${x},${y + 10})`}>
      <text
        textAnchor="middle"
        fill="rgba(148,163,184,0.85)"
        fontSize={10}
        fontWeight={600}
      >
        {truncate(payload.value, 14)}
      </text>
    </g>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/* Overlay layer that reads the Recharts internal geometry and paints
 * per-stage health labels, momentum arrows, and signal dots above each
 * stacked bar. Using <Customized> lets us read the computed bar positions
 * (`formattedGraphicalItems`) regardless of which industries have non-zero
 * values for any given row. */
type StageOverlaysProps = {
  chartProps: unknown;
  data: StageRow[];
  focusedStage: string | null;
  onSelectStage: (key: string) => void;
};

type InternalBarItem = {
  props?: {
    data?: Array<{ x: number; y: number; width: number; height: number }>;
  };
};

type InternalChartState = {
  formattedGraphicalItems?: InternalBarItem[];
};

function StageOverlays({
  chartProps,
  data,
  focusedStage,
  onSelectStage,
}: StageOverlaysProps) {
  const state = chartProps as InternalChartState;
  const items = state.formattedGraphicalItems;
  if (!items || items.length === 0) return null;

  // Walk every bar series and compute, per row index, the topmost Y coordinate
  // (smallest y) across all non-zero cells. That's the top of the stack.
  const tops: Array<{ x: number; y: number; width: number } | null> = data.map(
    () => null,
  );

  items.forEach((item) => {
    const rows = item.props?.data || [];
    rows.forEach((bar, i) => {
      if (!bar || bar.height <= 0) return;
      const existing = tops[i];
      if (!existing || bar.y < existing.y) {
        tops[i] = { x: bar.x, y: bar.y, width: bar.width };
      }
    });
  });

  return (
    <g>
      {data.map((row, i) => {
        const geom = tops[i];
        if (!geom || !row._total) return null;
        const total = Number(row._total);
        const noAction = Number(row._noAction || 0);
        const stale = Number(row._stale || 0);
        const hot = Number(row._hot || 0);
        const label = (row._healthLabel as string | undefined) || "";
        const momentum = row._momentum as
          | "up"
          | "flat"
          | "down"
          | undefined;
        const isFocused =
          focusedStage !== null && focusedStage === row.stage_key;

        const cx = geom.x + geom.width / 2;
        const labelY = geom.y - 18;
        const metaY = labelY + 10;
        const dotY = geom.y - 4;

        const dots: Array<{ color: string }> = [];
        if (noAction > 0) dots.push({ color: "#ef4444" });
        if (stale > 0) dots.push({ color: "#f59e0b" });
        if (hot > 0) dots.push({ color: "#10b981" });
        const dotSpacing = 7;
        const dotStartX = cx - ((dots.length - 1) * dotSpacing) / 2;

        const arrow =
          momentum === "up" ? "↑" : momentum === "down" ? "↓" : "→";
        const arrowColor =
          momentum === "up"
            ? "#34d399"
            : momentum === "down"
              ? "#f87171"
              : "rgba(148,163,184,0.75)";

        return (
          <g
            key={row.stage_key}
            style={{ cursor: "pointer" }}
            onClick={() => onSelectStage(String(row.stage_key))}
          >
            {/* Clickable hit zone above the bar */}
            <rect
              x={geom.x}
              y={Math.max(0, labelY - 6)}
              width={geom.width}
              height={Math.max(0, geom.y - Math.max(0, labelY - 6))}
              fill="transparent"
            />
            {label ? (
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={isFocused ? "#e8ecf1" : "rgba(226,232,240,0.82)"}
                style={{ letterSpacing: "0.04em" }}
              >
                {label}
              </text>
            ) : null}
            <text
              x={cx}
              y={metaY}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
            >
              <tspan fill={arrowColor}>{arrow}</tspan>
              <tspan fill="rgba(148,163,184,0.75)" dx={3}>
                {total} deal{total === 1 ? "" : "s"}
              </tspan>
            </text>
            {dots.map((d, di) => (
              <circle
                key={d.color}
                cx={dotStartX + di * dotSpacing}
                cy={dotY}
                r={2.2}
                fill={d.color}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/* ──────────────────────────────────────────────────────────── */

type StageTooltipInjected = {
  mode: ChartMode;
  industries: string[];
  colors: Record<string, string>;
};

function StageTooltip(
  props: TooltipProps<number, string> & StageTooltipInjected,
) {
  const { active, payload, mode, industries, colors } = props;
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as StageRow | undefined;
  if (!row) return null;

  const format = (v: number) =>
    mode === "value" ? fmtCompact(v, "$") : String(v);

  const breakdown = industries
    .map((ind) => ({
      ind,
      value: Number(row[ind] || 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const total =
    mode === "count"
      ? Number(row._total || 0)
      : breakdown.reduce((s, r) => s + r.value, 0);

  return (
    <div style={{ ...TOOLTIP_STYLE, minWidth: 180 }}>
      <div
        style={{
          fontWeight: 600,
          color: CHART_COLORS.axis,
          fontSize: 11,
          marginBottom: 4,
        }}
      >
        {row.stage_label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#e8ecf1",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {format(total)} {mode === "count" ? "deals" : "pipeline"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {breakdown.map((r) => (
          <div
            key={r.ind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: colors[r.ind],
                display: "inline-block",
              }}
            />
            <span style={{ color: "#cbd5e1", flex: 1 }}>{r.ind}</span>
            <span style={{ color: "#e8ecf1", fontWeight: 600 }}>
              {format(r.value)}
            </span>
          </div>
        ))}
      </div>
      {row._noAction || row._stale || row._hot ? (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid rgba(148,163,184,0.15)",
            display: "flex",
            gap: 8,
            fontSize: 10,
          }}
        >
          {Number(row._noAction || 0) > 0 ? (
            <span style={{ color: "#f87171" }}>● {row._noAction} no-action</span>
          ) : null}
          {Number(row._stale || 0) > 0 ? (
            <span style={{ color: "#fbbf24" }}>● {row._stale} stale</span>
          ) : null}
          {Number(row._hot || 0) > 0 ? (
            <span style={{ color: "#34d399" }}>● {row._hot} progressing</span>
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 6,
          fontSize: 10,
          color: "rgba(148,163,184,0.7)",
          fontStyle: "italic",
        }}
      >
        Click to focus this stage
      </div>
    </div>
  );
}
