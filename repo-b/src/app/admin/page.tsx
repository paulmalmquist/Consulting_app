"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { CreateEnvironmentPanel } from "@/components/lab/environments/CreateEnvironmentPanel";
import { EnvironmentList } from "@/components/lab/environments/EnvironmentList";
import { EnvironmentSettingsModal } from "@/components/lab/environments/EnvironmentSettingsModal";
import { type Industry } from "@/components/lab/environments/constants";
import { MetricCard } from "@/components/ui/MetricCard";
import { ActivityFeed, type ActivityItem } from "@/components/ui/ActivityFeed";
import { InsightRail, type InsightSection } from "@/components/ui/InsightRail";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

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
  const { environments, refresh, selectEnv } = useEnv();
  const [selectedSettingsId, setSelectedSettingsId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [showProvision, setShowProvision] = useState(false);

  const selectedSettingsEnv = useMemo(
    () => environments.find((env) => env.env_id === selectedSettingsId) || null,
    [environments, selectedSettingsId]
  );

  // Compute KPI values from environments
  const activeCount = environments.filter((e) => e.is_active).length;
  const archivedCount = environments.filter((e) => !e.is_active).length;

  // Activity feed from environment creation dates
  const activityItems = useMemo<ActivityItem[]>(() => {
    return [...environments]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 8)
      .map((env) => ({
        id: env.env_id,
        avatar: env.client_name.slice(0, 2),
        summary: `Environment "${env.client_name}" provisioned`,
        entityLink: { label: env.client_name, href: `/lab/env/${env.env_id}` },
        timestamp: formatRelative(env.created_at),
      }));
  }, [environments]);

  // Insight rail: stale environments
  const insightSections = useMemo<InsightSection[]>(() => {
    const stale = environments.filter((e) => {
      if (!e.created_at) return false;
      const days = (Date.now() - new Date(e.created_at).getTime()) / 86_400_000;
      return days > 7 && e.is_active;
    });
    return [
      {
        title: "Stale Environments",
        items: stale.slice(0, 5).map((e) => ({
          id: e.env_id,
          severity: "warning" as const,
          label: e.client_name,
          detail: `No activity for ${Math.floor((Date.now() - new Date(e.created_at || 0).getTime()) / 86_400_000)} days`,
          action: { label: "Open", href: `/lab/env/${e.env_id}` },
        })),
      },
      {
        title: "Recently Provisioned",
        items: environments
          .filter((e) => {
            if (!e.created_at) return false;
            return (Date.now() - new Date(e.created_at).getTime()) / 86_400_000 < 3;
          })
          .slice(0, 3)
          .map((e) => ({
            id: `recent-${e.env_id}`,
            severity: "info" as const,
            label: e.client_name,
            detail: `Created ${formatRelative(e.created_at)}`,
          })),
      },
    ];
  }, [environments]);

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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-display font-bold tracking-tight">Control Tower</h1>
          <p className="text-sm text-bm-muted2 mt-1">
            Operational readiness across all business environments.
          </p>
        </div>
        <Button onClick={() => setShowProvision(true)}>+ Provision</Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Active Environments" value={String(activeCount)} size="compact" status={activeCount > 0 ? "success" : "neutral"} />
        <MetricCard label="Archived" value={String(archivedCount)} size="compact" status={archivedCount > 0 ? "warning" : "neutral"} />
        <MetricCard label="Total" value={String(environments.length)} size="compact" />
        <MetricCard label="Industries" value={String(new Set(environments.map((e) => e.industry_type || e.industry)).size)} size="compact" />
        <MetricCard label="Recent (7d)" value={String(environments.filter((e) => e.created_at && (Date.now() - new Date(e.created_at).getTime()) / 86_400_000 < 7).length)} size="compact" />
      </div>

      {/* Main Content: Grid + Insight Rail */}
      <div className="grid 2xl:grid-cols-[minmax(0,1fr),320px] gap-6">
        <div className="space-y-6">
          <EnvironmentList
            environments={environments}
            onOpen={openEnvironment}
            onSettings={setSelectedSettingsId}
            onDelete={deleteEnvironment}
          />

          {/* Activity Feed */}
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5">
            <ActivityFeed items={activityItems} maxItems={6} title="Recent Provisioning" />
          </div>
        </div>

        {/* Insight Rail */}
        <div className="hidden 2xl:block">
          <div className="sticky top-20">
            <InsightRail sections={insightSections} />
          </div>
        </div>
      </div>

      <div className="2xl:hidden">
        <InsightRail sections={insightSections} />
      </div>

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
