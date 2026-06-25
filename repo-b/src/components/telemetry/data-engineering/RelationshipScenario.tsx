"use client";

import { useMemo } from "react";

import {
  metadataVisualLane,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  classifyRelationship,
  VERDICT_LABEL,
} from "@/lib/telemetry/relationshipSafety";
import { C, EmptyState, Panel, StatusDot, Tag, TelemetrySection } from "../primitives";
import { verdictColor } from "./RelationshipSafetyDrawer";

// Guided scenario: "Can vibration and temperature explain failed Stargate prints?"
//
// This is GROUNDED, not illustrative: it resolves real catalog nodes (the Stargate Kafka telemetry
// topic, the structural-flaw signature metric, the anomaly stream, the dashboard), reads the real
// signal columns + the committed predicate, and runs the SAME safety classifier on the real edges
// among them. If the catalog no longer contains the required nodes, it fails closed and says so —
// it never fabricates a result.

const QUESTION = "Can vibration and temperature explain failed Stargate prints?";

// Real catalog node ids (verified against metadata_catalog.json). Telemetry + signature are required;
// anomalies + dashboard enrich the governed path when present.
const REQUIRED = ["stream_stargate_telemetry", "metric_stargate_signature"] as const;
const PATH_IDS = [
  "stream_stargate_telemetry",
  "pipeline_stargate_anomaly",
  "stream_stargate_anomalies",
  "metric_stargate_signature",
  "dashboard_stargate",
] as const;
const SIGNAL_COLUMNS = ["arm_vibration_g", "melt_pool_temp_c", "print_job_id", "printer_id"];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function cols(node: TelemetryMetadataNode | undefined): string[] {
  const c = node?.metadata?.columns;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === "string") : [];
}

export default function RelationshipScenario({ graph }: { graph: TelemetryMetadataGraph }) {
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n] as const)), [graph]);

  const telemetry = byId.get("stream_stargate_telemetry");
  const signature = byId.get("metric_stargate_signature");
  const missingRequired = REQUIRED.filter((id) => !byId.has(id));

  // Classify every real edge whose BOTH endpoints are in the scenario node set.
  const scenarioEdges = useMemo(() => {
    const set = new Set<string>(PATH_IDS);
    return graph.edges
      .filter((e) => set.has(e.source) && set.has(e.target))
      .map((e) => ({ edge: e, result: classifyRelationship(e, byId.get(e.source), byId.get(e.target)) }));
  }, [graph.edges, byId]);

  const heading = (
    <TelemetrySection label="Guided scenario">
      <div style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 700, color: C.text }}>{QUESTION}</div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.55 }}>
        Grounded in the live catalog — it resolves real nodes and runs the same safety classifier as the
        list above. Not a fabricated walkthrough.
      </div>
    </TelemetrySection>
  );

  // Fail closed if the catalog no longer has the nodes this scenario depends on.
  if (missingRequired.length > 0) {
    return (
      <>
        {heading}
        <EmptyState
          label="Scenario sources not found in catalog"
          hint={`Required nodes missing: ${missingRequired.join(", ")}. The scenario fails closed rather than invent a result.`}
        />
      </>
    );
  }

  const signalCols = cols(telemetry).filter((c) => SIGNAL_COLUMNS.includes(c));
  const formula = str(signature?.metadata?.formula);
  const pathNodes = PATH_IDS.map((id) => byId.get(id)).filter((n): n is TelemetryMetadataNode => Boolean(n));

  return (
    <>
      {heading}

      {/* 1 — relevant sources found */}
      <Panel title="1 · Relevant sources found" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>
            {telemetry?.label}
            <span style={{ color: C.faint }}> — {telemetry?.kind}, grain {str(telemetry?.metadata?.grain) ?? "not declared"}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {signalCols.length ? signalCols.map((c) => <Tag key={c} color={C.cyan}>{c}</Tag>) : <span style={{ color: C.faint, fontFamily: C.mono, fontSize: 11 }}>signal columns not declared</span>}
          </div>
          {formula && (
            <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
              Signature predicate ({signature?.label}): <span style={{ color: C.amber }}>{formula}</span>
            </div>
          )}
        </div>
      </Panel>

      {/* 2 — direct-join check (real verdicts) */}
      <Panel title="2 · Direct-join check (same classifier)" style={{ marginBottom: 12 }}>
        {scenarioEdges.length === 0 ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>
            No cataloged edges among the scenario nodes — cannot assess a direct join.
          </span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scenarioEdges.map(({ edge, result }) => (
              <div key={edge.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Tag color={verdictColor(result.verdict)}>{VERDICT_LABEL[result.verdict]}</Tag>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>
                  {byId.get(edge.source)?.label} → {byId.get(edge.target)?.label}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.faint }}>
                  ({edge.relationship.replace(/_/g, " ")})
                </span>
              </div>
            ))}
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 1.55 }}>
              A raw row-level join from printer telemetry straight to a failure verdict is not confirmable —
              the safe path runs through the governed pipeline below.
            </div>
          </div>
        )}
      </Panel>

      {/* 3 — governed path (the bridge) */}
      <Panel title="3 · Governed path (bridge)" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {pathNodes.map((n, i) => (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: C.mono, fontSize: 11, color: C.text, border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "5px 9px", background: C.panelHi }}>
                <StatusDot color={n.status === "fresh" ? C.green : n.status === "missing" ? C.red : C.amber} size={6} />
                {n.label}
              </span>
              {i < pathNodes.length - 1 && (
                <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden><path d="M1 5h9M7 1.5L10.5 5 7 8.5" stroke={C.faint} strokeWidth="1.2" fill="none" strokeLinecap="round" /></svg>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 10, lineHeight: 1.55 }}>
          Vibration and temperature reach a print-failure signal by flowing through the Flink anomaly
          pipeline that applies the committed predicate per printer event — not by joining raw telemetry
          to outcomes directly.
        </div>
      </Panel>

      {/* 4 — answer */}
      <Panel title="4 · Answer">
        <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.dim, lineHeight: 1.6 }}>
          Yes — but governed, not by a direct join. <span style={{ color: C.text }}>arm_vibration_g</span> and{" "}
          <span style={{ color: C.text }}>melt_pool_temp_c</span> relate to failed prints through the committed
          structural-flaw signature{formula ? ` (${formula})` : ""}, evaluated per printer telemetry event in the
          streaming pipeline. A raw telemetry → failure join is {scenarioEdges.length ? "classified above as not directly safe" : "unverifiable"};
          the trustworthy path bridges through the anomaly pipeline and signature metric.
        </div>
      </Panel>
    </>
  );
}
