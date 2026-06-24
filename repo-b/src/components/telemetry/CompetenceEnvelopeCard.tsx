"use client";

// Pre-test competence-envelope gate (Spin 5). Renders a COMPUTED EVIDENCE ARTIFACT
// (repo-b/src/lib/telemetry/competenceEnvelopeEvidence.json) from compute_competence_envelope.py,
// run on real C-MAPSS FD001 (training) vs FD004 (regime-shift stress test). Flips drift into an
// upstream check: before scoring, ask whether the input is inside the model's trained operating
// envelope; if not, ABSTAIN/REVIEW rather than issue a confident score. Labeled not-live; FD004 is
// a regime-shift stress test, not rocket hot-fire data. No "safe"/"certified" language.

import evidence from "@/lib/telemetry/competenceEnvelopeEvidence.json";
import { C, EmptyState, MetricCard, PageHeading, Panel, StatGrid, Tag } from "./primitives";

interface Example {
  subset: string; unit: number; cycle: number; op_settings: number[];
  mahalanobis_sq: number; tau: number; band: string; action: string;
}
interface Evidence {
  as_of: string; training_reference: string; challenge_set: string; method: string; gate: string;
  n_fd001_fit: number; n_fd001_eval: number; n_fd004: number;
  metrics: {
    tau_mahalanobis_sq: number; k_out: number;
    fd001_in_envelope_rate: number; fd001_near_boundary_rate: number; fd001_out_of_envelope_rate: number;
    fd004_in_envelope_rate: number; fd004_near_boundary_rate: number; fd004_out_of_envelope_rate: number;
  };
  examples: Example[]; finding: string; limitations: string[];
}

const ev = evidence as Evidence;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtD = (x: number) => (x >= 1e4 ? x.toExponential(1) : x.toFixed(1));
const actionColor = (a: string) => (a === "SCORE" ? C.green : a === "REVIEW" ? C.amber : C.red);

function BandBar({ label, inR, nearR, outR }: { label: string; inR: number; nearR: number; outR: number }) {
  const seg = (w: number, color: string, t: string) =>
    w > 0.001 ? <div title={`${t}: ${pct(w)}`} style={{ width: `${w * 100}%`, background: `${color}aa`,
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 9.5,
      color: C.bg, fontWeight: 700 }}>{w > 0.08 ? pct(w) : ""}</div> : null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", height: 24, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {seg(inR, C.green, "in-envelope")}
        {seg(nearR, C.amber, "near-boundary")}
        {seg(outR, C.red, "out-of-envelope")}
      </div>
    </div>
  );
}

function ExampleCard({ e }: { e: Example }) {
  return (
    <div style={{ flex: 1, minWidth: 240, padding: "12px 14px", background: C.panel,
      border: `1px solid ${actionColor(e.action)}55`, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{e.subset} · unit {e.unit} · cyc {e.cycle}</span>
        <Tag color={actionColor(e.action)}>{e.action}</Tag>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.8 }}>
        <div>op settings: [{e.op_settings.join(", ")}]</div>
        <div>distance² to FD001: <span style={{ color: C.text }}>{fmtD(e.mahalanobis_sq)}</span> &nbsp;(τ = {fmtD(e.tau)})</div>
        <div>band: <span style={{ color: actionColor(e.action) }}>{e.band.replace(/_/g, " ")}</span></div>
      </div>
    </div>
  );
}

export default function CompetenceEnvelopeCard() {
  const heading = (
    <PageHeading eyebrow="Pre-test · competence envelope"
      title="Is this input inside the model's trained envelope?"
      blurb="Drift, flipped upstream: before scoring a unit, check whether its inputs are inside the operating envelope the model was trained on. Fit on FD001 (one operating condition), stress-tested on FD004 (six conditions). Out-of-envelope inputs abstain or go to review — never a confident score." />
  );
  if (!ev?.metrics || !Array.isArray(ev.examples) || ev.examples.length < 2) {
    return <>{heading}<EmptyState label="Competence-envelope evidence unavailable" hint="Computed artifact missing required fields." /></>;
  }
  const m = ev.metrics;

  return (
    <>
      {heading}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Tag color={C.amber}>computed evidence artifact · not live serving</Tag>
        <Tag color={C.dim}>train: {ev.training_reference}</Tag>
        <Tag color={C.dim}>stress: FD004 regime shift</Tag>
      </div>

      <StatGrid cols={4} style={{ marginBottom: 14 }}>
        <MetricCard label="FD001 in-envelope (held-out)" value={pct(m.fd001_in_envelope_rate)}
          accent={C.green} sub="envelope holds for trained scope" />
        <MetricCard label="FD004 out-of-envelope" value={pct(m.fd004_out_of_envelope_rate)}
          accent={C.red} sub="→ abstain, not a confident score" />
        <MetricCard label="FD004 near-boundary" value={pct(m.fd004_near_boundary_rate)}
          accent={C.amber} sub="→ review" />
        <MetricCard label="Gate" value="abstain / review / score"
          sub={`Mahalanobis · τ = ${fmtD(m.tau_mahalanobis_sq)} (FD001 99th pctl)`} />
      </StatGrid>

      <Panel title="Where each set lands in the FD001-trained envelope">
        <BandBar label="FD001 held-out (the trained operating condition)"
          inR={m.fd001_in_envelope_rate} nearR={m.fd001_near_boundary_rate} outR={m.fd001_out_of_envelope_rate} />
        <BandBar label="FD004 (six operating conditions — regime-shift stress test)"
          inR={m.fd004_in_envelope_rate} nearR={m.fd004_near_boundary_rate} outR={m.fd004_out_of_envelope_rate} />
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>
          <span style={{ color: C.green }}>■ in-envelope → score</span>
          <span style={{ color: C.amber }}>■ near-boundary → review</span>
          <span style={{ color: C.red }}>■ out-of-envelope → abstain</span>
        </div>
      </Panel>

      <Panel title="Two candidate inputs, two operational actions" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ev.examples.map((e, i) => <ExampleCard key={i} e={e} />)}
        </div>
      </Panel>

      <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.6, margin: "14px 0",
        padding: "12px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {ev.finding}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.7 }}>
        <div><strong style={{ color: C.dim }}>Gate:</strong> {ev.gate}</div>
        <div><strong style={{ color: C.dim }}>Method:</strong> {ev.method}</div>
        <div style={{ marginTop: 6 }}><strong style={{ color: C.dim }}>Limitations:</strong></div>
        <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
          {ev.limitations.map((l, i) => <li key={i} style={{ marginBottom: 2 }}>{l}</li>)}
        </ul>
      </div>
    </>
  );
}
