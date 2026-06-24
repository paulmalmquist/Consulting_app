"use client";

// Regime-conditioned anomaly detection on C-MAPSS FD004 (Spin 1 + the degenerate-autoencoder fix).
// Renders a COMPUTED EVIDENCE ARTIFACT (repo-b/src/lib/telemetry/regimeAnomalyEvidence.json),
// produced by telemetry-platform/compute_regime_anomaly.py from real FD004 data on Databricks.
// The judgment artifact: built the obvious global reconstruction-error detector, measured it on
// FD004's six operating conditions, found its false positives are entirely explained by operating
// regime (not faults), and conditioned on regime. Honest, reproducible, labeled not-live.

import evidence from "@/lib/telemetry/regimeAnomalyEvidence.json";
import { C, EmptyState, MetricCard, PageHeading, Panel, ScrollTable, StatGrid, Tag } from "./primitives";

interface RegimeRow { regime: number; n_eval_rows: number; global_fp: number; regime_conditioned_fp: number }
interface Evidence {
  as_of: string; dataset: string; source_table: string; method: string; healthy_definition: string;
  fp_metric: string; n_healthy_rows: number; n_units: number; n_eval_rows: number; n_regimes: number;
  metrics: {
    global_worst_regime_fp: number; regime_conditioned_worst_regime_fp: number;
    global_mean_fp: number; regime_conditioned_mean_fp: number;
    worst_regime_fp_reduction_pct: number; mean_fp_reduction_pct: number;
    recon_error_variance_explained_by_regime_global: number;
    recon_error_variance_explained_by_regime_conditioned: number;
  };
  per_regime: RegimeRow[]; finding: string; limitations: string[];
}

const ev = evidence as Evidence;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function FpBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: C.panel, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ width: `${Math.min(100, value * 100)}%`, height: "100%", background: `${color}aa` }} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 11, color, minWidth: 42, textAlign: "right" }}>{pct(value)}</span>
    </div>
  );
}

export default function RegimeAnomalyCard() {
  const heading = (
    <PageHeading eyebrow="Anomaly · regime-conditioned"
      title="The error tracked the operating condition, not the fault"
      blurb="Built the obvious global reconstruction-error detector on C-MAPSS FD004 (six operating conditions), measured it, and found its false positives were entirely explained by operating regime. Conditioning on regime fixes it — the 'built it, measured it, found the break, shipped the fix' artifact behind the degenerate-autoencoder story." />
  );
  if (!ev?.metrics || !Array.isArray(ev.per_regime)) {
    return <>{heading}<EmptyState label="Regime anomaly evidence unavailable" hint="Computed artifact missing required fields." /></>;
  }
  const m = ev.metrics;

  return (
    <>
      {heading}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Tag color={C.amber}>computed evidence artifact · not live serving</Tag>
        <Tag color={C.dim}>{ev.dataset} · as of {ev.as_of}</Tag>
      </div>

      <StatGrid cols={4} style={{ marginBottom: 14 }}>
        <MetricCard label="Worst-regime false positives" value={`${pct(m.global_worst_regime_fp)} → ${pct(m.regime_conditioned_worst_regime_fp)}`}
          accent={C.green} sub={`${m.worst_regime_fp_reduction_pct}% reduction`} />
        <MetricCard label="Mean false positives" value={`${pct(m.global_mean_fp)} → ${pct(m.regime_conditioned_mean_fp)}`}
          accent={C.green} sub="across regimes (healthy rows)" />
        <MetricCard label="Recon error explained by regime" value={`${m.recon_error_variance_explained_by_regime_global.toFixed(2)} → ${m.recon_error_variance_explained_by_regime_conditioned.toFixed(2)}`}
          accent={C.amber} sub="η² — 1.0 = entirely regime-driven" />
        <MetricCard label="Scope" value={`${ev.n_regimes} regimes`} sub={`${ev.n_healthy_rows.toLocaleString()} healthy rows · ${ev.n_units} units`} />
      </StatGrid>

      <Panel title="False-positive rate per operating regime — global vs regime-conditioned"
        right={<Tag color={C.red}>global flags healthy points in {ev.per_regime.filter((r) => r.global_fp > 0.5).length} of {ev.n_regimes} regimes</Tag>}>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.6, margin: "0 0 14px" }}>
          A detector calibrated on one operating condition flags nearly every <strong style={{ color: C.text }}>healthy</strong> point
          in the other conditions as anomalous — false alarms, not faults. Per-regime standardization collapses them to a uniform rate.
        </p>
        <ScrollTable minWidth={520}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: C.faint }}>
                {["Regime", "Eval rows", "Global (single-mode)", "Regime-conditioned"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: i < 2 ? "left" : "left",
                    borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ev.per_regime.map((r) => (
                <tr key={r.regime} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "8px 12px", color: C.text }}>#{r.regime}</td>
                  <td style={{ padding: "8px 12px", color: C.dim }}>{r.n_eval_rows.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", minWidth: 150 }}><FpBar value={r.global_fp} color={C.red} /></td>
                  <td style={{ padding: "8px 12px", minWidth: 150 }}><FpBar value={r.regime_conditioned_fp} color={C.green} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>

      <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, lineHeight: 1.6, margin: "14px 0",
        padding: "12px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {ev.finding}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.7 }}>
        <div><strong style={{ color: C.dim }}>Method:</strong> {ev.method}</div>
        <div><strong style={{ color: C.dim }}>Healthy:</strong> {ev.healthy_definition} · <strong style={{ color: C.dim }}>FP:</strong> {ev.fp_metric}</div>
        <div style={{ marginTop: 6 }}><strong style={{ color: C.dim }}>Limitations:</strong></div>
        <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
          {ev.limitations.map((l, i) => <li key={i} style={{ marginBottom: 2 }}>{l}</li>)}
        </ul>
      </div>
    </>
  );
}
