"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BrainCircuit, Building2, CircleAlert, Layers3 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DealRadarLayoutNode, DealRadarMode, DealRadarNode, DealRadarSector, DealRadarStage } from "./types";
import {
  computeRadarLayout,
  formatMoney,
  formatMultiple,
  formatPercent,
  formatRelativeDate,
  getModeColor,
  getSectorEmphasis,
  RADAR_MODE_LABELS,
  RADAR_SECTOR_LABELS,
  RADAR_STAGE_LABELS,
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
const CORE_RADIUS = 86;
const WEDGE_ANGLE = 360 / 8;
const BAND = (OUTER_RADIUS - CORE_RADIUS) / 7;

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

function describeRingLabelPosition(stageIndex: number) {
  const radius = OUTER_RADIUS - stageIndex * BAND - BAND / 2;
  return polarToCartesian(-151, radius);
}

function describeSectorLabelPosition(sectorIndex: number) {
  const angle = -90 + sectorIndex * WEDGE_ANGLE;
  return polarToCartesian(angle, OUTER_RADIUS + 28);
}

function sectorGlyph(sector: DealRadarSector) {
  switch (sector) {
    case "multifamily":
      return <circle cx="12" cy="12" r="5.5" />;
    case "industrial":
      return <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />;
    case "office":
      return <rect x="6.5" y="5.5" width="11" height="13" rx="3" />;
    case "retail":
      return <path d="M12 5.5 18.5 12 12 18.5 5.5 12Z" />;
    case "student_housing":
      return <path d="M12 5.4 17.8 8.4 17.8 15.6 12 18.6 6.2 15.6 6.2 8.4Z" />;
    case "medical_office":
      return <path d="M10 5.5h4v4h4v5h-4v4h-4v-4H6v-5h4z" />;
    case "mixed_use":
      return <path d="M12 5.8 18.2 17H5.8Z" />;
    case "hospitality":
      return <path d="M12 5.5 17.2 9.3 15.2 17.4 8.8 17.4 6.8 9.3Z" />;
  }
}

function modeCaption(mode: DealRadarMode) {
  return {
    stage: "Color encodes pipeline stage and emphasizes execution proximity.",
    capital: "Nodes emphasize equity intensity and wedge underlays show capital concentration.",
    risk: "Higher-risk deals surface warmer fills and stronger alert halos.",
    fit: "Strategy-fit color reflects how well risk and return align to the deal profile.",
    market: "Market mode emphasizes geographic crowding and market conviction.",
  }[mode];
}

function alertHalo(node: DealRadarNode, selected: boolean) {
  const layers = [];
  if (selected) layers.push("0 0 0 2px rgba(138, 177, 255, 0.82)");
  if (node.alerts.includes("priority")) layers.push("0 0 0 6px rgba(214, 169, 90, 0.16)");
  if (node.alerts.includes("capital_gap")) layers.push("0 0 0 4px rgba(215, 97, 97, 0.22)");
  if (node.alerts.includes("missing_diligence")) layers.push("0 0 0 3px rgba(215, 169, 84, 0.18)");
  if (node.alerts.includes("stale")) layers.push("0 10px 18px -14px rgba(0, 0, 0, 0.85)");
  return layers.join(", ");
}

function HoverCard({
  layoutNode,
  envId,
  mode,
  onAskWinston,
  onKeepOpen,
  onClose,
}: {
  layoutNode: DealRadarLayoutNode;
  envId: string;
  mode: DealRadarMode;
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
          Clustered Radar Cell
        </p>
        <p className="mt-2 text-base font-semibold text-bm-text">
          {layoutNode.clusterCount} more {RADAR_SECTOR_LABELS[layoutNode.sector]} deals in {RADAR_STAGE_LABELS[layoutNode.stage]}
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
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            {RADAR_MODE_LABELS[mode]} View
          </p>
          <p className="mt-1 text-base font-semibold text-bm-text">{node.dealName}</p>
          <p className="mt-1 text-xs text-bm-muted">{node.locationLabel}</p>
        </div>
        <div
          className="inline-flex items-center rounded-full border border-bm-border/50 bg-bm-bg/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2"
        >
          {RADAR_STAGE_LABELS[node.stage]}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Strategy</p>
          <p className="mt-1 text-sm text-bm-text">{node.strategy || "—"}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Sector</p>
          <p className="mt-1 text-sm text-bm-text">{RADAR_SECTOR_LABELS[node.sector]}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Fund</p>
          <p className="mt-1 text-sm text-bm-text">{node.fundName || "Unassigned"}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Deal Size</p>
          <p className="mt-1 text-sm text-bm-text">{formatMoney(node.headlinePrice)}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Equity Req.</p>
          <p className="mt-1 text-sm text-bm-text">{formatMoney(node.equityRequired)}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Target IRR</p>
          <p className="mt-1 text-sm text-bm-text">{formatPercent(node.targetIrr)}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Target MOIC</p>
          <p className="mt-1 text-sm text-bm-text">{formatMultiple(node.targetMoic)}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Sponsor</p>
          <p className="mt-1 text-sm text-bm-text">{node.sponsorName || "—"}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Broker</p>
          <p className="mt-1 text-sm text-bm-text">{node.brokerName || node.brokerOrg || "—"}</p>
        </div>
        <div className="rounded-lg border border-bm-border/40 bg-bm-bg/55 px-3 py-2">
          <p className="font-mono uppercase tracking-[0.12em] text-bm-muted2">Updated</p>
          <p className="mt-1 text-sm text-bm-text">{formatRelativeDate(node.lastUpdatedAt)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(node.alerts.length ? node.alerts : ["priority"]).slice(0, 3).map((alert) => (
          <span
            key={alert}
            className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-bg/65 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted"
          >
            <CircleAlert className="h-3 w-3" />
            {alert.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {node.blockers.length ? (
        <div className="mt-3 rounded-lg border border-bm-warning/30 bg-bm-warning/10 px-3 py-2 text-xs text-bm-text">
          {node.blockers[0]}
        </div>
      ) : null}

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

function SectorNodeGlyph({ sector }: { sector: DealRadarSector }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[72%] w-[72%] fill-current">
      {sectorGlyph(sector)}
    </svg>
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
  const emphasis = useMemo(() => getSectorEmphasis(nodes, mode), [nodes, mode]);

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
          <p className="mt-3 text-lg font-semibold text-bm-text">No active deals match the current filters.</p>
          <p className="mt-2 text-sm text-bm-muted">Broaden the pipeline filters or switch to list view for archived deals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bm-command-module relative aspect-square overflow-hidden rounded-2xl border border-bm-border/50 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_34%),linear-gradient(180deg,rgba(12,16,24,0.98),rgba(8,11,17,0.98))]">
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="radar-ready-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(130, 211, 160, 0.12)" />
            <stop offset="100%" stopColor="rgba(130, 211, 160, 0)" />
          </radialGradient>
        </defs>

        <circle cx={CENTER} cy={CENTER} r={CORE_RADIUS + 14} fill="url(#radar-ready-core)" />

        {Array.from({ length: 8 }).map((_, sectorIndex) => {
          const startAngle = -90 - WEDGE_ANGLE / 2 + sectorIndex * WEDGE_ANGLE;
          const endAngle = startAngle + WEDGE_ANGLE;
          const sector = Object.keys(emphasis)[sectorIndex] as DealRadarSector;
          const opacity = emphasis[sector];
          return (
            <path
              key={`sector-${sector}`}
              d={describeSectorPath(startAngle + 1, endAngle - 1, CORE_RADIUS + 6, OUTER_RADIUS)}
              fill={`rgba(118, 134, 160, ${opacity})`}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
            />
          );
        })}

        {Array.from({ length: 7 }).map((_, index) => (
          <circle
            key={`ring-${index}`}
            cx={CENTER}
            cy={CENTER}
            r={OUTER_RADIUS - index * BAND}
            fill="none"
            stroke={index === 6 ? "rgba(125, 193, 153, 0.24)" : "rgba(255,255,255,0.08)"}
            strokeDasharray={index === 6 ? undefined : "2 6"}
            strokeWidth={index === 6 ? 1.4 : 1}
          />
        ))}

        {Array.from({ length: 8 }).map((_, sectorIndex) => {
          const angle = -90 - WEDGE_ANGLE / 2 + sectorIndex * WEDGE_ANGLE;
          const start = polarToCartesian(angle, CORE_RADIUS + 6);
          const end = polarToCartesian(angle, OUTER_RADIUS);
          return (
            <line
              key={`spoke-${sectorIndex}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {Object.entries(RADAR_STAGE_LABELS).map(([stage, label], index) => {
          const point = describeRingLabelPosition(index);
          return (
            <g key={stage} transform={`translate(${point.x}, ${point.y})`}>
              <rect x="-52" y="-11" width="104" height="22" rx="11" fill="rgba(9,13,20,0.82)" stroke="rgba(255,255,255,0.06)" />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                className="fill-bm-muted2 font-mono text-[10px] uppercase tracking-[0.18em]"
              >
                {label}
              </text>
            </g>
          );
        })}

        {Object.entries(RADAR_SECTOR_LABELS).map(([sector, label], index) => {
          const point = describeSectorLabelPosition(index);
          return (
            <text
              key={sector}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              className="fill-bm-muted2 font-mono text-[11px] uppercase tracking-[0.16em]"
            >
              {label}
            </text>
          );
        })}
      </svg>

      <div className="absolute inset-0">
        {layoutNodes.map((layoutNode) => {
          const node = layoutNode.deal;
          const selected = layoutNode.kind === "deal" && node?.dealId === selectedDealId;
          const color = layoutNode.kind === "deal" && node ? getModeColor(node, mode) : "#7e8ca4";
          const buttonLabel = layoutNode.kind === "deal" && node
            ? `${node.dealName}, ${RADAR_SECTOR_LABELS[node.sector]}, ${RADAR_STAGE_LABELS[node.stage]}, ${node.locationLabel}, capital ${formatMoney(node.equityRequired || node.headlinePrice)}`
            : `${layoutNode.clusterCount} more ${RADAR_SECTOR_LABELS[layoutNode.sector]} deals in ${RADAR_STAGE_LABELS[layoutNode.stage]}`;

          return (
            <button
              key={layoutNode.key}
              type="button"
              aria-label={buttonLabel}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-white transition-[transform,box-shadow,background-color] duration-fast",
                layoutNode.kind === "deal" && node?.alerts.includes("priority") && "animate-winston-glow",
                "focus-visible:z-20 focus-visible:scale-[1.08]",
              )}
              style={{
                left: `${(layoutNode.x / VIEWBOX) * 100}%`,
                top: `${(layoutNode.y / VIEWBOX) * 100}%`,
                width: `clamp(18px, ${(layoutNode.size / VIEWBOX) * 100}%, 34px)`,
                height: `clamp(18px, ${(layoutNode.size / VIEWBOX) * 100}%, 34px)`,
                backgroundColor: color,
                borderColor: selected ? "rgba(226, 236, 255, 0.92)" : "rgba(255,255,255,0.16)",
                boxShadow: layoutNode.kind === "deal" && node ? alertHalo(node, selected) : undefined,
                opacity: layoutNode.kind === "deal" && node?.alerts.includes("stale") ? 0.88 : 1,
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
              {layoutNode.kind === "deal" && node ? (
                <SectorNodeGlyph sector={node.sector} />
              ) : (
                <span className="font-mono text-[10px] font-semibold">{layoutNode.label}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="max-w-md rounded-xl border border-bm-border/50 bg-bm-bg/75 px-4 py-3 backdrop-blur">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
            {RADAR_MODE_LABELS[mode]} Mode
          </p>
          <p className="mt-1 text-sm text-bm-text">{modeCaption(mode)}</p>
        </div>
        <div className="hidden rounded-xl border border-bm-border/50 bg-bm-bg/75 px-4 py-3 backdrop-blur md:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Legend</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-bm-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-bm-warning" />
              Attention
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-bm-accent" />
              Selected
            </span>
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              Shape = sector
            </span>
          </div>
        </div>
      </div>

      {hoveredNode ? (
        <HoverCard
          layoutNode={hoveredNode}
          envId={envId}
          mode={mode}
          onAskWinston={onAskWinston}
          onKeepOpen={keepHoverOpen}
          onClose={delayedClose}
        />
      ) : null}

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
