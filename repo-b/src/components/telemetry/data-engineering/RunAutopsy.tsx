"use client";

import { useEffect, useState } from "react";

import {
  TELEMETRY_DEMO_BUSINESS_ID,
  TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import {
  getGovernanceStats,
  getReceipts,
  type GovernanceStatsResponse,
  type ReceiptsResponse,
} from "@/lib/automated-data-engineering/api";
import {
  C,
  EmptyState,
  InlineCode,
  Loading,
  MetricCard,
  PageHeading,
  Panel,
  ScrollTable,
  StatGrid,
  Tag,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";

// Run Autopsy — the "inspect" mode. After-the-fact view of what the fabric actually did: governed
// AI-decision aggregates (/api/ade/governance-stats) and execution receipts (/api/ade/runs), both real
// and tenant-scoped. NO-GO: never seed or backfill receipts. If empty, show the honest empty state and
// name the action that would create the first one. null_reason is rendered verbatim.

function fmtTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleString();
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success" || s === "succeeded") return C.green;
  if (s === "error" || s === "failed" || s === "refused" || s === "blocked") return C.red;
  return C.amber;
}

export default function RunAutopsy({ envId }: { envId: string }) {
  void envId;
  const [receipts, setReceipts] = useState<ReceiptsResponse | null>(null);
  const [gov, setGov] = useState<GovernanceStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getReceipts(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((r) => { if (live) setReceipts(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    getGovernanceStats(TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID)
      .then((g) => { if (live) setGov(g); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const heading = (
    <PageHeading
      eyebrow="Mode · Run Autopsy"
      title="Run Autopsy"
      blurb="What ran, what it cost, what it refused, and the receipt that proves it. Failures and refusals are surfaced here, not hidden — an empty trail is shown as empty, never padded with examples."
    />
  );

  if (error && !receipts) {
    return <>{heading}<TelemetryStatusBanner tone="error">Audit read path unavailable — {error}.</TelemetryStatusBanner></>;
  }
  if (!receipts) return <>{heading}<Loading label="Reading audit trail…" /></>;

  return (
    <>
      {heading}

      {/* Governance aggregate — honest nulls when nothing is logged. */}
      <TelemetrySection label="Governance (30-day window)">
        {gov == null ? (
          <Loading label="Loading governance stats…" />
        ) : gov.null_reason ? (
          <EmptyState label="Governance stats unavailable" hint={`null_reason: ${gov.null_reason}`} />
        ) : (
          <StatGrid cols={4}>
            <MetricCard label="AI decisions" value={gov.total_decisions} sub={`${gov.successful} ok · ${gov.failed} failed`} />
            <MetricCard
              label="Success rate"
              value={gov.success_rate != null ? `${Math.round(gov.success_rate * 100)}%` : "—"}
              sub={gov.success_rate != null ? "of logged decisions" : "no decisions logged"}
              accent={gov.success_rate != null && gov.success_rate >= 0.9 ? C.green : undefined}
            />
            <MetricCard
              label="Avg grounding"
              value={gov.avg_grounding_score != null ? gov.avg_grounding_score.toFixed(2) : "—"}
              sub={`${gov.high_grounding} high · ${gov.low_grounding} low`}
            />
            <MetricCard label="Top tool" value={gov.top_tools[0]?.tool_name ?? "—"} sub={gov.top_tools[0] ? `${gov.top_tools[0].call_count} calls` : "no tool calls logged"} />
          </StatGrid>
        )}
      </TelemetrySection>

      {/* Execution receipts — fail-closed, no seeding. */}
      <TelemetrySection
        label="Execution receipts"
        right={<Tag color={C.faint}>{receipts.null_reason ? "unavailable" : `${receipts.runs.length} recorded`}</Tag>}
      >
        {receipts.null_reason ? (
          <EmptyState label="Audit read unavailable" hint={`null_reason: ${receipts.null_reason}`} />
        ) : receipts.runs.length === 0 ? (
          <EmptyState
            label="No receipts yet"
            hint="The audit read path responded but no governed executions are recorded for this scope. Run a governed MCP tool from the Agent Workbench to record the first receipt — none are seeded or fabricated here."
          />
        ) : (
          <Panel pad={0}>
            <ScrollTable minWidth={720}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Tool", "Status", "Permission", "Latency", "Actor", "When"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.runs.map((r, i) => (
                    <tr key={`${r.tool_name}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 12, color: C.text }}>{r.tool_name}</td>
                      <td style={{ padding: "10px 14px" }}><Tag color={statusColor(r.status)}>{r.status}</Tag></td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.permission_mode}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.actor ?? "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{fmtTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </Panel>
        )}
      </TelemetrySection>

      <div style={{ marginTop: 14 }}>
        <InlineCode color={C.faint}>
          Source: app.audit_events (receipts) + ai_decision_audit_log (governance), tenant-scoped. Read-only.
        </InlineCode>
      </div>
    </>
  );
}
