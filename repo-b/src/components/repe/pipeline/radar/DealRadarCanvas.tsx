"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BrainCircuit, CircleAlert, Layers3 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DealRadarLayoutNode, DealRadarMode, DealRadarNode, DealRadarSector, DealRadarStage } from "./types";
import {
  buildRadarCenterSummary,
  computeRadarLayout,
  DISPLAY_RING_LABELS,
  DISPLAY_RING_ORDER,
  type DisplayRing,
  formatMoney,
  formatMultiple,
  formatPercent,
  formatRelativeDate,
  getSignalColor,
  getSignalHex,
  RADAR_SECTOR_LABELS,
  RADAR_STAGE_LABELS,
  SIGNAL_AMBER,
  SIGNAL_BLUE,
  SIGNAL_RED,
  stageToDisplayRing,
} from "./utils";

type DealRadarCanvasProps = {
  envId: string;
  mode: DealRadarMode;
  nodes: DealRadarNode[];
  selectedDealId?: string | null;
  onSelectDeal: (dealId: string | null) => void;
  onAskWinston: (node: DealRadarNode) => void;
  compact?: boolean;
};

const VIEWBOX = 1000;
const CENTER = 500;
const OUTER_RADIUS = 452;
const CORE_RADIUS = 120;
const NUM_SECTORS = 8;
const NUM_RINGS = 4;
const WEDGE_ANGLE = 360 / NUM_SECTORS;
const BAND = (OUTER_RADIUS - CORE_RADIUS) / NUM_RINGS;

function polarToCartesian(angleDeg: number, radius: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius,
  };
}

