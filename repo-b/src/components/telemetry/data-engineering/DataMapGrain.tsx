"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  metadataVisualLane,
  type MetadataVisualLane,
  type TelemetryMetadataGraph,
  type TelemetryMetadataNode,
} from "@/lib/telemetry/metadata";
import {
  C,
  EmptyState,
  Loading,
  PageHeading,
  Panel,
  ResponsiveSwap,
  RowCard,
  ScrollTable,
  StatusDot,
  Tag,
  TelemetryStatusBanner,
} from "../primitives";
import MetadataDetailDrawer from "../metadata/MetadataDetailDrawer";

// Data Map & Grain — the catalog of telemetry sources/tables with the one thing a skeptical data
// person asks first: at what grain does each table live, and what is its key? Reuses the live metadata
// catalog; the full "source contract" (columns, quality checks, references) opens in the shared
// MetadataDetailDrawer. Grain that is not declared reads "not declared" — never invented.

const LANE_LABEL: Record<MetadataVisualLane, string> = {
  source: "Source", bronze: "Bronze", silver: "Silver", gold: "Gold",
  metric: "Metric", consumer: "Consumer", model: "Model", runtime: "Runtime / AI",
};
const LANE_ORDER: MetadataVisualLane[] = ["source", "bronze", "silver", "gold", "metric", "consumer", "model", "runtime"];

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function fkCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string" && value.trim()) return 1;
  return 0;
}

function statusColor(status?: string): string {
  if (status === "fresh") return C.green;
  if (status === "missing") return C.red;
  if (status === "stale" || status === "quarantined") return C.amber;
  return C.faint;
}

function Unavailable() {
  return <span style={{ color: C.faint }}>not declared</span>;
}

export default function DataMapGrain({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => { if (live) setGraph(g); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [envId]);

  const grouped = useMemo(() => {
    if (!graph) return [] as { lane: MetadataVisualLane; nodes: TelemetryMetadataNode[] }[];
    const byLane = new Map<MetadataVisualLane, TelemetryMetadataNode[]>();
    for (const node of graph.nodes) {
      const lane = metadataVisualLane(node);
      (byLane.get(lane) ?? byLane.set(lane, []).get(lane)!).push(node);
    }
    return LANE_ORDER
      .map((lane) => ({ lane, nodes: (byLane.get(lane) ?? []).sort((a, b) => a.label.localeCompare(b.label)) }))
      .filter((g) => g.nodes.length > 0);
  }, [graph]);

  const heading = (
    <PageHeading
      eyebrow="Data Map · Grain"
      title="Data Map & Grain"
      blurb="Every source and table the fabric knows about, with its declared grain and key. Grain is the guardrail against false precision — it stops an analyst (or an AI) from joining 10 Hz sensor data straight to part-level defects and reporting fake exactness. Click a row for the full source contract."
    />
  );

  const selected = graph?.nodes.find((n) => n.id === selectedId) ?? null;

  if (error && !graph) {
    return <>{heading}<TelemetryStatusBanner tone="error">Metadata catalog unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!graph) return <>{heading}<Loading label="Loading catalog…" /></>;
  if (graph.nodes.length === 0) {
    return <>{heading}<EmptyState label="No catalog nodes" hint="The telemetry metadata response was empty." /></>;
  }

  return (
    <>
      {heading}
      {graph.warnings.length > 0 && (
        <TelemetryStatusBanner tone="warn">
          {graph.warnings.map((w) => w.message).join(" · ")}
        </TelemetryStatusBanner>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
        {grouped.map(({ lane, nodes }) => (
          <Panel
            key={lane}
            title={`${LANE_LABEL[lane]} · ${nodes.length}`}
            pad={0}
          >
            <ResponsiveSwap
              desktop={
                <ScrollTable minWidth={780}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Object", "Grain", "Primary key", "FKs", "Owner", "Freshness", "Status"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, borderBottom: `1px solid ${C.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((node) => {
                        const m = node.metadata ?? {};
                        const grain = str(m.grain);
                        const pk = str(m.primary_key);
                        const owner = str(m.owner);
                        const fresh = str(m.freshness_as_of) ?? str(m.last_refreshed) ?? str(m.last_updated_at);
                        return (
                          <tr
                            key={node.id}
                            onClick={() => setSelectedId(node.id)}
                            style={{ cursor: "pointer", borderBottom: `1px solid ${C.border}` }}
                          >
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 12, color: C.text }}>{node.label}</td>
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: grain ? C.dim : C.faint }}>{grain ?? <Unavailable />}</td>
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: pk ? C.dim : C.faint }}>{pk ?? <Unavailable />}</td>
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{fkCount(m.foreign_keys) || "—"}</td>
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: owner ? C.dim : C.faint }}>{owner ?? <Unavailable />}</td>
                            <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: fresh ? C.dim : C.faint }}>{fresh ?? <Unavailable />}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11, color: statusColor(node.status) }}>
                                <StatusDot color={statusColor(node.status)} size={6} />
                                {node.status ?? "unknown"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollTable>
              }
              mobile={
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
                  {nodes.map((node) => {
                    const m = node.metadata ?? {};
                    return (
                      <RowCard
                        key={node.id}
                        title={node.label}
                        onClick={() => setSelectedId(node.id)}
                        tags={<Tag color={statusColor(node.status)}>{node.status ?? "unknown"}</Tag>}
                        fields={[
                          { label: "Grain", value: str(m.grain) ?? <Unavailable /> },
                          { label: "Primary key", value: str(m.primary_key) ?? <Unavailable /> },
                          { label: "Owner", value: str(m.owner) ?? <Unavailable /> },
                          { label: "FKs", value: fkCount(m.foreign_keys) || "—" },
                        ]}
                      />
                    );
                  })}
                </div>
              }
            />
          </Panel>
        ))}
      </div>

      <MetadataDetailDrawer
        node={selected}
        nodes={graph.nodes}
        edges={graph.edges}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
