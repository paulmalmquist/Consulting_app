"use client";

// Telemetry Spike Inspector — real findings from the telemetry analyzer (single source of truth).
//
// This surface EVALUATES AND RECOMMENDS only. It never aborts, rolls back, or mutates anything.
// Operator dispositions are staged into a local, in-memory queue that RESETS ON REFRESH — nothing is
// executed or persisted. There is NO static/demo data: when the analyzer returns no findings or a
// source is unavailable, the UI fails closed and names the reason.

import { useEffect, useState, type ReactNode } from "react";
import {
  C,
  Panel,
  PageHeading,
  MetricCard,
  StatGrid,
  Tag,
  EmptyState,
  Loading,
  ErrorState,
  DisclosureFooter,
} from "./primitives";
import { telemetryHref } from "./telemetryNav";
import {
  getFindings,
  severityColor,
  severityRank,
  humanGateRequired,
  findingFreshness,
  sourceLabel,
  type AnalyzerFinding,
  type FindingsResponse,
  type Severity,
} from "@/lib/telemetry/spikeInspector";

type Posture = "STABLE" | "WATCH" | "DEGRADED";

function posture(by: Record<Severity, number>): Posture {
  if ((by.critical ?? 0) > 0) return "DEGRADED";
  if ((by.warning ?? 0) > 0) return "WATCH";
  return "STABLE";
}
function postureColor(p: Posture): string {
  if (p === "DEGRADED") return C.red;
  if (p === "WATCH") return C.amber;
  return C.green;
}

type DispositionId = "acknowledge" | "stage_recommendation" | "escalate_go_no_go_review";
const DISPOSITIONS: { id: DispositionId; label: string; gate: boolean; note: string }[] = [
  { id: "acknowledge", label: "Acknowledge", gate: false, note: "Marks the finding seen. Changes no metric and resolves nothing." },
  { id: "stage_recommendation", label: "Stage recommendation", gate: false, note: "Queues the analyzer's recommendation for a human. Does not execute it." },
  { id: "escalate_go_no_go_review", label: "Escalate to Go/No-Go review", gate: true, note: "Hands off to the Control Tower for a human gate. Sets no verdict here." },
];

interface Staged {
  key: string;
  findingId: string;
  title: string;
  disposition: string;
  gate: boolean;
  at: string;
}

const lbl = {
  fontFamily: C.mono,
  fontSize: 10,
  letterSpacing: "0.1em" as const,
  color: C.faint,
  textTransform: "uppercase" as const,
};

