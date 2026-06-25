"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  classifyRelationship,
  tallyVerdicts,
  VERDICT_LABEL,
  type SafetyResult,
} from "@/lib/telemetry/relationshipSafety";
import {
  C,
  EmptyState,
  Loading,
  MetricCard,
  PageHeading,
  Panel,
  SelectField,
  StatGrid,
  StatusDot,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";
import LineageDrawer from "../metadata/LineageDrawer";
import RelationshipSafetyDrawer, { verdictColor } from "./RelationshipSafetyDrawer";
import RelationshipScenario from "./RelationshipScenario";

// Relationships & Lineage (Phase 2A): every cataloged edge now carries a join-safety verdict
// (safe / bridge-required / unsafe / unverifiable) computed by the pure classifier in
// lib/telemetry/relationshipSafety.ts. A "safe" verdict requires positive evidence (declared FK or
// matching declared grain); otherwise it fails closed to "unverifiable" — never a fake green. Click a
// row for the grain/keys/confidence/bridge drawer. Lineage trace + the grounded Stargate scenario follow.

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export default function RelationshipsLineage({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [safetyEdgeId, setSafetyEdgeId] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState("");

  useEffect(() => {
    let live = true;
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => { if (!live) return; if (g) setGraph(g); else setError("metadata_graph_unreachable"); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [envId]);

  const nodeMap = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n] as const)),
    [graph],
  );

  // Classify every edge once.
  const classified = useMemo(
    () => (graph?.edges ?? []).map((edge) => ({
      edge,
      result: classifyRelationship(edge, nodeMap.get(edge.source), nodeMap.get(edge.target)),
    })),
    [graph, nodeMap],
  );

  const tally = useMemo(() => tallyVerdicts(classified.map((c) => c.result)), [classified]);

  const visible = useMemo(
    () => (verdictFilter ? classified.filter((c) => c.result.verdict === verdictFilter) : classified),
    [classified, verdictFilter],
  );

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
      blurb="Which objects connect, how, and whether a join across them is safe. Every relationship gets a verdict from the catalog's own evidence — declared keys, declared grain, freshness, confidence. When the evidence isn't there, the verdict fails closed to unverifiable; it is never upgraded to safe on a guess."
    />
  );

  const selectedSafety: { result: SafetyResult; source: TelemetryMetadataNode | null; target: TelemetryMetadataNode | null } | null = useMemo(() => {
    if (!safetyEdgeId) return null;
    const hit = classified.find((c) => c.edge.id === safetyEdgeId);
    if (!hit) return null;
    return { result: hit.result, source: nodeMap.get(hit.edge.source) ?? null, target: nodeMap.get(hit.edge.target) ?? null };
  }, [safetyEdgeId, classified, nodeMap]);

  const traceNode: TelemetryMetadataNode | null = traceId ? nodeMap.get(traceId) ?? null : null;

  if (error && !graph) {
    return <>{heading}<TelemetryStatusBanner tone="error">Metadata catalog unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!graph) return <>{heading}<Loading label="Loading relationships…" /></>;

  return (
    <>
      {heading}

      <TelemetryStatusBanner tone="info">
        Verdicts are inferred from catalog metadata only (keys, grain, status, confidence) — edges carry no
        stored join keys. Safe requires a declared FK or matching declared grain; absent that, the verdict is
        unverifiable, not safe.
      </TelemetryStatusBanner>

      <StatGrid cols={4} style={{ marginTop: 16 }}>
        <MetricCard label="Safe" value={tally.safe} sub="declared key / matching grain" accent={tally.safe ? C.green : undefined} />
        <MetricCard label="Bridge required" value={tally.bridge_required} sub="grain changes / transform" accent={tally.bridge_required ? C.amber : undefined} />
        <MetricCard label="Unsafe" value={tally.unsafe} sub="endpoint data unavailable" accent={tally.unsafe ? C.red : undefined} />
        <MetricCard label="Unverifiable" value={tally.unverifiable} sub="insufficient metadata (fail-closed)" />
      </StatGrid>

      <TelemetrySection
        label="Relationship safety"
        right={
          <SelectField value={verdictFilter} onChange={setVerdictFilter} ariaLabel="Filter by verdict">
            <option value="">All verdicts</option>
            <option value="safe">Safe</option>
            <option value="bridge_required">Bridge required</option>
            <option value="unsafe">Unsafe</option>
            <option value="unverifiable">Unverifiable</option>
          </SelectField>
        }
      >
        {visible.length === 0 ? (
          <EmptyState label="No relationships match" hint="Clear the verdict filter, or the catalog returned no edges for this scope." />
        ) : (
          <Panel pad={0}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {visible.map(({ edge, result }) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                return (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => setSafetyEdgeId(edge.id)}
                    style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 16px", borderBottom: `1px solid ${C.border}` }}
                  >
                    <Tag color={verdictColor(result.verdict)}>{VERDICT_LABEL[result.verdict]}</Tag>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{src?.label ?? edge.source}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden><path d="M1 4.5h11M9 1.5l3 3-3 3" stroke={C.faint} strokeWidth="1.1" fill="none" strokeLinecap="round" /></svg>
                      {humanize(edge.relationship)}
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{tgt?.label ?? edge.target}</span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <Tag color={result.confidence === "explicit" ? C.cyan : C.amber}>{result.confidence}</Tag>
                      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>details →</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </TelemetrySection>

      {/* Guided scenario — grounded, runs the same classifier. */}
      <RelationshipScenario graph={graph} />

      {/* Lineage trace */}
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

      <RelationshipSafetyDrawer
        open={Boolean(selectedSafety)}
        result={selectedSafety?.result ?? null}
        source={selectedSafety?.source ?? null}
        target={selectedSafety?.target ?? null}
        onClose={() => setSafetyEdgeId(null)}
      />

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
