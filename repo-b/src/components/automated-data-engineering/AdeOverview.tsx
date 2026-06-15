"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSkillRegistry, getConnectors, getReceipts, getGovernanceStats,
  ADE_DEFAULT_BUSINESS_ID,
  type SkillRegistryResponse, type ConnectorsResponse, type ReceiptsResponse,
  type GovernanceStatsResponse,
} from "@/lib/automated-data-engineering/api";
import { C, Panel, MetricCard, Tag, PageHeading, Loading, ErrorState } from "./primitives";

// Overview: the operating loop, product cards with live counts, and an honest
// capability-claim strip. Counts come from the same read-only API the other
// sections use; when a count is unavailable we show the null_reason, not a number.

const LOOP_STAGES = ["Request", "Intake", "Plan", "Governed skill", "Action", "Tests", "PR", "Receipt"];

const LIVE_NOW = [
  "MCP skill registry surfacing",
  "Connector inventory declaration",
  "Audit receipt feed where available",
  "Playbook skeleton",
];

const NOT_LIVE_YET = [
  "BYO API keys",
  "Autonomous connector setup",
  "Grain detection",
  "Lakehouse scanning",
  "Live ADO creation",
];

export default function AdeOverview({ envId }: { envId: string }) {
  const [registry, setRegistry] = useState<SkillRegistryResponse | null>(null);
  const [connectors, setConnectors] = useState<ConnectorsResponse | null>(null);
  const [receipts, setReceipts] = useState<ReceiptsResponse | null>(null);
  const [governance, setGovernance] = useState<GovernanceStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSkillRegistry(),
      getConnectors(),
      getReceipts(envId, ADE_DEFAULT_BUSINESS_ID),
    ])
      .then(([r, c, x]) => { setRegistry(r); setConnectors(c); setReceipts(x); })
      .catch((e) => setError(String(e)));
    // Governance stats are non-blocking: a failure degrades the strip, not the page.
    // The catch sets a degraded response (not null) so the strip shows the
    // unavailable state instead of loading forever.
    getGovernanceStats(ADE_DEFAULT_BUSINESS_ID, envId)
      .then(setGovernance)
      .catch(() => setGovernance({
        total_decisions: 0, successful: 0, failed: 0, success_rate: null,
        avg_latency_ms: null, avg_grounding_score: null,
        high_grounding: 0, mixed_grounding: 0, low_grounding: 0,
        top_tools: [], warehouse_export_configured: false,
        null_reason: "governance_stats_unavailable",
      }));
  }, [envId]);

  const heading = (
    <PageHeading eyebrow="Control Room" title="Automated Data Engineering"
      blurb="A governed connector and skill fabric. Every data request runs through the same loop: typed skills with declared permissions, declared connector status, and an audit receipt for every execution. This surface is read-only — it shows what the fabric is, not a simulation of it." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!registry || !connectors || !receipts) return <>{heading}<Loading label="Loading fabric state…" /></>;

  const liveConnectors = connectors.connectors.filter((c) => c.status === "live").length;
  const base = `/lab/env/${envId}/automated-data-engineering`;

  const toolCount = registry.null_reason
    ? `null_reason: ${registry.null_reason}`
    : null;
  const receiptCount = receipts.null_reason
    ? `null_reason: ${receipts.null_reason}`
    : null;

  return (
    <>
      {heading}

      {/* Operating loop */}
      <Panel title="Operating loop" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {LOOP_STAGES.map((stage, i) => (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text,
                border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "5px 10px", background: C.panelHi }}>
                {stage}
              </span>
              {i < LOOP_STAGES.length - 1 && (
                <svg width="12" height="10" viewBox="0 0 12 10">
                  <path d="M1 5h9M7 1.5L10.5 5 7 8.5" stroke={C.faint} strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontFamily: C.sans, fontSize: 13, color: C.dim, lineHeight: 1.55, marginTop: 14, maxWidth: 720 }}>
          Skills are the only execution path. Each one declares its permission mode, side-effect class,
          and confirmation requirement before it can run, and every run writes a receipt.
        </p>
      </Panel>

      {/* Product cards with live counts */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ marginBottom: 16 }}>
        <Link href={`${base}/skills`} style={{ textDecoration: "none" }}>
          <MetricCard label="Skill Registry"
            value={toolCount ? "—" : registry.tools.length}
            sub={toolCount ?? `${registry.modules.length} modules · typed, governed`} />
        </Link>
        <Link href={`${base}/connectors`} style={{ textDecoration: "none" }}>
          <MetricCard label="Connector Map"
            value={connectors.null_reason ? "—" : connectors.connectors.length}
            sub={connectors.null_reason
              ? `null_reason: ${connectors.null_reason}`
              : `${liveConnectors} live · declared status only`} />
        </Link>
        <Link href={`${base}/runs`} style={{ textDecoration: "none" }}>
          <MetricCard label="Execution Receipts"
            value={receiptCount ? "—" : receipts.runs.length}
            sub={receiptCount ?? "audit trail · most recent"} />
        </Link>
        <Link href={`${base}/playbooks`} style={{ textDecoration: "none" }}>
          <MetricCard label="Playbooks"
            value={LOOP_STAGES.length}
            sub="operating-loop stages · skeleton" />
        </Link>
      </div>

      {/* Governance stats — AI-decision audit aggregate. Renders null_reason verbatim. */}
      <Panel
        title="Governance"
        right={governance && !governance.null_reason
          ? <Tag color={governance.warehouse_export_configured ? C.green : C.faint}>
              {governance.warehouse_export_configured ? "warehouse export ready" : "warehouse export not configured"}
            </Tag>
          : undefined}
        style={{ marginBottom: 16 }}
      >
        {governance == null ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading governance stats…</span>
        ) : governance.null_reason ? (
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber }}>
            null_reason: {governance.null_reason}
          </span>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="AI Decisions" value={governance.total_decisions}
              sub={`${governance.successful} ok · ${governance.failed} failed`} />
            <MetricCard label="Success Rate"
              value={governance.success_rate != null ? `${Math.round(governance.success_rate * 100)}%` : "—"}
              sub={governance.success_rate != null ? "of logged decisions" : "no decisions logged"}
              accent={governance.success_rate != null && governance.success_rate >= 0.9 ? C.green : undefined} />
            <MetricCard label="Avg Grounding"
              value={governance.avg_grounding_score != null ? governance.avg_grounding_score.toFixed(2) : "—"}
              sub={`${governance.high_grounding} high · ${governance.low_grounding} low`}
              accent={governance.avg_grounding_score != null && governance.avg_grounding_score >= 0.8 ? C.green : undefined} />
            <MetricCard label="Top Tool"
              value={governance.top_tools[0]?.tool_name ?? "—"}
              sub={governance.top_tools[0] ? `${governance.top_tools[0].call_count} calls` : "no tool calls logged"} />
          </div>
        )}
      </Panel>

      {/* Capability claim — the demo must not oversell */}
      <Panel title="Capability claim" right={<Tag color={C.amber}>honest scope</Tag>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.green, textTransform: "uppercase", marginBottom: 10 }}>
              Live now
            </div>
            {LIVE_NOW.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: C.green, flexShrink: 0 }} />
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{item}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.red, textTransform: "uppercase", marginBottom: 10 }}>
              Not live yet
            </div>
            {NOT_LIVE_YET.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: C.faint, flexShrink: 0 }} />
                <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}
