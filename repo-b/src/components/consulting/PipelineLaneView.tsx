"use client";

import React, { useMemo, useCallback, useRef } from "react";
import { useDroppable, useDraggable, DndContext, DragOverlay, useSensors } from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import type { ExecutionBoardColumn, ExecutionCard } from "@/lib/cro-api";
import type { StageRow, Insight } from "./pipeline-insight";
import type { ActiveSlice } from "./PipelineActionPanel";
import { VERTICAL_COLORS, type ColorMode } from "./pipeline-verticals";
import { PIPELINE_GROUPS, type BoardViewMode } from "./pipeline-groups";

// ─── Constants ────────────────────────────────────────────────────────────────
const LANE_W = 206;      // px — active column width (chart + kanban share this)
const CLOSED_W = 156;    // px — closed-stage columns are narrower / terminal
const LANE_GAP = 2;      // px — gap between columns
const BAR_H = 300;       // px — total bar area height per lane
const BAR_HEADROOM = 28; // px — reserved above bars for health label
const BAR_BASELINE = 10; // px — gap from bottom of bar area to base of bars

// ─── Palette ─────────────────────────────────────────────────────────────────
const CP = {
  accent: "#F5B942",
  accentAlpha: "rgba(245,185,66,0.09)",
  text: "#E8EAF0",
  textDim: "#9CA3AF",
  muted: "#6B7280",
  muted2: "#374151",
  border: "rgba(245,185,66,0.15)",
  borderDim: "rgba(255,255,255,0.07)",
  surface: "#0D1117",
  surfaceAlt: "#080C10",
  critical: "#EF4444",
  warning: "#F59E0B",
  info: "#22D3EE",
  won: "#22C55E",
} as const;

// Cyberpunk industry color overrides (different from the legacy bar chart colors)
const IND: Record<string, string> = {
  REPE: "#22D3EE",
  "Real Estate": "#22D3EE",
  "Real Estate Private Equity": "#22D3EE",
  Legal: "#E879F9",
  Law: "#E879F9",
  Healthcare: "#34D399",
  Health: "#34D399",
  PDS: "#F59E0B",
  "Professional Services": "#F59E0B",
  Construction: "#F97316",
  Finance: "#A78BFA",
  Financial: "#A78BFA",
  Technology: "#818CF8",
  Tech: "#818CF8",
  Other: "#6B7280",
  Unknown: "#6B7280",
};

