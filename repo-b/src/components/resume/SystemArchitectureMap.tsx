"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { ResumeSystemComponent } from "@/lib/bos-api";
import { usePerspective } from "./PerspectiveContext";

const LAYER_ORDER = ["governance", "bi_layer", "ai_layer", "investment_engine", "data_platform"] as const;

const LAYER_LABELS: Record<string, string> = {
  governance: "Governance",
  bi_layer: "BI Layer",
  ai_layer: "AI Layer",
  investment_engine: "Investment Engine",
  data_platform: "Data Platform",
};

const LAYER_COLORS: Record<string, string> = {
  governance: "border-amber-500/40 bg-amber-500/5",
  bi_layer: "border-purple-500/40 bg-purple-500/5",
  ai_layer: "border-sky-500/40 bg-sky-500/5",
  investment_engine: "border-emerald-500/40 bg-emerald-500/5",
  data_platform: "border-blue-500/40 bg-blue-500/5",
};

const LAYER_ACCENT: Record<string, string> = {
  governance: "text-amber-400",
  bi_layer: "text-purple-400",
  ai_layer: "text-sky-400",
  investment_engine: "text-emerald-400",
  data_platform: "text-blue-400",
};

const ICON_MAP: Record<string, string> = {
  database: "cylinder",
  cloud: "cloud",
  server: "server",
  brain: "brain",
  search: "search",
  tool: "wrench",
  calculator: "calc",
  chart: "chart",
  map: "map",
  "bar-chart": "bar",
  layout: "layout",
  shield: "shield",
  lock: "lock",
};

function NodeIcon({ iconKey }: { iconKey: string | null }) {
  const icon = iconKey ? ICON_MAP[iconKey] || iconKey : "box";
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-mono text-bm-muted2">
      {icon.slice(0, 3).toUpperCase()}
    </div>
  );
}

interface Props {
  components: ResumeSystemComponent[];
}

export default function SystemArchitectureMap({ components }: Props) {
  const { perspective } = usePerspective();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; label: string }>>([]);

  const byLayer = useMemo(() => {
    const map: Record<string, ResumeSystemComponent[]> = {};
    for (const c of components) {
      if (!map[c.layer]) map[c.layer] = [];
      map[c.layer].push(c);
    }
    return map;
  }, [components]);

  const selected = useMemo(
    () => components.find((c) => c.component_id === selectedId) ?? null,
    [components, selectedId],
  );

  const computeLines = useCallback(() => {
    const container = containerRef.current;
    if (!container || components.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const newLines: typeof lines = [];

    for (const comp of components) {
      const sourceEl = nodeRefs.current.get(comp.component_id);
      if (!sourceEl || !comp.connections?.length) continue;

      const sourceRect = sourceEl.getBoundingClientRect();
      const sx = sourceRect.left + sourceRect.width / 2 - containerRect.left;
      const sy = sourceRect.top + sourceRect.height / 2 - containerRect.top;

      for (const conn of comp.connections) {
        const targetComps = byLayer[conn.target_layer];
        if (!targetComps?.length) continue;

        const targetEl = nodeRefs.current.get(targetComps[0].component_id);
        if (!targetEl) continue;

        const targetRect = targetEl.getBoundingClientRect();
        const tx = targetRect.left + targetRect.width / 2 - containerRect.left;
        const ty = targetRect.top + targetRect.height / 2 - containerRect.top;

        newLines.push({ x1: sx, y1: sy, x2: tx, y2: ty, label: conn.label });
      }
    }

    setLines(newLines);
  }, [components, byLayer]);

  useEffect(() => {
    const timer = setTimeout(computeLines, 100);
    window.addEventListener("resize", computeLines);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", computeLines);
    };
  }, [computeLines]);

  const setNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      nodeRefs.current.set(id, el);
    } else {
      nodeRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-6">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-bm-muted2">
        System Architecture
      </h2>
      <p className="mb-6 text-sm text-bm-muted">
        {perspective === "executive"
          ? "Business outcomes delivered by each system layer"
          : perspective === "investor"
            ? "Scale and ROI across the technology stack"
            : "Technical components and their interconnections"}
      </p>

      {/* Architecture diagram */}
      <div ref={containerRef} className="relative min-h-[420px]">
        {/* SVG connector lines */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
        </svg>

        {/* Layer rows */}
        <div className="relative space-y-3">
          {LAYER_ORDER.map((layer) => {
            const layerComps = byLayer[layer] || [];
            if (layerComps.length === 0) return null;

            return (
              <div key={layer}>
                {/* Layer header */}
                <div className="mb-2 flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${LAYER_ACCENT[layer]}`}>
                    {LAYER_LABELS[layer]}
                  </span>
                  <div className="h-px flex-1 bg-bm-border/30" />
                </div>

                {/* Nodes */}
                <div className="flex flex-wrap gap-2">
                  {layerComps.map((comp) => (
                    <div
                      key={comp.component_id}
                      ref={(el) => setNodeRef(comp.component_id, el)}
                      onClick={() =>
                        setSelectedId(
                          selectedId === comp.component_id ? null : comp.component_id,
                        )
                      }
                      className={`cursor-pointer rounded-lg border px-3 py-2 transition-all hover:bg-bm-surface/50 ${
                        LAYER_COLORS[layer]
                      } ${
                        selectedId === comp.component_id
                          ? "ring-2 ring-sky-400/50 shadow-lg shadow-sky-500/10"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <NodeIcon iconKey={comp.icon_key} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{comp.name}</p>
                          {perspective === "engineer" && comp.tools.length > 0 && (
                            <p className="text-[10px] text-bm-muted2 truncate">
                              {comp.tools.slice(0, 3).join(" · ")}
                            </p>
                          )}
                          {perspective === "executive" && comp.outcomes.length > 0 && (
                            <p className="text-[10px] text-bm-muted2 truncate">
                              {comp.outcomes[0]}
                            </p>
                          )}
                          {perspective === "investor" && comp.outcomes.length > 0 && (
                            <p className="text-[10px] text-bm-muted2 truncate">
                              {comp.outcomes[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200 rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm">{selected.name}</p>
              <p className={`text-[10px] font-medium uppercase tracking-wider ${LAYER_ACCENT[selected.layer]}`}>
                {LAYER_LABELS[selected.layer]}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs text-bm-muted2 hover:text-bm-muted"
            >
              Close
            </button>
          </div>

          {selected.description && (
            <p className="mt-2 text-sm text-bm-muted">{selected.description}</p>
          )}

          {/* Tools (shown for engineer + investor) */}
          {(perspective === "engineer" || perspective === "investor") && selected.tools.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2 mb-1">Tools</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-bm-border/70 px-2 py-0.5 text-[10px] text-bm-muted2"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Outcomes (always shown) */}
          {selected.outcomes.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-bm-muted2 mb-1">Outcomes</p>
              <ul className="space-y-1">
                {selected.outcomes.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm text-bm-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
