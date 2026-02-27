"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { CreateEnvironmentPanel } from "@/components/lab/environments/CreateEnvironmentPanel";
import { EnvironmentList } from "@/components/lab/environments/EnvironmentList";
import { EnvironmentSettingsModal } from "@/components/lab/environments/EnvironmentSettingsModal";
import { resolveEnvironmentOpenPath, type Industry } from "@/components/lab/environments/constants";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function EnvironmentsPage() {
  const router = useRouter();
  const { environments, refresh, selectEnv } = useEnv();
  const [selectedSettingsId, setSelectedSettingsId] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const selectedSettingsEnv = useMemo(
    () => environments.find((env) => env.env_id === selectedSettingsId) || null,
    [environments, selectedSettingsId]
  );

  const openEnvironment = (envId: string) => {
    const env = environments.find((row) => row.env_id === envId);
    const industry = env?.industry_type || env?.industry;
    selectEnv(envId);
    router.push(resolveEnvironmentOpenPath({ envId, industry }));
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

  const deleteEnvironment = async (envId: string) => {
    await apiFetch(`/v1/environments/${envId}`, {
      method: "DELETE",
    });
    await refresh();
  };

  const provisionMeridianDemo = async () => {
    const payload = await apiFetch<{ env: { env_id: string } }>("/api/ecc/demo/create_env_meridian_apex", {
      method: "POST",
    });
    await refresh();
    selectEnv(payload.env.env_id);
    router.push(`/lab/env/${payload.env.env_id}/ecc`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-bm-text">Executive Command Center Demo</p>
            <p className="text-xs text-bm-muted">
              Provision Meridian Apex Holdings with a seeded &quot;messy day&quot; queue and open the mobile-first ECC.
            </p>
          </div>
          <Button type="button" onClick={provisionMeridianDemo}>
            Open Meridian Apex
          </Button>
        </CardContent>
      </Card>

      <div className="grid xl:grid-cols-[380px,1fr] gap-6">
        <CreateEnvironmentPanel onProvision={provisionEnvironment} />

        <EnvironmentList
          environments={environments}
          onOpen={openEnvironment}
          onSettings={setSelectedSettingsId}
          onDelete={deleteEnvironment}
        />
      </div>

      <EnvironmentSettingsModal
        open={Boolean(selectedSettingsEnv)}
        env={selectedSettingsEnv}
        stats={
          selectedSettingsEnv
            ? {
                last_activity: selectedSettingsEnv.created_at,
              }
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
