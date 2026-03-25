"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getModel,
  approveReV2Model,
  listModelScenarios,
  createModelScenario,
  cloneModelScenario,
  listScenarioAssets,
  addScenarioAsset,
  removeScenarioAsset,
  listAvailableAssets,
  listScenarioOverrides,
  setScenarioOverride,
  resetScenarioOverrides,
  runScenario,
  getModelRun,
  compareScenarios,
  ReV2Model,
  ModelScenario,
  ScenarioAsset,
  AvailableAsset,
  ScenarioOverride,
  ScenarioRunResult,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

import { fmtMoney } from '@/lib/format-utils';
const TABS = ["Scope", "Assumptions", "Results", "Fund Impact"] as const;
type Tab = (typeof TABS)[number];

const OVERRIDE_KEYS = [
  { key: "revenue_delta_pct", label: "Revenue Delta (%)", min: -50, max: 50, step: 0.5 },
  { key: "expense_delta_pct", label: "Expense Delta (%)", min: -50, max: 50, step: 0.5 },
  { key: "noi_override", label: "NOI Override ($)", min: 0, max: 10000000, step: 1000 },
  { key: "capex_override", label: "Capex ($)", min: 0, max: 5000000, step: 1000 },
  { key: "amort_delta_pct", label: "Amortization Delta (%)", min: -50, max: 50, step: 0.5 },
] as const;

type ScenarioSummaryValue = string | number | null | undefined;
type ScenarioSummaryByFundEntry = Record<string, ScenarioSummaryValue>;
type ScenarioSummary = Record<string, unknown> & {
  asset_count?: ScenarioSummaryValue;
  total_noi_cash?: ScenarioSummaryValue;
  total_noi_gaap?: ScenarioSummaryValue;
  avg_noi_cash_per_asset?: ScenarioSummaryValue;
  avg_noi_gaap_per_asset?: ScenarioSummaryValue;
  total_revenue?: ScenarioSummaryValue;
  by_fund?: Record<string, ScenarioSummaryByFundEntry>;
};

