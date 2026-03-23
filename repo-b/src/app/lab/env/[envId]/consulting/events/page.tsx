"use client";

import { useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtCurrency, fmtDate, fmtTime } from "@/components/consulting/local-training/ui";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function EventsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, mutating, error, createEvent, createContact, upsertRegistration, checkIn } = useTrainingWorkspace(params.envId, businessId, ready);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [form, setForm] = useState({
    event_name: "",
    event_date: "2026-07-09",
    event_type: "intro class",
    city: "Lake Worth Beach",
    target_capacity: "24",
    ticket_price_standard: "35",
    ticket_price_early: "29",
  });

  const events = workspace?.events ?? [];
  const selectedEvent = useMemo(() => events.find((event) => event.id === (selectedEventId ?? events[0]?.id)) ?? events[0] ?? null, [events, selectedEventId]);
  const selectedRegistrations = useMemo(() => (workspace?.registrations ?? []).filter((row) => row.event_id === selectedEvent?.id), [workspace?.registrations, selectedEvent?.id]);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No event CRM data" body={error ?? "Seed the workspace to review events."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr,1.2fr]">
        <Card>
          <CardContent className="py-5">
            <CardTitle>Workflow A — Plan monthly event</CardTitle>
            <p className="mt-2 text-sm text-bm-muted2">Create the event, choose venue, connect a campaign, and auto-create the launch checklist.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["event_name", "Event name"],
                ["event_date", "Date"],
                ["event_type", "Type"],
                ["city", "City"],
                ["target_capacity", "Capacity"],
                ["ticket_price_standard", "Standard price"],
                ["ticket_price_early", "Early price"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-bm-muted2">{label}</span>
                  <input value={form[key as keyof typeof form]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-bm-border bg-bm-bg px-3 py-2 text-sm" />
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-bm-muted2">Venue</span>
              <select className="w-full rounded-xl border border-bm-border bg-bm-bg px-3 py-2 text-sm" defaultValue={workspace.venues[0]?.id} id="venue-select">
                {workspace.venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{venue.venue_name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-bm-muted2">Campaign</span>
              <select className="w-full rounded-xl border border-bm-border bg-bm-bg px-3 py-2 text-sm" defaultValue={workspace.campaigns[0]?.id} id="campaign-select">
                {workspace.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.campaign_name}</option>
                ))}
              </select>
            </label>
            <Button
              className="mt-4"
              disabled={mutating || !form.event_name}
              onClick={() => {
                const venueId = (document.getElementById("venue-select") as HTMLSelectElement | null)?.value;
                const campaignId = (document.getElementById("campaign-select") as HTMLSelectElement | null)?.value;
                void createEvent({
                  ...form,
                  venue_id: venueId,
                  campaign_id: campaignId,
                  event_series: "Novendor Community Access",
                  audience_level: "beginner",
                  event_status: "scheduled",
                  instructor: "Paul M.",
                  assistant_count: 1,
                  event_theme: "Simple, hands-on AI practice for local beginners",
                });
              }}
            >
              Create event + checklist
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Workflow E — Day-of event check-in</CardTitle>
                <p className="mt-2 text-sm text-bm-muted2">Optimized for standing at the venue on a phone: attendee list, quick check-in, walk-ins, and payment status.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {events.map((event) => (
                  <button key={event.id} onClick={() => setSelectedEventId(event.id)} className={`rounded-full px-3 py-2 text-xs ${selectedEvent?.id === event.id ? "bg-bm-accent text-white" : "border border-bm-border text-bm-muted2"}`}>
                    {fmtDate(event.event_date)}
                  </button>
                ))}
              </div>
            </div>

            {selectedEvent ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-bm-text">{selectedEvent.event_name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{selectedEvent.venue_name} · {fmtDate(selectedEvent.event_date)} · {fmtTime(selectedEvent.event_start_time)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TonePill label={selectedEvent.event_status} tone={selectedEvent.event_status === "completed" ? "success" : "warning"} />
                      <TonePill label={`Regs ${selectedEvent.actual_registrations}`} />
                      <TonePill label={`Checked in ${selectedEvent.actual_attendance}`} tone="info" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr,0.9fr]">
                  <div className="space-y-3">
                    {selectedRegistrations.map((registration) => (
                      <div key={registration.registration_id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-bm-text">{registration.contact_name}</p>
                            <p className="mt-1 text-xs text-bm-muted2">{registration.contact_email ?? registration.contact_phone ?? "No contact detail"}</p>
                            <p className="mt-1 text-xs text-bm-muted2">{registration.ticket_type ?? "standard"} · {fmtCurrency(registration.price_paid)}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <TonePill label={registration.payment_status} tone={registration.payment_status === "paid" ? "success" : "warning"} />
                            <Button size="sm" variant={registration.attended_flag ? "secondary" : "primary"} onClick={() => void checkIn(registration.registration_id, !registration.attended_flag)} disabled={mutating}>
                              {registration.attended_flag ? "Undo" : "Check in"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                    <p className="text-sm font-semibold text-bm-text">Add walk-in attendee</p>
                    <p className="mt-1 text-xs text-bm-muted2">Creates the contact first, then registers them to the selected event.</p>
                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        onClick={async () => {
                          const name = `Walk-in ${Date.now().toString().slice(-4)}`;
                          await createContact({
                            full_name: name,
                            city: selectedEvent.city,
                            persona_type: "curious beginner",
                            audience_segment: "community learners",
                            lead_source: "walk-in",
                            interest_area: "AI basics",
                            follow_up_priority: "medium",
                            tags: ["walk-in"],
                          });
                        }}
                        disabled={mutating}
                      >
                        Create walk-in contact
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const latest = workspace.contacts[0];
                          if (!latest || !selectedEvent) return;
                          void upsertRegistration({
                            event_id: selectedEvent.id,
                            contact_id: latest.crm_contact_id,
                            ticket_type: "walk-in",
                            price_paid: selectedEvent.ticket_price_standard,
                            payment_status: "pending",
                            source_channel: "walk-in",
                            referral_source: "door",
                            walk_in_flag: true,
                          });
                        }}
                        disabled={mutating || workspace.contacts.length === 0}
                      >
                        Register latest walk-in
                      </Button>
                    </div>
                    <div className="mt-4 rounded-xl bg-bm-surface/20 p-3 text-sm text-bm-muted2">
                      Post-event follow-up list is generated automatically by queued registration follow-up statuses after check-in.
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
