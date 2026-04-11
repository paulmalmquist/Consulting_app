"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";
import {
  getReOpportunity,
  updateReOpportunity,
  listReSignalLinks,
  listReAssumptionVersions,
  createReAssumptionVersion,
  listReModelRuns,
  triggerReModelRun,
  getReOpportunityFundImpact,
  computeReFundImpact,
  approveReOpportunity,
  convertReOpportunityToInvestment,
  getReOpportunityReceipts,
  type ReOpportunity,
  type ReAssumptionVersion,
  type ReFundImpact,
} from "@/lib/bos-api";

// ── Stage badge ───────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  signal: "bg-slate-700 text-slate-200",
  hypothesis: "bg-indigo-900/60 text-indigo-300",
  underwriting: "bg-blue-900/60 text-blue-300",
  modeled: "bg-cyan-900/60 text-cyan-300",
  ic_ready: "bg-amber-900/60 text-amber-300",
  approved: "bg-orange-900/60 text-orange-300",
  live: "bg-emerald-900/60 text-emerald-300",
  archived: "bg-zinc-800 text-zinc-500",
};

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? "bg-zinc-800 text-zinc-400";
  const label = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtPct(v: string | number | null | undefined, decimals = 1) {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function fmtMoney(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(v: string | number | null | undefined, decimals = 2) {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-bm-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bm-surface2/30 hover:bg-bm-surface2/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-bm-text">{title}</span>
          {badge}
        </div>
        <span className="text-bm-muted2 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </div>
  );
}

// ── Tag pill ──────────────────────────────────────────────────────────────────
function Tag({ label, color = "zinc" }: { label: string; color?: "violet" | "amber" | "cyan" | "zinc" }) {
  const cls = {
    violet: "bg-violet-900/40 text-violet-400 border-violet-800/40",
    amber: "bg-amber-900/40 text-amber-400 border-amber-800/40",
    cyan: "bg-cyan-900/40 text-cyan-400 border-cyan-800/40",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
  }[color];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionButton({
  label,
  onClick,
  disabled,
  disabledReason,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "primary" | "danger";
}) {
  const baseClass = "relative rounded px-3 py-1.5 text-xs font-semibold transition-colors";
  const variantClass = {
    default: "bg-bm-surface2 text-bm-text hover:bg-bm-surface2/80 border border-bm-border/40",
    primary: "bg-bm-accent text-white hover:bg-bm-accent/80",
    danger: "bg-red-900/40 text-red-400 hover:bg-red-900/60 border border-red-800/40",
  }[variant];
  const disabledClass = disabled ? "opacity-40 cursor-not-allowed" : "";

  return (
    <div className="relative group inline-block">
      <button
        onClick={disabled ? undefined : onClick}
        className={`${baseClass} ${variantClass} ${disabledClass}`}
      >
        {label}
      </button>
      {disabled && disabledReason && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 w-max max-w-[200px]">
          <div className="rounded bg-zinc-900 border border-bm-border/40 px-2 py-1 text-[10px] text-bm-muted2 shadow-lg">
            {disabledReason}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, label }: { score: number | null; label?: string }) {
  if (score == null) return <span className="text-bm-muted2 text-xs">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, Number(score))));
  const colorCls =
    w >= 85 ? "bg-emerald-500" :
    w >= 70 ? "bg-green-500" :
    w >= 55 ? "bg-yellow-500" :
    w >= 40 ? "bg-orange-500" :
              "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-bm-border/30 overflow-hidden">
        <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums text-bm-text">{w.toFixed(1)}</span>
      {label && <span className="text-[10px] text-bm-muted2">{label}</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OpportunityDetailPage() {
  const params = useParams();
  const opportunityId = params.opportunityId as string;
  const { envId } = useRepeContext();
  const base = useRepeBasePath();
  const router = useRouter();

  const [opp, setOpp] = useState<ReOpportunity | null>(null);
  const [signals, setSignals] = useState<unknown[]>([]);
  const [versions, setVersions] = useState<ReAssumptionVersion[]>([]);
  const [modelRuns, setModelRuns] = useState<unknown[]>([]);
  const [fundImpacts, setFundImpacts] = useState<ReFundImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [thesis, setThesis] = useState("");

  const loadAll = useCallback(async () => {
    if (!opportunityId) return;
    setLoading(true);
    try {
      const [o, s, v, r, fi] = await Promise.allSettled([
        getReOpportunity(opportunityId),
        listReSignalLinks(opportunityId),
        listReAssumptionVersions(opportunityId),
        listReModelRuns(opportunityId),
        getReOpportunityFundImpact(opportunityId),
      ]);
      if (o.status === "fulfilled") { setOpp(o.value); setThesis(o.value.thesis ?? ""); }
      if (s.status === "fulfilled") setSignals(s.value);
      if (v.status === "fulfilled") setVersions(v.value);
      if (r.status === "fulfilled") setModelRuns(r.value);
      if (fi.status === "fulfilled") setFundImpacts(fi.value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-bm-muted2 text-sm">Loading…</div>;
  }
  if (error || !opp) {
    return <StateCard state="error" title="Not Found" message={error ?? "Opportunity not found"} />;
  }

  const currentVersion = versions.find((v) => v.is_current) ?? versions[0] ?? null;
  const latestRun = (modelRuns as any[])[0] ?? null;
  const hasCompletedRun = (modelRuns as any[]).some((r) => r.status === "completed");

  // Approve button disabled reasons
  const approveDisabledReason =
    !opp.current_assumption_version_id ? "No assumption version" :
    !hasCompletedRun ? "Model not yet run" :
    opp.stage !== "ic_ready" ? `Stage must be ic_ready (currently: ${opp.stage})` :
    undefined;

  const handleApprove = async () => {
    setActionError(null);
    setActionLoading(true);
    try {
      await approveReOpportunity(opportunityId, { approved_by: "user" });
      await loadAll();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!opp.fund_id) {
      setActionError("No fund assigned to this opportunity");
      return;
    }
    setActionError(null);
    setActionLoading(true);
    try {
      await convertReOpportunityToInvestment(opportunityId, { fund_id: opp.fund_id });
      await loadAll();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunModel = async () => {
    if (!currentVersion) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await triggerReModelRun(opportunityId, currentVersion.assumption_version_id);
      await loadAll();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Model run failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleThesisSave = async () => {
    try {
      await updateReOpportunity(opportunityId, { thesis });
    } catch {
      // silent save failure
    }
  };

  const handleExportReceipts = async () => {
    try {
      const receipts = await getReOpportunityReceipts(opportunityId);
      const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opportunity_receipt_${opportunityId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Failed to export receipts");
    }
  };

  const kpis: KpiDef[] = [
    { label: "Stage", value: <StageBadge stage={opp.stage} /> },
    { label: "Score", value: opp.composite_score != null ? Number(opp.composite_score).toFixed(1) : "—" },
    { label: "Strategy", value: opp.strategy?.replace(/_/g, " ") ?? "—" },
    { label: "Market", value: opp.market ?? "—" },
    { label: "Equity Check", value: fmtMoney(opp.target_equity_check) },
    { label: "Signals", value: opp.signal_count ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-5xl mx-auto">

      {/* Section 1: Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-bm-text">{opp.name}</h1>
            <StageBadge stage={opp.stage} />
            {opp.ai_generated && <Tag label="AI Generated" color="violet" />}
            {!hasCompletedRun && opp.current_assumption_version_id && <Tag label="Estimated Inputs" color="amber" />}
            {hasCompletedRun && <Tag label="Modeled Outputs" color="cyan" />}
          </div>
          <p className="text-xs text-bm-muted2 mt-1">{opp.property_type ?? ""} · {opp.market ?? ""} {opp.submarket ? `/ ${opp.submarket}` : ""}</p>
        </div>
        <button onClick={handleExportReceipts} className="text-xs text-bm-muted hover:text-bm-text border border-bm-border/30 rounded px-2 py-1 transition-colors flex-shrink-0">
          Export Receipt
        </button>
      </div>

      <KpiStrip kpis={kpis} variant="band" />

      {actionError && (
        <div className="rounded border border-red-800/40 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {actionError}
        </div>
      )}

      {/* Section 2: Thesis */}
      <Section title="Thesis" defaultOpen>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          onBlur={handleThesisSave}
          placeholder="Describe the investment hypothesis…"
          rows={4}
          className="w-full rounded border border-bm-border/30 bg-bm-surface2/20 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2 resize-y focus:outline-none focus:border-bm-accent/50"
        />
      </Section>

      {/* Section 3: Signals */}
      <Section title="Signals" badge={<span className="text-xs text-bm-muted2">({signals.length})</span>}>
        {signals.length === 0 ? (
          <p className="text-xs text-bm-muted2">No signals linked. Link signals to contribute to the score.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-bm-border/30 text-bm-muted2 text-[11px] uppercase">
                <th className="py-1.5 pr-3 font-medium text-left">Headline</th>
                <th className="py-1.5 pr-3 font-medium text-left">Market</th>
                <th className="py-1.5 pr-3 font-medium text-left">Type</th>
                <th className="py-1.5 pr-3 font-medium text-left">Date</th>
                <th className="py-1.5 text-left font-medium">Strength</th>
              </tr>
            </thead>
            <tbody>
              {(signals as any[]).map((s, i) => (
                <tr key={s.signal_id ?? i} className="border-b border-bm-border/20">
                  <td className="py-1.5 pr-3 text-bm-text max-w-[200px] truncate">
                    {s.signal_headline}
                    {s.ai_generated && <span className="ml-1 text-[9px] text-violet-400 uppercase">AI</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-bm-muted2">{s.market ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-bm-muted2">{s.signal_type?.replace(/_/g, " ")}</td>
                  <td className="py-1.5 pr-3 text-bm-muted2">{s.signal_date}</td>
                  <td className="py-1.5">
                    <ScoreBar score={s.strength} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Section 4: Underwriting Assumptions */}
      <Section title="Underwriting Assumptions" badge={currentVersion ? <span className="text-xs text-bm-muted2">v{currentVersion.version_number}{currentVersion.label ? ` — ${currentVersion.label}` : ""}</span> : undefined}>
        {!currentVersion ? (
          <p className="text-xs text-bm-muted2">No assumption version created yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4">
              {[
                ["Purchase Price", fmtMoney(currentVersion.purchase_price)],
                ["Base NOI", fmtMoney(currentVersion.base_noi)],
                ["LTV", fmtPct(currentVersion.ltv)],
                ["Interest Rate", fmtPct(currentVersion.interest_rate_pct)],
                ["Exit Cap Rate", fmtPct(currentVersion.exit_cap_rate_pct)],
                ["Hold Years", currentVersion.hold_years],
                ["Rent Growth", fmtPct(currentVersion.rent_growth_pct)],
                ["Vacancy", fmtPct(currentVersion.vacancy_pct)],
                ["Fee Load", fmtPct(currentVersion.fee_load_pct)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex flex-col gap-0.5">
                  <span className="text-bm-muted2 text-[10px] uppercase tracking-wide">{label}</span>
                  <span className="text-bm-text font-medium">{value}</span>
                </div>
              ))}
            </div>
            {/* Structured sections */}
            {(["operating_json", "debt_json", "exit_json"] as const).map((key) => {
              const section = currentVersion[key];
              if (!section || Object.keys(section).length === 0) return null;
              const label = key.replace("_json", "").replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={key} className="mb-3">
                  <div className="text-[10px] text-bm-muted2 uppercase tracking-wide mb-1">{label}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(section).map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <span className="text-bm-muted2">{k.replace(/_/g, " ")}: </span>
                        <span className="text-bm-text">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div className="mt-3 flex gap-2">
          <ActionButton
            label="Run Model"
            onClick={handleRunModel}
            disabled={actionLoading || !currentVersion}
            disabledReason={!currentVersion ? "No assumption version" : undefined}
            variant="primary"
          />
        </div>
      </Section>

      {/* Section 5: Model Outputs */}
      <Section title="Model Outputs" badge={latestRun ? <span className={`text-[10px] rounded px-1.5 py-0.5 ${latestRun.status === "completed" ? "bg-emerald-900/40 text-emerald-400" : latestRun.status === "failed" ? "bg-red-900/40 text-red-400" : "bg-amber-900/40 text-amber-400"}`}>{latestRun.status}</span> : undefined}>
        {!latestRun ? (
          <p className="text-xs text-bm-muted2">No model runs yet. Create an assumption version and click Run Model.</p>
        ) : (
          <>
            {/* Provenance block — non-negotiable */}
            {latestRun.engine_version && (
              <div className="mb-4 rounded border border-bm-border/20 bg-bm-surface2/20 px-3 py-2 text-xs text-bm-muted2 space-y-0.5">
                <div><span className="text-bm-muted">Assumption Version:</span> v{versions.find((v) => v.assumption_version_id === latestRun.assumption_version_id)?.version_number ?? "?"}{latestRun.assumption_version_id ? ` (${latestRun.assumption_version_id.slice(0, 8)}…)` : ""}</div>
                <div><span className="text-bm-muted">Model Run ID:</span> {latestRun.model_run_id}</div>
                <div><span className="text-bm-muted">Engine:</span> {latestRun.engine_version}</div>
                <div><span className="text-bm-muted">Run Time:</span> {latestRun.output_run_timestamp ? new Date(latestRun.output_run_timestamp).toLocaleString() : "—"}</div>
              </div>
            )}
            {latestRun.status === "completed" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ["Gross IRR", fmtPct(latestRun.gross_irr)],
                  ["Net IRR", fmtPct(latestRun.net_irr)],
                  ["Gross EM", fmtNum(latestRun.gross_equity_multiple, 2) + "x"],
                  ["TVPI", fmtNum(latestRun.tvpi, 2) + "x"],
                  ["DPI", fmtNum(latestRun.dpi, 2) + "x"],
                  ["NAV", fmtMoney(latestRun.nav)],
                  ["Min DSCR", fmtNum(latestRun.min_dscr, 2)],
                  ["Exit LTV", fmtPct(latestRun.exit_ltv)],
                  ["Debt Yield", fmtPct(latestRun.debt_yield)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex flex-col gap-0.5">
                    <span className="text-bm-muted2 text-[10px] uppercase tracking-wide">{label}</span>
                    <span className="text-bm-text font-medium">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {latestRun.status === "failed" && (
              <div className="text-xs text-red-400">{latestRun.error_message}</div>
            )}
          </>
        )}
      </Section>

      {/* Section 6: Fund Impact */}
      <Section title="Fund Impact" badge={fundImpacts.length > 0 ? <span className="text-xs text-bm-muted2">({fundImpacts.length} fund{fundImpacts.length !== 1 ? "s" : ""})</span> : undefined}>
        {fundImpacts.length === 0 ? (
          <p className="text-xs text-bm-muted2">No fund impact computed yet. Run a model first, then click Compute Fund Impact.</p>
        ) : (
          <>
            {fundImpacts.map((fi) => (
              <div key={fi.fund_impact_id} className="mb-4">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-xs mb-3">
                  {[
                    ["NAV Δ", fmtMoney(fi.nav_delta)],
                    ["IRR Δ", fmtPct(fi.irr_delta, 2)],
                    ["TVPI Δ", fmtNum(fi.tvpi_delta, 3)],
                    ["Capital Avail. Before", fmtMoney(fi.capital_available_before)],
                    ["Capital Avail. After", fmtMoney(fi.capital_available_after)],
                    ["Leverage Before", fmtNum(fi.leverage_ratio_before, 2)],
                    ["Leverage After", fmtNum(fi.leverage_ratio_after, 2)],
                    ["Allocation %", fi.allocation_pct != null ? `${(Number(fi.allocation_pct) * 100).toFixed(1)}%` : "—"],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex flex-col gap-0.5">
                      <span className="text-bm-muted2 text-[10px] uppercase tracking-wide">{label}</span>
                      <span className="text-bm-text font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                {/* Fund fit score + 6-component breakdown */}
                {fi.fund_fit_score != null && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-bm-muted2 uppercase tracking-wide">Fund Fit Score</span>
                      <ScoreBar score={Number(fi.fund_fit_score)} />
                    </div>
                    {fi.fund_fit_breakdown_json && Object.keys(fi.fund_fit_breakdown_json).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {Object.entries(fi.fund_fit_breakdown_json).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between text-[10px] border border-bm-border/20 rounded px-2 py-1">
                            <span className="text-bm-muted2 capitalize">{key.replace(/_/g, " ")}</span>
                            <ScoreBar score={val as number} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        {opp.fund_id && hasCompletedRun && (
          <ActionButton
            label="Compute Fund Impact"
            onClick={async () => {
              if (!opp.fund_id || !latestRun?.model_run_id) return;
              setActionLoading(true);
              try {
                await computeReFundImpact(opportunityId, { fund_id: opp.fund_id!, model_run_id: latestRun.model_run_id });
                await loadAll();
              } catch (e: unknown) {
                setActionError(e instanceof Error ? e.message : "Failed");
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
          />
        )}
      </Section>

      {/* Section 7: Actions */}
      <Section title="Actions">
        <div className="flex flex-wrap gap-3">
          <ActionButton
            label="Approve (IC)"
            onClick={handleApprove}
            disabled={!!approveDisabledReason || actionLoading}
            disabledReason={approveDisabledReason}
            variant="primary"
          />
          {opp.stage === "approved" && (
            <ActionButton
              label="Convert to Investment"
              onClick={handleConvert}
              disabled={actionLoading || !opp.fund_id}
              disabledReason={!opp.fund_id ? "No fund assigned" : undefined}
              variant="primary"
            />
          )}
          {opp.promoted_investment_id && (
            <button
              onClick={() => router.push(`${base}/deals`)}
              className="text-xs text-bm-muted hover:text-bm-text underline"
            >
              View Live Investment →
            </button>
          )}
        </div>
        {actionLoading && <p className="text-xs text-bm-muted2 mt-2">Processing…</p>}
      </Section>

    </div>
  );
}
