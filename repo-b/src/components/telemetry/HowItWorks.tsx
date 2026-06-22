"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { C, Panel, MetricCard, PageHeading, StatGrid, ScrollTable, ResponsiveSwap, RowCard, DisclosureFooter } from "./primitives";
import { telemetryHref } from "./telemetryNav";
import FlowExplorer from "./FlowExplorer";
import {
  IMPL_LABEL, VERIFY_LABEL, LAST_VERIFIED, ENVIRONMENT_BADGE, COVERAGE_NOTE, KNOWN_GAPS,
  HERO_CARDS, CAPABILITIES, ARCHITECTURE_NODES, MEDALLION, GOVERNED_KPI_CHAIN,
  GOVERNED_KPI_NOTE, ORCHESTRATION_STEPS, MCP_REGISTRY_HEADER, MCP_REGISTRY_SNAPSHOT,
  TOOL_INVENTORY, BATCH_VS_STREAM, ML_LIFECYCLE, DELIVERY_TIMELINE,
  type ImplStatus, type CapabilityItem, type EvidenceLink, type FlowNode,
} from "./howItWorksData";

// Honest by construction: the page renders only what howItWorksData declares, and the
// data invariants (howItWorksData.test.ts) guarantee no dead links and no prod_verified-in-v1.

function implColor(impl: ImplStatus): string {
  return impl === "built" ? C.green : impl === "partial" ? C.amber : impl === "planned" ? C.cyan : C.red;
}

function ImplChip({ impl }: { impl: ImplStatus }) {
  const color = implColor(impl);
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {IMPL_LABEL[impl]}
    </span>
  );
}

function VerifyChip({ verify }: { verify: keyof typeof VERIFY_LABEL }) {
  return (
    <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.04em",
      color: C.faint, border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>
      {VERIFY_LABEL[verify]}
    </span>
  );
}

function StatusPair({ impl, verify }: { impl: ImplStatus; verify: keyof typeof VERIFY_LABEL }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <ImplChip impl={impl} />
      <VerifyChip verify={verify} />
    </span>
  );
}

function EvidenceLinks({ items, envId }: { items: EvidenceLink[]; envId: string }) {
  if (items.length === 0) {
    return <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>Not available</span>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
      {items.map((l) =>
        l.slug !== undefined ? (
          <Link key={l.label} href={telemetryHref(envId, l.slug)} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>
            {l.label} →
          </Link>
        ) : l.href ? (
          <a key={l.label} href={l.href} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>
            {l.label} →
          </a>
        ) : (
          <span key={l.label} style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{l.label}</span>
        )
      )}
    </span>
  );
}

const noteStyle: CSSProperties = { fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 6 };
const cellLabel: CSSProperties = { fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" };

function SectionHeading({ id, n, title, blurb }: { id: string; n: number; title: string; blurb: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 16, marginTop: 30, marginBottom: 12 }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.14em", color: C.cyan, textTransform: "uppercase" }}>
        {String(n).padStart(2, "0")} · Evidence & Architecture
      </div>
      <h2 style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 700, color: C.text, marginTop: 4 }}>{title}</h2>
      <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 6, maxWidth: 820 }}>{blurb}</p>
    </div>
  );
}

// ── Proof summary (visible at-a-glance evidence, above the collapsed full ledger) ──
function ProofSummary() {
  const prodVerified = CAPABILITIES.filter((c) => c.verify === "prod_verified").length;
  const planned = CAPABILITIES.filter((c) => c.impl === "planned").length;
  return (
    <StatGrid cols={3} style={{ marginTop: 16 }}>
      <MetricCard label="Production verified" value={String(prodVerified)} sub="capabilities confirmed live on novendor.ai" accent={C.green} />
      <MetricCard label="Partial · verified scope" value="Copilot" sub="grounded structured-evidence Q&A — not document RAG" accent={C.amber} />
      <MetricCard label="Planned gaps" value={String(planned)} sub="telemetry metric registry · lineage · cost enforcement" accent={C.cyan} />
    </StatGrid>
  );
}

