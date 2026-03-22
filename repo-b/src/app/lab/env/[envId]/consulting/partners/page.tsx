"use client";

import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtCurrency } from "@/components/consulting/local-training/ui";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function PartnersPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, error } = useTrainingWorkspace(params.envId, businessId, ready);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No venue pipeline" body={error ?? "Seed the workspace to review organizations and venues."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[1.05fr,1fr]">
        <Card>
          <CardContent className="py-5">
            <CardTitle>Workflow C — Venue and partner pipeline</CardTitle>
            <p className="mt-2 text-sm text-bm-muted2">Compare fit, cost, and relationship state without relying on a desktop-only table.</p>
            <div className="mt-4 space-y-3">
              {workspace.venues.map((venue) => (
                <div key={venue.id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-bm-text">{venue.venue_name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{venue.city} · {venue.linked_organization_name ?? "Independent"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TonePill label={venue.venue_status} tone={venue.is_preferred ? "success" : venue.venue_status === "qualified" ? "info" : "default"} />
                      {venue.is_preferred ? <TonePill label="preferred" tone="success" /> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div><span className="text-bm-muted2">Capacity</span><p className="font-semibold">{venue.capacity_min}–{venue.capacity_max}</p></div>
                    <div><span className="text-bm-muted2">Cost/hr</span><p className="font-semibold">{fmtCurrency(venue.hourly_cost)}</p></div>
                    <div><span className="text-bm-muted2">Wi-Fi</span><p className="font-semibold">{venue.wifi_quality}</p></div>
                    <div><span className="text-bm-muted2">Best use</span><p className="font-semibold">{venue.preferred_for_event_type}</p></div>
                  </div>
                  <p className="mt-3 text-xs text-bm-muted2">{venue.notes}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <CardTitle>Organizations and referral partners</CardTitle>
            <div className="mt-4 space-y-3">
              {workspace.organizations.map((organization) => (
                <div key={organization.crm_account_id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-bm-text">{organization.organization_name}</p>
                      <p className="mt-1 text-sm text-bm-muted2">{organization.organization_type} · {organization.city}, {organization.state}</p>
                    </div>
                    <TonePill label={organization.partner_status ?? "—"} tone={organization.partner_status === "qualified" ? "success" : organization.partner_status === "contacted" ? "info" : "default"} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <p><span className="text-bm-muted2">Relationship:</span> {organization.relationship_type}</p>
                    <p><span className="text-bm-muted2">Owner contact:</span> {organization.owner_contact_name} · {organization.owner_contact_email}</p>
                    <p className="text-bm-muted2">{organization.notes}</p>
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
