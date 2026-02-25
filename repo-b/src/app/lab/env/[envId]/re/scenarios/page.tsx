"use client";

import { useEffect, useState } from "react";
import {
  listReV1Funds,
  listReV2Scenarios,
  createReV2Scenario,
  listReV2Overrides,
  setReV2Override,
  RepeFund,
  ReV2Scenario,
  ReV2Override,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

export default function ReScenariosPage() {
  const { envId, businessId } = useReEnv();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [overrides, setOverrides] = useState<ReV2Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"stress" | "upside" | "downside" | "custom">("custom");
  const [overrideKey, setOverrideKey] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideScope, setOverrideScope] = useState("fund");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId && !envId) return;
    listReV1Funds({ env_id: envId, business_id: businessId || undefined })
      .then((rows) => {
        setFunds(rows);
        if (rows[0]) setSelectedFundId(rows[0].fund_id);
      })
      .catch(() => setFunds([]))
      .finally(() => setLoading(false));
  }, [businessId, envId]);

  useEffect(() => {
    if (!selectedFundId) return;
    listReV2Scenarios(selectedFundId)
      .then((rows) => {
        setScenarios(rows);
        if (rows[0]) setSelectedScenarioId(rows[0].scenario_id);
      })
      .catch(() => setScenarios([]));
  }, [selectedFundId]);

  useEffect(() => {
    if (!selectedScenarioId) return;
    listReV2Overrides(selectedScenarioId)
      .then(setOverrides)
      .catch(() => setOverrides([]));
  }, [selectedScenarioId]);

  const handleCreateScenario = async () => {
    if (!selectedFundId || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const baseScenario = scenarios.find((s) => s.is_base);
      const created = await createReV2Scenario(selectedFundId, {
        name: newName.trim(),
        scenario_type: newType,
        parent_scenario_id: baseScenario?.scenario_id,
      });
      setScenarios((prev) => [...prev, created]);
      setSelectedScenarioId(created.scenario_id);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario");
    } finally {
      setCreating(false);
    }
  };

  const handleAddOverride = async () => {
    if (!selectedScenarioId || !overrideKey.trim() || !overrideValue.trim()) return;
    setError(null);
    try {
      const created = await setReV2Override(selectedScenarioId, {
        scope_node_type: overrideScope,
        scope_node_id: selectedFundId,
        key: overrideKey.trim(),
        value_type: "decimal",
        value_decimal: parseFloat(overrideValue),
        reason: "Manual override",
      });
      setOverrides((prev) => [...prev, created]);
      setOverrideKey("");
      setOverrideValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add override");
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading scenarios...</div>;
  }

  return (
    <section className="space-y-5" data-testid="re-scenarios-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scenario Management</h1>
          <p className="mt-1 text-sm text-bm-muted2">Create scenarios, add overrides, and run quarter-close</p>
        </div>
      </div>

      {/* Fund Selector */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
          >
            <option value="">Select fund</option>
            {funds.map((f) => (
              <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Scenarios List */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Scenarios</h2>
        {scenarios.length === 0 ? (
          <p className="text-sm text-bm-muted2">No scenarios for this fund.</p>
        ) : (
          <div className="space-y-2">
            {scenarios.map((s) => (
              <button
                key={s.scenario_id}
                type="button"
                onClick={() => setSelectedScenarioId(s.scenario_id)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                  selectedScenarioId === s.scenario_id
                    ? "border-bm-accent/60 bg-bm-accent/10"
                    : "border-bm-border/60 hover:bg-bm-surface/40"
                }`}
                data-testid={`scenario-item-${s.scenario_id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-bm-muted2">
                    {s.scenario_type}{s.is_base ? " (Base)" : ""} · {s.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Scenario */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Create Scenario</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            placeholder="Scenario name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="scenario-name-input"
          />
          <select
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={newType}
            onChange={(e) => setNewType(e.target.value as typeof newType)}
            data-testid="scenario-type-select"
          >
            <option value="stress">Stress</option>
            <option value="upside">Upside</option>
            <option value="downside">Downside</option>
            <option value="custom">Custom</option>
          </select>
          <button
            type="button"
            onClick={handleCreateScenario}
            disabled={creating || !newName.trim() || !selectedFundId}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
            data-testid="create-scenario-btn"
          >
            {creating ? "Creating..." : "Create Scenario"}
          </button>
        </div>
      </div>

      {/* Overrides */}
      {selectedScenarioId && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Overrides for {scenarios.find((s) => s.scenario_id === selectedScenarioId)?.name || "Selected Scenario"}
          </h2>

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
                      <td className="px-4 py-2 text-right">{o.value_decimal ?? "—"}</td>
                      <td className="px-4 py-2 text-xs text-bm-muted2">{o.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              placeholder="Override key (e.g. cap_rate)"
              value={overrideKey}
              onChange={(e) => setOverrideKey(e.target.value)}
              data-testid="override-key-input"
            />
            <input
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              placeholder="Value (decimal)"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              data-testid="override-value-input"
            />
            <select
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={overrideScope}
              onChange={(e) => setOverrideScope(e.target.value)}
            >
              <option value="fund">Fund</option>
              <option value="investment">Investment</option>
              <option value="jv">JV</option>
              <option value="asset">Asset</option>
            </select>
            <button
              type="button"
              onClick={handleAddOverride}
              disabled={!overrideKey.trim() || !overrideValue.trim()}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
              data-testid="add-override-btn"
            >
              Add Override
            </button>
          </div>
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