/* ── Scope Tab ─────────────────────────────────────────────── */
function ScopeTab({
  scenarioId,
  envId,
}: {
  scenarioId: string;
  envId?: string | null;
}) {
  const [inScope, setInScope] = useState<ScenarioAsset[]>([]);
  const [available, setAvailable] = useState<AvailableAsset[]>([]);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listScenarioAssets(scenarioId),
      listAvailableAssets(scenarioId, envId || undefined),
    ])
      .then(([scope, avail]) => {
        setInScope(scope);
        setAvailable(avail);
      })
      .finally(() => setLoading(false));
  }, [scenarioId, envId]);

  useEffect(() => { load(); }, [load]);

  const fundNames = [...new Set(available.map((a) => a.fund_name || "Unknown"))];

  const filteredAvailable = available.filter((a) => {
    if (fundFilter !== "All" && a.fund_name !== fundFilter) return false;
    if (search && !(a.asset_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleAdd(asset: AvailableAsset) {
    await addScenarioAsset(scenarioId, {
      asset_id: asset.asset_id,
      source_fund_id: asset.source_fund_id || undefined,
      source_investment_id: asset.source_investment_id || undefined,
    });
    load();
  }

  async function handleRemove(assetId: string) {
    await removeScenarioAsset(scenarioId, assetId);
    load();
  }

  if (loading) return <div className="py-8 text-center text-bm-muted2">Loading assets...</div>;

  return (
    <div className="space-y-6">
      {/* In Scope */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
          In Scope ({inScope.length} assets)
        </h3>
        {inScope.length === 0 ? (
          <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-6 text-center text-bm-muted2">
            No assets selected. Add assets from the available list below.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2">Fund</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {inScope.map((a) => (
                  <tr key={a.asset_id} className="border-b border-bm-border/30">
                    <td className="px-4 py-2 font-medium">{a.asset_name || a.asset_id}</td>
                    <td className="px-4 py-2">{a.fund_name || "—"}</td>
                    <td className="px-4 py-2 capitalize">{a.asset_type || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleRemove(a.asset_id)}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Available Assets */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
          Available Assets
        </h3>
        <div className="mb-3 flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
            placeholder="Search assets..."
          />
          <select
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
          >
            <option value="All">All Funds</option>
            {fundNames.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        {filteredAvailable.length === 0 ? (
          <p className="text-sm text-bm-muted2">No available assets match your filters.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-bm-border/70">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bm-surface/50">
                <tr className="border-b border-bm-border/50 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2">Fund</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAvailable.map((a) => (
                  <tr key={a.asset_id} className="border-b border-bm-border/30 hover:bg-bm-surface/20">
                    <td className="px-4 py-2">{a.asset_name || a.asset_id}</td>
                    <td className="px-4 py-2">{a.fund_name || "—"}</td>
                    <td className="px-4 py-2 capitalize">{a.asset_type || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleAdd(a)}
                        className="rounded bg-bm-accent/20 px-2 py-1 text-xs text-bm-accent hover:bg-bm-accent/30"
                      >
                        + Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Assumptions Tab ──────────────────────────────────────── */
function AssumptionsTab({
  scenarioId,
  onRun,
}: {
  scenarioId: string;
  onRun: () => void;
}) {
  const [assets, setAssets] = useState<ScenarioAsset[]>([]);
  const [overrides, setOverrides] = useState<ScenarioOverride[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listScenarioAssets(scenarioId),
      listScenarioOverrides(scenarioId),
    ])
      .then(([a, o]) => {
        setAssets(a);
        setOverrides(o);
        if (a.length > 0 && !selectedAsset) {
          setSelectedAsset(a[0].asset_id);
        }
      })
      .finally(() => setLoading(false));
  }, [scenarioId, selectedAsset]);

  useEffect(() => { load(); }, [load]);

  // Build current values from overrides for selected asset
  useEffect(() => {
    if (!selectedAsset) return;
    const assetOverrides = overrides.filter(
      (o) => o.scope_type === "asset" && o.scope_id === selectedAsset
    );
    const vals: Record<string, number | null> = {};
    for (const ok of OVERRIDE_KEYS) {
      const found = assetOverrides.find((o) => o.key === ok.key);
      vals[ok.key] = found ? Number(found.value_json) : null;
    }
    setLocalOverrides(vals);
  }, [selectedAsset, overrides]);

  async function handleSave() {
    if (!selectedAsset) return;
    setSaving(true);
    try {
      for (const ok of OVERRIDE_KEYS) {
        const val = localOverrides[ok.key];
        if (val !== null && val !== undefined) {
          await setScenarioOverride(scenarioId, {
            scope_type: "asset",
            scope_id: selectedAsset,
            key: ok.key,
            value_json: val,
          });
        }
      }
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleResetAsset() {
    if (!selectedAsset) return;
    // Delete all overrides for this asset
    const assetOverrides = overrides.filter(
      (o) => o.scope_type === "asset" && o.scope_id === selectedAsset
    );
    for (const o of assetOverrides) {
      await fetch(`/api/re/v2/scenario-overrides/${o.id}`, { method: "DELETE" });
    }
    load();
  }

  async function handleResetScenario() {
    await resetScenarioOverrides(scenarioId);
    load();
  }

  if (loading) return <div className="py-8 text-center text-bm-muted2">Loading assumptions...</div>;
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-8 text-center text-bm-muted2">
        Add assets to the scenario scope before editing assumptions.
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Left: Asset list */}
      <div className="w-64 shrink-0">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-bm-muted2">
          Assets
        </h4>
        <div className="space-y-1">
          {assets.map((a) => {
            const hasOverrides = overrides.some(
              (o) => o.scope_type === "asset" && o.scope_id === a.asset_id
            );
            return (
              <button
                key={a.asset_id}
                onClick={() => setSelectedAsset(a.asset_id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedAsset === a.asset_id
                    ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                    : "hover:bg-bm-surface/30 border border-transparent"
                }`}
              >
                <div className="font-medium">{a.asset_name || a.asset_id.slice(0, 8)}</div>
                <div className="text-xs text-bm-muted2">
                  {a.fund_name || "—"}
                  {hasOverrides && " • Modified"}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-2">
          <button
            onClick={handleResetScenario}
            className="w-full rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
          >
            Reset All Overrides
          </button>
        </div>
      </div>

      {/* Right: Override editor */}
      <div className="flex-1">
        {selectedAsset ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-semibold">
                {assets.find((a) => a.asset_id === selectedAsset)?.asset_name || "Asset"}
              </h4>
              <button
                onClick={handleResetAsset}
                className="rounded px-2 py-1 text-xs text-bm-muted2 hover:bg-bm-surface/40"
              >
                Reset to Base
              </button>
            </div>
            <div className="space-y-4">
              {OVERRIDE_KEYS.map((ok) => (
                <div key={ok.key}>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-bm-muted2">
                    {ok.label}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={ok.min}
                      max={ok.max}
                      step={ok.step}
                      value={localOverrides[ok.key] ?? 0}
                      onChange={(e) =>
                        setLocalOverrides((p) => ({
                          ...p,
                          [ok.key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="flex-1"
                    />
                    <input
                      type="number"
                      step={ok.step}
                      value={localOverrides[ok.key] ?? ""}
                      onChange={(e) =>
                        setLocalOverrides((p) => ({
                          ...p,
                          [ok.key]:
                            e.target.value === "" ? null : parseFloat(e.target.value),
                        }))
                      }
                      className="w-28 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm text-right"
                    />
                    <span className="w-6 text-xs text-bm-muted2">
                      {ok.key.includes("pct") ? "%" : "$"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-bm-muted2">Select an asset to edit assumptions</div>
        )}

        {/* Sticky action bar */}
        <div className="mt-4 flex justify-end gap-3 rounded-xl border border-bm-border/50 bg-bm-surface/20 p-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={onRun}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white hover:bg-bm-accent/90"
          >
            Run Scenario
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Results Tab ─────────────────────────────────────────── */
function ResultsTab({ scenarioId }: { scenarioId: string }) {
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [noiMode, setNoiMode] = useState<"cash" | "gaap">("cash");

  useEffect(() => {
    fetch(`/api/re/v2/model-scenarios/${scenarioId}/run`, { method: "POST" })
      .then(() => {
        // Load latest run data - for now show a re-fetch of the run
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Try to load the latest run
    listScenarioOverrides(scenarioId)
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, [scenarioId]);

  // Load run results from recent runs
  useEffect(() => {
    setLoading(true);
    // Attempt to get latest run by running the scenario
    runScenario(scenarioId)
      .then((result) => {
        if (result.summary) {
          setRunResult(result.summary as Record<string, unknown>);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scenarioId]);

  if (loading) return <div className="py-8 text-center text-bm-muted2">Running scenario...</div>;

  if (!runResult) {
    return (
      <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-8 text-center text-bm-muted2">
        No results yet. Run the scenario from the Assumptions tab.
      </div>
    );
  }

  const summary = runResult as ScenarioSummary;
  const byFund = summary.by_fund;

  return (
    <div className="space-y-6">
      {/* NOI Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setNoiMode("cash")}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            noiMode === "cash" ? "bg-bm-accent text-white" : "border border-bm-border hover:bg-bm-surface/30"
          }`}
        >
          Cash NOI
        </button>
        <button
          onClick={() => setNoiMode("gaap")}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            noiMode === "gaap" ? "bg-bm-accent text-white" : "border border-bm-border hover:bg-bm-surface/30"
          }`}
        >
          GAAP NOI
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Assets", value: String(summary.asset_count ?? 0) },
          {
            label: noiMode === "cash" ? "Total Cash NOI" : "Total GAAP NOI",
            value: fmtMoney(
              Number(noiMode === "cash" ? summary.total_noi_cash : summary.total_noi_gaap)
            ),
          },
          {
            label: noiMode === "cash" ? "Avg Cash NOI / Asset" : "Avg GAAP NOI / Asset",
            value: fmtMoney(
              Number(
                noiMode === "cash"
                  ? summary.avg_noi_cash_per_asset
                  : summary.avg_noi_gaap_per_asset
              )
            ),
          },
          { label: "Total Revenue", value: fmtMoney(Number(summary.total_revenue ?? 0)) },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3"
          >
            <p className="text-xs uppercase tracking-wider text-bm-muted2">{c.label}</p>
            <p className="text-lg font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* By Fund Breakdown */}
      {byFund ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
            By Fund
          </h4>
          <div className="overflow-x-auto rounded-xl border border-bm-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2">Fund</th>
                  <th className="px-4 py-2 text-right">Assets</th>
                  <th className="px-4 py-2 text-right">Cash NOI</th>
                  <th className="px-4 py-2 text-right">GAAP NOI</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byFund).map(
                  ([fundId, data]) => (
                    <tr key={fundId} className="border-b border-bm-border/30">
                      <td className="px-4 py-2 font-medium">
                        {typeof data.fund_name === "string" ? data.fund_name : fundId}
                      </td>
                      <td className="px-4 py-2 text-right">{String(data.asset_count ?? 0)}</td>
                      <td className="px-4 py-2 text-right">
                        {fmtMoney(Number(data.noi_cash ?? 0))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {fmtMoney(Number(data.noi_gaap ?? 0))}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Fund Impact Tab ──────────────────────────────────────── */
function FundImpactTab({ scenarioId }: { scenarioId: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-6">
        <h4 className="mb-2 font-semibold">Fund Impact Analysis</h4>
        <p className="text-sm text-bm-muted2">
          Fund impact metrics including IRR, TVPI, DPI, and NAV delta require the waterfall
          engine to be connected. Run the scenario first to see results grouped by fund.
        </p>
        <p className="mt-3 text-sm text-bm-muted2">
          View per-fund NOI impact in the Results tab under the &quot;By Fund&quot; section.
        </p>
      </div>
    </div>
  );
}

/* ── Model Detail Page ───────────────────────────────────── */
export default function ModelDetailPage() {
  const params = useParams<{ modelId: string }>();
  const router = useRouter();
  const { envId } = useRepeContext();
  const base = useRepeBasePath();

  const [model, setModel] = useState<ReV2Model | null>(null);
  const [scenarios, setScenarios] = useState<ModelScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Scope");
  const [loading, setLoading] = useState(true);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    if (!params.modelId) return;
    setLoading(true);
    Promise.all([getModel(params.modelId), listModelScenarios(params.modelId)])
      .then(([m, s]) => {
        setModel(m);
        setScenarios(s);
        if (s.length > 0 && !selectedScenario) {
          const base = s.find((sc) => sc.is_base);
          setSelectedScenario(base?.id || s[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [params.modelId, selectedScenario]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    if (!model) return;
    const updated = await approveReV2Model(model.model_id);
    setModel(updated);
  }

  async function handleArchive() {
    if (!model) return;
    const resp = await fetch(`/api/re/v2/models/${model.model_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (resp.ok) {
      const updated = await resp.json();
      setModel(updated);
    }
  }

  async function handleCreateScenario() {
    if (!params.modelId || !newScenarioName.trim()) return;
    const s = await createModelScenario(params.modelId, { name: newScenarioName.trim() });
    setScenarios((prev) => [...prev, s]);
    setSelectedScenario(s.id);
    setShowNewScenario(false);
    setNewScenarioName("");
  }

  async function handleClone() {
    if (!selectedScenario || !cloneName.trim()) return;
    const s = await cloneModelScenario(selectedScenario, cloneName.trim());
    setScenarios((prev) => [...prev, s]);
    setSelectedScenario(s.id);
    setShowClone(false);
    setCloneName("");
  }

  async function handleRun() {
    if (!selectedScenario) return;
    setRunning(true);
    try {
      await runScenario(selectedScenario);
      setTab("Results");
    } finally {
      setRunning(false);
    }
  }

  async function handleCompare() {
    if (!model || scenarios.length < 2) return;
    const ids = scenarios.map((s) => s.id);
    const result = await compareScenarios(model.model_id, ids);
    alert(JSON.stringify(result.comparison, null, 2));
  }

  if (loading || !model) {
    return <div className="py-12 text-center text-bm-muted2">Loading model...</div>;
  }

  const currentScenario = scenarios.find((s) => s.id === selectedScenario);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push(`${base}/models`)}
              className="mb-1 text-xs text-bm-muted2 hover:text-bm-text"
            >
              &larr; Models
            </button>
            <h2 className="text-lg font-semibold">{model.name}</h2>
            {model.description && (
              <p className="text-sm text-bm-muted2">{model.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                model.status === "approved"
                  ? "bg-green-500/20 text-green-300"
                  : model.status === "archived"
                    ? "bg-red-500/10 text-red-200"
                    : "bg-yellow-500/15 text-yellow-300"
              }`}
            >
              {model.status}
            </span>
            {model.status === "draft" && (
              <button
                onClick={handleApprove}
                className="rounded-lg border border-green-500/50 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/10"
              >
                Approve
              </button>
            )}
            {model.status !== "archived" && (
              <button
                onClick={handleArchive}
                className="rounded-lg border border-bm-border px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/40"
              >
                Archive
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="flex items-center gap-3 rounded-xl border border-bm-border/50 bg-bm-surface/15 px-4 py-3">
        <span className="text-sm font-medium text-bm-muted2">Scenario:</span>
        <select
          value={selectedScenario || ""}
          onChange={(e) => setSelectedScenario(e.target.value)}
          className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.is_base ? "(Base)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowNewScenario(true)}
          className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
        >
          + New Scenario
        </button>
        <button
          onClick={() => setShowClone(true)}
          className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
        >
          Clone
        </button>
        {scenarios.length >= 2 && (
          <button
            onClick={handleCompare}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
          >
            Compare
          </button>
        )}
      </div>

      {/* New Scenario Dialog */}
      {showNewScenario && (
        <div className="flex items-center gap-2 rounded-lg border border-bm-accent/40 bg-bm-surface/20 p-3">
          <input
            value={newScenarioName}
            onChange={(e) => setNewScenarioName(e.target.value)}
            className="flex-1 rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
            placeholder="Scenario name..."
            autoFocus
          />
          <button
            onClick={handleCreateScenario}
            className="rounded-lg bg-bm-accent px-3 py-1.5 text-sm text-white"
          >
            Create
          </button>
          <button
            onClick={() => setShowNewScenario(false)}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Clone Dialog */}
      {showClone && (
        <div className="flex items-center gap-2 rounded-lg border border-bm-accent/40 bg-bm-surface/20 p-3">
          <input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            className="flex-1 rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm"
            placeholder="Clone name..."
            autoFocus
          />
          <button
            onClick={handleClone}
            className="rounded-lg bg-bm-accent px-3 py-1.5 text-sm text-white"
          >
            Clone
          </button>
          <button
            onClick={() => setShowClone(false)}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/50">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition ${
              tab === t
                ? "border-b-2 border-bm-accent font-medium text-bm-text"
                : "text-bm-muted2 hover:text-bm-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedScenario && (
        <div className="min-h-[400px]">
          {tab === "Scope" && <ScopeTab scenarioId={selectedScenario} envId={envId} />}
          {tab === "Assumptions" && (
            <AssumptionsTab scenarioId={selectedScenario} onRun={handleRun} />
          )}
          {tab === "Results" && <ResultsTab scenarioId={selectedScenario} />}
          {tab === "Fund Impact" && <FundImpactTab scenarioId={selectedScenario} />}
        </div>
      )}

      {/* Running indicator */}
      {running && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-bm-accent px-4 py-2 text-sm text-white shadow-lg">
          Running scenario...
        </div>
      )}
    </div>
  );
}
