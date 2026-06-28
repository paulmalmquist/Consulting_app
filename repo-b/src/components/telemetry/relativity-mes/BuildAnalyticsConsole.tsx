"use client";

// Build Analytics — a SIMULATION-ANALYSIS surface over the rel_* serving marts, not a dashboard with
// caveats. Six base visuals + three simulation-analysis panels. Every claim is labeled generated vs
// emergent; small-n facts are shown structurally (no Lorenz/Gini, no clustering of 7 NCRs). Multi-seed
// stability + chaos survivability are receipt-backed (Batch B) and fail closed here.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  C, EmptyState, ErrorState, Loading, Panel, ScrollTable, SelectField, SplitGrid, Stat, StatGrid, Tag,
} from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import { TelemetryChartFrame } from "../chartPrimitives";
import {
  getAnalytics, getSeedStability, getDataQuality, useRel,
  type AnalyticsResp, type ReceiptEnvelope, type Row,
} from "@/lib/telemetry/relativityMes";
import { REL_ACCENT, RelSourceDrill, ServingStrip, SyntheticBanner, useDrill } from "./relMesShared";

const n = (v: unknown) => Number(v ?? 0);
const str = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));
const money = (v: unknown) => `$${Math.round(n(v)).toLocaleString()}`;
// cents-precise — the reconciliation residual is an exact figure; rounding it to the dollar hides that
// it equals the committed 'unallocated' ERP rows to the penny.
const money2 = (v: unknown) => `$${n(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── provenance chip — the central honesty fix ────────────────────────────────
type Prov = "generated" | "emergent" | "identity" | "low-n" | "data-quality";
const PROV: Record<Prov, { color: string; label: string }> = {
  generated: { color: C.amber, label: "generated scenario input" },
  emergent: { color: C.green, label: "emergent from simulation" },
  identity: { color: C.dim, label: "derived accounting identity" },
  "low-n": { color: C.faint, label: "low-n directional only" },
  "data-quality": { color: REL_ACCENT, label: "data-quality" },
};
function Chip({ kind }: { kind: Prov }) {
  const p = PROV[kind];
  return <Tag color={p.color}>{p.label}</Tag>;
}
function Caption({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, lineHeight: 1.5, marginTop: 8 }}>{children}</div>;
}

type Mode = "current" | "stability" | "chaos";

export default function BuildAnalyticsConsole() {
  const params = useSearchParams();
  const [vehicle, setVehicle] = useState(params?.get("vehicle") || "");
  const [mode, setMode] = useState<Mode>("current");
  const [drill, setDrill] = useDrill();
  const { data, loading, error } = useRel<AnalyticsResp>(() => getAnalytics(vehicle || undefined), [vehicle]);

  const k = data?.kpis ?? null;
  const b = data?.blocks ?? {};
  const readiness = b.readiness?.rows ?? [];
  const vehicles = readiness.map((r) => String(r.vehicle_serial)).sort();

  return (
    <div>
      <TelemetryPageHeader variant="standard" eyebrow="Relativity MES Sandbox" title="Build Analytics"
        description="A simulation-analysis surface: what the synthetic seed planted, what fell out of the simulated rows, and which findings survive re-randomization. Read from the rel_* serving marts; every number traces to a row."
        actions={<Tag color={REL_ACCENT}>synthetic</Tag>} />
      <SyntheticBanner />

      {/* Limitation banner + the blunt page copy */}
      <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: "11px 13px", marginBottom: 14 }}>
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.dim, lineHeight: 1.55 }}>
          Synthetic, single-snapshot MES scenario — useful for lineage, reconciliation, and drill-through;
          <b style={{ color: C.text }}> not</b> evidence of trend, throughput, or statistical stability until multi-seed simulation is enabled.
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 7, lineHeight: 1.5 }}>
          This page does not claim the synthetic seed discovered the suspect lot. It shows which parts of the
          scenario were planted, which facts fell out of the simulated rows, and which findings survive
          re-randomization. · <b>Current seed is a story. Multi-seed stability is the analysis.</b>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>SCENARIO MODE</span>
        <SelectField value={mode} onChange={(v) => setMode(v as Mode)} ariaLabel="Scenario mode">
          <option value="current">Current seed (the story)</option>
          <option value="stability">Multi-seed stability (the analysis)</option>
          <option value="chaos">Chaos survivability</option>
        </SelectField>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>VEHICLE</span>
        <SelectField value={vehicle} onChange={setVehicle} ariaLabel="Select vehicle">
          <option value="">All vehicles</option>
          {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
        </SelectField>
      </div>

      {loading && <Loading label="Loading analytics serving marts…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && <EmptyState label="No analytics data" hint="core serving marts returned no rows." nullReason={data.null_reason} />}

      {data && !data.null_reason && (
        <>
          <ServingStrip meta={data} note={`${readiness.length} vehicles`} />

          {/* KPI band */}
          <StatGrid cols={4} style={{ marginBottom: 14 }}>
            <Stat label="Total variance" value={money(k?.total_variance)} tone={C.amber} />
            <Stat label="Rework share" value={k?.rework_share_pct == null ? "—" : `${n(k.rework_share_pct).toFixed(1)}%`} />
            <Stat label="Recon exceptions" value={n(k?.recon_exception_count)} tone={n(k?.recon_exception_count) ? C.red : C.green} />
            <Stat label="Suspect-lot vehicles" value={n(k?.suspect_lot_vehicle_count)} tone={C.amber} />
            <Stat label="Busiest work center" value={k?.busiest_work_center ?? "—"} />
            <Stat label="Defect concentration" value={k?.defect_concentration_pct == null ? "—" : `${n(k.defect_concentration_pct).toFixed(1)}%`} />
          </StatGrid>

          {mode === "stability" && <StabilityPanel />}
          {mode === "chaos" && <ChaosPanel />}

          {/* 1. Readiness board + asymmetry */}
          <Panel title="Build readiness" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <Chip kind="emergent" />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {readiness.map((r) => {
                const state = str(r, "readiness_state");
                const tone = state === "blocked" ? C.red : state === "at_risk" ? C.amber : C.green;
                return (
                  <div key={str(r, "vehicle_serial")} style={{ flex: "1 1 200px", background: C.panel, border: `1px solid ${tone}55`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{str(r, "vehicle_serial")}</span>
                      <Tag color={tone}>{state}</Tag>
                    </div>
                    <div style={{ fontFamily: C.sans, fontSize: 12, color: C.dim, marginTop: 6 }}>{str(r, "driver")}</div>
                  </div>
                );
              })}
            </div>
            {b.asymmetry && b.asymmetry.rows.length > 0 && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Why {b.asymmetry.shared_exposure.join(" vs ")} differ — both contain the suspect lot
                </div>
                {b.asymmetry.rows.map((r) => (
                  <div key={str(r, "vehicle_serial")} style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "4px 0" }}>
                    <span style={{ color: C.dim }}>{str(r, "vehicle_serial")}</span> · {str(r, "readiness_state")} · {str(r, "note")}
                  </div>
                ))}
                <Caption>Shared exposure is generated (the lot was planted on both); the blocked-state asymmetry is emergent from each vehicle&apos;s open-NCR + critical-WO state.</Caption>
              </div>
            )}
          </Panel>

          {/* 2. Blast radius (custom SVG-ish columns) */}
          {b.blast?.rows_present && (
            <Panel title="Suspect-lot blast radius" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <Chip kind="generated" /><Chip kind="emergent" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <BlastCol title="Lot (exposure)" prov="generated">
                  <Node label={`${b.blast.lot_id}`} sub={b.blast.part_number ?? ""} tone={C.amber}
                    onClick={() => setDrill({ table: "rel_mes_lot", filterKey: "lot_no", filterValue: String(b.blast?.lot_id), title: `${b.blast?.lot_id} — lot source` })} />
                </BlastCol>
                <BlastCol title="Vehicles (where-used)" prov="generated">
                  {b.blast.vehicles.map((v) => (
                    <Node key={str(v, "vehicle_serial")} label={str(v, "vehicle_serial")} sub={str(v, "readiness_state")}
                      tone={str(v, "readiness_state") === "blocked" ? C.red : C.dim}
                      onClick={() => setDrill({ table: "rel_mes_vehicle", filterKey: "vehicle_serial", filterValue: str(v, "vehicle_serial"), title: `${str(v, "vehicle_serial")} — vehicle source` })} />
                  ))}
                </BlastCol>
                <BlastCol title="NCRs (attribution)" prov="emergent">
                  {b.blast.ncrs.map((nc) => (
                    <Node key={str(nc, "ncr_id")} label={str(nc, "ncr_id")} sub={`${str(nc, "severity")} · ${money(nc.rework_cost)}`}
                      tone={str(nc, "status") === "open" ? C.red : C.dim}
                      onClick={() => setDrill({ table: "rel_mes_nonconformance", filterKey: "ncr_id", filterValue: str(nc, "ncr_id"), title: `${str(nc, "ncr_id")} — NCR source` })} />
                  ))}
                </BlastCol>
                <BlastCol title="Work orders (blocked-state)" prov="emergent">
                  {b.blast.work_orders.map((w) => (
                    <Node key={str(w, "work_order_id")} label={str(w, "work_order_id")} sub={`${n(w.variance_pct).toFixed(0)}% var`}
                      tone={C.amber}
                      onClick={() => setDrill({ table: "rel_mes_work_order", filterKey: "work_order_no", filterValue: str(w, "work_order_id"), title: `${str(w, "work_order_id")} — work order source` })} />
                  ))}
                </BlastCol>
              </div>
              <Caption>Exposure (lot → 2 vehicles) was planted; the blocked-state (only one vehicle, via its open major NCR and over-threshold WO) is emergent.</Caption>
            </Panel>
          )}

          {/* 3. Cost-overrun bridge with residual */}
          {b.bridge && b.bridge.rows.length > 0 && (
            <Panel title="Cost-overrun bridge" style={{ marginBottom: 14 }} right={
              <Tag color={(b.bridge.residual_total ?? 0) === 0 ? C.dim : C.amber}>
                {b.bridge.reconciled_pct == null ? "—" : `reconciled ${b.bridge.reconciled_pct}%`} · residual {money2(b.bridge.residual_total)}
              </Tag>
            }>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><Chip kind="identity" /></div>
              {b.bridge.rows.map((r) => (
                <div key={str(r, "vehicle_serial")} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text, marginBottom: 4 }}>
                    {str(r, "vehicle_serial")} — planned {money(r.planned_cost)} → actual {money(r.actual_cost)}
                  </div>
                  <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
                    {([["material", C.cyan], ["labor_overhead", C.green], ["rework", C.amber], ["residual", C.red]] as const).map(([key, col]) => {
                      const val = n(r[key]); const tot = n(r.actual_cost) || 1;
                      if (val <= 0) return null;
                      return <span key={key} title={`${key}: ${money(val)}`} style={{ width: `${Math.min(100, val / tot * 100)}%`, background: col, opacity: 0.8 }} />;
                    })}
                  </div>
                </div>
              ))}
              <Caption>
                Decomposed as material + labor/overhead + rework (+ unallocated residual). Residual is an
                analytics-only reconciliation line; today the synthetic generator allocates all variance
                (residual ≈ 0) — real ERP/MES data expects a non-zero residual.
              </Caption>
            </Panel>
          )}

          {/* 4. Defect concentration — sorted bar (NOT Lorenz) */}
          {b.pareto && b.pareto.rows.length > 0 && (
            <Panel title="Defect concentration" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}><Chip kind="low-n" /></div>
              {(() => {
                const max = Math.max(1, ...b.pareto.rows.map((r) => n(r.rework_cost)));
                return b.pareto.rows.map((r) => (
                  <button key={str(r, "cluster_label")} type="button"
                    onClick={() => setDrill({ table: "rel_mes_nonconformance", filterKey: "defect_code", filterValue: str(r, "cluster_label").split("·")[0].trim(), title: `${str(r, "cluster_label")} — NCR rows` })}
                    style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 2fr minmax(90px,auto)", gap: 10, alignItems: "center", width: "100%", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: "3px 0" }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{str(r, "cluster_label")}</span>
                    <span style={{ position: "relative", height: 14, background: C.panelHi, borderRadius: 4 }}>
                      <span style={{ position: "absolute", inset: 0, width: `${n(r.rework_cost) / max * 100}%`, background: REL_ACCENT, opacity: 0.8, borderRadius: 4 }} />
                    </span>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, textAlign: "right" }}>{money(r.rework_cost)}</span>
                  </button>
                ));
              })()}
              <Caption>
                Largest NCR group = {b.pareto.concentration_pct == null ? "—" : `${b.pareto.concentration_pct}%`} of observed rework
                in this seed (n={b.pareto.n_ncrs ?? b.pareto.rows.length} — a ranking, not a distribution; no Lorenz/Gini at this n).
              </Caption>
            </Panel>
          )}

          {/* 5. Work-center heatmap (custom grid) */}
          {b.workcenter && b.workcenter.rows.length > 0 && (
            <Panel title="Work-center load & variance" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Chip kind="emergent" /></div>
              <ScrollTable minWidth={520}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(() => {
                    const max = Math.max(1, ...b.workcenter.rows.map((r) => n(r.actual_minutes)));
                    return b.workcenter.rows.map((r) => {
                      const lowN = Boolean(r.low_n);
                      const intensity = n(r.actual_minutes) / max;
                      const ratio = r.actual_std_ratio == null ? null : n(r.actual_std_ratio);
                      return (
                        <button key={`${str(r, "work_center")}-${str(r, "subassembly")}`} type="button"
                          onClick={() => setDrill({ table: "rel_mes_operation_execution", filterKey: "work_center", filterValue: str(r, "work_center"), title: `${str(r, "work_center")} — operations` })}
                          style={{ width: 130, textAlign: "left", borderRadius: 8, padding: 10, cursor: "pointer",
                            background: `rgba(255,158,100,${0.08 + intensity * 0.3})`, opacity: lowN ? 0.55 : 1,
                            border: `1px solid ${ratio && ratio > 1.1 ? C.amber : C.border}` }}>
                          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.text }}>{str(r, "work_center")}</div>
                          <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>{str(r, "subassembly")}</div>
                          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text, marginTop: 4 }}>{n(r.actual_minutes).toFixed(0)}m</div>
                          <div style={{ fontFamily: C.mono, fontSize: 9.5, color: ratio && ratio > 1.1 ? C.amber : C.dim }}>
                            {ratio == null ? "—" : `${ratio.toFixed(2)}×std`}{lowN ? " · n<5" : ""}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </ScrollTable>
              <Caption>Color = actual minutes (load); border = over-standard. Cells with fewer than 5 operations are dimmed (low-n directional). Standard minutes are synthetic.</Caption>
            </Panel>
          )}

          {/* 6. MES↔ERP reconciliation scatter */}
          {b.recon && b.recon.rows.length > 0 && (
            <TelemetryChartFrame title="MES↔ERP reconciliation" ariaLabel="Reconciliation scatter"
              caption={`Most work orders reconcile within ±${b.recon.exception_threshold_pct ?? 25}%; exceptions pop out. Threshold sensitivity: ${b.recon.threshold_sensitivity.map((s) => `${s.k}%→${s.exception_count}`).join(" · ")} (the count barely moves — the band is not what's discriminating).`}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Chip kind="emergent" /></div>
              {/* fixed-width chart wrapped so it scrolls (not overflows the page) below ~460px */}
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                <ScatterChart width={460} height={260} margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="standard_cost" name="standard" stroke={C.faint} tick={{ fontSize: 9, fill: C.faint }} />
                  <YAxis type="number" dataKey="actual_cost" name="actual" stroke={C.faint} tick={{ fontSize: 9, fill: C.faint }} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11 }} />
                  <ReferenceLine stroke={C.dim} strokeDasharray="4 4" segment={[{ x: 0, y: 0 }, { x: 20000, y: 20000 }]} />
                  <Scatter name="reconciled" data={b.recon.rows.filter((r) => !r.is_exception)} fill={C.green} isAnimationActive={false} />
                  <Scatter name="exception" data={b.recon.rows.filter((r) => r.is_exception)} fill={C.red} isAnimationActive={false} />
                </ScatterChart>
              </div>
            </TelemetryChartFrame>
          )}

          {/* 8. Disconfirmation — the "not replaying seeds" panel */}
          {b.disconfirmation && (
            <Panel title="Disconfirmation — what the scenario did not plant" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Chip kind="emergent" /></div>
              {b.disconfirmation.findings.length === 0 ? (
                <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.green }}>
                  0 unexpected exceptions found on this seed ({b.disconfirmation.checks_run} checks run) — clean.
                </div>
              ) : (
                b.disconfirmation.findings.map((f, i) => (
                  <div key={`${str(f, "kind")}-${i}`} style={{ fontFamily: C.mono, fontSize: 11.5, color: C.text, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                    <Tag color={C.amber}>{str(f, "kind")}</Tag> <span style={{ color: C.dim }}>{str(f, "ref")}</span> — {str(f, "detail")}
                  </div>
                ))
              )}
              <Caption>These checks look for facts the generator did not author (e.g. a cost exception with no linked NCR, an exposed-but-unblocked vehicle) — the test that this is analysis, not a replay of the seed.</Caption>
            </Panel>
          )}
        </>
      )}

      <RelSourceDrill target={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

function BlastCol({ title, prov, children }: { title: string; prov: Prov; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{title}</div>
      <div style={{ marginBottom: 6 }}><Chip kind={prov} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function Node({ label, sub, tone, onClick }: { label: string; sub: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", background: C.panel, border: `1px solid ${tone}55`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{label}</div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.dim }}>{sub}</div>}
    </button>
  );
}

function ReceiptStrip({ r }: { r: ReceiptEnvelope }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginBottom: 8 }}>
      receipt · {r.provider ?? "—"} · {r.rows_evaluated ?? "—"} runs · {r.code_version ?? "—"} · sha {r.data_manifest_sha ?? "—"}
    </div>
  );
}