export default function SpikeInspector({ envId, embedded = false }: { envId?: string; embedded?: boolean }) {
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  // demo/in-memory: resets on refresh. Never persisted, never executed.
  const [staged, setStaged] = useState<Staged[]>([]);

  useEffect(() => {
    let active = true;
    getFindings(envId)
      .then((d) => {
        if (!active) return;
        setData(d);
        setSelectedId(d.findings.length ? rankedFindings(d.findings)[0].finding_id : "");
      })
      .catch((e) => active && setError(String(e?.message ?? e)));
    return () => {
      active = false;
    };
  }, [envId]);

  const heading = embedded ? null : (
    <PageHeading
      eyebrow="Telemetry · Anomaly Ops"
      title="Spike Inspector"
      blurb="Real telemetry findings from the analyzer — anomaly rate, distribution drift, and model health — grounded in the seeded tel_* serving reads. Evaluate and recommend only: no auto-abort, no auto-rollback, no production mutation."
      right={
        data ? <Tag color={postureColor(posture(data.by_severity))}>Posture · {posture(data.by_severity)}</Tag> : undefined
      }
    />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!data) return <>{heading}<Loading label="Loading telemetry findings…" /></>;

  const ranked = rankedFindings(data.findings);
  const selected = ranked.find((f) => f.finding_id === selectedId) ?? ranked[0];
  const unavailable = data.null_reason === "telemetry_findings_unavailable";

  function stage(f: AnalyzerFinding, d: (typeof DISPOSITIONS)[number]) {
    setStaged((prev) => [
      { key: `${f.finding_id}:${d.id}:${prev.length}`, findingId: f.finding_id, title: f.what_changed, disposition: d.label, gate: d.gate, at: new Date().toISOString() },
      ...prev,
    ]);
  }

  return (
    <>
      {heading}

      <StatGrid cols={4} style={{ marginBottom: 16 }}>
        <MetricCard label="Findings" value={String(data.finding_count)} />
        <MetricCard label="Critical" value={String(data.by_severity.critical ?? 0)} accent={(data.by_severity.critical ?? 0) ? C.red : C.text} />
        <MetricCard label="Warning" value={String(data.by_severity.warning ?? 0)} accent={(data.by_severity.warning ?? 0) ? C.amber : C.text} />
        <MetricCard label="Sources unavailable" value={String(data.null_reasons.length)} accent={data.null_reasons.length ? C.amber : C.text} />
      </StatGrid>

      <ProvenancePanel data={data} />

      {unavailable ? (
        <div style={{ border: `1px solid ${C.red}66`, background: C.red + "12", borderRadius: 10, padding: 16, marginTop: 16 }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.red }}>Not available</div>
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 6 }}>
            The telemetry analyzer could not be reached. null_reason: <strong>telemetry_findings_unavailable</strong>.
            No findings are shown — this surface fails closed rather than render stale or fabricated data.
          </p>
        </div>
      ) : ranked.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState label="No active telemetry findings." hint="The analyzer evaluated the seeded serving reads and surfaced nothing above the alert thresholds. Sources that could not be evaluated are listed below." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,320px)]" style={{ marginTop: 16 }}>
          <FindingsFeed findings={ranked} selectedId={selected?.finding_id ?? ""} onSelect={setSelectedId} />
          <Inspection finding={selected} envId={envId} />
          <Actions finding={selected} onStage={stage} />
        </div>
      )}

      <SourcesUnavailable nullReasons={data.null_reasons} />
      <StagedQueue staged={staged} onClear={() => setStaged([])} />

      {!embedded && <DisclosureFooter />}
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 12 }}>
        Findings are live from the telemetry analyzer over the seeded telemetry-demo serving reads. This
        surface evaluates and recommends only; it does not abort, roll back, or mutate any system. Staged
        dispositions are in-memory and reset on refresh.
      </p>
    </>
  );
}

