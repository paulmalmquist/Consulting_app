"use client";

// Lineage & Source Tables — makes the synthetic data product auditable. Reads
// rel_source_lineage_manifest plus live serving row-counts from the Lakebase serving layer, proving
// the real path (synthetic source → Databricks medallion → gold → Postgres/Lakebase serving → API →
// UI). Source-table registry, gold marts, dashboard→source matrix, join-key map, and seed freshness;
// every source table drills to its real rows.

import { C, EmptyState, ErrorState, Loading, Panel, ScrollTable, StatGrid, Stat, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { ExportToCsvButton } from "../drill";
import { getLineage, useRel, type LineageResp, type Row } from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const str = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));

export default function LineageSourceConsole() {
  const { data, loading, error } = useRel<LineageResp>(getLineage);
  const [drill, setDrill] = useDrill();

  const rows = data?.rows ?? [];
  const sourceRows = rows.filter((r) => r.layer === "source");
  const goldRows = rows.filter((r) => String(r.layer).startsWith("gold"));
  const joinDoc = rows.find((r) => r.object_name === "join_key_map");
  const joinKeys: string[] = joinDoc && typeof joinDoc.join_keys === "string"
    ? (() => { try { return JSON.parse(String(joinDoc.join_keys)); } catch { return []; } })() : [];
  const serving = data?.serving ?? {};
  const dbxLive = Object.values(serving).some((s) => s.serving_provenance === "databricks-gold");

  return (
    <div>
      <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox" title="Lineage & Source Tables"
        description="The audit map for the synthetic data product: which source tables feed each dashboard, the medallion path, the join keys, and the live Lakebase serving freshness. Distinguishes synthetic source → gold mart → serving → UI value."
        actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      <SyntheticBanner />

      {loading && <Loading label="Loading rel_source_lineage_manifest…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && <EmptyState label="No manifest" hint="rel_source_lineage_manifest returned no rows." nullReason={data.null_reason} />}

      {data && !data.null_reason && (
        <>
          <ServingStrip meta={data} note={dbxLive ? "Databricks-gold serving" : "bootstrap serving"} />

          <Panel title="Live serving (Postgres/Lakebase) — proof of the real serving path" style={{ marginBottom: 14 }}>
            <StatGrid cols={5}>
              {Object.entries(serving).map(([t, s]) => (
                <Stat key={t} label={t.replace(/^rel_/, "")} value={s.row_count}
                  tone={s.serving_provenance === "databricks-gold" ? C.green : REL_ACCENT} />
              ))}
            </StatGrid>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>
              Path: synthetic source (rel_*) → Databricks medallion (bronze → silver → gold_rel_*) →
              Postgres/Lakebase serving (rel_*) → FastAPI → this dashboard. Provenance{" "}
              <span style={{ color: dbxLive ? C.green : REL_ACCENT }}>
                {dbxLive ? "databricks-gold (synced from Databricks Gold)" : "seed-bootstrap (deterministic gold load; Databricks backfill flips this to databricks-gold)"}
              </span>.
            </div>
          </Panel>

          <Panel title="Source-system tables" style={{ marginBottom: 14 }} right={
            <ExportToCsvButton filename="rel_source_lineage_manifest"
              columns={rows.length ? Object.keys(rows[0]) : []} rows={rows} label="Export manifest" />
          }>
            <ScrollTable minWidth={820}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
                <thead><tr>{["table", "system", "grain", "rows", "dashboards", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>))}</tr></thead>
                <tbody>
                  {sourceRows.map((r) => {
                    let consumers: string[] = [];
                    try { consumers = JSON.parse(String(r.dashboard_consumers || "[]")); } catch { /* */ }
                    return (
                      <tr key={str(r, "object_name")}>
                        <td style={{ ...td, color: REL_ACCENT }}>{str(r, "object_name")}</td>
                        <td style={td}>{str(r, "source_system")}</td>
                        <td style={td}>{str(r, "grain")}</td>
                        <td style={td}>{str(r, "row_count")}</td>
                        <td style={{ ...td, color: C.dim }}>{consumers.join(", ") || "—"}</td>
                        <td style={td}>
                          <button type="button" style={drillBtn} onClick={() => setDrill({
                            table: str(r, "object_name"),
                            title: `${str(r, "object_name")} — sample source rows`,
                          })}>sample ›</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <Panel title="Gold marts → serving tables">
              {goldRows.map((r) => (
                <div key={str(r, "object_name")} style={rowLine}>
                  <span style={{ color: REL_ACCENT }}>{str(r, "object_name")}</span>
                  <span style={{ color: C.faint }}> · {str(r, "row_count")} rows · {str(r, "source_system_layer")}</span>
                </div>
              ))}
            </Panel>

            <Panel title="Join-key map">
              {joinKeys.length === 0 ? <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>—</span>
                : joinKeys.map((k, i) => (
                  <div key={i} style={{ ...rowLine, color: C.dim }}>{k}</div>
                ))}
            </Panel>

            <Panel title="Seed batch & freshness">
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.8 }}>
                ingest_batch_id: {sourceRows[0] ? str(sourceRows[0], "ingest_batch_id") : "—"} ·
                as_of: {data.as_of ?? "—"} · deterministic generator (fixed master seed) ·
                all rows synthetic=true
              </div>
            </Panel>
          </div>
        </>
      )}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const th = { textAlign: "left", color: C.dim, padding: "6px 9px", borderBottom: `1px solid ${C.border}` } as const;
const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const rowLine = { fontFamily: C.mono, fontSize: 11, padding: "5px 0", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const drillBtn = { fontFamily: C.mono, fontSize: 10.5, color: REL_ACCENT, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer" } as const;