function StatusLegend() {
  const impls: ImplStatus[] = ["built", "partial", "planned", "blocked"];
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>Implementation</span>
      {impls.map((i) => <ImplChip key={i} impl={i} />)}
      <span style={{ width: 1, height: 16, background: C.border }} />
      <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase" }}>Verification</span>
      <VerifyChip verify="prod_verified" />
      <VerifyChip verify="code_verified" />
      <VerifyChip verify="not_verified" />
    </div>
  );
}

function DemoModeStrip() {
  return (
    <Panel title="Demo mode" right={<span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{ENVIRONMENT_BADGE}</span>}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontFamily: C.mono, fontSize: 12, color: C.dim }}>
        <span>Last verified <strong style={{ color: C.text }}>{LAST_VERIFIED}</strong></span>
        <span>{COVERAGE_NOTE}</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={cellLabel}>Known gaps (surfaced up front)</div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {KNOWN_GAPS.map((g) => (
            <li key={g} style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>{g}</li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function HeroStatusCards() {
  return (
    <StatGrid cols={4} style={{ marginTop: 16 }}>
      {HERO_CARDS.map((h) => (
        <MetricCard key={h.title} label={h.title} value={<ImplChip impl={h.impl} />} sub={h.summary} />
      ))}
    </StatGrid>
  );
}

// ── Shared diagram primitive: a chevron-joined column of node cards ──
function FlowCard({ label, sub, impl }: { label: ReactNode; sub?: ReactNode; impl: ImplStatus }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
      boxShadow: `inset 3px 0 0 ${implColor(impl)}` }}>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, whiteSpace: "pre-line" }}>{label}</div>
      {sub != null && <div style={{ fontFamily: C.sans, fontSize: 11.5, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function Chevron() {
  return <div style={{ textAlign: "center", color: C.faint, fontFamily: C.mono, fontSize: 12, lineHeight: 1 }}>↓</div>;
}

// System architecture: lanes left-to-right (ingest → process → serve → ui).
function ArchitectureMap() {
  const lanes: { key: FlowNode["lane"]; title: string }[] = [
    { key: "ingest", title: "Ingest" }, { key: "process", title: "Process" },
    { key: "serve", title: "Serve" }, { key: "ui", title: "UI + AI" },
  ];
  return (
    <Panel title="System architecture">
      <ScrollTable minWidth={760}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, alignItems: "start" }}>
          {lanes.map((lane) => (
            <div key={lane.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={cellLabel}>{lane.title}</div>
              {ARCHITECTURE_NODES.filter((n) => n.lane === lane.key).map((n) => (
                <FlowCard key={n.id} label={n.label} impl={n.impl} />
              ))}
            </div>
          ))}
        </div>
      </ScrollTable>
      <p style={noteStyle}>
        Flow: source adapters → bronze → silver → gold (guarded by watermarks + DQ assertions) → FastAPI serving →
        console + copilot. Copilot tool calls run through the platform MCP registry and leave receipts in
        ai_decision_audit_log. The BigQuery spine is wired but disabled by default.
      </p>
    </Panel>
  );
}

function CapabilityMatrix({ envId }: { envId: string }) {
  const desktop = (
    <ScrollTable minWidth={820}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Capability", "Status", "Evidence", "Honest note"].map((h) => (
              <th key={h} style={{ ...cellLabel, textAlign: "left", padding: "0 10px 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((c: CapabilityItem) => (
            <tr key={c.capability} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "10px", fontFamily: C.sans, fontSize: 13, color: C.text, verticalAlign: "top", minWidth: 200 }}>{c.capability}</td>
              <td style={{ padding: "10px", verticalAlign: "top" }}><StatusPair impl={c.impl} verify={c.verify} /></td>
              <td style={{ padding: "10px", verticalAlign: "top" }}><EvidenceLinks items={c.evidence} envId={envId} /></td>
              <td style={{ padding: "10px", fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, verticalAlign: "top", minWidth: 240 }}>{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
  const mobile = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {CAPABILITIES.map((c) => (
        <div key={c.capability} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 12 }}>
          <div style={{ fontFamily: C.sans, fontSize: 13, color: C.text, fontWeight: 600 }}>{c.capability}</div>
          <div style={{ marginTop: 8 }}><StatusPair impl={c.impl} verify={c.verify} /></div>
          <div style={{ marginTop: 8 }}><EvidenceLinks items={c.evidence} envId={envId} /></div>
          <p style={noteStyle}>{c.note}</p>
        </div>
      ))}
    </div>
  );
  return <Panel title="Capability ledger"><ResponsiveSwap mobile={mobile} desktop={desktop} /></Panel>;
}

function FollowOneStreamAggregate({ envId }: { envId: string }) {
  return (
    <Panel title="Follow one stream aggregate">
      <p style={{ ...noteStyle, marginTop: 0 }}>
        The genuinely-real telemetry trace is the streaming medallion (not a governed-metric trace — telemetry has no
        metric registry yet). Each hop names its real table and its failure mode.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {MEDALLION.map((hop, i) => (
          <div key={hop.stage}>
            <FlowCard impl={hop.impl}
              label={`${hop.stage.toUpperCase()} · ${hop.label}  —  ${hop.table}`}
              sub={
                <>
                  {hop.detail} <span style={{ color: C.faint }}>· fail-closed: {hop.failureMode}</span>
                  {hop.slug !== undefined && (
                    <> · <Link href={telemetryHref(envId, hop.slug)} style={{ color: C.cyan, textDecoration: "none" }}>see live →</Link></>
                  )}
                </>
              } />
            {i < MEDALLION.length - 1 && <Chevron />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, opacity: 0.6, border: `1px dashed ${C.border}`, borderRadius: 9, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ImplChip impl="planned" />
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>Governed KPI chain — REPE pattern, not telemetry</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
          {GOVERNED_KPI_CHAIN.map((h, i) => (
            <span key={h.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{h.label}</span>
              {i < GOVERNED_KPI_CHAIN.length - 1 && <span style={{ color: C.faint }}>→</span>}
            </span>
          ))}
        </div>
        <p style={noteStyle}>{GOVERNED_KPI_NOTE}</p>
      </div>
    </Panel>
  );
}

function OrchestrationCallFlow() {
  return (
    <Panel title="How the AI decides what to do">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ORCHESTRATION_STEPS.map((s, i) => (
          <div key={s.n}>
            <FlowCard impl={s.impl} label={`${s.n}. ${s.label}`} sub={s.detail} />
            {i < ORCHESTRATION_STEPS.length - 1 && <Chevron />}
          </div>
        ))}
      </div>
      <p style={noteStyle}>
        Tools are typed and permissioned; writes hit a confirmation gate; every call leaves a redacted receipt. The
        telemetry copilot grounds on fetched structured evidence with an anti-fabrication validator — it is not document RAG.
      </p>
    </Panel>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <ScrollTable minWidth={760}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={{ ...cellLabel, textAlign: "left", padding: "0 10px 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "9px 10px", fontFamily: C.sans, fontSize: 12.5, color: C.dim, verticalAlign: "top" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

function McpRegistrySnapshot() {
  return (
    <Panel title="MCP tool registry snapshot">
      <p style={{ ...noteStyle, marginTop: 0 }}>{MCP_REGISTRY_HEADER}</p>
      <div style={{ marginTop: 10 }}>
        <SimpleTable
          headers={["Tool family", "Permission", "Confirm?", "Audit policy", "Demo example", "Status"]}
          rows={MCP_REGISTRY_SNAPSHOT.map((r) => [
            r.family,
            <span key="perm" style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{r.permission}</span>,
            r.confirmationRequired ? "yes" : "no",
            r.auditPolicy,
            r.demoExample,
            <ImplChip key="impl" impl={r.impl} />,
          ])}
        />
      </div>
    </Panel>
  );
}

function ToolSkillInventory() {
  return (
    <Panel title="Tool & skill inventory">
      <SimpleTable
        headers={["Tool / skill", "Kind", "R/W", "Permission", "Status", "Audit evidence"]}
        rows={TOOL_INVENTORY.map((t) => [
          t.tool, t.kind, t.readWrite,
          <span key="perm" style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{t.permission}</span>,
          <ImplChip key="impl" impl={t.impl} />, t.auditEvidence,
        ])}
      />
    </Panel>
  );
}

function BatchVsStreamCrosswalk() {
  return (
    <Panel title="Demo substrate ↔ production-scale equivalent">
      <SimpleTable
        headers={["Dimension", "Demo substrate (here)", "Production-scale equivalent"]}
        rows={BATCH_VS_STREAM.map((r) => [r.dimension, r.demoSubstrate, r.productionEquivalent])}
      />
    </Panel>
  );
}

function MlLifecyclePanel({ envId }: { envId: string }) {
  return (
    <Panel title="Model lifecycle">
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {ML_LIFECYCLE.map((m) => (
          <div key={m.name} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span style={{ fontFamily: C.sans, fontSize: 14, fontWeight: 600, color: C.text }}>{m.name}</span>
              <StatusPair impl={m.impl} verify={m.verify} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 10 }}>
              {[["Version", m.version], ["Training", m.training], ["Eval", m.eval], ["Decision it informs", m.decision]].map(([k, v]) => (
                <div key={k}>
                  <div style={cellLabel}>{k}</div>
                  <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>{v}</div>
                </div>
              ))}
            </div>
            {m.slug !== undefined && (
              <div style={{ marginTop: 10 }}>
                <Link href={telemetryHref(envId, m.slug)} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>see live →</Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DeliveryTimeline() {
  return (
    <Panel title="Delivery operating system">
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {DELIVERY_TIMELINE.map((t, i) => (
          <div key={t.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch" }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: implColor(t.impl), marginTop: 4, flexShrink: 0 }} />
              {i < DELIVERY_TIMELINE.length - 1 && <span style={{ width: 1, flex: 1, background: C.border, minHeight: 22 }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, color: C.text }}>{t.step}</span>
                <ImplChip impl={t.impl} />
              </div>
              <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, marginTop: 3, lineHeight: 1.45 }}>{t.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function HowItWorks({ envId }: { envId: string }) {
  return (
    <div>
      <PageHeading
        eyebrow="Evidence & Architecture"
        title="How This Works"
        blurb="This telemetry environment turns aerospace-analog operations data into governed dashboards, grounded AI answers, model-scored verdicts, and auditable engineering work. Every claim below is labeled Built / Partial / Planned / Blocked and links to the live surface that proves it. Planned and Blocked items say 'Not available' with the reason — nothing here is fabricated."
      />
      <FlowExplorer envId={envId} />
      <StatusLegend />
      <DemoModeStrip />
      <HeroStatusCards />
      <ProofSummary />

      <details style={{ marginTop: 24, border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
        <summary style={{ cursor: "pointer", listStyle: "none", padding: "12px 16px", fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.1em", color: C.text, textTransform: "uppercase" }}>
          ▸ Proof ledger — full capability matrix, architecture map, registries, crosswalk, ML lifecycle, delivery timeline
        </summary>
        <div style={{ padding: "4px 16px 18px" }}>
          <SectionHeading id="data-trust" n={1} title="Data trust"
            blurb="Medallion ETL with watermarks and data-quality assertions, fail-closed on stale. Trace one stream aggregate end to end; the governed-KPI chain is the REPE pattern, not yet adapted to telemetry." />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ArchitectureMap />
            <CapabilityMatrix envId={envId} />
            <FollowOneStreamAggregate envId={envId} />
          </div>

          <SectionHeading id="ai-orchestration" n={2} title="AI orchestration"
            blurb="The AI is not freewheeling: it classifies intent, selects a typed permissioned tool, checks permission, grounds on fetched evidence, and logs a receipt." />
          <OrchestrationCallFlow />

          <SectionHeading id="model-lifecycle" n={3} title="Model lifecycle"
            blurb="Databricks training → MLflow promotion gate → champion registry → live scoring with version attribution. Each card names the operational decision it informs." />
          <MlLifecyclePanel envId={envId} />

          <SectionHeading id="audit-tools" n={4} title="Audit & tools"
            blurb="Typed, permissioned, audited tools and an honest registry snapshot. The batch-vs-streaming crosswalk maps the demo substrate to its production-scale equivalent." />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <McpRegistrySnapshot />
            <ToolSkillInventory />
            <BatchVsStreamCrosswalk />
          </div>

          <SectionHeading id="delivery-os" n={5} title="Delivery operating system"
            blurb="Non-trivial work goes through Azure DevOps intake → Session Brief → scoped PR → tests → evidence → one-way DONE. This page itself shipped that way (Story #654)." />
          <DeliveryTimeline />
        </div>
      </details>

      <DisclosureFooter />
    </div>
  );
}
