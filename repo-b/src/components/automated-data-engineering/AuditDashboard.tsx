"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getAuditSummary, getAuditDecisions, getDecisionDetail,
  type AuditSummaryResponse, type DecisionsResponse, type DecisionRow, type DecisionDetail,
} from "@/lib/automated-data-engineering/audit";
import {
  C, Panel, MetricCard, Tag, PageHeading, Loading, ErrorState,
  EmptyState, UnavailableState, Drawer, DrawerRow,
} from "./primitives";

// Audit Dashboard (plan PR 3): aggregate strip, calls-per-day sparkline, sortable
// AI-decision log, and a full-receipt detail drawer. ?audit_mode=1 reveals the
// underlying read shape (consistent with the REPE audit surface convention).

type SortKey = "created_at" | "grounding_score" | "latency_ms";

// The read shape shown under ?audit_mode=1 — the actual governed reads behind the surface.
const AUDIT_MODE_SQL = [
  "-- summary: governance.compute_audit_stats + calls_per_day over the 30-day hot window",
  "SELECT date_trunc('day', created_at), count(*) FILTER (WHERE action='mcp.tool_call')",
  "  FROM app.audit_events WHERE business_id = $1 GROUP BY 1 ORDER BY 1;",
  "-- decisions: governance.list_decisions(business_id, tool_name?, limit, offset)",
  "SELECT id, tool_name, model_used, grounding_score, latency_ms, success, created_at",
  "  FROM ai_decision_audit_log WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2;",
].join("\n");

