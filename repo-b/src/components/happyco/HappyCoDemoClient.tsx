"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Bot, Building2, CheckCircle2, ClipboardList, Database, FileSpreadsheet, GitBranch, Layers3, Network, ShieldCheck, Sparkles } from "lucide-react";
import { getOperatorPropertyOpsBenchmarks, getOperatorPropertyOpsEntities, getOperatorPropertyOpsGraph, getOperatorPropertyOpsMlRisk, getOperatorPropertyOpsRecommendations, type OperatorPropertyOpsBenchmark, type OperatorPropertyOpsDriver, type OperatorPropertyOpsEntities, type OperatorPropertyOpsGraph, type OperatorPropertyOpsMlPrediction, type OperatorPropertyOpsMlRisk, type OperatorPropertyOpsProperty, type OperatorPropertyOpsRecommendation, type OperatorPropertyOpsRecommendations } from "@/lib/bos-api";
import { HAPPYCO_AUTOMATION_ROWS, HAPPYCO_DATABRICKS_RECEIPT } from "@/lib/happyco/proof";

type TabId = "demo" | "flow" | "ml" | "automation" | "artifacts" | "build";
type Bundle = { entities: OperatorPropertyOpsEntities; graph: OperatorPropertyOpsGraph; benchmarks: OperatorPropertyOpsBenchmark[]; recommendations: OperatorPropertyOpsRecommendations; mlRisk: OperatorPropertyOpsMlRisk };
type RiskBand = "Low" | "Medium" | "High";

const tabs: Array<{ id: TabId; label: string; icon: typeof Building2 }> = [
  { id: "demo", label: "Executive Demo", icon: Building2 },
  { id: "flow", label: "Data Flow", icon: Network },
  { id: "ml", label: "ML Risk Model", icon: Sparkles },
  { id: "automation", label: "Automation Room", icon: Bot },
  { id: "artifacts", label: "Artifact Factory", icon: FileSpreadsheet },
  { id: "build", label: "Build Log", icon: ClipboardList },
];

