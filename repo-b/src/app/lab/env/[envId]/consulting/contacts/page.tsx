"use client";

import { useMemo, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtDate } from "@/components/consulting/local-training/ui";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function ContactsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, mutating, error, createContact, createActivity, upsertRegistration } = useTrainingWorkspace(params.envId, businessId, ready);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ full_name: "", email: "", city: "Lake Worth Beach", persona_type: "curious beginner", lead_source: "facebook", interest_area: "AI basics" });

  const contacts = useMemo(() => {
    const rows = workspace?.contacts ?? [];
    if (filter === "all") return rows;
    if (filter === "priority") return rows.filter((contact) => contact.follow_up_priority === "high");
    if (filter === "owners") return rows.filter((contact) => contact.business_owner_flag);
    return rows.filter((contact) => contact.audience_segment === filter);
  }, [filter, workspace?.contacts]);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No CRM data" body={error ?? "Seed the workspace to review contacts."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr,1.25fr]">
        <Card>
          <CardContent className="py-5">
            <CardTitle>Quick-add contact</CardTitle>
            <p className="mt-2 text-sm text-bm-muted2">Workflow B starts here: create a lead, segment them, then invite or register them in one or two taps.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["full_name", "Full name"],
                ["email", "Email"],
                ["city", "City"],
                ["persona_type", "Persona"],
                ["lead_source", "Lead source"],
                ["interest_area", "Interest area"],
              ].map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-bm-muted2">{label}</span>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-xl border border-bm-border bg-bm-bg px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void createContact({
                  ...form,
                  preferred_contact_method: "email",
                  status: "new",
                  audience_segment: form.persona_type === "small business owner" ? "local business owners" : "community learners",
                  follow_up_priority: form.persona_type.includes("older") ? "high" : "medium",
                  tags: [form.city.toLowerCase().replace(/\s+/g, "-"), "quick-add"],
                  consent_to_email: true,
                })}
                disabled={mutating || !form.full_name}
              >
                Save contact
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const firstEventId = workspace.events[2]?.id;
                  const firstContact = contacts[0];
                  if (!firstEventId || !firstContact) return;
                  void upsertRegistration({
                    event_id: firstEventId,
                    contact_id: firstContact.crm_contact_id,
                    ticket_type: "standard",
                    price_paid: workspace.events[2]?.ticket_price_standard,
                    source_channel: "direct outreach",
                    referral_source: "quick-add demo",
                    follow_up_status: "queued",
                  });
                }}
                disabled={mutating || contacts.length === 0 || workspace.events.length < 3}
              >
                Demo: mark registered
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const firstContact = contacts[0];
                  const firstEvent = workspace.events[2];
                  if (!firstContact || !firstEvent) return;
                  void createActivity({
                    activity_type: "invite sent",
                    contact_id: firstContact.crm_contact_id,
                    event_id: firstEvent.id,
                    channel: "email",
                    subject: `Invite — ${firstEvent.event_name}`,
                    message_summary: "Sent beginner-friendly invite from contact workflow.",
                    outcome: "pending",
                    next_step: "Follow up in 3 days",
                    due_date: firstEvent.event_date,
                  });
                }}
                disabled={mutating || contacts.length === 0 || workspace.events.length < 3}
              >
                Demo: invite first contact
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Mobile contact list</CardTitle>
                <p className="mt-2 text-sm text-bm-muted2">Card layout keeps lookup fast on phone. Important fields stay above the fold; notes remain compact.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["priority", "High priority"],
                  ["owners", "Business owners"],
                  ["older adults", "Older adults"],
                  ["community learners", "Community learners"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`rounded-full px-3 py-2 text-xs ${filter === value ? "bg-bm-accent text-white" : "border border-bm-border text-bm-muted2"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {contacts.map((contact) => (
                <div key={contact.crm_contact_id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-bm-text">{contact.full_name}</p>
                        <TonePill label={contact.status} tone={contact.status === "attended" ? "success" : contact.status === "registered" ? "info" : "default"} />
                        {contact.business_owner_flag ? <TonePill label="business owner" tone="warning" /> : null}
                      </div>
                      <p className="mt-1 text-sm text-bm-muted2">{contact.email ?? "No email"} · {contact.phone ?? "No phone"}</p>
                      <p className="mt-2 text-sm text-bm-muted2">{contact.persona_type} · {contact.city} · {contact.interest_area}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TonePill label={`Events: ${contact.total_events_attended}`} tone={contact.total_events_attended > 1 ? "success" : "default"} />
                      <TonePill label={`Priority: ${contact.follow_up_priority ?? "—"}`} tone={contact.follow_up_priority === "high" ? "warning" : "default"} />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-xl bg-bm-surface/20 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Shown on phone</p>
                      <p className="mt-1 text-bm-text">Preferred contact: {contact.preferred_contact_method ?? "—"} · Source: {contact.lead_source ?? "—"}</p>
                    </div>
                    <div className="rounded-xl bg-bm-surface/20 px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Expanded details</p>
                      <p className="mt-1 text-bm-text">{contact.notes}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(contact.tags ?? []).map((tag) => <TonePill key={tag} label={tag} />)}
                    <span className="text-xs text-bm-muted2">Created {fmtDate(contact.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
