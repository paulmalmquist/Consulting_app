"use client";

import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtCurrency } from "@/components/consulting/local-training/ui";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function ReportsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, error } = useTrainingWorkspace(params.envId, businessId, ready);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No reporting data" body={error ?? "Seed the workspace to review dashboards."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <CardTitle>Dashboard 2 — Event performance</CardTitle>
            <div className="mt-4 space-y-3">
              {workspace.reports.event_performance.map((event) => (
                <div key={event.event_id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-bm-text">{event.event_name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">Regs {event.registrations} · Attendance {event.attendance}</p>
                    </div>
                    <TonePill label={event.capacity_utilization ? `${event.capacity_utilization}% full` : "—"} tone="info" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div><span className="text-bm-muted2">Repeat</span><p className="font-semibold">{event.repeat_attendance}</p></div>
                    <div><span className="text-bm-muted2">Feedback</span><p className="font-semibold">{event.feedback_score ?? "—"}</p></div>
                    <div><span className="text-bm-muted2">Early bird</span><p className="font-semibold">{event.price_mix.early_bird}</p></div>
                    <div><span className="text-bm-muted2">Standard</span><p className="font-semibold">{event.price_mix.standard}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <CardTitle>Dashboard 3 — Partnership and venue pipeline</CardTitle>
            <div className="mt-4 space-y-3">
              {workspace.reports.partnership_pipeline.cost_comparison.map((venue) => (
                <div key={venue.venue_name} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-bm-text">{venue.venue_name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{venue.city}</p>
                    </div>
                    <TonePill label={fmtCurrency(venue.hourly_cost)} />
                  </div>
                  <p className="mt-2 text-sm text-bm-muted2">Capacity up to {venue.capacity_max ?? "—"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-5">
          <CardTitle>Seed data summary + suggested next expansions</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Object.entries(workspace.seed_summary).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-bm-border/70 bg-bm-bg px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{key.replace(/_/g, " ")}</p>
                <p className="mt-1 text-2xl font-semibold text-bm-text">{value}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm text-bm-muted2">
            <li className="ml-5 list-disc">Add a lightweight landing page intake form that writes directly into contacts + registrations.</li>
            <li className="ml-5 list-disc">Add QR-code check-in for repeated classes and partner-hosted sessions.</li>
            <li className="ml-5 list-disc">Add reusable reminder and follow-up email templates tuned for older adults and beginners.</li>
            <li className="ml-5 list-disc">Add recurring event cloning plus waitlist overflow handling.</li>
            <li className="ml-5 list-disc">Add sponsor tracking and simple revenue reconciliation once recurring events stabilize.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
