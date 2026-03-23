"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { resolveEnvironmentTemplateKey } from "@/components/lab/environments/constants";

export type DemoEnvironment = {
  env_id: string;
  client_name?: string | null;
  business_id?: string | null;
  industry?: string | null;
  industry_type?: string | null;
  workspace_template_key?: string | null;
  [key: string]: unknown;
};

type EnvContextValue = {
  environments: DemoEnvironment[];
  selectedEnv: DemoEnvironment | null;
  selectEnv: (envId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const EnvContext = createContext<EnvContextValue | undefined>(undefined);
const STORAGE_KEY = "demo_lab_env_id";

export function EnvProvider({ children }: { children: React.ReactNode }) {
  const [environments, setEnvironments] = useState<DemoEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{ environments?: DemoEnvironment[] }>("/v1/environments");
      const nextEnvironments = (response.environments || []).map((environment) => ({
        ...environment,
        industry_type: environment.industry_type || environment.industry,
        workspace_template_key:
          environment.workspace_template_key ||
          resolveEnvironmentTemplateKey({
            workspaceTemplateKey: environment.workspace_template_key,
            industry: environment.industry,
            industryType: environment.industry_type,
          }),
      }));
      setEnvironments(nextEnvironments);

      const storedEnvId =
        typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const validStoredEnvId = nextEnvironments.some((environment) => environment.env_id === storedEnvId)
        ? storedEnvId
        : null;
      setSelectedEnvId(validStoredEnvId);

      if (typeof window !== "undefined") {
        if (validStoredEnvId) {
          window.localStorage.setItem(STORAGE_KEY, validStoredEnvId);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      setEnvironments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selectEnv = (envId: string) => {
    setSelectedEnvId(envId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, envId);
    }
  };

  const selectedEnv = useMemo(
    () => environments.find((environment) => environment.env_id === selectedEnvId) || null,
    [environments, selectedEnvId]
  );

  const value = useMemo(
    () => ({
      environments,
      selectedEnv,
      selectEnv,
      refresh,
      loading,
    }),
    [environments, selectedEnv, loading]
  );

  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useEnv(): EnvContextValue {
  const context = useContext(EnvContext);
  if (!context) {
    throw new Error("useEnv must be used within EnvProvider");
  }
  return context;
}
