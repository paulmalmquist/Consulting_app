"use client";

import { useMemo, useCallback, useRef } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import type { ExecutionBoardColumn, ExecutionCard } from "@/lib/cro-api";
import type { StageRow, Insight } from "./pipeline-insight";
import type { ActiveSlice } from "./PipelineActionPanel";

// ─── Constants ────────────────────────────────────────────────────────────────
const LANE_W = 206;      // px — active column width (chart + kanban share this)
const CLOSED_W = 156;    // px — closed-stage columns are narrower / terminal
const LANE_GAP = 2;      // px — gap between columns
const BAR_H = 180;       // px — total bar area height per lane
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
  onInsightAction: () => void;
  onToggleMode: () => void;
  onClearFilters: () => void;
};

export function PipelineCommandBand({
  insight,
  industries,
  selectedIndustries,
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
  onInsightAction,
  onToggleMode,
  onClearFilters,
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
        padding: "14px 20px 12px",
      }}
    >
      {/* Title + controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: CP.accent,
            }}
          >
            NOVENDOR PIPELINE
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: CP.muted,
            }}
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
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 28px",
          marginBottom: 12,
          paddingBottom: 12,
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
          marginBottom: industries.length > 1 ? 12 : 0,
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

      {/* Industry chips */}
      {industries.length > 1 ? (
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
      ) : null}
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
  industries: string[];
  selectedIndustries: Set<string>;
  focusedStage: string | null;
  activeSlice: ActiveSlice | null;
  mode: LaneMode;
  onSelectStage: (key: string) => void;
  onSelectSegment: (key: string, ind: string) => void;
  onSelectCard: (id: string) => void;
  makeColumnRef: (key: string) => (el: HTMLDivElement | null) => void;
};

const CLOSED = new Set(["closed_won", "closed_lost"]);

export default function PipelineLaneView({
  columns,
  chartData,
  industries,
  selectedIndustries,
  focusedStage,
  activeSlice,
  mode,
  onSelectStage,
  onSelectSegment,
  onSelectCard,
  makeColumnRef,
}: PipelineLaneViewProps) {
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    industries.forEach((ind, i) => {
      m[ind] = indColor(ind, i);
    });
    return m;
  }, [industries]);

  // globalMax adjusts for count vs. value mode so bars scale correctly
  const globalMax = useMemo(() => {
    return Math.max(
      ...chartData.map((r) => {
        if (mode === "count") return r._total;
        return industries.reduce((s, ind) => s + (Number(r[ind]) || 0), 0);
      }),
      1,
    );
  }, [chartData, industries, mode]);

  const rowByKey = useMemo(() => {
    const m: Record<string, StageRow> = {};
    chartData.forEach((r) => {
      m[r.stage_key] = r;
    });
    return m;
  }, [chartData]);

  return (
    <div style={{ background: CP.surface, flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
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
                industries={industries}
                colorMap={colorMap}
                mode={mode}
                isFocused={isFocused}
                isDimmed={isDimmed}
                activeSlice={activeSlice}
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
  industries: string[];
  colorMap: Record<string, string>;
  mode: LaneMode;
  isFocused: boolean;
  isDimmed: boolean;
  activeSlice: ActiveSlice | null;
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
  industries,
  colorMap,
  mode,
  isFocused,
  isDimmed,
  activeSlice,
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

  const focusedInd =
    isFocused && activeSlice?.industry ? activeSlice.industry : null;

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
          industries={industries}
          colorMap={colorMap}
          globalMax={globalMax}
          mode={mode}
          focusedInd={focusedInd}
          onClickBar={() => onSelectStage(column.execution_column_key)}
          onClickSegment={(ind) =>
            onSelectSegment(column.execution_column_key, ind)
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
  industries: string[];
  colorMap: Record<string, string>;
  globalMax: number;
  mode: LaneMode;
  focusedInd: string | null;
  onClickBar: () => void;
  onClickSegment: (ind: string) => void;
};

function LaneBar({
  row,
  industries,
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
      : industries.reduce((s, ind) => s + (Number(row[ind]) || 0), 0);

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
  const activeInds = industries.filter(
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
