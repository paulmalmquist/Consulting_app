"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  trapChecks as defaultTrapChecks,
  positioningData as defaultPositioningData,
  mismatchData as defaultMismatchData,
  silenceEvents as defaultSilenceEvents,
} from "@/components/market/HistoryRhymesTab";
import type {
  TrapCheckRaw,
  PositioningItem,
  MismatchItem,
  SilenceEvent,
} from "@/lib/trading-lab/decision-engine-types";

/* ── Layer color map ── */
const LAYER_CLASSES: Record<string, { text: string; dot: string }> = {
  reality:   { text: "text-emerald-500", dot: "bg-emerald-500" },
  data:      { text: "text-sky-400", dot: "bg-sky-400" },
  narrative: { text: "text-amber-400", dot: "bg-amber-400" },
};

/* ── Trap Explanation Database ── */
const TRAP_EXPLANATIONS: Record<string, { explanation: string; action: string | null }> = {
  "Consensus Divergence": {
    explanation: "Measures agreement across the 5 forecasting agents. When 4+ agree, watch for groupthink.",
    action: null,
  },
  "Flow / Narrative": {
    explanation: "Compares what people say (bearish narrative) vs what they do (buying flows). Mismatch signals potential reversal.",
    action: "Bearish narrative but buying flows detected. Reduce conviction on short thesis.",
  },
  "Crowding Score": {
    explanation: "How concentrated positioning is. High crowding means the trade is popular and vulnerable to unwind.",
    action: "Office REIT shorts are crowded (0.68). Size down if short.",
  },
  "Honeypot Match": {
    explanation: "Nearest historical trap pattern. Higher score = current setup looks more like a past trap.",
    action: null,
  },
  "Info Provenance": {
    explanation: "Source quality of dominant narratives. Low-origin sources being amplified suggests manufactured consensus.",
    action: "3 low-origin sources amplified. Discount these narratives when making decisions.",
  },
  "Meta Level": {
    explanation: "How many layers of awareness exist. L1 = retail unaware. L2 = crowd-aware. L3 = institution-modeled.",
    action: null,
  },
};

interface TrapDetectorFullViewProps {
  trapChecks?: TrapCheckRaw[];
  positioningData?: PositioningItem[];
  mismatchData?: MismatchItem[];
  silenceEvents?: SilenceEvent[];
}

