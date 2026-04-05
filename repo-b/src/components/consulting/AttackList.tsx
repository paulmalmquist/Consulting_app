"use client";

import { useState } from "react";
import type { Deal, ComputedStatus } from "@/lib/cro-api";
import { logDealActivity } from "@/lib/cro-api";

const STATUS_CONFIG: Record<ComputedStatus, { label: string; border: string; bg: string }> = {
  NeedsAttention: { label: "Needs Attention", border: "border-l-red-400", bg: "bg-red-400/10" },
  ReadyToAct: { label: "Ready to Act", border: "border-l-amber-400", bg: "bg-amber-400/10" },
  Waiting: { label: "Waiting", border: "border-l-blue-400", bg: "bg-blue-400/10" },
  OnTrack: { label: "On Track", border: "border-l-emerald-400", bg: "bg-emerald-400/10" },
  Closed: { label: "Closed", border: "border-l-bm-muted2", bg: "bg-bm-surface/10" },
};

const STATUS_ORDER: ComputedStatus[] = ["NeedsAttention", "ReadyToAct", "Waiting", "OnTrack", "Closed"];

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString()}`;
}

function LogActivityForm({
  deal,
  envId,
  businessId,
  onDone,
}: {
  deal: Deal;
  envId: string;
  businessId: string;
  onDone: () => void;
}) {
  const [type, setType] = useState("email");
  const [subject, setSubject] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      await logDealActivity(deal.crm_opportunity_id, {
        env_id: envId,
        business_id: businessId,
        activity_type: type,
        subject: subject.trim(),
        direction,
        create_next_action: true,
        next_action_description: `Follow up on ${type} — ${subject.trim().slice(0, 60)}`,
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-bm-border/20 px-3 py-2 bg-bm-surface/5">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-1.5 py-1 text-[11px] text-bm-text"
      >
        <option value="email">Email</option>
        <option value="call">Call</option>
        <option value="linkedin">LinkedIn</option>
        <option value="meeting">Meeting</option>
        <option value="note">Note</option>
      </select>
      <select
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        className="rounded border border-bm-border/50 bg-transparent px-1.5 py-1 text-[11px] text-bm-text"
      >
        <option value="outbound">Out</option>
        <option value="inbound">In</option>
      </select>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="What happened?"
        className="flex-1 min-w-[120px] rounded border border-bm-border/50 bg-transparent px-2 py-1 text-[11px] text-bm-text placeholder:text-bm-muted2"
        onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
      />
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !subject.trim()}
        className="rounded border border-bm-accent/40 bg-bm-accent/10 px-2 py-1 text-[10px] font-semibold text-bm-accent disabled:opacity-40"
      >
        {submitting ? "..." : "Log"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="rounded px-1.5 py-1 text-[10px] text-bm-muted2 hover:text-bm-text"
      >
        Cancel
      </button>
    </div>
  );
}

function DealRow({
  deal,
  envId,
  businessId,
  onRefresh,
  stages,
}: {
  deal: Deal;
  envId: string;
  businessId: string;
  onRefresh: () => void;
  stages: { key: string; label: string }[];
}) {
  const [showLog, setShowLog] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const config = STATUS_CONFIG[deal.computed_status] || STATUS_CONFIG.OnTrack;

  const handleAdvance = async (stageKey: string) => {
    setAdvancing(true);
    try {
      await fetch(`/bos/api/consulting/pipeline/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: envId,
          business_id: businessId,
          crm_opportunity_id: deal.crm_opportunity_id,
          to_stage_key: stageKey,
        }),
      });
      onRefresh();
    } finally {
      setAdvancing(false);
    }
  };

  const handleComplete = async () => {
    if (!deal.next_action_id) return;
    await fetch(`/bos/api/consulting/next-actions/${deal.next_action_id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        env_id: envId,
        business_id: businessId,
        outcome_notes: "Completed from Attack List",
      }),
    });
    onRefresh();
  };

  return (
    <div>
      <div className={`grid grid-cols-[1fr_auto] items-center px-3 py-2 border-l-2 ${config.border}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-bm-text truncate">{deal.account_name || deal.name}</p>
            {deal.industry ? (
              <span className="shrink-0 rounded bg-bm-surface/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-bm-muted2">
                {deal.industry}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-bm-muted2">
            <span>{deal.stage_label || "—"}</span>
            <span className="text-bm-border">·</span>
            <span className="font-medium text-bm-text">{formatCurrency(deal.amount)}</span>
            <span className="text-bm-border">·</span>
            <span>Activity {relativeTime(deal.last_activity_at)}</span>
          </div>
          {deal.next_action_description ? (
            <p className="mt-0.5 text-[11px] text-bm-muted2 truncate">
              Next: {deal.next_action_description}
              {deal.next_action_due ? ` (due ${deal.next_action_due})` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-red-400">No next action defined</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setShowLog(!showLog)}
            className="rounded border border-bm-border/50 px-2 py-1 text-[10px] text-bm-muted2 hover:text-bm-text"
          >
            Log
          </button>
          {deal.next_action_id ? (
            <button
              type="button"
              onClick={() => void handleComplete()}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400"
            >
              Done
            </button>
          ) : null}
          <select
            value=""
            onChange={(e) => { if (e.target.value) void handleAdvance(e.target.value); }}
            disabled={advancing}
            className="rounded border border-bm-border/50 bg-transparent px-1.5 py-1 text-[10px] text-bm-muted2"
          >
            <option value="">Advance</option>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {showLog ? (
        <LogActivityForm
          deal={deal}
          envId={envId}
          businessId={businessId}
          onDone={() => { setShowLog(false); onRefresh(); }}
        />
      ) : null}
    </div>
  );
}

export default function AttackList({
  deals,
  envId,
  businessId,
  onRefresh,
  stages,
}: {
  deals: Deal[];
  envId: string;
  businessId: string;
  onRefresh: () => void;
  stages: { key: string; label: string }[];
}) {
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    config: STATUS_CONFIG[status],
    deals: deals.filter((d) => d.computed_status === status),
  })).filter((g) => g.deals.length > 0);

  if (deals.length === 0) {
    return (
      <section className="border border-bm-border/40 rounded">
        <div className="px-3 py-6 text-center">
          <p className="text-sm text-bm-muted2">No deals found.</p>
          <p className="mt-1 text-xs text-bm-muted2">
            Ingest leads from your Job Search directory to populate the pipeline.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bm-border/40">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          Attack List
        </span>
        <span className="text-[10px] text-bm-muted2">{deals.length} deals</span>
      </div>
      {grouped.map(({ status, config, deals: statusDeals }) => (
        <details key={status} open={status === "NeedsAttention" || status === "ReadyToAct"}>
          <summary className={`flex items-center justify-between px-3 py-2 cursor-pointer ${config.bg}`}>
            <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-bm-text">
              {config.label}
            </span>
            <span className="text-[10px] text-bm-muted2">{statusDeals.length}</span>
          </summary>
          <div className="divide-y divide-bm-border/25">
            {statusDeals.map((deal) => (
              <DealRow
                key={deal.crm_opportunity_id}
                deal={deal}
                envId={envId}
                businessId={businessId}
                onRefresh={onRefresh}
                stages={stages}
              />
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}
