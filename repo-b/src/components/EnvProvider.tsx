"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

export type Environment = {
  env_id: string;
  client_name?: string;
  industry: string;
  schema_name?: string;
  is_active: boolean;
  created_at?: string;
  status?: string;
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
      setEnvironments(data.environments);
      const stored = localStorage.getItem(STORAGE_KEY);
      const fallbackId = data.environments[0]?.env_id || null;
      const nextId = data.environments.find((env) => env.env_id === stored)
        ? stored
        : fallbackId;
      setSelectedEnvId(nextId);
      if (nextId) {
        localStorage.setItem(STORAGE_KEY, nextId);
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
