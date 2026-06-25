"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getMetadataGraph,
  type TelemetryMetadataGraph,
} from "@/lib/telemetry/metadata";
import {
  getReceipts,
  getSkillRegistry,
  type ReceiptsResponse,
  type SkillRegistryResponse,
} from "@/lib/automated-data-engineering/api";
import {
  C,
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

// Data Engineering — the landing/control room. Composition surface: the data-semantics counts come
// from the live telemetry metadata catalog (/api/telemetry/metadata/graph) and the governance counts
// come from the portable ADE endpoints (/api/ade/*). It re-presents real data and routes the two
// operating modes (Agent Workbench, Run Autopsy). No new backend, no fabricated values.

const CHAIN = ["Source", "Bronze", "Silver", "Gold", "Metric", "Model / AI", "Receipt"];

function deBase(envId: string) {
  return `/lab/env/${envId}/telemetry/data-engineering`;
}

function countWithGrain(graph: TelemetryMetadataGraph): number {
  return graph.nodes.filter((n) => {
    const grain = n.metadata?.grain;
    return typeof grain === "string" && grain.trim().length > 0;
  }).length;
}

function openRisks(graph: TelemetryMetadataGraph): number {
  return graph.nodes.filter(
    (n) => n.status === "stale" || n.status === "missing" || n.status === "quarantined",
  ).length;
}

function ModeCard({
  envId,
  slug,
  eyebrow,
  title,
  blurb,
  bullets,
}: {
  envId: string;
  slug: string;
  eyebrow: string;
  title: string;
  blurb: string;
  bullets: string[];
}) {
  return (
    <Link href={`${deBase(envId)}/${slug}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 11,
          padding: 18,
          height: "100%",
        }}
      >
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.14em", color: C.cyan, textTransform: "uppercase" }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, color: C.text, marginTop: 7 }}>{title}</div>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 8 }}>{blurb}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 13 }}>
          {bullets.map((b) => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusDot color={C.cyan} size={5} glow={false} />
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{b}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, marginTop: 14 }}>Open {title} →</div>
      </div>
    </Link>
  );
}

export default function DataEngineeringOverview({ envId }: { envId: string }) {
  const [graph, setGraph] = useState<TelemetryMetadataGraph | null>(null);
  const [registry, setRegistry] = useState<SkillRegistryResponse | null>(null);
  const [receipts, setReceipts] = useState<ReceiptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID, envId)
      .then((g) => { if (!live) return; if (g) setGraph(g); else setError("metadata_graph_unreachable"); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    // Governance counts are non-blocking: a failure degrades a card, not the page.
    getSkillRegistry().then((r) => { if (live) setRegistry(r); }).catch(() => {});
    getReceipts(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((r) => { if (live) setReceipts(r); }).catch(() => {});
    return () => { live = false; };
  }, [envId]);

  const heading = (
    <PageHeading
      eyebrow="Data Fabric · Control Room"
      title="Automated Data Engineering"
      blurb="The governed layer between operational telemetry and trusted AI. It maps every source's grain, declares which relationships are real, traces lineage from raw signal to metric and model, and leaves an audit receipt before any dashboard, feature, or AI answer is allowed to depend on the data. Read-only — it shows what the fabric is, not a simulation of it."
    />
  );

  if (error && !graph) {
    return (
      <>
        {heading}
        <TelemetryStatusBanner tone="error">
          Metadata catalog unavailable — {error}. Data-semantics counts below are withheld; this is the
          fail-closed state, not a substitute number.
        </TelemetryStatusBanner>
      </>
    );
  }
  if (!graph) return <>{heading}<Loading label="Loading fabric state…" /></>;

  const withGrain = countWithGrain(graph);
  const risks = openRisks(graph);

  return (
    <>
      {heading}

      {/* The two operating modes, named and separated. */}
      <TelemetrySection label="Two ways to work the fabric">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ModeCard
            envId={envId}
            slug="workbench"
            eyebrow="Mode · Propose"
            title="Agent Workbench"
            blurb="Where AI does governed data-engineering work: observe source contracts and grain, propose mappings/joins/features, and execute read-only or confirmation-gated actions. Every skill declares its permission and side-effect class before it runs."
            bullets={["Observe — profile, grain, freshness", "Propose — joins, features, contracts", "Execute — read-only or confirmation-gated"]}
          />
          <ModeCard
            envId={envId}
            slug="autopsy"
            eyebrow="Mode · Inspect"
            title="Run Autopsy"
            blurb="The after-the-fact view: what ran, what it cost, what it refused, and the receipt that proves it. Failures, refusals, and stale inputs surface here rather than being hidden."
            bullets={["Receipts — what ran, by whom, when", "Governance — success, grounding, cost", "Refusals — fail-closed, not silent"]}
          />
        </div>
      </TelemetrySection>

      {/* Source-to-Outcome Chain — the spine the whole surface defends. */}
      <TelemetrySection label="Source-to-outcome chain">
        <Panel>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {CHAIN.map((stage, i) => (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text, border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "5px 10px", background: C.panelHi }}>
                  {stage}
                </span>
                {i < CHAIN.length - 1 && (
                  <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden>
                    <path d="M1 5h9M7 1.5L10.5 5 7 8.5" stroke={C.faint} strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 14, maxWidth: 760 }}>
            Each node carries a declared grain and primary key; each edge is a typed, confidence-rated
            relationship. A metric or feature is only trustworthy when its full upstream chain is fresh and
            its joins are declared — not assumed.
          </p>
        </Panel>
      </TelemetrySection>

      {/* Honest, real counts. */}
      <TelemetrySection label="Fabric at a glance">
        <StatGrid cols={4}>
          <Link href={`${deBase(envId)}/grain`} style={{ textDecoration: "none" }}>
            <MetricCard label="Sources mapped" value={graph.stats.source_count} sub="declared in catalog" />
          </Link>
          <Link href={`${deBase(envId)}/grain`} style={{ textDecoration: "none" }}>
            <MetricCard label="Tables with grain" value={withGrain} sub={`of ${graph.nodes.length} catalog nodes`} />
          </Link>
          <Link href={`${deBase(envId)}/relationships`} style={{ textDecoration: "none" }}>
            <MetricCard label="Relationships" value={graph.stats.edge_count} sub="typed · confidence-rated" />
          </Link>
          <Link href={`${deBase(envId)}/pipelines`} style={{ textDecoration: "none" }}>
            <MetricCard
              label="Open data risks"
              value={risks}
              sub="stale · missing · quarantined"
              accent={risks > 0 ? C.amber : C.green}
            />
          </Link>
        </StatGrid>
        <StatGrid cols={3} style={{ marginTop: 12 }}>
          <Link href={`${deBase(envId)}/workbench`} style={{ textDecoration: "none" }}>
            <MetricCard
              label="Governed skills"
              value={registry ? (registry.null_reason ? "—" : registry.tools.length) : "…"}
              sub={registry?.null_reason ? `null_reason: ${registry.null_reason}` : "typed, permissioned"}
            />
          </Link>
          <Link href={`${deBase(envId)}/autopsy`} style={{ textDecoration: "none" }}>
            <MetricCard
              label="Execution receipts"
              value={receipts ? (receipts.null_reason ? "—" : receipts.runs.length) : "…"}
              sub={receipts?.null_reason ? `null_reason: ${receipts.null_reason}` : "audit trail"}
            />
          </Link>
          <Link href={`${deBase(envId)}/sources`} style={{ textDecoration: "none" }}>
            <MetricCard label="Source & platform" value="map" sub="declared connector status" />
          </Link>
        </StatGrid>
      </TelemetrySection>

      <div style={{ marginTop: 16 }}>
        <Tag color={C.amber}>honest scope</Tag>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginLeft: 10 }}>
          Grain, lineage, and relationships come from the live telemetry metadata catalog. Join-safety
          classification, the guided investigation scenario, and an aerospace-scoped skill view are
          declared next-phase work — not shown as if they exist.
        </span>
      </div>
    </>
  );
}
