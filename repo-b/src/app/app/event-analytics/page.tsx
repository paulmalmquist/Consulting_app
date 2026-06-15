"use client";

// Event Analytics Dashboard (Plan 0004 observability surface).
// Read-only view over the BigQuery winston_events_analytics layer via the
// backend /api/events/v1/analytics/dashboard endpoint. OBSERVABILITY ONLY —
// BigQuery is never authoritative for operational state (execution status,
// REPE/finance KPIs, HR ledger/state all stay Postgres-authoritative). When
// BigQuery is unconfigured the backend returns available:false and we render a
// clear "Not available" state.

import { useCallback, useEffect, useState } from "react";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import {
  getEventAnalyticsDashboard,
  type EventAnalyticsDashboard,
} from "@/lib/bos-api";

function ObservabilityBadge() {
  return (
    <span
      title="BigQuery is observational only. Operational state (execution status, REPE/HR KPIs) is served from Postgres, not here."
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 4,
        border: "1px solid #3a3a4a",
        color: "#9aa0b5",
      }}
    >
      Observability only
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "#c7ccdb", marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p style={{ color: "#6b7080", fontSize: 13 }}>No rows.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#9aa0b5",
              borderBottom: "1px solid #2a2a38", fontWeight: 600 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ padding: "6px 10px", color: "#d7dbe8",
                borderBottom: "1px solid #1e1e2a", fontFamily: j > 0 ? "monospace" : undefined }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function EventAnalyticsPage() {
  const [data, setData] = useState<EventAnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getEventAnalyticsDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", color: "#d7dbe8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Event Analytics</h1>
        <ObservabilityBadge />
      </div>
      <p style={{ color: "#6b7080", fontSize: 13, marginTop: 4 }}>
        Read-only view over the BigQuery <code>winston_events_analytics</code> deduped layer.
        Raw <code>winston_events_raw.events</code> is an append-only lake (audit/replay only) and is
        never aggregated here.
      </p>

      {loading && <p style={{ marginTop: 24, color: "#9aa0b5" }}>Loading…</p>}

      {!loading && error && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #5a2a2a", borderRadius: 6,
          background: "#1a1212" }}>
          <strong style={{ color: "#e08a8a" }}>Not available</strong>
          <p style={{ color: "#b0a0a0", fontSize: 13, marginTop: 4 }}>{error}</p>
        </div>
      )}

      {!loading && data && !data.available && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #4a4030", borderRadius: 6,
          background: "#171410" }}>
          <strong style={{ color: "#d8b878" }}>Not available</strong>
          <p style={{ color: "#b5aa90", fontSize: 13, marginTop: 4 }}>
            {data.reason ?? "BigQuery analytics is not configured."}
          </p>
        </div>
      )}

      {!loading && data && data.available && (
        <>
          <div style={{ marginTop: 20 }}>
            <KpiStrip kpis={volumeKpis(data)} />
          </div>

          <Section title="Events by source">
            <Table
              headers={["Source", "Events (deduped)"]}
              rows={(data.by_source ?? []).map((r) => [r.source, r.event_count.toLocaleString()])}
            />
          </Section>

          <Section title="Execution events (daily)">
            <Table
              headers={["Date", "Event type", "Source", "Count"]}
              rows={(data.execution_events_daily ?? []).map((r) => [
                r.event_date, r.event_type, r.source, r.event_count.toLocaleString(),
              ])}
            />
          </Section>

          <Section title="History Rhymes — latest signal values">
            <Table
              headers={["Signal", "Value", "Staleness", "As of"]}
              rows={(data.hr_signal_latest ?? []).map((r) => [
                r.signal_name, r.signal_value, r.staleness_status, r.as_of_date,
              ])}
            />
          </Section>

          <Section title="History Rhymes — signal freshness">
            <Table
              headers={["Staleness", "Signals"]}
              rows={(data.hr_signal_freshness ?? []).map((r) => [
                r.staleness_status, r.signal_count.toLocaleString(),
              ])}
            />
          </Section>

          <Section title="Dead letters (malformed events — nothing dropped silently)">
            <Table
              headers={["Ingested", "Source", "Reason", "Raw payload"]}
              rows={(data.hr_dead_letters ?? []).map((r) => [
                r.ingested_at, r.source, r.dead_letter_reason, r.raw_payload ?? "",
              ])}
            />
          </Section>

          <p style={{ marginTop: 28, color: "#5a5f70", fontSize: 12 }}>
            Project <code>{data.project}</code> · dataset <code>{data.analytics_dataset}</code> ·
            observability only · raw rows are append-only and may include replay duplicates that the
            deduped layer collapses.
          </p>
        </>
      )}
    </main>
  );
}

function volumeKpis(data: EventAnalyticsDashboard): KpiDef[] {
  const v = data.volume;
  if (!v) return [];
  return [
    { label: "Deduped events", value: v.deduped_rows.toLocaleString(),
      hint: "Canonical analytics row count (one per idempotency_key)" },
    { label: "Raw lake rows", value: v.raw_rows.toLocaleString(),
      hint: "Append-only raw events (audit/replay) — never aggregated directly" },
    { label: "Replay dupes collapsed", value: v.replay_duplicates_collapsed.toLocaleString(),
      delta: v.replay_duplicates_collapsed > 0
        ? { value: "deduped", tone: "neutral" } : undefined,
      hint: "raw_rows − deduped_rows" },
    { label: "Dead letters", value: v.dead_letter_rows.toLocaleString(),
      delta: v.dead_letter_rows > 0 ? { value: "review", tone: "negative" } : { value: "clean", tone: "positive" },
      hint: "Malformed events, captured not dropped" },
  ];
}
