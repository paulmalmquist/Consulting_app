"use client";

import { useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  fetchLeads,
  fetchOutreachLog,
  fetchOutreachAnalytics,
  fetchOutreachTemplates,
  logOutreach,
  recordOutreachReply,
  type Lead,
  type OutreachLogEntry,
  type OutreachAnalytics,
} from "@/lib/cro-api";

type LeadFilter = "all" | "qualified" | "high_score";

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("Network error")) {
    return "Consulting API unreachable. Backend service is not available.";
  }
  return msg || "Consulting API unreachable. Backend service is not available.";
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "text-bm-success"
      : score >= 40
        ? "text-bm-warning"
        : "text-bm-muted2";
  return <span className={`text-xs font-semibold ${color}`}>{score}</span>;
}

export default function OutreachPage({
  params,
}: {
  params: { envId: string };
}) {
  const {
    businessId,
    error: contextError,
    loading: contextLoading,
    ready,
  } = useConsultingEnv();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<OutreachAnalytics | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadFilter>("all");
  const [showNewForm, setShowNewForm] = useState(false);
  const [formAccount, setFormAccount] = useState("");
  const [formChannel, setFormChannel] = useState("email");
  const [formTemplate, setFormTemplate] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formSending, setFormSending] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replySentiment, setReplySentiment] = useState("positive");
  const [replyMeeting, setReplyMeeting] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);
    Promise.allSettled([
      fetchLeads(params.envId, businessId),
      fetchOutreachLog(params.envId, businessId),
      fetchOutreachAnalytics(params.envId, businessId),
      fetchOutreachTemplates(params.envId, businessId),
    ])
      .then(([leadsResult, outreachResult, analyticsResult, templatesResult]) => {
        if (leadsResult.status !== "fulfilled") {
          throw leadsResult.reason;
        }
        setLeads(leadsResult.value);
        setOutreachLog(
          outreachResult.status === "fulfilled" ? outreachResult.value : [],
        );
        setAnalytics(
          analyticsResult.status === "fulfilled" ? analyticsResult.value : null,
        );
        setTemplates(
          templatesResult.status === "fulfilled" ? templatesResult.value : [],
        );
      })
      .catch((err) => {
        setLeads([]);
        setOutreachLog([]);
        setAnalytics(null);
        setDataError(formatError(err));
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId, ready]);

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);
  const sortedLeads = useMemo(
    () =>
      [...leads].sort((a, b) => {
        const aQualified = Boolean(a.qualified_at);
        const bQualified = Boolean(b.qualified_at);
        if (aQualified !== bQualified) return aQualified ? -1 : 1;
        if (b.lead_score !== a.lead_score) return b.lead_score - a.lead_score;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [leads],
  );
  const visibleLeads = useMemo(() => {
    if (filter === "qualified") {
      return sortedLeads.filter((lead) => Boolean(lead.qualified_at));
    }
    if (filter === "high_score") {
      return sortedLeads.filter((lead) => lead.lead_score >= 70);
    }
    return sortedLeads;
  }, [filter, sortedLeads]);
  const qualifiedCount = useMemo(
    () => leads.filter((lead) => Boolean(lead.qualified_at)).length,
    [leads],
  );
  const highScoreCount = useMemo(
    () => leads.filter((lead) => lead.lead_score >= 70).length,
    [leads],
  );
  const averageScore = useMemo(() => {
    if (leads.length === 0) return 0;
    const total = leads.reduce((sum, lead) => sum + lead.lead_score, 0);
    return Math.round(total / leads.length);
  }, [leads]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <CardTitle>Leads &amp; Outreach</CardTitle>
          <p className="text-sm text-bm-muted mt-2">
            Lead qualification, source mix, and recent outbound activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "primary" : "secondary"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filter === "qualified" ? "primary" : "secondary"}
            onClick={() => setFilter("qualified")}
          >
            Qualified
          </Button>
          <Button
            size="sm"
            variant={filter === "high_score" ? "primary" : "secondary"}
            onClick={() => setFilter("high_score")}
          >
            High Score (&gt;= 70)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Total Leads</p>
            <p className="text-2xl font-semibold mt-1">{leads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Qualified</p>
            <p className="text-2xl font-semibold mt-1">{qualifiedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Avg Score</p>
            <p className="text-2xl font-semibold mt-1">{averageScore}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">High Score</p>
            <p className="text-2xl font-semibold mt-1">{highScoreCount}</p>
          </CardContent>
        </Card>
      </div>

      {analytics ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Sent (30d)</p>
              <p className="text-2xl font-semibold mt-1">{analytics.total_sent_30d}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Replied (30d)</p>
              <p className="text-2xl font-semibold mt-1">{analytics.total_replied_30d}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Response Rate</p>
              <p className="text-2xl font-semibold mt-1">{fmtPct(analytics.response_rate_30d)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">Meetings (30d)</p>
              <p className="text-2xl font-semibold mt-1">{analytics.meetings_booked_30d}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* New Outreach Form */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Log Outreach</h2>
          <Button size="sm" variant={showNewForm ? "secondary" : "primary"} onClick={() => setShowNewForm(!showNewForm)}>
            {showNewForm ? "Cancel" : "New Outreach"}
          </Button>
        </div>
        {showNewForm ? (
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-bm-muted2 block mb-1">Account</label>
                  <select
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    className="w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  >
                    <option value="">Select account...</option>
                    {leads.map((lead) => (
                      <option key={lead.crm_account_id} value={lead.crm_account_id}>
                        {lead.company_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-bm-muted2 block mb-1">Channel</label>
                  <select
                    value={formChannel}
                    onChange={(e) => setFormChannel(e.target.value)}
                    className="w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  >
                    <option value="email">Email</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="phone">Phone</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-bm-muted2 block mb-1">Template (optional)</label>
                  <select
                    value={formTemplate}
                    onChange={(e) => setFormTemplate(e.target.value)}
                    className="w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  >
                    <option value="">No template</option>
                    {templates.map((t: { id: string; name: string }) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-bm-muted2 block mb-1">Subject</label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Subject line..."
                    className="w-full rounded-lg border border-bm-border bg-bm-surface/20 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!formAccount || formSending}
                  onClick={async () => {
                    if (!formAccount || !businessId) return;
                    setFormSending(true);
                    try {
                      await logOutreach({
                        env_id: params.envId,
                        business_id: businessId,
                        crm_account_id: formAccount,
                        channel: formChannel,
                        subject: formSubject || undefined,
                        template_id: formTemplate || undefined,
                      });
                      setShowNewForm(false);
                      setFormAccount("");
                      setFormSubject("");
                      setFormTemplate("");
                      // Reload data
                      const [logRes, analyticsRes] = await Promise.allSettled([
                        fetchOutreachLog(params.envId, businessId),
                        fetchOutreachAnalytics(params.envId, businessId),
                      ]);
                      if (logRes.status === "fulfilled") setOutreachLog(logRes.value);
                      if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
                    } catch (err) {
                      console.error("Failed to log outreach:", err);
                    } finally {
                      setFormSending(false);
                    }
                  }}
                >
                  {formSending ? "Sending..." : "Log Outreach"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Leads ({visibleLeads.length})
        </h2>
        {visibleLeads.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-bm-muted2">
                {leads.length === 0
                  ? "No leads yet. Add a lead to get started."
                  : "No leads match this filter."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleLeads.map((lead) => (
              <Card key={lead.crm_account_id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{lead.company_name}</p>
                      <ScoreBadge score={lead.lead_score} />
                      {lead.qualified_at ? (
                        <span className="text-xs bg-bm-success/10 text-bm-success px-1.5 py-0.5 rounded">
                          Qualified
                        </span>
                      ) : null}
                      {lead.disqualified_at ? (
                        <span className="text-xs bg-bm-danger/10 text-bm-danger px-1.5 py-0.5 rounded">
                          Disqualified
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      {lead.industry || "—"} · {lead.lead_source || "—"} · {" "}
                      {lead.stage_label || "No stage"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-bm-muted2">
                    {lead.ai_maturity || "—"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Recent Outreach ({outreachLog.length})
        </h2>
        {outreachLog.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-bm-muted2">No outreach logged yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {outreachLog.slice(0, 20).map((entry) => (
              <Card key={entry.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.account_name || "Unknown"}{" "}
                        {entry.contact_name ? `→ ${entry.contact_name}` : ""}
                      </p>
                      <p className="text-xs text-bm-muted2 mt-0.5">
                        {entry.channel} · {entry.direction} · {" "}
                        {entry.subject || "No subject"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.replied_at ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          entry.reply_sentiment === "positive"
                            ? "bg-bm-success/10 text-bm-success"
                            : entry.reply_sentiment === "negative"
                              ? "bg-bm-danger/10 text-bm-danger"
                              : "bg-bm-muted/10 text-bm-muted"
                        }`}>
                          {entry.reply_sentiment}
                        </span>
                      ) : (
                        <button
                          onClick={() => setReplyingId(replyingId === entry.id ? null : entry.id)}
                          className="text-xs text-bm-accent hover:underline"
                        >
                          Record Reply
                        </button>
                      )}
                      {entry.meeting_booked ? (
                        <span className="text-xs bg-bm-accent/10 text-bm-accent px-1.5 py-0.5 rounded">
                          Meeting
                        </span>
                      ) : null}
                      <span className="text-xs text-bm-muted2">
                        {new Date(entry.sent_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {replyingId === entry.id ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-bm-border/30 pt-3">
                      <select
                        value={replySentiment}
                        onChange={(e) => setReplySentiment(e.target.value)}
                        className="rounded-lg border border-bm-border bg-bm-surface/20 px-2 py-1.5 text-xs text-bm-text"
                      >
                        <option value="positive">Positive</option>
                        <option value="neutral">Neutral</option>
                        <option value="negative">Negative</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs text-bm-muted2">
                        <input
                          type="checkbox"
                          checked={replyMeeting}
                          onChange={(e) => setReplyMeeting(e.target.checked)}
                          className="rounded"
                        />
                        Meeting booked
                      </label>
                      <button
                        onClick={async () => {
                          try {
                            await recordOutreachReply(entry.id, {
                              sentiment: replySentiment,
                              meeting_booked: replyMeeting,
                            });
                            setReplyingId(null);
                            setReplyMeeting(false);
                            // Reload
                            if (businessId) {
                              const [logRes, analyticsRes] = await Promise.allSettled([
                                fetchOutreachLog(params.envId, businessId),
                                fetchOutreachAnalytics(params.envId, businessId),
                              ]);
                              if (logRes.status === "fulfilled") setOutreachLog(logRes.value);
                              if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
                            }
                          } catch (err) {
                            console.error("Failed to record reply:", err);
                          }
                        }}
                        className="rounded-lg bg-bm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/80"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setReplyingId(null); setReplyMeeting(false); }}
                        className="text-xs text-bm-muted2 hover:text-bm-text"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {analytics && analytics.by_channel.length > 0 ? (
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            By Channel (30d)
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {analytics.by_channel.map((ch) => (
              <Card key={ch.channel}>
                <CardContent className="py-3">
                  <p className="text-xs text-bm-muted2 uppercase">{ch.channel}</p>
                  <p className="text-sm font-medium mt-1">
                    {ch.sent} sent · {ch.replied} replied · {ch.meetings} meetings
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
