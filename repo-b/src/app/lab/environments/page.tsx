"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Environment } from "@/components/EnvProvider";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { CreateEnvironmentPanel } from "@/components/lab/environments/CreateEnvironmentPanel";
import { EnvironmentList } from "@/components/lab/environments/EnvironmentList";
import { EnvironmentSettingsModal } from "@/components/lab/environments/EnvironmentSettingsModal";
import type { Industry } from "@/components/lab/environments/constants";

export default function EnvironmentsPage() {
  const router = useRouter();
  const { environments, refresh, selectEnv } = useEnv();
  const [selectedSettingsId, setSelectedSettingsId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const dedupedEnvironments = useMemo(() => {
    const byId = new Map<string, Environment>();
    for (const env of environments) {
      if (!byId.has(env.env_id)) {
        byId.set(env.env_id, env);
      }
    }
    return [...byId.values()];
  }, [environments]);

  const selectedSettingsEnv = useMemo(
    () => dedupedEnvironments.find((env) => env.env_id === selectedSettingsId) || null,
    [dedupedEnvironments, selectedSettingsId]
  );

  const openEnvironment = (envId: string) => {
    selectEnv(envId);
    router.push(`/lab/env/${envId}`);
  };

  const provisionEnvironment = async ({ clientName, industry, notes }: { clientName: string; industry: Industry; notes: string }) => {
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
      body: JSON.stringify({
        industry,
        industry_type: industry,
        notes,
        is_active: isActive,
      }),
    });
    await refresh();
  };

  const archiveEnvironment = async (envId: string) => {
    await apiFetch(`/v1/environments/${envId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    });
    await refresh();
  };

  return (
    <div className="grid xl:grid-cols-[380px,1fr] gap-6">
      <CreateEnvironmentPanel onProvision={provisionEnvironment} />

      <EnvironmentList
        environments={dedupedEnvironments}
        onOpen={openEnvironment}
        onSettings={setSelectedSettingsId}
        onArchive={archiveEnvironment}
      />

      <EnvironmentSettingsModal
        open={Boolean(selectedSettingsEnv)}
        env={selectedSettingsEnv}
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
        onArchiveToggle={async ({ isActive }) => {
          if (!selectedSettingsEnv) return;
          setSettingsSaving(true);
          try {
            await updateEnvironmentSettings({
              envId: selectedSettingsEnv.env_id,
              industry: (selectedSettingsEnv.industry_type || selectedSettingsEnv.industry) as Industry,
              notes: selectedSettingsEnv.notes || "",
              isActive,
            });
            setSelectedSettingsId(null);
          } finally {
            setSettingsSaving(false);
          }
        }}
      />
    </div>
  );
}
