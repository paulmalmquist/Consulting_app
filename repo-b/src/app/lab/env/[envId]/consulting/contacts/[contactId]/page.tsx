"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { ActivityTimeline } from "@/components/consulting/ActivityTimeline";
import { NextActionPanel } from "@/components/consulting/NextActionPanel";
import { Card, CardContent } from "@/components/ui/Card";
import {
  fetchContactDetail,
  fetchContactOutreach,
  fetchActivities,
  fetchNextActions,
  fetchContactLinkedDeals,
  fetchContactDealSuggestions,
  suggestContactNextAction,
  generateContactOutreach,
  linkContactToOpportunity,
  type ContactDetail,
  type OutreachEntry,
  type Activity,
  type NextAction,
  type ContactLinkedDeal,
  type DealSuggestion,
  type ContactNextActionSuggestion,
  type ContactOutreachDraft,
} from "@/lib/cro-api";

function relDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 30) return `${diff}d ago`;
  return d.toLocaleDateString();
}

const STRENGTH_COLORS: Record<string, string> = {
  champion: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  hot: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  warm: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  cold: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const CHANNEL_ICONS: Record<string, string> = {
  email: "✉",
  linkedin: "in",
  phone: "☎",
  meeting: "📅",
  other: "💬",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-emerald-400",
  neutral: "text-yellow-400",
  negative: "text-red-400",
};

type Tab = "outreach" | "deals" | "actions" | "profile";

function DealPicker({
  suggestions,
  envId,
  businessId,
  contactId,
  onLinked,
  onClose,
}: {
  suggestions: DealSuggestion[];
  envId: string;
  businessId: string;
  contactId: string;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [linking, setLinking] = useState<string | null>(null);

  const handleLink = async (opp: DealSuggestion) => {
    setLinking(opp.crm_opportunity_id);
    try {
      await linkContactToOpportunity(opp.crm_opportunity_id, {
        env_id: envId,
        business_id: businessId,
        crm_contact_id: contactId,
        link_source: "contacts_surface",
      });
      onLinked();
      onClose();
    } catch {
      // ignore — surface will refresh
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-bm-border bg-bm-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-bm-text">Link to a Deal</h3>
          <button onClick={onClose} className="text-bm-muted2 hover:text-bm-text text-lg leading-none">×</button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-bm-muted2">No open deals found for this account.</p>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <button
                key={s.crm_opportunity_id}
                onClick={() => handleLink(s)}
                disabled={linking === s.crm_opportunity_id}
                className="w-full text-left rounded-lg border border-bm-border/60 bg-bm-surface/20 px-3 py-2.5 hover:bg-bm-surface/40 transition-colors"
              >
                <p className="text-sm font-medium text-bm-text">{s.name}</p>
                <p className="text-xs text-bm-muted2 mt-0.5">
                  {s.stage_label ?? "—"}{s.amount != null ? ` · $${s.amount.toLocaleString()}` : ""}
                  {s.last_activity_at ? ` · ${relDate(s.last_activity_at)}` : ""}
                </p>
              </button>
            ))}
          </div>
        )}
        <Link
          href={`/lab/env/${envId}/consulting/pipeline`}
          className="block text-center text-xs text-bm-accent hover:underline"
        >
          Create deal from pipeline →
        </Link>
      </div>
    </div>
  );
}

function DraftModal({
  draft,
  onClose,
}: {
  draft: ContactOutreachDraft;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-bm-border bg-bm-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-bm-text">Generated Draft</h3>
          <button onClick={onClose} className="text-bm-muted2 hover:text-bm-text text-lg leading-none">×</button>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-bm-muted2 uppercase tracking-wide">Subject</p>
          <p className="text-sm font-medium text-bm-text">{draft.draft.subject}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-bm-muted2 uppercase tracking-wide">Body</p>
          <pre className="text-sm text-bm-text whitespace-pre-wrap font-sans leading-relaxed rounded-lg bg-bm-surface/30 p-3">
            {draft.draft.body}
          </pre>
        </div>
        <p className="text-xs text-bm-muted2">
          Next: {draft.recommended_next_action.description}
        </p>
      </div>
    </div>
  );
}

