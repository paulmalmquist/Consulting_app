"use client";

import { useEffect, useState } from "react";
import {
  getFusedVectorInfo, type FusedVectorInfo,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  C, Panel, MetricCard, Loading, ErrorState, EmptyState, PageHeading, Tag,
  StatGrid, ScrollTable,
} from "./primitives";

// Feature Contract — the honest, real-data view of the fused state vector that anomaly/RUL models
// consume. Every number comes from /api/telemetry/fused-vector-info; nothing is invented. The
// point-in-time / leakage block below is a static methodology descriptor (how the gold features are
// built), not a live metric — it carries no fabricated numbers.
export default function FeatureContractCard({ embedded = false }: { embedded?: boolean } = {}) {
  const [info, setInfo] = useState<FusedVectorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFusedVectorInfo(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setInfo).catch((e) => setError(String(e)));
  }, []);

  const heading = embedded ? null : (
    <PageHeading eyebrow="Feature Contract" title="The fused state vector the models consume"
      blurb="The exact feature set every anomaly/RUL champion reads, pulled from the gold feature table. Counts, channel decomposition, and feature names are real; the point-in-time and leakage controls below describe how the features are built, not live metrics." />
  );
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!info) return <>{heading}<Loading label="Loading feature contract…" /></>;
  if (info.available === false || info.null_reason) {
    return <>{heading}<EmptyState label="Feature contract not available"
      hint={info.null_reason || "The fused-vector feature table is empty. Build the gold feature set to light up this contract."} /></>;
  }

  // Feature-set name: only claim the canonical name when the response actually carries a model/source
  // identifier; otherwise derive an honest fallback from what the response provides. Never invent.
  const featureSetName = info.model || info.source
    ? "tel_fused_state_v1"
    : (info.source ?? "fused state vector");

  const featureNames = info.feature_names ?? [];

  return (
    <>
      {heading}
      <StatGrid cols={4}>
        <MetricCard label="Feature count" value={info.vector_dim != null ? String(info.vector_dim) : "—"}
          sub="fused vector dimension" accent={C.cyan} />
        <MetricCard label="Decomposition"
          value={info.n_channels != null && info.features_per_channel != null
            ? `${info.n_channels} × ${info.features_per_channel}`
            : "—"}
          sub="channels × features/channel" />
        <MetricCard label="Fused vectors" value={info.fused_vectors != null ? String(info.fused_vectors) : "—"}
          sub={info.anomalous_test_vectors != null ? `${info.anomalous_test_vectors} anomalous (test)` : undefined} />
        <MetricCard label="D-4 channel"
          value={info.d4_included == null ? "—" : info.d4_included ? "included" : "excluded"}
          accent={info.d4_included ? C.green : C.amber} />
      </StatGrid>

      <Panel title="Contract" style={{ marginTop: 16 }}
        right={<Tag color={C.cyan}>{featureSetName}</Tag>}>
        <Row label="Feature set" value={featureSetName} />
        <Row label="Source table" value={info.source ?? "—"} />
        <Row label="Model alignment" value={info.alignment ?? "—"} />
        <Row label="Consuming model" value={info.model ?? "—"} />
        <Row label="Channels" value={info.channels?.length != null ? `${info.channels.length} monitored` : "—"} />
      </Panel>

      <Panel title="Methodology — point-in-time & leakage controls" style={{ marginTop: 16 }} pad={16}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Descriptor
            head="Point-in-time control: enforced"
            body="Gold features use ROWS BETWEEN n PRECEDING (no FOLLOWING) — every feature value is computed from the current tick and its history only, never future ticks. No look-ahead." />
          <Descriptor
            head="Leakage guard: train/test split by run"
            body="The train/test split is by run, not by row, so no run leaks across the boundary. Missing buckets use train-median imputation; the imputation statistic is fit on train only." />
        </div>
        <p style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, marginTop: 12 }}>
          These are fixed descriptors of how the feature table is built, not live numbers.
        </p>
      </Panel>

      <Panel title={`Feature names (${featureNames.length})`} style={{ marginTop: 16 }} pad={16}>
        {featureNames.length > 0 ? (
          <ScrollTable minWidth={0}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {featureNames.map((name) => (
                <span key={name}
                  style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 9px" }}>
                  {name}
                </span>
              ))}
            </div>
          </ScrollTable>
        ) : (
          <EmptyState label="No feature names reported"
            hint="The response carried no feature_names array; the count above still reflects the real vector dimension." />
        )}
      </Panel>
    </>
  );
}

function Descriptor({ head, body }: { head: string; body: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${C.green}`, paddingLeft: 12 }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.green, fontWeight: 600 }}>{head}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.dim, lineHeight: 1.55, marginTop: 4 }}>{body}</div>
    </div>
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
