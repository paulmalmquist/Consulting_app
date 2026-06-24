"use client";

// RUL conformal lower-bound go/no-go. Renders a COMPUTED EVIDENCE ARTIFACT
// (repo-b/src/lib/telemetry/rulConformalEvidence.json), produced by
// telemetry-platform/compute_rul_conformal.py from real C-MAPSS FD001 data on
// Databricks — split conformal with a unit-grouped calibration split. It is a
// reproducible snapshot, explicitly labeled "not live serving". No value is
// seeded: if the artifact is missing required fields the card fails closed.
//
// Before this card, RUL was point-prediction only (model card: "point predictions
// only — no interval"). After it, RUL carries measured conformal interval evidence,
// and the operator gate can clear on the calibrated LOWER BOUND, not just the point.

import evidence from "@/lib/telemetry/rulConformalEvidence.json";
import { C, EmptyState, MetricCard, PageHeading, Panel, ScrollTable, StatGrid, Tag, verdictColor } from "./primitives";

type GateKey = "GO" | "REVIEW" | "NO_GO";
interface Evidence {
  as_of: string; dataset: string; model: string; method: string; calibration_split: string;
  coverage_target: number; n_calibration_units: number; n_test_units: number;
  metrics: {
    picp_two_sided: number; lower_bound_coverage_one_sided: number; pinaw: number;
    mean_interval_width_cycles: number; two_sided_half_width_qhat: number;
    one_sided_lower_margin: number; point_rmse: number;
  };
  gate: {
    thresholds_cycles: { NO_GO_at_or_below: number; REVIEW_at_or_below: number };
    point_distribution: Record<GateKey, number>;
    lower_bound_distribution: Record<GateKey, number>;
    disagreement_units: number; point_go_but_lower_bound_flags: number;
  };
  examples: { unit: number; point: number; lower: number; upper: number; y_true: number;
    point_gate: GateKey; lower_bound_gate: GateKey; covered: boolean }[];
  limitations: string[];
}

const ev = evidence as Evidence;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function GateBar({ label, dist }: { label: string; dist: Record<GateKey, number> }) {
  const total = dist.GO + dist.REVIEW + dist.NO_GO || 1;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", height: 22, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {(["GO", "REVIEW", "NO_GO"] as GateKey[]).map((k) =>
          dist[k] > 0 ? (
            <div key={k} title={`${k}: ${dist[k]}`} style={{
              width: `${(dist[k] / total) * 100}%`, background: `${verdictColor(k)}33`,
              borderRight: `1px solid ${C.bg}`, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: C.mono, fontSize: 10, color: verdictColor(k) }}>
              {dist[k]}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

export default function RulConformalCard() {
  const heading = (
    <PageHeading eyebrow="RUL · conformal lower bound"
      title="Clear on the worst case, not the point estimate"
      blurb="Split-conformal intervals on the FD001 RUL model, computed from real Databricks data. In a go/no-go context you clear a unit on the calibrated lower bound of remaining life — never the point estimate." />
  );
  if (!ev?.metrics || !ev?.gate || !Array.isArray(ev.examples)) {
    return <>{heading}<EmptyState label="Conformal RUL evidence unavailable"
      hint="The computed evidence artifact is missing required fields." /></>;
  }

  const m = ev.metrics;
  const flags = ev.gate.point_go_but_lower_bound_flags;
  const picpUnder = m.picp_two_sided < ev.coverage_target;

  return (
    <>
      {heading}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Tag color={C.amber}>computed evidence artifact · not live serving</Tag>
        <Tag color={C.dim}>{ev.dataset} · as of {ev.as_of}</Tag>
      </div>

      <StatGrid cols={5} style={{ marginBottom: 14 }}>
        <MetricCard label="Coverage target" value={pct(ev.coverage_target)} sub="nominal" />
        <MetricCard label="PICP (measured)" value={pct(m.picp_two_sided)}
          accent={picpUnder ? C.amber : C.green}
          sub={picpUnder ? "near-nominal, slightly under" : "at/above target"} />
        <MetricCard label="Lower-bound coverage" value={pct(m.lower_bound_coverage_one_sided)} sub="one-sided" />
        <MetricCard label="Mean width" value={`${m.mean_interval_width_cycles}`}
          sub={`cycles · PINAW ${m.pinaw}`} />
        <MetricCard label="Point RMSE" value={m.point_rmse} sub="cycles" />
      </StatGrid>

      <Panel title="Point estimate vs conformal lower bound — operator clearance"
        right={<Tag color={C.red}>{flags} of {ev.n_test_units} flagged</Tag>}>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
          <strong style={{ color: C.text }}>{flags} of {ev.n_test_units}</strong> test units clear (GO) on the
          point estimate but the conformal lower bound demands REVIEW or NO-GO. Deciding on the lower bound
          changes the call on these units. Gate bands: NO-GO ≤ {ev.gate.thresholds_cycles.NO_GO_at_or_below},
          REVIEW ≤ {ev.gate.thresholds_cycles.REVIEW_at_or_below} cycles of remaining life.
        </p>
        <GateBar label="Clearance on the POINT estimate" dist={ev.gate.point_distribution} />
        <GateBar label="Clearance on the LOWER BOUND" dist={ev.gate.lower_bound_distribution} />
        <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 4 }}>
          {ev.gate.disagreement_units} units disagree between the two gates.
        </div>
      </Panel>

      <Panel title="Units that look safe on the point estimate" pad={0} style={{ marginTop: 14 }}>
        <ScrollTable minWidth={560}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "right" }}>
                {["Unit", "Point", "Lower", "Upper", "True RUL", "Point gate", "Lower-bound gate", "Covered"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: i === 0 ? "left" : "right",
                    borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ev.examples.map((e) => (
                <tr key={e.unit} style={{ color: C.dim }}>
                  <td style={{ padding: "8px 12px", color: C.text }}>{e.unit}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{e.point}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: C.amber }}>{e.lower}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{e.upper}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: C.text }}>{e.y_true}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: verdictColor(e.point_gate) }}>{e.point_gate}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: verdictColor(e.lower_bound_gate) }}>{e.lower_bound_gate}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: e.covered ? C.green : C.faint }}>{e.covered ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>

      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.7, marginTop: 14 }}>
        <div><strong style={{ color: C.dim }}>Method:</strong> {ev.method}.</div>
        <div><strong style={{ color: C.dim }}>Calibration:</strong> {ev.calibration_split}</div>
        <div style={{ marginTop: 6 }}><strong style={{ color: C.dim }}>Limitations:</strong></div>
        <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
          {ev.limitations.map((l, i) => <li key={i} style={{ marginBottom: 2 }}>{l}</li>)}
        </ul>
      </div>
    </>
  );
}
