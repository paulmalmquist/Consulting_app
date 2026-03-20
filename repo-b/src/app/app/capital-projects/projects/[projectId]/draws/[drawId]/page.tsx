"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRepeContext } from "@/lib/repe-context";
import {
  getCpDraw,
  updateCpDrawLineItems,
  submitCpDraw,
  approveCpDraw,
  rejectCpDraw,
  requestCpDrawRevision,
  submitCpDrawToLender,
  markCpDrawFunded,
  generateCpG702,
} from "@/lib/bos-api";
import type { CpDrawRequest, CpDrawLineItem, DrawVarianceFlag } from "@/types/capital-projects";
import { cn } from "@/lib/cn";

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "draft": return "border-slate-500/50 bg-slate-500/10 text-slate-300";
    case "pending_review": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "revision_requested": return "border-orange-500/50 bg-orange-500/10 text-orange-300";
    case "approved": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "submitted_to_lender": return "border-blue-500/50 bg-blue-500/10 text-blue-300";
    case "funded": return "border-cyan-500/50 bg-cyan-500/10 text-cyan-300";
    case "rejected": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    default: return "border-bm-border/50 bg-bm-surface/10 text-bm-muted";
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    case "warning": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    default: return "border-blue-500/50 bg-blue-500/10 text-blue-300";
  }
}

const isEditable = (status: string) => status === "draft" || status === "revision_requested";

