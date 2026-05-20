"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Layers3,
  Mail,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  getOperatorPropertyOpsBenchmarks,
  getOperatorPropertyOpsEntities,
  getOperatorPropertyOpsGraph,
  getOperatorPropertyOpsMlRisk,
  getOperatorPropertyOpsRecommendations,
  type OperatorPropertyOpsBenchmark,
  type OperatorPropertyOpsDriver,
  type OperatorPropertyOpsEntities,
  type OperatorPropertyOpsGraph,
  type OperatorPropertyOpsMlPrediction,
  type OperatorPropertyOpsMlRisk,
  type OperatorPropertyOpsProperty,
  type OperatorPropertyOpsRecommendation,
  type OperatorPropertyOpsRecommendations,
} from "@/lib/bos-api";

type TabId = "demo" | "flow" | "ml" | "automation" | "artifacts" | "build";

type Bundle = {
  entities: OperatorPropertyOpsEntities;
  graph: OperatorPropertyOpsGraph;
  benchmarks: OperatorPropertyOpsBenchmark[];
  recommendations: OperatorPropertyOpsRecommendations;
  mlRisk: OperatorPropertyOpsMlRisk;
};

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
  if (lower.includes("high") || lower.includes("blocked") || lower.includes("not_available")) {
    return "border-rose-300 bg-rose-50 text-rose-800";
  }
  if (
    lower.includes("medium") ||
    lower.includes("review") ||
    lower.includes("planned") ||
    lower.includes("draft") ||
    lower.includes("not_run")
  ) {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }
  if (lower.includes("low") || lower.includes("ready") || lower.includes("available") || lower.includes("complete")) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800";
  }
  return "border-violet-200 bg-violet-50 text-violet-900";
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(value)}`}>
      {value}
    </span>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`rounded-3xl border border-[#DDD8EA] bg-white shadow-sm ${className}`}>{children}</section>;
}

function MetricCard({
  label,
  value,
  peer,
  suffix = "",
  warn,
}: {
  label: string;
  value: number | null;
  peer?: number | null;
  suffix?: string;
  warn?: boolean;
}) {
  return (
    <Panel className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6F6590]">{label}</div>
        {warn ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </div>
      <div className="text-3xl font-black tracking-tight text-[#25145F]">
        {value == null ? "N/A" : `${value}${suffix}`}
      </div>
      {peer != null && value != null ? (
        <div className="mt-1 text-xs font-medium text-[#6F6590]">
          Peer median {peer}
          {suffix} · {value - peer >= 0 ? "+" : ""}
          {(value - peer).toFixed(1)}
          {suffix} variance
        </div>
      ) : (
        <div className="mt-1 text-xs font-medium text-[#6F6590]">No peer median available</div>
      )}
    </Panel>
  );
}

function firstRecommendation(
  recommendations: OperatorPropertyOpsRecommendation[],
  propertyId: string,
): OperatorPropertyOpsRecommendation | null {
  return recommendations.find((row) => row.property_id === propertyId) ?? null;
}

function firstMlPrediction(
  predictions: OperatorPropertyOpsMlPrediction[],
  propertyId: string,
): OperatorPropertyOpsMlPrediction | null {
  return predictions.find((row) => row.property_id === propertyId) ?? null;
}

function driverLabel(driver: OperatorPropertyOpsDriver) {
  return driver.feature.replaceAll("_", " ").replaceAll("__", ": ");
}

function databricksStatusLabel(mlRisk: OperatorPropertyOpsMlRisk) {
  if (mlRisk.databricks_status === "completed") return "Databricks run completed";
  if (mlRisk.databricks_status === "attempted_failed") return "Databricks attempted_failed";
  if (mlRisk.databricks_status === "not_configured") return "Databricks not_configured";
  return "Databricks not_run";
}

