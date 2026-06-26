"use client";

// NCR Traceability — quality events tied to physical genealogy and cost. Reads rel_ncr_traceability
// from the Lakebase serving layer. Cards from the backend KPI rollup; a defect-family filter; a
// severity/status table; vehicle impact; each NCR drills to its source rows and cross-links to the
// genealogy and cost dashboards.

import { useMemo, useState } from "react";
import Link from "next/link";
import { C, EmptyState, ErrorState, Loading, Panel, ScrollTable, SectionTabButton, StatGrid, Stat, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { ExportToCsvButton } from "../drill";
import { getNcr, useRel, type NcrResp, type Row } from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const str = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));
const n = (v: unknown) => Number(v ?? 0);

export default function NcrTraceabilityConsole({ envId }: { envId: string }) {
  const { data, loading, error } = useRel<NcrResp>(getNcr);
  const [family, setFamily] = useState<string>("all");
  const [drill, setDrill] = useDrill();

  const rows = data?.rows ?? [];
  const families = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => String(r.defect_code)))).sort()], [rows]);
  const shown = family === "all" ? rows : rows.filter((r) => r.defect_code === family);
  const kpis = (data?.kpis ?? {}) as Record<string, unknown>;

  return (
    <div>
      <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox" title="NCR Traceability"
        description="Synthetic nonconformances tied to vehicles, lots, operations, and cost — not just counts. Read from rel_ncr_traceability; each NCR drills to its source rows and links to genealogy and cost."
        actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      <SyntheticBanner />

      {loading && <Loading label="Loading rel_ncr_traceability…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && <EmptyState label="No NCR data" hint="rel_ncr_traceability returned no rows." nullReason={data.null_reason} />}

      {data && !data.null_reason && (
        <>
          <ServingStrip meta={data} note={`${rows.length} NCRs`} />
          <StatGrid cols={4} style={{ marginBottom: 14 }}>
            <Stat label="Open now" value={n(kpis.open_now)} tone={n(kpis.open_now) ? C.amber : C.green} />
            <Stat label="Major" value={n(kpis.major)} tone={C.amber} />
            <Stat label="Median age (days)" value={kpis.median_age_days == null ? "—" : String(kpis.median_age_days)} />
            <Stat label="Top defect family" value={String(kpis.top_defect_family ?? "—")} />
            <Stat label="Vehicles affected" value={n(kpis.vehicles_affected)} />
            <Stat label="Est. rework cost" value={`$${Math.round(n(kpis.estimated_rework_cost)).toLocaleString()}`} tone={C.amber} />
            <Stat label="Open blocking" value={n(kpis.open_blocking)} tone={n(kpis.open_blocking) ? C.red : C.green} />
          </StatGrid>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {families.map((f) => (
              <SectionTabButton key={f} active={f === family} onClick={() => setFamily(f)}>{f}</SectionTabButton>
            ))}
          </div>

          <Panel title={`NCRs (${shown.length})`} right={
            <ExportToCsvButton filename="rel_ncr_traceability"
              columns={shown.length ? Object.keys(shown[0]) : []} rows={shown} label="Export NCRs" />
          }>
            <ScrollTable minWidth={980}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
                <thead>
                  <tr>{["NCR", "vehicle", "defect", "sev", "status", "age", "disp", "affected", "rework $", ""].map((h) => (
                    <th key={h} style={{ textAlign: "left", color: C.dim, padding: "6px 9px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={str(r, "ncr_id")}>
                      <td style={{ ...td, color: C.amber }}>{str(r, "ncr_id")}</td>
                      <td style={td}>
                        <Link href={`/lab/env/${envId}/telemetry/relativity-mes/genealogy?vehicle=${encodeURIComponent(str(r, "vehicle_serial"))}`}
                          style={{ color: REL_ACCENT, textDecoration: "none" }}>{str(r, "vehicle_serial")}</Link>
                      </td>
                      <td style={td}>{str(r, "defect_code")}</td>
                      <td style={{ ...td, color: r.severity === "major" ? C.amber : C.dim }}>{str(r, "severity")}</td>
                      <td style={{ ...td, color: r.status === "open" ? C.red : C.green }}>{str(r, "status")}</td>
                      <td style={td}>{str(r, "age_days")}</td>
                      <td style={td}>{str(r, "disposition_type")}</td>
                      <td style={{ ...td, color: n(r.affected_vehicle_count) > 1 ? C.amber : C.dim }}>{str(r, "affected_vehicle_count")}</td>
                      <td style={td}>{r.estimated_rework_cost ? `$${Math.round(n(r.estimated_rework_cost)).toLocaleString()}` : "—"}</td>
                      <td style={td}>
                        <button type="button" style={drillBtn} onClick={() => setDrill({
                          table: "rel_mes_nonconformance", filterKey: "ncr_id", filterValue: str(r, "ncr_id"),
                          title: `${str(r, "ncr_id")} — source rows`,
                          fields: [
                            { label: "Work order", value: str(r, "work_order_no") },
                            { label: "Operation", value: str(r, "operation_id") },
                            { label: "Work center", value: str(r, "work_center") },
                            { label: "Lot", value: str(r, "lot_no") },
                          ],
                        })}>source ›</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </Panel>
        </>
      )}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const drillBtn = { fontFamily: C.mono, fontSize: 10.5, color: REL_ACCENT, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer" } as const;
