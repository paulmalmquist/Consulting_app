"use client";

import { useCallback, useEffect, useState } from "react";

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
  getDeReceipts,
  profileMetadataGraph,
  type DeReceiptsResponse,
} from "@/lib/telemetry/dataEngineeringReceipts";
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
  StatusDot,
  Tag,
  TelemetryActionButton,
  TelemetrySection,
  TelemetryStatusBanner,
} from "../primitives";

// Run Autopsy — the "inspect" mode. Now closes the loop with ONE real read-only action: "Profile
// metadata graph" hits the telemetry endpoint, which writes a genuine audit receipt; the Data
// Engineering receipts table below reads those real rows back. Plus the governed AI-decision aggregate
// and ADE execution receipts (/api/ade/runs). NO-GO: nothing seeded or fabricated — an empty trail is
// shown empty, and the only way a receipt appears is to run the action.

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

function summarize(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj || {});
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function RunAutopsy({ envId }: { envId: string }) {
  void envId;
  const [receipts, setReceipts] = useState<ReceiptsResponse | null>(null);
  const [gov, setGov] = useState<GovernanceStatsResponse | null>(null);
  const [de, setDe] = useState<DeReceiptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadDe = useCallback(async () => {
    try {
      setDe(await getDeReceipts(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID));
    } catch {
      setDe({ runs: [], null_reason: "audit_read_unavailable" });
    }
  }, []);

  useEffect(() => {
    let live = true;
    getReceipts(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((r) => { if (live) setReceipts(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    getGovernanceStats(TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID)
      .then((g) => { if (live) setGov(g); })
      .catch(() => {});
    void loadDe();
    return () => { live = false; };
  }, [loadDe]);

  const runProfile = useCallback(async () => {
    setRunning(true);
    setActionMsg(null);
    try {
      const r = await profileMetadataGraph(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID);
      setActionMsg(
        r.status === "success"
          ? `Recorded receipt ${r.receipt_id.slice(0, 8)} — ${summarize(r.result_summary)}`
          : `Recorded a failed attempt — null_reason: ${r.null_reason ?? "unknown"}`,
      );
      await loadDe();
    } catch (e) {
      setActionMsg(`Action could not run: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }, [loadDe]);

  const heading = (
    <PageHeading
      eyebrow="Mode · Run Autopsy"
      title="Run Autopsy"
      blurb="What ran, what it cost, what it refused, and the receipt that proves it. Run the one read-only action below to leave a genuine audit receipt; everything else is shown exactly as recorded — an empty trail stays empty, never padded."
    />
  );

  return (
    <>
      {heading}

      {/* The one real read-only action that leaves audit evidence. */}
      <TelemetrySection label="Read-only action">
        <Panel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text }}>Profile metadata graph</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                Read-only: counts nodes, edges, declared grain, and status. Writes no telemetry data — the
                only side effect is a real audit receipt, which appears below.
              </div>
            </div>
            <TelemetryActionButton onClick={runProfile} disabled={running}>
              {running ? "Running…" : "Run profiling action"}
            </TelemetryActionButton>
          </div>
          {actionMsg && (
            <div role="status" aria-live="polite" style={{ marginTop: 12, fontFamily: C.mono, fontSize: 11.5, color: C.cyan, lineHeight: 1.5 }}>
              {actionMsg}
            </div>
          )}
        </Panel>
      </TelemetrySection>

      {/* Real receipts produced by the DE action. */}
      <TelemetrySection
        label="Data Engineering receipts"
        right={<Tag color={C.faint}>{de ? (de.null_reason ? "unavailable" : `${de.runs.length} recorded`) : "…"}</Tag>}
      >
        {!de ? (
          <Loading label="Reading receipts…" />
        ) : de.null_reason ? (
          <EmptyState label="Audit read unavailable" hint={`null_reason: ${de.null_reason}`} />
        ) : de.runs.length === 0 ? (
          <EmptyState
            label="No receipts yet"
            hint="No Data Engineering actions have been recorded for this scope. Run the read-only profiling action above to record the first one — none are seeded or fabricated."
          />
        ) : (
          <Panel pad={0}>
            <ScrollTable minWidth={820}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Action", "Status", "Permission", "Actor", "Latency", "When", "Result / reason"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontFamily: C.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {de.runs.map((r, i) => (
                    <tr key={`${r.action}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.text }}>{r.tool_name}</td>
                      <td style={{ padding: "10px 14px" }}><Tag color={statusColor(r.status)}>{r.status}</Tag></td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.permission_mode}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.actor ?? "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: C.dim }}>{fmtTime(r.created_at)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: C.mono, fontSize: 11, color: r.status === "failed" ? C.amber : C.dim }}>
                        {r.status === "failed" ? `null_reason: ${r.null_reason ?? "unknown"}` : summarize(r.result_summary)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </Panel>
        )}
      </TelemetrySection>

      {/* Governed AI-decision aggregate — honest nulls when nothing is logged. */}
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

      {/* ADE execution receipts (mcp.tool_call) — separate audit stream, fail-closed. */}
      <TelemetrySection
        label="MCP tool-call receipts"
        right={<Tag color={C.faint}>{receipts ? (receipts.null_reason ? "unavailable" : `${receipts.runs.length} recorded`) : "…"}</Tag>}
      >
        {error && !receipts ? (
          <TelemetryStatusBanner tone="error">Audit read path unavailable — {error}.</TelemetryStatusBanner>
        ) : !receipts ? (
          <Loading label="Reading audit trail…" />
        ) : receipts.null_reason ? (
          <EmptyState label="Audit read unavailable" hint={`null_reason: ${receipts.null_reason}`} />
        ) : receipts.runs.length === 0 ? (
          <EmptyState label="No MCP tool-call receipts yet" hint="The audit read path responded but no MCP tool executions are recorded for this scope." />
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
          Sources: app.audit_events (DE receipts + MCP tool-calls) · ai_decision_audit_log (governance),
          tenant-scoped. The DE action is read-only; the only write is its own audit receipt.
        </InlineCode>
      </div>
    </>
  );
}
