"use client";

import { useEffect, useState } from "react";
import {
  getMonitoring, getSummary, type MonitoringResponse, type TelemetrySummary,
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

      <Panel style={{ marginTop: 16 }} pad={14}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>{summary.note}</span>
      </Panel>
      <DisclosureFooter />
    </>
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
