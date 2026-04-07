"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildStackedCurveData,
  CAPABILITIES,
  COMPANY_COLORS,
  ROLES,
  SYSTEMS,
  TIMELINE_EVENTS,
  type CareerRole,
  type StackedPoint,
} from "./timelineData";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILL_LAYER_ORDER = [
  "sql",
  "tableau",
  "azure",
  "python",
  "power_bi",
  "databricks",
  "openai",
] as const;

const SKILL_COLORS: Record<string, string> = {
  sql:        "#7a9eb8",
  tableau:    "#c8923a",
  azure:      "#4a90c4",
  python:     "#5b8fa8",
  power_bi:   "#d4a843",
  databricks: "#c84b2a",
  openai:     "#9b6bb5",
};

const SKILL_SHORT: Record<string, string> = {
  sql: "SQL",
  tableau: "Tab",
  azure: "Az",
  python: "Py",
  power_bi: "PBI",
  databricks: "DBX",
  openai: "AI",
};

const SYSTEM_LABELS = new Map<string, string>([
  ["sys-ingestion-automation", "Ingestion"],
  ["sys-warehouse", "Warehouse"],
  ["sys-ai-platform", "AI Platform"],
]);

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
// Responsive hooks — client-only, suppresses hydration flash
// ---------------------------------------------------------------------------

function useClientReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

