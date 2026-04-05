"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildStackedCurveData,
  CAPABILITIES,
  COMPANY_COLORS,
  SYSTEMS,
  TIMELINE_EVENTS,
  type CompanyId,
  type StackedPoint,
  type System,
} from "./timelineData";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered skill layers — bottom to top of stacked chart */
const SKILL_LAYER_ORDER = [
  "sql",
  "tableau",
  "azure",
  "python",
  "power_bi",
  "databricks",
  "openai",
] as const;

/** Editorial colors per skill (warm/cool palette matching the cinematic skin) */
const SKILL_COLORS: Record<string, string> = {
  sql:        "#7a9eb8",   // steel blue
  tableau:    "#c8923a",   // gold
  azure:      "#4a90c4",   // azure blue
  python:     "#5b8fa8",   // slate blue
  power_bi:   "#d4a843",   // warm amber
  databricks: "#c84b2a",   // warm red
  openai:     "#9b6bb5",   // purple
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompoundingCurveProps {
  selectedEventId: string | null;
  selectedSystemId: string | null;
  selectedCapabilityId: string | null;
  onSelectEvent: (eventId: string) => void;
  onSelectSystem: (systemId: string) => void;
  onHoverEvent: (eventId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tickLabel(value: number) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    timeZone: "UTC",
  });
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

/** 3 key milestone labels shown on the graph */
const KEY_MILESTONES = new Map<string, string>([
  ["sys-ingestion-automation", "Ingestion Automation"],
  ["sys-warehouse", "Data Warehouse"],
  ["sys-ai-platform", "AI Platform"],
]);

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function findNearestSystem(ts: number): System | null {
  let nearest: System | null = null;
  let minDist = Infinity;
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  for (const system of SYSTEMS) {
    const sysTs = new Date(`${system.date}T00:00:00Z`).getTime();
    const dist = Math.abs(ts - sysTs);
    if (dist < minDist && dist < NINETY_DAYS) {
      minDist = dist;
      nearest = system;
    }
  }
  return nearest;
}

function StackedTooltip({
  active,
  payload,
  selectedCapabilityId,
}: {
  active?: boolean;
  payload?: Array<{ payload: StackedPoint; dataKey?: string; value?: number; fill?: string }>;
  selectedCapabilityId: string | null;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const date = new Date(`${point.date}T00:00:00Z`);
  const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const company = point.company ? COMPANY_COLORS[point.company as CompanyId] : null;
  const nearSystem = findNearestSystem(point.ts);

  // Build skill depths for this point
  const skillDepths = SKILL_LAYER_ORDER
    .map((id) => ({
      id,
      name: CAPABILITIES.find((c) => c.id === id)?.name ?? id,
      value: typeof point[id] === "number" ? Math.round(point[id] as number) : 0,
      color: SKILL_COLORS[id] ?? "#888",
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border border-white/15 bg-[rgba(12,8,5,0.96)] px-3 py-2.5 shadow-2xl">
      <p className="text-[11px] font-medium text-white/90">{label}</p>
      {company && (
        <p className="mt-0.5 text-[10px]" style={{ color: company.primary }}>
          {company.label}
        </p>
      )}
      {nearSystem ? (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <p className="text-[11px] font-semibold text-white">{nearSystem.name}</p>
          {nearSystem.metrics.slice(0, 2).map((m, i) => (
            <p key={i} className="mt-0.5 text-[10px] text-white/70">
              {m.label}: <span className="font-medium text-white/90">{m.value}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-1.5 border-t border-white/10 pt-1.5 space-y-0.5">
        {skillDepths.slice(0, 4).map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span
              className="text-[10px]"
              style={{
                color: selectedCapabilityId === s.id ? s.color : "var(--ros-chart-legend, rgba(215,200,180,0.82))",
                fontWeight: selectedCapabilityId === s.id ? 600 : 400,
              }}
            >
              {s.name}
            </span>
            <span className="ml-auto text-[10px] text-white/55">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone dot renderer
// ---------------------------------------------------------------------------

interface MilestoneDotsProps {
  systems: System[];
  chartLeft: number;
  chartTop: number;
  chartWidth: number;
  chartHeight: number;
  xMin: number;
  xMax: number;
  yMax: number;
  selectedSystemId: string | null;
  filteredSystemIds: Set<string> | null;
  onSelect: (systemId: string) => void;
  isMobile: boolean;
}

function MilestoneDots({
  systems,
  chartLeft,
  chartTop,
  chartWidth,
  chartHeight,
  xMin,
  xMax,
  yMax,
  selectedSystemId,
  filteredSystemIds,
  onSelect,
  isMobile,
}: MilestoneDotsProps) {
  if (chartWidth <= 0 || chartHeight <= 0) return null;

  const toX = (ts: number) => chartLeft + ((ts - xMin) / (xMax - xMin)) * chartWidth;
  // Milestone dots sit at the top of the stacked chart at the time of each system
  // We use a fixed y position (near the top) since the chart height itself represents
  // compounding capability — dots float at the "ceiling" of stacked capability at that date
  const toY = (curveValue: number) =>
    chartTop + chartHeight - (curveValue / yMax) * chartHeight;

  return (
    <g>
      {systems.map((system) => {
        const ts = new Date(`${system.date}T00:00:00Z`).getTime();
        const cx = toX(ts);
        // Position dot at 85% of yMax scaled to chart height (near the top of the stack)
        const cy = toY(Math.min(system.curve_value * 0.28, yMax * 0.88));
        const isSelected = selectedSystemId === system.id;
        const isFiltered = filteredSystemIds !== null && !filteredSystemIds.has(system.id);
        const company = COMPANY_COLORS[system.company];
        const r = isSelected ? (isMobile ? 7 : 8) : isMobile ? 5 : 6;

        return (
          <g
            key={system.id}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(system.id)}
            opacity={isFiltered ? 0.18 : 1}
          >
            {isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={r + 5}
                fill="none"
                stroke={company.primary}
                strokeWidth={1.5}
                strokeOpacity={0.4}
              />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={isSelected ? company.primary : "rgba(12,8,5,0.85)"}
              stroke={company.primary}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <circle
              cx={cx}
              cy={cy}
              r={r * 0.4}
              fill={isSelected ? "#fff" : company.primary}
            />
            {/* Invisible hit target */}
            <circle cx={cx} cy={cy} r={16} fill="transparent" />
            {!isMobile && KEY_MILESTONES.has(system.id) && (
              <text
                x={cx}
                y={cy - r - 7}
                textAnchor="middle"
                fill={isFiltered ? "var(--ros-text-dim, rgba(255,255,255,0.40))" : "var(--ros-chart-label, rgba(225,215,200,0.92))"}
                fontSize={11}
                fontWeight={isSelected ? 600 : 400}
              >
                {KEY_MILESTONES.get(system.id)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Phase region labels
// ---------------------------------------------------------------------------

interface PhaseLabelsProps {
  events: typeof TIMELINE_EVENTS;
  chartLeft: number;
  chartTop: number;
  chartWidth: number;
  xMin: number;
  xMax: number;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string | null) => void;
  isMobile: boolean;
}

function PhaseLabels({
  events,
  chartLeft,
  chartTop,
  chartWidth,
  xMin,
  xMax,
  selectedEventId,
  hoveredEventId,
  onSelect,
  onHover,
  isMobile,
}: PhaseLabelsProps) {
  if (chartWidth <= 0) return null;

  const toX = (ts: number) => chartLeft + ((ts - xMin) / (xMax - xMin)) * chartWidth;

  return (
    <g>
      {events.map((event) => {
        const start = new Date(`${event.start_date}T00:00:00Z`).getTime();
        const end = event.end_date
          ? new Date(`${event.end_date}T00:00:00Z`).getTime()
          : new Date("2026-04-01T00:00:00Z").getTime();
        const x1 = toX(start);
        const x2 = toX(end);
        const midX = (x1 + x2) / 2;
        const company = COMPANY_COLORS[event.company];
        const isSelected = selectedEventId === event.id;
        const isHovered = hoveredEventId === event.id;

        return (
          <g
            key={event.id}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(event.id)}
            onMouseEnter={() => onHover(event.id)}
            onMouseLeave={() => onHover(null)}
          >
            <rect
              x={x1}
              y={chartTop - 28}
              width={x2 - x1}
              height={24}
              rx={6}
              fill={isSelected || isHovered ? company.primary : "transparent"}
              fillOpacity={isSelected ? 0.2 : isHovered ? 0.1 : 0}
            />
            {!isMobile && (
              <text
                x={midX}
                y={chartTop - 14}
                textAnchor="middle"
                fill={isSelected ? company.primary : "var(--ros-chart-label, rgba(225,215,200,0.90))"}
                fontSize={11}
                fontWeight={isSelected ? 600 : 400}
              >
                {event.company_label}
                {event.phase === 3 ? " (Return)" : ""}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Overlay layer
// ---------------------------------------------------------------------------

function OverlayLayer({
  events,
  systems,
  chartDims,
  xMin,
  xMax,
  yMax,
  selectedEventId,
  hoveredEventId,
  selectedSystemId,
  filteredSystemIds,
  onSelectEvent,
  onSelectSystem,
  onHoverEvent,
  isMobile,
}: {
  events: typeof TIMELINE_EVENTS;
  systems: typeof SYSTEMS;
  chartDims: { left: number; top: number; width: number; height: number };
  xMin: number;
  xMax: number;
  yMax: number;
  selectedEventId: string | null;
  hoveredEventId: string | null;
  selectedSystemId: string | null;
  filteredSystemIds: Set<string> | null;
  onSelectEvent: (eventId: string) => void;
  onSelectSystem: (systemId: string) => void;
  onHoverEvent: (eventId: string | null) => void;
  isMobile: boolean;
}) {
  return (
    <g>
      <PhaseLabels
        events={events}
        chartLeft={chartDims.left}
        chartTop={chartDims.top}
        chartWidth={chartDims.width}
        xMin={xMin}
        xMax={xMax}
        selectedEventId={selectedEventId}
        hoveredEventId={hoveredEventId}
        onSelect={onSelectEvent}
        onHover={onHoverEvent}
        isMobile={isMobile}
      />
      <MilestoneDots
        systems={systems}
        chartLeft={chartDims.left}
        chartTop={chartDims.top}
        chartWidth={chartDims.width}
        chartHeight={chartDims.height}
        xMin={xMin}
        xMax={xMax}
        yMax={yMax}
        selectedSystemId={selectedSystemId}
        filteredSystemIds={filteredSystemIds}
        onSelect={onSelectSystem}
        isMobile={isMobile}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Skill legend
// ---------------------------------------------------------------------------

function SkillLegend({
  selectedCapabilityId,
  onSelect,
}: {
  selectedCapabilityId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
      {SKILL_LAYER_ORDER.map((id) => {
        const cap = CAPABILITIES.find((c) => c.id === id);
        if (!cap) return null;
        const isSelected = selectedCapabilityId === id;
        const isDimmed = selectedCapabilityId !== null && !isSelected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(isSelected ? null : id)}
            className="flex items-center gap-1.5 transition-opacity"
            style={{ opacity: isDimmed ? 0.45 : 1 }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: SKILL_COLORS[id] }}
            />
            <span
              className="resume-label text-[9px] tracking-[0.16em]"
              style={{ color: isSelected ? SKILL_COLORS[id] : "var(--ros-chart-legend, rgba(215,200,180,0.82))" }}
            >
              {cap.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompoundingCurve({
  selectedEventId,
  selectedSystemId,
  selectedCapabilityId,
  onSelectEvent,
  onSelectSystem,
  onHoverEvent,
}: CompoundingCurveProps) {
  const isMobile = useIsMobile();
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartDims, setChartDims] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [localSelectedCapability, setLocalSelectedCapability] = useState<string | null>(null);

  // The active capability filter is either driven externally (via CapabilityStrip) or locally (via legend)
  const activeCapabilityId = selectedCapabilityId ?? localSelectedCapability;

  const stackedData = useMemo(() => buildStackedCurveData(), []);
  const xMin = stackedData[0]?.ts ?? 0;
  const xMax = stackedData[stackedData.length - 1]?.ts ?? 0;

  // yMax = sum of all skill max values + 10% headroom
  const yMax = useMemo(() => {
    const maxTotal = Math.max(
      ...stackedData.map((p) =>
        SKILL_LAYER_ORDER.reduce((sum, id) => sum + (typeof p[id] === "number" ? (p[id] as number) : 0), 0),
      ),
    );
    return Math.ceil(maxTotal * 1.1);
  }, [stackedData]);

  const filteredSystemIds = useMemo(() => {
    if (!activeCapabilityId) return null;
    return new Set(
      SYSTEMS.filter((s) => s.capabilities_used.includes(activeCapabilityId)).map((s) => s.id),
    );
  }, [activeCapabilityId]);

  const chartHeight = isMobile ? 260 : 400;
  const chartMargin = isMobile
    ? { top: 36, right: 8, bottom: 4, left: 0 }
    : { top: 44, right: 24, bottom: 6, left: 4 };

  const handleChartUpdate = useCallback(() => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector(".recharts-wrapper svg");
    const plotArea = chartRef.current.querySelector(".recharts-cartesian-grid");
    if (!svg || !plotArea) return;
    const plotRect = plotArea.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    setChartDims({
      left: plotRect.left - svgRect.left,
      top: plotRect.top - svgRect.top,
      width: plotRect.width,
      height: plotRect.height,
    });
  }, []);

  useEffect(() => {
    handleChartUpdate();
    const ro = new ResizeObserver(handleChartUpdate);
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, [handleChartUpdate, stackedData]);

  useEffect(() => {
    const timer = setTimeout(handleChartUpdate, 100);
    return () => clearTimeout(timer);
  }, [handleChartUpdate]);

  const phaseBoundaries = useMemo(() => {
    return TIMELINE_EVENTS.slice(1).map((event) => ({
      x: new Date(`${event.start_date}T00:00:00Z`).getTime(),
      company: event.company,
    }));
  }, []);

  return (
    <div ref={chartRef} className="relative">
      <div className="rounded-[20px] border border-bm-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.005))] p-2 md:rounded-[28px] md:p-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={stackedData}
            margin={chartMargin}
            onClick={(state) => {
              const payload = state?.activePayload?.[0]?.payload as StackedPoint | undefined;
              if (payload?.event_id) onSelectEvent(payload.event_id as string);
            }}
            onMouseMove={(state) => {
              const payload = state?.activePayload?.[0]?.payload as StackedPoint | undefined;
              onHoverEvent((payload?.event_id as string) ?? null);
            }}
            onMouseLeave={() => onHoverEvent(null)}
          >
            <defs>
              {SKILL_LAYER_ORDER.map((id) => {
                const color = SKILL_COLORS[id];
                const isDimmed = activeCapabilityId !== null && activeCapabilityId !== id;
                return (
                  <linearGradient key={id} id={`fill-skill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={color}
                      stopOpacity={isDimmed ? 0.04 : 0.55}
                    />
                    <stop
                      offset="100%"
                      stopColor={color}
                      stopOpacity={isDimmed ? 0.01 : 0.08}
                    />
                  </linearGradient>
                );
              })}
            </defs>

            <CartesianGrid
              stroke="var(--ros-chart-grid, rgba(255,255,255,0.10))"
              strokeDasharray="3 8"
              horizontal
              vertical={false}
            />

            {phaseBoundaries.map((boundary, i) => (
              <ReferenceLine
                key={i}
                x={boundary.x}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1}
                strokeDasharray="6 4"
              />
            ))}

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickLabel}
              tick={{ fill: "var(--ros-chart-label, rgba(225,215,200,0.88))", fontSize: isMobile ? 11 : 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={isMobile ? 60 : 80}
            />
            <YAxis domain={[0, yMax]} tick={false} tickLine={false} axisLine={false} width={0} />

            <Tooltip
              content={
                <StackedTooltip selectedCapabilityId={activeCapabilityId} />
              }
              cursor={{ stroke: "rgba(255,255,255,0.22)", strokeWidth: 1 }}
            />

            {/* Stacked areas — bottom to top */}
            {SKILL_LAYER_ORDER.map((id) => {
              const isDimmed = activeCapabilityId !== null && activeCapabilityId !== id;
              const color = SKILL_COLORS[id];
              return (
                <Area
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stackId="skills"
                  stroke={isDimmed ? `${color}22` : color}
                  strokeWidth={isDimmed ? 0.5 : activeCapabilityId === id ? 2 : 1}
                  fill={`url(#fill-skill-${id})`}
                  fillOpacity={1}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={
                    activeCapabilityId === id
                      ? { r: isMobile ? 4 : 5, fill: color, stroke: "#fff", strokeWidth: 2 }
                      : false
                  }
                />
              );
            })}

            <Customized
              component={
                <OverlayLayer
                  events={TIMELINE_EVENTS}
                  systems={SYSTEMS}
                  chartDims={chartDims}
                  xMin={xMin}
                  xMax={xMax}
                  yMax={yMax}
                  selectedEventId={selectedEventId}
                  hoveredEventId={hoveredEventId}
                  selectedSystemId={selectedSystemId}
                  filteredSystemIds={filteredSystemIds}
                  onSelectEvent={onSelectEvent}
                  onSelectSystem={onSelectSystem}
                  onHoverEvent={setHoveredEventId}
                  isMobile={isMobile}
                />
              }
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Skill legend below chart */}
        <SkillLegend
          selectedCapabilityId={activeCapabilityId}
          onSelect={(id) => {
            setLocalSelectedCapability(id);
          }}
        />
      </div>
    </div>
  );
}
