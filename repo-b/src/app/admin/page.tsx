"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { ControlTowerMetrics } from "@/components/admin/ControlTowerMetrics";
import { CreateEnvironmentPanel } from "@/components/lab/environments/CreateEnvironmentPanel";
import { EnvironmentList } from "@/components/lab/environments/EnvironmentList";
import { EnvironmentSettingsModal } from "@/components/lab/environments/EnvironmentSettingsModal";
import { type Industry } from "@/components/lab/environments/constants";
import { ActivityFeed, type ActivityItem } from "@/components/ui/ActivityFeed";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SystemStatusBanner } from "@/components/admin/SystemStatusBanner";
import { useGatewayHealth } from "@/components/admin/useGatewayHealth";
import { RecentEnhancementsPanel } from "@/components/admin/RecentEnhancementsPanel";

function formatRelative(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const { environments, refresh, selectEnv, loading } = useEnv();
  const [selectedSettingsId, setSelectedSettingsId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showProvision, setShowProvision] = useState(false);
  const gateway = useGatewayHealth();

  const selectedSettingsEnv = useMemo(
    () => environments.find((env) => env.env_id === selectedSettingsId) || null,
    [environments, selectedSettingsId]
  );

  // Compute KPI values from environments
  const activeCount = environments.filter((e) => e.is_active).length;
  const industryCount = new Set(environments.map((e) => e.industry_type || e.industry)).size;
  const recentCount = environments.filter(
    (e) => e.created_at && (Date.now() - new Date(e.created_at).getTime()) / 86_400_000 < 7
  ).length;

  // Activity feed from environment data — show provisioned + archived events
  const activityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const env of environments) {
      items.push({
        id: `prov-${env.env_id}`,
        avatar: env.client_name.slice(0, 2),
        summary: `Environment "${env.client_name}" provisioned`,
        entityLink: { label: env.client_name, href: `/lab/env/${env.env_id}` },
        timestamp: formatRelative(env.created_at),
      });
      if (!env.is_active) {
        items.push({
          id: `arch-${env.env_id}`,
          avatar: env.client_name.slice(0, 2),
          summary: `Environment "${env.client_name}" archived`,
          entityLink: { label: env.client_name, href: `/lab/env/${env.env_id}` },
          timestamp: formatRelative(env.created_at),
        });
      }
    }
    return items
      .sort((a, b) => {
        // Sort by most recent first using the raw timestamp text
        // (this is best-effort since we only have formatted strings)
        return 0; // preserve insertion order which is already sorted by env list
      })
      .slice(0, 8);
  }, [environments]);

  // No longer computing insight sections — replaced by RecentEnhancementsPanel

  const openEnvironment = (envId: string) => {
    selectEnv(envId);
    router.push(`/lab/env/${envId}`);
  };

  const provisionEnvironment = async ({
    clientName,
    industry,
    notes,
  }: {
    clientName: string;
    industry: Industry;
    notes: string;
  }) => {
    const payload = await apiFetch<{ env_id: string }>("/v1/environments", {
      method: "POST",
      body: JSON.stringify({
        client_name: clientName,
        industry,
        industry_type: industry,
        notes,
      }),
    });
    await refresh();
    setShowProvision(false);
    sessionStorage.setItem(
      "bm_env_flash",
      JSON.stringify({
        envId: payload.env_id,
        kind: "created",
        message: `Created environment "${clientName}".`,
      })
    );
    openEnvironment(payload.env_id);
  };

  const updateEnvironmentSettings = async ({
    envId,
    industry,
    notes,
    isActive,
  }: {
    envId: string;
    industry: Industry;
    notes: string;
    isActive: boolean;
  }) => {
    await apiFetch(`/v1/environments/${envId}`, {
      method: "PATCH",
      body: JSON.stringify({ industry, industry_type: industry, notes, is_active: isActive }),
    });
    await refresh();
  };

  const deleteEnvironment = async (envId: string) => {
    await apiFetch(`/v1/environments/${envId}`, {
      method: "DELETE",
    });
    await refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-bm-border/10 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.92),hsl(var(--bm-bg-2)/0.86))] px-6 py-6 shadow-[0_20px_38px_-34px_rgba(5,9,14,0.95)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Operations Command</p>
            <h1 className="mt-2 font-display text-[2rem] font-semibold tracking-tight text-bm-text">
              Control Tower
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-bm-muted">
              Operational readiness across all business environments with fast visibility into live status, recent provisioning, and follow-up signals.
            </p>
            <SystemStatusBanner
              status={gateway.status}
              lastChecked={gateway.lastChecked}
              className="mt-6"
            />
          </div>

          <div className="shrink-0">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowProvision(true)}
              className="border-bm-border/20 bg-bm-surface/68 px-4 hover:border-bm-accent/40 hover:bg-bm-surface/86"
            >
              + New Environment
            </Button>
          </div>
        </div>
      </section>

      <ControlTowerMetrics
        activeCount={activeCount}
        totalCount={environments.length}
        industryCount={industryCount}
        recentCount={recentCount}
        gatewayStatus={gateway.status}
        loading={loading}
      />

      {/* Main Content Grid */}
      <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {loading ? (
            <ControlTowerEnvironmentSkeleton />
          ) : (
            <EnvironmentList
              variant="controlTower"
              environments={environments}
              onOpen={openEnvironment}
              onSettings={setSelectedSettingsId}
              onDelete={deleteEnvironment}
            />
          )}
        </div>

        <div className="min-w-0">
          <div className="2xl:sticky 2xl:top-24">
            <RecentEnhancementsPanel />
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-bm-border/10 bg-bm-surface/68 p-5 opacity-90">
        <ActivityFeed items={activityItems} maxItems={6} title="Recent Activity" />
      </section>

      {/* Provision Dialog */}
      <Dialog
        open={showProvision}
        onOpenChange={setShowProvision}
        title="Provision Environment"
        description="Create a new isolated business environment."
      >
        <CreateEnvironmentPanel onProvision={provisionEnvironment} />
      </Dialog>

      <EnvironmentSettingsModal
        open={Boolean(selectedSettingsEnv)}
        env={selectedSettingsEnv}
        stats={
          selectedSettingsEnv
            ? { last_activity: selectedSettingsEnv.created_at }
            : undefined
        }
        saving={settingsSaving}
        onOpenChange={(open) => {
          if (!open) setSelectedSettingsId(null);
        }}
        onSave={async ({ industry, notes, isActive }) => {
          if (!selectedSettingsEnv) return;
          setSettingsSaving(true);
          try {
            await updateEnvironmentSettings({
              envId: selectedSettingsEnv.env_id,
              industry,
              notes,
              isActive,
            });
            setSelectedSettingsId(null);
          } finally {
            setSettingsSaving(false);
          }
        }}
        onDelete={async () => {
          if (!selectedSettingsEnv) return;
          setSettingsSaving(true);
          try {
            await deleteEnvironment(selectedSettingsEnv.env_id);
            setSelectedSettingsId(null);
          } finally {
            setSettingsSaving(false);
          }
        }}
      />
    </div>
  );
}

function ControlTowerEnvironmentSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-bm-surface/80" />
        <div className="h-7 w-48 animate-pulse rounded bg-bm-surface/85" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-bm-surface/70" />
      </div>

      <div className="rounded-xl border border-bm-border/10 bg-bm-surface/76 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-10 animate-pulse rounded-lg bg-bm-surface2/90" />
            <div className="h-10 animate-pulse rounded-lg bg-bm-surface2/90" />
            <div className="h-10 animate-pulse rounded-lg bg-bm-surface2/90" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 animate-pulse rounded-full bg-bm-surface2/80" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-bm-surface2/80" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-bm-surface2/80" />
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-bm-border/10 bg-bm-surface/82 shadow-[0_18px_34px_-32px_rgba(5,9,14,0.95)]">
        <div className="hidden border-b border-bm-border/8 px-5 py-3 md:block">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_auto] gap-4">
            <div className="h-3 w-40 animate-pulse rounded bg-bm-surface2/85" />
            <div className="h-3 w-20 animate-pulse rounded bg-bm-surface2/75" />
            <div className="justify-self-end h-3 w-28 animate-pulse rounded bg-bm-surface2/75" />
          </div>
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="grid gap-4 border-b border-bm-border/6 px-5 py-5 md:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_auto]"
            >
              <div className="space-y-3">
                <div className="h-6 w-20 animate-pulse rounded-full bg-bm-surface2/90" />
                <div className="h-5 w-56 max-w-full animate-pulse rounded bg-bm-surface2/80" />
              </div>
              <div className="space-y-3">
                <div className="h-4 w-48 max-w-full animate-pulse rounded bg-bm-surface2/75" />
                <div className="h-4 w-40 max-w-full animate-pulse rounded bg-bm-surface2/65" />
              </div>
              <div className="flex items-center justify-end gap-3">
                <div className="h-4 w-16 animate-pulse rounded bg-bm-surface2/65" />
                <div className="h-8 w-8 animate-pulse rounded bg-bm-surface2/85" />
                <div className="h-8 w-8 animate-pulse rounded bg-bm-surface2/85" />
                <div className="h-8 w-8 animate-pulse rounded bg-bm-surface2/85" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