export function PropertyOpsIntelligencePage({ envId }: { envId: string }) {
  const { businessId } = useDomainEnv();
  const [activeTab, setActiveTab] = useState<TabId>("demo");
  const [selectedId, setSelectedId] = useState("prop-parkline-commons");
  const [query, setQuery] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [entities, graph, benchmarks, recommendations, mlRisk] = await Promise.all([
          getOperatorPropertyOpsEntities(envId, businessId || undefined),
          getOperatorPropertyOpsGraph(envId, businessId || undefined),
          getOperatorPropertyOpsBenchmarks(envId, businessId || undefined),
          getOperatorPropertyOpsRecommendations(envId, businessId || undefined),
          getOperatorPropertyOpsMlRisk(envId, businessId || undefined),
        ]);
        if (!cancelled) {
          setBundle({
            entities,
            graph,
            benchmarks: benchmarks.benchmarks,
            recommendations,
            mlRisk,
          });
          setSelectedId((prev) => entities.properties.some((row) => row.property_id === prev) ? prev : entities.properties[0]?.property_id || prev);
        }
      } catch (exc) {
        if (!cancelled) setError(exc instanceof Error ? exc.message : "Unable to load HappyCo property ops demo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId]);

  const selectedProperty = useMemo<OperatorPropertyOpsProperty | null>(
    () => bundle?.entities.properties.find((row) => row.property_id === selectedId) ?? null,
    [bundle, selectedId],
  );
  const selectedBenchmark = useMemo<OperatorPropertyOpsBenchmark | null>(
    () => bundle?.benchmarks.find((row) => row.property_id === selectedId) ?? null,
    [bundle, selectedId],
  );
  const selectedRecommendation = useMemo<OperatorPropertyOpsRecommendation | null>(
    () => firstRecommendation(bundle?.recommendations.recommendations ?? [], selectedId),
    [bundle, selectedId],
  );
  const selectedMl = useMemo<OperatorPropertyOpsMlPrediction | null>(
    () => firstMlPrediction(bundle?.mlRisk.predictions ?? [], selectedId),
    [bundle, selectedId],
  );
  const resolutionRows = useMemo(
    () => (bundle?.entities.entity_resolution ?? []).filter((row) =>
      `${row.source_system} ${row.source_label} ${row.canonical_label} ${row.match_reason}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    [bundle, query],
  );

  if (loading) {
    return (
      <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-8 text-[#25145F]">
        <div className="text-sm font-black uppercase tracking-[0.2em] text-[#4025A8]">HappyCo proof package</div>
        <h1 className="mt-2 text-3xl font-black">Loading Property Ops Intelligence...</h1>
      </div>
    );
  }

  if (error || !bundle || !selectedProperty || !selectedBenchmark) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-900">
        <div className="text-sm font-black uppercase tracking-[0.2em]">Unavailable</div>
        <h1 className="mt-2 text-3xl font-black">HappyCo demo data is not available</h1>
        <p className="mt-3 text-sm font-semibold">{error || "The property ops payload did not include a selected property."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen rounded-[2rem] bg-[#FBFAF7] text-[#25145F]">
      <div className="border-b border-[#DDD8EA] bg-gradient-to-r from-[#D8F7F3] via-[#B9EFD8] to-[#A7E3C8] px-6 py-3 text-center text-sm font-black">
        HappyCo Head of Data proof package · Synthetic demo · Gated artifact strategy
      </div>

      <div className="space-y-6 p-5 lg:p-6">
        <Panel className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-7 md:p-9">
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <div className="text-2xl font-black tracking-tight">HAPPYCO</div>
                <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#6F6590]">
                  <span>Canonical model</span>
                  <span>Property graph</span>
                  <span>ML-ready</span>
                </div>
              </div>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.1em]">Property Ops Intelligence Graph</div>
              <h1 className="max-w-3xl text-4xl font-black leading-[0.96] tracking-tight md:text-6xl">
                Make property intelligence the smartest part of operations.
              </h1>
              <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-[#514574] md:text-lg">
                A role-specific proof showing fragmented property operations data becoming canonical entities,
                graph relationships, benchmarks, controlled recommendations, and ML-ready risk scores.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <StatusPill value="Synthetic demo data" />
                <StatusPill value={bundle.mlRisk.databricks_status === "completed" ? "Databricks run completed" : "Databricks-ready"} />
                <StatusPill value="No fake export success" />
                <StatusPill value={bundle.mlRisk.ml_status === "available" ? "ML ready" : "ML not_available"} />
              </div>
            </div>
            <div className="relative min-h-[360px] bg-gradient-to-br from-[#D8F7F3] to-[#FBFAF7] p-7">
              <div className="absolute right-7 top-7 rounded-full border border-[#4025A8]/20 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.18em]">
                /operator/property-ops-intelligence
              </div>
              <div className="mt-20 rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-xl shadow-[#25145F]/10 backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div className="font-black">Recommendation proof</div>
                  <Sparkles className="h-5 w-5 text-[#4025A8]" />
                </div>
                <p className="text-sm font-semibold leading-6 text-[#514574]">
                  {selectedRecommendation?.title || "Benchmark-only recommendation loaded from deterministic evidence."}
                </p>
              </div>
              <div className="absolute bottom-7 right-7 rounded-[2rem] border border-white/70 bg-[#25145F]/90 p-6 text-white shadow-xl">
                <div className="text-5xl font-black leading-none">
                  {selectedBenchmark.repeat_rate_peer_ratio ? `${selectedBenchmark.repeat_rate_peer_ratio.toFixed(1)}x` : "N/A"}
                </div>
                <div className="mt-2 max-w-[230px] text-sm font-bold leading-5 text-white/90">
                  repeat work-order variance surfaced by graph evidence
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="sticky top-0 z-10 rounded-3xl border border-[#DDD8EA] bg-white/90 p-2 shadow-sm backdrop-blur">
          <div className="grid gap-2 md:grid-cols-6">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-black transition ${
                  activeTab === id ? "bg-[#4025A8] text-white shadow-md shadow-[#4025A8]/20" : "text-[#25145F] hover:bg-[#F5F1FF]"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "demo" && (
          <ExecutiveDemoTab
            bundle={bundle}
            selectedBenchmark={selectedBenchmark}
            selectedMl={selectedMl}
            selectedProperty={selectedProperty}
            selectedRecommendation={selectedRecommendation}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            query={query}
            setQuery={setQuery}
            resolutionRows={resolutionRows}
          />
        )}
        {activeTab === "flow" && <DataFlowTab />}
        {activeTab === "ml" && <MlRiskTab mlRisk={bundle.mlRisk} selectedMl={selectedMl} />}
        {activeTab === "automation" && <AutomationTab />}
        {activeTab === "artifacts" && <ArtifactFactoryTab mlRisk={bundle.mlRisk} />}
        {activeTab === "build" && <BuildLogTab />}
      </div>
    </div>
  );
}

function ExecutiveDemoTab({
  bundle,
  selectedProperty,
  selectedBenchmark,
  selectedRecommendation,
  selectedMl,
  selectedId,
  setSelectedId,
  query,
  setQuery,
  resolutionRows,
}: {
  bundle: Bundle;
  selectedProperty: OperatorPropertyOpsProperty;
  selectedBenchmark: OperatorPropertyOpsBenchmark;
  selectedRecommendation: OperatorPropertyOpsRecommendation | null;
  selectedMl: OperatorPropertyOpsMlPrediction | null;
  selectedId: string;
  setSelectedId: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  resolutionRows: OperatorPropertyOpsEntities["entity_resolution"];
}) {
  const relationshipRail = [
    ["Operator", "Property", "manages"],
    ["Property", "Building", "contains"],
    ["Building", "Unit", "contains"],
    ["Unit", "Inspection", "inspected by"],
    ["Inspection", "Finding", "generates"],
    ["Finding", "Work Order", "creates"],
    ["Work Order", "Vendor", "assigned to"],
    ["Vendor", "Resolution", "resolves"],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr_380px]">
      <Panel className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#6F6590]">Portfolio</div>
            <h2 className="mt-1 text-lg font-black">Property Selector</h2>
          </div>
          <Building2 className="h-5 w-5 text-[#4025A8]" />
        </div>
        <div className="space-y-3">
          {bundle.entities.properties.map((property) => (
            <button
              key={property.property_id}
              onClick={() => setSelectedId(property.property_id)}
              className={`w-full rounded-3xl border p-4 text-left transition hover:border-[#4025A8]/50 hover:bg-[#F5F1FF] ${
                selectedId === property.property_id ? "border-[#4025A8] bg-[#F5F1FF]" : "border-[#DDD8EA] bg-[#FBFAF7]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black">{property.name}</div>
                  <div className="mt-1 text-xs font-medium text-[#6F6590]">
                    {property.market} · {property.unit_count} units
                  </div>
                </div>
                <StatusPill value={property.risk_profile} />
              </div>
              <div className="mt-3 text-xs font-medium text-[#6F6590]">{property.peer_group}</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel className="p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#6F6590]">Canonical graph</div>
              <h2 className="mt-1 text-xl font-black">{selectedProperty.name}</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-[#514574]">{selectedProperty.story}</p>
            </div>
            <StatusPill value={selectedBenchmark.risk_flag} />
          </div>
          <div className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
            <div className="grid gap-3">
              {relationshipRail.map(([from, to, rel]) => (
                <div key={`${from}-${to}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="rounded-2xl border border-[#DDD8EA] bg-white px-3 py-2 text-sm font-bold">{from}</div>
                  <div className="text-center text-[11px] font-black uppercase tracking-[0.14em] text-[#6F6590]">{rel}</div>
                  <div className="rounded-2xl border border-[#DDD8EA] bg-white px-3 py-2 text-sm font-bold">{to}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-xs font-semibold text-[#6F6590]">
            Graph payload: {bundle.graph.nodes.length} nodes · {bundle.graph.edges.length} edges
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Repeat WO Rate"
            value={selectedBenchmark.repeat_work_order_rate}
            peer={selectedBenchmark.peer_repeat_work_order_rate_median}
            suffix="%"
            warn={(selectedBenchmark.repeat_rate_peer_ratio ?? 0) >= 1.2}
          />
          <MetricCard label="Avg Aging" value={selectedBenchmark.average_aging_days} suffix="d" warn={(selectedBenchmark.average_aging_days ?? 0) > 10} />
          <MetricCard label="First-Time Fix" value={selectedBenchmark.vendor_first_time_fix_rate} suffix="%" warn={(selectedBenchmark.vendor_first_time_fix_rate ?? 100) < 65} />
        </div>

        <Panel className="p-5">
          <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#6F6590]">Entity resolution</div>
              <h2 className="mt-1 text-lg font-black">Messy source records → canonical entities</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6F6590]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search records"
                className="w-full rounded-2xl border border-[#DDD8EA] bg-[#FBFAF7] py-2 pl-9 pr-3 text-sm font-medium outline-none focus:border-[#4025A8] md:w-56"
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#DDD8EA]">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F1FF] text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">
                <tr>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Source Record</th>
                  <th className="px-4 py-3 text-left">Canonical</th>
                  <th className="px-4 py-3 text-left">Confidence</th>
                  <th className="px-4 py-3 text-left">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD8EA] bg-white">
                {resolutionRows.slice(0, 8).map((row) => (
                  <tr key={row.source_record_id}>
                    <td className="px-4 py-3 font-bold">{row.source_system}</td>
                    <td className="px-4 py-3 font-medium text-[#514574]">{row.source_label}</td>
                    <td className="px-4 py-3 font-black">{row.canonical_label}</td>
                    <td className="px-4 py-3 font-bold">{Math.round(row.match_confidence * 100)}%</td>
                    <td className="px-4 py-3">
                      <StatusPill value={row.requires_human_review ? "Needs review" : "Resolved"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel className="border-[#B9EFD8] bg-gradient-to-br from-[#E8FFF5] to-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#4025A8]/70">Evidence-backed recommendation</div>
              <h2 className="mt-1 text-xl font-black">Next Best Action</h2>
            </div>
            <Sparkles className="h-5 w-5 text-[#4025A8]" />
          </div>
          <p className="text-sm font-semibold leading-6">{selectedRecommendation?.recommendation}</p>
          <div className="mt-4 rounded-3xl border border-[#DDD8EA] bg-white/80 p-4">
            <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Evidence</div>
            <div className="space-y-2">
              {(selectedRecommendation?.evidence ?? []).map((item) => (
                <div key={item.evidence_id} className="flex gap-2 text-sm font-medium text-[#514574]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item.statement}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-[#DDD8EA] bg-white/80 p-3">
              <div className="text-xs font-bold text-[#6F6590]">Confidence</div>
              <div className="mt-1 text-2xl font-black">{Math.round((selectedRecommendation?.confidence ?? 0) * 100)}%</div>
            </div>
            <div className="rounded-3xl border border-amber-300 bg-amber-50 p-3">
              <div className="text-xs font-bold text-amber-800">Control</div>
              <div className="mt-1 text-sm font-black text-amber-800">
                {selectedRecommendation?.human_review_required ? "Human review required" : "Monitor only"}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#4025A8]" />
            <h2 className="text-lg font-black">ML Risk Signal</h2>
          </div>
          {selectedMl ? (
            <div>
              <div className="text-5xl font-black">{Math.round(selectedMl.risk_score * 100)}%</div>
              <div className="mt-2"><StatusPill value={selectedMl.risk_band} /></div>
              <div className="mt-4 space-y-2">
                {selectedMl.top_drivers.slice(0, 3).map((driver) => (
                  <div key={driver.feature} className="rounded-2xl bg-[#FBFAF7] px-3 py-2 text-xs font-bold text-[#514574]">
                    {driverLabel(driver)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              ML artifacts are not available in this runtime. Recommendations remain benchmark-only and deterministic.
            </div>
          )}
        </Panel>

        <TrustCard />
      </div>
    </div>
  );
}

function DataFlowTab() {
  const stages = [
    [Database, "Bronze operational extracts", "Happy Property, inspections, vendor portal, resident ops, CMMS export", "Raw source records"],
    [Layers3, "Silver canonical records", "Normalize IDs, timestamps, addresses, categories, and source labels", "Canonical entities"],
    [GitBranch, "Entity resolution", "Exact ID, normalized address, fuzzy name, geospatial placeholder, temporal proximity", "Resolved graph keys"],
    [Network, "Gold graph + benchmarks", "Property → unit → inspection → finding → work order → vendor", "Metrics and evidence"],
    [Sparkles, "AI/ML product layer", "Benchmark recommendations and predictive maintenance risk scores", "Next-best actions"],
  ] as const;
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Behind the curtain" title="Data flow from operational chaos to product intelligence" />
      <div className="grid gap-4 lg:grid-cols-5">
        {stages.map(([Icon, title, subtitle, output], index) => (
          <Panel key={title} className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5F1FF]">
                <Icon className="h-5 w-5 text-[#4025A8]" />
              </div>
              <div className="text-2xl font-black text-[#DDD8EA]">0{index + 1}</div>
            </div>
            <h3 className="text-lg font-black leading-tight">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[#514574]">{subtitle}</p>
            <div className="mt-5 rounded-2xl bg-[#FBFAF7] p-3">
              <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[#6F6590]">Output</div>
              <div className="mt-1 text-sm font-black">{output}</div>
            </div>
          </Panel>
        ))}
      </div>
      <Panel className="p-5">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Quality gates", "duplicate detection, stale input checks, category normalization"],
            ["Resolution rules", "exact ID, address, fuzzy name, geospatial placeholder"],
            ["Fail-soft states", "not_available, not_run, attempted_failed, needs review, missing artifact, stale input"],
            ["Product outputs", "APIs, demo page, workbook, deck, microsite, email draft"],
          ].map(([title, text]) => (
            <div key={title} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
              <div className="font-black">{title}</div>
              <div className="mt-2 text-sm font-medium leading-6 text-[#514574]">{text}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MlRiskTab({
  mlRisk,
  selectedMl,
}: {
  mlRisk: OperatorPropertyOpsMlRisk;
  selectedMl: OperatorPropertyOpsMlPrediction | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Panel className="p-5">
        <SectionHeader eyebrow="Predictive maintenance" title="ML Risk Model" />
        {mlRisk.ml_status === "available" ? (
          <div className="grid gap-4 md:grid-cols-3">
            {(mlRisk.predictions ?? []).slice(0, 6).map((prediction) => (
              <div key={prediction.property_id} className="rounded-3xl border border-[#DDD8EA] bg-[#FBFAF7] p-4">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">{prediction.source_category}</div>
                <div className="mt-2 text-lg font-black">{prediction.property_id.replace("prop-", "").replaceAll("-", " ")}</div>
                <div className="mt-3 text-4xl font-black">{Math.round(prediction.risk_score * 100)}%</div>
                <div className="mt-2"><StatusPill value={prediction.risk_band} /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
            ML artifacts are not available. Run the local fallback trainer to populate `artifacts/happyco/ml`, or treat this as a Databricks-ready pattern only.
          </div>
        )}
      </Panel>
      <Panel className="p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Model honesty</div>
        <p className="text-sm font-semibold leading-6 text-[#514574]">
          Synthetic demo model. Do not present accuracy as real-world HappyCo performance. Feature importance and model registry outputs prove the lifecycle pattern.
        </p>
        <div className="mt-4 space-y-2">
          <div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">
            Status: <StatusPill value={mlRisk.ml_status} />
          </div>
          <div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">
            Databricks: <StatusPill value={databricksStatusLabel(mlRisk)} />
          </div>
          {mlRisk.databricks_status === "completed" ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
              Run ID: {mlRisk.databricks_run_id || "recorded"}{" "}
              {mlRisk.databricks_run_url ? (
                <a className="underline" href={mlRisk.databricks_run_url} target="_blank" rel="noreferrer">
                  Open receipt
                </a>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Databricks-ready; live run not yet completed. Do not claim Databricks execution without a successful receipt.
            </div>
          )}
          <div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">
            Accuracy: {String(mlRisk.model_metrics?.accuracy ?? "N/A")}
          </div>
          <div className="rounded-2xl bg-[#FBFAF7] p-3 text-sm font-bold">
            ROC AUC: {String(mlRisk.model_metrics?.roc_auc ?? "N/A")}
          </div>
        </div>
        {selectedMl ? (
          <div className="mt-5">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6590]">Top drivers</div>
            <div className="mt-3 space-y-2">
              {selectedMl.top_drivers.map((driver) => (
                <div key={driver.feature} className="rounded-2xl border border-[#DDD8EA] bg-white p-3 text-sm font-bold">
                  {driverLabel(driver)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function AutomationTab() {
  const rows = [
    ["Recruiter thread", "Outlook WinCOM skill", "Search + summarize", "Read-only", "Requirements brief"],
    ["Demo data update", "Benchmark engine", "Recompute KPIs", "Deterministic tests", "Metric cards + evidence"],
    ["ML proof", "Databricks-ready notebook", "Train local fallback or Databricks job", "Receipt required", "Predictions + model card"],
    ["Artifact request", "Workbook/deck runner", "Generate Excel + PPT", "File validation", "Shareable gated package"],
    ["Follow-up needed", "Outlook draft skill", "Create email draft", "Explicit send gate", "Draft only"],
  ];
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Automation control room" title="Controlled local runners, receipts, and human gates" />
      <Panel className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F1FF] text-xs font-black uppercase tracking-[0.14em] text-[#6F6590]">
            <tr>
              <th className="px-4 py-4 text-left">Trigger</th>
              <th className="px-4 py-4 text-left">Agent / Skill</th>
              <th className="px-4 py-4 text-left">Action</th>
              <th className="px-4 py-4 text-left">Safety Gate</th>
              <th className="px-4 py-4 text-left">Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DDD8EA]">
            {rows.map(([trigger, skill, action, gate, output]) => (
              <tr key={trigger}>
                <td className="px-4 py-4 font-black">{trigger}</td>
                <td className="px-4 py-4 font-bold text-[#4025A8]">{skill}</td>
                <td className="px-4 py-4 font-medium text-[#514574]">{action}</td>
                <td className="px-4 py-4"><StatusPill value={gate} /></td>
                <td className="px-4 py-4 font-bold">{output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ArtifactFactoryTab({ mlRisk }: { mlRisk: OperatorPropertyOpsMlRisk }) {
  const artifacts = [
    [FileSpreadsheet, "Excel Workbook", "Canonical model, benchmarks, ML tabs", "Generated local"],
    [FileText, "PowerPoint Deck", "90-day strategy, architecture, ML slide", "Generated local"],
    [Mail, "Outlook Draft", "Recruiter follow-up via WinCOM params", "Template ready"],
    [Sparkles, "Gated Microsite", "Invite-code HappyCo proof package", "Ready"],
    [Database, "ML Artifacts", "Feature table, predictions, model card", mlRisk.ml_status === "available" ? "Ready" : "not_available"],
    [Sparkles, "Databricks Receipt", "Run id, notebook path, output paths, claim controls", mlRisk.databricks_status === "completed" ? "Completed" : "not_run"],
  ] as const;
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Executive outputs" title="Same source data becomes Excel, PowerPoint, microsite, and recruiter draft" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {artifacts.map(([Icon, label, detail, state]) => (
          <Panel key={label} className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <Icon className="h-5 w-5 text-[#4025A8]" />
              <StatusPill value={state} />
            </div>
            <div className="font-black">{label}</div>
            <p className="mt-2 text-sm font-medium leading-6 text-[#514574]">{detail}</p>
          </Panel>
        ))}
      </div>
      <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm font-semibold text-amber-900">
        Export buttons are intentionally not wired in this page until Tickets 6, 7, and 8 produce verified artifacts. No fake success states.
      </div>
    </div>
  );
}

function BuildLogTab() {
  const tickets = [
    ["Ticket 1", "Plan expansion", "Complete"],
    ["Ticket 2", "Canonical seed data", "Complete"],
    ["Ticket 3A", "ML risk proof", "Complete"],
    ["Ticket 3B", "Live Databricks run receipt", "Pending receipt"],
    ["Ticket 3", "Operator APIs", "Complete"],
    ["Ticket 4", "Frontend demo", "Complete"],
    ["Ticket 6/7", "Excel + PowerPoint", "Complete"],
    ["Ticket 5", "Gated package", "Complete"],
    ["Ticket 8", "Outlook WinCOM", "Template ready"],
  ];
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Workbench" title="Implementation plan and evidence are visible" />
      <div className="grid gap-4 md:grid-cols-4">
        {tickets.map(([ticket, title, status]) => (
          <Panel key={ticket} className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#6F6590]">{ticket}</div>
              <StatusPill value={status} />
            </div>
            <h3 className="text-base font-black leading-tight">{title}</h3>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function TrustCard() {
  return (
    <Panel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-black">Trust Posture</h2>
      </div>
      <div className="space-y-2 text-sm font-medium text-[#514574]">
        <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Synthetic demo data clearly labeled</div>
        <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Evidence tied to source records</div>
        <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Human review for ambiguous merges</div>
        <div className="flex gap-2"><Wrench className="h-4 w-4 text-amber-600" /> Export/send actions gated until wired</div>
      </div>
    </Panel>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-[#4025A8]/70">{eyebrow}</div>
      <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
    </div>
  );
}
