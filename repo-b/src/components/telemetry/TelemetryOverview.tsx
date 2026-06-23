"use client";

// Overview — the charts-led landing. Leads with a compact real-telemetry KPI strip (genuine product
// metrics from the serving API), then the Spaceflight Bottleneck Map: the launch-attempts timeline,
// who-flies commercial-vs-government, the cost-to-LEO curve, the pinned event record, and presenter
// mode. The Bottleneck Map is a static public-data context module (no API) so it always renders; the
// KPI strip is the only API-dependent part and fails closed. No executive "readiness"/"projection"
// scaffolding here — real metrics + the launch-history charts.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getSummary, type TelemetrySummary,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, StatGrid, MetricCard, PageHeading, DisclosureFooter } from "./primitives";
import BottleneckMap from "./context/BottleneckMap/BottleneckMap";

function num(n: number | null | undefined): string {
  return n == null ? "—" : Number(n).toLocaleString();
}

export default function TelemetryOverview({ envId }: { envId: string }) {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setSummary)
      .catch((e) => setError(String(e)));
  }, []);

  const heading = (
    <PageHeading eyebrow="Overview"
      title="Why launch became a data problem"
      blurb="Every era of spaceflight solved the previous bottleneck and exposed a new one — today it is decision velocity. The live telemetry platform that addresses it is in the tabs at left; the launch-history charts below frame why it matters. The KPI strip is read from the serving API; the history is public-data context."
      right={
        <Link href={`/lab/env/${envId}/telemetry/metric-lineage`}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
            border: "none", borderRadius: 8, padding: "10px 18px", textDecoration: "none" }}>
          Trace lineage →
        </Link>
      } />
  );

  const k = summary?.kpi;
  const inv = summary?.inventory;
  const noGoPct = summary?.verdict_pct?.NO_GO != null ? Math.round(summary.verdict_pct.NO_GO * 100) : null;

  // Real telemetry KPI strip — genuine product metrics, fail-closed.
  const kpiStrip = error ? (
    <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 9, padding: "12px 14px",
      fontFamily: C.mono, fontSize: 11.5, color: C.amber, lineHeight: 1.5 }}>
      Live KPIs unavailable — serving API did not respond. null_reason: serving_unreachable. The launch-history
      context below is static public data and still renders.
    </div>
  ) : !summary || !k || !inv ? (
    <div style={{ fontFamily: C.mono, fontSize: 12.5, color: C.dim }}>Loading serving KPIs…</div>
  ) : (
    <StatGrid cols={4}>
      <MetricCard label="Promoted models" value={String(k.promoted_models)} sub={`of ${inv.model_runs} evaluated`} />
      <MetricCard label="Anomaly F1" value={k.anomaly_f1 != null ? Number(k.anomaly_f1).toFixed(4) : "—"} accent={C.cyan} />
      <MetricCard label="RUL RMSE" value={k.rul_rmse != null ? Number(k.rul_rmse).toFixed(2) : "—"} accent={C.green} />
      <MetricCard label="Predictions" value={num(k.predictions)}
        sub={noGoPct != null ? `${noGoPct}% no-go · ${k.test_runs} runs` : undefined} accent={C.amber} />
    </StatGrid>
  );

  return (
    <>
      {heading}

      {kpiStrip}

      {/* Spaceflight Bottleneck Map: launch timeline, commercial-vs-government, cost-to-LEO, event
          record, and presenter mode. Static public-data context module. */}
      <section aria-label="Spaceflight bottleneck — launch history" style={{ marginTop: 22 }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.dim,
          textTransform: "uppercase", marginBottom: 12 }}>
          Context · why launch became a data problem
        </div>
        <BottleneckMap />
      </section>

      <DisclosureFooter />
    </>
  );
}