export default function AuditDashboard({ envId }: { envId: string }) {
  const searchParams = useSearchParams();
  const auditMode = searchParams?.get("audit_mode") === "1";

  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null);
  const [decisions, setDecisions] = useState<DecisionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<DecisionDetail | null>(null);

  useEffect(() => {
    Promise.all([getAuditSummary(undefined, envId), getAuditDecisions(undefined, { env: envId, limit: 100 })])
      .then(([s, d]) => { setSummary(s); setDecisions(d); })
      .catch((e) => setError(String(e)));
  }, [envId]);

  const sorted = useMemo(() => {
    const rows = [...(decisions?.decisions ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey] ?? (sortKey === "created_at" ? "" : -Infinity);
      const bv = b[sortKey] ?? (sortKey === "created_at" ? "" : -Infinity);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return rows;
  }, [decisions, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const openDetail = (id: string | null) => {
    if (!id) return;
    getDecisionDetail(id).then(setDetail).catch(() => setDetail(null));
  };

  const heading = (
    <PageHeading eyebrow="Evidence" title="Audit"
      blurb="Every governed action leaves a receipt. This dashboard reads the AI-decision log and MCP tool-call audit trail over a 30-day operational window — call volume, success rate, grounding scores, and an estimated cost. Older history belongs in the warehouse, not here." />
  );

  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!summary || !decisions) return <>{heading}<Loading label="Loading audit trail…" /></>;

  return (
    <>
      {heading}

      {/* Stat strip */}
      {summary.null_reason ? (
        <UnavailableState nullReason={summary.null_reason} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ marginBottom: 16 }}>
          <MetricCard label={`Decisions · ${summary.window_days}d`} value={summary.total_decisions}
            sub={`${summary.successful} ok · ${summary.failed} failed`} />
          <MetricCard label="Success Rate"
            value={summary.success_rate != null ? `${Math.round(summary.success_rate * 100)}%` : "—"}
            sub={summary.success_rate != null ? "of logged decisions" : "no decisions logged"}
            accent={summary.success_rate != null && summary.success_rate >= 0.9 ? C.green : undefined} />
          <MetricCard label="Avg Grounding"
            value={summary.avg_grounding_score != null ? summary.avg_grounding_score.toFixed(2) : "—"}
            sub={`${summary.high_grounding} high · ${summary.low_grounding} low`}
            accent={summary.avg_grounding_score != null && summary.avg_grounding_score >= 0.8 ? C.green : undefined} />
          <MetricCard label="Est. Cost"
            value={summary.estimated_cost_usd != null ? `$${summary.estimated_cost_usd.toFixed(2)}` : "—"}
            sub={summary.estimated_cost_usd != null ? "token estimate · not authoritative" : "no token data"} />
        </div>
      )}

      {/* Calls per day */}
      <Panel title="Calls per day" right={<Tag color={C.faint}>{summary.window_days}d window</Tag>} style={{ marginBottom: 16 }}>
        <CallsSparkline data={summary.calls_per_day} />
      </Panel>

      {auditMode && (
        <Panel title="Audit mode · read shape" right={<Tag color={C.amber}>audit_mode=1</Tag>} style={{ marginBottom: 16 }}>
          <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>
            {AUDIT_MODE_SQL}
          </pre>
        </Panel>
      )}

      {/* Decision log */}
      <Panel title="AI decision log">
        {decisions.null_reason ? (
          <UnavailableState nullReason={decisions.null_reason} />
        ) : sorted.length === 0 ? (
          <EmptyState label="No decisions logged" hint="AI decisions appear here once the gateway records them for this tenant." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.faint }}>
                  <Th>Tool</Th>
                  <Th>Model</Th>
                  <ThSort label="Grounding" active={sortKey === "grounding_score"} dir={sortDir} onClick={() => toggleSort("grounding_score")} />
                  <ThSort label="Latency" active={sortKey === "latency_ms"} dir={sortDir} onClick={() => toggleSort("latency_ms")} />
                  <Th>Status</Th>
                  <ThSort label="When" active={sortKey === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id ?? Math.random()} onClick={() => openDetail(r.id)}
                    style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", color: C.text }}>
                    <Td>{r.tool_name ?? "—"}</Td>
                    <Td>{r.model_used ?? "—"}</Td>
                    <Td>
                      {r.grounding_score != null ? (
                        <span style={{ color: r.grounding_low ? C.red : r.grounding_score >= 0.8 ? C.green : C.amber }}>
                          {r.grounding_score.toFixed(2)}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>{r.latency_ms != null ? `${r.latency_ms}ms` : "—"}</Td>
                    <Td>
                      <span style={{ color: r.success ? C.green : C.red }}>{r.success ? "ok" : "failed"}</span>
                    </Td>
                    <Td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {detail && (
        <Drawer eyebrow="Receipt" title={detail.tool_name ?? "Decision"} onClose={() => setDetail(null)}>
          <DrawerRow label="Decision type" value={detail.decision_type} />
          <DrawerRow label="Actor" value={detail.actor} />
          <DrawerRow label="Model" value={detail.model_used} />
          <DrawerRow label="Grounding" value={detail.grounding_score != null ? detail.grounding_score.toFixed(3) : null} />
          <DrawerRow label="Latency" value={detail.latency_ms != null ? `${detail.latency_ms}ms` : null} />
          <DrawerRow label="Success" value={detail.success == null ? null : detail.success ? "yes" : "no"} />
          <DrawerRow label="When" value={detail.created_at ? new Date(detail.created_at).toLocaleString() : null} />
          {detail.error_message && <DrawerRow label="Error" value={detail.error_message} />}
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", margin: "16px 0 8px" }}>
            Input (redacted)
          </div>
          <ReceiptBlock value={detail.input_summary} />
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.12em", color: C.faint, textTransform: "uppercase", margin: "16px 0 8px" }}>
            Output (redacted)
          </div>
          <ReceiptBlock value={detail.output_summary} />
        </Drawer>
      )}
    </>
  );
}

function CallsSparkline({ data }: { data: { day: string; calls: number; failed: number }[] }) {
  if (data.length === 0) {
    return <span style={{ fontFamily: C.mono, fontSize: 12, color: C.faint }}>No tool calls in the window.</span>;
  }
  const max = Math.max(...data.map((d) => d.calls), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
      {data.map((d) => (
        <div key={d.day} title={`${d.day}: ${d.calls} calls, ${d.failed} failed`}
          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ background: d.failed > 0 ? C.amber : C.accent, height: `${(d.calls / max) * 100}%`, borderRadius: "2px 2px 0 0", minHeight: 2 }} />
        </div>
      ))}
    </div>
  );
}

function ReceiptBlock({ value }: { value: unknown }) {
  const text = value == null ? "—" : JSON.stringify(value, null, 2);
  return (
    <pre style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, background: C.bg,
      border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, lineHeight: 1.45,
      whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: 220, overflowY: "auto" }}>
      {text}
    </pre>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "8px 10px", fontWeight: 500, letterSpacing: "0.04em" }}>{children}</th>;
}

function ThSort({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th style={{ padding: "8px 10px", fontWeight: 500, letterSpacing: "0.04em" }}>
      <button type="button" onClick={onClick}
        style={{ background: "transparent", border: "none", color: active ? C.text : C.faint, cursor: "pointer", fontFamily: C.mono, fontSize: 12, padding: 0 }}>
        {label}{active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "8px 10px" }}>{children}</td>;
}