export default function ContactDetailPage({
  params,
}: {
  params: { envId: string; contactId: string };
}) {
  const { businessId, ready, loading: ctxLoading, error: ctxError } = useConsultingEnv();
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [outreach, setOutreach] = useState<OutreachEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [linkedDeals, setLinkedDeals] = useState<ContactLinkedDeal[]>([]);
  const [suggestion, setSuggestion] = useState<ContactNextActionSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("outreach");
  const [showDealPicker, setShowDealPicker] = useState(false);
  const [dealSuggestions, setDealSuggestions] = useState<DealSuggestion[]>([]);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draft, setDraft] = useState<ContactOutreachDraft | null>(null);

  const loadData = useCallback(async () => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const [contactData, outreachData, actData, actionData, dealsData] = await Promise.all([
        fetchContactDetail(params.contactId, params.envId, businessId),
        fetchContactOutreach(params.contactId, params.envId, businessId),
        fetchActivities(params.envId, businessId, { contact_id: params.contactId, limit: 50 }),
        fetchNextActions(params.envId, businessId),
        fetchContactLinkedDeals(params.contactId, params.envId, businessId),
      ]);
      setContact(contactData);
      setOutreach(outreachData);
      setActivities(actData);
      setActions(actionData.filter((a) => a.entity_id === params.contactId));
      setLinkedDeals(dealsData);

      // Load next-action suggestion in background (dry_run so it doesn't create duplicates)
      suggestContactNextAction(params.contactId, {
        env_id: params.envId,
        business_id: businessId,
        dry_run: true,
      }).then(setSuggestion).catch(() => {});
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Failed to load contact.");
    } finally {
      setLoading(false);
    }
  }, [ready, businessId, params.contactId, params.envId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenDealPicker = async () => {
    if (!businessId) return;
    const suggs = await fetchContactDealSuggestions(params.contactId, params.envId, businessId).catch(() => []);
    setDealSuggestions(suggs);
    setShowDealPicker(true);
  };

  const handleGenerateDraft = async () => {
    if (!businessId) return;
    setGeneratingDraft(true);
    try {
      const primaryDeal = linkedDeals.find((d) => d.is_primary) ?? linkedDeals[0];
      const result = await generateContactOutreach(params.contactId, {
        env_id: params.envId,
        business_id: businessId,
        crm_opportunity_id: primaryDeal?.crm_opportunity_id,
        goal: suggestion?.goal ?? "first_touch",
        angle: suggestion?.angle ?? "value_prop",
      });
      setDraft(result);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const bannerMessage = ctxError || dataError;
  const isLoading = ctxLoading || (ready && loading);

  const isUnassigned =
    contact && contact.execution_status === "needs_action" && linkedDeals.length === 0 && !contact.do_not_contact;
  const noNextAction =
    contact && contact.execution_status === "needs_action" && linkedDeals.length > 0 && actions.length === 0 && !contact.do_not_contact;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-bm-surface/60 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-bm-surface/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "outreach", label: "Outreach", count: outreach.length },
    { key: "deals", label: "Linked Deals", count: linkedDeals.length },
    { key: "actions", label: "Next Actions", count: actions.length },
    { key: "profile", label: "Profile" },
  ];

  return (
    <div className="space-y-6">
      {bannerMessage && (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      )}

      {/* Deal picker modal */}
      {showDealPicker && businessId && (
        <DealPicker
          suggestions={dealSuggestions}
          envId={params.envId}
          businessId={businessId}
          contactId={params.contactId}
          onLinked={loadData}
          onClose={() => setShowDealPicker(false)}
        />
      )}

      {/* Draft modal */}
      {draft && <DraftModal draft={draft} onClose={() => setDraft(null)} />}

      {contact ? (
        <>
          {/* Enforcement banners */}
          {isUnassigned && (
            <div className="rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                  UNASSIGNED — BLOCKING
                </p>
                <p className="text-xs text-bm-muted2 mt-0.5">
                  This contact is not linked to any deal. A contact without revenue context is unactionable.
                </p>
              </div>
              <button
                onClick={handleOpenDealPicker}
                className="shrink-0 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30 transition-colors"
              >
                Link to Deal
              </button>
            </div>
          )}

          {noNextAction && (
            <div className="rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                  NO NEXT ACTION — BLOCKING
                </p>
                <p className="text-xs text-bm-muted2 mt-0.5">
                  This contact is linked to a deal but has no next action. Silent contacts don&apos;t close deals.
                </p>
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft}
                className="shrink-0 rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30 transition-colors"
              >
                {generatingDraft ? "Generating…" : "Draft Message"}
              </button>
            </div>
          )}

          {/* RECOMMENDED ACTION — always visible, not buried in tabs */}
          {suggestion && (
            <section className="rounded-xl border border-bm-accent/30 bg-bm-accent/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-bm-accent mb-1">Recommended Action</p>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-bm-text">{suggestion.recommended_action}</p>
                  <p className="text-xs text-bm-muted2 mt-0.5">{suggestion.reason} · Due {suggestion.due_date}</p>
                </div>
                <button
                  onClick={handleGenerateDraft}
                  disabled={generatingDraft}
                  className="shrink-0 rounded-lg bg-bm-accent/20 border border-bm-accent/40 px-3 py-1.5 text-sm text-bm-accent hover:bg-bm-accent/30 transition-colors"
                >
                  {generatingDraft ? "Generating…" : "Generate Message"}
                </button>
              </div>
            </section>
          )}

          {/* Header */}
          <section className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-bm-text">{contact.full_name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {contact.title && (
                    <span className="text-bm-muted2">{contact.title}</span>
                  )}
                  {contact.relationship_strength && (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                        STRENGTH_COLORS[contact.relationship_strength] ||
                        "bg-bm-surface/30 text-bm-muted2 border-bm-border"
                      }`}
                    >
                      {contact.relationship_strength}
                    </span>
                  )}
                  {contact.decision_role && (
                    <span className="inline-flex items-center rounded-full bg-bm-surface/40 border border-bm-border/50 px-2.5 py-1 text-xs text-bm-muted2">
                      {contact.decision_role}
                    </span>
                  )}
                  {contact.do_not_contact && (
                    <span className="inline-flex items-center rounded-full bg-slate-500/20 border border-slate-500/30 px-2.5 py-1 text-xs text-slate-400">
                      Do Not Contact
                    </span>
                  )}
                </div>
                {contact.account_name && (
                  <div className="mt-2 text-sm text-bm-muted2">
                    Account:{" "}
                    {contact.crm_account_id ? (
                      <Link
                        href={`/lab/env/${params.envId}/consulting/accounts/${contact.crm_account_id}`}
                        className="text-bm-accent hover:underline"
                      >
                        {contact.account_name}
                      </Link>
                    ) : (
                      <span className="text-bm-text">{contact.account_name}</span>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-bm-muted2">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-bm-accent hover:underline">
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && <span>{contact.phone}</span>}
                  {contact.linkedin_url && (
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bm-accent hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
              <Link
                href={`/lab/env/${params.envId}/consulting/contacts`}
                className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/30"
              >
                Back to Contacts
              </Link>
            </div>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Outreach Sent</p>
                <p className="text-2xl font-semibold mt-1">{outreach.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Replies</p>
                <p className="text-2xl font-semibold mt-1">
                  {outreach.filter((o) => o.replied_at).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Meetings</p>
                <p className="text-2xl font-semibold mt-1">
                  {outreach.filter((o) => o.meeting_booked).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Last Outreach</p>
                <p className="text-2xl font-semibold mt-1">
                  {contact.last_outreach_at ? relDate(contact.last_outreach_at) : "Never"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 border-b border-bm-border/50 mb-4">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === t.key
                      ? "border-bm-accent text-bm-accent"
                      : "border-transparent text-bm-muted2 hover:text-bm-text"
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className="ml-1.5 text-xs text-bm-muted">{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Outreach tab */}
            {activeTab === "outreach" && (
              <div className="space-y-2">
                {outreach.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center space-y-3">
                      <p className="text-sm text-bm-muted2">No outreach recorded.</p>
                      <button
                        onClick={handleGenerateDraft}
                        disabled={generatingDraft}
                        className="rounded-lg bg-bm-accent/20 border border-bm-accent/40 px-4 py-2 text-sm text-bm-accent hover:bg-bm-accent/30 transition-colors"
                      >
                        {generatingDraft ? "Generating…" : "Draft First Touch"}
                      </button>
                    </CardContent>
                  </Card>
                ) : (
                  outreach.map((o) => (
                    <Card key={o.id}>
                      <CardContent className="py-3">
                        <div className="flex items-start gap-3">
                          <span className="text-lg shrink-0">{CHANNEL_ICONS[o.channel] || "💬"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-wide text-bm-muted2">
                                {o.channel} · {o.direction}
                              </span>
                              {o.meeting_booked && (
                                <span className="text-[10px] uppercase tracking-wide rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5">
                                  Meeting
                                </span>
                              )}
                              {o.reply_sentiment && (
                                <span className={`text-[10px] uppercase tracking-wide ${SENTIMENT_COLORS[o.reply_sentiment] || "text-bm-muted2"}`}>
                                  {o.reply_sentiment}
                                </span>
                              )}
                            </div>
                            {o.subject && <p className="text-sm font-medium text-bm-text mt-0.5">{o.subject}</p>}
                            {o.body_preview && <p className="text-xs text-bm-muted2 mt-0.5 line-clamp-2">{o.body_preview}</p>}
                            <div className="flex items-center gap-3 mt-1 text-xs text-bm-muted">
                              <span>Sent {relDate(o.sent_at)}</span>
                              {o.replied_at && <span>Replied {relDate(o.replied_at)}</span>}
                              {o.sent_by && <span>by {o.sent_by}</span>}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Linked Deals tab */}
            {activeTab === "deals" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={handleOpenDealPicker}
                    className="rounded-lg bg-bm-surface/30 border border-bm-border/60 px-3 py-1.5 text-sm text-bm-text hover:bg-bm-surface/50 transition-colors"
                  >
                    + Link to Deal
                  </button>
                </div>
                {linkedDeals.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-sm text-bm-muted2">No deals linked.</p>
                    </CardContent>
                  </Card>
                ) : (
                  linkedDeals.map((d) => (
                    <Card key={d.crm_opportunity_id}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/lab/env/${params.envId}/consulting/pipeline/${d.crm_opportunity_id}`}
                                className="text-sm font-medium text-bm-accent hover:underline"
                              >
                                {d.name}
                              </Link>
                              {d.is_primary && (
                                <span className="text-[10px] uppercase tracking-wide rounded-full bg-bm-accent/20 text-bm-accent px-2 py-0.5">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-bm-muted2">
                              <span>{d.stage_label ?? d.status}</span>
                              {d.amount != null && <span>${d.amount.toLocaleString()}</span>}
                              {d.role_on_deal && <span>{d.role_on_deal}</span>}
                            </div>
                            {d.next_action_description ? (
                              <p className="text-xs text-bm-muted mt-1">
                                Next: {d.next_action_description}
                                {d.next_action_due && ` · ${relDate(d.next_action_due)}`}
                              </p>
                            ) : (
                              <p className="text-xs text-red-400 mt-1">⚠ No next action on deal</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Next Actions tab */}
            {activeTab === "actions" && (
              <div>
                {actions.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-sm text-bm-muted2">No next actions.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <NextActionPanel
                    title="Contact Actions"
                    actions={actions}
                    businessId={businessId!}
                    onUpdate={() => void loadData()}
                  />
                )}
              </div>
            )}

            {/* Profile tab */}
            {activeTab === "profile" && (
              <Card>
                <CardContent className="py-4 space-y-3">
                  {[
                    ["Email", contact.email],
                    ["Phone", contact.phone],
                    ["Title", contact.title],
                    ["Preferred Channel", contact.preferred_channel],
                    ["Buyer Persona", contact.buyer_persona],
                    ["Headline", contact.headline],
                    ["Owner", contact.contact_owner],
                    ["Notes", contact.profile_notes],
                  ].map(([label, value]) =>
                    value ? (
                      <div key={label as string}>
                        <p className="text-[10px] uppercase tracking-widest text-bm-muted2">{label}</p>
                        <p className="text-sm text-bm-text mt-0.5 whitespace-pre-wrap">{value}</p>
                      </div>
                    ) : null,
                  )}
                  {contact.unassigned_reason && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-bm-muted2">Unassigned Reason</p>
                      <p className="text-sm text-bm-text mt-0.5">{contact.unassigned_reason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Activity Timeline — always below tabs */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Activity Timeline ({activities.length})
            </h2>
            {activities.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No activities yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-4">
                  <ActivityTimeline activities={activities} maxItems={20} />
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-bm-muted2">Contact not found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
