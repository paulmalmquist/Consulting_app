"use client";

import { useEffect, useState } from "react";
import {
  getMonitoring, getSummary, type MonitoringResponse, type TelemetrySummary, type ConformalBudget,
  type StreamBlock,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, Tag, Panel, MetricCard, Loading, ErrorState, EmptyState, PageHeading, DisclosureFooter } from "./primitives";

export default function Monitoring() {
  const [mon, setMon] = useState<MonitoringResponse | null>(null);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getMonitoring(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getSummary(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
    ]).then(([m, s]) => { setMon(m); setSummary(s); }).catch((e) => setError(String(e)));
  }, []);

  const heading = <PageHeading eyebrow="Monitoring" title="Drift, anomaly rate, and serving health"
    blurb="Aggregated from the live prediction log and the drift series. The panel that says operated, not trained once. It shows a dash, not a fake zero, when a metric is not yet computed." />;
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!mon || !summary) return <>{heading}<Loading label="Loading monitoring…" /></>;

  const driftMonitors = summary.kpi.drift_monitors;
  const rate = mon.rolling_anomaly_rate;

  return (
    <>
      {heading}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Predictions logged" value={String(summary.kpi.predictions)} />
        <MetricCard label="Rolling no-go rate" value={rate != null ? `${(rate * 100).toFixed(1)}%` : "—"} accent={C.amber} />
        <MetricCard label="Drift monitors" value={String(driftMonitors)} sub={mon.psi != null ? `worst PSI ${mon.psi.toFixed(2)}` : "PSI computed"} />
        <MetricCard label="Serving model" value={mon.latest_model_version ? `v${mon.latest_model_version}` : "—"} sub={mon.latest_model_name ?? undefined} accent={C.cyan} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Panel title="Drift status (PSI per monitored channel)">
          {driftMonitors > 0 ? (
            <DriftBands summary={summary} />
          ) : (
            <EmptyState label="No drift metrics computed yet"
              hint="tel_drift_metrics is empty. Populate PSI per feature per window to light up this panel." />
          )}
        </Panel>
        <Panel title="Serving state">
          <Row label="Champion currently serving" value={mon.latest_model_name ? `${mon.latest_model_name} (${mon.latest_model_alias ?? "—"})` : "—"} />
          <Row label="Last scored at" value={mon.last_scored_at ? new Date(mon.last_scored_at).toISOString().replace("T", " ").slice(0, 19) : "never"} />
          <Row label="Window" value={mon.window_label} />
          <Row label="PSI bands" value="stable <0.1 · watch 0.1-0.25 · drift >0.25" />
        </Panel>
      </div>

      {mon.conformal_budget && <ConformalBudgetPanel b={mon.conformal_budget} liveRate={rate} />}

      {mon.stream && <StreamHealthPanel s={mon.stream} />}

      <Panel style={{ marginTop: 16 }} pad={14}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>{summary.note}</span>
      </Panel>
      <DisclosureFooter />
    </>
  );
}

// Stream Health — RS Demo streaming slice summary (renders only when the streaming tables exist and
// carry a status row). Fail-closed: stale/failed states are shown with their reason, never hidden.
function StreamHealthPanel({ s }: { s: StreamBlock }) {
  const col = s.status === "fresh" ? C.green : s.status === "stale" ? C.amber : C.red;
  return (
    <Panel title="Stream health (live ingestion)" style={{ marginTop: 16 }}
      right={<Tag color={col}>{s.status ?? "unknown"}</Tag>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Pipeline status" value={s.status ?? "unknown"} accent={col}
          sub={s.reason ?? undefined} />
        <MetricCard label="Last frame at"
          value={s.last_frame_at ? new Date(s.last_frame_at).toISOString().slice(11, 19) + " UTC" : "—"} />
        <MetricCard label="Rows / min" value={s.rows_per_min != null ? String(s.rows_per_min) : "—"}
          accent={C.cyan} />
        <MetricCard label="Failing assertions (15m)"
          value={s.failing_assertions != null ? String(s.failing_assertions) : "—"}
          accent={s.failing_assertions ? C.red : C.green} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6,
        display: "block", marginTop: 10 }}>
        Live ISS public-telemetry ingestion (bronze → silver → gold). Detail — per-channel freshness,
        ingest-lag percentiles, the assertion board — lives on the Mission Control page and
        /api/telemetry/stream/health.
      </span>
    </Panel>
  );
}

// Conformal false-alarm budget — Track A surface-only diagnostic (renders only when the champion row
// carries the conformal fields). The live GO/NO-GO verdict bands are NOT changed by this.
function ConformalBudgetPanel({ b, liveRate }: { b: ConformalBudget; liveRate: number | null }) {
  const pct = (x: number | null | undefined) => (x != null ? `${(x * 100).toFixed(1)}%` : "—");
  const color = b.status === "within" ? C.green : b.status === "approaching" ? C.amber : b.status === "over" ? C.red : C.faint;
  return (
    <Panel title="Conformal false-alarm budget (diagnostic)" style={{ marginTop: 16 }}
      right={b.status ? <Tag color={color}>{b.status} budget</Tag> : undefined}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <MetricCard label="Target false-alarm budget (α)" value={pct(b.alpha)} />
        <MetricCard label="Measured calibration FA rate" value={pct(b.measured_false_alarm_rate)} accent={color} />
        <MetricCard label="Calibration coverage" value={pct(b.calib_coverage)} accent={C.green} />
        <MetricCard label="Live rolling no-go rate" value={pct(liveRate)} accent={C.amber} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, display: "block", marginTop: 10 }}>
        Measured on a blocked (contiguous) nominal-train calibration slice against the frozen detector
        (K={b.frozen_k ?? "—"}); to hold false alarms at α you would set K≈{b.threshold_quantile ?? "—"}. This is a
        diagnostic — the live GO/NO-GO verdict bands are unchanged.
      </span>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Lightweight status summary from the inventory/note (counts only; detail lives in the drift series).
function DriftBands({ summary }: { summary: TelemetrySummary }) {
  return (
    <div>
      <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
        {summary.kpi.drift_monitors} channels monitored. PSI is computed from real train-vs-test
        distribution shift across sequential windows; most channels read stable, a degraded minority
        show watch/drift.
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
        <Tag color={C.green}>stable</Tag><Tag color={C.amber}>watch</Tag><Tag color={C.red}>drift</Tag>
      </div>
    </div>
  );
}
