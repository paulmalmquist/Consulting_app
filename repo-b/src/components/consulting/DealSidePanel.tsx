"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  fetchOpportunityDetail,
  fetchOpportunityContacts,
  fetchOpportunityStageHistory,
  fetchActivities,
  fetchNextActions,
  completeNextAction,
  type OpportunityDetail,
  type AccountContact,
  type StageHistoryEntry,
  type Activity,
  type NextAction,
} from "@/lib/cro-api";
import { WinstonAssistPanel } from "@/components/consulting/WinstonAssistPanel";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 0) return "future";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type Tab = "summary" | "contacts" | "activity" | "assist";

export function DealSidePanel({
  dealId,
  envId,
  businessId,
  onClose,
  onDataChange,
}: {
  dealId: string;
  envId: string;
  businessId: string;
  onClose: () => void;
  onDataChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [deal, setDeal] = useState<OpportunityDetail | null>(null);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDeal = useCallback(async () => {
    if (!dealId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        fetchOpportunityDetail(dealId, envId, businessId),
        fetchOpportunityContacts(dealId, envId, businessId),
        fetchOpportunityStageHistory(dealId, envId, businessId),
        fetchActivities(envId, businessId, { opportunity_id: dealId, limit: 20 }),
        fetchNextActions(envId, businessId),
      ]);
      if (results[0].status === "fulfilled") setDeal(results[0].value);
      else throw results[0].reason;
      if (results[1].status === "fulfilled") setContacts(results[1].value);
      if (results[2].status === "fulfilled") setHistory(results[2].value);
      if (results[3].status === "fulfilled") setActivities(results[3].value);
      if (results[4].status === "fulfilled") {
        const oppActions = results[4].value.filter(
          (a) => a.entity_id === dealId && (a.status === "pending" || a.status === "in_progress"),
        );
        setNextActions(oppActions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [dealId, envId, businessId]);

  useEffect(() => {
    loadDeal();
  }, [loadDeal]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleCompleteAction(actionId: string) {
    try {
      await completeNextAction(actionId, businessId);
      loadDeal();
      onDataChange();
    } catch {
      // ignore
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "contacts", label: "Contacts" },
    { key: "activity", label: "Activity" },
    { key: "assist", label: "Assist" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full md:w-[480px] bg-bm-bg border-l border-bm-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bm-border/50">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-5 w-40 bg-bm-surface/60 rounded animate-pulse" />
            ) : deal ? (
              <>
                <h2 className="text-sm font-semibold text-bm-text truncate">
                  {deal.account_name || "—"}
                </h2>
                <p className="text-xs text-bm-muted2 truncate">
                  {deal.name} · {fmtCurrency(deal.amount)} · {deal.stage_label || deal.stage_key}
                </p>
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-bm-muted2 hover:text-bm-text hover:bg-bm-surface/30"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bm-border/30 px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "border-bm-accent text-bm-text"
                  : "border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-bm-surface/40 rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-sm text-red-400">{error}</div>
          ) : tab === "summary" ? (
            <SummaryTab deal={deal} nextActions={nextActions} onComplete={handleCompleteAction} />
          ) : tab === "contacts" ? (
            <ContactsTab contacts={contacts} />
          ) : tab === "activity" ? (
            <ActivityTab activities={activities} history={history} />
          ) : tab === "assist" ? (
            <WinstonAssistPanel
              dealId={dealId}
              envId={envId}
              businessId={businessId}
              stageKey={deal?.stage_key || undefined}
              onActionApplied={() => { loadDeal(); onDataChange(); }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function SummaryTab({
  deal,
  nextActions,
  onComplete,
}: {
  deal: OpportunityDetail | null;
  nextActions: NextAction[];
  onComplete: (id: string) => void;
}) {
  if (!deal) return null;

  return (
    <div className="space-y-4">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2">
        <MetricBox label="Amount" value={fmtCurrency(deal.amount)} />
        <MetricBox label="Stage" value={deal.stage_label || deal.stage_key || "—"} />
        <MetricBox label="Close date" value={deal.expected_close_date || "—"} />
        <MetricBox label="Status" value={deal.status} />
      </div>

      {/* Next Actions */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-bm-muted2 mb-2">
          Next Actions
        </h3>
        {nextActions.length === 0 ? (
          <p className="text-xs text-red-400">No next action defined. Use Assist to generate one.</p>
        ) : (
          <div className="space-y-1.5">
            {nextActions.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-bm-border/40 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-bm-text truncate">{a.description}</p>
                  <p className="text-[10px] text-bm-muted2">
                    {a.action_type} · due {a.due_date} · {a.priority}
                  </p>
                </div>
                <button
                  onClick={() => onComplete(a.id)}
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-400/10"
                >
                  Done
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close info */}
      {deal.status !== "open" ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-bm-muted2 mb-2">
            Close Info
          </h3>
          {deal.close_reason ? (
            <p className="text-xs text-bm-text">{deal.close_reason}</p>
          ) : null}
          {deal.close_notes ? (
            <p className="text-xs text-bm-muted2 mt-1">{deal.close_notes}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ContactsTab({ contacts }: { contacts: AccountContact[] }) {
  if (contacts.length === 0) {
    return <p className="text-xs text-bm-muted2">No contacts found for this deal.</p>;
  }

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.crm_contact_id} className="rounded-lg border border-bm-border/40 px-3 py-2">
          <p className="text-sm font-medium text-bm-text">{c.full_name}</p>
          {c.title ? <p className="text-xs text-bm-muted2">{c.title}</p> : null}
          <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-bm-muted">
            {c.email ? <span>{c.email}</span> : null}
            {c.phone ? <span>{c.phone}</span> : null}
            {c.decision_role ? (
              <span className="text-bm-accent/80">{c.decision_role}</span>
            ) : null}
            {c.last_outreach_at ? (
              <span>Last outreach: {relativeTime(c.last_outreach_at)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTab({
  activities,
  history,
}: {
  activities: Activity[];
  history: StageHistoryEntry[];
}) {
  // Merge activities and stage history into a timeline
  type TimelineItem =
    | { type: "activity"; data: Activity; date: string }
    | { type: "stage"; data: StageHistoryEntry; date: string };

  const items: TimelineItem[] = [
    ...activities.map((a) => ({
      type: "activity" as const,
      data: a,
      date: a.activity_at || a.created_at,
    })),
    ...history.map((h) => ({
      type: "stage" as const,
      data: h,
      date: h.changed_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (items.length === 0) {
    return <p className="text-xs text-bm-muted2">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 py-1.5 border-b border-bm-border/20 last:border-b-0">
          <div className="w-1 shrink-0 rounded-full bg-bm-border/40 mt-1" style={{ minHeight: 12 }} />
          <div className="flex-1 min-w-0">
            {item.type === "activity" ? (
              <p className="text-xs text-bm-text">
                <span className="font-medium">{item.data.activity_type}</span>
                {item.data.subject ? ` — ${item.data.subject}` : ""}
              </p>
            ) : (
              <p className="text-xs text-bm-text">
                Stage: {item.data.from_stage_label || "—"} → {item.data.to_stage_label || "—"}
                {item.data.note ? ` (${item.data.note})` : ""}
              </p>
            )}
            <p className="text-[10px] text-bm-muted2 mt-0.5">
              {relativeTime(item.date)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bm-border/30 bg-bm-surface/15 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-bm-muted2">{label}</p>
      <p className="text-sm font-semibold text-bm-text mt-0.5">{value}</p>
    </div>
  );
}
