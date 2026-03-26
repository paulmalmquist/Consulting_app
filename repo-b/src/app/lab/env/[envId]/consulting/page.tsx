"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtCurrency, fmtDate, fmtTime } from "@/components/consulting/local-training/ui";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

function Metric({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-bm-text">{value}</p>
        {sublabel ? <p className="mt-1 text-xs text-bm-muted2">{sublabel}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function ConsultingCommandCenter({ params }: { params: { envId: string } }) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const { workspace, loading, mutating, error, seed } = useTrainingWorkspace(params.envId, businessId, ready);
  const nextEvent = workspace?.summary.next_event ?? null;
  const mobile = workspace?.summary.mobile_dashboard;
  const eventPerformance = workspace?.reports.event_performance ?? [];

  const commandLinks = useMemo(
    () => [
      { href: `/lab/env/${params.envId}/consulting/contacts`, label: "Contacts" },
      { href: `/lab/env/${params.envId}/consulting/events`, label: "Events" },
      { href: `/lab/env/${params.envId}/consulting/partners`, label: "Venues" },
      { href: `/lab/env/${params.envId}/consulting/tasks`, label: "Tasks" },
      { href: `/lab/env/${params.envId}/consulting/reports`, label: "Reports" },
    ],
    [params.envId],
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${params.envId}/consulting`,
      surface: "consulting_workspace",
      active_module: "consulting",
      page_entity_type: "environment",
      page_entity_id: params.envId,
      page_entity_name: workspace?.summary.next_event?.event_name || "Consulting Command Center",
      selected_entities: [],
      visible_data: {
        contacts: (workspace?.contacts || []).slice(0, 12).map((contact) => ({
          entity_type: "contact",
          entity_id: contact.crm_contact_id,
          name: contact.full_name,
          metadata: {
            status: contact.status,
            city: contact.city,
          },
        })),
        events: (workspace?.events || []).slice(0, 12).map((event) => ({
          entity_type: "event",
          entity_id: event.id,
          name: event.event_name,
          metadata: {
            event_status: event.event_status,
            venue_name: event.venue_name,
          },
        })),
        metrics: {
          contact_count: workspace?.contacts.length || 0,
          event_count: workspace?.events.length || 0,
          followups_due: workspace?.summary.followups_due || 0,
        },
        notes: ["Consulting command center for local AI classes"],
      },
    });
    return () => resetAssistantPageContext();
  }, [params.envId, workspace]);

  if (contextLoading || loading) {
    return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  }

  if (contextError) {
    return <EmptyState title="Environment unavailable" body={contextError} />;
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {error ? (
        <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <TonePill label="Novendor Local AI Classes CRM" tone="info" />
            <div>
              <h2 className="text-2xl font-semibold text-bm-text">Founder-ready command center for local events</h2>
              <p className="mt-2 max-w-3xl text-sm text-bm-muted2">
                Manage beginner-friendly AI classes across Lake Worth Beach and West Palm Beach: contacts, venues, events, outreach, check-in, and follow-up from the same mobile-friendly workspace.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void seed()} disabled={mutating || Boolean(workspace?.contacts.length)}>
              {workspace?.contacts.length ? "Seeded" : mutating ? "Seeding..." : "Seed realistic data"}
            </Button>
            <Link href={`/lab/env/${params.envId}/consulting/events`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm text-bm-text hover:bg-bm-surface/30">
              Open check-in
            </Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          {commandLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl border border-bm-border/70 bg-bm-bg px-3 py-3 text-sm font-medium text-bm-text hover:bg-bm-surface/30">
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      {!workspace ? (
        <EmptyState title="Seed the local training CRM" body="No event CRM records exist yet for this environment. Use the seed action above to load a realistic South Florida operating dataset." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Metric label="Next Event" value={nextEvent ? fmtDate(nextEvent.event_date) : "—"} sublabel={nextEvent ? nextEvent.event_name : "Seed data to begin"} />
            <Metric label="Contacts" value={workspace.seed_summary.contacts} sublabel={`${workspace.summary.contacts_added_this_month} added this month`} />
            <Metric label="Follow-ups due" value={workspace.summary.followups_due} sublabel="Registrations awaiting nurture" />
            <Metric label="Open tasks" value={workspace.tasks.filter((task) => task.status !== "done").length} sublabel="Phone quick actions included" />
            <Metric label="Campaigns live" value={workspace.campaigns.filter((campaign) => campaign.status === "active").length} sublabel="Channel performance tracked" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr,0.95fr]">
            <Card>
              <CardContent className="py-5">
                <CardTitle>Dashboard 1 — CRM command center</CardTitle>
                {nextEvent ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-bm-text">{nextEvent.event_name}</p>
                        <p className="mt-1 text-sm text-bm-muted2">
                          {fmtDate(nextEvent.event_date)} · {fmtTime(nextEvent.event_start_time)} – {fmtTime(nextEvent.event_end_time)} · {nextEvent.venue_name}
                        </p>
                      </div>
                      <TonePill label={nextEvent.event_status} tone={nextEvent.event_status === "scheduled" ? "warning" : "success"} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div><span className="text-bm-muted2">Target</span><p className="font-semibold">{nextEvent.target_capacity ?? "—"}</p></div>
                      <div><span className="text-bm-muted2">Registrations</span><p className="font-semibold">{nextEvent.actual_registrations}</p></div>
                      <div><span className="text-bm-muted2">Ticket</span><p className="font-semibold">{fmtCurrency(nextEvent.ticket_price_standard)}</p></div>
                      <div><span className="text-bm-muted2">Theme</span><p className="font-semibold">{nextEvent.event_type}</p></div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <h3 className="text-sm font-semibold text-bm-text">Recent activity feed</h3>
                    <div className="mt-3 space-y-3">
                      {workspace.summary.recent_activity.slice(0, 5).map((activity) => (
                        <div key={activity.id} className="border-l-2 border-bm-accent/60 pl-3">
                          <p className="text-sm font-medium text-bm-text">{activity.subject ?? activity.activity_type}</p>
                          <p className="text-xs text-bm-muted2">{fmtDate(activity.activity_date)} · {activity.channel ?? "manual"} · {activity.outcome ?? "pending"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <h3 className="text-sm font-semibold text-bm-text">Venue outreach status</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(workspace.summary.venue_outreach_status).map(([status, count]) => (
                        <TonePill key={status} label={`${status}: ${count}`} tone={status === "preferred" ? "success" : status === "qualified" ? "info" : "default"} />
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-bm-muted2">Preferred venues and partner pipeline are tracked separately so venue fit, cost, and relationship stage stay auditable.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5">
                <CardTitle>Dashboard 4 — Mobile quick dashboard</CardTitle>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Today&apos;s tasks</p>
                    <div className="mt-2 space-y-2">
                      {mobile?.today_tasks.slice(0, 4).map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-bm-surface/20 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-bm-text">{task.task_name}</p>
                            <p className="text-xs text-bm-muted2">{task.priority} · due {fmtDate(task.due_date)}</p>
                          </div>
                          <TonePill label={task.status} tone={task.status === "in_progress" ? "warning" : "default"} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recent registrations</p>
                    <div className="mt-2 space-y-2">
                      {mobile?.recent_registrations.map((registration) => (
                        <div key={registration.registration_id} className="flex items-center justify-between gap-2 rounded-lg bg-bm-surface/20 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-bm-text">{registration.contact_name}</p>
                            <p className="text-xs text-bm-muted2">{registration.event_name}</p>
                          </div>
                          <TonePill label={registration.payment_status} tone={registration.payment_status === "paid" ? "success" : "warning"} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <Card>
              <CardContent className="py-5">
                <CardTitle>Current-state inventory and target architecture</CardTitle>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">What existed</p>
                    <div className="mt-3 space-y-3">
                      {workspace.inventory.existing_objects.map((row) => (
                        <div key={row.object} className="rounded-xl border border-bm-border/70 bg-bm-bg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-bm-text">{row.object}</p>
                            <TonePill label={String(row.usable_as_is)} tone={row.usable_as_is === true ? "success" : row.usable_as_is === false ? "danger" : "warning"} />
                          </div>
                          <p className="mt-1 text-xs text-bm-muted2">{row.purpose}</p>
                          <p className="mt-2 text-xs text-bm-text">Action: {row.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Target architecture</p>
                    <div className="mt-3 space-y-2">
                      {Object.entries(workspace.architecture).map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-bm-border/70 bg-bm-bg px-3 py-2 text-sm">
                          <span className="font-medium text-bm-text">{key}</span>
                          <p className="text-xs text-bm-muted2">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5">
                <CardTitle>QA receipts</CardTitle>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label="Orphans" value={workspace.qa.orphan_records} />
                  <Metric label="Bad statuses" value={workspace.qa.impossible_status_rows} />
                  <Metric label="Duplicate emails" value={workspace.qa.duplicate_contact_emails.length} />
                  <Metric label="Registration sync" value={workspace.qa.registration_count_matches_events ? "OK" : "Mismatch"} />
                </div>
                <div className="mt-4 rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                  <p className="text-sm font-semibold text-bm-text">Mobile issues fixed in this build</p>
                  <ul className="mt-2 space-y-2 text-sm text-bm-muted2">
                    {workspace.inventory.mobile_problems_before_build.map((item) => (
                      <li key={item} className="list-disc ml-5">{item}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-5">
              <CardTitle>Dashboard 2 — Event performance</CardTitle>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {eventPerformance.map((event) => (
                  <div key={event.event_id} className="rounded-xl border border-bm-border/70 bg-bm-bg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-bm-text">{event.event_name}</p>
                        <p className="mt-1 text-xs text-bm-muted2">Regs {event.registrations} · Attendance {event.attendance}</p>
                      </div>
                      <TonePill label={event.capacity_utilization ? `${event.capacity_utilization}% cap` : "—"} tone="info" />
                    </div>
                    <div className="mt-3 text-xs text-bm-muted2">
                      Repeat attendees: {event.repeat_attendance} · Feedback: {event.feedback_score ?? "—"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {Object.entries(event.channel_conversion).slice(0, 3).map(([channel, count]) => (
                        <TonePill key={channel} label={`${channel}: ${count}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
