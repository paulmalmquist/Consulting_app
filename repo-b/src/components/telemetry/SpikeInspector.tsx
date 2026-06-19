"use client";

// Telemetry Spike Inspector — read-only "evaluate and recommend" workspace.
//
// This surface NEVER aborts, rolls back, or mutates anything. Choosing an action STAGES a
// recommendation into a local, in-memory queue that RESETS ON REFRESH. Nothing is executed,
// persisted, or sent. Missing/stale evidence renders as `insufficient_evidence` (fail closed).

import { useMemo, useState, type ReactNode } from "react";
import {
  C,
  Panel,
  PageHeading,
  MetricCard,
  StatGrid,
  Tag,
  EmptyState,
  DisclosureFooter,
} from "./primitives";
import { telemetryHref } from "./telemetryNav";
import {
  ACTION_CATALOG,
  DEMO_RECEIPTS,
  DEMO_SPIKES,
  SPIKE_TYPE_META,
  detectorColor,
  detectorLabel,
  freshnessColor,
  isInsufficientEvidence,
  posture,
  postureColor,
  riskColor,
  severityColor,
  spikeStatusLabel,
  statusColor,
  type RiskLevel,
  type SpikeActionId,
  type TelemetrySpike,
} from "@/lib/telemetry/spikeInspector";

type TabId = "live" | "packets" | "queue" | "receipts";

const TABS: { id: TabId; label: string }[] = [
  { id: "live", label: "Live Feed" },
  { id: "packets", label: "Inspection Packets" },
  { id: "queue", label: "Action Queue" },
  { id: "receipts", label: "Receipts" },
];

interface StagedAction {
  key: string;
  spikeId: string;
  spikeSignal: string;
  actionId: SpikeActionId;
  label: string;
  risk: RiskLevel;
  gateRequired: boolean;
  stagedAt: string;
}

const lbl = {
  fontFamily: C.mono,
  fontSize: 10,
  letterSpacing: "0.1em" as const,
  color: C.faint,
  textTransform: "uppercase" as const,
};

export default function SpikeInspector({ envId }: { envId?: string }) {
  const spikes = DEMO_SPIKES;
  const [tab, setTab] = useState<TabId>("live");
  const [selectedId, setSelectedId] = useState<string>(spikes[0]?.id ?? "");
  // demo/in-memory: resets on refresh. Never persisted, never executed.
  const [staged, setStaged] = useState<StagedAction[]>([]);

  const summary = useMemo(() => posture(spikes), [spikes]);
  const selected = spikes.find((s) => s.id === selectedId) ?? spikes[0];

  const feed = tab === "packets" ? spikes.filter((s) => s.evidence.length > 0) : spikes;

  function stage(spike: TelemetrySpike, actionId: SpikeActionId) {
    const spec = ACTION_CATALOG[actionId];
    setStaged((prev) => [
      {
        key: `${spike.id}:${actionId}:${prev.length}`,
        spikeId: spike.id,
        spikeSignal: spike.signal,
        actionId,
        label: spec.label,
        risk: spec.risk,
        gateRequired: spec.gateRequired,
        stagedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  return (
    <>
      <PageHeading
        eyebrow="Telemetry · Anomaly Ops"
        title="Spike Inspector"
        blurb="Inspect telemetry spikes — threshold, drift, pipeline, model, governance, and post-change degradation — then stage a recommendation. This surface evaluates and recommends only: it never aborts, rolls back, or mutates any system."
        right={
          <Tag color={postureColor(summary.posture)}>Posture · {summary.posture}</Tag>
        }
      />

      <StatGrid cols={5} style={{ marginBottom: 16 }}>
        <MetricCard label="Open spikes" value={String(summary.open)} />
        <MetricCard label="Critical" value={String(summary.critical)} accent={summary.critical ? C.red : C.text} />
        <MetricCard label="Insufficient evidence" value={String(summary.insufficientEvidence)} accent={summary.insufficientEvidence ? C.amber : C.text} />
        <MetricCard label="Governance blocks" value={String(summary.governanceBlocks)} accent={summary.governanceBlocks ? C.red : C.text} />
        <MetricCard label="Post-change degraded" value={String(summary.postChangeDegradations)} accent={summary.postChangeDegradations ? C.amber : C.text} />
      </StatGrid>

      <Panel title="Capability — honest scope" style={{ marginBottom: 16 }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScopeNote color={C.green} head="Evaluate & recommend" body="Detects spikes over static demo telemetry, assembles evidence, and recommends a next step for a human." />
          <ScopeNote color={C.amber} head="Fail closed" body="Missing or stale evidence resolves to insufficient_evidence — never a success verdict or a guess." />
          <ScopeNote color={C.red} head="No automatic action" body="No auto-abort, no auto-rollback, no production mutation. High-risk actions require a human gate." />
        </div>
      </Panel>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                fontFamily: C.mono,
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: active ? C.text : C.dim,
                background: active ? C.panelHi : "transparent",
                border: `1px solid ${active ? C.borderHi : C.border}`,
                borderRadius: 7,
                padding: "7px 13px",
                cursor: "pointer",
              }}
            >
              {t.label}
              {t.id === "queue" && staged.length > 0 ? ` · ${staged.length}` : ""}
            </button>
          );
        })}
      </div>

      {(tab === "live" || tab === "packets") && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,320px)]">
          <SpikeFeed spikes={feed} selectedId={selected?.id ?? ""} onSelect={setSelectedId} />
          <InspectionWorkspace spike={selected} envId={envId} />
          <ActionQueuePanel spike={selected} onStage={stage} />
        </div>
      )}

      {tab === "queue" && <StagedQueue staged={staged} onClear={() => setStaged([])} />}

      {tab === "receipts" && <ReceiptsTable envId={envId} />}

      <DisclosureFooter />
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 12 }}>
        Static demo telemetry. This surface evaluates and recommends only; it does not abort, roll
        back, or mutate any system. Staged actions are in-memory and reset on refresh.
      </p>
    </>
  );
}