function useIsLandscapePhone() {
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(max-height: 500px) and (max-width: 932px) and (orientation: landscape)");
    const update = () => setIsLandscape(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isLandscape;
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

function fmtRoleDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Role progression bars
// ---------------------------------------------------------------------------

function RoleBars({
  roles,
  chartLeft,
  chartTop,
  chartWidth,
  chartHeight,
  xMin,
  xMax,
  isMobile,
}: {
  roles: CareerRole[];
  chartLeft: number;
  chartTop: number;
  chartWidth: number;
  chartHeight: number;
  xMin: number;
  xMax: number;
  isMobile: boolean;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (chartWidth <= 0 || chartHeight <= 0) return null;

  const toX = (ts: number) => chartLeft + ((ts - xMin) / (xMax - xMin)) * chartWidth;

  return (
    <g>
      {roles.map((role) => {
        const startTs = new Date(`${role.start_date}T00:00:00Z`).getTime();
        const endTs = role.end_date
          ? new Date(`${role.end_date}T00:00:00Z`).getTime()
          : xMax;
        const x1 = toX(startTs);
        const x2 = toX(endTs);
        const barW = Math.max(x2 - x1, 2);
        const barH = role.level * chartHeight;
        const y = chartTop + chartHeight - barH;
        const isHovered = hoveredId === role.id;
        const company = COMPANY_COLORS[role.company];
        const dateRange = `${fmtRoleDate(role.start_date)} – ${role.end_date ? fmtRoleDate(role.end_date) : "Present"}`;

        const roleSystems = role.systems
          .map((sid) => SYSTEMS.find((s) => s.id === sid))
          .filter(Boolean) as typeof SYSTEMS;

        return (
          <g
            key={role.id}
            onMouseEnter={() => !isMobile && setHoveredId(role.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <rect
              x={x1 - 1} y={y - 1} width={barW + 2} height={barH + 1}
              rx={isMobile ? 4 : 8}
              fill={company.primary} fillOpacity={isHovered ? 0.10 : 0.05}
              filter="url(#role-bar-glow)"
            />
            <rect
              x={x1} y={y} width={barW} height={barH}
              rx={isMobile ? 3 : 7}
              fill={company.primary} fillOpacity={isHovered ? 0.38 : 0.22}
              filter="url(#role-bar-blur)"
            />
            <rect
              x={x1} y={y} width={barW} height={isMobile ? 2 : 3}
              rx={2}
              fill={company.primary} fillOpacity={isHovered ? 0.70 : 0.45}
            />
            {/* Role label — desktop only */}
            {!isMobile && barW > 80 && (
              <text
                x={x1 + 12} y={y + 18}
                fill={company.primary} fillOpacity={isHovered ? 0.95 : 0.65}
                fontSize={10} fontWeight={isHovered ? 600 : 500}
              >
                {role.short_title}
              </text>
            )}
            {/* Tooltip — desktop only */}
            {isHovered && !isMobile && (
              <foreignObject
                x={Math.min(x1 + 8, chartLeft + chartWidth - 240)}
                y={Math.max(y - 10, chartTop)}
                width={230}
                height={roleSystems.length > 0 ? 120 + roleSystems.length * 20 : 90}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div
                  style={{
                    background: "var(--ros-surface, rgba(10,7,4,0.97))",
                    border: "1px solid var(--ros-border, rgba(255,255,255,0.12))",
                    borderRadius: 12,
                    padding: "10px 12px",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    pointerEvents: "none",
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ros-text-bright)", margin: 0, lineHeight: 1.3 }}>
                    {role.title}
                  </p>
                  <p style={{ fontSize: 10, color: company.primary, margin: "3px 0 0" }}>
                    {company.label} · {dateRange}
                  </p>
                  <p style={{ fontSize: 10, color: "var(--ros-text-muted)", margin: "6px 0 4px", lineHeight: 1.5 }}>
                    {role.impact_summary}
                  </p>
                  {roleSystems.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--ros-border-light)", paddingTop: 6, marginTop: 4 }}>
                      {roleSystems.map((s) => (
                        <p key={s.id} style={{ fontSize: 10, color: "var(--ros-text-dim)", margin: "2px 0 0" }}>
                          → {s.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// System reference lines
// ---------------------------------------------------------------------------

function SystemRefLines({
  chartLeft, chartTop, chartWidth, chartHeight, xMin, xMax, isMobile,
}: {
  chartLeft: number; chartTop: number; chartWidth: number; chartHeight: number;
  xMin: number; xMax: number; isMobile: boolean;
}) {
  if (chartWidth <= 0 || chartHeight <= 0) return null;

  const toX = (ts: number) => chartLeft + ((ts - xMin) / (xMax - xMin)) * chartWidth;

  return (
    <g>
      {SYSTEMS.map((system) => {
        const ts = new Date(`${system.date}T00:00:00Z`).getTime();
        const x = toX(ts);
        const label = !isMobile ? SYSTEM_LABELS.get(system.id) : undefined;
        const company = COMPANY_COLORS[system.company];

        return (
          <g key={system.id}>
            <line
              x1={x} y1={chartTop + chartHeight} x2={x} y2={chartTop + 4}
              stroke={company.primary} strokeWidth={1} strokeOpacity={isMobile ? 0.12 : 0.20}
              strokeDasharray="3 5"
            />
            {label && (
              <text
                x={x} y={chartTop - 2} textAnchor="middle"
                fill={company.primary} fillOpacity={0.45}
                fontSize={8} fontWeight={400} letterSpacing="0.08em"
              >
                {label}
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

function PhaseLabels({
  events, chartLeft, chartTop, chartWidth, xMin, xMax,
  selectedEventId, hoveredEventId, onSelect, onHover, isMobile,
}: {
  events: typeof TIMELINE_EVENTS;
  chartLeft: number; chartTop: number; chartWidth: number;
  xMin: number; xMax: number;
  selectedEventId: string | null; hoveredEventId: string | null;
  onSelect: (eventId: string) => void; onHover: (eventId: string | null) => void;
  isMobile: boolean;
}) {
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
              x={x1} y={chartTop - (isMobile ? 20 : 28)}
              width={x2 - x1} height={isMobile ? 16 : 24}
              rx={isMobile ? 3 : 6}
              fill={isSelected || isHovered ? company.primary : "transparent"}
              fillOpacity={isSelected ? 0.2 : isHovered ? 0.1 : 0}
            />
            {!isMobile && (
              <text
                x={midX} y={chartTop - 14} textAnchor="middle"
                fill={isSelected ? company.primary : "var(--ros-chart-label, rgba(225,215,200,0.90))"}
                fontSize={11} fontWeight={isSelected ? 600 : 400}
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
  events, roles, chartDims, xMin, xMax,
  selectedEventId, hoveredEventId, onSelectEvent, onHoverEvent, isMobile,
}: {
  events: typeof TIMELINE_EVENTS;
  roles: CareerRole[];
  chartDims: { left: number; top: number; width: number; height: number };
  xMin: number; xMax: number;
  selectedEventId: string | null; hoveredEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onHoverEvent: (eventId: string | null) => void;
  isMobile: boolean;
}) {
  return (
    <g>
      <RoleBars
        roles={roles}
        chartLeft={chartDims.left} chartTop={chartDims.top}
        chartWidth={chartDims.width} chartHeight={chartDims.height}
        xMin={xMin} xMax={xMax} isMobile={isMobile}
      />
      <SystemRefLines
        chartLeft={chartDims.left} chartTop={chartDims.top}
        chartWidth={chartDims.width} chartHeight={chartDims.height}
        xMin={xMin} xMax={xMax} isMobile={isMobile}
      />
      <PhaseLabels
        events={events}
        chartLeft={chartDims.left} chartTop={chartDims.top}
        chartWidth={chartDims.width}
        xMin={xMin} xMax={xMax}
        selectedEventId={selectedEventId} hoveredEventId={hoveredEventId}
        onSelect={onSelectEvent} onHover={onHoverEvent} isMobile={isMobile}
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
  isMobile,
}: {
  selectedCapabilityId: string | null;
  onSelect: (id: string | null) => void;
  isMobile: boolean;
}) {
  return (
    <div
      className="mt-2 flex gap-x-3 gap-y-1 px-2"
      style={isMobile
        ? { overflowX: "auto", WebkitOverflowScrolling: "touch" as never, flexWrap: "nowrap", justifyContent: "flex-start", paddingBottom: 4 }
        : { flexWrap: "wrap", justifyContent: "center" }
      }
    >
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
            className="flex shrink-0 items-center gap-1.5 transition-opacity"
            style={{ opacity: isDimmed ? 0.45 : 1 }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: SKILL_COLORS[id] }}
            />
            <span
              className="whitespace-nowrap tracking-[0.06em]"
              style={{
                fontFamily: "var(--font-body, system-ui, sans-serif)",
                fontSize: isMobile ? 10 : 11,
                fontWeight: 500,
                color: isSelected ? SKILL_COLORS[id] : "var(--ros-text-muted)",
              }}
            >
              {isMobile ? (SKILL_SHORT[id] ?? cap.name) : cap.name}
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
  onSelectSystem: _onSelectSystem,
  onHoverEvent,
}: CompoundingCurveProps) {
  const clientReady = useClientReady();
  const isMobile = useIsMobile();
  const isLandscape = useIsLandscapePhone();
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartDims, setChartDims] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [localSelectedCapability, setLocalSelectedCapability] = useState<string | null>(null);

  const activeCapabilityId = selectedCapabilityId ?? localSelectedCapability;

  const stackedData = useMemo(() => buildStackedCurveData(), []);
  const xMin = stackedData[0]?.ts ?? 0;
  const xMax = stackedData[stackedData.length - 1]?.ts ?? 0;

  const yMax = useMemo(() => {
    const maxTotal = Math.max(
      ...stackedData.map((p) =>
        SKILL_LAYER_ORDER.reduce((sum, id) => sum + (typeof p[id] === "number" ? (p[id] as number) : 0), 0),
      ),
    );
    return Math.ceil(maxTotal * 1.1);
  }, [stackedData]);

  // Chart sizing — separate portrait / landscape / desktop
  // On SSR (clientReady=false), render a neutral small size that won't flash
  const chartHeight = !clientReady ? 280 : isLandscape ? 180 : isMobile ? 240 : 420;
  const chartMargin = !clientReady || isMobile
    ? isLandscape
      ? { top: 16, right: 4, bottom: 4, left: 0 }
      : { top: 24, right: 6, bottom: 4, left: 0 }
    : { top: 44, right: 24, bottom: 6, left: 4 };

  // Measure chart plot area for SVG overlay positioning
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

  // Re-measure on mount, resize, and whenever mobile state changes
  useEffect(() => {
    handleChartUpdate();
    const ro = new ResizeObserver(handleChartUpdate);
    if (chartRef.current) ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, [handleChartUpdate, stackedData]);

  // Delayed re-measure after hydration and after mobile/landscape state settles
  useEffect(() => {
    const timer = setTimeout(handleChartUpdate, 150);
    return () => clearTimeout(timer);
  }, [handleChartUpdate, isMobile, isLandscape]);

  const phaseBoundaries = useMemo(() => {
    return TIMELINE_EVENTS.slice(1).map((event) => ({
      x: new Date(`${event.start_date}T00:00:00Z`).getTime(),
      company: event.company,
    }));
  }, []);

  // Effective mobile state for rendering (only trust after client hydration)
  const effectiveMobile = clientReady && isMobile;
  const effectiveLandscape = clientReady && isLandscape;

  return (
    <div ref={chartRef} className="relative">
      {/* Chart container — overflow-hidden, no explicit height (ResponsiveContainer owns it) */}
      <div
        className="overflow-hidden rounded-2xl p-1.5 md:rounded-[28px] md:p-4"
        style={{
          border: "1px solid var(--ros-border-light)",
          background: "var(--ros-card-bg)",
        }}
      >
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
              <filter id="role-bar-blur" x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
              <filter id="role-bar-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              {SKILL_LAYER_ORDER.map((id) => {
                const color = SKILL_COLORS[id];
                const isDimmed = activeCapabilityId !== null && activeCapabilityId !== id;
                return (
                  <linearGradient key={id} id={`fill-skill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={isDimmed ? 0.04 : 0.50} />
                    <stop offset="100%" stopColor={color} stopOpacity={isDimmed ? 0.01 : 0.06} />
                  </linearGradient>
                );
              })}
            </defs>

            <CartesianGrid
              stroke="var(--ros-chart-grid)"
              strokeDasharray="3 8"
              horizontal
              vertical={false}
            />

            {phaseBoundaries.map((boundary, i) => (
              <ReferenceLine
                key={i}
                x={boundary.x}
                stroke="var(--ros-chart-grid)"
                strokeWidth={1}
                strokeDasharray="6 4"
              />
            ))}

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickLabel}
              tick={{
                fill: "var(--ros-chart-label)",
                fontSize: effectiveLandscape ? 9 : effectiveMobile ? 10 : 12,
                fontFamily: "var(--font-body, system-ui, sans-serif)",
              }}
              tickLine={false}
              axisLine={false}
              minTickGap={effectiveLandscape ? 50 : effectiveMobile ? 55 : 80}
            />
            <YAxis domain={[0, yMax]} tick={false} tickLine={false} axisLine={false} width={0} />

            {SKILL_LAYER_ORDER.map((id) => {
              const isDimmed = activeCapabilityId !== null && activeCapabilityId !== id;
              const color = SKILL_COLORS[id];
              return (
                <Area
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stackId="skills"
                  stroke={isDimmed ? `${color}18` : `${color}55`}
                  strokeWidth={isDimmed ? 0.5 : activeCapabilityId === id ? 1.5 : 0.8}
                  fill={`url(#fill-skill-${id})`}
                  fillOpacity={1}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />
              );
            })}

            <Customized
              component={
                <OverlayLayer
                  events={TIMELINE_EVENTS}
                  roles={ROLES}
                  chartDims={chartDims}
                  xMin={xMin}
                  xMax={xMax}
                  selectedEventId={selectedEventId}
                  hoveredEventId={hoveredEventId}
                  onSelectEvent={onSelectEvent}
                  onHoverEvent={setHoveredEventId}
                  isMobile={effectiveMobile}
                />
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <SkillLegend
        selectedCapabilityId={activeCapabilityId}
        onSelect={(id) => setLocalSelectedCapability(id)}
        isMobile={effectiveMobile}
      />
    </div>
  );
}
