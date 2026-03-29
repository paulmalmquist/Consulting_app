"use client";

import React, { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

/* ── Design System (self-contained dark theme matching the WSS spec) ── */

const C = {
  bg: "#06080d", bg2: "#0c1018", surface: "#111827", surfHi: "#1a2332",
  bdr: "#1e2d3d", bdrHi: "#2a3f55", text: "#e2e8f0", muted: "#64748b", dim: "#475569",
  cyan: "#06b6d4", cyanDim: "#0e7490",
  green: "#10b981", greenDim: "#065f46",
  red: "#ef4444", redDim: "#991b1b",
  amber: "#f59e0b", amberDim: "#78350f",
  purple: "#8b5cf6", purpleDim: "#4c1d95",
  blue: "#3b82f6", blueDim: "#1e40af",
  pink: "#ec4899", pinkDim: "#9d174d",
  lime: "#84cc16",
};

const LAYER_COLORS: Record<string, string> = {
  reality: C.green, data: C.blue, narrative: C.amber, positioning: C.purple, meta: C.red,
};

/* ── Mock Data ─────────────────────────────────────────────────── */

const analogOverlay = Array.from({ length: 60 }, (_, i) => {
  const b = Math.sin(i * 0.1) * 5;
  return {
    day: i - 30,
    current: 100 + b + i * 0.3 + (Math.random() - .5) * 2,
    gfc: 100 + b * 1.2 - i * 0.8 + (Math.random() - .5) * 3,
    crypto22: 100 + b * .8 - i * .4 + (Math.random() - .5) * 2.5,
  };
});

const realitySignals = [
  { domain: "Labor", signal: "Tech job postings", value: -12, accel: -3.2, trend: "down", confidence: 0.82 },
  { domain: "Labor", signal: "Construction hiring", value: -8, accel: -1.1, trend: "down", confidence: 0.74 },
  { domain: "Logistics", signal: "Freight rates (Drewry WCI)", value: -22, accel: +4.5, trend: "decel. decline", confidence: 0.88 },
  { domain: "Energy", signal: "Industrial elec. demand", value: +1.3, accel: -0.8, trend: "flat", confidence: 0.71 },
  { domain: "Consumer", signal: "Airfare pricing index", value: +6, accel: +2.1, trend: "up", confidence: 0.79 },
  { domain: "Housing", signal: "Crane count (top 20 MSAs)", value: -15, accel: -5.3, trend: "down", confidence: 0.85 },
  { domain: "Consumer", signal: "BNPL usage growth", value: +18, accel: +6.7, trend: "accelerating", confidence: 0.77 },
];

const dataSignals = [
  { metric: "CPI YoY", reported: 3.1, expected: 3.0, surprise: +0.1, trend: "sticky", revision: "none" },
  { metric: "Core PCE", reported: 2.8, expected: 2.7, surprise: +0.1, trend: "sticky", revision: "none" },
  { metric: "Nonfarm Payrolls", reported: 151, expected: 170, surprise: -19, trend: "cooling", revision: "-26K prior" },
  { metric: "PMI Mfg", reported: 49.2, expected: 50.1, surprise: -0.9, trend: "contraction", revision: "none" },
  { metric: "Housing Starts", reported: 1.37, expected: 1.42, surprise: -0.05, trend: "declining", revision: "-30K prior" },
  { metric: "CMBS Delinq.", reported: 12.3, expected: 11.8, surprise: +0.5, trend: "rising", revision: "+0.2 prior" },
];

const narrativeState = [
  { label: "Soft Landing", intensity: 72, velocity: -8, lifecycle: "exhaustion", crowding: 85, manipulation: 0.3 },
  { label: "AI Bubble", intensity: 61, velocity: +12, lifecycle: "emerging", crowding: 45, manipulation: 0.2 },
  { label: "CRE Apocalypse", intensity: 58, velocity: -3, lifecycle: "crowded", crowding: 78, manipulation: 0.4 },
  { label: "Crypto Supercycle", intensity: 44, velocity: +22, lifecycle: "early", crowding: 31, manipulation: 0.5 },
  { label: "Stagflation Risk", intensity: 35, velocity: +7, lifecycle: "emerging", crowding: 22, manipulation: 0.1 },
  { label: "Rate Cut Rally", intensity: 68, velocity: -15, lifecycle: "exhaustion", crowding: 91, manipulation: 0.6 },
];

const positioningData = [
  { asset: "SPY", metric: "Put/Call", value: "0.82", crowding: 62, extreme: false, direction: "neutral" },
  { asset: "QQQ", metric: "Net Gamma", value: "-2.1B", crowding: 78, extreme: true, direction: "negative" },
  { asset: "BTC", metric: "Funding Rate", value: "0.012%", crowding: 55, extreme: false, direction: "long" },
  { asset: "ETH", metric: "Exchange Flows", value: "-42K", crowding: 38, extreme: false, direction: "accumulation" },
  { asset: "Office REITs", metric: "Short Interest", value: "18.2%", crowding: 89, extreme: true, direction: "short" },
  { asset: "HY Credit", metric: "Fund Flows", value: "-$1.2B", crowding: 71, extreme: true, direction: "outflows" },
  { asset: "Stablecoins", metric: "Supply +30d", value: "+$3.8B", crowding: 25, extreme: false, direction: "expansion" },
  { asset: "Gold", metric: "CFTC Net Long", value: "312K", crowding: 82, extreme: true, direction: "crowded long" },
];

const silenceEvents = [
  { label: "China Property Crisis", priorIntensity: 78, currentIntensity: 12, dropoff: -85, significance: 0.91 },
  { label: "Bank Term Funding", priorIntensity: 65, currentIntensity: 8, dropoff: -88, significance: 0.87 },
  { label: "Japan Carry Trade", priorIntensity: 71, currentIntensity: 15, dropoff: -79, significance: 0.83 },
  { label: "CMBS Maturity Wall", priorIntensity: 55, currentIntensity: 18, dropoff: -67, significance: 0.76 },
  { label: "Student Loan Restart", priorIntensity: 60, currentIntensity: 5, dropoff: -92, significance: 0.72 },
];

const mismatchData = [
  { topic: "Consumer Health", reality: "BNPL +18%, card delinq rising", data: "Retail sales +0.4%", narrative: "Consumer resilient", mismatch: 0.78 },
  { topic: "Labor Market", reality: "Tech freeze, construction -8%", data: "NFP +151K (miss)", narrative: "Jobs still strong", mismatch: 0.72 },
  { topic: "Office CRE", reality: "Cranes -15%, leasing quiet", data: "CMBS delinq 12.3%", narrative: "Bottom forming", mismatch: 0.85 },
  { topic: "Crypto Cycle", reality: "Stablecoin supply expanding", data: "ETF flows positive", narrative: "Bear market", mismatch: 0.69 },
  { topic: "Rate Path", reality: "BNPL stress, freight falling", data: "CPI sticky 3.1%", narrative: "Higher for longer", mismatch: 0.55 },
];

const agentData = [
  { agent: "Macro", dir: "Bearish", conf: 68, brier: 0.19, wt: 28 },
  { agent: "Quant", dir: "Neutral", conf: 52, brier: 0.21, wt: 22 },
  { agent: "Narrative", dir: "Bearish", conf: 71, brier: 0.17, wt: 24 },
  { agent: "Contrarian", dir: "Bullish", conf: 61, brier: 0.23, wt: 14 },
  { agent: "Red Team", dir: "TRAP", conf: 73, brier: 0.15, wt: 12 },
];

const radarDims = [
  { d: "Reality", current: 0.78, gfc: 0.88, crypto22: 0.72 },
  { d: "Data", current: 0.65, gfc: 0.91, crypto22: 0.55 },
  { d: "Narrative", current: 0.71, gfc: 0.81, crypto22: 0.85 },
  { d: "Positioning", current: 0.82, gfc: 0.95, crypto22: 0.88 },
  { d: "Meta-Game", current: 0.58, gfc: 0.72, crypto22: 0.69 },
  { d: "Acceleration", current: 0.73, gfc: 0.85, crypto22: 0.76 },
];

const brierHist = Array.from({ length: 24 }, (_, i) => ({
  w: `W${i + 1}`,
  agg: 0.21 - i * 0.0008 + (Math.random() - .5) * 0.03,
  base: 0.25,
  narrative: 0.17 + (Math.random() - .5) * 0.04,
}));

const trapChecks = [
  { check: "Consensus Divergence", status: "CLEAR", value: "3/5 agents agree", color: C.green },
  { check: "Flow / Narrative", status: "MISMATCH", value: "Bearish narrative, buying flows", color: C.amber },
  { check: "Crowding Score", status: "ELEVATED", value: "0.68 - Office REIT shorts", color: C.amber },
  { check: "Honeypot Match", status: "CLEAR", value: "Nearest: 0.61 (FTX bottom)", color: C.green },
  { check: "Info Provenance", status: "WARNING", value: "3 low-origin sources amplified", color: C.red },
  { check: "Meta Level", status: "L2", value: "Crowd-aware, not institution-modeled", color: C.purple },
];

/* ── Primitives ────────────────────────────────────────────────── */

const Badge = ({ children, color = C.cyan, glow = false }: { children: React.ReactNode; color?: string; glow?: boolean }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "4px",
    fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
    background: color + "1a", color, border: `1px solid ${color}33`,
    boxShadow: glow ? `0 0 8px ${color}44` : "none",
  }}>{children}</span>
);

