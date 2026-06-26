"use client";

// Cost Reconciliation — the ISA-95 Level 3 / Level 4 seam. MES physical actuals (rel_build_cost_rollup)
// next to ERP standard/settled cost + variance category (rel_mes_erp_reconciliation), read from the
// Lakebase serving layer. KPI cards from the backend, a variance breakdown, the MES actuals + ERP
// settlement tables, reconciliation exceptions, and drill-to-source on both sides.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { C, EmptyState, ErrorState, Loading, Panel, ScrollTable, SelectField, SplitGrid, Stat, StatGrid, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { ExportToCsvButton } from "../drill";
import { getCost, useRel, type CostResp, type Row } from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const str = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));
const n = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => `$${Math.round(n(v)).toLocaleString()}`;

export default function CostReconciliationConsole() {
  const params = useSearchParams();
  const [vehicle, setVehicle] = useState(params?.get("vehicle") || "");
  const [drill, setDrill] = useDrill();
  const { data, loading, error } = useRel<CostResp>(() => getCost(vehicle || undefined), [vehicle]);

  const rollup = data?.rollup ?? [];
  const recon = data?.reconciliation ?? [];
  const kpis = (data?.kpis ?? {}) as Record<string, unknown>;
  const vehicles = Array.from(new Set([...rollup, ...recon].map((r) => String(r.vehicle_serial)))).sort();
  const maxVar = Math.max(1, ...recon.map((r) => Math.abs(n(r.variance_amount))));

  return (
    <div>
      <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox" title="Cost Reconciliation"
        description="The Level 3 / Level 4 seam: MES owns what physically happened, ERP owns the financial settlement, the gold mart reconciles the two. Read from rel_build_cost_rollup + rel_mes_erp_reconciliation. Variances drill to MES and ERP source rows."
        actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      <SyntheticBanner />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>VEHICLE</span>
        <SelectField value={vehicle} onChange={setVehicle} ariaLabel="Select vehicle">
          <option value="">All vehicles</option>
          {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
        </SelectField>
      </div>

      {loading && <Loading label="Loading cost serving marts…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && <EmptyState label="No cost data" hint="serving marts returned no rows." nullReason={data.null_reason} />}

      {data && !data.null_reason && (
        <>
          <ServingStrip meta={data} note={`${recon.length} work orders`} />
          <StatGrid cols={4} style={{ marginBottom: 14 }}>
            <Stat label="Standard cost" value={money(kpis.standard_cost)} />
            <Stat label="Actual cost" value={money(kpis.actual_cost)} />
            <Stat label="Total variance" value={money(kpis.total_variance)} tone={C.amber} />
            <Stat label="Variance %" value={`${n(kpis.variance_pct).toFixed(1)}%`} tone={n(kpis.variance_pct) > 6 ? C.amber : C.dim} />
            <Stat label="Material" value={money(kpis.material_variance)} />
            <Stat label="Labor / resource" value={money(kpis.labor_variance)} />
            <Stat label="NCR / rework" value={money(kpis.ncr_rework_cost)} tone={C.amber} />
            <Stat label="Unreconciled rows" value={n(kpis.unreconciled_rows)} tone={n(kpis.unreconciled_rows) ? C.red : C.green} />
          </StatGrid>

          <Panel title="Variance by work order (MES actual vs ERP standard)" style={{ marginBottom: 14 }} right={
            <ExportToCsvButton filename="rel_mes_erp_reconciliation"
              columns={recon.length ? Object.keys(recon[0]) : []} rows={recon} label="Export reconciliation" />
          }>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {recon.map((r) => {
                const v = n(r.variance_amount);
                const exc = r.reconciliation_status === "exception";
                return (
                  <button key={str(r, "work_order_no")} type="button" onClick={() => setDrill({
                    table: "rel_erp_cost_variance", filterKey: "mfg_order_no", filterValue: str(r, "mfg_order_no"),
                    title: `${str(r, "work_order_no")} — variance source rows`,
                    fields: [
                      { label: "Variance category", value: str(r, "variance_category") },
                      { label: "Standard", value: money(r.standard_cost) },
                      { label: "Actual", value: money(r.actual_cost) },
                      { label: "Status", value: str(r, "reconciliation_status") },
                    ],
                  })} style={{ display: "grid", gridTemplateColumns: "minmax(110px,1fr) 2fr minmax(80px,auto)", gap: 10,
                    alignItems: "center", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{str(r, "work_order_no")}</span>
                    <span style={{ position: "relative", height: 16, background: C.panelHi, borderRadius: 4 }}>
                      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4,
                        width: `${Math.min(100, Math.abs(v) / maxVar * 100)}%`, background: exc ? C.red : REL_ACCENT, opacity: 0.8 }} />
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: exc ? C.red : C.amber, textAlign: "right" }}>
                      {money(v)} · {str(r, "variance_category")}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <SplitGrid variant="halves">
            <Panel title="MES actuals (physical truth)" right={
              <ExportToCsvButton filename="rel_build_cost_rollup"
                columns={rollup.length ? Object.keys(rollup[0]) : []} rows={rollup} label="Export MES" />
            }>
              <ScrollTable minWidth={520}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
                  <thead><tr>{["work order", "material $", "labor min", "rework $", "total $", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>))}</tr></thead>
                  <tbody>
                    {rollup.map((r) => (
                      <tr key={str(r, "work_order_no")}>
                        <td style={td}>{str(r, "work_order_no")}</td>
                        <td style={td}>{money(r.material_actual_cost)}</td>
                        <td style={td}>{str(r, "labor_minutes")}</td>
                        <td style={{ ...td, color: n(r.ncr_rework_cost) ? C.amber : C.dim }}>{money(r.ncr_rework_cost)}</td>
                        <td style={td}>{money(r.total_actual_cost)}</td>
                        <td style={td}>
                          <button type="button" style={drillBtn} onClick={() => setDrill({
                            table: "rel_mes_material_consumption", filterKey: "work_order_no", filterValue: str(r, "work_order_no"),
                            title: `${str(r, "work_order_no")} — MES consumption rows`,
                          })}>source ›</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </Panel>

            <Panel title="ERP settlement (financial truth)">
              <ScrollTable minWidth={520}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
                  <thead><tr>{["mfg order", "standard $", "actual $", "var", "category", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>))}</tr></thead>
                  <tbody>
                    {recon.map((r) => (
                      <tr key={str(r, "mfg_order_no")}>
                        <td style={td}>{str(r, "mfg_order_no")}</td>
                        <td style={td}>{money(r.standard_cost)}</td>
                        <td style={td}>{money(r.actual_cost)}</td>
                        <td style={{ ...td, color: C.amber }}>{money(r.variance_amount)}</td>
                        <td style={td}>{str(r, "variance_category")}</td>
                        <td style={td}>
                          <button type="button" style={drillBtn} onClick={() => setDrill({
                            table: "rel_erp_prod_order_cost", filterKey: "mfg_order_no", filterValue: str(r, "mfg_order_no"),
                            title: `${str(r, "mfg_order_no")} — ERP cost rows`,
                          })}>source ›</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            </Panel>
          </SplitGrid>
        </>
      )}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const th = { textAlign: "left", color: C.dim, padding: "6px 9px", borderBottom: `1px solid ${C.border}` } as const;
const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
const drillBtn = { fontFamily: C.mono, fontSize: 10.5, color: REL_ACCENT, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer" } as const;
