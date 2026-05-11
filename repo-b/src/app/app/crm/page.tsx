"use client";

import { useCallback, useEffect, useState } from "react";
import {
  closeOpportunity,
  listCrmOpportunities,
  reopenOpportunity,
  type CrmOpportunity,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";
import { cn } from "@/lib/cn";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clock,
  RotateCcw,
  X,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "active" | "dead";

const DEAD_REASONS: Array<{ key: string; label: string; color: string; description: string }> = [
  { key: "lost",         label: "Lost",         color: "text-red-400",    description: "We pitched — they went elsewhere or passed" },
  { key: "ghosted",      label: "Ghosted",       color: "text-orange-400", description: "Contacted, never responded" },
  { key: "disqualified", label: "Not a fit",     color: "text-amber-400",  description: "We decided not to pursue" },
  { key: "deferred",     label: "Deferred",      color: "text-blue-400",   description: "Not now — revisit later" },
  { key: "removed",      label: "Removed",       color: "text-bm-muted2",  description: "Cleaned from pipeline" },
];

const ACTIVE_STAGE_ORDER = [
  "research", "identified", "contacted", "engaged",
  "meeting", "qualified", "proposal", "negotiation",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reasonMeta(key: string | null | undefined) {
  return DEAD_REASONS.find((r) => r.key === key) ?? {
    key: "removed",
    label: key ?? "Closed",
    color: "text-bm-muted2",
    description: "",
  };
}

function stageColor(key: string | null | undefined) {
  switch (key) {
    case "research":      return "text-bm-muted2";
    case "identified":    return "text-sky-400";
    case "contacted":     return "text-blue-400";
    case "engaged":       return "text-indigo-400";
    case "meeting":       return "text-violet-400";
    case "qualified":     return "text-purple-400";
    case "proposal":      return "text-amber-400";
    case "negotiation":   return "text-orange-400";
    default:              return "text-bm-muted2";
  }
}

function closedAgoLabel(closedAt: string | null | undefined) {
  if (!closedAt) return null;
  const diff = Date.now() - new Date(closedAt).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Close dialog ─────────────────────────────────────────────────────────────

function CloseDialog({
  opportunity,
  businessId,
  onClose,
  onConfirm,
}: {
  opportunity: CrmOpportunity;
  businessId: string;
  onClose: () => void;
  onConfirm: (opp: CrmOpportunity) => void;
}) {
  const [reason, setReason] = useState("ghosted");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const updated = await closeOpportunity(opportunity.crm_opportunity_id, {
        business_id: businessId,
        close_reason: reason,
        close_notes: notes || undefined,
      });
      onConfirm(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to close opportunity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-bm-border/30 bg-bm-bg p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bm-muted2">Close deal</p>
            <p className="mt-0.5 text-[15px] font-semibold text-bm-text">{opportunity.name}</p>
          </div>
          <button onClick={onClose} className="mt-0.5 text-bm-muted2 hover:text-bm-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[12px] font-medium text-bm-muted2">Reason</p>
          <div className="space-y-1">
            {DEAD_REASONS.map((r) => (
              <label
                key={r.key}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  reason === r.key
                    ? "border-bm-accent/40 bg-bm-accent/5"
                    : "border-bm-border/20 hover:bg-bm-surface/20"
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="accent-bm-accent"
                />
                <div>
                  <span className={cn("text-[13px] font-medium", r.color)}>{r.label}</span>
                  <p className="text-[11px] text-bm-muted2">{r.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[12px] font-medium text-bm-muted2">Notes (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Why did this close? What would change the outcome?"
            className="w-full rounded border border-bm-border/30 bg-bm-surface/20 px-3 py-2 text-[13px] text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:border-bm-accent/50 resize-none"
          />
        </div>

        {err && (
          <div className="flex items-center gap-1.5 text-[12px] text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-md bg-bm-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50 hover:bg-bm-accent/90 transition-colors"
          >
            {saving ? "Closing…" : "Close deal"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-[13px] text-bm-muted hover:text-bm-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active pipeline card ─────────────────────────────────────────────────────

function ActiveCard({
  opp,
  onClose,
}: {
  opp: CrmOpportunity;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const missingAngle = !opp.winston_angle;
  const missingContact = !opp.contact_name;

  return (
    <div className="rounded-lg border border-bm-border/20 bg-bm-surface/10 overflow-hidden">
      <div
        className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-bm-surface/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-1 shrink-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-bm-muted2" />
            : <ChevronRight className="h-4 w-4 text-bm-muted2" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-[13px] font-medium text-bm-text truncate">{opp.name}</p>
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.1em]", stageColor(opp.stage_key))}>
              {opp.stage_label ?? opp.stage_key}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {opp.contact_name && (
              <span className="text-[12px] text-bm-muted2">{opp.contact_name}</span>
            )}
            {opp.account_industry && (
              <span className="text-[11px] text-bm-muted2">{opp.account_industry}</span>
            )}
            {opp.next_action && (
              <span className="flex items-center gap-1 text-[11px] text-amber-400">
                <Clock className="h-3 w-3" />
                {opp.next_action}
              </span>
            )}
            {missingContact && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">no contact</span>
            )}
            {missingAngle && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">no angle</span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="shrink-0 rounded px-2 py-1 text-[11px] text-bm-muted2 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          title="Close deal"
        >
          Close
        </button>
      </div>

      {expanded && (
        <div className="border-t border-bm-border/10 px-4 py-3 space-y-2 bg-bm-surface/5">
          {opp.thesis && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Thesis</p>
              <p className="mt-0.5 text-[12px] text-bm-text">{opp.thesis}</p>
            </div>
          )}
          {opp.pain && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Pain</p>
              <p className="mt-0.5 text-[12px] text-bm-text">{opp.pain}</p>
            </div>
          )}
          {opp.winston_angle && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Winston angle</p>
              <p className="mt-0.5 text-[12px] text-bm-text">{opp.winston_angle}</p>
            </div>
          )}
          {opp.contact_email && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2">Contact</p>
              <p className="mt-0.5 text-[12px] text-bm-text">
                {opp.contact_name} · {opp.contact_title} · {opp.contact_email}
              </p>
            </div>
          )}
          {opp.last_outreach_at && (
            <p className="text-[11px] text-bm-muted2">
              Last outreach: {new Date(opp.last_outreach_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dead pile card ───────────────────────────────────────────────────────────

function DeadCard({
  opp,
  businessId,
  onReopen,
}: {
  opp: CrmOpportunity;
  businessId: string;
  onReopen: (id: string) => void;
}) {
  const [reopening, setReopening] = useState(false);
  const meta = reasonMeta(opp.close_reason);

  async function handleReopen() {
    setReopening(true);
    try {
      await reopenOpportunity(opp.crm_opportunity_id, businessId);
      onReopen(opp.crm_opportunity_id);
    } catch {
      setReopening(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-bm-border/10 bg-bm-surface/5 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-[13px] text-bm-muted line-through truncate">{opp.name}</p>
          <span className={cn("text-[11px] font-medium no-underline", meta.color)}>
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {opp.account_name && (
            <span className="text-[11px] text-bm-muted2">{opp.account_name}</span>
          )}
          {opp.close_notes && (
            <span className="text-[11px] text-bm-muted2 truncate max-w-xs">· {opp.close_notes}</span>
          )}
          {opp.closed_at && (
            <span className="text-[11px] text-bm-muted2">· {closedAgoLabel(opp.closed_at)}</span>
          )}
        </div>
      </div>
      <button
        onClick={handleReopen}
        disabled={reopening}
        className="shrink-0 flex items-center gap-1 rounded px-2 py-1 text-[11px] text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text disabled:opacity-50 transition-colors"
        title="Re-open this deal"
      >
        <RotateCcw className="h-3 w-3" />
        {reopening ? "…" : "Re-open"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const { businessId } = useBusinessContext();
  const [opps, setOpps] = useState<CrmOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [closingOpp, setClosingOpp] = useState<CrmOpportunity | null>(null);
  const [deadFilter, setDeadFilter] = useState<string>("all");

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listCrmOpportunities(businessId);
      setOpps(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Split into active vs dead
  const active = opps.filter((o) => o.status === "open" || o.status === "deferred" && tab === "active");
  const dead = opps.filter((o) => o.status === "lost" || o.status === "deferred");
  const won = opps.filter((o) => o.status === "won");

  // Group active by stage
  const byStage: Record<string, CrmOpportunity[]> = {};
  for (const opp of active) {
    const key = opp.stage_key ?? "unknown";
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(opp);
  }
  const stageKeys = ACTIVE_STAGE_ORDER.filter((k) => byStage[k]?.length);

  // Filter dead
  const filteredDead = deadFilter === "all"
    ? dead
    : dead.filter((o) => o.close_reason === deadFilter);

  // Group dead by reason
  const deadByReason: Record<string, CrmOpportunity[]> = {};
  for (const opp of filteredDead) {
    const key = opp.close_reason ?? "removed";
    if (!deadByReason[key]) deadByReason[key] = [];
    deadByReason[key].push(opp);
  }

  function handleClosed(updated: CrmOpportunity) {
    setOpps((prev) =>
      prev.map((o) =>
        o.crm_opportunity_id === updated.crm_opportunity_id ? { ...o, ...updated } : o
      )
    );
    setClosingOpp(null);
  }

  function handleReopened(id: string) {
    setOpps((prev) =>
      prev.map((o) =>
        o.crm_opportunity_id === id
          ? { ...o, status: "open", close_reason: null, close_notes: null, closed_at: null }
          : o
      )
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-bm-muted2">Novendor</p>
          <h1 className="text-xl font-semibold tracking-tight text-bm-text">Pipeline</h1>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-bm-muted2">
          <span className="text-bm-text font-medium">{active.length}</span> active
          <span className="mx-1 text-bm-border/50">·</span>
          <span className="text-bm-text font-medium">{dead.length}</span> closed
          <span className="mx-1 text-bm-border/50">·</span>
          <span className="text-emerald-400 font-medium">{won.length}</span> won
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bm-border/20 pb-0">
        {(["active", "dead"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-bm-accent text-bm-text"
                : "border-transparent text-bm-muted hover:text-bm-text"
            )}
          >
            {t === "active" ? `Active (${active.length})` : `Dead / Closed (${dead.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="py-10 text-center text-[13px] text-bm-muted2">Loading…</div>
      )}

      {/* ── Active tab ── */}
      {!loading && tab === "active" && (
        <div className="space-y-6">
          {stageKeys.length === 0 && (
            <p className="text-[13px] text-bm-muted2">No active deals.</p>
          )}
          {stageKeys.map((stage) => {
            const items = byStage[stage] ?? [];
            return (
              <div key={stage}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn("font-mono text-[10px] uppercase tracking-[0.2em]", stageColor(stage))}>
                    {stage}
                  </span>
                  <span className="rounded-full bg-bm-surface/30 px-1.5 py-0.5 font-mono text-[10px] text-bm-muted2">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {items.map((opp) => (
                    <ActiveCard
                      key={opp.crm_opportunity_id}
                      opp={opp}
                      onClose={() => setClosingOpp(opp)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Won section at bottom */}
          {won.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400">Won</span>
                <span className="rounded-full bg-bm-surface/30 px-1.5 py-0.5 font-mono text-[10px] text-bm-muted2">
                  {won.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {won.map((opp) => (
                  <div key={opp.crm_opportunity_id} className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-emerald-400 truncate">{opp.name}</p>
                      {opp.account_name && (
                        <p className="text-[11px] text-bm-muted2">{opp.account_name}</p>
                      )}
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-400/50" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dead tab ── */}
      {!loading && tab === "dead" && (
        <div className="space-y-5">
          {/* Reason filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDeadFilter("all")}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                deadFilter === "all"
                  ? "bg-bm-surface/40 text-bm-text"
                  : "text-bm-muted hover:text-bm-text"
              )}
            >
              All ({dead.length})
            </button>
            {DEAD_REASONS.map((r) => {
              const count = dead.filter((o) => o.close_reason === r.key).length;
              if (count === 0) return null;
              return (
                <button
                  key={r.key}
                  onClick={() => setDeadFilter(r.key)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                    deadFilter === r.key
                      ? "bg-bm-surface/40 text-bm-text"
                      : "text-bm-muted hover:text-bm-text"
                  )}
                >
                  <span className={r.color}>{r.label}</span>
                  <span className="ml-1 text-bm-muted2">({count})</span>
                </button>
              );
            })}
          </div>

          {filteredDead.length === 0 && (
            <p className="text-[13px] text-bm-muted2">Nothing here yet. Close a deal from the Active tab to track what didn&apos;t land and why.</p>
          )}

          {/* Group by reason when showing all */}
          {deadFilter === "all"
            ? DEAD_REASONS.filter((r) => deadByReason[r.key]?.length).map((r) => (
                <div key={r.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={cn("font-mono text-[10px] uppercase tracking-[0.2em]", r.color)}>
                      {r.label}
                    </span>
                    <span className="rounded-full bg-bm-surface/30 px-1.5 py-0.5 font-mono text-[10px] text-bm-muted2">
                      {deadByReason[r.key].length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {deadByReason[r.key].map((opp) => (
                      <DeadCard
                        key={opp.crm_opportunity_id}
                        opp={opp}
                        businessId={businessId ?? ""}
                        onReopen={handleReopened}
                      />
                    ))}
                  </div>
                </div>
              ))
            : (
                <div className="space-y-1.5">
                  {filteredDead.map((opp) => (
                    <DeadCard
                      key={opp.crm_opportunity_id}
                      opp={opp}
                      businessId={businessId ?? ""}
                      onReopen={handleReopened}
                    />
                  ))}
                </div>
              )
          }

          {/* Pattern callout — only when there's enough data */}
          {dead.length >= 3 && (
            <div className="rounded-lg border border-bm-border/20 bg-bm-surface/10 p-4 space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bm-muted2">Pattern</p>
              <p className="text-[12px] text-bm-muted">
                {dead.filter((o) => o.close_reason === "ghosted").length} ghosted ·{" "}
                {dead.filter((o) => o.close_reason === "lost").length} lost ·{" "}
                {dead.filter((o) => o.close_reason === "disqualified").length} disqualified ·{" "}
                {dead.filter((o) => o.close_reason === "deferred").length} deferred
              </p>
              <p className="text-[11px] text-bm-muted2">
                High ghost rate = outreach timing or targeting. High lost rate = demo or proposal gap.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Close dialog */}
      {closingOpp && businessId && (
        <CloseDialog
          opportunity={closingOpp}
          businessId={businessId}
          onClose={() => setClosingOpp(null)}
          onConfirm={handleClosed}
        />
      )}
    </div>
  );
}