const MetricCard = ({ label, value, sub, color = C.cyan }: { label: string; value: string; sub: string; color?: string }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.bdr}`, borderRadius: "8px", padding: "12px 14px", flex: 1, minWidth: "130px" }}>
    <div style={{ fontSize: "9.5px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>{label}</div>
    <div style={{ fontSize: "22px", fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: "10px", color: C.dim, marginTop: "2px" }}>{sub}</div>}
  </div>
);

const Panel = ({ title, badge, children, accent, style = {} }: { title: string; badge?: React.ReactNode; children: React.ReactNode; accent?: string; style?: React.CSSProperties }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.bdr}`, borderRadius: "10px", overflow: "hidden", borderTop: accent ? `2px solid ${accent}` : undefined, ...style }}>
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.bdr}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{title}</span>
      {badge}
    </div>
    <div style={{ padding: "14px" }}>{children}</div>
  </div>
);

const Mono = ({ children, color = C.muted }: { children: React.ReactNode; color?: string }) => (
  <span style={{ fontFamily: "monospace", fontSize: "11px", color }}>{children}</span>
);

const Dot = ({ color, pulse = false }: { color: string; pulse?: boolean }) => (
  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: pulse ? `0 0 6px ${color}` : "none" }} />
);

const LayerDot = ({ layer }: { layer: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: LAYER_COLORS[layer] }} />
    <span style={{ fontSize: "9px", fontWeight: 700, color: LAYER_COLORS[layer], textTransform: "uppercase", letterSpacing: "0.06em" }}>{layer}</span>
  </span>
);

