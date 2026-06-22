"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getModelPerformance, getSummary, getRuns, getFusedVectorInfo,
  type ModelRun, type TelemetrySummary, type TestRun, type FusedVectorInfo,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  C, Tag, Panel, MetricCard, Loading, ErrorState, PageHeading, DisclosureFooter,
  StatGrid, SplitGrid, ResponsiveSwap, RowCard,
} from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";

function ModelCard({ m }: { m: ModelRun }) {
  const champ = m.promotion_state === "promoted";
  const accent = m.model_kind === "rul" ? C.green : C.cyan;
  const metrics = m.metrics || {};
  const primary = m.model_kind === "rul"
    ? ["RMSE", metrics.rmse != null ? Number(metrics.rmse).toFixed(2) : "—"]
    : ["F1", metrics.f1 != null ? Number(metrics.f1).toFixed(4) : "—"];
  const secondary = m.model_kind === "rul"
    ? `PHM ${metrics.phm != null ? Number(metrics.phm).toFixed(1) : "—"}`
    : `recall ${metrics.recall != null ? Number(metrics.recall).toFixed(3) : "—"} · precision ${metrics.precision != null ? Number(metrics.precision).toFixed(3) : "—"}`;
  const gate = (m.gate || {}) as Record<string, unknown>;
  return (
    <div style={{ background: champ ? C.panelHi : C.panel, border: `1px solid ${champ ? accent + "44" : C.border}`,
      borderRadius: 9, padding: 16, opacity: champ ? 1 : 0.92 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text }}>{m.model_name}</span>
        <Tag color={C.cyan}>v{m.model_version}</Tag>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        {m.model_alias ? <Tag color={C.green}>{m.model_alias}</Tag> : <Tag color={C.faint}>challenger</Tag>}
        <Tag color={C.dim}>{m.model_kind}</Tag>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 14 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em" }}>{primary[0]}</div>
          <div style={{ fontFamily: C.sans, fontSize: 28, fontWeight: 600, color: accent, lineHeight: 1, marginTop: 4 }}>{primary[1]}</div>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, textAlign: "right", maxWidth: 140 }}>{secondary}</div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        {champ ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}`, marginTop: 4, flexShrink: 0 }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.4 }}>
              Promoted · gate {String(gate.metric ?? "")} {String(gate.threshold ?? "")}
              {gate.selected_over ? <><br />selected over {String(gate.selected_over)}</> : null}
            </span>
          </div>
        ) : (
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.4 }}>
            Evaluated · {String(gate.note ?? "challenger")}
          </span>
        )}
      </div>
    </div>
  );
}

function num(n: number | null | undefined, digits = 0): string {
  return n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatTs(value?: string | null): string {
  if (!value) return "as-of unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

// One component-input card for the readiness panel. Shows a real headline value (or an explicit
// "Not available here") and links to the surface that owns it. No composite score is computed.
function ComponentCard({ name, value, href, hrefLabel }: {
  name: string; value: string; href: string; hrefLabel: string;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 14 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{name}</div>
      <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text, marginTop: 8, lineHeight: 1.4, minHeight: 34 }}>{value}</div>
      <Link href={href} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>{hrefLabel} →</Link>
    </div>
  );
}

export default function TelemetryOverview({ envId }: { envId: string }) {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [models, setModels] = useState<ModelRun[] | null>(null);
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [fused, setFused] = useState<FusedVectorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSummary(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getRuns(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getFusedVectorInfo(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID).catch(() => null),
    ])
      .then(([s, mp, r, fv]) => { setSummary(s); setModels(mp.models); setRuns(r); setFused(fv); })
      .catch((e) => setError(String(e)));
  }, []);

  // The page heading and the context module are static; only the operational sections below
  // depend on the serving API, so the narrative on-ramp renders even while loading or erroring.
  const heading = (
    <PageHeading eyebrow="Mission Summary"
      title="Mission health, model posture, and operating readiness"
      blurb="Executive summary read live from the telemetry serving API. Every value below is real or fails closed — nothing is seeded. Trace any governed number to its source on the Metric Lineage page."
      right={
        <Link href={`/lab/env/${envId}/telemetry/metric-lineage`}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
            border: "none", borderRadius: 8, padding: "10px 18px", textDecoration: "none" }}>
          Trace lineage →
        </Link>
      } />
  );
  const contextSection = (
    <section aria-label="Context: why launch became a data problem" style={{ margin: "0 0 24px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint,
        textTransform: "uppercase", marginBottom: 12 }}>
        Context: why launch became a data problem
      </div>
      <BottleneckMap />
    </section>
  );

  if (error) return (
    <>{heading}{contextSection}<ErrorState message={error} /></>
  );
  if (!summary || !models || !runs) return (
    <>{heading}{contextSection}<Loading label="Loading console…" /></>
  );

  const k = summary.kpi;
  const challengerF1 = models.find((m) => m.model_kind === "anomaly" && m.promotion_state !== "promoted")?.metrics?.f1;
  const challengerRmse = models.find((m) => m.model_kind === "rul" && m.promotion_state !== "promoted")?.metrics?.rmse;
  const noGoPct = summary.verdict_pct?.NO_GO != null ? Math.round(summary.verdict_pct.NO_GO * 100) : null;
  const inv = summary.inventory;

  return (
    <>
      {heading}

      {/* freshness / as-of — first-class, fail-closed */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 16px",
        fontFamily: C.mono, fontSize: 11, color: C.dim }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: k.last_scored_at ? C.green : C.amber }} />
        Data as of {formatTs(k.last_scored_at)} · live serving API · values real or fail closed
      </div>

      {/* mission readiness — fail closed (no composite number until the formula is ratified) */}
      <Panel title="Mission readiness" right={<Tag color={C.amber}>not available</Tag>}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.sans, fontSize: 30, fontWeight: 700, color: C.amber, lineHeight: 1 }}>Not available</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, maxWidth: 580, lineHeight: 1.5 }}>
            null_reason: composite_formula_not_ratified — Mission Readiness is a weighted composite; its formula,
            weights, and one input (live stream) are not yet ratified or seeded. The real component inputs are below.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ marginTop: 14 }}>
          <ComponentCard name="Operations" value={`${num(k.predictions)} predictions · ${k.test_runs} runs`}
            href={`/lab/env/${envId}/telemetry/monitoring`} hrefLabel="Monitoring" />
          <ComponentCard name="Quality"
            value={`F1 ${k.anomaly_f1 != null ? Number(k.anomaly_f1).toFixed(4) : "—"} · RMSE ${k.rul_rmse != null ? Number(k.rul_rmse).toFixed(2) : "—"}`}
            href={`/lab/env/${envId}/telemetry/model-performance`} hrefLabel="Model performance" />
          <ComponentCard name="Models" value={`${k.promoted_models} promoted / ${inv.model_runs} evaluated`}
            href={`/lab/env/${envId}/telemetry/registry`} hrefLabel="Model registry" />
          <ComponentCard name="AI" value="Not available here"
            href={`/lab/env/${envId}/telemetry/governance`} hrefLabel="Trust Center" />
        </div>
      </Panel>

      {/* metric strip */}
      <StatGrid cols={4} style={{ marginTop: 16 }}>
        <MetricCard label="Promoted models" value={String(k.promoted_models)} sub={`of ${inv.model_runs} evaluated`} />
        <MetricCard label="Anomaly F1" value={k.anomaly_f1 != null ? Number(k.anomaly_f1).toFixed(4) : "—"}
          sub={challengerF1 != null ? `champion vs ${Number(challengerF1).toFixed(4)} challenger` : undefined} accent={C.cyan} />
        <MetricCard label="RUL RMSE" value={k.rul_rmse != null ? Number(k.rul_rmse).toFixed(2) : "—"}
          sub={challengerRmse != null ? `champion vs ${Number(challengerRmse).toFixed(2)} challenger` : undefined} accent={C.green} />
        <MetricCard label="Predictions" value={num(k.predictions)}
          sub={noGoPct != null ? `${noGoPct}% no-go · ${k.test_runs} runs` : undefined} accent={C.amber} />
      </StatGrid>

      {/* operational leverage — technical debt -> launch impact (framework only; figures fail closed) */}
      <Panel title="Operational leverage — technical debt → launch impact" right={<Tag color={C.amber}>framework</Tag>} style={{ marginTop: 16 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          Causal chain: tech debt → engineering throughput → manufacturing &amp; test velocity → flight readiness → launch cadence.
          The framework is shown; the figures stay fail-closed until a governed metric registry can supply each
          modeled relationship with a basis + confidence. No projection is invented.
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" style={{ marginTop: 12 }}>
          {["Deployment failures", "Telemetry freshness", "Hot-fire analysis cycle", "Readiness-review duration", "Launch-cadence capacity"].map((label) => (
            <div key={label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber, marginTop: 6 }}>Projection unavailable</div>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>requires metric registry (modeled relationship + basis + confidence)</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* model registry + (replay preview + drift) */}
      <SplitGrid variant="main-side" style={{ marginTop: 16 }}>
        <Panel title="Model registry" right={<Tag color={C.green}>{k.promoted_models} promoted · {models.length - k.promoted_models} challengers</Tag>}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {models.map((m) => <ModelCard key={`${m.model_name}-${m.model_version}`} m={m} />)}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 14 }}>
            Aliases resolve from the MLflow registry. Only champions are exposed to /score.
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Verdict distribution" right={<Tag color={C.cyan}>{num(k.predictions)} scored</Tag>}>
            <VerdictBar verdicts={summary.verdicts} />
          </Panel>
          <Panel title="Operated-history disclosure">
            <p style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5 }}>{summary.note}</p>
          </Panel>
        </div>
      </SplitGrid>

      {/* Fused state vector (Phase 7A) — only when built + verified; shows the ACTUAL dim */}
      {fused?.available && (
        <Panel title="Fused state vector"
          right={<Tag color={C.cyan}>{fused.vector_dim}-d</Tag>} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 600, color: C.text }}>
              {fused.vector_dim} features
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>
              {fused.n_channels} NASA channels × {fused.features_per_channel} window features
              {fused.d4_included ? " · incl. D-4" : ""}
            </span>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 8 }}>
            {fused.feature_names?.join(" · ")}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            {fused.model}. {fused.fused_vectors} fused vectors ({fused.anomalous_test_vectors} labeled
            anomalous in test). {fused.alignment}
          </div>
        </Panel>
      )}

      {/* test runs + serving inventory */}
      <SplitGrid variant="main-side" style={{ marginTop: 16 }}>
        <Panel title="Ingested test runs" right={<Tag color={C.cyan}>{inv.test_runs} runs</Tag>}>
          <ResponsiveSwap
            mobile={
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {runs.slice(0, 8).map((r) => (
                  <RowCard key={r.id} title={r.run_key} tags={<Tag color={C.dim}>{r.dataset}</Tag>}
                    fields={[
                      { label: "Unit / craft", value: `${r.unit_or_channel}${r.spacecraft ? ` · ${r.spacecraft}` : ""}` },
                      { label: "Rows", value: r.row_count.toLocaleString() },
                    ]} />
                ))}
              </div>
            }
            desktop={
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 8, fontFamily: C.mono,
                  fontSize: 10, color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8 }}>
                  <span>Run</span><span>Dataset</span><span>Unit / craft</span><span>Rows</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {runs.slice(0, 8).map((r) => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 8,
                      fontFamily: C.mono, fontSize: 12, color: C.text, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.run_key}</span>
                      <span style={{ color: C.dim }}>{r.dataset}</span>
                      <span style={{ color: C.dim }}>{r.unit_or_channel}{r.spacecraft ? ` · ${r.spacecraft}` : ""}</span>
                      <span>{r.row_count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            } />
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 12 }}>
            SMAP/MSL anomaly channels (go/no-go) + C-MAPSS RUL units. {inv.test_runs} runs total.
          </div>
        </Panel>

        <Panel title="Serving data inventory">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {Object.entries(inv).map(([key, n]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: C.mono, fontSize: 12, color: n > 0 ? C.text : C.faint }}>tel_{key}</span>
                <Tag color={n > 0 ? C.green : C.amber}>{n} {n > 0 ? "rows" : "empty"}</Tag>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 12 }}>
            Drift monitors: {k.drift_monitors} · last score {k.last_scored_at ? new Date(k.last_scored_at).toISOString().slice(0, 10) : "—"}
          </div>
        </Panel>
      </SplitGrid>

      {contextSection}

      <DisclosureFooter />
    </>
  );
}

function VerdictBar({ verdicts }: { verdicts: Record<string, number> }) {
  const order = [["GO", C.green], ["REVIEW", C.amber], ["NO_GO", C.red]] as const;
  const total = Object.values(verdicts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {order.map(([v, col]) => {
          const n = verdicts[v] || 0;
          return n ? <div key={v} title={`${v} ${n}`} style={{ width: `${(n / total) * 100}%`, background: col }} /> : null;
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        {order.map(([v, col]) => (
          <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
              {v === "NO_GO" ? "NO-GO" : v} {verdicts[v] || 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
