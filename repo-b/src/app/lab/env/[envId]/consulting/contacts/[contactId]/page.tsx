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
  type ContactDetail,
  type OutreachEntry,
  type Activity,
  type NextAction,
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
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!ready || !businessId) {
      if (ready && !businessId) setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const [contactData, outreachData, actData, actionData] = await Promise.all([
        fetchContactDetail(params.contactId, params.envId, businessId),
        fetchContactOutreach(params.contactId, params.envId, businessId),
        fetchActivities(params.envId, businessId, { contact_id: params.contactId, limit: 50 }),
        fetchNextActions(params.envId, businessId),
      ]);
      setContact(contactData);
      setOutreach(outreachData);
      setActivities(actData);
      setActions(actionData.filter((a) => a.entity_id === params.contactId));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Failed to load contact.");
    } finally {
      setLoading(false);
    }
  }, [ready, businessId, params.contactId, params.envId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const bannerMessage = ctxError || dataError;
  const isLoading = ctxLoading || (ready && loading);

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

  return (
    <div className="space-y-6">
      {bannerMessage && (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      )}

      {contact ? (
        <>
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
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Meetings Booked</p>
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

          {/* Notes */}
          {contact.profile_notes && (
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em] mb-2">Notes</p>
                <p className="text-sm text-bm-text whitespace-pre-wrap">{contact.profile_notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Next Actions */}
          {actions.length > 0 && (
            <NextActionPanel
              title="Pending Actions"
              actions={actions}
              businessId={businessId!}
              onUpdate={() => void loadData()}
            />
          )}

          {/* Outreach History */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
              Outreach History ({outreach.length})
            </h2>
            {outreach.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-bm-muted2">No outreach recorded for this contact.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {outreach.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <span className="text-lg shrink-0">
                          {CHANNEL_ICONS[o.channel] || "💬"}
                        </span>
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
                              <span
                                className={`text-[10px] uppercase tracking-wide ${
                                  SENTIMENT_COLORS[o.reply_sentiment] || "text-bm-muted2"
                                }`}
                              >
                                {o.reply_sentiment}
                              </span>
                            )}
                          </div>
                          {o.subject && (
                            <p className="text-sm font-medium text-bm-text mt-0.5">{o.subject}</p>
                          )}
                          {o.body_preview && (
                            <p className="text-xs text-bm-muted2 mt-0.5 line-clamp-2">
                              {o.body_preview}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-bm-muted">
                            <span>Sent {relDate(o.sent_at)}</span>
                            {o.replied_at && <span>Replied {relDate(o.replied_at)}</span>}
                            {o.sent_by && <span>by {o.sent_by}</span>}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Activity Timeline */}
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
