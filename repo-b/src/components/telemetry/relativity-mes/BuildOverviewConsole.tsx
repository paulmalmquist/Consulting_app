"use client";

// Build Overview — the Relativity MES Sandbox landing dashboard. Program-level synthetic build
// health for the three demo vehicles, read from the rel_build_overview Lakebase serving mart via the
// FastAPI route. Cards + per-vehicle table; every value drills to its source rows; rows deep-link
// into Genealogy / NCR / Cost filtered by vehicle.

import Link from "next/link";
import { C, EmptyState, ErrorState, Loading, MetricCard, Panel, ScrollTable, StatGrid, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { ExportToCsvButton } from "../drill";
import { getOverview, useRel, type OverviewResp, type Row } from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelMesHeroBand, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const num = (r: Row, k: string) => Number(r[k] ?? 0);
const str = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function BuildOverviewConsole({ envId }: { envId: string }) {
  const { data, loading, error } = useRel<OverviewResp>(getOverview);
  const [drill, setDrill] = useDrill();
  const dehref = (slug: string, vehicle: string) =>
    `/lab/env/${envId}/telemetry/relativity-mes/${slug}?vehicle=${encodeURIComponent(vehicle)}`;

  return (
    <div>
      <RelMesHeroBand>
        <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox" title="Build Overview"
          description="Program-level health for the synthetic demo build set, read from the rel_build_overview serving mart. Click any number to see the source rows; click a vehicle to trace its genealogy, NCRs, or cost."
          actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      </RelMesHeroBand>
      <SyntheticBanner />

      {loading && <Loading label="Loading rel_build_overview…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && (
        <EmptyState label="Serving mart not loaded" hint="rel_build_overview returned no rows." nullReason={data.null_reason} />
      )}

      {data && !data.null_reason && (() => {
        const rows = data.rows;
        const openNcr = rows.reduce((a, r) => a + num(r, "open_ncr_count"), 0);
        const suspectLots = rows.reduce((a, r) => a + num(r, "suspect_lot_count"), 0);
        const affected = rows.filter((r) => r.affected_by_suspect_lot).length;
        const workOrders = rows.reduce((a, r) => a + num(r, "work_order_count"), 0);
        const edges = rows.reduce((a, r) => a + num(r, "genealogy_edge_count"), 0);
        const variance = rows.reduce((a, r) => a + num(r, "variance_amount"), 0);
        const riskiest = [...rows].sort((a, b) =>
          (b.readiness_state === "blocked" ? 1 : 0) - (a.readiness_state === "blocked" ? 1 : 0)
          || num(b, "variance_pct") - num(a, "variance_pct"))[0];

        return (
          <>
            <ServingStrip meta={data} note={`${rows.length} vehicles`} />
            <StatGrid cols={4} style={{ marginBottom: 14 }}>
              <MetricCard label="Vehicles in build" value={rows.length} accent={REL_ACCENT} />
              <MetricCard label="Open NCRs" value={openNcr} accent={openNcr ? C.amber : C.green} />
              <MetricCard label="Suspect lots" value={suspectLots} accent={suspectLots ? C.amber : C.dim} />
              <MetricCard label="Affected vehicles" value={affected} accent={affected ? C.amber : C.green} />
              <MetricCard label="Work orders" value={workOrders} />
              <MetricCard label="Genealogy edges" value={edges} />
              <MetricCard label="Total cost variance" value={money(variance)} accent={C.amber} />
              <MetricCard label="Highest-risk vehicle"
                value={riskiest ? str(riskiest, "vehicle_serial") : "—"}
                accent={riskiest?.readiness_state === "blocked" ? C.red : C.amber} />
            </StatGrid>

            <Panel title="Vehicle summary (one row per vehicle)" right={
              <ExportToCsvButton filename="rel_build_overview"
                columns={rows.length ? Object.keys(rows[0]) : []} rows={rows} label="Export vehicles" />
            }>
              <ScrollTable minWidth={900}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11.5 }}>
                  <thead>
                    <tr>
                      {["vehicle", "status", "readiness", "WOs", "edges", "open NCR", "suspect", "planned", "actual", "var %", ""].map((h) => (
                        <th key={h} style={{ textAlign: "left", color: C.dim, padding: "7px 10px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const v = str(r, "vehicle_serial");
                      const blocked = r.readiness_state === "blocked";
                      return (
                        <tr key={v}>
                          <td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}` }}>
                            <Link href={dehref("genealogy", v)} style={{ color: REL_ACCENT, textDecoration: "none" }}>{v}</Link>
                          </td>
                          <td style={td}>{str(r, "build_status")}</td>
                          <td style={{ ...td, color: blocked ? C.red : num(r, "variance_pct") > 6 ? C.amber : C.green }}>{str(r, "readiness_state")}</td>
                          <td style={td}>{str(r, "work_order_count")}</td>
                          <td style={td}>{str(r, "genealogy_edge_count")}</td>
                          <td style={td}>
                            <Link href={dehref("ncr", v)} style={{ color: num(r, "open_ncr_count") ? C.amber : C.dim, textDecoration: "none" }}>
                              {str(r, "open_ncr_count")}
                            </Link>
                          </td>
                          <td style={{ ...td, color: r.affected_by_suspect_lot ? C.amber : C.dim }}>{r.affected_by_suspect_lot ? "yes" : "no"}</td>
                          <td style={td}>{money(num(r, "planned_cost"))}</td>
                          <td style={td}>
                            <Link href={dehref("cost", v)} style={{ color: REL_ACCENT, textDecoration: "none" }}>{money(num(r, "actual_cost"))}</Link>
                          </td>
                          <td style={{ ...td, color: num(r, "variance_pct") > 6 ? C.amber : C.dim }}>{num(r, "variance_pct").toFixed(1)}%</td>
                          <td style={td}>
                            <button type="button" onClick={() => setDrill({
                              table: "rel_mes_vehicle", filterKey: "vehicle_serial", filterValue: v,
                              title: `${v} — source rows`,
                              fields: [
                                { label: "Readiness", value: str(r, "readiness_state") },
                                { label: "Actual cost", value: money(num(r, "actual_cost")) },
                                { label: "Open NCRs", value: str(r, "open_ncr_count") },
                              ],
                            })} style={drillBtn}>source ›</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollTable>
            </Panel>
          </>
        );
      })()}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const td = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const drillBtn = { fontFamily: C.mono, fontSize: 11, color: REL_ACCENT, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" } as const;