export function TrapDetectorFullView({
  trapChecks: propTrapChecks,
  positioningData: propPositioningData,
  mismatchData: propMismatchData,
  silenceEvents: propSilenceEvents,
}: TrapDetectorFullViewProps = {}) {
  const [expandedTrap, setExpandedTrap] = useState<string | null>(null);

  const trapChecks = propTrapChecks ?? defaultTrapChecks;
  const positioningData = propPositioningData ?? defaultPositioningData;
  const mismatchData = propMismatchData ?? defaultMismatchData;
  const silenceEvents = propSilenceEvents ?? defaultSilenceEvents;

  const warningCount = trapChecks.filter(
    (t) => t.variant === "warning" || t.variant === "danger"
  ).length;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
              Adversarial Analysis
            </p>
            <p className="text-xl font-bold font-mono text-bm-text">
              {warningCount} Active Trap{warningCount !== 1 ? "s" : ""} Detected
            </p>
            <p className="text-xs text-bm-muted mt-1">
              Honeypot patterns, crowding unwinds, narrative traps, and information provenance.
            </p>
          </div>
          <Badge variant={warningCount > 2 ? "danger" : warningCount > 0 ? "warning" : "success"}>
            {warningCount > 2 ? "HIGH ALERT" : warningCount > 0 ? "CAUTION" : "CLEAR"}
          </Badge>
        </div>
      </Card>

      {/* Trap Checks — Full Detail */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            6-Point Trap Check
          </p>
          <Badge variant="danger">{trapChecks.length} CHECKS</Badge>
        </div>
        <div className="space-y-2">
          {trapChecks.map((t) => {
            const info = TRAP_EXPLANATIONS[t.check];
            const isExpanded = expandedTrap === t.check;
            return (
              <div key={t.check} className="rounded-lg border border-bm-border/50 bg-bm-surface/20 overflow-hidden">
                <button
                  onClick={() => setExpandedTrap(isExpanded ? null : t.check)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-bm-surface/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-bm-text">{t.check}</span>
                    <Badge variant={t.variant}>{t.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-bm-muted2">{t.value}</span>
                    <span className="text-bm-muted2 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isExpanded && info && (
                  <div className="px-3 pb-3 border-t border-bm-border/30">
                    <p className="text-xs text-bm-muted mt-2 leading-relaxed">{info.explanation}</p>
                    {info.action && (
                      <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-400/20 p-2">
                        <p className="text-xs text-amber-300 font-semibold">Action Adjustment</p>
                        <p className="text-xs text-bm-muted mt-1">{info.action}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Crowding Heatmap */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            Crowding Heatmap
          </p>
          <Badge variant="accent">LIVE</Badge>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {positioningData.map((p) => {
            const crowdColor =
              p.crowding > 80
                ? "text-red-400"
                : p.crowding > 60
                  ? "text-amber-400"
                  : p.crowding > 40
                    ? "text-sky-400"
                    : "text-emerald-400";
            return (
              <div
                key={p.asset + p.metric}
                className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-bm-text">{p.asset}</span>
                  {p.extreme && <Badge variant="danger">EXTREME</Badge>}
                </div>
                <div className="flex gap-4 text-xs">
                  <div>
                    <span className="text-bm-muted2 block text-[9px]">{p.metric}</span>
                    <span className="font-mono text-bm-text">{p.value}</span>
                  </div>
                  <div>
                    <span className="text-bm-muted2 block text-[9px]">Direction</span>
                    <span className={`font-mono ${crowdColor}`}>{p.direction}</span>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="text-bm-muted2 block text-[9px]">Crowding</span>
                    <span className={`text-lg font-bold font-mono ${crowdColor}`}>{p.crowding}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Mismatch Engine */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            Reality ↔ Narrative Mismatch Engine
          </p>
          <Badge variant="danger">DIVERGENCE</Badge>
        </div>
        <div className="space-y-3">
          {mismatchData.map((m) => (
            <div
              key={m.topic}
              className={`rounded-lg border p-3 bg-bm-surface/20 ${
                m.mismatch > 0.7 ? "border-red-400/30" : "border-bm-border/70"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-bm-text">{m.topic}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-bm-muted2">MISMATCH</span>
                  <span
                    className={`text-sm font-bold font-mono ${
                      m.mismatch > 0.7
                        ? "text-red-400"
                        : m.mismatch > 0.5
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {m.mismatch.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { layer: "reality", text: m.reality },
                    { layer: "data", text: m.data },
                    { layer: "narrative", text: m.narrative },
                  ] as const
                ).map((l) => (
                  <div
                    key={l.layer}
                    className={`rounded-md bg-bm-surface/30 p-2 border-l-2 ${
                      l.layer === "reality"
                        ? "border-emerald-500"
                        : l.layer === "data"
                          ? "border-sky-400"
                          : "border-amber-400"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${LAYER_CLASSES[l.layer]?.dot}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${LAYER_CLASSES[l.layer]?.text}`}>
                        {l.layer}
                      </span>
                    </div>
                    <p className="text-xs text-bm-text leading-relaxed">{l.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Silence Detector */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
            Silence Detector
          </p>
          <Badge>SCAN</Badge>
        </div>
        <p className="text-[10px] text-bm-muted2 mb-3">
          Narratives that were dominant and suddenly went quiet — often signals that positioning is complete.
        </p>
        {silenceEvents.map((s) => (
          <div key={s.label} className="flex items-center gap-3 py-2.5 border-b border-bm-border/30">
            <div className="flex-1">
              <span className="text-xs font-semibold text-bm-text">{s.label}</span>
            </div>
            <div className="w-28">
              <div className="h-1.5 flex items-center">
                <div className="h-1 rounded bg-amber-400/50" style={{ width: `${s.priorIntensity}%` }} />
              </div>
              <div className="h-1.5 flex items-center">
                <div className="h-1 rounded bg-pink-400" style={{ width: `${s.currentIntensity}%` }} />
              </div>
              <div className="flex justify-between text-[8px] text-bm-muted2">
                <span>Before</span>
                <span>Now</span>
              </div>
            </div>
            <span className="font-mono text-xs text-red-400 w-10 text-right">{s.dropoff}%</span>
            <div className="text-right w-16">
              <span className="text-[9px] text-bm-muted2 block">Signif.</span>
              <span
                className={`font-mono text-xs ${s.significance > 0.8 ? "text-red-400" : "text-amber-400"}`}
              >
                {s.significance.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
