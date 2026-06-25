"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  type MetadataConfidence,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  C,
  EmptyState,
  Loading,
  PageHeading,
  Panel,
  StatGrid,
  MetricCard,
  StatusDot,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";
import LineageDrawer from "../metadata/LineageDrawer";

// Relationships & Lineage — the declared, typed edges between catalog objects (with confidence) plus
// the full upstream trace for any node via the shared LineageDrawer. Phase 1 shows what relationships
// EXIST and how confident the catalog is in each; it does NOT yet render a safe/unsafe/bridge join
// VERDICT — that classification is declared next-phase work and labeled as such, not faked.

function confidenceColor(c: MetadataConfidence): string {
  if (c === "explicit") return C.green;
  if (c === "inferred") return C.amber;
  return C.faint; // unknown
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export default function RelationshipsLineage({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => { if (live) setGraph(g); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [envId]);

  const nodeMap = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n] as const)),
    [graph],
  );

  const byConfidence = useMemo(() => {
    const counts: Record<MetadataConfidence, number> = { explicit: 0, inferred: 0, unknown: 0 };
    for (const e of graph?.edges ?? []) counts[e.confidence] += 1;
    return counts;
  }, [graph]);

  // Traceable focus nodes: metrics + gold tables (where "where did this come from?" matters most).
  const traceable = useMemo(
    () => (graph?.nodes ?? [])
      .filter((n) => n.kind === "metric" || n.layer === "gold")
      .sort((a, b) => a.label.localeCompare(b.label)),
    [graph],
  );

  const heading = (
    <PageHeading
      eyebrow="Relationships · Lineage"
      title="Relationships & Lineage"
      blurb="Which objects connect to which, how, and with what confidence — plus the full upstream trace behind any metric or gold table. A relationship the catalog can't vouch for is marked inferred or unknown, not presented as fact."
    />
  );

  const traceNode: TelemetryMetadataNode | null = traceId ? nodeMap.get(traceId) ?? null : null;

  if (error && !graph) {
    return <>{heading}<TelemetryStatusBanner tone="error">Metadata catalog unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!graph) return <>{heading}<Loading label="Loading relationships…" /></>;

  return (
    <>
      {heading}

      <TelemetryStatusBanner tone="info">
        Join-safety classification (safe · bridge-required · blocked) and recommended bridge paths are
        next-phase work. Today this surface shows declared relationships and the catalog&rsquo;s confidence
        in each — not a safety verdict.
      </TelemetryStatusBanner>

      <StatGrid cols={4} style={{ marginTop: 16 }}>
        <MetricCard label="Relationships" value={graph.edges.length} sub="typed edges" />
        <MetricCard label="Explicit" value={byConfidence.explicit} sub="cataloged & confirmed" accent={C.green} />
        <MetricCard label="Inferred" value={byConfidence.inferred} sub="derived, lower confidence" accent={byConfidence.inferred ? C.amber : undefined} />
        <MetricCard label="Unknown" value={byConfidence.unknown} sub="confidence not established" accent={byConfidence.unknown ? C.amber : undefined} />
      </StatGrid>

      <TelemetrySection label="Declared relationships">
        {graph.edges.length === 0 ? (
          <EmptyState label="No relationships cataloged" hint="The metadata catalog returned no edges for this scope." />
        ) : (
          <Panel pad={0}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {graph.edges.map((edge) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                return (
                  <div key={edge.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 16px", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{src?.label ?? edge.source}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden><path d="M1 4.5h11M9 1.5l3 3-3 3" stroke={C.faint} strokeWidth="1.1" fill="none" strokeLinecap="round" /></svg>
                      {humanize(edge.relationship)}
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{tgt?.label ?? edge.target}</span>
                    <span style={{ marginLeft: "auto" }}>
                      <Tag color={confidenceColor(edge.confidence)}>{edge.confidence}</Tag>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </TelemetrySection>

      <TelemetrySection label="Trace lineage">
        <Panel>
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginBottom: 12 }}>
            Pick a metric or gold table to see its complete upstream chain — source → bronze → silver → gold →
            metric — with freshness at every hop. Nodes with no cataloged source fail closed.
          </p>
          {traceable.length === 0 ? (
            <EmptyState label="Nothing traceable yet" hint="No metrics or gold tables are cataloged for this scope." />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {traceable.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setTraceId(n.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: C.mono, fontSize: 11, color: C.text, background: C.panelHi, border: `1px solid ${C.borderHi}`, borderRadius: 7, padding: "7px 11px" }}
                >
                  <StatusDot color={n.status === "fresh" ? C.green : n.status === "missing" ? C.red : C.amber} size={6} />
                  {n.label}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </TelemetrySection>

      <LineageDrawer
        node={traceNode}
        nodes={graph.nodes}
        edges={graph.edges}
        generatedAt={graph.generated_at}
        onClose={() => setTraceId(null)}
      />
    </>
  );
}
