"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { X, ExternalLink, Mail, Phone, Copy, Check } from "lucide-react";
import { GenerateActionsModal } from "@/components/consulting/execution/GenerateActionsModal";
import {
  completeNextAction,
  convertDealToEngagement,
  createContact,
  createNextAction,
  draftOpportunityOutreach,
  fetchActivities,
  fetchExecutionDetail,
  fetchNextActions,
  fetchOpportunityContacts,
  fetchOpportunityDetail,
  fetchOutreachLog,
  generateOpportunityFollowups,
  generateOpportunityMeetingPrep,
  logOutreach,
  type AccountContact,
  type Activity,
  type ExecutionDetail,
  type NextAction,
  type OpportunityDetail,
  type OutreachLogEntry,
} from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return "—";
  }
}

// Simulate tab kept in union but not rendered
type Tab = "summary" | "contacts" | "notes" | "outreach" | "execution" | "drafts" | "prep" | "simulate";

const RELATIONSHIP_COLORS: Record<string, string> = {
  champion: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  hot: "text-orange-400 border-orange-400/40 bg-orange-400/10",
  warm: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  cold: "text-slate-400 border-slate-400/40 bg-slate-400/10",
};

const ROLE_COLORS: Record<string, string> = {
  decision_maker: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  champion: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  influencer: "text-violet-400 border-violet-400/40 bg-violet-400/10",
  blocker: "text-red-400 border-red-400/40 bg-red-400/10",
  user: "text-slate-400 border-slate-400/40 bg-slate-400/10",
};