function describeSectorPath(startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) {
  const startOuter = polarToCartesian(startAngle, outerRadius);
  const endOuter = polarToCartesian(endAngle, outerRadius);
  const startInner = polarToCartesian(endAngle, innerRadius);
  const endInner = polarToCartesian(startAngle, innerRadius);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function describeSectorLabelPosition(sectorIndex: number) {
  const angle = -90 + sectorIndex * WEDGE_ANGLE;
  return polarToCartesian(angle, OUTER_RADIUS + 30);
}

/** Reference spoke angle for ring labels — between last and first sector. */
const RING_LABEL_ANGLE = -112.5;

function HoverCard({
  layoutNode,
  envId,
  onAskWinston,
  onKeepOpen,
  onClose,
}: {
  layoutNode: DealRadarLayoutNode;
  envId: string;
  onAskWinston: (node: DealRadarNode) => void;
  onKeepOpen: () => void;
  onClose: () => void;
}) {
  const style = {
    left: `clamp(0.75rem, calc(${(layoutNode.x / VIEWBOX) * 100}% + 0.75rem), calc(100% - 20rem))`,
    top: `clamp(0.75rem, calc(${(layoutNode.y / VIEWBOX) * 100}% - 1rem), calc(100% - 18rem))`,
  };

  if (layoutNode.kind === "cluster") {
    return (
      <div
        className="absolute z-20 w-80 rounded-xl border border-bm-border/60 bg-bm-surface/95 p-4 shadow-[0_24px_45px_-28px_rgba(0,0,0,0.92)] backdrop-blur"
        style={style}
        onMouseEnter={onKeepOpen}
        onMouseLeave={onClose}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Clustered Deals
        </p>
        <p className="mt-2 text-base font-semibold text-bm-text">
          {layoutNode.clusterCount} more {RADAR_SECTOR_LABELS[layoutNode.sector]} deals
        </p>
        <div className="mt-3 space-y-2">
          {(layoutNode.clusterDeals || []).slice(0, 4).map((deal) => (
            <div key={deal.dealId} className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
              <p className="text-sm font-medium text-bm-text">{deal.dealName}</p>
              <p className="mt-1 text-xs text-bm-muted">{deal.locationLabel}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const node = layoutNode.deal!;
  return (
    <div
      className="absolute z-20 w-80 rounded-xl border border-bm-border/60 bg-bm-surface/95 p-4 shadow-[0_24px_45px_-28px_rgba(0,0,0,0.92)] backdrop-blur"
      style={style}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onClose}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mt-1 text-base font-semibold text-bm-text">{node.dealName}</p>
          <p className="mt-1 text-xs text-bm-muted">{node.locationLabel}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-bm-border/50 bg-bm-bg/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
          {RADAR_STAGE_LABELS[node.stage]}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Sector</p>
          <p className="mt-1 text-sm text-bm-text">{RADAR_SECTOR_LABELS[node.sector]}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Stage</p>
          <p className="mt-1 text-sm text-bm-text">{RADAR_STAGE_LABELS[node.stage]}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Market</p>
          <p className="mt-1 text-sm text-bm-text">{node.locationLabel}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Est. Size</p>
          <p className="mt-1 text-sm text-bm-text">{formatMoney(node.headlinePrice)}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Probability</p>
          <p className="mt-1 text-sm text-bm-text">{node.readinessScore}%</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Lead Partner</p>
          <p className="mt-1 text-sm text-bm-text">{node.sponsorName || node.brokerName || "—"}</p>
        </div>
      </div>

      {node.alerts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {node.alerts.slice(0, 3).map((alert) => (
            <span
              key={alert}
              className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-bg/65 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted"
            >
              <CircleAlert className="h-3 w-3" />
              {alert.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {node.blockers.length > 0 && (
        <div className="mt-3 rounded-lg border border-bm-warning/30 bg-bm-warning/10 px-3 py-2 text-xs text-bm-text">
          {node.blockers[0]}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/lab/env/${envId}/re/pipeline/${node.dealId}`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-bm-border/70 px-3 text-xs text-bm-text transition-colors hover:bg-bm-bg/70"
        >
          View Deal
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`/lab/env/${envId}/re/models?fromDeal=${node.dealId}`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-bm-border/70 px-3 text-xs text-bm-text transition-colors hover:bg-bm-bg/70"
        >
          Open Model
          <Layers3 className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => onAskWinston(node)}
          className="inline-flex h-9 items-center gap-1 rounded-md bg-bm-accent px-3 text-xs font-medium text-bm-accentContrast transition-opacity hover:opacity-90"
        >
          Ask Winston
          <BrainCircuit className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function DealRadarCanvas({
  envId,
  mode,
  nodes,
  selectedDealId,
  onSelectDeal,
  onAskWinston,
  compact = false,
}: DealRadarCanvasProps) {
  const [hoveredNode, setHoveredNode] = useState<DealRadarLayoutNode | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const layoutNodes = useMemo(() => computeRadarLayout(nodes, mode, compact), [nodes, mode, compact]);
  const centerSummary = useMemo(() => buildRadarCenterSummary(nodes), [nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHoveredNode(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const delayedClose = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setHoveredNode(null), 90);
  };

  const keepHoverOpen = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
  };

  if (!nodes.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-bm-border/40 bg-bm-surface/35">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Deal Radar</p>
          <p className="mt-3 text-lg font-semibold text-bm-text">No deals match the current filters.</p>
          <p className="mt-2 text-sm text-bm-muted">Broaden the pipeline filters or switch to list view for archived deals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bm-command-module relative aspect-square overflow-hidden rounded-2xl border border-bm-border/50 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.04),_transparent_34%),linear-gradient(180deg,rgba(10,13,20,0.99),rgba(7,9,14,0.99))]">
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* ── Sector wedges with alternating contrast ── */}
        {Array.from({ length: NUM_SECTORS }).map((_, sectorIndex) => {
          const startAngle = -90 - WEDGE_ANGLE / 2 + sectorIndex * WEDGE_ANGLE;
          const endAngle = startAngle + WEDGE_ANGLE;
          const opacity = sectorIndex % 2 === 0 ? 0.06 : 0.10;
          return (
            <path
              key={`sector-${sectorIndex}`}
              d={describeSectorPath(startAngle + 0.8, endAngle - 0.8, CORE_RADIUS + 4, OUTER_RADIUS)}
              fill={`rgba(118, 134, 160, ${opacity})`}
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="1"
            />
          );
        })}

        {/* ── 4 ring boundaries ── */}
        {Array.from({ length: NUM_RINGS + 1 }).map((_, index) => {
          const radius = OUTER_RADIUS - index * BAND;
          const isCore = index === NUM_RINGS;
          return (
            <circle
              key={`ring-${index}`}
              cx={CENTER}
              cy={CENTER}
              r={radius}
              fill="none"
              stroke={isCore ? "rgba(125, 193, 153, 0.20)" : "rgba(255,255,255,0.07)"}
              strokeDasharray={isCore ? undefined : "3 8"}
              strokeWidth={isCore ? 1.6 : 0.8}
            />
          );
        })}

        {/* ── Sector spokes ── */}
        {Array.from({ length: NUM_SECTORS }).map((_, sectorIndex) => {
          const angle = -90 - WEDGE_ANGLE / 2 + sectorIndex * WEDGE_ANGLE;
          const start = polarToCartesian(angle, CORE_RADIUS + 4);
          const end = polarToCartesian(angle, OUTER_RADIUS);
          return (
            <line
              key={`spoke-${sectorIndex}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}

        {/* ── Ring labels (4 display rings) ── */}
        {DISPLAY_RING_ORDER.map((ring, index) => {
          const radius = OUTER_RADIUS - index * BAND - BAND / 2;
          const pt = polarToCartesian(RING_LABEL_ANGLE, radius);
          const abbr: Record<DisplayRing, string> = {
            sourced: "SRC",
            underwriting: "UW",
            ic: "IC",
            execution: "EXEC",
          };
          return (
            <g key={`ring-label-${ring}`} transform={`translate(${pt.x}, ${pt.y})`}>
              <rect
                x="-20"
                y="-9"
                width="40"
                height="18"
                rx="9"
                fill="rgba(7,10,16,0.78)"
                stroke="rgba(255,255,255,0.06)"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                style={{ fontSize: "8.5px", letterSpacing: "0.14em" }}
                className="fill-bm-muted2 font-mono uppercase"
                opacity={0.6}
              >
                {abbr[ring]}
              </text>
            </g>
          );
        })}

        {/* ── Sector labels outside the circle (bold) ── */}
        {Object.entries(RADAR_SECTOR_LABELS).map(([sector, label], index) => {
          const point = describeSectorLabelPosition(index);
          return (
            <text
              key={sector}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              className="fill-bm-text font-mono uppercase"
              style={{ fontSize: "11px", letterSpacing: "0.16em", fontWeight: 600 }}
            >
              {label}
            </text>
          );
        })}

        {/* ── Center summary panel ── */}
        <circle cx={CENTER} cy={CENTER} r={CORE_RADIUS - 2} fill="rgba(10, 13, 20, 0.92)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <text x={CENTER} y={CENTER - 38} textAnchor="middle" className="fill-bm-muted2 font-mono uppercase" style={{ fontSize: "9px", letterSpacing: "0.18em" }}>
          PIPELINE
        </text>
        <text x={CENTER} y={CENTER - 16} textAnchor="middle" className="fill-bm-text" style={{ fontSize: "20px", fontWeight: 700 }}>
          {centerSummary.dealCount} Deals
        </text>
        <text x={CENTER} y={CENTER + 4} textAnchor="middle" className="fill-bm-muted" style={{ fontSize: "12px" }}>
          {centerSummary.totalValue} Total
        </text>
        <line x1={CENTER - 36} y1={CENTER + 16} x2={CENTER + 36} y2={CENTER + 16} stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
        <text x={CENTER} y={CENTER + 32} textAnchor="middle" className="fill-bm-muted2" style={{ fontSize: "10px" }}>
          Exec Ready: {centerSummary.executionReady}
        </text>
        <text x={CENTER} y={CENTER + 46} textAnchor="middle" className="fill-bm-muted2" style={{ fontSize: "10px" }}>
          Underwriting: {centerSummary.underwriting}
        </text>
      </svg>

      {/* ── Deal markers (circles only, sized by deal value) ── */}
      <div className="absolute inset-0">
        {layoutNodes.map((layoutNode) => {
          const node = layoutNode.deal;
          const selected = layoutNode.kind === "deal" && node?.dealId === selectedDealId;
          const signal = layoutNode.kind === "deal" && node ? getSignalColor(node) : "blue";
          const color = getSignalHex(signal);
          const buttonLabel = layoutNode.kind === "deal" && node
            ? `${node.dealName}, ${RADAR_SECTOR_LABELS[node.sector]}, ${RADAR_STAGE_LABELS[node.stage]}, ${node.locationLabel}, ${formatMoney(node.headlinePrice)}`
            : `${layoutNode.clusterCount} more ${RADAR_SECTOR_LABELS[layoutNode.sector]} deals`;

          return (
            <button
              key={layoutNode.key}
              type="button"
              aria-label={buttonLabel}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-[transform,box-shadow,background-color] duration-fast",
                "focus-visible:z-20 focus-visible:scale-[1.08]",
              )}
              style={{
                left: `${(layoutNode.x / VIEWBOX) * 100}%`,
                top: `${(layoutNode.y / VIEWBOX) * 100}%`,
                width: `clamp(14px, ${(layoutNode.size / VIEWBOX) * 100}%, 34px)`,
                height: `clamp(14px, ${(layoutNode.size / VIEWBOX) * 100}%, 34px)`,
                backgroundColor: color,
                borderColor: selected ? "rgba(226, 236, 255, 0.92)" : "rgba(255,255,255,0.18)",
                boxShadow: selected
                  ? "0 0 0 2px rgba(138, 177, 255, 0.82)"
                  : signal === "red"
                    ? "0 0 0 3px rgba(208, 96, 91, 0.18)"
                    : signal === "amber"
                      ? "0 0 0 2px rgba(212, 162, 78, 0.14)"
                      : "none",
                opacity: layoutNode.kind === "deal" && node?.alerts.includes("stale") ? 0.82 : 1,
              }}
              onClick={() => {
                if (layoutNode.kind === "deal" && node) onSelectDeal(node.dealId);
              }}
              onMouseEnter={() => {
                keepHoverOpen();
                setHoveredNode(layoutNode);
              }}
              onMouseLeave={delayedClose}
              onFocus={() => setHoveredNode(layoutNode)}
              onBlur={delayedClose}
            >
              {layoutNode.kind === "cluster" && (
                <span className="font-mono text-[10px] font-semibold text-white">{layoutNode.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Simplified legend ── */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="rounded-xl border border-bm-border/50 bg-bm-bg/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-4 text-xs text-bm-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SIGNAL_BLUE }} />
              Active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SIGNAL_AMBER }} />
              Attention
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SIGNAL_RED }} />
              Risk
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-bm-muted2">
            <span className="font-mono uppercase tracking-[0.10em]">Ring:</span>
            <span className="text-bm-muted">Outer → Inner</span>
            <span className="font-mono text-bm-muted2">=</span>
            <span className="text-bm-muted">Sourced → Execution Ready</span>
          </div>
        </div>
        <div className="hidden rounded-xl border border-bm-border/50 bg-bm-bg/80 px-3 py-2.5 backdrop-blur md:block">
          <div className="flex items-center gap-3 text-[10px] text-bm-muted2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-bm-muted2/40" />
              &lt;$50M
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-bm-muted2/40" />
              $50–150M
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-4 w-4 rounded-full bg-bm-muted2/40" />
              &gt;$150M
            </span>
          </div>
        </div>
      </div>

      {hoveredNode ? (
        <HoverCard
          layoutNode={hoveredNode}
          envId={envId}
          onAskWinston={onAskWinston}
          onKeepOpen={keepHoverOpen}
          onClose={delayedClose}
        />
      ) : null}

      {/* ── Accessible summary table ── */}
      <table className="sr-only">
        <caption>Deal radar node summary</caption>
        <thead>
          <tr>
            <th>Deal</th>
            <th>Sector</th>
            <th>Stage</th>
            <th>Location</th>
            <th>Capital</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.dealId}>
              <td>{node.dealName}</td>
              <td>{RADAR_SECTOR_LABELS[node.sector]}</td>
              <td>{RADAR_STAGE_LABELS[node.stage]}</td>
              <td>{node.locationLabel}</td>
              <td>{formatMoney(node.equityRequired || node.headlinePrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
