"use client";

// Build Genealogy — the hero screen. Build-to-flight traceability for a selected synthetic vehicle:
// the as-built tree (parent → child edges), installed serials/lots, open NCRs + dispositions, and the
// suspect-lot where-used trace. Reads rel_as_built_genealogy + rel_ncr_traceability (per vehicle) and
// the where-used endpoint, all from the Lakebase serving layer.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { C, EmptyState, ErrorState, Loading, Panel, ScrollTable, SelectField, SplitGrid, Stat, StatGrid, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { ExportToCsvButton } from "../drill";
import {
  getGenealogy, getWhereUsed, useRel, type GenealogyResp, type Row, type WhereUsedResp,
} from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));

export default function BuildGenealogyConsole() {
  const params = useSearchParams();
  const initial = params?.get("vehicle") || "";
  const [vehicle, setVehicle] = useState(initial);
  const [lot, setLot] = useState<string | null>(null);
  const [drill, setDrill] = useDrill();

  const { data, loading, error } = useRel<GenealogyResp>(
    () => getGenealogy(vehicle || undefined), [vehicle]);
  const whereUsed = useRel<WhereUsedResp>(
    () => lot ? getWhereUsed(lot) : Promise.resolve(null as unknown as WhereUsedResp), [lot]);

  const vehicles = data?.vehicles ?? [];
  const edges = data?.rows ?? [];
  const ncrs = data?.ncrs ?? [];
  const openNcrs = ncrs.filter((n) => n.status === "open");
  const lots = useMemo(
    () => Array.from(new Set(edges.filter((e) => e.lot_no).map((e) => String(e.lot_no)))).sort(),
    [edges]);
  const serialized = edges.filter((e) => e.child_type === "serial").length;
  const lotTracked = edges.filter((e) => e.child_type === "lot").length;

  return (
    <div>
      <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox · hero" title="Build Genealogy"
        description="As-built traceability for a synthetic vehicle: the installed serials and lots, the operations and inspections, the open NCRs, and the where-used trace for a suspect lot. Every node drills to its source rows."
        actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      <SyntheticBanner />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>VEHICLE</span>
        <SelectField value={vehicle} onChange={setVehicle} ariaLabel="Select vehicle">
          <option value="">All vehicles</option>
          {vehicles.map((v) => (
            <option key={str(v, "vehicle_serial")} value={str(v, "vehicle_serial")}>
              {str(v, "vehicle_serial")} · {str(v, "build_status")}
            </option>
          ))}
        </SelectField>
        {data && <ExportToCsvButton filename={`rel_genealogy${vehicle ? `_${vehicle}` : ""}`}
          columns={edges.length ? Object.keys(edges[0]) : []} rows={edges} label="Export tree rows" />}
      </div>

      {loading && <Loading label="Loading rel_as_built_genealogy…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && !edges.length && (
        <EmptyState label="No genealogy" hint="No as-built edges for this selection." nullReason={data.null_reason} />
      )}

      {data && (edges.length > 0 || vehicles.length > 0) && (
        <>
          <ServingStrip meta={data} note={`${edges.length} edges`} />
          <StatGrid cols={4} style={{ marginBottom: 14 }}>
            <Stat label="Installed nodes" value={edges.length} />
            <Stat label="Serialized" value={serialized} />
            <Stat label="Lot-tracked" value={lotTracked} />
            <Stat label="Open NCRs" value={openNcrs.length} tone={openNcrs.length ? C.amber : C.green} />
          </StatGrid>

          <SplitGrid variant="two-one">
            <Panel title="As-built tree (parent → child edges)">
              <ScrollTable minWidth={820}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
                  <thead>
                    <tr>{["vehicle", "parent", "child", "type", "part", "lot", "NCR", "disp", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", color: C.dim, padding: "6px 9px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {edges.map((e) => (
                      <tr key={str(e, "child_node_id") + str(e, "parent_node_id") + str(e, "reference_designator")}>
                        <td style={td}>{str(e, "vehicle_serial")}</td>
                        <td style={td}>{str(e, "parent_node_id")}</td>
                        <td style={{ ...td, color: REL_ACCENT }}>{str(e, "child_node_id")}</td>
                        <td style={td}>{str(e, "child_type")}</td>
                        <td style={td}>{str(e, "part_no") || "—"}</td>
                        <td style={td}>
                          {e.lot_no ? (
                            <button type="button" onClick={() => setLot(String(e.lot_no))} style={linkBtn}>{str(e, "lot_no")}</button>
                          ) : "—"}
                        </td>
                        <td style={{ ...td, color: e.ncr_id ? C.amber : C.dim }}>{str(e, "ncr_id") || "—"}</td>
                        <td style={td}>{str(e, "disposition_type") || "—"}</td>
                        <td style={td}>
                          <button type="button" style={drillBtn} onClick={() => setDrill({
                            table: e.child_type === "lot" ? "rel_mes_lot" : "rel_mes_unit",
                            filterKey: e.child_type === "lot" ? "lot_no" : "unit_serial",
                            filterValue: str(e, e.child_type === "lot" ? "lot_no" : "child_node_id"),
                            title: `${str(e, "child_node_id")} — source rows`,
                            fields: [
                              { label: "Type", value: str(e, "child_type") },
                              { label: "Ref des", value: str(e, "reference_designator") },
                              { label: "Installed", value: str(e, "installed_at") },
                              { label: "By", value: str(e, "installed_by") },
                            ],
                          })}>source ›</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </Panel>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Panel title="Open NCRs">
                {openNcrs.length === 0 ? (
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.green }}>No open NCRs for this selection.</span>
                ) : openNcrs.map((n) => (
                  <button key={str(n, "ncr_id")} type="button" onClick={() => setDrill({
                    table: "rel_mes_nonconformance", filterKey: "ncr_id", filterValue: str(n, "ncr_id"),
                    title: `${str(n, "ncr_id")} — source rows`,
                    fields: [
                      { label: "Defect", value: str(n, "defect_code") },
                      { label: "Severity", value: str(n, "severity") },
                      { label: "Lot", value: str(n, "lot_no") || "—" },
                      { label: "Affected vehicles", value: str(n, "affected_vehicle_count") },
                    ],
                  })} style={{ ...ncrCard, cursor: "pointer", width: "100%", textAlign: "left" }}>
                    <span style={{ color: C.amber, fontWeight: 600 }}>{str(n, "ncr_id")}</span>
                    <span style={{ color: C.dim }}> · {str(n, "defect_code")} · {str(n, "severity")}</span>
                    {Boolean(n.lot_no) && <span style={{ color: C.faint }}> · lot {str(n, "lot_no")}</span>}
                  </button>
                ))}
              </Panel>

              <Panel title="Suspect-lot where-used">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {lots.length === 0 && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>No lot-tracked components in view.</span>}
                  {lots.map((l) => (
                    <button key={l} type="button" onClick={() => setLot(l)}
                      style={{ ...chip, color: l === lot ? C.bg : REL_ACCENT, background: l === lot ? REL_ACCENT : "transparent" }}>{l}</button>
                  ))}
                </div>
                {lot && whereUsed.loading && <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>Tracing {lot}…</span>}
                {lot && whereUsed.data && (
                  whereUsed.data.affected_vehicle_count > 0 ? (
                    <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text, lineHeight: 1.7 }}>
                      <span style={{ color: REL_ACCENT }}>{lot}</span> is installed on{" "}
                      <span style={{ color: C.amber, fontWeight: 600 }}>{whereUsed.data.affected_vehicle_count}</span>{" "}
                      vehicle(s): {whereUsed.data.vehicles.join(", ")}
                      <div style={{ marginTop: 8 }}>
                        <ExportToCsvButton filename={`where_used_${lot}`}
                          columns={whereUsed.data.rows.length ? Object.keys(whereUsed.data.rows[0]) : []}
                          rows={whereUsed.data.rows} label="Export where-used" />
                      </div>
                    </div>
                  ) : (
                    <EmptyState label="Lot not installed" hint={`${lot} has no install edges.`} nullReason={whereUsed.data.null_reason} />
                  )
                )}
              </Panel>
            </div>
          </SplitGrid>
        </>
      )}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const drillBtn = { fontFamily: C.mono, fontSize: 10.5, color: REL_ACCENT, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer" } as const;
const linkBtn = { fontFamily: C.mono, fontSize: 11, color: REL_ACCENT, background: "transparent",
  border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 } as const;
const ncrCard = { border: `1px solid ${C.border}`, background: C.panel, borderRadius: 7,
  padding: "8px 10px", marginBottom: 8, fontFamily: C.mono, fontSize: 11 } as const;
const chip = { fontFamily: C.mono, fontSize: 10.5, border: `1px solid ${REL_ACCENT}66`,
  borderRadius: 999, padding: "3px 9px", cursor: "pointer" } as const;