// Multi-seed stability — replays the committed seed_stability receipt (median + P10–P90 + verdict).
// The whole point: turn "61%" into "median 52%, P10–P90 45–60% — stable pattern, seed-specific value".
function StabilityPanel() {
  const { data, loading, error } = useRel<ReceiptEnvelope>(getSeedStability, []);
  const metrics = (data?.payload?.metrics as Row[] | undefined) ?? [];
  return (
    <Panel title="Multi-seed stability — the analysis" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Chip kind="emergent" /></div>
      {loading && <Loading label="Loading the multi-seed study receipt…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && (
        <EmptyState label="Multi-seed study not generated yet"
          hint="Run python -m scripts.relativity_mes_seed.study to commit seed_stability.json."
          nullReason={data.null_reason} />
      )}
      {data && !data.null_reason && (
        <>
          <ReceiptStrip r={data} />
          <ScrollTable minWidth={620}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
              <thead><tr>{["metric", "current", "median", "P10", "P90", "verdict"].map((h) => (
                <th key={h} style={th}>{h}</th>))}</tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const stable = Boolean(m.value_stable);
                  return (
                    <tr key={str(m, "key")}>
                      <td style={td}>{str(m, "label")}</td>
                      <td style={td}>{str(m, "current")}{str(m, "unit") === "%" ? "%" : ""}</td>
                      <td style={td}>{str(m, "median")}</td>
                      <td style={td}>{str(m, "p10")}</td>
                      <td style={td}>{str(m, "p90")}</td>
                      <td style={{ ...td, color: stable ? C.green : C.amber }}>{str(m, "verdict")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>
          <Caption>Across {data.rows_evaluated ?? "—"} re-randomized seeds. A wide P10–P90 means the exact percentage is seed-specific even when the pattern (one dominant defect, a residual that never vanishes) holds — the honest reading of small-n synthetic data.</Caption>
        </>
      )}
    </Panel>
  );
}

// Chaos survivability — replays the committed data_quality receipt (join/linkage/dangling under mess).
function ChaosPanel() {
  const { data, loading, error } = useRel<ReceiptEnvelope>(getDataQuality, []);
  const runs = (data?.payload?.runs as Row[] | undefined) ?? [];
  return (
    <Panel title="Chaos survivability" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Chip kind="data-quality" /></div>
      {loading && <Loading label="Loading the chaos study receipt…" />}
      {error && <ErrorState message={error} />}
      {data && data.null_reason && (
        <EmptyState label="Chaos study not generated yet"
          hint="Run python -m scripts.relativity_mes_seed.chaos to commit data_quality.json."
          nullReason={data.null_reason} />
      )}
      {data && !data.null_reason && (
        <>
          <ReceiptStrip r={data} />
          <ScrollTable minWidth={620}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 11 }}>
              <thead><tr>{["chaos level", "graph join %", "NCR linkage %", "dangling WOs", "survives"].map((h) => (
                <th key={h} style={th}>{h}</th>))}</tr></thead>
              <tbody>
                {runs.map((r) => {
                  const ok = Boolean(r.survives);
                  return (
                    <tr key={str(r, "chaos_level")}>
                      <td style={td}>{(n(r.chaos_level) * 100).toFixed(0)}%</td>
                      <td style={td}>{str(r, "genealogy_join_coverage_pct")}%</td>
                      <td style={td}>{str(r, "ncr_linkage_rate_pct")}%</td>
                      <td style={td}>{str(r, "dangling_work_orders")}</td>
                      <td style={{ ...td, color: ok ? C.green : C.red }}>{ok ? "yes" : "no"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>
          <Caption>Mess (missing work-order joins, NCRs against ghost orders, duplicate edges) is injected into a COPY only — the committed live serving stays clean. These are the metrics a real MES/ERP data-quality monitor watches; the surface degrades honestly rather than hiding the gaps.</Caption>
        </>
      )}
    </Panel>
  );
}

const th = { textAlign: "left", color: C.dim, padding: "6px 9px", borderBottom: `1px solid ${C.border}` } as const;
const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, color: C.text } as const;
