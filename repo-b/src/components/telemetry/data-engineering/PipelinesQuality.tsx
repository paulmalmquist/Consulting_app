"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  metadataVisualLane,
  type MetadataStatus,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  C,
  EmptyState,
  Loading,
  MetricCard,
  PageHeading,
  Panel,
  StatGrid,
  StatusDot,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";

// Pipelines & Quality — the medallion (source -> bronze -> silver -> gold) with the freshness/quality
// state of each stage. IMPORTANT (per plan): this derives stage health from the catalog node `status`
// the metadata endpoint already exposes (which the backend computes from pipeline/DQ state). It does
// NOT claim a direct tel_pipeline_status / tel_dq_assertions frontend feed — that dedicated feed is a
// follow-up. Anything unknown fails closed; no fabricated "all green" board.

const MEDALLION = [
  { lane: "source", label: "Source", note: "adapters / capture" },
  { lane: "bronze", label: "Bronze", note: "append-only landing" },
  { lane: "silver", label: "Silver", note: "deduped / conformed" },
  { lane: "gold", label: "Gold", note: "aggregated / served" },
] as const;

function worstStatus(nodes: TelemetryMetadataNode[]): MetadataStatus {
  if (nodes.some((n) => n.status === "missing")) return "missing";
  if (nodes.some((n) => n.status === "quarantined")) return "quarantined";
  if (nodes.some((n) => n.status === "stale")) return "stale";
  if (nodes.some((n) => n.status === "fresh")) return "fresh";
  return "unknown";
}

function statusColor(status: MetadataStatus): string {
  if (status === "fresh") return C.green;
  if (status === "missing") return C.red;
  if (status === "stale" || status === "quarantined") return C.amber;
  return C.faint;
}

export default function PipelinesQuality({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => { if (live) setGraph(g); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [envId]);

  const stages = useMemo(() => {
    if (!graph) return [];
    return MEDALLION.map((stage) => {
      const nodes = graph.nodes.filter((n) => metadataVisualLane(n) === stage.lane);
      return { ...stage, nodes, status: worstStatus(nodes) };
    });
  }, [graph]);

  const risks = useMemo(
    () => (graph?.nodes ?? []).filter((n) => n.status === "stale" || n.status === "missing" || n.status === "quarantined"),
    [graph],
  );

  const heading = (
    <PageHeading
      eyebrow="Pipelines · Quality"
      title="Pipelines & Quality"
      blurb="The medallion path each signal travels, and whether every stage is fresh. A downstream metric is only as trustworthy as the weakest stage feeding it — stale, missing, or quarantined stages surface here rather than being smoothed over."
    />
  );

  if (error && !graph) {
    return <>{heading}<TelemetryStatusBanner tone="error">Pipeline/quality state unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!graph) return <>{heading}<Loading label="Loading pipeline state…" /></>;

  return (
    <>
      {heading}

      <TelemetryStatusBanner tone="info">
        Stage health is derived from catalog node status (computed server-side from pipeline and
        data-quality state). A dedicated pipeline-run and DQ-assertion feed to the frontend is a
        follow-up; until then, unknown stages read &ldquo;unknown,&rdquo; never &ldquo;passing.&rdquo;
      </TelemetryStatusBanner>

      <TelemetrySection label="Medallion flow">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((stage, i) => (
            <Panel key={stage.lane} pad={15}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase" }}>
                  {i + 1} · {stage.label}
                </span>
                <Tag color={statusColor(stage.status)}>{stage.status}</Tag>
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 26, fontWeight: 600, color: C.text, marginTop: 8 }}>{stage.nodes.length}</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 4 }}>{stage.note}</div>
            </Panel>
          ))}
        </div>
      </TelemetrySection>

      <StatGrid cols={4} style={{ marginTop: 4 }}>
        <MetricCard label="Fresh" value={graph.nodes.filter((n) => n.status === "fresh").length} sub="catalog nodes" accent={C.green} />
        <MetricCard label="Stale" value={graph.nodes.filter((n) => n.status === "stale").length} sub="past freshness window" accent={graph.nodes.some((n) => n.status === "stale") ? C.amber : undefined} />
        <MetricCard label="Quarantined" value={graph.nodes.filter((n) => n.status === "quarantined").length} sub="failed a DQ check" accent={graph.nodes.some((n) => n.status === "quarantined") ? C.amber : undefined} />
        <MetricCard label="Missing" value={graph.nodes.filter((n) => n.status === "missing").length} sub="no data / metadata" accent={graph.nodes.some((n) => n.status === "missing") ? C.red : undefined} />
      </StatGrid>

      <TelemetrySection label="Open data risks">
        {risks.length === 0 ? (
          <EmptyState label="No open data risks reported" hint="Every catalog node is fresh, or its status is unknown (shown above) — no stage is being silently treated as passing." />
        ) : (
          <Panel pad={0}>
            {risks.map((node) => (
              <div key={node.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                <StatusDot color={statusColor(node.status ?? "unknown")} size={7} />
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{node.label}</span>
                <Tag color={C.faint}>{node.layer ?? metadataVisualLane(node)}</Tag>
                <span style={{ marginLeft: "auto" }}><Tag color={statusColor(node.status ?? "unknown")}>{node.status ?? "unknown"}</Tag></span>
              </div>
            ))}
          </Panel>
        )}
      </TelemetrySection>
    </>
  );
}
