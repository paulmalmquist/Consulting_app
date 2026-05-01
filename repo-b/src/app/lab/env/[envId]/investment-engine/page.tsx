"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  calcNav,
  calcPnl,
  produceNavSnapshot,
  lockNavSnapshot,
  releaseNavSnapshot,
  reconstructNavSnapshot,
  runReconciliation,
  listReconciliationBreaks,
  listInvFunds,
  listInvAuditTimeline,
  // Wave 1
  calcVar,
  applyScenario,
  calcFactorExposure,
  listInvFactors,
  listInvScenarios,
  listComplianceRules,
  createComplianceRule,
  deactivateComplianceRule,
  evaluatePostTrade,
  listComplianceViolations,
  resolveComplianceViolation,
  type InvEngineError,
  type InvFund,
  type InvNavValue,
  type InvPnlValue,
  type InvReconBreak,
  type InvAuditRow,
  type InvFactor,
  type InvScenario,
  type InvComplianceRule,
  type InvComplianceViolation,
} from "@/lib/bos-api";

type Tab = "nav" | "risk" | "compliance" | "reconciliation" | "audit";

// "Unavailable" placeholder per project_instructions: never show a fake number
function Unavailable({ reason }: { reason?: string }) {
  return (
    <span className="text-amber-500 italic" title={reason || "Unavailable"}>
      Unavailable
    </span>
  );
}