/* ── Sub-views ─────────────────────────────────────────────────── */

const SUB_TABS = [
  { id: "signals", label: "Signal Layers", icon: "\u25C8", desc: "Reality / Data / Narrative" },
  { id: "mismatch", label: "Mismatch Engine", icon: "\u26A1", desc: "Divergence + Silence" },
  { id: "positioning", label: "Positioning & Traps", icon: "\u25C9", desc: "Crowding + Meta-Game" },
  { id: "rhyme", label: "Analog Forecast", icon: "\u221E", desc: "Match + Scenarios" },
];

function SignalLayersView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MetricCard label="Divergence Score" value="0.74" sub="Reality != Narrative on 3/5 topics" color={C.amber} />
        <MetricCard label="Acceleration Alerts" value="4" sub="2nd derivative anomalies" color={C.red} />
        <MetricCard label="Silence Events" value="5" sub="Major narratives gone quiet" color={C.pink} />
        <MetricCard label="Regime Signal" value="LATE" sub="Dalio Phase 3 - tightening stress" color={C.purple} />
      </div>

      <Panel title="Layer 1 - Reality (Pre-Data Behavioral Signals)" badge={<Badge color={C.green} glow>LIVE</Badge>} accent={C.green}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {realitySignals.map(s => (
            <div key={s.signal} style={{ padding: "10px 12px", background: C.bg2, borderRadius: 6, border: `1px solid ${Math.abs(s.accel) > 3 ? C.amber + '55' : C.bdr}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{s.signal}</span>
                <Badge color={C.green}>{s.domain}</Badge>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div><div style={{ fontSize: 9, color: C.dim }}>YoY</div><Mono color={s.value > 0 ? C.green : C.red}>{s.value > 0 ? "+" : ""}{s.value}%</Mono></div>
                <div><div style={{ fontSize: 9, color: C.dim }}>Accel</div><Mono color={Math.abs(s.accel) > 3 ? C.amber : C.muted}>{s.accel > 0 ? "+" : ""}{s.accel}</Mono></div>
                <div><div style={{ fontSize: 9, color: C.dim }}>Trend</div><Mono>{s.trend}</Mono></div>
                <div style={{ marginLeft: "auto" }}><div style={{ fontSize: 9, color: C.dim }}>Conf</div><Mono color={C.cyan}>{(s.confidence * 100).toFixed(0)}%</Mono></div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Layer 2 - Data (Reported Metrics + Surprises)" badge={<Badge color={C.blue}>BATCH</Badge>} accent={C.blue}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 70px 90px 90px", padding: "4px 0", fontSize: 9, color: C.dim }}>
            <span>Metric</span><span>Reported</span><span>Expected</span><span>Surprise</span><span>Trend</span><span>Revision</span>
          </div>
          {dataSignals.map(d => (
            <div key={d.metric} style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 70px 90px 90px", padding: "7px 0", borderBottom: `1px solid ${C.bdr}`, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{d.metric}</span>
              <Mono>{d.reported}</Mono>
              <Mono color={C.dim}>{d.expected}</Mono>
              <Mono color={d.surprise > 0 ? C.red : C.green}>{d.surprise > 0 ? "+" : ""}{d.surprise}</Mono>
              <Mono>{d.trend}</Mono>
              <Mono color={d.revision !== "none" ? C.amber : C.dim}>{d.revision}</Mono>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Layer 3 - Narrative (Lifecycle + Crowding)" badge={<Badge color={C.amber}>NLP</Badge>} accent={C.amber}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {narrativeState.map(n => (
            <div key={n.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", background: C.bg2, borderRadius: 6 }}>
              <div style={{ width: 140 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{n.label}</div></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${n.intensity}%`, height: "100%", background: `linear-gradient(90deg, ${C.amber}55, ${C.amber})`, borderRadius: 3 }} />
                  </div>
                  <Mono color={C.amber}>{n.intensity}</Mono>
                </div>
              </div>
              <div style={{ textAlign: "center", width: 60 }}><div style={{ fontSize: 9, color: C.dim }}>Velocity</div><Mono color={n.velocity > 0 ? C.green : C.red}>{n.velocity > 0 ? "+" : ""}{n.velocity}</Mono></div>
              <div style={{ textAlign: "center", width: 80 }}>
                <Badge color={n.lifecycle === "exhaustion" ? C.red : n.lifecycle === "crowded" ? C.amber : n.lifecycle === "emerging" ? C.cyan : C.green}>{n.lifecycle}</Badge>
              </div>
              <div style={{ textAlign: "center", width: 50 }}><div style={{ fontSize: 9, color: C.dim }}>Crowd</div><Mono color={n.crowding > 70 ? C.red : C.muted}>{n.crowding}</Mono></div>
              <div style={{ textAlign: "center", width: 50 }}><div style={{ fontSize: 9, color: C.dim }}>Manip</div><Mono color={n.manipulation > 0.4 ? C.red : C.dim}>{n.manipulation.toFixed(1)}</Mono></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MismatchView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MetricCard label="Active Mismatches" value="4 / 5" sub="Reality != Narrative on most topics" color={C.red} />
        <MetricCard label="Highest Mismatch" value="0.85" sub="Office CRE - narrative diverges from reality" color={C.amber} />
        <MetricCard label="Silence Events" value="5" sub="Major narratives gone dark" color={C.pink} />
      </div>
      <Panel title="Reality vs Data vs Narrative - Mismatch Engine" badge={<Badge color={C.red} glow>DIVERGENCE</Badge>} accent={C.red}>
        {mismatchData.map(m => (
          <div key={m.topic} style={{ marginBottom: 12, padding: 12, background: C.bg2, borderRadius: 8, border: `1px solid ${m.mismatch > 0.7 ? C.red + '44' : C.bdr}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{m.topic}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: C.dim }}>MISMATCH</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: m.mismatch > 0.7 ? C.red : m.mismatch > 0.5 ? C.amber : C.green }}>{m.mismatch.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {([
                { layer: "reality", text: m.reality },
                { layer: "data", text: m.data },
                { layer: "narrative", text: m.narrative },
              ] as const).map(l => (
                <div key={l.layer} style={{ padding: "8px 10px", background: C.surface, borderRadius: 6, borderLeft: `3px solid ${LAYER_COLORS[l.layer]}` }}>
                  <LayerDot layer={l.layer} />
                  <div style={{ fontSize: 11, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{l.text}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Panel>
      <Panel title="Silence Detector - Vanished Narratives" badge={<Badge color={C.pink}>SCAN</Badge>} accent={C.pink}>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 10 }}>Narratives that were dominant and suddenly went quiet - often signals that positioning is complete.</div>
        {silenceEvents.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.bdr}` }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{s.label}</div></div>
            <div style={{ width: 100 }}>
              <div style={{ height: 12, display: "flex", alignItems: "center" }}><div style={{ width: `${s.priorIntensity}%`, height: 5, background: C.amber + "88", borderRadius: 2 }} /></div>
              <div style={{ height: 12, display: "flex", alignItems: "center" }}><div style={{ width: `${s.currentIntensity}%`, height: 5, background: C.pink, borderRadius: 2 }} /></div>
              <div style={{ fontSize: 8, color: C.dim, display: "flex", justifyContent: "space-between" }}><span>Before</span><span>Now</span></div>
            </div>
            <Mono color={C.red}>{s.dropoff}%</Mono>
            <div style={{ textAlign: "right", width: 80 }}><div style={{ fontSize: 9, color: C.dim }}>Significance</div><Mono color={s.significance > 0.8 ? C.red : C.amber}>{s.significance.toFixed(2)}</Mono></div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function PositioningView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MetricCard label="Extreme Positions" value="4" sub="Office shorts, Gold longs, QQQ gamma, HY outflows" color={C.red} />
        <MetricCard label="Under-Owned" value="Stablecoins" sub="Crowding: 25 - expanding supply, low participation" color={C.green} />
        <MetricCard label="Max Crowding" value="91" sub="Rate Cut Rally narrative" color={C.red} />
      </div>
      <Panel title="Positioning Heatmap - Where Is Capital Crowded?" badge={<Badge color={C.purple} glow>LIVE</Badge>} accent={C.purple}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {positioningData.map(p => {
            const col = p.crowding > 80 ? C.red : p.crowding > 60 ? C.amber : p.crowding > 40 ? C.cyan : C.green;
            return (
              <div key={p.asset + p.metric} style={{ padding: "12px 14px", background: C.bg2, borderRadius: 8, border: `1px solid ${p.extreme ? C.red + '55' : C.bdr}`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: `${p.crowding}%`, height: "100%", background: col + "08", borderRadius: 8 }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.asset}</span>
                    {p.extreme && <Badge color={C.red} glow>EXTREME</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div><div style={{ fontSize: 9, color: C.dim }}>{p.metric}</div><Mono color={C.text}>{p.value}</Mono></div>
                    <div><div style={{ fontSize: 9, color: C.dim }}>Direction</div><Mono color={col}>{p.direction}</Mono></div>
                    <div style={{ marginLeft: "auto" }}><div style={{ fontSize: 9, color: C.dim }}>Crowding</div><span style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: col }}>{p.crowding}</span></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Agent Consensus" badge={<Badge color={C.cyan}>5 AGENTS</Badge>}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 60px 40px 40px 40px", padding: "4px 0", fontSize: 9, color: C.dim }}>
            <span>Agent</span><span>Dir</span><span>Conf</span><span>Brier</span><span>Wt</span>
          </div>
          {agentData.map(a => (
            <div key={a.agent} style={{ display: "grid", gridTemplateColumns: "70px 60px 40px 40px 40px", padding: "6px 0", borderBottom: `1px solid ${C.bdr}`, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{a.agent}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: a.dir === "Bullish" ? C.green : a.dir === "Bearish" ? C.red : a.dir === "TRAP" ? C.amber : C.muted }}>{a.dir}</span>
              <Mono>{a.conf}%</Mono>
              <Mono color={a.brier < 0.2 ? C.green : C.muted}>{a.brier}</Mono>
              <Mono color={C.dim}>{a.wt}%</Mono>
            </div>
          ))}
        </Panel>
        <Panel title="Trap Detector - Subsystem Checks" badge={<Badge color={C.red}>6 CHECKS</Badge>}>
          {trapChecks.map(t => (
            <div key={t.check} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.bdr}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{t.check}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Mono color={C.dim}>{t.value}</Mono>
                <Badge color={t.color}>{t.status}</Badge>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function RhymeEngineView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MetricCard label="Top Rhyme Score" value="0.78" sub="2022 Rate Cycle analog" color={C.cyan} />
        <MetricCard label="Divergence" value="0.74" sub="Reality != Narrative on 3/5" color={C.amber} />
        <MetricCard label="Trap Status" value="2 WARN" sub="Flow mismatch + provenance" color={C.amber} />
        <MetricCard label="Agg Brier (90d)" value="0.18" sub="Better than 0.25 baseline" color={C.green} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Panel title="Trajectory Overlay - Current vs Analogs" badge={<Badge>60-DAY</Badge>}>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={analogOverlay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} />
              <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.bdr }} />
              <YAxis tick={{ fill: C.dim, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.bdr }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, color: C.text }} />
              <Line type="monotone" dataKey="current" stroke={C.cyan} strokeWidth={2.5} dot={false} name="Current" />
              <Line type="monotone" dataKey="gfc" stroke={C.red} strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="GFC 2008" opacity={0.7} />
              <Line type="monotone" dataKey="crypto22" stroke={C.purple} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Crypto 2022" opacity={0.7} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="5-Layer Dimensional Match" badge={<Badge color={C.purple}>RADAR</Badge>}>
          <ResponsiveContainer width="100%" height={230}>
            <RadarChart data={radarDims}>
              <PolarGrid stroke={C.bdr} />
              <PolarAngleAxis dataKey="d" tick={{ fill: C.muted, fontSize: 9 }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 1]} />
              <Radar name="Current" dataKey="current" stroke={C.cyan} fill={C.cyan} fillOpacity={0.12} strokeWidth={2} />
              <Radar name="GFC" dataKey="gfc" stroke={C.red} fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              <Radar name="Crypto 22" dataKey="crypto22" stroke={C.purple} fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel title="Brier Score Calibration - 24 Week Rolling" badge={<Badge color={C.green}>TRACKING</Badge>}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={brierHist} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.bdr} />
            <XAxis dataKey="w" tick={{ fill: C.dim, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.bdr }} interval={3} />
            <YAxis tick={{ fill: C.dim, fontSize: 9 }} tickLine={false} axisLine={{ stroke: C.bdr }} domain={[0.05, 0.35]} />
            <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.bdr}`, borderRadius: 6, fontSize: 11, color: C.text }} />
            <Area type="monotone" dataKey="base" stroke={C.red} fill={C.red} fillOpacity={0.04} strokeDasharray="4 4" name="Coin Flip" />
            <Area type="monotone" dataKey="agg" stroke={C.cyan} fill={C.cyan} fillOpacity={0.08} strokeWidth={2} name="Aggregate" />
            <Line type="monotone" dataKey="narrative" stroke={C.green} strokeWidth={1} dot={false} name="Narrative Agent" opacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: C.dim }}>Lower = better. Red dashed = 50/50 coin flip. Target: &lt;0.20</div>
      </Panel>
      <Panel title="Current Forecast Output" badge={<Badge color={C.cyan} glow>LIVE</Badge>} accent={C.cyan}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "BULL", prob: 20, ret: "+12%", color: C.green, note: "Requires dovish pivot + CRE stabilization" },
            { label: "BASE", prob: 52, ret: "-3%", color: C.cyan, note: "Grinding chop, data-dependent Fed, slow deterioration" },
            { label: "BEAR", prob: 28, ret: "-18%", color: C.red, note: "CRE contagion, credit tightening, positioning unwind" },
          ].map(s => (
            <div key={s.label} style={{ padding: 14, background: C.bg2, borderRadius: 8, border: `1px solid ${s.color}33`, textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: "0.1em", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "monospace", color: s.color }}>{s.prob}%</div>
              <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{s.ret}</div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 6, lineHeight: 1.4 }}>{s.note}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ── Main Export ────────────────────────────────────────────────── */

export function HistoryRhymesTab() {
  const [subTab, setSubTab] = useState("signals");

  return (
    <div style={{ color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      {/* 5-Layer Status Bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {Object.entries(LAYER_COLORS).map(([layer, color]) => (
          <div key={layer} style={{
            flex: 1, padding: "6px 10px", background: color + "0a", border: `1px solid ${color}22`, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Dot color={color} pulse />
            <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{layer}</span>
          </div>
        ))}
      </div>

      {/* Sub-Tab Bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 18, background: C.surface, borderRadius: 8, padding: 3, border: `1px solid ${C.bdr}` }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            flex: 1, padding: "10px 12px", background: subTab === t.id ? C.surfHi : "transparent",
            border: subTab === t.id ? `1px solid ${C.bdrHi}` : "1px solid transparent", borderRadius: 6,
            color: subTab === t.id ? C.text : C.dim, fontSize: 11, fontWeight: subTab === t.id ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.01em", textAlign: "center",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <span style={{ marginRight: 5, fontSize: 13 }}>{t.icon}</span>
            {t.label}
            <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {subTab === "signals" && <SignalLayersView />}
      {subTab === "mismatch" && <MismatchView />}
      {subTab === "positioning" && <PositioningView />}
      {subTab === "rhyme" && <RhymeEngineView />}
    </div>
  );
}
