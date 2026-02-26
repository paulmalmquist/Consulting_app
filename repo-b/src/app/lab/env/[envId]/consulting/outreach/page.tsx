"use client";

import { useEffect, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  fetchLeads,
  fetchOutreachLog,
  fetchOutreachAnalytics,
  type Lead,
  type OutreachLogEntry,
  type OutreachAnalytics,
} from "@/lib/cro-api";

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
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
  const { businessId } = useConsultingEnv();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<OutreachAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    Promise.all([
      fetchLeads(params.envId, businessId).catch(() => []),
      fetchOutreachLog(params.envId, businessId).catch(() => []),
      fetchOutreachAnalytics(params.envId, businessId).catch(() => null),
    ])
      .then(([l, o, a]) => {
        setLeads(l);
        setOutreachLog(o);
        setAnalytics(a);
      })
      .finally(() => setLoading(false));
  }, [businessId, params.envId]);

  if (loading) {
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
      {/* Analytics Summary */}
      {analytics && (
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
      )}

      {/* Leads Table */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Leads ({leads.length})
        </h2>
        {leads.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-bm-muted2">No leads yet. Add a lead to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <Card key={lead.crm_account_id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{lead.company_name}</p>
                      <ScoreBadge score={lead.lead_score} />
                      {lead.qualified_at && (
                        <span className="text-xs bg-bm-success/10 text-bm-success px-1.5 py-0.5 rounded">
                          Qualified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      {lead.industry || "—"} · {lead.lead_source || "—"} ·{" "}
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

      {/* Outreach Log */}
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
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.account_name || "Unknown"}{" "}
                      {entry.contact_name ? `→ ${entry.contact_name}` : ""}
                    </p>
                    <p className="text-xs text-bm-muted2 mt-0.5">
                      {entry.channel} · {entry.direction} ·{" "}
                      {entry.subject || "No subject"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.replied_at && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        entry.reply_sentiment === "positive"
                          ? "bg-bm-success/10 text-bm-success"
                          : entry.reply_sentiment === "negative"
                            ? "bg-bm-danger/10 text-bm-danger"
                            : "bg-bm-muted/10 text-bm-muted"
                      }`}>
                        {entry.reply_sentiment}
                      </span>
                    )}
                    {entry.meeting_booked && (
                      <span className="text-xs bg-bm-accent/10 text-bm-accent px-1.5 py-0.5 rounded">
                        Meeting
                      </span>
                    )}
                    <span className="text-xs text-bm-muted2">
                      {new Date(entry.sent_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Channel Breakdown */}
      {analytics && analytics.by_channel.length > 0 && (
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
      )}
    </div>
  );
}
