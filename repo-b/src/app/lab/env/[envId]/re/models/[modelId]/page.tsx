"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import {
  Play,
  CheckCircle2,
  Archive,
  ChevronRight,
  Settings2,
  BarChart3,
  Target,
  Layers,
  Activity,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────── */

interface ReModel {
  model_id: string;
  fund_id: string;
  name: string;
  description: string | null;
  status: string;
  strategy_type: string | null;
  created_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface ReModelScope {
  id: string;
  model_id: string;
  scope_type: string;
  scope_node_id: string;
  include: boolean;
  created_at: string;
}

interface ReModelOverride {
  id: string;
  model_id: string;
  scope_node_type: string;
  scope_node_id: string;
  key: string;
  value_type: string;
  value_decimal: number | null;
  value_int: number | null;
  value_text: string | null;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

/* ── API helpers ───────────────────────────────────────────────── */

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getModel(modelId: string): Promise<ReModel> {
  return apiFetch(`/api/re/v2/models/${modelId}`);
}

async function patchModel(modelId: string, body: { status?: string }): Promise<ReModel> {
  return apiFetch(`/api/re/v2/models/${modelId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listModelScope(modelId: string): Promise<ReModelScope[]> {
  return apiFetch(`/api/re/v2/models/${modelId}/scope`);
}

async function addModelScope(modelId: string, body: { scope_type: string; scope_node_id: string }): Promise<ReModelScope> {
  return apiFetch(`/api/re/v2/models/${modelId}/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listModelOverrides(modelId: string): Promise<ReModelOverride[]> {
  return apiFetch(`/api/re/v2/models/${modelId}/overrides`);
}

async function setModelOverride(modelId: string, body: Record<string, unknown>): Promise<ReModelOverride> {
  return apiFetch(`/api/re/v2/models/${modelId}/overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ── Types & Components ────────────────────────────────────────── */

interface Asset {
  asset_id: string;
  name: string;
  sector?: string;
  state?: string;
  fund_id?: string;
}

function ScopeTab({
  modelId,
  scope,
  onScopeChange,
}: {
  modelId: string;
  scope: ReModelScope[];
  onScopeChange: (scope: ReModelScope[]) => void;
}) {
  const { envId } = useReEnv();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  useEffect(() => {
    if (!envId) return;
    setLoadingAssets(true);
    fetch(`/api/re/v2/assets?env_id=${envId}&limit=500`)
      .then((res) => res.json())
      .then((data) => {
        setAssets(Array.isArray(data) ? data : []);
      })
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false));
  }, [envId]);

  const handleToggleEntity = async (entityId: string) => {
    const isScoped = scope.some((e) => e.scope_node_id === entityId);
    try {
      if (isScoped) {
        // Remove from scope
        await fetch(
          `/api/re/v2/models/${modelId}/scope/${entityId}`,
          { method: "DELETE" }
        );
        onScopeChange(scope.filter((e) => e.scope_node_id !== entityId));
      } else {
        // Add to scope
        const result = await addModelScope(modelId, {
          scope_type: "asset",
          scope_node_id: entityId,
        });
        onScopeChange([...scope, result]);
      }
    } catch (err) {
      console.error("Failed to toggle entity:", err);
    }
  };

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Entity Scope</h2>
          <p className="text-sm text-bm-muted2 mt-1">
            {scope.length} entities in scope
          </p>
        </div>
      </div>

      {loadingAssets ? (
        <p className="text-sm text-bm-muted2">Loading assets...</p>
      ) : assets.length === 0 ? (
        <p className="text-sm text-bm-muted2">No assets available in this environment.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {assets.map((asset) => {
            const isSelected = scope.some((e) => e.scope_node_id === asset.asset_id);
            return (
              <div
                key={asset.asset_id}
                className="flex items-center gap-3 rounded-lg border border-bm-border/50 bg-bm-surface/10 p-3 hover:bg-bm-surface/20 transition"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleEntity(asset.asset_id)}
                  className="rounded border-bm-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-bm-text truncate">
                    {asset.name}
                  </p>
                  <p className="text-xs text-bm-muted2 mt-0.5">
                    {asset.sector && `${asset.sector}`}
                    {asset.state && ` · ${asset.state}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────── */

const TABS = [
  { key: "overview", label: "Overview", icon: Layers },
  { key: "scope", label: "Scope", icon: Target },
  { key: "assumptions", label: "Assumptions", icon: Settings2 },
  { key: "fund-impact", label: "Fund Impact", icon: BarChart3 },
  { key: "monte-carlo", label: "Monte Carlo", icon: Activity },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ── Component ─────────────────────────────────────────────────── */

export default function ModelWorkspacePage() {
  const params = useParams();
  const modelId = params.modelId as string;
  const { envId } = useReEnv();

  const [model, setModel] = useState<ReModel | null>(null);
  const [scope, setScope] = useState<ReModelScope[]>([]);
  const [overrides, setOverrides] = useState<ReModelOverride[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Override form state
  const [ovKey, setOvKey] = useState("");
  const [ovValue, setOvValue] = useState("");
  const [ovScope, setOvScope] = useState("fund");
  const [ovNodeId, setOvNodeId] = useState("");
  const [ovReason, setOvReason] = useState("");

  // Monte Carlo state
  const [mcSims, setMcSims] = useState(1000);
  const [mcSeed, setMcSeed] = useState(42);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcResult, setMcResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!modelId || !envId) return;
    setLoading(true);
    Promise.allSettled([
      getModel(modelId),
      listModelScope(modelId).catch(() => []),
      listModelOverrides(modelId).catch(() => []),
      fetch(`/api/re/v2/assets?env_id=${envId}&limit=500`).then(r => r.json()).catch(() => []),
    ]).then(([modelRes, scopeRes, overridesRes, assetsRes]) => {
      if (modelRes.status === "fulfilled") setModel(modelRes.value);
      else setError("Failed to load model");
      if (scopeRes.status === "fulfilled") setScope(scopeRes.value as ReModelScope[]);
      if (overridesRes.status === "fulfilled") setOverrides(overridesRes.value as ReModelOverride[]);
      if (assetsRes.status === "fulfilled") setAssets(Array.isArray(assetsRes.value) ? assetsRes.value : []);
      setLoading(false);
    });
  }, [modelId, envId]);

  const handleStatusChange = async (newStatus: string) => {
    if (!modelId) return;
    try {
      const updated = await patchModel(modelId, { status: newStatus });
      setModel(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update model");
    }
  };

  const handleAddOverride = async () => {
    if (!modelId || !ovKey.trim() || !ovValue.trim()) return;
    try {
      const created = await setModelOverride(modelId, {
        scope_node_type: ovScope,
        scope_node_id: ovNodeId || model?.fund_id,
        key: ovKey.trim(),
        value_type: "decimal",
        value_decimal: parseFloat(ovValue),
        reason: ovReason.trim() || undefined,
      });
      setOverrides((prev) => [...prev, created]);
      setOvKey("");
      setOvValue("");
      setOvReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add override");
    }
  };

  const handleRunModel = async () => {
    if (!modelId) return;
    if (scope.length === 0) {
      setError(
        "Cannot run model: Add at least one asset or investment to scope before running. Use the Scope tab to add entities."
      );
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/re/v2/models/${modelId}/run`, { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(error || "Failed to run model");
        return;
      }
      // On success, refresh data or show completion message
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run model");
    }
  };

  const handleRunMonteCarlo = async () => {
    if (!modelId) return;
    if (scope.length === 0) {
      setError("Cannot run Monte Carlo: Add at least one entity to scope first.");
      return;
    }
    try {
      setMcRunning(true);
      setError(null);
      const res = await fetch(`/api/re/v2/models/${modelId}/monte-carlo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulations: mcSims, seed: mcSeed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(data.error || "Monte Carlo simulation failed");
        return;
      }
      const result = await res.json();
      setMcResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Monte Carlo simulation failed");
    } finally {
      setMcRunning(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading model...</div>;
  }

  if (!model) {
    return <div className="p-6 text-sm text-red-300">Model not found.</div>;
  }

  return (
    <section className="space-y-5" data-testid="model-workspace">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-bm-muted2 mb-1">
            <span>Models</span>
            <ChevronRight size={12} />
            <span>{model.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
          {model.description && (
            <p className="mt-1 text-sm text-bm-muted2">{model.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
            model.status === "approved"
              ? "bg-green-500/10 text-green-400 border border-green-500/30"
              : model.status === "archived"
                ? "bg-bm-surface/40 text-bm-muted2 border border-bm-border/50"
                : "bg-bm-accent/10 text-bm-accent border border-bm-accent/30"
          }`}>
            {model.status}
          </span>
          {model.status === "draft" && (
            <button
              onClick={() => handleStatusChange("approved")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              <CheckCircle2 size={12} /> Approve
            </button>
          )}
          {model.status !== "archived" && (
            <button
              onClick={() => handleStatusChange("archived")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
            >
              <Archive size={12} /> Archive
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setError(null); setActiveTab(tab.key); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === tab.key
                  ? "bg-bm-surface/50 text-bm-text font-medium"
                  : "text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
              <p className="text-xs text-bm-muted2 uppercase tracking-wider">Strategy</p>
              <p className="text-lg font-semibold mt-1">{model.strategy_type || "equity"}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
              <p className="text-xs text-bm-muted2 uppercase tracking-wider">In Scope</p>
              <p className="text-lg font-semibold mt-1">{scope.length} entities</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
              <p className="text-xs text-bm-muted2 uppercase tracking-wider">Overrides</p>
              <p className="text-lg font-semibold mt-1">{overrides.length}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
              <p className="text-xs text-bm-muted2 uppercase tracking-wider">Created</p>
              <p className="text-lg font-semibold mt-1">{new Date(model.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRunModel}
              disabled={scope.length === 0}
              aria-disabled={scope.length === 0}
              title={scope.length === 0 ? "Add at least one entity in the Scope tab before running" : "Run the model against all scoped entities"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="run-model-btn"
            >
              <Play size={14} /> Run Model
            </button>
            <button
              type="button"
              onClick={handleRunMonteCarlo}
              disabled={scope.length === 0 || mcRunning}
              aria-disabled={scope.length === 0 || mcRunning}
              title={scope.length === 0 ? "Add entities to scope before running Monte Carlo" : "Run Monte Carlo risk simulation"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="run-mc-btn"
            >
              <Activity size={14} /> {mcRunning ? "Running..." : "Run Monte Carlo"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "scope" && (
        <ScopeTab modelId={modelId} scope={scope} onScopeChange={setScope} />
      )}

      {activeTab === "assumptions" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Assumption Overrides</h2>

          {overrides.length > 0 && (
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-2 font-medium">Key</th>
                    <th className="px-4 py-2 font-medium">Scope</th>
                    <th className="px-4 py-2 font-medium text-right">Value</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {overrides.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2 font-mono text-xs">{o.key}</td>
                      <td className="px-4 py-2 text-xs text-bm-muted2">{o.scope_node_type}</td>
                      <td className="px-4 py-2 text-right">{o.value_decimal ?? o.value_int ?? o.value_text ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-bm-muted2">{o.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                placeholder="Key (e.g. exit_cap_rate)"
                value={ovKey}
                onChange={(e) => setOvKey(e.target.value)}
                data-testid="override-key-input"
              />
              <div className="relative">
                <input
                  className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm w-full pr-24"
                  placeholder="e.g. 0.065"
                  value={ovValue}
                  onChange={(e) => setOvValue(e.target.value)}
                  data-testid="override-value-input"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none whitespace-nowrap">
                  decimal (0.065 = 6.5%)
                </span>
              </div>
              <select
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={ovScope}
                onChange={(e) => setOvScope(e.target.value)}
              >
                <option value="fund">Fund</option>
                <option value="investment">Investment</option>
                <option value="jv">JV</option>
                <option value="asset">Asset</option>
              </select>
              <input
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                placeholder="Reason (optional)"
                value={ovReason}
                onChange={(e) => setOvReason(e.target.value)}
              />
              <button
                type="button"
                onClick={handleAddOverride}
                disabled={!ovKey.trim() || !ovValue.trim() || (ovScope === "asset" && !ovNodeId)}
                className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
                data-testid="add-override-btn"
              >
                Add Override
              </button>
            </div>

            {ovScope === "asset" && (
              <div>
                <label className="text-xs uppercase tracking-[0.12em] text-bm-muted2 block mb-2">
                  Select Asset
                </label>
                <select
                  className="w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                  value={ovNodeId}
                  onChange={(e) => setOvNodeId(e.target.value)}
                >
                  <option value="">Choose an asset from scope...</option>
                  {scope.map((s) => {
                    if (s.scope_type !== "asset") return null;
                    const asset = assets.find((a) => a.asset_id === s.scope_node_id);
                    return (
                      <option key={s.scope_node_id} value={s.scope_node_id}>
                        {asset?.asset_name || s.scope_node_id.slice(0, 8)}...{" "}
                        {asset?.state && `(${asset.state})`}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "fund-impact" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
          <BarChart3 size={32} className="mx-auto text-bm-muted2 mb-3" />
          <h3 className="text-lg font-semibold">Fund Impact</h3>
          <p className="text-sm text-bm-muted2 mt-1">
            Run the model to see side-by-side comparison of Base vs Model results.
          </p>
          <button
            onClick={handleRunModel}
            disabled={scope.length === 0}
            aria-disabled={scope.length === 0}
            title={scope.length === 0 ? "Add at least one entity in the Scope tab before running" : "Run the model against all scoped entities"}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="run-model-impact-btn"
          >
            <Play size={14} /> Run Model
          </button>
        </div>
      )}

      {activeTab === "monte-carlo" && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
          <Activity size={32} className="mx-auto text-bm-muted2 mb-3" />
          <h3 className="text-lg font-semibold">Monte Carlo Risk Analysis</h3>
          <p className="text-sm text-bm-muted2 mt-1">
            Run a Monte Carlo simulation to generate risk distributions and key percentiles.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <label className="text-xs text-bm-muted2">
              Simulations
              <input
                type="number"
                value={mcSims}
                onChange={(e) => setMcSims(parseInt(e.target.value) || 1000)}
                min={100}
                max={10000}
                className="ml-2 w-24 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
                data-testid="mc-sims-input"
              />
            </label>
            <label className="text-xs text-bm-muted2">
              Seed
              <input
                type="number"
                value={mcSeed}
                onChange={(e) => setMcSeed(parseInt(e.target.value) || 42)}
                className="ml-2 w-20 rounded-lg border border-bm-border bg-bm-surface px-2 py-1 text-sm"
                data-testid="mc-seed-input"
              />
            </label>
            <button
              type="button"
              onClick={handleRunMonteCarlo}
              disabled={scope.length === 0 || mcRunning}
              aria-disabled={scope.length === 0 || mcRunning}
              title={scope.length === 0 ? "Add entities to scope before running" : "Run Monte Carlo risk simulation"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="run-mc-btn"
            >
              <Play size={14} /> {mcRunning ? "Running..." : "Run Monte Carlo"}
            </button>
          </div>
          {mcResult && (
            <div className="mt-4 rounded-xl border border-bm-border/70 bg-bm-surface/30 p-4 text-left">
              <h4 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-2">Simulation Results</h4>
              <pre className="text-xs text-bm-text overflow-x-auto">{JSON.stringify(mcResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}
