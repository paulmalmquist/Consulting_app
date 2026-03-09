"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";

export type Environment = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  workspace_template_key?: string | null;
  schema_name: string;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  business_id?: string | null;
  repe_initialized?: boolean;
};

type EnvContextValue = {
  environments: Environment[];
  selectedEnv: Environment | null;
  selectEnv: (envId: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const EnvContext = createContext<EnvContextValue | undefined>(undefined);

const STORAGE_KEY = "demo_lab_env_id";

export function EnvProvider({ children }: { children: React.ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ environments: Environment[] }>(
        "/v1/environments"
      );
      const normalized = (data.environments || []).map((env) => ({
        ...env,
        industry_type: env.industry_type || env.industry,
        workspace_template_key:
          env.workspace_template_key ||
          resolveWorkspaceTemplateKey({
            workspaceTemplateKey: env.workspace_template_key,
            industry: env.industry,
            industryType: env.industry_type,
          }),
      }));
      setEnvironments(normalized);
      const stored = localStorage.getItem(STORAGE_KEY);
      const nextId = normalized.find((env) => env.env_id === stored)
        ? stored
        : null;
      setSelectedEnvId(nextId);
      if (nextId) {
        localStorage.setItem(STORAGE_KEY, nextId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      setEnvironments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectEnv = (envId: string) => {
    setSelectedEnvId(envId);
    localStorage.setItem(STORAGE_KEY, envId);
  };

  const selectedEnv = useMemo(
    () => environments.find((env) => env.env_id === selectedEnvId) || null,
    [environments, selectedEnvId]
  );

  const value = useMemo(
    () => ({ environments, selectedEnv, selectEnv, refresh, loading }),
    [environments, selectedEnv, loading]
  );

  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useEnv() {
  const context = useContext(EnvContext);
  if (!context) {
    throw new Error("useEnv must be used within EnvProvider");
  }
  return context;
}