function rankedFindings(findings: AnalyzerFinding[]): AnalyzerFinding[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function ProvenancePanel({ data }: { data: FindingsResponse }) {
  const p = data.provenance;
  const rows: { label: string; value: string }[] = [
    { label: "surface", value: "Spike Inspector" },
    { label: "mode", value: p.mode },
    { label: "source", value: p.source },
    { label: "tenant", value: p.tenant },
    { label: "rows evaluated", value: p.rows_evaluated == null ? "Not available" : String(p.rows_evaluated) },
    { label: "last refresh", value: p.last_refresh },
    { label: "fallback used", value: p.fallback_used ? "YES" : "NO" },
  ];
  return (
    <Panel title="Data Source Audit" right={<Tag color={p.fallback_used ? C.red : C.green}>{p.fallback_used ? "fallback" : "real_backend"}</Tag>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 16px" }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={lbl}>{r.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: r.label === "fallback used" ? (data.provenance.fallback_used ? C.red : C.green) : C.text, marginTop: 4, wordBreak: "break-word" }}>{r.value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FindingsFeed({ findings, selectedId, onSelect }: { findings: AnalyzerFinding[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <Panel title={`Findings · ${findings.length}`} pad={10}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflowY: "auto" }}>
        {findings.map((f) => {
          const active = f.finding_id === selectedId;
          return (
            <button
              key={f.finding_id}
              type="button"
              onClick={() => onSelect(f.finding_id)}
              style={{ textAlign: "left", background: active ? C.panelHi : C.panel, border: `1px solid ${active ? C.borderHi : C.border}`, borderRadius: 9, padding: 11, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Tag color={severityColor(f.severity)}>{f.severity}</Tag>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>{Math.round((f.confidence ?? 0) * 100)}%</span>
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, marginTop: 6, lineHeight: 1.4 }}>{f.what_changed}</div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function Inspection({ finding, envId }: { finding?: AnalyzerFinding; envId?: string }) {
  if (!finding) return <Panel title="Inspection"><EmptyState label="Select a finding" hint="Pick a finding from the feed to inspect its evidence." /></Panel>;
  const freshness = findingFreshness(finding);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Inspection" right={<Tag color={severityColor(finding.severity)}>{finding.severity}</Tag>}>
        <div style={{ fontFamily: C.sans, fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>{finding.what_changed}</div>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 8 }}>{finding.why_it_matters}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 14px", marginTop: 12 }}>
          <Field label="confidence" value={`${Math.round((finding.confidence ?? 0) * 100)}%`} />
          <Field label="freshness" value={freshness ?? "unknown"} />
          <Field label="finding id" value={finding.finding_id} />
        </div>
      </Panel>

      <Panel title="Evidence">
        <div style={{ marginBottom: 10 }}>
          <div style={lbl}>provenance</div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.cyan, marginTop: 4 }}>{sourceLabel(finding.source_ref)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(finding.evidence_refs ?? []).length === 0 ? (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>No evidence references.</span>
          ) : (
            finding.evidence_refs.map((e, i) => (
              <div key={`${e}-${i}`} style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{e}</div>
            ))
          )}
        </div>
        {(finding.metric_refs ?? []).length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={lbl}>governed metrics</div>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, marginTop: 4 }}>{finding.metric_refs!.join(", ")}</div>
          </div>
        )}
      </Panel>

      <Panel title="Recommendation" right={humanGateRequired(finding.severity) ? <Tag color={C.amber}>Human gate required</Tag> : undefined}>
        {(finding.recommendations ?? []).length === 0 ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>No recommendation from the analyzer for this finding.</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {finding.recommendations.map((r) => (
              <li key={r} style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{r}</li>
            ))}
          </ul>
        )}
        {(finding.next_questions ?? []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={lbl}>investigation forks</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {finding.next_questions!.map((q) => (
                <li key={q} style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={lbl}>what this will NOT do</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>Does not abort the run or change any metric.</li>
            <li style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>Does not execute or schedule a rollback.</li>
            <li style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>Does not promote a Go/No-Go decision here.</li>
          </ul>
        </div>
      </Panel>

      <Panel title="Links">
        <a href={telemetryHref(envId ?? "telemetry-demo", "control-tower")} style={{ fontFamily: C.mono, fontSize: 12, color: C.cyan, textDecoration: "none" }}>
          Open Control Tower (Go/No-Go) →
        </a>
      </Panel>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={lbl}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginTop: 4, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function Actions({ finding, onStage }: { finding?: AnalyzerFinding; onStage: (f: AnalyzerFinding, d: (typeof DISPOSITIONS)[number]) => void }) {
  if (!finding) return null;
  return (
    <Panel title="Dispositions — recommend only" pad={10}>
      <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 10 }}>
        Staging a disposition does not execute anything. It is held in a local, in-memory queue that
        resets on refresh.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {DISPOSITIONS.map((d) => (
          <div key={d.id} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 9, padding: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, fontWeight: 600 }}>{d.label}</span>
              <Tag color={d.gate ? C.amber : C.green}>gate: {d.gate ? "yes" : "no"}</Tag>
            </div>
            <p style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.45, marginTop: 6 }}>{d.note}</p>
            <button
              type="button"
              onClick={() => onStage(finding, d)}
              style={{ marginTop: 10, width: "100%", fontFamily: C.mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: C.text, background: "transparent", border: `1px solid ${C.borderHi}`, borderRadius: 7, padding: "8px 10px", cursor: "pointer" }}
            >
              {d.gate ? "Queue for human gate" : "Stage"}
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SourcesUnavailable({ nullReasons }: { nullReasons: { source: string; reason: string }[] }) {
  if (nullReasons.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <Panel title={`Sources not available · ${nullReasons.length}`} right={<Tag color={C.amber}>fail-closed</Tag>}>
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 10 }}>
          These sources could not be evaluated. They are listed explicitly rather than hidden — no finding
          is inferred from missing data.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {nullReasons.map((n, i) => (
            <div key={`${n.source}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderBottom: `1px solid ${C.border}`, paddingBottom: 7 }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{n.source}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>{n.reason}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function StagedQueue({ staged, onClear }: { staged: Staged[]; onClear: () => void }) {
  if (staged.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <Panel
        title={`Staged dispositions · ${staged.length}`}
        right={<button type="button" onClick={onClear} style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>CLEAR</button>}
      >
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 12 }}>
          Demo / in-memory: staged dispositions are not persisted and nothing is executed. Refreshing the
          page clears this queue.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staged.map((s) => (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <div>
                <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.text, fontWeight: 600 }}>{s.disposition}</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>{s.findingId} · {s.at}</div>
              </div>
              {s.gate && <Tag color={C.amber}>human gate</Tag>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