function ErrorList({ errors }: { errors: InvEngineError[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">
      <div className="font-semibold text-red-600 mb-1">Calculation rejected:</div>
      <ul className="list-disc list-inside space-y-1">
        {errors.map((e, i) => (
          <li key={i}>
            <code className="text-xs bg-red-500/15 px-1 rounded">{e.code}</code>{" "}
            {e.message}
            {Object.keys(e.context).length > 0 && (
              <details className="ml-4 mt-1">
                <summary className="text-xs text-red-700/70 cursor-pointer">context</summary>
                <pre className="text-xs mt-1 whitespace-pre-wrap">
                  {JSON.stringify(e.context, null, 2)}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ valid }: { valid: boolean | null }) {
  if (valid === null) return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        valid
          ? "bg-emerald-500/15 text-emerald-700"
          : "bg-red-500/15 text-red-700"
      }`}
    >
      {valid ? "valid" : "invalid"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAV PANEL
// ─────────────────────────────────────────────────────────────────────────────

function NavPanel({ envId, businessId, funds }: { envId: string; businessId?: string; funds: InvFund[] }) {
  const [fundId, setFundId] = useState<string>("");
  const [effDate, setEffDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);
  const [value, setValue] = useState<InvNavValue | null>(null);
  const [errors, setErrors] = useState<InvEngineError[]>([]);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  useEffect(() => {
    if (funds.length > 0 && !fundId) setFundId(funds[0].id);
  }, [funds, fundId]);

  async function onCalculate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSnapshotMsg(null);
    setSnapshotId(null);
    setSnapshotStatus(null);
    try {
      const res = await calcNav(envId, fundId, effDate, businessId);
      setValid(res.valid);
      setValue(res.valid ? res.value : null);
      setErrors(res.errors);
    } catch (err) {
      setValid(false);
      setValue(null);
      setErrors([{ code: "network_error", message: err instanceof Error ? err.message : String(err), context: {} }]);
    } finally {
      setLoading(false);
    }
  }

  async function onProduce() {
    setLoading(true);
    setSnapshotMsg(null);
    try {
      const res = await produceNavSnapshot(envId, fundId, effDate, businessId);
      if (res.valid && res.value) {
        setSnapshotId(res.value.snapshot_id);
        setSnapshotStatus(res.value.status);
        setSnapshotMsg(`Draft snapshot created (v${res.value.version}).`);
      } else {
        setSnapshotMsg(`Produce failed: ${res.errors.map(e => e.code).join(", ")}`);
      }
    } catch (err) {
      setSnapshotMsg(`Produce error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function onLock() {
    if (!snapshotId) return;
    setLoading(true);
    try {
      const res = await lockNavSnapshot(envId, snapshotId, businessId);
      if (res.valid) {
        setSnapshotStatus("locked");
        setSnapshotMsg("Snapshot locked. Reconstruct verified equal.");
      } else {
        setSnapshotMsg(`Lock failed: ${res.errors.map(e => e.code).join(", ")}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onRelease() {
    if (!snapshotId) return;
    setLoading(true);
    try {
      const res = await releaseNavSnapshot(envId, snapshotId, businessId, "ui", "period close");
      if (res.valid) {
        setSnapshotStatus("released");
        setSnapshotMsg("Snapshot released as the authoritative NAV for this (fund, date).");
      } else {
        setSnapshotMsg(`Release failed: ${res.errors.map(e => e.code).join(", ")}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onReconstruct() {
    if (!snapshotId) return;
    setLoading(true);
    try {
      const res = await reconstructNavSnapshot(envId, snapshotId);
      if (res.valid) {
        setSnapshotMsg(
          res.value?.equal
            ? "Reconstruct equal — payload reproduces from pinned inputs."
            : `Reconstruct DIVERGED — ${res.value?.divergences.length} field(s) differ. See diagnostics.`,
        );
      } else {
        setSnapshotMsg(`Reconstruct failed: ${res.errors.map(e => e.code).join(", ")}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">NAV calculation</h2>
        <form onSubmit={onCalculate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Fund</label>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm min-w-[16rem]"
              required
            >
              <option value="" disabled>Select fund…</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.base_currency} · {f.lot_relief_method})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Effective date</label>
            <input
              type="date"
              value={effDate}
              onChange={(e) => setEffDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !fundId}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Calculating…" : "Run calculation"}
          </button>
        </form>
      </div>

      {(valid !== null) && (
        <div className="rounded border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Result</h3>
            <StatusBadge valid={valid} />
          </div>
          <ErrorList errors={errors} />
          {valid && value && (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">NAV</dt>
                <dd className="font-mono text-base">
                  {value.nav} {value.currency}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total assets</dt>
                <dd className="font-mono">{value.total_assets}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total liabilities</dt>
                <dd className="font-mono">{value.total_liabilities}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">As of</dt>
                <dd className="font-mono">{value.as_of_date}</dd>
              </div>
            </dl>
          )}

          {valid && value && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-2">Snapshot lifecycle</h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={onProduce}
                  disabled={loading}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Produce draft
                </button>
                <button
                  onClick={onLock}
                  disabled={loading || !snapshotId || snapshotStatus !== "draft"}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Lock
                </button>
                <button
                  onClick={onRelease}
                  disabled={loading || !snapshotId || snapshotStatus !== "locked"}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Release
                </button>
                <button
                  onClick={onReconstruct}
                  disabled={loading || !snapshotId}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Reconstruct
                </button>
              </div>
              {snapshotId && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Snapshot: <code className="font-mono">{snapshotId}</code>{" "}
                  · status: <code className="font-mono">{snapshotStatus}</code>
                </div>
              )}
              {snapshotMsg && (
                <div className="mt-2 text-sm">{snapshotMsg}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ReconciliationPanel({ envId, businessId }: { envId: string; businessId?: string }) {
  const [runId, setRunId] = useState<string>("");
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [resolvedFilter, setResolvedFilter] = useState<"" | "open" | "resolved">("");
  const [breaks, setBreaks] = useState<InvReconBreak[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<InvEngineError[]>([]);

  async function onRun(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setErrors([]);
    try {
      const res = await runReconciliation(envId, runId, businessId);
      if (res.valid && res.value) {
        setMsg(`Run completed. ${res.value.breaks_count} break(s) detected.`);
      } else {
        setErrors(res.errors);
      }
      await refreshBreaks();
    } finally {
      setLoading(false);
    }
  }

  async function refreshBreaks() {
    const res = await listReconciliationBreaks(envId, {
      runId: runId || undefined,
      breakType: breakTypeFilter || undefined,
      severity: severityFilter || undefined,
      resolved:
        resolvedFilter === "" ? null
        : resolvedFilter === "resolved" ? true
        : false,
      limit: 200,
    });
    if (res.valid && res.value) setBreaks(res.value.breaks);
  }

  useEffect(() => {
    refreshBreaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakTypeFilter, severityFilter, resolvedFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">Run reconciliation</h2>
        <form onSubmit={onRun} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[20rem]">
            <label className="block text-xs text-muted-foreground mb-1">
              Run ID (must already exist in inv_reconciliation_run)
            </label>
            <input
              type="text"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="UUID of the run to execute"
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !runId}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Running…" : "Execute"}
          </button>
        </form>
        {msg && <div className="mt-3 text-sm">{msg}</div>}
        <ErrorList errors={errors} />
      </div>

      <div className="rounded border border-border p-4">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Break type</label>
            <select
              value={breakTypeFilter}
              onChange={(e) => setBreakTypeFilter(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              <option value="quantity_mismatch">Quantity mismatch</option>
              <option value="price_mismatch">Price mismatch</option>
              <option value="missing_in_a">Missing in A</option>
              <option value="missing_in_b">Missing in B</option>
              <option value="stale_data">Stale data</option>
              <option value="identifier_unmapped">Identifier unmapped</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Status</label>
            <select
              value={resolvedFilter}
              onChange={(e) => setResolvedFilter(e.target.value as "" | "open" | "resolved")}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              <option value="open">Open only</option>
              <option value="resolved">Resolved only</option>
            </select>
          </div>
          <button
            onClick={refreshBreaks}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Security</th>
                <th className="py-2 pr-3">A</th>
                <th className="py-2 pr-3">B</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {breaks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No breaks match the current filters.
                  </td>
                </tr>
              ) : (
                breaks.map((b) => (
                  <tr key={b.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-mono text-xs">{b.break_type}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          b.severity === "critical" ? "bg-red-500/15 text-red-700"
                          : b.severity === "high" ? "bg-orange-500/15 text-orange-700"
                          : b.severity === "medium" ? "bg-yellow-500/15 text-yellow-700"
                          : "bg-slate-500/15 text-slate-700"
                        }`}
                      >
                        {b.severity}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {b.account_id ? b.account_id.slice(0, 8) : <Unavailable />}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {b.security_id ? b.security_id.slice(0, 8) : <Unavailable />}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {b.source_a_value ? JSON.stringify(b.source_a_value) : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {b.source_b_value ? JSON.stringify(b.source_b_value) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {b.resolved_at ? "resolved" : "open"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT VIEWER
// ─────────────────────────────────────────────────────────────────────────────

function AuditViewer({ envId }: { envId: string }) {
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");
  const [events, setEvents] = useState<InvAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function refresh() {
    setLoading(true);
    try {
      const res = await listInvAuditTimeline(envId, {
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        limit: 200,
      });
      if (res.valid && res.value) setEvents(res.value.events);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeColors: Record<string, string> = useMemo(() => ({
    insert: "bg-emerald-500/15 text-emerald-700",
    update: "bg-blue-500/15 text-blue-700",
    delete: "bg-red-500/15 text-red-700",
    release: "bg-purple-500/15 text-purple-700",
    supersede: "bg-amber-500/15 text-amber-700",
    void: "bg-slate-500/15 text-slate-700",
    lock: "bg-indigo-500/15 text-indigo-700",
  }), []);

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">Audit timeline</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Entity type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">All</option>
              <option value="inv_nav_snapshot">NAV snapshot</option>
              <option value="inv_pnl_snapshot">P&amp;L snapshot</option>
              <option value="inv_position_valuation">Position valuation</option>
            </select>
          </div>
          <div className="flex-1 min-w-[16rem]">
            <label className="block text-xs text-muted-foreground mb-1">Entity ID (optional)</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="UUID"
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-mono"
            />
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      <div className="rounded border border-border p-4">
        {events.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">No audit events.</div>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const isOpen = !!expanded[e.id];
              return (
                <li key={e.id} className="border-b border-border/50 pb-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))}
                    className="w-full text-left flex items-center gap-3 text-sm hover:bg-accent/50 rounded px-2 py-1"
                  >
                    <span className="text-xs text-muted-foreground font-mono w-44 shrink-0">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${changeColors[e.change_type] || "bg-slate-500/15 text-slate-700"}`}>
                      {e.change_type}
                    </span>
                    <span className="font-mono text-xs">{e.entity_type}</span>
                    <span className="font-mono text-xs text-muted-foreground">{e.entity_id.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{e.actor}</span>
                  </button>
                  {isOpen && (
                    <div className="ml-6 mt-2 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-1">Previous</div>
                        <pre className="bg-muted rounded p-2 overflow-auto whitespace-pre-wrap break-all">
                          {e.previous_state ? JSON.stringify(e.previous_state, null, 2) : "—"}
                        </pre>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">New</div>
                        <pre className="bg-muted rounded p-2 overflow-auto whitespace-pre-wrap break-all">
                          {e.new_state ? JSON.stringify(e.new_state, null, 2) : "—"}
                        </pre>
                      </div>
                      {e.reason && (
                        <div className="col-span-2 text-muted-foreground">
                          Reason: {e.reason}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK PANEL
// ─────────────────────────────────────────────────────────────────────────────

function RiskPanel({ envId, businessId, funds }: { envId: string; businessId?: string; funds: InvFund[] }) {
  const [fundId, setFundId] = useState<string>("");
  const [asOf, setAsOf] = useState<string>(new Date().toISOString().slice(0, 10));
  const [confidence, setConfidence] = useState<string>("95.00");
  const [horizon, setHorizon] = useState<number>(1);
  const [historyDays, setHistoryDays] = useState<number>(252);
  const [loading, setLoading] = useState(false);
  const [varValid, setVarValid] = useState<boolean | null>(null);
  const [varValue, setVarValue] = useState<{ hist: string; param: string; pv: string; ccy: string } | null>(null);
  const [varErrors, setVarErrors] = useState<InvEngineError[]>([]);
  const [scenarios, setScenarios] = useState<InvScenario[]>([]);
  const [scenarioId, setScenarioId] = useState<string>("");
  const [scenarioResult, setScenarioResult] = useState<{ pnl: string; pct: string; ccy: string } | null>(null);
  const [scenarioErrors, setScenarioErrors] = useState<InvEngineError[]>([]);
  const [factors, setFactors] = useState<InvFactor[]>([]);
  const [factorRows, setFactorRows] = useState<Array<{ code: string; name: string; exposure: string }> | null>(null);
  const [factorErrors, setFactorErrors] = useState<InvEngineError[]>([]);

  useEffect(() => { if (funds.length > 0 && !fundId) setFundId(funds[0].id); }, [funds, fundId]);

  useEffect(() => {
    (async () => {
      try {
        const [s, f] = await Promise.all([listInvScenarios(envId), listInvFactors(envId)]);
        if (s.valid && s.value) setScenarios(s.value.scenarios);
        if (f.valid && f.value) setFactors(f.value.factors);
      } catch { /* surfaces as Unavailable on action */ }
    })();
  }, [envId]);

  async function onCalcVar(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await calcVar(envId, fundId, asOf,
        { confidencePct: confidence, horizonDays: horizon, historyWindowDays: historyDays }, businessId);
      setVarValid(res.valid);
      if (res.valid && res.value) {
        setVarValue({ hist: res.value.var_historical_sim_native, param: res.value.var_parametric_native,
                      pv: res.value.portfolio_value_native, ccy: res.value.currency });
        setVarErrors([]);
      } else { setVarValue(null); setVarErrors(res.errors); }
    } finally { setLoading(false); }
  }

  async function onScenario(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setScenarioErrors([]);
    try {
      const res = await applyScenario(envId, fundId, asOf, scenarioId, businessId);
      if (res.valid && res.value) {
        setScenarioResult({ pnl: res.value.scenario_pnl_native, pct: res.value.scenario_pnl_pct, ccy: res.value.currency });
      } else { setScenarioResult(null); setScenarioErrors(res.errors); }
    } finally { setLoading(false); }
  }

  async function onFactorExposure() {
    setLoading(true); setFactorErrors([]);
    try {
      const res = await calcFactorExposure(envId, fundId, asOf, undefined, businessId);
      if (res.valid && res.value) {
        setFactorRows(Object.entries(res.value.exposures).map(([code, exp]) => ({
          code, name: exp.factor_name, exposure: exp.exposure_native,
        })));
      } else { setFactorRows(null); setFactorErrors(res.errors); }
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">Value at Risk (dual-method, ADR 004)</h2>
        <form onSubmit={onCalcVar} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Fund</label>
            <select value={fundId} onChange={(e) => setFundId(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm min-w-[14rem]" required>
              <option value="" disabled>Select fund…</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">As of</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
                   className="rounded border border-border bg-background px-2 py-1 text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm">
              <option value="95.00">95%</option><option value="97.50">97.5%</option><option value="99.00">99%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Horizon</label>
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}
                    className="rounded border border-border bg-background px-2 py-1 text-sm">
              <option value={1}>1d</option><option value={5}>5d</option><option value={10}>10d</option><option value={20}>20d</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">History (days)</label>
            <input type="number" value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))}
                   className="rounded border border-border bg-background px-2 py-1 text-sm w-24" />
          </div>
          <button type="submit" disabled={loading || !fundId}
                  className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            {loading ? "Calculating…" : "Calculate VaR"}
          </button>
        </form>

        {varValid !== null && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Result</h3>
              <StatusBadge valid={varValid} />
            </div>
            <ErrorList errors={varErrors} />
            {varValid && varValue && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Historical sim</dt>
                     <dd className="font-mono text-base">{varValue.hist} {varValue.ccy}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Parametric</dt>
                     <dd className="font-mono text-base">{varValue.param} {varValue.ccy}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Portfolio value</dt>
                     <dd className="font-mono">{varValue.pv}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Method gap</dt>
                     <dd className="font-mono">{(() => {
                       const h = Number(varValue.hist), p = Number(varValue.param);
                       if (!h || !p) return <Unavailable />;
                       const gap = Math.abs(h - p) / Math.max(h, p);
                       return <span className={gap > 0.20 ? "text-amber-600" : ""}>{(gap * 100).toFixed(2)}%</span>;
                     })()}</dd></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">Scenario shock</h2>
        <form onSubmit={onScenario} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Scenario</label>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm min-w-[14rem]" required>
              <option value="" disabled>Select scenario…</option>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading || !fundId || !scenarioId}
                  className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            Apply
          </button>
        </form>
        {scenarioResult && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Scenario P&amp;L</dt>
                 <dd className={`font-mono text-base ${Number(scenarioResult.pnl) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                   {scenarioResult.pnl} {scenarioResult.ccy}</dd></div>
            <div><dt className="text-xs text-muted-foreground">As % of NAV</dt>
                 <dd className="font-mono">{(Number(scenarioResult.pct) * 100).toFixed(2)}%</dd></div>
          </div>
        )}
        <ErrorList errors={scenarioErrors} />
      </div>

      <div className="rounded border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Factor exposures</h2>
          <button onClick={onFactorExposure} disabled={loading || !fundId}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            Compute
          </button>
        </div>
        <ErrorList errors={factorErrors} />
        {factorRows && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3 text-right">Exposure (native)</th>
            </tr></thead>
            <tbody>
              {factorRows.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No factors configured.</td></tr>
              ) : factorRows.map((r) => (
                <tr key={r.code} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono text-xs">{r.code}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-right font-mono">{r.exposure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {factors.length > 0 && !factorRows && (
          <div className="text-sm text-muted-foreground">{factors.length} factor(s) configured. Click Compute.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE PANEL
// ─────────────────────────────────────────────────────────────────────────────

function CompliancePanel({ envId, businessId, funds }: { envId: string; businessId?: string; funds: InvFund[] }) {
  const [fundId, setFundId] = useState<string>("");
  const [asOf, setAsOf] = useState<string>(new Date().toISOString().slice(0, 10));
  const [rules, setRules] = useState<InvComplianceRule[]>([]);
  const [violations, setViolations] = useState<InvComplianceViolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [evalMsg, setEvalMsg] = useState<string | null>(null);
  const [evalErrors, setEvalErrors] = useState<InvEngineError[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newOperator, setNewOperator] = useState<string>("max_pct_of_nav");
  const [newPredicateKey, setNewPredicateKey] = useState<string>("issuer");
  const [newPredicateValue, setNewPredicateValue] = useState<string>("");
  const [newThreshold, setNewThreshold] = useState<string>("0.05");
  const [newSeverity, setNewSeverity] = useState<string>("high");
  const [newReason, setNewReason] = useState<string>("");

  useEffect(() => { if (funds.length > 0 && !fundId) setFundId(funds[0].id); }, [funds, fundId]);

  async function refreshRules() {
    if (!fundId) return;
    const r = await listComplianceRules(envId, fundId, asOf);
    if (r.valid && r.value) setRules(r.value.rules);
  }
  async function refreshViolations() {
    if (!fundId) return;
    const r = await listComplianceViolations(envId, { fundId, limit: 200 });
    if (r.valid && r.value) setViolations(r.value.violations);
  }
  useEffect(() => { refreshRules(); refreshViolations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId, asOf]);

  async function onEvaluate() {
    setLoading(true); setEvalMsg(null); setEvalErrors([]);
    try {
      const r = await evaluatePostTrade(envId, fundId, asOf, true, businessId);
      if (r.valid && r.value) {
        const sum = r.value.summary as { violations_total: number };
        setEvalMsg(`Evaluation complete: ${sum.violations_total} violation(s) detected.`);
      } else { setEvalErrors(r.errors); }
      await refreshViolations();
    } finally { setLoading(false); }
  }

  async function onCreateRule(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: Parameters<typeof createComplianceRule>[1] = {
        operator: newOperator, fund_id: fundId, active_from: asOf,
        severity: newSeverity, reason: newReason || undefined, business_id: businessId,
      };
      if (newOperator === "restricted_list") {
        body.threshold_list = newPredicateValue.split(",").map((x) => x.trim()).filter(Boolean);
      } else {
        body.predicate = { [newPredicateKey]: newPredicateValue };
        body.threshold = newThreshold;
      }
      await createComplianceRule(envId, body);
      setShowCreate(false);
      await refreshRules();
    } finally { setLoading(false); }
  }

  async function onDeactivate(ruleId: string) {
    setLoading(true);
    try { await deactivateComplianceRule(envId, ruleId, asOf, businessId); await refreshRules(); }
    finally { setLoading(false); }
  }

  async function onResolve(violationId: string) {
    const note = window.prompt("Resolution note (optional):") || undefined;
    setLoading(true);
    try { await resolveComplianceViolation(envId, violationId, "ui", note, businessId); await refreshViolations(); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Fund</label>
            <select value={fundId} onChange={(e) => setFundId(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm min-w-[14rem]">
              <option value="" disabled>Select fund…</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">As of</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
                   className="rounded border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <button onClick={onEvaluate} disabled={loading || !fundId}
                  className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            Evaluate post-trade
          </button>
        </div>
        {evalMsg && <div className="text-sm">{evalMsg}</div>}
        <ErrorList errors={evalErrors} />
      </div>

      <div className="rounded border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Active rules ({rules.length})</h2>
          <button onClick={() => setShowCreate((v) => !v)}
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent">
            {showCreate ? "Cancel" : "+ New rule"}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={onCreateRule} className="mb-4 p-3 rounded bg-muted/30 border border-border space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Operator</label>
                <select value={newOperator} onChange={(e) => setNewOperator(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1 text-sm">
                  <option value="max_pct_of_nav">max_pct_of_nav</option>
                  <option value="max_issuer_exposure">max_issuer_exposure</option>
                  <option value="max_sector_exposure_pct">max_sector_exposure_pct</option>
                  <option value="restricted_list">restricted_list</option>
                  <option value="mandate_min_pct">mandate_min_pct</option>
                  <option value="mandate_max_pct">mandate_max_pct</option>
                </select>
              </div>
              {newOperator !== "restricted_list" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Predicate key</label>
                  <select value={newPredicateKey} onChange={(e) => setNewPredicateKey(e.target.value)}
                          className="rounded border border-border bg-background px-2 py-1 text-sm">
                    <option value="issuer">issuer</option>
                    <option value="sector">sector</option>
                    <option value="asset_class">asset_class</option>
                    <option value="security_id">security_id</option>
                  </select>
                </div>
              )}
              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs text-muted-foreground mb-1">
                  {newOperator === "restricted_list" ? "Security IDs (comma-separated)" : "Predicate value"}
                </label>
                <input type="text" value={newPredicateValue} onChange={(e) => setNewPredicateValue(e.target.value)}
                       className="w-full rounded border border-border bg-background px-2 py-1 text-sm" required />
              </div>
              {newOperator !== "restricted_list" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Threshold</label>
                  <input type="text" value={newThreshold} onChange={(e) => setNewThreshold(e.target.value)}
                         className="rounded border border-border bg-background px-2 py-1 text-sm w-24" required />
                </div>
              )}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Severity</label>
                <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)}
                        className="rounded border border-border bg-background px-2 py-1 text-sm">
                  <option value="low">low</option><option value="medium">medium</option>
                  <option value="high">high</option><option value="critical">critical</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[20rem]">
                <label className="block text-xs text-muted-foreground mb-1">Reason</label>
                <input type="text" value={newReason} onChange={(e) => setNewReason(e.target.value)}
                       className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
              </div>
              <button type="submit" disabled={loading}
                      className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                Create rule
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Operator</th>
              <th className="py-2 pr-3">Predicate</th>
              <th className="py-2 pr-3">Threshold</th>
              <th className="py-2 pr-3">Severity</th>
              <th className="py-2 pr-3">Active from</th>
              <th className="py-2 pr-3"></th>
            </tr></thead>
            <tbody>
              {rules.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No active rules.</td></tr>
              ) : rules.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono text-xs">{r.operator}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{JSON.stringify(r.predicate)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.threshold ?? (r.threshold_list ? `[${r.threshold_list.length} items]` : <Unavailable />)}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.severity === "critical" ? "bg-red-500/15 text-red-700"
                      : r.severity === "high" ? "bg-orange-500/15 text-orange-700"
                      : r.severity === "medium" ? "bg-yellow-500/15 text-yellow-700"
                      : "bg-slate-500/15 text-slate-700"
                    }`}>{r.severity}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.active_from}</td>
                  <td className="py-2 pr-3">
                    <button onClick={() => onDeactivate(r.id)} disabled={loading}
                            className="text-xs text-muted-foreground hover:text-foreground">
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border border-border p-4">
        <h2 className="text-lg font-semibold mb-3">Violations ({violations.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">Severity</th>
              <th className="py-2 pr-3">Eval kind</th>
              <th className="py-2 pr-3">Snapshot value</th>
              <th className="py-2 pr-3">Threshold</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3"></th>
            </tr></thead>
            <tbody>
              {violations.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No violations.</td></tr>
              ) : violations.map((v) => (
                <tr key={v.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      v.severity === "critical" ? "bg-red-500/15 text-red-700"
                      : v.severity === "high" ? "bg-orange-500/15 text-orange-700"
                      : v.severity === "medium" ? "bg-yellow-500/15 text-yellow-700"
                      : "bg-slate-500/15 text-slate-700"
                    }`}>{v.severity}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{v.eval_kind}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{v.snapshot_value ?? <Unavailable />}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{v.threshold ?? <Unavailable />}</td>
                  <td className="py-2 pr-3 text-xs">{v.resolved_at ? "resolved" : "open"}</td>
                  <td className="py-2 pr-3">
                    {!v.resolved_at && (
                      <button onClick={() => onResolve(v.id)} disabled={loading}
                              className="text-xs text-muted-foreground hover:text-foreground">
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function InvestmentEnginePage() {
  const { envId, businessId } = useDomainEnv();
  const [tab, setTab] = useState<Tab>("nav");
  const [funds, setFunds] = useState<InvFund[]>([]);
  const [fundsError, setFundsError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listInvFunds(envId);
        if (res.valid && res.value) setFunds(res.value.funds);
        else setFundsError(res.errors[0]?.message ?? "Failed to load funds");
      } catch (err) {
        setFundsError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [envId]);

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Investment Engine</h1>
        <p className="text-sm text-muted-foreground">
          Authoritative NAV, risk, compliance, reconciliation, and audit lineage for Aladdin-class fund accounting.
        </p>
      </header>

      {fundsError && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
          {fundsError}
        </div>
      )}

      <div className="border-b border-border">
        <nav className="flex gap-1">
          {([
            ["nav", "NAV"],
            ["risk", "Risk"],
            ["compliance", "Compliance"],
            ["reconciliation", "Reconciliation"],
            ["audit", "Audit"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === k
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {tab === "nav" && <NavPanel envId={envId} businessId={businessId || undefined} funds={funds} />}
        {tab === "risk" && <RiskPanel envId={envId} businessId={businessId || undefined} funds={funds} />}
        {tab === "compliance" && <CompliancePanel envId={envId} businessId={businessId || undefined} funds={funds} />}
        {tab === "reconciliation" && <ReconciliationPanel envId={envId} businessId={businessId || undefined} />}
        {tab === "audit" && <AuditViewer envId={envId} />}
      </div>
    </div>
  );
}