function ScopeNote({ color, head, body }: { color: string; head: string; body: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color }}>{head}</div>
      <p style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5, marginTop: 6 }}>{body}</p>
    </div>
  );
}

function SpikeFeed({
  spikes,
  selectedId,
  onSelect,
}: {
  spikes: TelemetrySpike[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel title={`Spike feed · ${spikes.length}`} pad={10}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflowY: "auto" }}>
        {spikes.length === 0 && <EmptyState label="No spikes" hint="No spikes match this tab." />}
        {spikes.map((s) => {
          const active = s.id === selectedId;
          const insufficient = isInsufficientEvidence(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              style={{
                textAlign: "left",
                background: active ? C.panelHi : C.panel,
                border: `1px solid ${active ? C.borderHi : C.border}`,
                borderRadius: 9,
                padding: 11,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, fontWeight: 600 }}>{s.signal}</span>
                <Tag color={severityColor(s.severity)}>{s.severity}</Tag>
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 5 }}>
                {SPIKE_TYPE_META[s.spike_type].label}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <Tag color={statusColor(s.status)}>{spikeStatusLabel(s.status)}</Tag>
                {insufficient && <Tag color={C.amber}>fail-closed</Tag>}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function InspectionWorkspace({ spike, envId }: { spike?: TelemetrySpike; envId?: string }) {
  if (!spike) return <Panel title="Inspection"><EmptyState label="Select a spike" hint="Pick a spike from the feed to inspect its evidence." /></Panel>;

  const insufficient = isInsufficientEvidence(spike);
  const meta = SPIKE_TYPE_META[spike.spike_type];
  const rec = ACTION_CATALOG[spike.recommended_action];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel
        title={`Inspection · ${meta.label}`}
        right={<Tag color={severityColor(spike.severity)}>{spike.severity}</Tag>}
      >
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 12 }}>{meta.blurb}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px" }}>
          <Field label="status" value={<Tag color={statusColor(spike.status)}>{spikeStatusLabel(spike.status)}</Tag>} />
          <Field label="stand" value={spike.stand_id} />
          <Field label="run" value={spike.run_id} />
          <Field label="signal" value={spike.signal} />
          <Field label="detected" value={spike.detected_at} />
          <Field label="evidence freshness" value={<Tag color={freshnessColor(spike.freshness)}>{spike.freshness}</Tag>} />
        </div>
      </Panel>

      {spike.spike_type === "governance_receipt" && (
        <div style={{ border: `1px solid ${C.red}66`, background: C.red + "12", borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.red }}>
            Decision promotion blocked
          </div>
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 6 }}>
            A governance receipt for this run failed verification. No Go/No-Go decision may be promoted on
            this run until a human resolves the receipt provenance in the Control Tower.
          </p>
        </div>
      )}

      {insufficient ? (
        <div style={{ border: `1px solid ${C.amber}66`, background: C.amber + "12", borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.amber }}>
            Insufficient evidence
          </div>
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 6 }}>
            No anomaly judgement can be made. null_reason: <strong>{spike.null_reason ?? "stale_or_missing"}</strong>.
            The recommendation below is to gather evidence, not to conclude.
          </p>
        </div>
      ) : (
        <Panel title="Detector outputs">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {spike.detector_outputs.map((d) => (
              <div key={d.detector} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{d.detector}</div>
                  {d.note && <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 3 }}>{d.note}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <Tag color={detectorColor(d.verdict)}>{detectorLabel(d.verdict)}</Tag>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
                    {d.score === null ? "—" : d.score}{d.threshold === null ? "" : ` / thr ${d.threshold}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Corroborating channels">
        {spike.corroborating_channels.length === 0 ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>None — single-source observation.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {spike.corroborating_channels.map((c) => (
              <div key={c.channel} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{c.channel}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {c.note && <span style={{ fontFamily: C.sans, fontSize: 12, color: C.dim }}>{c.note}</span>}
                  <Tag color={c.agrees ? C.green : C.dim}>{c.agrees ? "agrees" : "disagrees"}</Tag>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Evidence">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {spike.evidence.map((e, i) => (
            <div key={`${e.label}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
                {e.label} = <span style={{ color: C.cyan }}>{e.value}</span>
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, display: "flex", gap: 8, alignItems: "center" }}>
                src: {e.source} · {e.as_of ?? "no timestamp"}
                <Tag color={freshnessColor(e.freshness)}>{e.freshness}</Tag>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Recommendation" right={<Tag color={riskColor(rec.risk)}>{rec.risk} risk</Tag>}>
        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, fontWeight: 600 }}>{rec.label}</div>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 6 }}>{spike.recommendation_reason}</p>
        {rec.gateRequired && (
          <div style={{ marginTop: 10 }}>
            <Tag color={C.amber}>Human gate required</Tag>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>What this will NOT do</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {spike.does_not_do.map((d) => (
              <li key={d} style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>{d}</li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Links">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Field label="incident" value={spike.incident_id ?? "—"} />
          <Field label="receipt" value={spike.receipt_id ?? "—"} />
          <Field
            label="control tower"
            value={
              <a
                href={telemetryHref(envId ?? "telemetry-demo", "control-tower")}
                style={{ fontFamily: C.mono, fontSize: 12, color: C.cyan, textDecoration: "none" }}
              >
                {spike.control_tower_run_key ? `Go/No-Go · ${spike.control_tower_run_key}` : "Open Control Tower"}
              </a>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={lbl}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ActionQueuePanel({
  spike,
  onStage,
}: {
  spike?: TelemetrySpike;
  onStage: (spike: TelemetrySpike, actionId: SpikeActionId) => void;
}) {
  if (!spike) return null;
  const recommendedId = spike.recommended_action;
  const ordered = Object.values(ACTION_CATALOG).sort((a, b) =>
    a.id === recommendedId ? -1 : b.id === recommendedId ? 1 : 0,
  );
  return (
    <Panel title="Actions — recommend only" pad={10}>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 10 }}>
        Staging a recommendation does not execute anything. It is held in a local, in-memory queue
        that resets on refresh.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 640, overflowY: "auto" }}>
        {ordered.map((a) => {
          const recommended = a.id === recommendedId;
          return (
            <div
              key={a.id}
              style={{
                border: `1px solid ${recommended ? C.borderHi : C.border}`,
                background: recommended ? C.panelHi : C.panel,
                borderRadius: 9,
                padding: 11,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, fontWeight: 600 }}>{a.label}</span>
                {recommended && <Tag color={C.cyan}>recommended</Tag>}
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <Facet label="Does" value={a.does} color={C.dim} />
                <Facet label="Does not" value={a.doesNot} color={C.dim} />
                <Facet label="Required evidence" value={a.requiredEvidence} color={C.dim} />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                <Tag color={riskColor(a.risk)}>{a.risk} risk</Tag>
                <Tag color={a.gateRequired ? C.amber : C.green}>gate: {a.gateRequired ? "yes" : "no"}</Tag>
              </div>
              <button
                type="button"
                onClick={() => onStage(spike, a.id)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  fontFamily: C.mono,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: C.text,
                  background: "transparent",
                  border: `1px solid ${C.borderHi}`,
                  borderRadius: 7,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                {a.gateRequired ? "Queue for human gate" : "Stage recommendation"}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Facet({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>{label}: </span>
      <span style={{ fontFamily: C.sans, fontSize: 12, color, lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

function StagedQueue({ staged, onClear }: { staged: StagedAction[]; onClear: () => void }) {
  return (
    <Panel
      title={`Action queue · ${staged.length}`}
      right={
        staged.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
          >
            CLEAR
          </button>
        ) : undefined
      }
    >
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
        Demo / in-memory: staged recommendations are not persisted and nothing is executed. Refreshing the
        page clears this queue.
      </p>
      {staged.length === 0 ? (
        <EmptyState label="Nothing staged" hint="Stage a recommendation from a spike's action list." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staged.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <div>
                <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
                  {s.spikeId} · {s.spikeSignal} · {s.stagedAt}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Tag color={riskColor(s.risk)}>{s.risk} risk</Tag>
                {s.gateRequired && <Tag color={C.amber}>human gate</Tag>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ReceiptsTable({ envId }: { envId?: string }) {
  return (
    <Panel title={`Governance receipts · ${DEMO_RECEIPTS.length}`}>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
        Read-only demo receipts derived from inspected spikes. Verification and decision promotion happen
        in the{" "}
        <a href={telemetryHref(envId ?? "telemetry-demo", "control-tower")} style={{ color: C.cyan, textDecoration: "none" }}>
          Control Tower
        </a>
        .
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DEMO_RECEIPTS.map((r) => (
          <div key={r.receipt_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{r.receipt_id}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>
                {r.actor} · {r.decision_type} · spike {r.spike_id}
                {r.incident_id ? ` · ${r.incident_id}` : ""}
              </div>
            </div>
            <Tag color={r.outcome === "recorded" ? C.green : C.amber}>{r.outcome}</Tag>
          </div>
        ))}
      </div>
    </Panel>
  );
}
