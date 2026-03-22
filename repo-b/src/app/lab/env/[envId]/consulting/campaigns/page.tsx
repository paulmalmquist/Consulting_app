"use client";

import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { useTrainingWorkspace } from "@/components/consulting/local-training/useTrainingWorkspace";
import { EmptyState, TonePill, fmtCurrency, fmtDate } from "@/components/consulting/local-training/ui";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function CampaignsPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const { workspace, loading, error } = useTrainingWorkspace(params.envId, businessId, ready);

  if (loading) return <div className="h-64 rounded-2xl border border-bm-border/60 bg-bm-surface/20 animate-pulse" />;
  if (!workspace) return <EmptyState title="No campaign data" body={error ?? "Seed the workspace to review campaign tracking."} />;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {error ? <div className="rounded-xl border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm">{error}</div> : null}
      <Card>
        <CardContent className="py-5">
          <CardTitle>Workflow D — Campaign tracking</CardTitle>
          <p className="mt-2 text-sm text-bm-muted2">Every channel is tied back to a target event so registrations can be compared over time.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workspace.campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-2xl border border-bm-border/70 bg-bm-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-bm-text">{campaign.campaign_name}</p>
                    <p className="mt-1 text-sm text-bm-muted2">{campaign.channel} · {campaign.target_event_name}</p>
                  </div>
                  <TonePill label={campaign.status} tone={campaign.status === "active" ? "info" : "success"} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-bm-muted2">Launch</span><p className="font-semibold">{fmtDate(campaign.launch_date)}</p></div>
                  <div><span className="text-bm-muted2">Budget</span><p className="font-semibold">{fmtCurrency(campaign.budget)}</p></div>
                  <div><span className="text-bm-muted2">Leads</span><p className="font-semibold">{campaign.leads_generated}</p></div>
                  <div><span className="text-bm-muted2">Registrations</span><p className="font-semibold">{campaign.registrations_generated}</p></div>
                </div>
                <p className="mt-3 text-sm text-bm-text">{campaign.message_angle}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
