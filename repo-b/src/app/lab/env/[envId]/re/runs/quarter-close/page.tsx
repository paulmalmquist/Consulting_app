"use client";

import { useEffect, useState } from "react";
import {
  listReV1Funds,
  listReV2Scenarios,
  listReV2Runs,
  runReV2QuarterClose,
  RepeFund,
  ReV2Scenario,
  ReV2RunProvenance,
  ReV2QuarterCloseResult,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function pickCurrentQuarter(): string {
  const d = new Date();
  const q = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `${d.getUTCFullYear()}Q${q}`;
}

export default function ReQuarterClosePage() {
  const { envId, businessId } = useReEnv();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [scenarios, setScenarios] = useState<ReV2Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [runs, setRuns] = useState<ReV2RunProvenance[]>([]);
  const [quarter, setQuarter] = useState(pickCurrentQuarter());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReV2QuarterCloseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    Promise.all([
      listReV2Scenarios(selectedFundId).catch(() => []),
      listReV2Runs(selectedFundId, quarter).catch(() => []),
    ]).then(([sc, rn]) => {
      setScenarios(sc);
      setRuns(rn);
      const base = sc.find((s: ReV2Scenario) => s.is_base);
      if (base) setSelectedScenarioId(base.scenario_id);
    });
  }, [selectedFundId, quarter]);

  const handleRunQuarterClose = async () => {
    if (!selectedFundId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runReV2QuarterClose(selectedFundId, {
        quarter,
        scenario_id: selectedScenarioId || undefined,
        run_waterfall: true,
      });
      setResult(res);
      listReV2Runs(selectedFundId, quarter)
        .then(setRuns)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quarter close failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading...</div>;
  }

  return (
    <section className="space-y-5" data-testid="re-quarter-close-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quarter Close Run Center</h1>
        <p className="mt-1 text-sm text-bm-muted2">Execute quarter close, view run status and provenance</p>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
              data-testid="qc-fund-select"
            >
              <option value="">Select fund</option>
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Quarter
            <input
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              placeholder="2026Q1"
              data-testid="qc-quarter-input"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Scenario
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              data-testid="qc-scenario-select"
            >
              <option value="">Default (Base)</option>
              {scenarios.map((s) => (
                <option key={s.scenario_id} value={s.scenario_id}>
                  {s.name}{s.is_base ? " (Base)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRunQuarterClose}
              disabled={running || !selectedFundId}
              className="w-full rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
              data-testid="run-quarter-close-btn"
            >
              {running ? "Running..." : "Run Quarter Close"}
            </button>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            result.status === "success"
              ? "border-green-500/50 bg-green-500/10"
              : "border-red-500/50 bg-red-500/10"
          }`}
          data-testid="qc-result"
        >
          <p className="font-medium">Quarter Close: {result.status}</p>
          {result.status === "success" && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-bm-muted2">Assets Processed</p>
                <p className="font-medium">{result.assets_processed}</p>
              </div>
              <div>
                <p className="text-xs text-bm-muted2">JVs Processed</p>
                <p className="font-medium">{result.jvs_processed}</p>
              </div>
              <div>
                <p className="text-xs text-bm-muted2">Investments</p>
                <p className="font-medium">{result.investments_processed}</p>
              </div>
              <div>
                <p className="text-xs text-bm-muted2">Run ID</p>
                <p className="font-mono text-xs truncate">{result.run_id}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Run History</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-bm-muted2">No runs for this quarter yet.</p>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-2 font-medium">Run ID</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Triggered By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {runs.map((r) => (
                  <tr key={r.provenance_id} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-2 font-mono text-xs">{r.run_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">{r.run_type}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "success" ? "bg-green-500/20 text-green-300" :
                        r.status === "failed" ? "bg-red-500/20 text-red-300" :
                        "bg-yellow-500/20 text-yellow-300"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{r.started_at?.slice(0, 19).replace("T", " ")}</td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{r.triggered_by || "api"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