function indColor(name: string, idx: number): string {
  return IND[name] ?? `hsl(${(idx * 51 + 17) % 360}, 55%, 52%)`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 0) return "future";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function isOverdue(dueDateStr: string | null | undefined): boolean {
  if (!dueDateStr) return false;
  const d = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type LaneMode = "count" | "value";

// ─── PipelineCommandBand ─────────────────────────────────────────────────────
type CommandBandProps = {
  insight: Insight;
  industries: string[];
  selectedIndustries: Set<string>;
  availableVerticals: Array<{ name: string; count: number }>;
  subVerticals: string[];
  selectedVertical: string | null;
  colorMode: ColorMode;
  mode: LaneMode;
  hasActiveFilters: boolean;
  openDeals: number;
  staleCount: number;
  criticalCount: number;
  noActionCount: number;
  revenueAtRisk: number;
  totalPipeline: number;
  weightedPipeline: number;
  onToggleIndustry: (ind: string) => void;
  onSelectVertical: (v: string) => void;
  onToggleColorMode: () => void;
  onInsightAction: () => void;
  onToggleMode: () => void;
  onClearFilters: () => void;
  boardViewToggle?: React.ReactNode;
};

export function PipelineCommandBand({
  insight,
  industries,
  selectedIndustries,
  availableVerticals,
  subVerticals,
  selectedVertical,
  colorMode,
  mode,
  hasActiveFilters,
  openDeals,
  staleCount,
  criticalCount,
  noActionCount,
  revenueAtRisk,
  totalPipeline,
  weightedPipeline,
  onToggleIndustry,
  onSelectVertical,
  onToggleColorMode,
  onInsightAction,
  onToggleMode,
  onClearFilters,
  boardViewToggle,
}: CommandBandProps) {
  const sevBorder =
    insight.severity === "critical"
      ? CP.critical
      : insight.severity === "warning"
        ? CP.warning
        : CP.info;

  return (
    <div
      style={{
        background: CP.surfaceAlt,
        borderBottom: `1px solid rgba(245,185,66,0.18)`,
        padding: "10px 16px 10px",
      }}
    >
      {/* Title + controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: CP.accent,
              whiteSpace: "nowrap",
            }}
          >
            PIPELINE
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: CP.muted,
              display: "none",
            }}
            className="sm:block"
          >
            Consulting Revenue Engine
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {hasActiveFilters ? (
            <button
              onClick={onClearFilters}
              style={{
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 3,
                border: `1px solid ${CP.borderDim}`,
                color: CP.muted,
                background: "transparent",
                cursor: "pointer",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              CLEAR
            </button>
          ) : null}
          <button
            onClick={onToggleColorMode}
            style={{
              fontSize: 9,
              padding: "4px 10px",
              borderRadius: 3,
              border: `1px solid ${colorMode === "vertical" ? CP.info + "55" : CP.borderDim}`,
              color: colorMode === "vertical" ? CP.info : CP.muted,
              background: colorMode === "vertical" ? "rgba(34,211,238,0.07)" : "transparent",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: colorMode === "vertical" ? 700 : 400,
            }}
          >
            {colorMode === "vertical" ? "BY VERT" : "BY IND"}
          </button>
          <button
            onClick={onToggleMode}
            style={{
              fontSize: 9,
              padding: "4px 10px",
              borderRadius: 3,
              border: `1px solid ${CP.border}`,
              color: CP.accent,
              background: CP.accentAlpha,
              cursor: "pointer",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {mode === "count" ? "# COUNT" : "$ VALUE"}
          </button>
          {boardViewToggle ?? null}
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${CP.borderDim}`,
        }}
      >
        <KpiChip label="OPEN" value={openDeals} />
        <KpiChip label="STALE" value={staleCount} alert={staleCount > 0} />
        <KpiChip
          label="CRITICAL"
          value={criticalCount}
          alert={criticalCount > 0}
          danger
        />
        <KpiChip
          label="NO ACTION"
          value={noActionCount}
          alert={noActionCount > 0}
        />
        <KpiChip label="AT RISK" value={fmtCurrency(revenueAtRisk)} />
        <KpiChip label="PIPELINE" value={fmtCurrency(totalPipeline)} />
        <KpiChip label="WEIGHTED" value={fmtCurrency(weightedPipeline)} />
      </div>

      {/* Insight strip */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
          borderLeft: `3px solid ${sevBorder}`,
          paddingLeft: 12,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: CP.text }}>
          {insight.headline}
        </span>
        <span style={{ fontSize: 11, color: CP.textDim }}>{insight.subline}</span>
        <button
          onClick={onInsightAction}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: CP.accent,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            letterSpacing: "0.02em",
          }}
        >
          {insight.recommendation.label} →
        </button>
      </div>

      {/* Vertical rail (vertical mode) or industry chips (industry mode) */}
      {colorMode === "vertical" ? (
        <div>
          {/* Vertical buttons */}
          {availableVerticals.length > 1 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {availableVerticals.map((v) => {
                const color = VERTICAL_COLORS[v.name] ?? "#6B7280";
                const isActive = selectedVertical === v.name;
                const isDim = selectedVertical !== null && !isActive;
                return (
                  <button
                    key={v.name}
                    onClick={() => onSelectVertical(v.name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "5px 10px",
                      borderRadius: 3,
                      border: `1px solid ${isActive ? color : CP.borderDim}`,
                      background: isActive ? `${color}1a` : "transparent",
                      color: isActive ? color : isDim ? CP.muted2 : CP.muted,
                      cursor: "pointer",
                      opacity: isDim ? 0.4 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    {v.name}
                    <span
                      style={{
                        fontSize: 8,
                        color: isActive ? color : CP.muted,
                        opacity: 0.7,
                        marginLeft: 1,
                      }}
                    >
                      {v.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Sub-vertical chips — shown when a vertical is selected and it has multiple industry tags */}
          {selectedVertical && subVerticals.length > 1 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {subVerticals.map((ind, idx) => {
                const color = indColor(ind, idx);
                const isActive =
                  selectedIndustries.size === 0 || selectedIndustries.has(ind);
                return (
                  <button
                    key={ind}
                    onClick={() => onToggleIndustry(ind)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "0.09em",
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 3,
                      border: `1px solid ${isActive ? color : CP.borderDim}`,
                      background: isActive ? `${color}14` : "transparent",
                      color: isActive ? color : CP.muted,
                      cursor: "pointer",
                      opacity: isActive ? 1 : 0.45,
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    {ind}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        // Industry mode — original flat chip list
        industries.length > 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {industries.map((ind, idx) => {
              const color = indColor(ind, idx);
              const isActive =
                selectedIndustries.size === 0 || selectedIndustries.has(ind);
              return (
                <button
                  key={ind}
                  onClick={() => onToggleIndustry(ind)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "4px 9px",
                    borderRadius: 3,
                    border: `1px solid ${isActive ? color : CP.borderDim}`,
                    background: isActive ? `${color}1a` : "transparent",
                    color: isActive ? color : CP.muted,
                    cursor: "pointer",
                    opacity: isActive ? 1 : 0.45,
                    transition: "all 0.15s",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  {ind}
                </button>
              );
            })}
          </div>
        ) : null
      )}
    </div>
  );
}

function KpiChip({
  label,
  value,
  alert = false,
  danger = false,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
  danger?: boolean;
}) {
  const numVal = typeof value === "number" ? value : NaN;
  const isAlerted = (alert || danger) && !isNaN(numVal) && numVal > 0;
  return (
    <div>
      <span
        style={{
          fontSize: 8,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: CP.muted,
          display: "block",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "0.01em",
          color: isAlerted
            ? danger
              ? CP.critical
              : CP.warning
            : CP.text,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── PipelineLaneView (main) ──────────────────────────────────────────────────
type PipelineLaneViewProps = {
  columns: ExecutionBoardColumn[];
  chartData: StageRow[];
  chartGroupKeys: string[];
  chartColorMap: Record<string, string>;
  colorMode: ColorMode;
  focusedSegKey: string | null;
  focusedStage: string | null;
  mode: LaneMode;
  onSelectStage: (key: string) => void;
  onSelectSegment: (key: string, segKey: string) => void;
  onSelectCard: (id: string) => void;
  makeColumnRef: (key: string) => (el: HTMLDivElement | null) => void;
};

const CLOSED = new Set(["closed_won", "closed_lost"]);

export default function PipelineLaneView({
  columns,
  chartData,
  chartGroupKeys,
  chartColorMap,
  colorMode,
  focusedSegKey,
  focusedStage,
  mode,
  onSelectStage,
  onSelectSegment,
  onSelectCard,
  makeColumnRef,
}: PipelineLaneViewProps) {
  const colorMap = useMemo(() => {
    if (colorMode === "vertical") {
      // chartColorMap already has vertical → color from page.tsx
      return chartColorMap;
    }
    // Industry mode: use existing indColor lookup
    const m: Record<string, string> = {};
    chartGroupKeys.forEach((ind, i) => {
      m[ind] = indColor(ind, i);
    });
    return m;
  }, [colorMode, chartGroupKeys, chartColorMap]);

  // globalMax adjusts for count vs. value mode so bars scale correctly
  const globalMax = useMemo(() => {
    return Math.max(
      ...chartData.map((r) => {
        if (mode === "count") return r._total;
        return chartGroupKeys.reduce((s, key) => s + (Number(r[key]) || 0), 0);
      }),
      1,
    );
  }, [chartData, chartGroupKeys, mode]);

  const rowByKey = useMemo(() => {
    const m: Record<string, StageRow> = {};
    chartData.forEach((r) => {
      m[r.stage_key] = r;
    });
    return m;
  }, [chartData]);

  return (
    <div style={{ background: CP.surface, flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0, height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            gap: LANE_GAP,
            padding: "14px 14px 14px",
            minWidth: "max-content",
            alignItems: "stretch",
          }}
        >
          {columns.map((col) => {
            const isClosed = CLOSED.has(col.execution_column_key);
            const row = isClosed
              ? null
              : (rowByKey[col.execution_column_key] ?? null);
            const isFocused =
              !isClosed && focusedStage === col.execution_column_key;
            const isDimmed =
              !isClosed &&
              focusedStage !== null &&
              focusedStage !== col.execution_column_key;
            return (
              <LaneColumn
                key={col.execution_column_key}
                column={col}
                row={row}
                isClosed={isClosed}
                globalMax={globalMax}
                chartGroupKeys={chartGroupKeys}
                colorMap={colorMap}
                mode={mode}
                isFocused={isFocused}
                isDimmed={isDimmed}
                focusedSegKey={isFocused ? focusedSegKey : null}
                onSelectStage={onSelectStage}
                onSelectSegment={onSelectSegment}
                onSelectCard={onSelectCard}
                columnRef={makeColumnRef(col.execution_column_key)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── LaneColumn ───────────────────────────────────────────────────────────────
type LaneColumnProps = {
  column: ExecutionBoardColumn;
  row: StageRow | null;
  isClosed: boolean;
  globalMax: number;
  chartGroupKeys: string[];
  colorMap: Record<string, string>;
  mode: LaneMode;
  isFocused: boolean;
  isDimmed: boolean;
  focusedSegKey: string | null;
  onSelectStage: (key: string) => void;
  onSelectSegment: (key: string, ind: string) => void;
  onSelectCard: (id: string) => void;
  columnRef: (el: HTMLDivElement | null) => void;
};

function LaneColumn({
  column,
  row,
  isClosed,
  globalMax,
  chartGroupKeys,
  colorMap,
  mode,
  isFocused,
  isDimmed,
  focusedSegKey,
  onSelectStage,
  onSelectSegment,
  onSelectCard,
  columnRef,
}: LaneColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column-${column.execution_column_key}`,
    data: { stageKey: column.execution_column_key },
  });

  // Stable combined ref — setNodeRef is stable from dnd-kit, columnRef is
  // memoised in page.tsx via columnRefCallbackCache
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      columnRef(el);
    },
    [setNodeRef, columnRef],
  );

  const border = isFocused
    ? `1px solid ${CP.accent}`
    : isOver
      ? "1px solid rgba(34,211,238,0.35)"
      : isClosed
        ? `1px solid rgba(255,255,255,0.04)`
        : `1px solid ${CP.borderDim}`;
  const bg = isFocused
    ? CP.accentAlpha
    : isOver
      ? "rgba(34,211,238,0.03)"
      : "transparent";

  const colW = isClosed ? CLOSED_W : LANE_W;
  const colOpacity = isDimmed ? 0.3 : isClosed ? 0.45 : 1;

  const focusedInd = isFocused ? focusedSegKey : null;

  return (
    <div
      ref={combinedRef}
      style={{
        width: colW,
        minWidth: colW,
        flexShrink: 0,
        border,
        borderRadius: 4,
        background: bg,
        opacity: colOpacity,
        transition: "opacity 0.2s, border-color 0.15s, background 0.15s",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        // height is intentionally omitted — parent's alignItems:stretch fills it
      }}
    >
      {/* Bar area — present for every lane so heights are uniform */}
      {!isClosed && row ? (
        <LaneBar
          row={row}
          chartGroupKeys={chartGroupKeys}
          colorMap={colorMap}
          globalMax={globalMax}
          mode={mode}
          focusedInd={focusedInd}
          onClickBar={() => onSelectStage(column.execution_column_key)}
          onClickSegment={(segKey) =>
            onSelectSegment(column.execution_column_key, segKey)
          }
        />
      ) : (
        <div style={{ height: BAR_H, flexShrink: 0 }} />
      )}

      {/* Stage header */}
      <div
        style={{
          padding: "6px 9px 5px",
          borderTop: `1px solid ${isFocused ? CP.border : isClosed ? "rgba(255,255,255,0.04)" : CP.borderDim}`,
          borderBottom: `1px solid ${isClosed ? "rgba(255,255,255,0.04)" : CP.borderDim}`,
          background: isClosed ? "rgba(255,255,255,0.015)" : CP.surfaceAlt,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: isClosed
                ? CP.muted
                : isFocused
                  ? CP.accent
                  : CP.textDim,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {column.execution_column_label}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: isClosed
                ? CP.muted
                : isFocused
                  ? CP.accent
                  : CP.text,
              flexShrink: 0,
            }}
          >
            {column.cards.length}
          </span>
        </div>
        {!isClosed && row ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <MomentumArrow momentum={row._momentum} />
            {row._healthLabel ? (
              <span
                style={{
                  fontSize: 8,
                  color: CP.muted,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row._healthLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Card drop zone — flex:1 fills remaining column height; overflow-y scrolls tall columns */}
      <div
        style={{
          padding: "5px 5px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        {column.cards.length === 0 ? (
          <div
            style={{
              height: 36,
              border: `1px dashed ${CP.borderDim}`,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 9, color: CP.muted }}>—</span>
          </div>
        ) : (
          column.cards.map((card) => (
            <LaneCardItem
              key={card.crm_opportunity_id}
              card={card}
              onSelect={onSelectCard}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "3px 8px 5px",
          borderTop: `1px solid ${CP.borderDim}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 9, color: CP.muted, letterSpacing: "0.04em" }}
        >
          {fmtCurrency(column.weighted_value)} wt · {fmtCurrency(column.total_value)}
        </span>
      </div>
    </div>
  );
}

// ─── LaneBar ─────────────────────────────────────────────────────────────────
type LaneBarProps = {
  row: StageRow;
  chartGroupKeys: string[];
  colorMap: Record<string, string>;
  globalMax: number;
  mode: LaneMode;
  focusedInd: string | null;
  onClickBar: () => void;
  onClickSegment: (segKey: string) => void;
};

function LaneBar({
  row,
  chartGroupKeys,
  colorMap,
  globalMax,
  mode,
  focusedInd,
  onClickBar,
  onClickSegment,
}: LaneBarProps) {
  const barAreaH = BAR_H - BAR_HEADROOM;

  // For value mode, rowTotal is sum of dollar amounts; for count, it's _total
  const rowTotal =
    mode === "count"
      ? row._total
      : chartGroupKeys.reduce((s, key) => s + (Number(row[key]) || 0), 0);

  const drawnH =
    rowTotal > 0
      ? Math.max(4, (rowTotal / globalMax) * (barAreaH - BAR_BASELINE))
      : 0;

  // Build segments bottom-to-top, 1px inter-segment gap
  let accumH = 0;
  const SEG_GAP = 1; // px gap between stacked segments
  const segments: Array<{
    ind: string;
    bottom: number;
    h: number;
    color: string;
    isTop: boolean;
  }> = [];
  const activeInds = chartGroupKeys.filter(
    (ind) => (Number(row[ind]) || 0) > 0 && drawnH > 0,
  );
  activeInds.forEach((ind, i) => {
    const val = Number(row[ind]) || 0;
    const h = (val / rowTotal) * drawnH;
    if (h < 1) return;
    segments.push({
      ind,
      bottom: BAR_BASELINE + accumH,
      h: Math.max(2, h - (i > 0 ? SEG_GAP : 0)),
      color: colorMap[ind],
      isTop: i === activeInds.length - 1,
    });
    accumH += h;
  });

  // Grid guide heights (25%, 50%, 75% of drawable area)
  const maxDrawH = barAreaH - BAR_BASELINE;
  const gridLines = [0.25, 0.5, 0.75].map((f) => BAR_BASELINE + maxDrawH * f);

  return (
    <div
      style={{ height: BAR_H, position: "relative", cursor: "pointer" }}
      onClick={onClickBar}
    >
      {/* Faint grid guides */}
      {gridLines.map((gBottom) => (
        <div
          key={gBottom}
          style={{
            position: "absolute",
            bottom: gBottom,
            left: "4%",
            right: "4%",
            height: 1,
            background: "rgba(255,255,255,0.035)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Baseline rule */}
      <div
        style={{
          position: "absolute",
          bottom: BAR_BASELINE - 1,
          left: "4%",
          right: "4%",
          height: 1,
          background: row._total > 0
            ? "rgba(245,185,66,0.25)"
            : CP.borderDim,
          pointerEvents: "none",
        }}
      />

      {/* Health label */}
      {row._healthLabel && row._total > 0 ? (
        <div
          style={{
            position: "absolute",
            top: 5,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: CP.muted,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {row._healthLabel}
        </div>
      ) : null}

      {/* Signal dots */}
      <SignalDots row={row} />

      {/* Stacked segments */}
      {segments.map((seg) => (
        <div
          key={seg.ind}
          style={{
            position: "absolute",
            bottom: seg.bottom,
            left: "4%",
            right: "4%",
            height: seg.h,
            background: seg.color,
            borderRadius: seg.isTop ? "2px 2px 0 0" : 0,
            opacity: focusedInd
              ? focusedInd === seg.ind
                ? 1
                : 0.1
              : 0.88,
            transition: "opacity 0.15s",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClickSegment(seg.ind);
          }}
        />
      ))}

      {/* Zero-deal rule */}
      {row._total === 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: BAR_BASELINE,
            left: "15%",
            right: "15%",
            height: 1,
            background: CP.borderDim,
            borderRadius: 1,
          }}
        />
      ) : null}
    </div>
  );
}

// ─── SignalDots ───────────────────────────────────────────────────────────────
function SignalDots({ row }: { row: StageRow }) {
  if (!row._total) return null;
  const dots = (
    [
      row._noAction > 0 && {
        color: CP.critical,
        title: `${row._noAction} no-action`,
      },
      row._stale > 0 && {
        color: CP.warning,
        title: `${row._stale} stale`,
      },
      row._hot > 0 && { color: CP.won, title: `${row._hot} hot` },
    ] as Array<{ color: string; title: string } | false>
  ).filter((d): d is { color: string; title: string } => !!d);

  if (!dots.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: BAR_HEADROOM,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 3,
        pointerEvents: "none",
      }}
    >
      {dots.map((d) => (
        <div
          key={d.color}
          title={d.title}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: d.color,
            opacity: 0.72,
          }}
        />
      ))}
    </div>
  );
}

// ─── MomentumArrow ────────────────────────────────────────────────────────────
function MomentumArrow({
  momentum,
}: {
  momentum: "up" | "flat" | "down" | undefined;
}) {
  if (momentum === "up")
    return (
      <span style={{ fontSize: 10, color: CP.won, lineHeight: 1 }}>↑</span>
    );
  if (momentum === "down")
    return (
      <span style={{ fontSize: 10, color: CP.critical, lineHeight: 1 }}>
        ↓
      </span>
    );
  return (
    <span style={{ fontSize: 10, color: CP.muted, lineHeight: 1 }}>→</span>
  );
}

// ─── LaneCardItem ─────────────────────────────────────────────────────────────
function LaneCardItem({
  card,
  onSelect,
}: {
  card: ExecutionCard;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: card.crm_opportunity_id,
      data: { card },
    });

  const transformStyle: React.CSSProperties = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.35 : 1,
      }
    : {};

  const hasNoAction = !card.next_action_description;
  const overdue = isOverdue(card.next_action_due);
  const pressure = card.execution_pressure;

  const leftAccent = hasNoAction
    ? CP.critical
    : pressure === "critical"
      ? CP.critical
      : pressure === "high"
        ? CP.warning
        : CP.borderDim;

  return (
    <div
      ref={setNodeRef}
      style={{ ...transformStyle, touchAction: "none" }}
      {...listeners}
      {...attributes}
    >
      <div
        onClick={(e) => {
          if (isDragging) return;
          e.stopPropagation();
          onSelect(card.crm_opportunity_id);
        }}
        style={{
          borderLeft: `2px solid ${leftAccent}`,
          borderTop: `1px solid ${CP.borderDim}`,
          borderRight: `1px solid ${CP.borderDim}`,
          borderBottom: `1px solid ${CP.borderDim}`,
          borderRadius: "0 3px 3px 0",
          background: CP.surfaceAlt,
          padding: "6px 8px 5px",
          cursor: "grab",
          userSelect: "none",
        }}
      >
        {/* Row 1: Company + Value */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: CP.text,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {card.account_name || "—"}
          </p>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: CP.accent,
              flexShrink: 0,
              letterSpacing: "0.01em",
            }}
          >
            {fmtCurrency(card.amount)}
          </span>
        </div>

        {/* Row 2: Deal type (if different from account) */}
        {card.name && card.name !== card.account_name ? (
          <p
            style={{
              fontSize: 9,
              color: CP.muted,
              margin: "1px 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.name}
          </p>
        ) : null}

        {/* Row 3: Next action */}
        <div style={{ marginTop: 3 }}>
          {hasNoAction ? (
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: CP.critical,
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              ! NO ACTION DEFINED
            </p>
          ) : card.next_action_description ? (
            <p
              style={{
                fontSize: 9,
                color: CP.textDim,
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: CP.muted, marginRight: 3 }}>▸</span>
              {card.next_action_description}
            </p>
          ) : null}
        </div>

        {/* Row 4: Meta */}
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}
        >
          <span style={{ fontSize: 8, color: CP.muted, letterSpacing: "0.03em" }}>
            {relativeTime(card.last_activity_at)}
          </span>
          {overdue ? (
            <span
              style={{
                fontSize: 8,
                color: CP.warning,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: "rgba(245,158,11,0.12)",
                padding: "1px 4px",
                borderRadius: 2,
              }}
            >
              OVERDUE
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── LaneCardOverlay ──────────────────────────────────────────────────────────
export function LaneCardOverlay({ card }: { card: ExecutionCard }) {
  return (
    <div style={{ width: LANE_W - 12 }}>
      <div
        style={{
          borderLeft: `2px solid ${CP.accent}`,
          border: `1px solid ${CP.accent}`,
          borderRadius: 3,
          background: CP.surfaceAlt,
          padding: "5px 7px",
          boxShadow: `0 8px 32px rgba(245,185,66,0.18), 0 2px 8px rgba(0,0,0,0.5)`,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: CP.text,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.account_name || "—"}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 1,
          }}
        >
          <p
            style={{
              fontSize: 9,
              color: CP.muted,
              margin: 0,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginRight: 4,
            }}
          >
            {card.name}
          </p>
          <span style={{ fontSize: 9, fontWeight: 600, color: CP.text }}>
            {fmtCurrency(card.amount)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── BoardViewToggle ──────────────────────────────────────────────────────────
export function BoardViewToggle({
  mode,
  onChange,
}: {
  mode: BoardViewMode;
  onChange: (m: BoardViewMode) => void;
}) {
  const options: { key: BoardViewMode; label: string }[] = [
    { key: "groups", label: "GROUPS" },
    { key: "stages", label: "STAGES" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 4,
        padding: 2,
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            padding: "3px 10px",
            borderRadius: 3,
            border: "none",
            cursor: "pointer",
            background: mode === o.key ? "rgba(245,185,66,0.15)" : "transparent",
            color: mode === o.key ? CP.accent : CP.muted,
            transition: "all 0.15s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── GroupedBoardView ─────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  target_identified: "#22D3EE",
  researched: "#38BDF8",
  outreach: "#0EA5E9",
  engaged: "#F5B942",
  discovery_scheduled: "#F59E0B",
  demo_completed: "#F97316",
  proposal: "#34D399",
};

type GroupedBoardViewProps = {
  columns: ExecutionBoardColumn[];
  chartData: StageRow[];
  chartGroupKeys: string[];
  chartColorMap: Record<string, string>;
  colorMode: ColorMode;
  focusedSegKey: string | null;
  focusedStage: string | null;
  mode: LaneMode;
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSelectStage: (key: string) => void;
  onSelectSegment: (key: string, segKey: string) => void;
  onSelectCard: (id: string) => void;
  makeColumnRef: (key: string) => (el: HTMLDivElement | null) => void;
  // DnD props — only active when a group is expanded
  dndSensors: ReturnType<typeof useSensors>;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  activeCard: ExecutionCard | null;
};

export function GroupedBoardView({
  columns,
  chartData,
  chartGroupKeys,
  chartColorMap,
  colorMode,
  focusedSegKey,
  focusedStage,
  mode,
  expandedGroups,
  onToggleGroup,
  onExpandAll,
  onCollapseAll,
  onSelectStage,
  onSelectSegment,
  onSelectCard,
  makeColumnRef,
  dndSensors,
  onDragStart,
  onDragEnd,
  activeCard,
}: GroupedBoardViewProps) {
  const colorMap = useMemo(() => {
    if (colorMode === "vertical") return chartColorMap;
    const m: Record<string, string> = {};
    chartGroupKeys.forEach((ind, i) => { m[ind] = indColor(ind, i); });
    return m;
  }, [colorMode, chartGroupKeys, chartColorMap]);

  const globalMax = useMemo(() => {
    return Math.max(
      ...chartData.map((r) => {
        if (mode === "count") return r._total;
        return chartGroupKeys.reduce((s, key) => s + (Number(r[key]) || 0), 0);
      }),
      1,
    );
  }, [chartData, chartGroupKeys, mode]);

  const rowByKey = useMemo(() => {
    const m: Record<string, StageRow> = {};
    chartData.forEach((r) => { m[r.stage_key] = r; });
    return m;
  }, [chartData]);

  const colByKey = useMemo(() => {
    const m: Record<string, ExecutionBoardColumn> = {};
    columns.forEach((c) => { m[c.execution_column_key] = c; });
    return m;
  }, [columns]);

  const handleGroupClick = useCallback((groupKey: string) => {
    // Each group toggles independently — multiple groups can be open simultaneously.
    onToggleGroup(groupKey);
  }, [onToggleGroup]);

  const allExpanded = expandedGroups.size === PIPELINE_GROUPS.length;
  const noneExpanded = expandedGroups.size === 0;

  return (
    <div style={{ background: CP.surface, flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {/* Expand-all / Collapse-all controls — independent of column flex so they don't shift the board */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flex: "none",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "rgba(220,230,240,0.42)",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          Groups
        </span>
        <button
          type="button"
          onClick={onExpandAll}
          disabled={allExpanded}
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 3,
            border: `1px solid rgba(255,255,255,${allExpanded ? "0.06" : "0.12"})`,
            background: "transparent",
            color: allExpanded ? "rgba(220,230,240,0.30)" : "rgba(220,230,240,0.72)",
            cursor: allExpanded ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          disabled={noneExpanded}
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 3,
            border: `1px solid rgba(255,255,255,${noneExpanded ? "0.06" : "0.12"})`,
            background: "transparent",
            color: noneExpanded ? "rgba(220,230,240,0.30)" : "rgba(220,230,240,0.72)",
            cursor: noneExpanded ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          }}
        >
          Collapse all
        </button>
      </div>
      <div style={{ flex: "1 1 auto", overflowX: "auto", overflowY: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            flex: "1 1 auto",
            gap: 8,
            padding: "14px 14px 14px",
            minWidth: "max-content",
            minHeight: "100%",
            alignItems: "stretch",
          }}
        >
          {PIPELINE_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const groupCols = group.stageKeys
              .map((k) => colByKey[k])
              .filter(Boolean) as ExecutionBoardColumn[];
            const allCards = groupCols.flatMap((c) => c.cards);
            const totalCount = allCards.length;
            const totalValue = allCards.reduce((s, c) => s + (c.amount || 0), 0);
            const noActionCount = allCards.filter((c) => !c.next_action_description).length;
            const overdueCount = allCards.filter((c) => isOverdue(c.next_action_due)).length;
            const miniBarTotal = totalCount || 1;

            if (isExpanded) {
              const childCols = (
                <div style={{ display: "flex", gap: LANE_GAP, alignItems: "stretch" }}>
                  {groupCols.map((col) => {
                    const row = rowByKey[col.execution_column_key] ?? null;
                    return (
                      <LaneColumn
                        key={col.execution_column_key}
                        column={col}
                        row={row}
                        isClosed={false}
                        isDimmed={false}
                        chartGroupKeys={chartGroupKeys}
                        colorMap={colorMap}
                        globalMax={globalMax}
                        mode={mode}
                        isFocused={focusedStage === col.execution_column_key}
                        focusedSegKey={focusedSegKey}
                        onSelectStage={onSelectStage}
                        onSelectSegment={onSelectSegment}
                        onSelectCard={onSelectCard}
                        columnRef={makeColumnRef(col.execution_column_key)}
                      />
                    );
                  })}
                </div>
              );

              return (
                <div
                  key={group.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minWidth: 0,
                    alignSelf: "stretch",
                  }}
                >
                  {/* Expanded group header — glow border signals active state */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      background: group.dimColor,
                      border: `1px solid ${group.color}66`,
                      borderRadius: 4,
                      cursor: "pointer",
                      boxShadow: `0 0 0 1px ${group.color}22, 0 2px 12px ${group.color}18`,
                    }}
                    onClick={() => handleGroupClick(group.key)}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: group.color,
                      }}
                    >
                      {group.label}
                    </span>
                    <span style={{ fontSize: 9, color: CP.textDim }}>
                      {totalCount} deal{totalCount !== 1 ? "s" : ""} · {fmtCurrency(totalValue)}
                    </span>
                    {noActionCount > 0 ? (
                      <span style={{ fontSize: 9, fontWeight: 700, color: CP.critical }}>
                        ⚠ {noActionCount} no action
                      </span>
                    ) : null}
                    {overdueCount > 0 ? (
                      <span style={{ fontSize: 9, fontWeight: 700, color: CP.warning }}>
                        ⏳ {overdueCount} overdue
                      </span>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: CP.muted, letterSpacing: "0.06em" }}>▲ collapse</span>
                  </div>
                  {/* Child stage columns wrapped in DndContext for drag support */}
                  <DndContext sensors={dndSensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                    {childCols}
                    <DragOverlay>
                      {activeCard ? <LaneCardOverlay card={activeCard} /> : null}
                    </DragOverlay>
                  </DndContext>
                </div>
              );
            }

            // Collapsed group column
            return (
              <div
                key={group.key}
                style={{
                  width: 240,
                  minWidth: 240,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  border: `1px solid ${group.color}22`,
                  borderRadius: 4,
                  background: CP.surfaceAlt,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  alignSelf: "stretch",
                }}
                onClick={() => handleGroupClick(group.key)}
              >
                {/* Group header */}
                <div
                  style={{
                    padding: "10px 12px 8px",
                    background: group.dimColor,
                    borderBottom: `1px solid ${group.color}22`,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.13em",
                        textTransform: "uppercase",
                        color: group.color,
                      }}
                    >
                      {group.label}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: CP.text, flexShrink: 0 }}>
                      {totalCount}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 9, color: CP.muted, letterSpacing: "0.04em" }}>
                    {group.description}
                  </p>
                  {/* Alert row — dominates when counts are non-zero */}
                  {(noActionCount > 0 || overdueCount > 0) ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                      {noActionCount > 0 ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: CP.critical, letterSpacing: "0.03em" }}>
                          ⚠ {noActionCount} no action
                        </span>
                      ) : null}
                      {overdueCount > 0 ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: CP.warning, letterSpacing: "0.03em" }}>
                          ⏳ {overdueCount} overdue
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Value row */}
                <div
                  style={{
                    padding: "5px 12px 6px",
                    borderBottom: `1px solid rgba(255,255,255,0.05)`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 7, color: CP.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>PIPELINE VALUE</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: CP.accent }}>{fmtCurrency(totalValue)}</div>
                </div>

                {/* Mini stacked stage bar */}
                {totalCount > 0 ? (
                  <div style={{ height: 4, display: "flex", overflow: "hidden", flexShrink: 0 }}>
                    {groupCols.map((col) => {
                      const pct = col.cards.length / miniBarTotal;
                      return (
                        <div
                          key={col.execution_column_key}
                          title={`${col.execution_column_label}: ${col.cards.length}`}
                          style={{
                            flex: pct,
                            background: STAGE_COLORS[col.execution_column_key] ?? CP.muted,
                            minWidth: col.cards.length > 0 ? 2 : 0,
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {/* Top 5 deal cards */}
                <div
                  style={{
                    overflowY: "auto",
                    padding: "6px 6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {allCards.length === 0 ? (
                    <div
                      style={{
                        height: 36,
                        border: `1px dashed ${CP.borderDim}`,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ fontSize: 9, color: CP.muted }}>No deals in this zone</span>
                    </div>
                  ) : (
                    [...allCards]
                      .sort((a, b) => {
                        // No-action deals float to top
                        const aNoAction = !a.next_action_description ? 0 : 1;
                        const bNoAction = !b.next_action_description ? 0 : 1;
                        if (aNoAction !== bNoAction) return aNoAction - bNoAction;
                        return (b.amount || 0) - (a.amount || 0);
                      })
                      .slice(0, 5)
                      .map((card) => (
                        <div
                          key={card.crm_opportunity_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCard(card.crm_opportunity_id);
                          }}
                          style={{
                            borderLeft: `2px solid ${!card.next_action_description ? CP.critical : group.color}`,
                            borderTop: `1px solid ${CP.borderDim}`,
                            borderRight: `1px solid ${CP.borderDim}`,
                            borderBottom: `1px solid ${CP.borderDim}`,
                            borderRadius: "0 3px 3px 0",
                            background: CP.surface,
                            padding: "5px 8px 4px",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
                            <p
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: CP.text,
                                margin: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                            >
                              {card.account_name || "—"}
                            </p>
                            <span style={{ fontSize: 10, fontWeight: 700, color: CP.accent, flexShrink: 0 }}>
                              {fmtCurrency(card.amount)}
                            </span>
                          </div>
                          {!card.next_action_description ? (
                            <p style={{ fontSize: 8, fontWeight: 700, color: CP.critical, margin: "2px 0 0", letterSpacing: "0.04em" }}>
                              ! NO ACTION
                            </p>
                          ) : (
                            <p style={{ fontSize: 8, color: CP.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              ▸ {card.next_action_description}
                            </p>
                          )}
                        </div>
                      ))
                  )}
                  {allCards.length > 5 ? (
                    <p style={{ fontSize: 8, color: CP.muted, textAlign: "center", margin: "4px 0 0", letterSpacing: "0.06em" }}>
                      +{allCards.length - 5} more — expand to see all
                    </p>
                  ) : null}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: "4px 10px 6px",
                    borderTop: `1px solid rgba(255,255,255,0.05)`,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 8, color: CP.muted, letterSpacing: "0.06em" }}>
                    {group.stageKeys.join(" → ")}
                  </span>
                  <span style={{ fontSize: 8, color: group.color, letterSpacing: "0.06em" }}>expand ▾</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
