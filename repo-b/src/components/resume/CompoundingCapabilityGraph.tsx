"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { useShallow } from "zustand/react/shallow";
import type { ResumeTimeline } from "@/lib/bos-api";
import { AXIS_TICK_STYLE, GRID_STYLE } from "@/components/charts/chart-theme";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import CapabilityGraphTooltip from "./CapabilityGraphTooltip";
import {
  CAPABILITY_LAYERS,
  CAPABILITY_MILESTONES,
  COMPANY_BANDS,
  LAYER_IDS,
  generateCapabilityChartData,
  getLayerById,
  easeInOutCubic,
  type CapabilityDataPoint,
  type LayerId,
} from "./capabilityGraphData";

const START_YEAR = 2013;
const END_YEAR = 2026;
const PLAYBACK_DURATION_MS = 8000;

export default function CompoundingCapabilityGraph({
  timeline,
}: {
  timeline: ResumeTimeline;
}) {
  const {
    capabilityHoveredLayer,
    capabilityPlaybackYear,
    setCapabilityHoveredLayer,
    setCapabilityPlaybackYear,
    selectTimelineItem,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      capabilityHoveredLayer: state.capabilityHoveredLayer,
      capabilityPlaybackYear: state.capabilityPlaybackYear,
      setCapabilityHoveredLayer: state.setCapabilityHoveredLayer,
      setCapabilityPlaybackYear: state.setCapabilityPlaybackYear,
      selectTimelineItem: state.selectTimelineItem,
    })),
  );

  const fullData = useMemo(() => generateCapabilityChartData(START_YEAR, END_YEAR, 12), []);

  const chartData = useMemo(() => {
    if (capabilityPlaybackYear === null) return fullData;
    return fullData.filter((p) => p.year <= capabilityPlaybackYear);
  }, [fullData, capabilityPlaybackYear]);

  // ── Playback animation via requestAnimationFrame ──
  const rafRef = useRef<number | null>(null);
  const playbackStartRef = useRef<number | null>(null);
  const isPlaying = capabilityPlaybackYear !== null;

  const startPlayback = useCallback(() => {
    playbackStartRef.current = null;
    setCapabilityPlaybackYear(START_YEAR);
  }, [setCapabilityPlaybackYear]);

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playbackStartRef.current = null;
    setCapabilityPlaybackYear(null);
  }, [setCapabilityPlaybackYear]);

  useEffect(() => {
    if (capabilityPlaybackYear === null) return;

    function tick(now: number) {
      if (playbackStartRef.current === null) playbackStartRef.current = now;
      const elapsed = now - playbackStartRef.current;
      const progress = Math.min(elapsed / PLAYBACK_DURATION_MS, 1);
      const eased = easeInOutCubic(progress);
      const currentYear = START_YEAR + eased * (END_YEAR - START_YEAR);

      setCapabilityPlaybackYear(Math.round(currentYear * 100) / 100);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCapabilityPlaybackYear(null);
        playbackStartRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [capabilityPlaybackYear === null ? "stopped" : "playing", setCapabilityPlaybackYear]);
  // ^ dep on a derived string so it only restarts on play/stop transitions

  // ── Milestone click → timeline selection ──
  const handleMilestoneClick = useCallback(
    (milestoneId: string) => {
      const linked = timeline.milestones.find((m) => m.milestone_id === milestoneId);
      if (linked) {
        selectTimelineItem(linked.milestone_id);
      }
    },
    [timeline.milestones, selectTimelineItem],
  );

  // ── Layer hover helpers ──
  const handleLayerEnter = useCallback(
    (layerId: string) => setCapabilityHoveredLayer(layerId),
    [setCapabilityHoveredLayer],
  );
  const handleLayerLeave = useCallback(
    () => setCapabilityHoveredLayer(null),
    [setCapabilityHoveredLayer],
  );

  // ── Compute where milestones sit in the stack for ReferenceDot y-positioning ──
  const milestoneDots = useMemo(() => {
    return CAPABILITY_MILESTONES.map((ms) => {
      const point = fullData.find((p) => Math.abs(p.year - ms.year) < 0.05);
      if (!point) return null;

      // Sum all layers up to and including this milestone's layer to get stacked Y
      let stackedY = 0;
      for (const id of LAYER_IDS) {
        stackedY += point[id as LayerId] ?? 0;
        if (id === ms.layerId) break;
      }

      return { ...ms, x: ms.year, y: stackedY };
    }).filter(Boolean) as Array<(typeof CAPABILITY_MILESTONES)[number] & { x: number; y: number }>;
  }, [fullData]);

  // Compute max Y for axis domain
  const maxY = useMemo(() => {
    const last = fullData[fullData.length - 1];
    if (!last) return 100;
    let total = 0;
    for (const id of LAYER_IDS) total += last[id as LayerId] ?? 0;
    return Math.ceil(total * 1.1);
  }, [fullData]);

  return (
    <div className="mt-5 space-y-4">
      {/* ── Playback controls ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-bm-border/40 bg-black/10 px-4 py-3 text-xs text-bm-muted2">
        <span className="font-semibold text-bm-text">Play Story</span>
        <button
          type="button"
          onClick={isPlaying ? stopPlayback : startPlayback}
          className="rounded-full border border-bm-border/40 px-3 py-1 transition hover:border-bm-border/70 hover:text-bm-text"
        >
          {isPlaying ? "Stop" : "Play"}
        </button>
        {isPlaying && capabilityPlaybackYear !== null ? (
          <span className="ml-auto text-bm-text">
            {Math.floor(capabilityPlaybackYear)}
          </span>
        ) : (
          <span className="ml-auto">Animate capability accumulation over time</span>
        )}
      </div>

      {/* ── Chart ── */}
      <div className="rounded-[24px] border border-bm-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4">
        <ResponsiveContainer width="100%" height={420}>
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 20, bottom: 10, left: 10 }}
          >
            <defs>
              {CAPABILITY_LAYERS.map((layer) => (
                <linearGradient key={layer.id} id={`cg-grad-${layer.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={layer.color} stopOpacity={layer.fillOpacity} />
                  <stop offset="95%" stopColor={layer.color} stopOpacity={0.03} />
                </linearGradient>
              ))}
              {/* Glow filter for high-order layers */}
              <filter id="cg-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <CartesianGrid
              stroke={GRID_STYLE.stroke}
              strokeDasharray={GRID_STYLE.strokeDasharray}
              strokeOpacity={GRID_STYLE.strokeOpacity}
              horizontal
              vertical={false}
            />

            {/* ── Company background bands ── */}
            {COMPANY_BANDS.map((band) => (
              <ReferenceArea
                key={band.label}
                x1={band.startYear}
                x2={band.endYear}
                fill={band.color}
                fillOpacity={1}
                stroke="none"
                label={{
                  value: band.label,
                  position: "insideTopLeft",
                  fill: "hsl(215, 12%, 52%)",
                  fontSize: 10,
                  offset: 8,
                }}
              />
            ))}

            <XAxis
              dataKey="year"
              type="number"
              domain={[START_YEAR, END_YEAR]}
              tickCount={14}
              tickFormatter={(v: number) => String(Math.round(v))}
              tick={AXIS_TICK_STYLE}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, maxY]}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={0}
            />

            <Tooltip
              content={<CapabilityGraphTooltip hoveredLayer={capabilityHoveredLayer} />}
              cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            />

            {/* ── Stacked areas (bottom → top) ── */}
            {CAPABILITY_LAYERS.map((layer) => {
              const isHovered = capabilityHoveredLayer === layer.id;
              const isDimmed =
                capabilityHoveredLayer !== null && capabilityHoveredLayer !== layer.id;

              return (
                <Area
                  key={layer.id}
                  type="monotone"
                  dataKey={layer.id}
                  stackId="capability"
                  stroke={layer.color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  fill={`url(#cg-grad-${layer.id})`}
                  fillOpacity={isDimmed ? 0.06 : isHovered ? 0.55 : 1}
                  strokeOpacity={isDimmed ? 0.15 : 1}
                  isAnimationActive={!isPlaying}
                  animationDuration={600}
                  style={{
                    transition: "fill-opacity 200ms, stroke-opacity 200ms",
                    filter: layer.glowIntensity > 0.3 && !isDimmed ? "url(#cg-glow)" : undefined,
                  }}
                  onMouseEnter={() => handleLayerEnter(layer.id)}
                  onMouseLeave={handleLayerLeave}
                />
              );
            })}

            {/* ── Milestone dots ── */}
            {!isPlaying &&
              milestoneDots.map((ms) => (
                <ReferenceDot
                  key={ms.id}
                  x={ms.x}
                  y={ms.y}
                  r={5}
                  fill="white"
                  stroke={getLayerById(ms.layerId)?.color ?? "white"}
                  strokeWidth={2}
                  onClick={() => handleMilestoneClick(ms.id)}
                  style={{ cursor: "pointer" }}
                />
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Layer legend ── */}
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
        {CAPABILITY_LAYERS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onMouseEnter={() => handleLayerEnter(layer.id)}
            onMouseLeave={handleLayerLeave}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 transition ${
              capabilityHoveredLayer === layer.id
                ? "border-white/30 bg-white/10 text-bm-text"
                : "border-bm-border/35 hover:border-white/20 hover:text-bm-text"
            }`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: layer.color }}
            />
            {layer.label}
          </button>
        ))}
      </div>

      {/* ── Milestone buttons ── */}
      <div className="flex flex-wrap gap-2">
        {CAPABILITY_MILESTONES.map((ms) => {
          const layer = getLayerById(ms.layerId);
          return (
            <button
              key={ms.id}
              type="button"
              onClick={() => handleMilestoneClick(ms.id)}
              className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted transition hover:border-white/25 hover:text-bm-text"
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: layer?.color ?? "white" }}
              />
              {ms.title}
            </button>
          );
        })}
      </div>

      {/* ── Hovered layer detail panel ── */}
      {capabilityHoveredLayer && !isPlaying ? (
        <HoveredLayerDetail layerId={capabilityHoveredLayer} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hovered layer detail — shows when hovering a layer in the legend or chart
// ---------------------------------------------------------------------------

function HoveredLayerDetail({ layerId }: { layerId: string }) {
  const layer = getLayerById(layerId);
  if (!layer) return null;

  const milestones = CAPABILITY_MILESTONES.filter((m) => m.layerId === layerId);

  return (
    <div
      className="rounded-2xl border border-bm-border/40 bg-black/20 px-5 py-4 backdrop-blur-sm"
      style={{ borderLeftColor: layer.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: layer.color }}
        />
        <h3 className="text-sm font-semibold text-bm-text">{layer.label}</h3>
        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Since {layer.startYear}
        </span>
      </div>
      <p className="mt-2 text-sm text-bm-muted">{layer.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {layer.tools.map((tool) => (
          <span
            key={tool}
            className="rounded-full border border-bm-border/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-bm-muted2"
          >
            {tool}
          </span>
        ))}
      </div>
      {layer.outcomes.length > 0 ? (
        <div className="mt-3 space-y-1">
          {layer.outcomes.map((outcome) => (
            <p key={outcome} className="text-xs text-bm-muted">
              {outcome}
            </p>
          ))}
        </div>
      ) : null}
      {milestones.length > 0 ? (
        <div className="mt-3 border-t border-bm-border/20 pt-3">
          {milestones.map((ms) => (
            <div key={ms.id} className="flex items-baseline gap-2 text-xs">
              <span className="font-medium text-bm-text">{ms.year}</span>
              <span className="text-bm-muted">{ms.title}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
