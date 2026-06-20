"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";

import { C, Panel, Tag, StatGrid, SplitGrid } from "./primitives";
import { telemetryHref } from "./telemetryNav";
import { IMPL_LABEL, VERIFY_LABEL, type ImplStatus, type VerifyStatus } from "./howItWorksData";
import { FLOW_SCENARIOS, FLOW_LANES, FLOW_EXPLORER_CAPTION, type FlowScenario, type FlowStep } from "./flowExplorerData";

// "Watch one request move through the machine." A static, interactive trace board over the
// production-verified behaviors — NOT a simulator (no network, no live values; see the caption).

function implColor(impl: ImplStatus): string {
  return impl === "built" ? C.green : impl === "partial" ? C.amber : impl === "planned" ? C.cyan : C.red;
}

// Subtle, dependency-free reveal — only on the trace lines (no opacity conflict with lane dimming),
// and only when the user hasn't asked for reduced motion. Constant string → SSR/hydration-safe.
const FX_STYLE = `
@media (prefers-reduced-motion: no-preference) {
  .fx-step { animation: fxReveal 260ms ease both; animation-delay: calc(var(--fx-i, 0) * 40ms); }
}
@keyframes fxReveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;

function ImplChip({ impl }: { impl: ImplStatus }) {
  const color = implColor(impl);
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {IMPL_LABEL[impl]}
    </span>
  );
}
function VerifyChip({ verify }: { verify: VerifyStatus }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.04em", color: C.faint,
      border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {VERIFY_LABEL[verify]}
    </span>
  );
}
function StatusPair({ impl, verify }: { impl: ImplStatus; verify: VerifyStatus }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <ImplChip impl={impl} /><VerifyChip verify={verify} />
    </span>
  );
}

const cellLabel: CSSProperties = { fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" };
const note: CSSProperties = { fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 8 };

function ScenarioSelector({ scenarios, selectedId, onSelect }: {
  scenarios: FlowScenario[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <StatGrid cols={5} style={{ marginTop: 14 }}>
      {scenarios.map((s) => {
        const active = s.id === selectedId;
        return (
          <button key={s.id} type="button" aria-pressed={active} onClick={() => onSelect(s.id)}
            style={{ display: "block", textAlign: "left", width: "100%", cursor: "pointer",
              background: active ? C.panelHi : C.panel,
              border: `1px solid ${active ? C.borderHi : C.border}`, borderRadius: 9, padding: 11,
              boxShadow: active ? `inset 2px 0 0 ${C.cyan}` : "none",
              transition: "background 160ms ease, border-color 160ms ease, box-shadow 160ms ease" }}>
            <div style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.08em", color: active ? C.cyan : C.faint }}>{s.traceId}</div>
            <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, marginTop: 3 }}>{s.label}</div>
            <div style={{ marginTop: 7 }}><ImplChip impl={s.impl} /></div>
          </button>
        );
      })}
    </StatGrid>
  );
}

function FlowLaneMap({ scenario, selectedNodeId, onSelect }: {
  scenario: FlowScenario; selectedNodeId: string | null; onSelect: (id: string | null) => void;
}) {
  const anySelected = selectedNodeId != null;
  return (
    <Panel title={`Flow · ${scenario.label}`}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {FLOW_LANES.map((lane) => {
          const step = scenario.lanes.find((l) => l.lane === lane.kind) as FlowStep;
          const selected = step.id === selectedNodeId;
          const color = implColor(step.impl);
          return (
            <button key={lane.kind} type="button" aria-pressed={selected}
              onClick={() => onSelect(selected ? null : step.id)}
              style={{ textAlign: "left", width: "100%", cursor: "pointer",
                background: selected ? C.panelHi : C.panel,
                border: `1px solid ${selected ? C.borderHi : C.border}`, borderRadius: 9, padding: "10px 11px",
                boxShadow: selected ? `inset 3px 0 0 ${color}, 0 0 0 1px ${C.cyan}55` : `inset 3px 0 0 ${color}`,
                opacity: anySelected && !selected ? 0.55 : 1,
                transition: "opacity 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease" }}>
              <div style={cellLabel}>{lane.title}</div>
              <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, marginTop: 3 }}>{step.label}</div>
              <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, marginTop: 3, wordBreak: "break-word" }}>{step.realName}</div>
              <div style={{ marginTop: 7 }}><ImplChip impl={step.impl} /></div>
            </button>
          );
        })}
      </div>
      <p style={note}>Lanes flow left → right (Input → Receipt); they stack top → bottom on mobile. Click a node for its evidence detail.</p>
    </Panel>
  );
}

function TracePacket({ scenario }: { scenario: FlowScenario }) {
  return (
    <Panel title={`Trace · ${scenario.traceId}`}>
      <div style={{ fontFamily: C.mono, fontSize: 12, lineHeight: 1.7 }}>
        {scenario.trace.map((s) => (
          <div key={s.n} className="fx-step" style={{ ["--fx-i" as string]: String(s.n) } as CSSProperties}>
            <span style={{ color: C.faint }}>{String(s.n).padStart(2, "0")}</span>
            <span style={{ color: C.text }}>{"  " + s.line}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EvidenceDrawer({ scenario, node, envId }: {
  scenario: FlowScenario; node: FlowStep | null; envId: string;
}) {
  return (
    <Panel title="Evidence drawer">
      {node ? (
        <div>
          <div style={cellLabel}>{node.lane}</div>
          <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text, marginTop: 3 }}>{node.label}</div>
          <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, marginTop: 3 }}>{node.realName}</div>
          <div style={{ marginTop: 9 }}><StatusPair impl={node.impl} verify={node.verify} /></div>
          <p style={note}>{node.detail}</p>
          {node.nullReason && (
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginTop: 6 }}>
              fail-closed reason: <span style={{ color: C.red }}>{node.nullReason}</span>
            </div>
          )}
          {node.evidenceSlug && (
            <div style={{ marginTop: 9 }}>
              <Link href={telemetryHref(envId, node.evidenceSlug)} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>see live surface →</Link>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{scenario.label}</div>
          <p style={note}>{scenario.summary}</p>
          <p style={{ ...note, color: C.faint }}>Select a node in the flow to inspect its tool/service/table, status, failure mode, and evidence link.</p>
        </div>
      )}
    </Panel>
  );
}

function HappyVsFailClosed({ scenario }: { scenario: FlowScenario }) {
  return (
    <Panel title="Happy path vs fail-closed">
      <div style={{ border: `1px solid ${C.green}33`, background: C.green + "10", borderRadius: 8, padding: "10px 12px" }}>
        <Tag color={C.green}>Happy path</Tag>
        <p style={{ ...note, marginTop: 7 }}>{scenario.happyPath}</p>
      </div>
      <div style={{ border: `1px solid ${C.amber}33`, background: C.amber + "10", borderRadius: 8, padding: "10px 12px", marginTop: 10 }}>
        <Tag color={C.amber}>Fail-closed</Tag>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 7 }}>trigger: {scenario.failClosed.trigger}</div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 3 }}>reason: <span style={{ color: C.red }}>{scenario.failClosed.nullReason}</span></div>
        <p style={{ ...note, marginTop: 6 }}>{scenario.failClosed.outcome}</p>
        {scenario.failClosed.observed && (
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginTop: 6 }}>observed: {scenario.failClosed.observed}</div>
        )}
      </div>
    </Panel>
  );
}

export default function FlowExplorer({ envId }: { envId: string }) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(FLOW_SCENARIOS[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const scenario = FLOW_SCENARIOS.find((s) => s.id === selectedScenarioId) ?? FLOW_SCENARIOS[0];
  const node = selectedNodeId ? scenario.lanes.find((l) => l.id === selectedNodeId) ?? null : null;
  const selectScenario = (id: string) => { setSelectedScenarioId(id); setSelectedNodeId(null); };

  return (
    <section style={{ marginBottom: 28 }}>
      <style>{FX_STYLE}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Tag color={C.cyan}>Static trace</Tag>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, letterSpacing: "0.08em" }}>TRACE {scenario.traceId}</span>
          </div>
          <h2 style={{ fontFamily: C.sans, fontSize: 20, fontWeight: 700, color: C.text, marginTop: 6 }}>Flow Explorer — watch one request move through the machine</h2>
        </div>
        <StatusPair impl={scenario.impl} verify={scenario.verify} />
      </div>
      <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 10, maxWidth: 860 }}>{FLOW_EXPLORER_CAPTION}</p>

      <ScenarioSelector scenarios={FLOW_SCENARIOS} selectedId={selectedScenarioId} onSelect={selectScenario} />

      <div style={{ marginTop: 16 }}>
        <SplitGrid variant="five-seven">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FlowLaneMap scenario={scenario} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
            <TracePacket scenario={scenario} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <EvidenceDrawer scenario={scenario} node={node} envId={envId} />
            <HappyVsFailClosed scenario={scenario} />
          </div>
        </SplitGrid>
      </div>
    </section>
  );
}