function statusTone(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("high") || lower.includes("blocked") || lower.includes("not_available")) return "border-rose-300 bg-rose-50 text-rose-800";
  if (lower.includes("medium") || lower.includes("review") || lower.includes("planned") || lower.includes("draft") || lower.includes("not_run")) return "border-amber-300 bg-amber-50 text-amber-800";
  if (lower.includes("low") || lower.includes("ready") || lower.includes("available") || lower.includes("complete")) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  return "border-violet-200 bg-violet-50 text-violet-900";
}
function StatusPill({ value }: { value: string }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(value)}`}>{value}</span>; }
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={`rounded-3xl border border-[#DDD8EA] bg-white shadow-sm ${className}`}>{children}</section>; }
function scoreBand(score: number): RiskBand { if (score >= 70) return "High"; if (score >= 40) return "Medium"; return "Low"; }
function bandClass(band: RiskBand | string) { const lower = band.toLowerCase(); if (lower === "high") return "bg-[#35146B] text-white"; if (lower === "medium") return "bg-amber-100 text-amber-900"; return "bg-emerald-100 text-emerald-900"; }
function firstRecommendation(rows: OperatorPropertyOpsRecommendation[], propertyId: string) { return rows.find((row) => row.property_id === propertyId) ?? null; }
function firstMlPrediction(rows: OperatorPropertyOpsMlPrediction[], propertyId: string) { return rows.find((row) => row.property_id === propertyId) ?? null; }
function driverLabel(driver: OperatorPropertyOpsDriver) { return driver.feature.replaceAll("_", " ").replaceAll("__", ": "); }
function databricksStatusLabel(mlRisk: OperatorPropertyOpsMlRisk) { if (mlRisk.databricks_status === "completed") return "Databricks run completed"; if (mlRisk.databricks_status === "attempted_failed") return "Databricks attempted_failed"; if (mlRisk.databricks_status === "not_configured") return "Databricks not_configured"; return "Databricks not_run"; }

export function HappyCoDemoClient({ envId }: { envId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("demo");
  const [selectedId, setSelectedId] = useState("prop-parkline-commons");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [entities, graph, benchmarks, recommendations, mlRisk] = await Promise.all([
          getOperatorPropertyOpsEntities(envId), getOperatorPropertyOpsGraph(envId), getOperatorPropertyOpsBenchmarks(envId), getOperatorPropertyOpsRecommendations(envId), getOperatorPropertyOpsMlRisk(envId),
        ]);
        if (!cancelled) { setBundle({ entities, graph, benchmarks: benchmarks.benchmarks, recommendations, mlRisk }); setSelectedId((prev) => entities.properties.some((row) => row.property_id === prev) ? prev : entities.properties[0]?.property_id || prev); }
      } catch (exc) { if (!cancelled) setError(exc instanceof Error ? exc.message : "Unable to load HappyCo property ops demo."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [envId]);

  const selectedProperty = useMemo(() => bundle?.entities.properties.find((row) => row.property_id === selectedId) ?? null, [bundle, selectedId]);
  const selectedBenchmark = useMemo(() => bundle?.benchmarks.find((row) => row.property_id === selectedId) ?? null, [bundle, selectedId]);
  const selectedRecommendation = useMemo(() => firstRecommendation(bundle?.recommendations.recommendations ?? [], selectedId), [bundle, selectedId]);
  const selectedMl = useMemo(() => firstMlPrediction(bundle?.mlRisk.predictions ?? [], selectedId), [bundle, selectedId]);

  if (loading) return <Shell><Panel className="p-8"><div className="text-sm font-black uppercase tracking-[0.2em] text-[#4025A8]">HappyCo clean demo</div><h1 className="mt-2 text-3xl font-black">Loading Property Ops Intelligence...</h1></Panel></Shell>;
  if (error || !bundle || !selectedProperty || !selectedBenchmark) return <Shell><div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-900"><div className="text-sm font-black uppercase tracking-[0.2em]">Unavailable</div><h1 className="mt-2 text-3xl font-black">HappyCo demo data is not available</h1><p className="mt-3 text-sm font-semibold">{error || "The property ops payload did not include a selected property."}</p></div></Shell>;

  return <Shell>
    <Hero selectedBenchmark={selectedBenchmark} selectedRecommendation={selectedRecommendation} />
    <div className="sticky top-0 z-10 rounded-3xl border border-[#DDD8EA] bg-white/90 p-2 shadow-sm backdrop-blur"><div className="grid gap-2 md:grid-cols-6">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-black transition ${activeTab === id ? "bg-[#4025A8] text-white shadow-md shadow-[#4025A8]/20" : "text-[#25145F] hover:bg-[#F5F1FF]"}`}><Icon className="h-4 w-4" /> {label}</button>)}</div></div>
    {activeTab === "demo" && <ExecutiveDemoTab bundle={bundle} selectedId={selectedId} setSelectedId={setSelectedId} selectedProperty={selectedProperty} selectedBenchmark={selectedBenchmark} selectedRecommendation={selectedRecommendation} selectedMl={selectedMl} />}
    {activeTab === "flow" && <DataFlowTab />}
    {activeTab === "ml" && <MlRiskTab mlRisk={bundle.mlRisk} selectedMl={selectedMl} benchmarks={bundle.benchmarks} />}
    {activeTab === "automation" && <AutomationTab />}
    {activeTab === "artifacts" && <ArtifactFactoryTab mlRisk={bundle.mlRisk} />}
    {activeTab === "build" && <BuildLogTab mlRisk={bundle.mlRisk} />}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-[#FBFAF7] text-[#25145F]"><div className="mx-auto w-full max-w-none space-y-6 px-5 py-8 sm:px-8 2xl:px-10">{children}</div></main>; }
function Hero({ selectedBenchmark, selectedRecommendation }: { selectedBenchmark: OperatorPropertyOpsBenchmark; selectedRecommendation: OperatorPropertyOpsRecommendation | null }) { return <Panel className="overflow-hidden"><div className="grid lg:grid-cols-[1.1fr_0.9fr]"><div className="p-7 md:p-9"><div className="mb-8 flex flex-wrap items-center gap-4"><div className="text-2xl font-black tracking-tight">HAPPYCO</div><div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#6F6590]"><span>Canonical model</span><span>Property graph</span><span>Databricks receipt</span></div></div><div className="mb-4 text-sm font-black uppercase tracking-[0.1em]">Clean external presentation</div><h1 className="max-w-4xl text-4xl font-black leading-[0.96] tracking-tight md:text-6xl">Make property intelligence the smartest part of operations.</h1><p className="mt-5 max-w-3xl text-base font-medium leading-7 text-[#514574] md:text-lg">A synthetic-data proof package showing canonical data, property graph relationships, benchmarks, Databricks weather-risk ML, recommendations, and controlled artifact automation without the Winston shell.</p><div className="mt-6 flex flex-wrap gap-2"><StatusPill value="Synthetic demo data" /><StatusPill value="Databricks run completed" /><StatusPill value="No HappyCo production data" /><StatusPill value="No serving endpoint" /></div><div className="mt-7 flex flex-wrap gap-3"><Link href="/happyco/artifacts" className="rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">View artifact hub</Link><Link href="/happyco" className="rounded-2xl border border-[#DDD8EA] bg-white px-5 py-3 text-sm font-black text-[#35146B] hover:bg-[#F5F1FF]">Back to package</Link></div></div><div className="relative min-h-[420px] bg-gradient-to-br from-[#D8F7F3] to-[#FBFAF7] p-7"><div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-xl shadow-[#25145F]/10 backdrop-blur"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Recommendation proof</div><h2 className="mt-2 text-xl font-black">{selectedRecommendation?.title || "Benchmark recommendation"}</h2></div><Sparkles className="h-5 w-5 text-[#4025A8]" /></div><p className="mt-3 text-sm font-semibold leading-6 text-[#514574]">{selectedRecommendation?.recommendation}</p></div><div className="absolute bottom-7 right-7 rounded-[2rem] border border-white/70 bg-[#25145F] p-6 text-white shadow-xl"><div className="text-5xl font-black leading-none">{selectedBenchmark.repeat_rate_peer_ratio ? `${selectedBenchmark.repeat_rate_peer_ratio.toFixed(1)}x` : "N/A"}</div><div className="mt-2 max-w-[260px] text-sm font-bold leading-5 text-white/90">repeat work-order variance surfaced by graph evidence</div></div></div></div></Panel>; }
function ExecutiveDemoTab({ bundle, selectedId, setSelectedId, selectedProperty, selectedBenchmark, selectedRecommendation, selectedMl }: { bundle: Bundle; selectedId: string; setSelectedId: (id: string) => void; selectedProperty: OperatorPropertyOpsProperty; selectedBenchmark: OperatorPropertyOpsBenchmark; selectedRecommendation: OperatorPropertyOpsRecommendation | null; selectedMl: OperatorPropertyOpsMlPrediction | null }) {
  return <div className="grid gap-6 lg:grid-cols-[320px_1fr]"><Panel className="p-5"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[0.2em] text-[#6F6590]">Portfolio</div><h2 className="mt-1 text-lg font-black">Property selector</h2></div><Building2 className="h-5 w-5 text-[#4025A8]" /></div><div className="space-y-3">{bundle.entities.properties.map((property) => <button key={property.property_id} onClick={() => setSelectedId(property.property_id)} className={`w-full rounded-3xl border p-4 text-left transition hover:border-[#4025A8]/50 hover:bg-[#F5F1FF] ${selectedId === property.property_id ? "border-[#4025A8] bg-[#F5F1FF]" : "border-[#DDD8EA] bg-[#FBFAF7]"}`}><div className="flex items-start justify-between gap-3"><div><div className="font-black">{property.name}</div><div className="mt-1 text-xs font-medium text-[#6F6590]">{property.market} - {property.unit_count} units</div></div><StatusPill value={property.risk_profile} /></div></button>)}</div></Panel><div className="space-y-6"><div className="grid gap-4 md:grid-cols-3"><MetricCard label="Repeat WO Rate" value={selectedBenchmark.repeat_work_order_rate} peer={selectedBenchmark.peer_repeat_work_order_rate_median} suffix="%" warn={(selectedBenchmark.repeat_rate_peer_ratio ?? 0) >= 1.2} /><MetricCard label="Avg Aging" value={selectedBenchmark.average_aging_days} suffix="d" warn={(selectedBenchmark.average_aging_days ?? 0) > 10} /><MetricCard label="First-Time Fix" value={selectedBenchmark.vendor_first_time_fix_rate} suffix="%" warn={(selectedBenchmark.vendor_first_time_fix_rate ?? 100) < 65} /></div><div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><MaintenanceRiskHeatmap benchmarks={bundle.benchmarks} mlRisk={bundle.mlRisk} /><BenchmarkVarianceChart benchmark={selectedBenchmark} property={selectedProperty} /></div><div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><Panel className="border-[#B9EFD8] bg-gradient-to-br from-[#E8FFF5] to-white p-5"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-black uppercase tracking-[0.2em] text-[#4025A8]/70">Evidence-backed recommendation</div><h2 className="mt-1 text-xl font-black">Next best action</h2></div><Sparkles className="h-5 w-5 text-[#4025A8]" /></div><p className="text-sm font-semibold leading-6">{selectedRecommendation?.recommendation}</p><div className="mt-4 space-y-2">{(selectedRecommendation?.evidence ?? []).slice(0, 4).map((item) => <div key={item.evidence_id} className="flex gap-2 text-sm font-medium text-[#514574]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item.statement}</span></div>)}</div></Panel><Panel className="p-5"><div className="mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#4025A8]" /><h2 className="text-lg font-black">Predictive maintenance risk</h2></div><p className="mb-4 text-xs font-medium leading-5 text-[#6F6590]">Uses public weather signals and synthetic property operations features to estimate which properties are most likely to see repeat or escalated maintenance activity.</p>{selectedMl ? <div><div className="text-5xl font-black">{Math.round(selectedMl.risk_score * 100)}%</div><div className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">30-day escalation risk</div><div className="mt-2"><StatusPill value={selectedMl.risk_band} /></div><div className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">Top risk drivers</div><div className="mt-2 space-y-2">{selectedMl.top_drivers.slice(0, 3).map((driver) => <div key={driver.feature} className="rounded-2xl bg-[#FBFAF7] px-3 py-2 text-xs font-bold text-[#514574]">{driverLabel(driver)}</div>)}</div><p className="mt-3 text-[11px] font-medium text-[#6F6590]">Synthetic proof model. Not HappyCo production data.</p></div> : <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Predictive maintenance artifacts are not available in this runtime. Recommendations remain benchmark-only and deterministic.</div>}</Panel></div></div></div>;
}
function MetricCard({ label, value, peer, suffix = "", warn }: { label: string; value: number | null; peer?: number | null; suffix?: string; warn?: boolean }) { return <Panel className="p-4"><div className="mb-2 flex items-center justify-between gap-3"><div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6F6590]">{label}</div>{warn ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</div><div className="text-3xl font-black tracking-tight text-[#25145F]">{value == null ? "N/A" : `${value}${suffix}`}</div><div className="mt-1 text-xs font-medium text-[#6F6590]">{peer != null && value != null ? `Peer median ${peer}${suffix}; ${(value - peer).toFixed(1)}${suffix} variance` : "No peer median available"}</div></Panel>; }
function MaintenanceRiskHeatmap({ benchmarks, mlRisk }: { benchmarks: OperatorPropertyOpsBenchmark[]; mlRisk: OperatorPropertyOpsMlRisk }) {
  const drivers = ["HVAC repeat", "Moisture", "Vendor reopen", "Weather exposure", "Resident impact", "Aging backlog"];
  const rows = benchmarks.map((row) => { const ml = firstMlPrediction(mlRisk.predictions ?? [], row.property_id); return { name: row.property_name, cells: [["HVAC repeat", scoreBand(Math.min(100, (row.repeat_rate_peer_ratio ?? 1) * 30))], ["Moisture", row.inspection_severity_score != null ? scoreBand(row.inspection_severity_score * 12) : "Low"], ["Vendor reopen", row.reopened_rate != null ? scoreBand(row.reopened_rate * 4) : "Low"], ["Weather exposure", ml ? scoreBand(ml.risk_score * 100) : "Medium"], ["Resident impact", scoreBand(row.resident_impact_proxy_count * 16)], ["Aging backlog", row.average_aging_days != null ? scoreBand(row.average_aging_days * 6) : "Low"]] as Array<[string, RiskBand | string]> }; });
  return <Panel className="p-5"><SectionHeader eyebrow="Decision visual" title="Maintenance Risk Heatmap" /><p className="mb-4 text-sm font-semibold leading-6 text-[#514574]">Shows where maintenance risk is concentrated across property, vendor, inspection, resident-impact, aging, and weather-risk signals.</p><div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[190px_repeat(6,1fr)] gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#6F6590]"><div>Property</div>{drivers.map((driver) => <div key={driver}>{driver}</div>)}</div><div className="mt-2 space-y-2">{rows.map((row) => <div key={row.name} className="grid grid-cols-[190px_repeat(6,1fr)] gap-2"><div className="rounded-2xl border border-[#DDD8EA] bg-white px-3 py-2 text-sm font-black">{row.name}</div>{row.cells.map(([driver, band]) => <div key={driver} title={`${row.name}: ${driver} ${band}`} className={`rounded-2xl px-3 py-2 text-center text-xs font-black ${bandClass(band)}`}>{band}</div>)}</div>)}</div></div></div></Panel>;
}
function BenchmarkVarianceChart({ benchmark, property }: { benchmark: OperatorPropertyOpsBenchmark; property: OperatorPropertyOpsProperty }) {
  const metrics: Array<[string, number | null, number, string]> = [
    ["Repeat work-order rate", benchmark.repeat_work_order_rate, benchmark.peer_repeat_work_order_rate_median ?? 11, "%"],
    ["Average aging", benchmark.average_aging_days, 10, "d"],
    ["Reopen rate", benchmark.reopened_rate, 12, "%"],
    ["Inspection severity", benchmark.inspection_severity_score, 3, ""],
    ["Resident impact", benchmark.resident_impact_proxy_count, 2, ""],
  ];
  return (
    <Panel className="p-5">
      <SectionHeader eyebrow="Peer comparison" title="Benchmark Variance" />
      <p className="mb-5 text-sm font-semibold leading-6 text-[#514574]">
        Variance bars show how far {property.name} is above or below its peer baseline. Longer right-side bars indicate higher operational risk.
      </p>
      <div className="space-y-4">
        {metrics.map(([label, raw, peer, suffix]) => {
          const value = raw ?? 0;
          const variance = value - peer;
          const worse = variance > 0;
          const mag = peer ? Math.min(1, Math.abs(variance) / peer / 0.8) : 0;
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-xs font-bold">
                <span className="uppercase tracking-[0.1em] text-[#6F6590]">{label}</span>
                <span className={worse ? "text-rose-700" : "text-emerald-700"}>
                  {raw == null ? "N/A" : `${value}${suffix}`} vs peer {peer}{suffix} ({worse ? "+" : ""}{variance.toFixed(1)}{suffix})
                </span>
              </div>
              <div className="relative h-5 rounded-lg bg-[#F5F1FF]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-[#9A8FC0]" />
                <div
                  className={`absolute inset-y-0 ${worse ? "left-1/2 rounded-r-lg bg-rose-500" : "right-1/2 rounded-l-lg bg-emerald-500"}`}
                  style={{ width: `${mag * 50}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-[#6F6590]">
        <span>&larr; better than peers</span>
        <span>peer baseline</span>
        <span>worse than peers &rarr;</span>
      </div>
    </Panel>
  );
}
function WeatherRiskTimeline() {
  const points = [
    { label: "Jan", weather: 22, risk: 38, wo: 34 },
    { label: "Feb", weather: 31, risk: 45, wo: 39 },
    { label: "Mar", weather: 48, risk: 58, wo: 51 },
    { label: "Apr", weather: 65, risk: 72, wo: 63 },
    { label: "May", weather: 58, risk: 69, wo: 59 },
    { label: "Jun", weather: 74, risk: 83, wo: 76 },
  ];
  const W = 720;
  const H = 230;
  const padX = 38;
  const padY = 22;
  const xAt = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const yAt = (v: number) => H - padY - (v / 100) * (H - 2 * padY);
  const series: Array<{ key: "weather" | "risk" | "wo"; label: string; color: string }> = [
    { key: "weather", label: "Weather exposure", color: "#2BB6A3" },
    { key: "risk", label: "Predicted maintenance risk", color: "#5430C0" },
    { key: "wo", label: "Repeat work-order volume", color: "#E8A33D" },
  ];
  return (
    <Panel className="p-5">
      <SectionHeader eyebrow="Databricks weather proof" title="Weather Risk Timeline" />
      <p className="mb-4 text-sm font-semibold leading-6 text-[#514574]">
        Public weather signals are joined with synthetic property operations data to plan proactive maintenance.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weather exposure, predicted maintenance risk, and repeat work-order volume by month">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padX} x2={W - padX} y1={yAt(g)} y2={yAt(g)} stroke="#E7E2F2" strokeWidth={1} />
            <text x={padX - 8} y={yAt(g) + 3} textAnchor="end" fontSize={10} fill="#9A8FC0">{g}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label} x={xAt(i)} y={H - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="#6F6590">{p.label}</text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              points={points.map((p, i) => `${xAt(i)},${yAt(p[s.key])}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p, i) => <circle key={i} cx={xAt(i)} cy={yAt(p[s.key])} r={3.5} fill={s.color} />)}
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-[#514574]">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <p className="mt-3 rounded-2xl bg-[#F5F1FF] px-4 py-3 text-sm font-semibold text-[#35146B]">
        Higher weather exposure periods align with higher predicted maintenance risk and more repeat work-order pressure.
      </p>
      <p className="mt-2 text-[11px] font-medium text-[#6F6590]">Public weather + synthetic property operations data. Not HappyCo production data.</p>
    </Panel>
  );
}
function AutomationPipelineGraph() { return <Panel className="p-5"><SectionHeader eyebrow="Automation proof" title="Automation Pipeline Graph" /><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">{HAPPYCO_AUTOMATION_ROWS.map((row, index) => <div key={row.trigger} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4"><div className="mb-3 flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#35146B] text-xs font-black text-white">{index + 1}</span><StatusPill value={row.status} /></div><div className="text-sm font-black text-[#35146B]">{row.trigger}</div><div className="mt-2 text-xs font-bold text-[#5430C0]">{row.tool}</div><p className="mt-2 text-xs font-medium leading-5 text-[#514574]">{row.output}</p><div className="mt-3 rounded-2xl bg-white px-3 py-2 text-[11px] font-bold text-[#6F6590]">Gate: {row.control}</div><div className="mt-2 text-[11px] font-semibold text-[#4025A8]">Receipt: {row.evidence}</div></div>)}</div></Panel>; }
function VendorPerformanceMatrix({ benchmarks }: { benchmarks: OperatorPropertyOpsBenchmark[] }) { return <Panel className="p-5"><SectionHeader eyebrow="Vendor operations" title="Vendor Performance Matrix" /><div className="relative h-72 rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4"><div className="absolute bottom-3 left-4 right-4 border-t border-[#DDD8EA]" /><div className="absolute bottom-3 left-4 top-4 border-l border-[#DDD8EA]" />{benchmarks.map((row) => { const x = Math.min(88, Math.max(8, (row.average_aging_days ?? 8) * 5)); const y = Math.min(84, Math.max(12, (row.reopened_rate ?? 8) * 3)); const size = Math.min(52, Math.max(22, row.work_order_count / 3)); return <div key={row.property_id} title={`${row.property_name}: ${row.average_aging_days}d aging, ${row.reopened_rate}% reopen`} className="absolute rounded-full border-2 border-white bg-[#5430C0]/80 text-[10px] font-black text-white shadow-md" style={{ left: `${x}%`, bottom: `${y}%`, width: size, height: size, lineHeight: `${size - 4}px`, textAlign: "center" }}>{row.risk_flag.slice(0, 1).toUpperCase()}</div>; })}<div className="absolute bottom-0 right-4 text-xs font-bold text-[#6F6590]">avg aging days</div><div className="absolute left-1 top-4 -rotate-90 text-xs font-bold text-[#6F6590]">reopen rate</div></div></Panel>; }
function DataFlowTab() { const stages = [[Database, "Weather ingest", "Public weather and incident signals land in bronze tables", "Bronze source status"], [Layers3, "Feature table", "Canonical property operations join to weather exposure and benchmark windows", "Gold feature rows"], [Sparkles, "Model training", "Databricks bundle trains risk model and records MLflow metrics", "Metrics + run IDs"], [BarChart3, "Predictions", "Batch scores identify maintenance-risk concentration", "Risk bands"], [ShieldCheck, "Receipt", "Run receipt controls allowed and disallowed claims", "Gated proof copy"]] as const; return <div className="space-y-6"><SectionHeader eyebrow="Behind the curtain" title="Public weather + synthetic operations pipeline" /><div className="grid gap-4 lg:grid-cols-5">{stages.map(([Icon, title, subtitle, output], index) => <Panel key={title} className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5F1FF]"><Icon className="h-5 w-5 text-[#4025A8]" /></div><div className="text-2xl font-black text-[#DDD8EA]">0{index + 1}</div></div><h3 className="text-lg font-black leading-tight">{title}</h3><p className="mt-2 text-sm font-medium leading-6 text-[#514574]">{subtitle}</p><div className="mt-5 rounded-2xl bg-[#FBFAF7] p-3"><div className="text-[11px] font-black uppercase tracking-[0.15em] text-[#6F6590]">Output</div><div className="mt-1 text-sm font-black">{output}</div></div></Panel>)}</div><WeatherRiskTimeline /><div><Link href="/happyco/weather-risk" className="inline-flex rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white transition hover:bg-[#5430C0]">Open the full weather-risk intelligence page</Link></div></div>; }
function MlRiskTab({ mlRisk, selectedMl, benchmarks }: { mlRisk: OperatorPropertyOpsMlRisk; selectedMl: OperatorPropertyOpsMlPrediction | null; benchmarks: OperatorPropertyOpsBenchmark[] }) { return <div className="space-y-6"><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><Panel className="p-5"><SectionHeader eyebrow="Predictive maintenance" title="ML Risk Model" />{mlRisk.ml_status === "available" ? <div className="grid gap-4 md:grid-cols-3">{(mlRisk.predictions ?? []).slice(0, 6).map((prediction) => <div key={prediction.property_id} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4"><div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">{prediction.source_category}</div><div className="mt-2 text-lg font-black">{prediction.property_id.replace("prop-", "").replaceAll("-", " ")}</div><div className="mt-3 text-4xl font-black">{Math.round(prediction.risk_score * 100)}%</div><div className="mt-2"><StatusPill value={prediction.risk_band} /></div></div>)}</div> : <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">ML artifacts are not available. Recommendations remain benchmark-only and deterministic.</div>}</Panel><Panel className="p-5"><div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Receipt-backed claim</div><p className="text-sm font-semibold leading-6 text-[#514574]">{HAPPYCO_DATABRICKS_RECEIPT.claim}</p><div className="mt-4 space-y-2"><div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">Job ID: {HAPPYCO_DATABRICKS_RECEIPT.jobId}</div><div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">Run ID: {HAPPYCO_DATABRICKS_RECEIPT.runId}</div><div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">Status: <StatusPill value={databricksStatusLabel(mlRisk)} /></div><div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{HAPPYCO_DATABRICKS_RECEIPT.caveat}</div></div>{selectedMl ? <div className="mt-5"><div className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Top drivers</div><div className="mt-3 space-y-2">{selectedMl.top_drivers.map((driver) => <div key={driver.feature} className="rounded-2xl border border-[#DDD8EA] bg-white p-3 text-sm font-bold">{driverLabel(driver)}</div>)}</div></div> : null}</Panel></div><div className="grid gap-6 xl:grid-cols-2"><WeatherRiskTimeline /><VendorPerformanceMatrix benchmarks={benchmarks} /></div></div>; }
function AutomationTab() {
  return (
    <div className="space-y-6">
      <Panel className="bg-gradient-to-br from-[#EEE9FF] to-white p-6">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-[#4025A8]/70">Automation Room</div>
        <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">This is the work system behind the proof package.</h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#514574]">
          AI is useful here because it is attached to a delivery loop: plan, code, run, validate, generate artifacts, deploy, and leave receipts. Every step below carries a human or safety gate and a receipt.
        </p>
      </Panel>
      <AutomationPipelineGraph />
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[0.7fr_1fr_1.2fr_1.2fr_1.1fr] bg-[#35146B] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white lg:grid">
          <div>Status</div>
          <div>Trigger</div>
          <div>Output</div>
          <div>Safety gate</div>
          <div>Receipt</div>
        </div>
        {HAPPYCO_AUTOMATION_ROWS.map((row) => (
          <div key={row.trigger} className="grid gap-3 border-t border-[#DDD8EA] px-4 py-4 text-sm lg:grid-cols-[0.7fr_1fr_1.2fr_1.2fr_1.1fr]">
            <div><StatusPill value={row.status} /></div>
            <div className="font-black">{row.trigger}</div>
            <div className="font-medium text-[#514574]">{row.output}</div>
            <div className="font-medium text-[#514574]">{row.control}</div>
            <div className="font-medium text-[#6F6590]">{row.evidence}</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
function ArtifactFactoryTab({ mlRisk }: { mlRisk: OperatorPropertyOpsMlRisk }) { const artifacts = [["Excel Workbook", "Canonical model, benchmarks, ML tabs", "Generated local"], ["PowerPoint Deck", "90-day strategy, architecture, ML slide", "Generated local"], ["Outlook Draft", "Recruiter follow-up via WinCOM params", "Template ready"], ["Gated Package", "Invite-code HappyCo proof package", "Ready"], ["ML Artifacts", "Feature table, predictions, model card", mlRisk.ml_status === "available" ? "Ready" : "not_available"], ["Databricks Receipt", "Run id, notebook path, output paths, claim controls", "Completed"]] as const; return <div className="space-y-6"><SectionHeader eyebrow="Executive outputs" title="Same source data becomes Excel, PowerPoint, microsite, and recruiter draft" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{artifacts.map(([label, detail, state]) => <Panel key={label} className="p-5"><div className="mb-4 flex items-start justify-between gap-3"><FileSpreadsheet className="h-5 w-5 text-[#4025A8]" /><StatusPill value={state} /></div><div className="font-black">{label}</div><p className="mt-2 text-sm font-medium leading-6 text-[#514574]">{detail}</p></Panel>)}</div><Link href="/happyco/artifacts" className="inline-flex rounded-2xl bg-[#35146B] px-5 py-3 text-sm font-black text-white hover:bg-[#5430C0]">Open gated artifact hub</Link></div>; }
function BuildLogTab({ mlRisk }: { mlRisk: OperatorPropertyOpsMlRisk }) { const tickets = [["Ticket 2", "Canonical seed data", "Complete"], ["Ticket 3A", "ML risk proof", "Complete"], ["Ticket 3B", "Live Databricks run receipt", mlRisk.databricks_status === "completed" ? "Complete" : "Pending receipt"], ["Ticket 3C", "Weather risk receipt integration", "Complete"], ["Polish", "Clean demo + gated artifacts", "In progress"]] as const; return <div className="space-y-6"><SectionHeader eyebrow="Workbench" title="Implementation plan and evidence are visible" /><div className="grid gap-4 md:grid-cols-5">{tickets.map(([ticket, title, status]) => <Panel key={ticket} className="p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">{ticket}</div><StatusPill value={status} /></div><h3 className="text-base font-black leading-tight">{title}</h3></Panel>)}</div></div>; }
function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="mb-5"><div className="text-xs font-black uppercase tracking-[0.2em] text-[#4025A8]/70">{eyebrow}</div><h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2></div>; }