const CHANNEL_COLORS: Record<string, string> = {
  email: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  linkedin: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  phone: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  email: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  linkedin: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",
  meeting: "text-violet-400 border-violet-400/40 bg-violet-400/10",
  research: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  internal: "text-slate-400 border-slate-400/40 bg-slate-400/10",
};

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Add contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    full_name: "", title: "", email: "", phone: "",
    linkedin_url: "", relationship_strength: "", decision_role: "", notes: "",
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Log outreach form
  const [showLogOutreach, setShowLogOutreach] = useState(false);
  const [outreachForm, setOutreachForm] = useState({
    channel: "email", crm_contact_id: "", subject: "", body_preview: "",
  });
  const [outreachSaving, setOutreachSaving] = useState(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);

  // Add next action form
  const [showAddAction, setShowAddAction] = useState(false);
  const [actionForm, setActionForm] = useState({
    description: "", action_type: "email", due_date: "", priority: "normal",
  });
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Copy state for draft blocks
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadDeal = useCallback(async () => {
    if (!dealId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [dealRes, activityRes, actionRes, executionRes, contactsRes] = await Promise.all([
        fetchOpportunityDetail(dealId, envId, businessId),
        fetchActivities(envId, businessId, { opportunity_id: dealId, limit: 30 }),
        fetchNextActions(envId, businessId),
        fetchExecutionDetail(dealId, envId, businessId),
        fetchOpportunityContacts(dealId, envId, businessId),
      ]);
      setDeal(dealRes);
      setActivities(activityRes);
      setNextActions(
        actionRes.filter((a) => a.entity_id === dealId && (a.status === "pending" || a.status === "in_progress")),
      );
      setExecution(executionRes);
      setContacts(contactsRes);
      // Fetch outreach log for this account
      if (dealRes.crm_account_id) {
        try {
          const outreachRes = await fetchOutreachLog(envId, businessId, { crm_account_id: dealRes.crm_account_id });
          setOutreachLog(outreachRes);
        } catch {
          setOutreachLog([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [businessId, dealId, envId]);

  useEffect(() => { void loadDeal(); }, [loadDeal]);

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
      await loadDeal();
      onDataChange();
    } catch {
      // silent
    }
  }

  async function handleAddContact() {
    if (!contactForm.full_name.trim()) {
      setContactError("Full name is required.");
      return;
    }
    setContactSaving(true);
    setContactError(null);
    try {
      await createContact({
        env_id: envId,
        business_id: businessId,
        crm_account_id: deal?.crm_account_id ?? undefined,
        full_name: contactForm.full_name.trim(),
        email: contactForm.email || undefined,
        phone: contactForm.phone || undefined,
        title: contactForm.title || undefined,
        linkedin_url: contactForm.linkedin_url || undefined,
        relationship_strength: contactForm.relationship_strength || undefined,
        decision_role: contactForm.decision_role || undefined,
        notes: contactForm.notes || undefined,
      });
      setContactForm({ full_name: "", title: "", email: "", phone: "", linkedin_url: "", relationship_strength: "", decision_role: "", notes: "" });
      setShowAddContact(false);
      await loadDeal();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Failed to add contact.");
    } finally {
      setContactSaving(false);
    }
  }

  async function handleLogOutreach() {
    if (!deal?.crm_account_id) {
      setOutreachError("No account linked to this deal.");
      return;
    }
    setOutreachSaving(true);
    setOutreachError(null);
    try {
      await logOutreach({
        env_id: envId,
        business_id: businessId,
        crm_account_id: deal.crm_account_id,
        crm_contact_id: outreachForm.crm_contact_id || undefined,
        channel: outreachForm.channel,
        subject: outreachForm.subject || undefined,
        body_preview: outreachForm.body_preview || undefined,
      });
      setOutreachForm({ channel: "email", crm_contact_id: "", subject: "", body_preview: "" });
      setShowLogOutreach(false);
      // Reload outreach log
      const updated = await fetchOutreachLog(envId, businessId, { crm_account_id: deal.crm_account_id });
      setOutreachLog(updated);
    } catch (err) {
      setOutreachError(err instanceof Error ? err.message : "Failed to log outreach.");
    } finally {
      setOutreachSaving(false);
    }
  }

  async function handleAddAction() {
    if (!actionForm.description.trim() || !actionForm.due_date) {
      setActionError("Description and due date are required.");
      return;
    }
    setActionSaving(true);
    setActionError(null);
    try {
      await createNextAction({
        env_id: envId,
        business_id: businessId,
        entity_type: "opportunity",
        entity_id: dealId,
        action_type: actionForm.action_type,
        description: actionForm.description.trim(),
        due_date: actionForm.due_date,
        priority: actionForm.priority,
      });
      setActionForm({ description: "", action_type: "email", due_date: "", priority: "normal" });
      setShowAddAction(false);
      await loadDeal();
      onDataChange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create action.");
    } finally {
      setActionSaving(false);
    }
  }

  async function runQuickAction(kind: "draft" | "followups" | "prep") {
    setBusyAction(kind);
    setError(null);
    try {
      if (kind === "draft") {
        await draftOpportunityOutreach(dealId, { env_id: envId, business_id: businessId });
      } else if (kind === "followups") {
        await generateOpportunityFollowups(dealId, { env_id: envId, business_id: businessId });
      } else {
        await generateOpportunityMeetingPrep(dealId, { env_id: envId, business_id: businessId });
      }
      await loadDeal();
      onDataChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quick action failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // silent
    }
  }

  // Simulate deferred until contacts/notes/outreach baseline is real
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "summary", label: "Summary" },
    { key: "contacts", label: `Contacts${contacts.length > 0 ? ` (${contacts.length})` : ""}` },
    { key: "notes", label: "Notes" },
    { key: "outreach", label: "Outreach" },
    { key: "execution", label: "Execution" },
    { key: "drafts", label: "Drafts" },
    { key: "prep", label: "Prep" },
  ];

  const draftStack = execution?.auto_draft_stack ?? {};
  const initialDraft = draftStack.initial_outreach as { subject?: string; body?: string } | undefined;
  const followups = (draftStack.followups as Array<{ subject?: string; body?: string; angle_key?: string }> | undefined) ?? [];
  const prep = draftStack.meeting_prep as {
    company_summary?: string;
    likely_pain_points?: string[];
    tailored_demo_path?: string;
    key_questions?: string[];
    risks_to_watch?: string[];
  } | undefined;

  const topAction = nextActions[0] ?? null;
  const hasNoAction = nextActions.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full flex-col overflow-hidden border-l border-bm-border bg-bm-bg shadow-2xl md:w-[580px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-bm-border/50 px-4 py-3" style={{ minHeight: 52 }}>
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-5 w-40 animate-pulse rounded bg-bm-surface/60" />
            ) : deal ? (
              <>
                <h2 className="truncate text-sm font-semibold text-bm-text">{deal.account_name || "—"}</h2>
                <p className="truncate text-xs text-bm-muted2">
                  {deal.name} · {deal.stage_label || "—"} · {fmtCurrency(deal.amount)}
                </p>
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bm-border/30 px-4 overflow-x-auto scrollbar-none">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex-shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                tab === item.key ? "border-bm-accent text-bm-text" : "border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-bm-surface/40" />)}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>
          ) : tab === "summary" ? (
            <SummaryTab
              deal={deal}
              execution={execution}
              nextActions={nextActions}
              contacts={contacts}
              activities={activities}
              outreachLog={outreachLog}
              hasNoAction={hasNoAction}
              topAction={topAction}
              onCompleteAction={handleCompleteAction}
              onAddAction={() => { setShowAddAction(true); setTab("execution"); }}
            />
          ) : tab === "contacts" ? (
            <ContactsTab
              contacts={contacts}
              showAddContact={showAddContact}
              setShowAddContact={setShowAddContact}
              contactForm={contactForm}
              setContactForm={setContactForm}
              contactSaving={contactSaving}
              contactError={contactError}
              onAddContact={handleAddContact}
            />
          ) : tab === "notes" ? (
            <NotesTab activities={activities} />
          ) : tab === "outreach" ? (
            <OutreachTab
              outreachLog={outreachLog}
              contacts={contacts}
              showLogOutreach={showLogOutreach}
              setShowLogOutreach={setShowLogOutreach}
              outreachForm={outreachForm}
              setOutreachForm={setOutreachForm}
              outreachSaving={outreachSaving}
              outreachError={outreachError}
              onLogOutreach={handleLogOutreach}
            />
          ) : tab === "execution" ? (
            <ExecutionTab
              execution={execution}
              nextActions={nextActions}
              hasNoAction={hasNoAction}
              topAction={topAction}
              busyAction={busyAction}
              showAddAction={showAddAction}
              setShowAddAction={setShowAddAction}
              actionForm={actionForm}
              setActionForm={setActionForm}
              actionSaving={actionSaving}
              actionError={actionError}
              onCompleteAction={handleCompleteAction}
              onAddAction={handleAddAction}
              onQuickAction={runQuickAction}
              dealId={dealId}
              envId={envId}
              businessId={businessId}
            />
          ) : tab === "drafts" ? (
            <DraftsTab
              initialDraft={initialDraft}
              followups={followups}
              busyAction={busyAction}
              copiedKey={copiedKey}
              onCopy={copyToClipboard}
              onDraft={() => void runQuickAction("draft")}
            />
          ) : tab === "prep" ? (
            <PrepTab
              prep={prep}
              execution={execution}
              busyAction={busyAction}
              onPrep={() => void runQuickAction("prep")}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({
  deal,
  execution,
  nextActions,
  contacts,
  activities,
  outreachLog,
  hasNoAction,
  topAction,
  onCompleteAction,
  onAddAction,
}: {
  deal: OpportunityDetail | null;
  execution: ExecutionDetail | null;
  nextActions: NextAction[];
  contacts: AccountContact[];
  activities: Activity[];
  outreachLog: OutreachLogEntry[];
  hasNoAction: boolean;
  topAction: NextAction | null;
  onCompleteAction: (id: string) => void;
  onAddAction: () => void;
}) {
  const topContact = contacts[0];
  const contactLabel = contacts.length === 0
    ? "None"
    : contacts.length === 1
    ? topContact?.full_name ?? "1 contact"
    : `${topContact?.full_name ?? contacts[0].full_name} +${contacts.length - 1}`;

  return (
    <div className="space-y-4">
      {/* Next action — dominates */}
      {hasNoAction ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-1">No next action defined — this deal is stalled</p>
          <p className="text-xs text-red-400/70 mb-3">You cannot progress this deal without a defined next move.</p>
          <button
            onClick={onAddAction}
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
          >
            + Define Next Action
          </button>
        </div>
      ) : topAction ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70 mb-1">Next Move</p>
          <p className="text-sm font-medium text-bm-text mb-1">→ {topAction.description}</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-bm-muted2">
              {topAction.action_type} · Due {fmtDate(topAction.due_date)} · {topAction.priority}
            </p>
            <button
              onClick={() => onCompleteAction(topAction.id)}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-400/10"
            >
              Mark Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Two-column reality / thesis grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <SectionTitle title="Reality" />
          <FactRow label="Contacts" value={contactLabel} dim={contacts.length === 0} />
          <FactRow label="Last touch" value={fmtRelative(activities[0]?.activity_at ?? execution?.card.last_activity_at)} />
          <FactRow label="Outreach logged" value={String(outreachLog.length)} dim={outreachLog.length === 0} />
          <FactRow label="Stage" value={deal?.stage_label ?? "—"} />
          <FactRow label="Amount" value={fmtCurrency(deal?.amount)} />
        </div>
        <div className="space-y-2">
          <SectionTitle title="Thesis" />
          <FactBlock label="Pain" value={execution?.card.pain_hypothesis} />
          <FactBlock label="We replace" value={execution?.card.value_prop} />
          <FactBlock label="ROI angle" value={execution?.card.demo_angle} />
        </div>
      </div>

      {/* Notes preview */}
      <div>
        <SectionTitle title="Notes Preview" />
        {activities.length > 0 ? (
          <div className="mt-1.5 rounded-lg border border-bm-border/40 px-3 py-2">
            <p className="text-xs text-bm-muted2">{fmtDate(activities[0].activity_at)} · {activities[0].activity_type}</p>
            <p className="text-xs text-bm-text mt-0.5">{activities[0].subject || "(no subject)"}</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-bm-muted2">No notes yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Contacts Tab ────────────────────────────────────────────────────────────

function ContactsTab({
  contacts,
  showAddContact,
  setShowAddContact,
  contactForm,
  setContactForm,
  contactSaving,
  contactError,
  onAddContact,
}: {
  contacts: AccountContact[];
  showAddContact: boolean;
  setShowAddContact: (v: boolean) => void;
  contactForm: { full_name: string; title: string; email: string; phone: string; linkedin_url: string; relationship_strength: string; decision_role: string; notes: string };
  setContactForm: Dispatch<SetStateAction<{ full_name: string; title: string; email: string; phone: string; linkedin_url: string; relationship_strength: string; decision_role: string; notes: string }>>;
  contactSaving: boolean;
  contactError: string | null;
  onAddContact: () => void;
}) {
  return (
    <div className="space-y-3">
      {contacts.length === 0 && !showAddContact ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-5">
          <p className="text-sm font-semibold text-amber-400 mb-1">You cannot progress this deal without a real contact.</p>
          <p className="text-xs text-amber-400/70 mb-4">→ Add a contact before sending outreach.</p>
          <button
            onClick={() => setShowAddContact(true)}
            className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10"
          >
            + Add Contact
          </button>
        </div>
      ) : (
        <>
          {contacts.map((c) => (
            <div key={c.crm_contact_id} className="rounded-lg border border-bm-border/40 px-3 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-bm-text">{c.full_name}</p>
                  {c.title && <p className="text-xs text-bm-muted2">{c.title}</p>}
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {c.decision_role && (
                    <Badge label={c.decision_role.replace("_", " ")} colorClass={ROLE_COLORS[c.decision_role] ?? "text-slate-400 border-slate-400/40 bg-slate-400/10"} />
                  )}
                  {c.relationship_strength && (
                    <Badge label={c.relationship_strength} colorClass={RELATIONSHIP_COLORS[c.relationship_strength] ?? "text-slate-400 border-slate-400/40 bg-slate-400/10"} />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-bm-muted2">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-bm-text">
                    <Mail size={11} />{c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-bm-text">
                    <Phone size={11} />{c.phone}
                  </a>
                )}
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-bm-text">
                    <ExternalLink size={11} />LinkedIn
                  </a>
                )}
              </div>
              {c.last_outreach_at && (
                <p className="text-[10px] text-bm-muted2">Last outreach: {fmtRelative(c.last_outreach_at)}</p>
              )}
            </div>
          ))}
          {!showAddContact && (
            <button
              onClick={() => setShowAddContact(true)}
              className="w-full rounded-lg border border-dashed border-bm-border/40 py-2 text-xs text-bm-muted2 hover:border-bm-border hover:text-bm-text"
            >
              + Add Contact
            </button>
          )}
        </>
      )}

      {showAddContact && (
        <div className="rounded-lg border border-bm-border/40 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-bm-text">New Contact</p>
          {contactError && (
            <p className="text-xs text-red-400">{contactError}</p>
          )}
          <FormInput label="Full name *" value={contactForm.full_name} onChange={(v) => setContactForm({ ...contactForm, full_name: v })} />
          <FormInput label="Title" value={contactForm.title} onChange={(v) => setContactForm({ ...contactForm, title: v })} />
          <FormInput label="Email" value={contactForm.email} onChange={(v) => setContactForm({ ...contactForm, email: v })} type="email" />
          <FormInput label="Phone" value={contactForm.phone} onChange={(v) => setContactForm({ ...contactForm, phone: v })} />
          <FormInput label="LinkedIn URL" value={contactForm.linkedin_url} onChange={(v) => setContactForm({ ...contactForm, linkedin_url: v })} />
          <div className="grid grid-cols-2 gap-2">
            <FormSelect
              label="Relationship"
              value={contactForm.relationship_strength}
              onChange={(v) => setContactForm({ ...contactForm, relationship_strength: v })}
              options={[
                { value: "", label: "—" },
                { value: "cold", label: "Cold" },
                { value: "warm", label: "Warm" },
                { value: "hot", label: "Hot" },
                { value: "champion", label: "Champion" },
              ]}
            />
            <FormSelect
              label="Role"
              value={contactForm.decision_role}
              onChange={(v) => setContactForm({ ...contactForm, decision_role: v })}
              options={[
                { value: "", label: "—" },
                { value: "champion", label: "Champion" },
                { value: "decision_maker", label: "Decision Maker" },
                { value: "influencer", label: "Influencer" },
                { value: "blocker", label: "Blocker" },
                { value: "user", label: "User" },
              ]}
            />
          </div>
          <FormTextarea label="Notes" value={contactForm.notes} onChange={(v) => setContactForm({ ...contactForm, notes: v })} rows={2} />
          <div className="flex gap-2 pt-1">
            <button
              onClick={onAddContact}
              disabled={contactSaving}
              className="rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/40 disabled:opacity-50"
            >
              {contactSaving ? "Saving…" : "Save Contact"}
            </button>
            <button
              onClick={() => { setShowAddContact(false); setContactForm({ full_name: "", title: "", email: "", phone: "", linkedin_url: "", relationship_strength: "", decision_role: "", notes: "" }); }}
              className="rounded-lg px-3 py-1.5 text-xs text-bm-muted2 hover:text-bm-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

function NotesTab({ activities }: { activities: Activity[] }) {
  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <p className="text-xs text-bm-muted2">No notes logged yet. Log a call or meeting after each interaction.</p>
      ) : (
        activities.map((item) => {
          const typeKey = item.activity_type?.toLowerCase() ?? "internal";
          return (
            <div key={item.crm_activity_id} className="rounded-lg border border-bm-border/40 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  label={item.activity_type}
                  colorClass={ACTIVITY_COLORS[typeKey] ?? "text-slate-400 border-slate-400/40 bg-slate-400/10"}
                />
                <span className="text-[10px] text-bm-muted2">{fmtDate(item.activity_at)}</span>
              </div>
              {item.subject && <p className="text-xs font-medium text-bm-text">{item.subject}</p>}
              {typeof item.payload_json?.summary === "string" && (
                <p className="text-xs text-bm-muted2">{item.payload_json.summary}</p>
              )}
            </div>
          );
        })
      )}

      {/* Note creation stub — POST /consulting/activities route does not exist yet */}
      <div className="rounded-lg border border-dashed border-bm-border/30 px-3 py-3 mt-2">
        <p className="text-xs text-bm-muted2 mb-1">Add note</p>
        <p className="text-[10px] text-bm-muted2/60">Note creation coming soon — log outreach in the Outreach tab for now.</p>
      </div>
    </div>
  );
}

// ─── Outreach Tab ─────────────────────────────────────────────────────────────

function OutreachTab({
  outreachLog,
  contacts,
  showLogOutreach,
  setShowLogOutreach,
  outreachForm,
  setOutreachForm,
  outreachSaving,
  outreachError,
  onLogOutreach,
}: {
  outreachLog: OutreachLogEntry[];
  contacts: AccountContact[];
  showLogOutreach: boolean;
  setShowLogOutreach: (v: boolean) => void;
  outreachForm: { channel: string; crm_contact_id: string; subject: string; body_preview: string };
  setOutreachForm: Dispatch<SetStateAction<{ channel: string; crm_contact_id: string; subject: string; body_preview: string }>>;
  outreachSaving: boolean;
  outreachError: string | null;
  onLogOutreach: () => void;
}) {
  return (
    <div className="space-y-3">
      {outreachLog.length === 0 && !showLogOutreach ? (
        <div className="rounded-lg border border-bm-border/30 px-4 py-5 text-center">
          <p className="text-xs text-bm-muted2 mb-3">No outreach logged yet.</p>
          <button
            onClick={() => setShowLogOutreach(true)}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/30"
          >
            + Log Outreach
          </button>
        </div>
      ) : (
        <>
          {outreachLog.map((entry) => {
            const chKey = entry.channel?.toLowerCase() ?? "email";
            return (
              <div key={entry.id} className="rounded-lg border border-bm-border/40 px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    label={entry.channel}
                    colorClass={CHANNEL_COLORS[chKey] ?? "text-slate-400 border-slate-400/40 bg-slate-400/10"}
                  />
                  <span className="text-[10px] text-bm-muted2">{fmtDate(entry.sent_at)}</span>
                  {entry.contact_name && <span className="text-[10px] text-bm-muted2">→ {entry.contact_name}</span>}
                  {entry.replied_at ? (
                    <Badge label="Replied" colorClass="text-emerald-400 border-emerald-400/40 bg-emerald-400/10" />
                  ) : (
                    <span className="text-[10px] text-bm-muted2/50">No reply</span>
                  )}
                  {entry.meeting_booked && (
                    <Badge label="Meeting booked" colorClass="text-cyan-400 border-cyan-400/40 bg-cyan-400/10" />
                  )}
                </div>
                {entry.subject && <p className="text-xs font-medium text-bm-text">{entry.subject}</p>}
                {entry.body_preview && <p className="text-xs text-bm-muted2 line-clamp-2">{entry.body_preview}</p>}
              </div>
            );
          })}
          {!showLogOutreach && (
            <button
              onClick={() => setShowLogOutreach(true)}
              className="w-full rounded-lg border border-dashed border-bm-border/40 py-2 text-xs text-bm-muted2 hover:border-bm-border hover:text-bm-text"
            >
              + Log Outreach
            </button>
          )}
        </>
      )}

      {showLogOutreach && (
        <div className="rounded-lg border border-bm-border/40 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-bm-text">Log Outreach</p>
          {outreachError && <p className="text-xs text-red-400">{outreachError}</p>}
          <FormSelect
            label="Channel"
            value={outreachForm.channel}
            onChange={(v) => setOutreachForm({ ...outreachForm, channel: v })}
            options={[
              { value: "email", label: "Email" },
              { value: "linkedin", label: "LinkedIn" },
              { value: "phone", label: "Phone" },
            ]}
          />
          {contacts.length > 0 && (
            <FormSelect
              label="Contact"
              value={outreachForm.crm_contact_id}
              onChange={(v) => setOutreachForm({ ...outreachForm, crm_contact_id: v })}
              options={[
                { value: "", label: "— All contacts —" },
                ...contacts.map((c) => ({ value: c.crm_contact_id, label: c.full_name })),
              ]}
            />
          )}
          <FormInput label="Subject" value={outreachForm.subject} onChange={(v) => setOutreachForm({ ...outreachForm, subject: v })} />
          <FormTextarea label="Message preview" value={outreachForm.body_preview} onChange={(v) => setOutreachForm({ ...outreachForm, body_preview: v })} rows={3} />
          <div className="flex gap-2 pt-1">
            <button
              onClick={onLogOutreach}
              disabled={outreachSaving}
              className="rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/40 disabled:opacity-50"
            >
              {outreachSaving ? "Saving…" : "Log Outreach"}
            </button>
            <button
              onClick={() => { setShowLogOutreach(false); setOutreachForm({ channel: "email", crm_contact_id: "", subject: "", body_preview: "" }); }}
              className="rounded-lg px-3 py-1.5 text-xs text-bm-muted2 hover:text-bm-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Execution Tab ───────────────────────────────────────────────────────────

function ExecutionTab({
  execution,
  nextActions,
  hasNoAction,
  topAction,
  busyAction,
  showAddAction,
  setShowAddAction,
  actionForm,
  setActionForm,
  actionSaving,
  actionError,
  onCompleteAction,
  onAddAction,
  onQuickAction,
  dealId,
  envId,
  businessId,
}: {
  execution: ExecutionDetail | null;
  nextActions: NextAction[];
  hasNoAction: boolean;
  topAction: NextAction | null;
  busyAction: string | null;
  showAddAction: boolean;
  setShowAddAction: (v: boolean) => void;
  actionForm: { description: string; action_type: string; due_date: string; priority: string };
  setActionForm: Dispatch<SetStateAction<{ description: string; action_type: string; due_date: string; priority: string }>>;
  actionSaving: boolean;
  actionError: string | null;
  onCompleteAction: (id: string) => void;
  onAddAction: () => void;
  onQuickAction: (kind: "draft" | "followups" | "prep") => void;
  dealId: string;
  envId: string;
  businessId: string;
}) {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [convertingEng, setConvertingEng] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [convertErr, setConvertErr] = useState<string | null>(null);

  async function handleConvertToEngagement() {
    setConvertingEng(true);
    setConvertErr(null);
    try {
      const detail = await convertDealToEngagement({ envId, businessId, dealId });
      setConvertMsg(detail.engagement.name);
    } catch (err) {
      setConvertErr(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConvertingEng(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">
          Sequenced plan
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConvertToEngagement}
            disabled={convertingEng}
            className="rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300 hover:bg-violet-400/15 disabled:opacity-50"
          >
            {convertingEng ? "Converting…" : "Convert to Engagement"}
          </button>
          <button
            type="button"
            onClick={() => setGenerateOpen(true)}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300 hover:bg-cyan-400/15"
          >
            Create Actions
          </button>
        </div>
      </div>
      {convertMsg ? (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-300">
          Engagement created: {convertMsg}.{" "}
          <a
            href={`/lab/env/${envId}/consulting/engagement-routing`}
            className="underline hover:text-violet-200"
          >
            Open Engagement Routing →
          </a>
        </div>
      ) : null}
      {convertErr ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          {convertErr}
        </div>
      ) : null}
      {generateMsg ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/05 px-3 py-2 text-[11px] text-emerald-300">
          {generateMsg}{" "}
          <a
            href={`/lab/env/${envId}/consulting/execution`}
            className="underline hover:text-emerald-200"
          >
            Open Execution →
          </a>
        </div>
      ) : null}
      {generateOpen ? (
        <GenerateActionsModal
          envId={envId}
          businessId={businessId}
          defaultDealId={dealId}
          onClose={() => setGenerateOpen(false)}
          onGenerated={() => {
            setGenerateOpen(false);
            setGenerateMsg("Sequenced tasks added to the Execution board.");
          }}
        />
      ) : null}
      {hasNoAction ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-1">This deal is stalled</p>
          <p className="text-xs text-red-400/70 mb-3">You need one clear next move.</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddAction(true)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
            >
              + Add Next Action
            </button>
            <QuickButton label="Draft Outreach" busy={busyAction === "draft"} onClick={() => onQuickAction("draft")} />
          </div>
        </div>
      ) : topAction ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/70 mb-1">Next Move</p>
          <p className="text-sm font-medium text-bm-text">→ {topAction.description}</p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-[10px] text-bm-muted2">
              {topAction.action_type} · Due {topAction.due_date} · {topAction.priority}
            </p>
            <button
              onClick={() => onCompleteAction(topAction.id)}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-400/10"
            >
              Mark Done
            </button>
          </div>
        </div>
      ) : null}

      {showAddAction && (
        <div className="rounded-lg border border-bm-border/40 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-bm-text">New Next Action</p>
          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          <FormInput label="Description *" value={actionForm.description} onChange={(v) => setActionForm({ ...actionForm, description: v })} />
          <div className="grid grid-cols-2 gap-2">
            <FormSelect
              label="Type"
              value={actionForm.action_type}
              onChange={(v) => setActionForm({ ...actionForm, action_type: v })}
              options={[
                { value: "email", label: "Email" },
                { value: "call", label: "Call" },
                { value: "linkedin", label: "LinkedIn" },
                { value: "meeting", label: "Meeting" },
                { value: "research", label: "Research" },
                { value: "follow_up", label: "Follow Up" },
                { value: "proposal", label: "Proposal" },
                { value: "task", label: "Task" },
              ]}
            />
            <FormSelect
              label="Priority"
              value={actionForm.priority}
              onChange={(v) => setActionForm({ ...actionForm, priority: v })}
              options={[
                { value: "low", label: "Low" },
                { value: "normal", label: "Normal" },
                { value: "high", label: "High" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
          </div>
          <FormInput label="Due date *" value={actionForm.due_date} onChange={(v) => setActionForm({ ...actionForm, due_date: v })} type="date" />
          <div className="flex gap-2 pt-1">
            <button
              onClick={onAddAction}
              disabled={actionSaving}
              className="rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/40 disabled:opacity-50"
            >
              {actionSaving ? "Saving…" : "Save Action"}
            </button>
            <button
              onClick={() => { setShowAddAction(false); setActionForm({ description: "", action_type: "email", due_date: "", priority: "normal" }); }}
              className="rounded-lg px-3 py-1.5 text-xs text-bm-muted2 hover:text-bm-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showAddAction && (
        <button
          onClick={() => setShowAddAction(true)}
          className="w-full rounded-lg border border-dashed border-bm-border/40 py-2 text-xs text-bm-muted2 hover:border-bm-border hover:text-bm-text"
        >
          + Add Next Action
        </button>
      )}

      {(execution?.ranked_next_actions ?? []).length > 0 && (
        <>
          <SectionTitle title="Ranked Next Actions" />
          <div className="space-y-2">
            {(execution?.ranked_next_actions ?? []).map((action) => (
              <div key={action.action_key} className="rounded-lg border border-bm-border/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-bm-text">{action.label}</p>
                  <span className="text-[10px] uppercase text-bm-muted2">{action.impact}</span>
                </div>
                <p className="mt-1 text-[11px] text-bm-muted2">{action.reasoning}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {(execution?.stage_suggestions ?? []).length > 0 && (
        <>
          <SectionTitle title="Stage Suggestions" />
          <div className="space-y-2">
            {(execution?.stage_suggestions ?? []).map((s) => (
              <div key={s.trigger_source} className="rounded-lg border border-bm-border/40 px-3 py-2">
                <p className="text-xs font-medium text-bm-text">{s.suggested_execution_column}</p>
                <p className="mt-0.5 text-[11px] text-bm-muted2">{s.reasoning}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle title="AI Actions" />
      <div className="flex flex-wrap gap-2">
        <QuickButton label="Draft Outreach" busy={busyAction === "draft"} onClick={() => onQuickAction("draft")} />
        <QuickButton label="Generate Follow-up" busy={busyAction === "followups"} onClick={() => onQuickAction("followups")} />
        <QuickButton label="Prep Me" busy={busyAction === "prep"} onClick={() => onQuickAction("prep")} />
      </div>
    </div>
  );
}

// ─── Drafts Tab ───────────────────────────────────────────────────────────────

function DraftsTab({
  initialDraft,
  followups,
  busyAction,
  copiedKey,
  onCopy,
  onDraft,
}: {
  initialDraft: { subject?: string; body?: string } | undefined;
  followups: Array<{ subject?: string; body?: string; angle_key?: string }>;
  busyAction: string | null;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  onDraft: () => void;
}) {
  const hasDrafts = initialDraft?.body || followups.some((f) => f.body);

  if (!hasDrafts) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-bm-muted2">No drafts yet — use Draft Outreach to generate them.</p>
        <QuickButton label="Draft Outreach" busy={busyAction === "draft"} onClick={onDraft} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {initialDraft?.body && (
        <>
          <SectionTitle title="Initial Outreach" />
          <DraftBlock
            subject={initialDraft.subject}
            body={initialDraft.body}
            draftKey="initial"
            copiedKey={copiedKey}
            onCopy={onCopy}
          />
        </>
      )}
      {followups.filter((f) => f.body).length > 0 && (
        <>
          <SectionTitle title="Follow-up Stack" />
          {followups.filter((f) => f.body).map((draft, index) => (
            <DraftBlock
              key={`${draft.angle_key ?? "fu"}-${index}`}
              subject={draft.subject}
              body={draft.body}
              label={draft.angle_key}
              draftKey={`fu-${index}`}
              copiedKey={copiedKey}
              onCopy={onCopy}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Prep Tab ─────────────────────────────────────────────────────────────────

function PrepTab({
  prep,
  execution,
  busyAction,
  onPrep,
}: {
  prep: { company_summary?: string; likely_pain_points?: string[]; tailored_demo_path?: string; key_questions?: string[]; risks_to_watch?: string[] } | undefined;
  execution: ExecutionDetail | null;
  busyAction: string | null;
  onPrep: () => void;
}) {
  if (!prep?.company_summary) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-bm-muted2">No prep generated yet.</p>
        <QuickButton label="Prep Me" busy={busyAction === "prep"} onClick={onPrep} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle title="Company Summary" />
      <p className="text-sm text-bm-text">{prep.company_summary}</p>

      {prep.tailored_demo_path && (
        <>
          <SectionTitle title="Demo Path" />
          <p className="text-sm text-bm-text">{prep.tailored_demo_path}</p>
        </>
      )}

      {(prep.key_questions ?? []).length > 0 && (
        <>
          <SectionTitle title="Key Questions" />
          <ul className="space-y-1">
            {prep.key_questions!.map((q) => (
              <li key={q} className="text-xs text-bm-text">· {q}</li>
            ))}
          </ul>
        </>
      )}

      {(prep.risks_to_watch ?? []).length > 0 && (
        <>
          <SectionTitle title="Risks to Watch" />
          <ul className="space-y-1">
            {prep.risks_to_watch!.map((r) => (
              <li key={r} className="text-xs text-bm-muted2">· {r}</li>
            ))}
          </ul>
        </>
      )}

      {execution?.card.demo_angle && (
        <>
          <SectionTitle title="Proof Asset to Send" />
          <p className="text-sm text-bm-text">{execution.card.demo_angle}</p>
        </>
      )}
    </div>
  );
}

// ─── Shared Primitives ────────────────────────────────────────────────────────

function QuickButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-lg border border-bm-border px-3 py-2 text-xs font-medium text-bm-text hover:bg-bm-surface/30 disabled:opacity-50"
    >
      {busy ? "Working…" : label}
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2">{title}</h3>;
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${colorClass}`}>
      {label}
    </span>
  );
}

function FactRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-bm-muted2 shrink-0">{label}</span>
      <span className={`text-[11px] text-right truncate ${dim ? "text-red-400/70" : "text-bm-text"}`}>{value}</span>
    </div>
  );
}

function FactBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-bm-muted2">{label}</p>
      <p className="text-xs text-bm-text mt-0.5 leading-relaxed">{value || "—"}</p>
    </div>
  );
}

function DraftBlock({
  subject,
  body,
  label,
  draftKey,
  copiedKey,
  onCopy,
}: {
  subject?: string;
  body?: string;
  label?: string;
  draftKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const copied = copiedKey === draftKey;
  return (
    <div className="rounded-lg border border-bm-border/40 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        {label ? <span className="text-[10px] uppercase tracking-wider text-bm-muted2">{label}</span> : <span />}
        <button
          onClick={() => onCopy(body ?? "", draftKey)}
          className="flex items-center gap-1 text-[10px] text-bm-muted2 hover:text-bm-text"
        >
          {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {subject && <p className="text-xs font-medium text-bm-text">{subject}</p>}
      <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-bm-muted2">{body}</pre>
    </div>
  );
}

function FormInput({
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-bm-muted2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-bm-border bg-bm-surface/20 px-2 py-1.5 text-xs text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:ring-1 focus:ring-bm-accent"
      />
    </div>
  );
}

function FormSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-bm-muted2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-bm-border bg-bm-surface/20 px-2 py-1.5 text-xs text-bm-text focus:outline-none focus:ring-1 focus:ring-bm-accent"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FormTextarea({
  label, value, onChange, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-bm-muted2">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded border border-bm-border bg-bm-surface/20 px-2 py-1.5 text-xs text-bm-text placeholder:text-bm-muted2 focus:outline-none focus:ring-1 focus:ring-bm-accent resize-none"
      />
    </div>
  );
}