export default function DrawDetailPage({ params }: { params: { projectId: string; drawId: string } }) {
  const { envId, businessId } = useRepeContext();
  const [draw, setDraw] = useState<CpDrawRequest | null>(null);
  const [editedLines, setEditedLines] = useState<Record<string, { current_draw: string; materials_stored: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"lines" | "invoices" | "inspections" | "audit">("lines");

  const loadDraw = () => {
    if (!envId || !businessId) return;
    setLoading(true);
    getCpDraw(params.projectId, params.drawId, envId, businessId)
      .then(setDraw)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadDraw, [envId, businessId, params.projectId, params.drawId]);

  const handleLineChange = (lineId: string, field: "current_draw" | "materials_stored", value: string) => {
    setEditedLines(prev => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
  };

  const handleSaveLines = async () => {
    if (!envId || !businessId || !draw) return;
    setSaving(true);
    try {
      const items = Object.entries(editedLines).map(([line_item_id, vals]) => ({
        line_item_id,
        current_draw: vals.current_draw || "0",
        materials_stored: vals.materials_stored || "0",
      }));
      if (items.length === 0) return;
      const updated = await updateCpDrawLineItems(params.projectId, params.drawId, items, envId, businessId);
      setDraw(updated);
      setEditedLines({});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (name: string, fn: () => Promise<CpDrawRequest>) => {
    setActionLoading(name);
    setError(null);
    try {
      const updated = await fn();
      setDraw(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGeneratePdf = async () => {
    if (!envId || !businessId) return;
    setActionLoading("g702");
    try {
      const blob = await generateCpG702(params.projectId, params.drawId, envId, businessId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `G702_G703_Draw_${draw?.draw_number ?? ""}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !draw) {
    return (
      <div className="space-y-3 p-6">
        <div className="h-24 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
        <div className="h-64 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
      </div>
    );
  }

  const lines = draw.line_items ?? [];
  const editable = isEditable(draw.status);
  const variances = (draw.variance_flags_json ?? []) as DrawVarianceFlag[];
  const hasUnsavedChanges = Object.keys(editedLines).length > 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href={`/app/capital-projects/projects/${params.projectId}/draws`} className="text-xs text-bm-muted2 hover:text-bm-accent">
              &larr; Draws
            </Link>
          </div>
          <h1 className="mt-2 font-display text-xl font-semibold tracking-tight text-bm-text">
            Draw #{draw.draw_number} {draw.title ? `— ${draw.title}` : ""}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", statusBadge(draw.status))}>
              {statusLabel(draw.status)}
            </span>
            <span className="text-xs text-bm-muted2">
              {formatDate(draw.billing_period_start)} — {formatDate(draw.billing_period_end)}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {editable && hasUnsavedChanges && (
            <button onClick={handleSaveLines} disabled={saving} className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50">
              {saving ? "Saving..." : "Save Draft"}
            </button>
          )}
          {draw.status === "draft" && (
            <button onClick={() => doAction("submit", () => submitCpDraw(params.projectId, params.drawId, envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
              {actionLoading === "submit" ? "Submitting..." : "Submit for Review"}
            </button>
          )}
          {draw.status === "pending_review" && (
            <>
              <button onClick={() => doAction("approve", () => approveCpDraw(params.projectId, params.drawId, "user", envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                {actionLoading === "approve" ? "Approving..." : "Approve"}
              </button>
              <button onClick={() => doAction("revision", () => requestCpDrawRevision(params.projectId, params.drawId, envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-50">
                Request Revision
              </button>
              <button onClick={() => doAction("reject", () => rejectCpDraw(params.projectId, params.drawId, "user", "Requires corrections", envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {draw.status === "approved" && (
            <>
              <button onClick={handleGeneratePdf} disabled={!!actionLoading} className="rounded-lg border border-bm-border/40 bg-bm-surface/40 px-4 py-2 text-sm font-medium text-bm-text hover:bg-bm-surface/60 disabled:opacity-50">
                {actionLoading === "g702" ? "Generating..." : "Generate G702/G703"}
              </button>
              <button onClick={() => doAction("lender", () => submitCpDrawToLender(params.projectId, params.drawId, "user", envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50">
                Submit to Lender
              </button>
            </>
          )}
          {draw.status === "submitted_to_lender" && (
            <button onClick={() => doAction("funded", () => markCpDrawFunded(params.projectId, params.drawId, envId!, businessId!))} disabled={!!actionLoading} className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50">
              Mark as Funded
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-bm-danger/40 bg-bm-danger/10 px-4 py-3 text-sm text-bm-danger">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Previous Draws", value: formatMoney(draw.total_previous_draws) },
          { label: "This Period", value: formatMoney(draw.total_current_draw) },
          { label: "Materials Stored", value: formatMoney(draw.total_materials_stored) },
          { label: "Retainage Held", value: formatMoney(draw.total_retainage_held) },
          { label: "Amount Due", value: formatMoney(draw.total_amount_due) },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-bm-border/40 bg-bm-surface/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{card.label}</p>
            <p className="mt-1 font-display text-lg font-semibold tracking-tight text-bm-text">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Variance banner */}
      {variances.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300">{variances.length} variance flag{variances.length > 1 ? "s" : ""} detected</p>
          <div className="mt-2 space-y-1">
            {variances.slice(0, 5).map((f, i) => (
              <div key={i} className={cn("rounded-md border px-3 py-1.5 text-xs", severityColor(f.severity))}>
                <span className="font-medium">{f.severity.toUpperCase()}</span>: {f.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/30">
        {(["lines", "invoices", "inspections", "audit"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn("px-4 py-2 text-sm font-medium capitalize transition-colors", tab === t ? "border-b-2 border-bm-accent text-bm-accent" : "text-bm-muted2 hover:text-bm-text")}>
            {t === "lines" ? `Line Items (${lines.length})` : t === "invoices" ? `Invoices (${draw.invoice_count ?? 0})` : t === "inspections" ? `Inspections (${draw.inspection_count ?? 0})` : "Audit Log"}
          </button>
        ))}
      </div>

      {/* Line items table */}
      {tab === "lines" && (
        <div className="overflow-x-auto rounded-xl border border-bm-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface/40">
                {["Code", "Description", "Scheduled", "Previous", "This Period", "Materials", "Total", "% Comp", "Retainage", "Balance", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const edited = editedLines[line.line_item_id];
                return (
                  <tr key={line.line_item_id} className={cn("border-b border-bm-border/20", line.variance_flag && "bg-amber-500/5")}>
                    <td className="px-3 py-2 font-mono text-xs text-bm-accent">{line.cost_code}</td>
                    <td className="px-3 py-2 text-bm-text max-w-[180px] truncate">{line.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.scheduled_value)}</td>
                    <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.previous_draws)}</td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <input
                          type="number"
                          className="w-24 rounded-md border border-bm-border/70 bg-bm-surface/85 px-2 py-1 text-right text-sm text-bm-text focus:border-bm-accent focus:outline-none"
                          value={edited?.current_draw ?? String(Number(line.current_draw))}
                          onChange={e => handleLineChange(line.line_item_id, "current_draw", e.target.value)}
                        />
                      ) : (
                        <span className="font-mono text-bm-text">{formatMoney(line.current_draw)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editable ? (
                        <input
                          type="number"
                          className="w-24 rounded-md border border-bm-border/70 bg-bm-surface/85 px-2 py-1 text-right text-sm text-bm-text focus:border-bm-accent focus:outline-none"
                          value={edited?.materials_stored ?? String(Number(line.materials_stored))}
                          onChange={e => handleLineChange(line.line_item_id, "materials_stored", e.target.value)}
                        />
                      ) : (
                        <span className="font-mono text-bm-muted2">{formatMoney(line.materials_stored)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-bm-text">{formatMoney(line.total_completed)}</td>
                    <td className="px-3 py-2 text-right font-mono text-bm-muted2">{Number(line.percent_complete).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.retainage_amount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.balance_to_finish)}</td>
                    <td className="px-3 py-2 text-center">
                      {line.variance_flag && (
                        <span className="inline-block cursor-help text-amber-400" title={line.variance_reason || "Variance detected"}>&#9888;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t border-bm-border/60 bg-bm-surface/30 font-medium">
                <td className="px-3 py-2 text-bm-muted2" colSpan={2}>TOTALS</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(lines.reduce((s, l) => s + Number(l.scheduled_value), 0))}</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(draw.total_previous_draws)}</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(draw.total_current_draw)}</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(draw.total_materials_stored)}</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(lines.reduce((s, l) => s + Number(l.total_completed), 0))}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(draw.total_retainage_held)}</td>
                <td className="px-3 py-2 text-right font-mono text-bm-text">{formatMoney(lines.reduce((s, l) => s + Number(l.balance_to_finish), 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Invoices tab */}
      {tab === "invoices" && (
        <div className="rounded-xl border border-bm-border/40 p-6">
          {(draw.invoices ?? []).length === 0 ? (
            <p className="text-sm text-bm-muted2 text-center">No invoices attached to this draw.</p>
          ) : (
            <div className="space-y-2">
              {(draw.invoices ?? []).map(inv => (
                <div key={inv.invoice_id} className="flex items-center justify-between rounded-lg border border-bm-border/30 bg-bm-surface/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-bm-text">{inv.invoice_number || "Unnamed Invoice"}</p>
                    <p className="text-xs text-bm-muted2">{inv.file_name} &middot; {formatDate(inv.invoice_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs", inv.match_status === "auto_matched" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : inv.match_status === "disputed" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300")}>
                      {inv.match_status.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-sm text-bm-text">{formatMoney(inv.total_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspections tab */}
      {tab === "inspections" && (
        <div className="rounded-xl border border-bm-border/40 p-6">
          {(draw.inspections ?? []).length === 0 ? (
            <p className="text-sm text-bm-muted2 text-center">No inspections recorded for this draw.</p>
          ) : (
            <div className="space-y-2">
              {(draw.inspections ?? []).map(insp => (
                <div key={insp.inspection_id} className="rounded-lg border border-bm-border/30 bg-bm-surface/20 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-bm-text">{insp.inspector_name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-bm-muted2">{formatDate(insp.inspection_date)}</span>
                      {insp.passed != null && (
                        <span className={cn("rounded-md border px-2 py-0.5 text-xs", insp.passed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300")}>
                          {insp.passed ? "Passed" : "Failed"}
                        </span>
                      )}
                    </div>
                  </div>
                  {insp.findings && <p className="mt-1 text-xs text-bm-muted2">{insp.findings}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit tab placeholder */}
      {tab === "audit" && (
        <div className="rounded-xl border border-bm-border/40 p-6 text-center">
          <p className="text-sm text-bm-muted2">Audit log loaded from /draw-audit endpoint</p>
        </div>
      )}
    </div>
  );
}
v>
  );
}
