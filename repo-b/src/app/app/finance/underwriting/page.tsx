"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  UnderwritingReports,
  UnderwritingRun,
  createUnderwritingRun,
  getUnderwritingReports,
  ingestUnderwritingResearch,
  listUnderwritingRuns,
  runUnderwritingScenarios,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

const SAMPLE_RESEARCH_PAYLOAD = `{
  "contract_version": "uw_research_contract_v1",
  "sources": [],
  "extracted_datapoints": [],
  "sale_comps": [],
  "lease_comps": [],
  "market_snapshot": [],
  "unknowns": [],
  "assumption_suggestions": []
}`;

const PROPERTY_TYPES = [
  "multifamily",
  "industrial",
  "office",
  "retail",
  "medical_office",
  "senior_housing",
  "student_housing",
] as const;

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function artifactPreview(artifacts: UnderwritingReports["scenarios"][number]["artifacts"]) {
  const firstMd = Object.values(artifacts).find((artifact) => artifact.content_md)?.content_md;
  if (firstMd) return firstMd;
  const firstJson = Object.values(artifacts).find((artifact) => artifact.content_json)?.content_json;
  return firstJson ? prettyJson(firstJson) : "No artifact content available.";
}

export default function UnderwritingPage() {
  const { businessId } = useBusinessContext();

  const [runs, setRuns] = useState<UnderwritingRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [reports, setReports] = useState<UnderwritingReports | null>(null);
  const [researchJson, setResearchJson] = useState(SAMPLE_RESEARCH_PAYLOAD);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    property_name: "Sample Multifamily Asset",
    property_type: "multifamily" as (typeof PROPERTY_TYPES)[number],
    city: "",
    state_province: "",
    submarket: "",
    gross_area_sf: "125000",
    unit_count: "220",
    occupancy_pct: "0.94",
    in_place_noi_cents: "520000000",
    purchase_price_cents: "8600000000",
  });

  async function refreshRuns() {
    if (!businessId) return;
    const rows = await listUnderwritingRuns(businessId, { limit: 100 });
    setRuns(rows);
    if (!selectedRunId && rows[0]) {
      setSelectedRunId(rows[0].run_id);
    }
  }

  useEffect(() => {
    if (!businessId) return;
    refreshRuns().catch((err) => setError(err instanceof Error ? err.message : "Failed to load runs"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const selectedRun = useMemo(
    () => runs.find((row) => row.run_id === selectedRunId) || null,
    [runs, selectedRunId]
  );

  async function onCreateRun(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating underwriting run...");
    try {
      const created = await createUnderwritingRun({
        business_id: businessId,
        property_name: createForm.property_name,
        property_type: createForm.property_type,
        city: createForm.city || undefined,
        state_province: createForm.state_province || undefined,
        submarket: createForm.submarket || undefined,
        gross_area_sf: Number(createForm.gross_area_sf),
        unit_count: Number(createForm.unit_count),
        occupancy_pct: Number(createForm.occupancy_pct),
        in_place_noi_cents: Number(createForm.in_place_noi_cents),
        purchase_price_cents: Number(createForm.purchase_price_cents),
      });
      setSelectedRunId(created.run_id);
      await refreshRuns();
      setStatus(`Run created: ${created.run_id}`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create run");
    }
  }

  async function onIngestResearch() {
    if (!selectedRunId) return;
    setError(null);
    setStatus("Ingesting research payload...");
    try {
      const payload = JSON.parse(researchJson) as Parameters<typeof ingestUnderwritingResearch>[1];
      const response = await ingestUnderwritingResearch(selectedRunId, payload);
      setWarnings(response.warnings || []);
      await refreshRuns();
      setStatus(`Research ingested (sources=${response.source_count}, warnings=${response.warnings.length}).`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to ingest research");
    }
  }

  async function onRunScenarios() {
    if (!selectedRunId) return;
    setError(null);
    setStatus("Running scenarios...");
    try {
      const response = await runUnderwritingScenarios(selectedRunId, { include_defaults: true });
      await refreshRuns();
      setStatus(`Scenario run complete (${response.scenarios.length} scenarios).`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to run scenarios");
    }
  }

  async function onLoadReports() {
    if (!selectedRunId) return;
    setError(null);
    setStatus("Loading report artifacts...");
    try {
      const response = await getUnderwritingReports(selectedRunId);
      setReports(response);
      setStatus(`Loaded reports for ${response.scenarios.length} scenarios.`);
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to load reports");
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Finance / Underwriting</p>
        <h1 className="text-2xl font-bold">Underwriting Orchestrator v1</h1>
        <p className="text-sm text-bm-muted max-w-3xl">
          Deterministic, citation-aware underwriting pipeline. Facts must be source-backed; uncited values must be assumptions.
        </p>
      </div>

      {!businessId && (
        <div className="rounded-xl border border-bm-border bg-bm-surface p-4 text-sm text-bm-muted2">
          Select a business first to use underwriting.
        </div>
      )}

      {businessId && (
        <>
          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="text-lg font-semibold">Create Run</h2>
            <form className="grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={onCreateRun}>
              <input
                data-testid="uw-create-property-name"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm md:col-span-2"
                value={createForm.property_name}
                onChange={(e) => setCreateForm((v) => ({ ...v, property_name: e.target.value }))}
                placeholder="Property name"
                required
              />
              <select
                data-testid="uw-create-property-type"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.property_type}
                onChange={(e) => setCreateForm((v) => ({ ...v, property_type: e.target.value as (typeof PROPERTY_TYPES)[number] }))}
              >
                {PROPERTY_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                data-testid="uw-create-submarket"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.submarket}
                onChange={(e) => setCreateForm((v) => ({ ...v, submarket: e.target.value }))}
                placeholder="Submarket"
              />
              <input
                data-testid="uw-create-city"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.city}
                onChange={(e) => setCreateForm((v) => ({ ...v, city: e.target.value }))}
                placeholder="City"
              />
              <input
                data-testid="uw-create-state"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.state_province}
                onChange={(e) => setCreateForm((v) => ({ ...v, state_province: e.target.value }))}
                placeholder="State"
              />
              <input
                data-testid="uw-create-gross-sf"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.gross_area_sf}
                onChange={(e) => setCreateForm((v) => ({ ...v, gross_area_sf: e.target.value }))}
                placeholder="Gross SF"
              />
              <input
                data-testid="uw-create-unit-count"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.unit_count}
                onChange={(e) => setCreateForm((v) => ({ ...v, unit_count: e.target.value }))}
                placeholder="Units"
              />
              <input
                data-testid="uw-create-occupancy"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.occupancy_pct}
                onChange={(e) => setCreateForm((v) => ({ ...v, occupancy_pct: e.target.value }))}
                placeholder="Occupancy decimal"
              />
              <input
                data-testid="uw-create-noi-cents"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.in_place_noi_cents}
                onChange={(e) => setCreateForm((v) => ({ ...v, in_place_noi_cents: e.target.value }))}
                placeholder="In-place NOI (cents)"
              />
              <input
                data-testid="uw-create-price-cents"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={createForm.purchase_price_cents}
                onChange={(e) => setCreateForm((v) => ({ ...v, purchase_price_cents: e.target.value }))}
                placeholder="Purchase price (cents)"
              />
              <button
                data-testid="uw-create-run"
                type="submit"
                className="rounded-lg bg-bm-brand px-3 py-2 text-sm text-white"
              >
                Create Run
              </button>
            </form>
          </section>

          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="text-lg font-semibold">Run Workspace</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                data-testid="uw-run-select"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
              >
                <option value="">Select run</option>
                {runs.map((row) => (
                  <option key={row.run_id} value={row.run_id}>
                    {row.property_name} [{row.status}]
                  </option>
                ))}
              </select>
              <button
                data-testid="uw-ingest-research"
                type="button"
                onClick={onIngestResearch}
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                disabled={!selectedRunId}
              >
                Ingest Research
              </button>
              <button
                data-testid="uw-run-scenarios"
                type="button"
                onClick={onRunScenarios}
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                disabled={!selectedRunId}
              >
                Run Scenarios
              </button>
            </div>
            <textarea
              data-testid="uw-research-payload"
              className="w-full min-h-56 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-xs font-mono"
              value={researchJson}
              onChange={(e) => setResearchJson(e.target.value)}
              spellCheck={false}
            />
            {warnings.length > 0 && (
              <div data-testid="uw-citation-warnings" className="rounded-lg border border-amber-600/30 bg-amber-600/10 px-3 py-2 text-xs text-amber-200">
                Warnings: {warnings.join(", ")}
              </div>
            )}
          </section>

          <section className="bm-glass rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reports</h2>
              <button
                data-testid="uw-load-reports"
                type="button"
                onClick={onLoadReports}
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                disabled={!selectedRunId}
              >
                Load Reports
              </button>
            </div>
            {selectedRun && (
              <p className="text-xs text-bm-muted2">
                Selected run: {selectedRun.property_name} ({selectedRun.property_type}) status={selectedRun.status}
              </p>
            )}
            {!reports && <p className="text-sm text-bm-muted2">No report loaded.</p>}
            {reports?.scenarios.map((scenario) => (
              <article
                key={scenario.scenario_id || scenario.name}
                data-testid={`uw-report-${scenario.name.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-lg border border-bm-border bg-bm-surface p-3 space-y-2"
              >
                <p className="text-sm font-medium">
                  {scenario.name} ({scenario.scenario_type || "n/a"}) recommendation={scenario.recommendation || "n/a"}
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                  {artifactPreview(scenario.artifacts)}
                </pre>
              </article>
            ))}
          </section>
        </>
      )}

      {(status || error) && (
        <section className="space-y-2">
          {status && (
            <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-300">
              {status}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
