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
  buildCurveData,
  COMPANY_COLORS,
  SYSTEMS,
  TIMELINE_EVENTS,
  type CompanyId,
  type CurvePoint,
  type System,
} from "./timelineData";

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
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

/** Find the nearest system milestone to a given timestamp */
function findNearestSystem(ts: number): System | null {
  let nearest: System | null = null;
  let minDist = Infinity;
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  for (const system of SYSTEMS) {
    const sysTs = new Date(`${system.date}T00:00:00Z`).getTime();
    const dist = Math.abs(ts - sysTs);
    if (dist < minDist && dist < THIRTY_DAYS * 3) {
      minDist = dist;
      nearest = system;
    }
  }
  return nearest;
}

function CurveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CurvePoint }> }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const date = new Date(`${point.date}T00:00:00Z`);
  const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const company = point.company ? COMPANY_COLORS[point.company] : null;
  const nearSystem = findNearestSystem(point.ts);

  return (
    <div className="rounded-xl border border-white/15 bg-[hsl(216,31%,8%)] px-3 py-2 shadow-2xl">
      <p className="text-[11px] font-medium text-white/90">{label}</p>
      {company && (
        <p className="mt-0.5 text-[10px] text-white/50">{company.label}</p>
      )}
      {nearSystem ? (
        <>
          <p className="mt-1 text-xs font-semibold text-white">{nearSystem.name}</p>
          {nearSystem.metrics.slice(0, 2).map((m, i) => (
            <p key={i} className="mt-0.5 text-[10px] text-white/60">
              {m.label}: <span className="font-medium text-white/80">{m.value}</span>
            </p>
          ))}
        </>
      ) : (
        <p className="mt-1 text-xs font-semibold text-white">
          Capability: {Math.round(point.value)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Milestone dot renderer (custom SVG layer)
// ---------------------------------------------------------------------------

interface MilestoneDotsProps {
  systems: System[];
  curveData: CurvePoint[];
  chartLeft: number;
  chartTop: number;
  chartWidth: number;
  chartHeight: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  selectedSystemId: string | null;
  filteredSystemIds: Set<string> | null;
  onSelect: (systemId: string) => void;
  isMobile: boolean;
}

function MilestoneDots({
  systems,
  curveData,
  chartLeft,
  chartTop,
  chartWidth,
  chartHeight,
  xMin,
  xMax,
  yMin,
  yMax,
  selectedSystemId,
  filteredSystemIds,
  onSelect,
  isMobile,
}: MilestoneDotsProps) {
  if (chartWidth <= 0 || chartHeight <= 0) return null;

  const toX = (ts: number) => chartLeft + ((ts - xMin) / (xMax - xMin)) * chartWidth;
  const toY = (val: number) => chartTop + chartHeight - ((val - yMin) / (yMax - yMin)) * chartHeight;

  return (
    <g>
      {systems.map((system) => {
        const ts = new Date(`${system.date}T00:00:00Z`).getTime();
        const cx = toX(ts);
        const cy = toY(system.curve_value);
        const isSelected = selectedSystemId === system.id;
        const isFiltered = filteredSystemIds !== null && !filteredSystemIds.has(system.id);
        const company = COMPANY_COLORS[system.company];
        const r = isSelected ? (isMobile ? 7 : 8) : isMobile ? 5 : 6;

        return (
          <g
            key={system.id}
            style={{ cursor: "pointer" }}
            onClick={() => onSelect(system.id)}
            opacity={isFiltered ? 0.2 : 1}
          >
            {/* Glow ring */}
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
            {/* Outer ring */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={isSelected ? company.primary : "hsl(216,31%,12%)"}
              stroke={company.primary}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            {/* Inner dot */}
            <circle
              cx={cx}
              cy={cy}
              r={r * 0.4}
              fill={isSelected ? "#fff" : company.primary}
            />
            {/* Hover target (larger invisible circle) */}
            <circle cx={cx} cy={cy} r={16} fill="transparent" />
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
            {/* Clickable region background */}
            <rect
              x={x1}
              y={chartTop - 28}
              width={x2 - x1}
              height={24}
              rx={6}
              fill={isSelected ? company.primary : isHovered ? company.primary : "transparent"}
              fillOpacity={isSelected ? 0.2 : isHovered ? 0.1 : 0}
            />
            {/* Label */}
            {!isMobile && (
              <text
                x={midX}
                y={chartTop - 14}
                textAnchor="middle"
                fill={isSelected ? company.primary : "rgba(156,163,175,0.7)"}
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
// Overlay layer — wraps phase labels + milestone dots for Recharts Customized
// ---------------------------------------------------------------------------

function OverlayLayer({
  events,
  systems,
  curveData,
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
  curveData: CurvePoint[];
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
        curveData={curveData}
        chartLeft={chartDims.left}
        chartTop={chartDims.top}
        chartWidth={chartDims.width}
        chartHeight={chartDims.height}
        xMin={xMin}
        xMax={xMax}
        yMin={0}
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

  const curveData = useMemo(() => buildCurveData(), []);
  const yMax = useMemo(() => Math.ceil(Math.max(...curveData.map((p) => p.value)) * 1.08), [curveData]);
  const xMin = curveData[0]?.ts ?? 0;
  const xMax = curveData[curveData.length - 1]?.ts ?? 0;

  // Filter systems by selected capability
  const filteredSystemIds = useMemo(() => {
    if (!selectedCapabilityId) return null;
    const ids = new Set(
      SYSTEMS.filter((s) => s.capabilities_used.includes(selectedCapabilityId)).map((s) => s.id),
    );
    return ids;
  }, [selectedCapabilityId]);

  const chartHeight = isMobile ? 280 : 420;
  const chartMargin = isMobile
    ? { top: 36, right: 8, bottom: 4, left: 0 }
    : { top: 44, right: 24, bottom: 6, left: 4 };

  // Track chart area dimensions for custom SVG overlays
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
  }, [handleChartUpdate, curveData]);

  // Delayed chart dims update after render
  useEffect(() => {
    const timer = setTimeout(handleChartUpdate, 100);
    return () => clearTimeout(timer);
  }, [handleChartUpdate]);

  // Build gradient segments for company-colored fill
  const gradientStops = useMemo(() => {
    const stops: Array<{ offset: string; color: string }> = [];
    if (curveData.length === 0) return stops;

    let lastCompany: CompanyId | null = null;
    for (const point of curveData) {
      if (point.company !== lastCompany && point.company) {
        const pct = ((point.ts - xMin) / (xMax - xMin)) * 100;
        stops.push({ offset: `${pct}%`, color: COMPANY_COLORS[point.company].primary });
        lastCompany = point.company;
      }
    }
    return stops;
  }, [curveData, xMin, xMax]);

  // Phase boundary lines
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
            data={curveData}
            margin={chartMargin}
            onClick={(state) => {
              const payload = state?.activePayload?.[0]?.payload as CurvePoint | undefined;
              if (payload?.event_id) onSelectEvent(payload.event_id);
            }}
            onMouseMove={(state) => {
              const payload = state?.activePayload?.[0]?.payload as CurvePoint | undefined;
              onHoverEvent(payload?.event_id ?? null);
            }}
            onMouseLeave={() => onHoverEvent(null)}
          >
            <defs>
              {/* Company-segmented gradient for the curve stroke */}
              <linearGradient id="curve-stroke-grad" x1="0" y1="0" x2="1" y2="0">
                {gradientStops.map((stop, i) => (
                  <stop key={i} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
              {/* Fill gradient */}
              <linearGradient id="curve-fill-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(59,130,246,0.18)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.01)" />
              </linearGradient>
              {/* Per-company fill gradients */}
              {(Object.entries(COMPANY_COLORS) as [CompanyId, typeof COMPANY_COLORS.jll][]).map(
                ([id, c]) => (
                  <linearGradient key={id} id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.primary} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={c.primary} stopOpacity={0.01} />
                  </linearGradient>
                ),
              )}
            </defs>

            <CartesianGrid
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 8"
              horizontal
              vertical={false}
            />

            {/* Phase boundary lines */}
            {phaseBoundaries.map((boundary, i) => (
              <ReferenceLine
                key={i}
                x={boundary.x}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                strokeDasharray="6 4"
              />
            ))}

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickLabel}
              tick={{ fill: "rgba(156,163,175,0.6)", fontSize: isMobile ? 10 : 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={isMobile ? 60 : 80}
            />
            <YAxis domain={[0, yMax]} tick={false} tickLine={false} axisLine={false} width={0} />

            <Tooltip content={<CurveTooltip />} cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }} />

            {/* The single cumulative curve */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="url(#curve-stroke-grad)"
              strokeWidth={isMobile ? 2.5 : 3}
              fill="url(#curve-fill-grad)"
              fillOpacity={1}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: isMobile ? 4 : 5, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
            />

            {/* Custom SVG overlays for milestones and phase labels */}
            <Customized
              component={
                <OverlayLayer
                  events={TIMELINE_EVENTS}
                  systems={SYSTEMS}
                  curveData={curveData}
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
      </div>
    </div>
  );
}
