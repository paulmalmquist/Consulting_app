"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  approveStrategicOutreach,
  fetchStrategicOutreachDashboard,
  runStrategicOutreachMonitor,
  seedStrategicOutreach,
  type StrategicOutreachDashboard,
  type StrategicOutreachLead,
} from "@/lib/cro-api";

type TabKey =
  | "heatmap"
  | "leads"
  | "triggers"
  | "queue"
  | "diagnostics"
  | "deliverables";

const TAB_LABELS: Record<TabKey, string> = {
  heatmap: "Heatmap",
  leads: "Active Leads",
  triggers: "Trigger Signals",
  queue: "Outreach Queue (Needs Approval)",
  diagnostics: "Diagnostics",
  deliverables: "Deliverables Sent",
};

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

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function priorityTone(score: number): string {
  if (score > 75) return "text-bm-danger";
  if (score >= 50) return "text-bm-warning";
  return "text-bm-muted2";
}

function LeadRow({ lead }: { lead: StrategicOutreachLead }) {
  return (
    <Card>
      <CardContent className="py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.company_name}</p>
            <span className={`text-xs font-semibold ${priorityTone(lead.composite_priority_score)}`}>
              {lead.composite_priority_score}
            </span>
            <span className="text-xs rounded-full border border-bm-border/70 px-2 py-0.5 text-bm-muted2">
              {lead.status}
            </span>
          </div>
          <p className="text-xs text-bm-muted2">
            {lead.primary_wedge_angle || "Hypothesis pending"}
          </p>
          <p className="text-xs text-bm-muted2">
            Stack: {lead.estimated_system_stack.length > 0 ? lead.estimated_system_stack.join(", ") : "Not mapped"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-bm-muted2 lg:text-right">
          <span>Governance {lead.governance_risk_score}/5</span>
          <span>Reporting {lead.reporting_complexity_score}/5</span>
          <span>AI Pressure {lead.ai_pressure_score}/5</span>
          <span>Fragmentation {lead.vendor_fragmentation_score}/5</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StrategicOutreachPage({
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
  const [dashboard, setDashboard] = useState<StrategicOutreachDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("heatmap");
  const [busyAction, setBusyAction] = useState<"seed" | "monitor" | string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDataError(null);
    try {
      const nextDashboard = await fetchStrategicOutreachDashboard(params.envId, businessId);
      setDashboard(nextDashboard);
    } catch (err) {
      setDashboard(null);
      setDataError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, params.envId]);

  useEffect(() => {
    if (!ready) return;
    void loadDashboard();
  }, [loadDashboard, ready]);

  const bannerMessage = contextError
    ? contextError === "Environment not bound to a business."
      ? "This environment is not bound to a business, so CRM data cannot be loaded."
      : contextError
    : dataError;
  const isLoading = contextLoading || (ready && loading);

  const approveDraft = useCallback(
    async (sequenceId: string, draftMessage: string) => {
      setBusyAction(sequenceId);
      setDataError(null);
      try {
        await approveStrategicOutreach(sequenceId, { approved_message: draftMessage });
        await loadDashboard();
      } catch (err) {
        setDataError(formatError(err));
      } finally {
        setBusyAction(null);
      }
    },
    [loadDashboard],
  );

  const runMonitor = useCallback(async () => {
    if (!businessId) return;
    setBusyAction("monitor");
    setDataError(null);
    try {
      await runStrategicOutreachMonitor({ env_id: params.envId, business_id: businessId });
      await loadDashboard();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusyAction(null);
    }
  }, [businessId, loadDashboard, params.envId]);

  const seedTargets = useCallback(async () => {
    if (!businessId) return;
    setBusyAction("seed");
    setDataError(null);
    try {
      await seedStrategicOutreach({ env_id: params.envId, business_id: businessId });
      await loadDashboard();
    } catch (err) {
      setDataError(formatError(err));
    } finally {
      setBusyAction(null);
    }
  }, [businessId, loadDashboard, params.envId]);

  const sortedLeads = useMemo(
    () =>
      dashboard
        ? [...dashboard.leads].sort(
            (a, b) => b.composite_priority_score - a.composite_priority_score,
          )
        : [],
    [dashboard],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Strategic Outreach</CardTitle>
          <p className="mt-2 text-sm text-bm-muted">
            Hypothesis-driven execution intelligence for executive-safe operator outreach.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void seedTargets()} disabled={!businessId || busyAction !== null}>
            {busyAction === "seed" ? "Seeding..." : "Seed Novendor Targets"}
          </Button>
          <Button size="sm" onClick={() => void runMonitor()} disabled={!businessId || busyAction !== null}>
            {busyAction === "monitor" ? "Running..." : "Run Daily Monitor"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">High Priority</p>
            <p className="mt-1 text-2xl font-semibold text-bm-danger">{dashboard?.metrics.high_priority ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Medium</p>
            <p className="mt-1 text-2xl font-semibold text-bm-warning">{dashboard?.metrics.medium_priority ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Low</p>
            <p className="mt-1 text-2xl font-semibold">{dashboard?.metrics.low_priority ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Time In Stage</p>
            <p className="mt-1 text-2xl font-semibold">{dashboard?.metrics.time_in_stage_days ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Engagement Rate</p>
            <p className="mt-1 text-2xl font-semibold">{fmtPct(dashboard?.metrics.engagement_rate)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </Button>
        ))}
      </div>

      {tab === "heatmap" ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Priority Heatmap</h2>
              {sortedLeads.length === 0 ? (
                <p className="text-sm text-bm-muted2">No strategic leads yet. Seed targets to initialize the Novendor hypothesis set.</p>
              ) : (
                <div className="space-y-2">
                  {sortedLeads.slice(0, 6).map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                      <span className="truncate pr-3">{lead.company_name}</span>
                      <span className={`font-semibold ${priorityTone(lead.composite_priority_score)}`}>
                        {lead.composite_priority_score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Status Funnel</h2>
              {dashboard?.status_funnel.length ? (
                <div className="space-y-2">
                  {dashboard.status_funnel.map((item) => (
                    <div key={item.status} className="flex items-center justify-between rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                      <span>{item.status}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-bm-muted2">No funnel movement yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "leads" ? (
        <div className="space-y-2">
          {sortedLeads.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-bm-muted2">
                No active strategic leads yet.
              </CardContent>
            </Card>
          ) : (
            sortedLeads.map((lead) => <LeadRow key={lead.id} lead={lead} />)
          )}
        </div>
      ) : null}

      {tab === "triggers" ? (
        <div className="space-y-2">
          {dashboard?.trigger_signals.length ? (
            dashboard.trigger_signals.map((trigger) => (
              <Card key={trigger.id}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs rounded-full border border-bm-border/70 px-2 py-0.5 text-bm-text">
                      {trigger.trigger_type}
                    </span>
                    <span className="text-xs text-bm-muted2">{new Date(trigger.detected_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{trigger.summary}</p>
                  <a className="text-xs text-bm-accent hover:underline" href={trigger.source_url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-bm-muted2">No trigger signals recorded.</CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {tab === "queue" ? (
        <div className="space-y-2">
          {dashboard?.outreach_queue.length ? (
            dashboard.outreach_queue.map((sequence) => (
              <Card key={sequence.id}>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs rounded-full border border-bm-border/70 px-2 py-0.5 text-bm-text">
                        Stage {sequence.sequence_stage}
                      </span>
                      <span className="text-xs text-bm-muted2">Human Approval Required</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void approveDraft(sequence.id, sequence.draft_message)}
                      disabled={busyAction !== null}
                    >
                      {busyAction === sequence.id ? "Approving..." : "Approve As Drafted"}
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3 text-xs text-bm-muted2">
                    {sequence.draft_message}
                  </pre>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-bm-muted2">
                No queued drafts need approval right now.
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {tab === "diagnostics" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">6-Question Diagnostic</h2>
              <ol className="space-y-2 text-sm text-bm-muted list-decimal pl-5">
                {(dashboard?.metrics.diagnostic_questions ?? []).map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recent Sessions</h2>
              {dashboard?.diagnostics.length ? (
                <div className="space-y-2">
                  {dashboard.diagnostics.map((session) => (
                    <div key={session.id} className="rounded-lg border border-bm-border/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span>{session.scheduled_date}</span>
                        <span className="text-xs text-bm-muted2">AI {session.ai_readiness_score ?? "—"}/5</span>
                      </div>
                      <p className="mt-1 text-xs text-bm-muted2">
                        {session.recommended_first_intervention || "No intervention recorded yet."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-bm-muted2">No diagnostics scheduled yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "deliverables" ? (
        <div className="space-y-2">
          {dashboard?.deliverables.length ? (
            dashboard.deliverables.map((deliverable) => (
              <Card key={deliverable.id}>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{deliverable.file_path}</span>
                    <span className="text-xs text-bm-muted2">{deliverable.sent_date}</span>
                  </div>
                  <p className="text-sm text-bm-muted">{deliverable.summary}</p>
                  <p className="text-xs text-bm-muted2">Follow-up: {deliverable.followup_status}</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-bm-muted2">No executive summaries have been logged yet.</CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
