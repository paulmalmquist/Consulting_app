"use client";

import { useEffect, useState } from "react";
import {
  getSummary, getFusedVectorInfo,
  type TelemetrySummary, type FusedVectorInfo,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  C, Panel, Loading, ErrorState, EmptyState, PageHeading, DisclosureFooter,
} from "./primitives";

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: tone || C.text, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function n(v: number | undefined | null): string {
  return v == null ? "—" : Number(v).toLocaleString("en-US");
}

// The fused-vector output sub-section. Fails closed on its own: if the fused info is unavailable we
// show only that section's null_reason and keep the rest of the card intact.
function FusedSection({ fused }: { fused: FusedVectorInfo }) {
  if (!fused.available) {
    return (
      <EmptyState label="Fused state vector unavailable"
        hint={fused.null_reason || "fused-vector-info reports unavailable for this environment."} />
    );
  }
  const dims = fused.n_channels != null && fused.features_per_channel != null
    ? `${fused.n_channels} channels × ${fused.features_per_channel} feats`
    : null;
  return (
    <div>
      <Row label="Fused state vector" value={fused.vector_dim != null ? `${fused.vector_dim}-dim` : "—"} tone={C.cyan} />
      {dims && <Row label="Composition" value={dims} />}
      {fused.source && <Row label="Source table" value={fused.source} />}
      {fused.alignment && <Row label="Alignment" value={fused.alignment} />}
      {fused.fused_vectors != null && <Row label="Fused vectors built" value={n(fused.fused_vectors)} />}
    </div>
  );
}

export default function PipelineEvidenceCard() {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [fused, setFused] = useState<FusedVectorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSummary(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
      getFusedVectorInfo(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID),
    ])
      .then(([s, f]) => { setSummary(s); setFused(f); })
      .catch((e) => setError(String(e)));
  }, []);

  const heading = <PageHeading eyebrow="Pipeline Evidence" title="Where is Spark actually used?"
    blurb="The feature-build pipeline answered concretely: real channel inputs, the 256-feature fused state vector it emits, real row counts and last-run time, and whether a model cleared the gate. Static lines describe the architecture; every number is fetched." />;

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!summary) return <>{heading}<Loading label="Loading pipeline evidence…" /></>;

  const inv = summary.inventory || {};
  const channels = inv.telemetry_channels;
  const rowsProcessed = (inv.predictions ?? 0) + (inv.test_runs ?? 0);
  const lastRun = summary.kpi.last_scored_at;
  const promoted = summary.kpi.promoted_models;

  return (
    <>
      {heading}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel title="telemetry_feature_build — Databricks / PySpark medallion">
          <Row label="Pipeline" value="telemetry_feature_build" />
          <Row label="Runtime" value="Databricks / PySpark medallion" tone={C.cyan} />
          <Row label="Input — telemetry channels" value={n(channels)} />
          <Row label="Rows processed (predictions + test runs)" value={n(rowsProcessed)} />
          <Row label="Last run (last scored at)"
            value={lastRun ? new Date(lastRun).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never"} />
          <Row label="Validation (a model promoted past the gate)"
            value={promoted > 0 ? "passed gate" : "—"} tone={promoted > 0 ? C.green : C.faint} />

          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, display: "block",
            borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 12 }}>
            Lineage: raw telemetry → bronze → silver (no-look-ahead) → gold (rolling, ROWS BETWEEN n PRECEDING)
            → 256-feat fused vector → prediction.
          </span>
        </Panel>

        <Panel title="Output — fused state vector">
          {fused ? <FusedSection fused={fused} />
            : <EmptyState label="Fused state vector unavailable" hint="fused-vector-info did not load for this environment." />}
        </Panel>
      </div>
      <DisclosureFooter />
    </>
  );
}
