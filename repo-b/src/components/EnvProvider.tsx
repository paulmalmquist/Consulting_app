"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";

export type Environment = {
  env_id: string;
  slug?: string | null;
  client_name: string;
  industry: string;
  industry_type?: string;
  workspace_template_key?: string | null;
  schema_name: string;
  auth_mode?: string | null;
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
      const auth = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      }).then((response) => response.json()) as {
        authenticated?: boolean;
        session?: {
          platformAdmin?: boolean;
          activeEnvironment?: {
            env_id: string;
            env_slug?: string | null;
          } | null;
          memberships?: Array<{
            env_id: string;
            env_slug?: string | null;
            client_name: string;
            auth_mode?: string | null;
            business_id?: string | null;
            industry?: string | null;
            industry_type?: string | null;
            workspace_template_key?: string | null;
          }>;
        } | null;
      };

      let normalized: Environment[] = [];
      if (auth.authenticated && auth.session?.platformAdmin) {
        const data = await apiFetch<{ environments: Environment[] }>("/v1/environments");
        normalized = (data.environments || []).map((env) => ({
          ...env,
          slug: env.slug || null,
          auth_mode: env.auth_mode || "private",
          industry_type: env.industry_type || env.industry,
          workspace_template_key:
            env.workspace_template_key ||
            resolveWorkspaceTemplateKey({
              workspaceTemplateKey: env.workspace_template_key,
              industry: env.industry,
              industryType: env.industry_type,
            }),
        }));
      } else if (auth.authenticated && auth.session?.memberships) {
        normalized = auth.session.memberships.map((membership) => ({
          env_id: membership.env_id,
          slug: membership.env_slug || null,
          client_name: membership.client_name,
          industry: membership.industry || "general",
          industry_type: membership.industry_type || membership.industry || "general",
          workspace_template_key:
            membership.workspace_template_key ||
            resolveWorkspaceTemplateKey({
              workspaceTemplateKey: membership.workspace_template_key,
              industry: membership.industry,
              industryType: membership.industry_type,
            }),
          schema_name: `env_${membership.env_id.replace(/-/g, "_")}`,
          auth_mode: membership.auth_mode || "private",
          is_active: true,
          business_id: membership.business_id || null,
          repe_initialized: false,
        }));
      }

      setEnvironments(normalized);
      const stored = localStorage.getItem(STORAGE_KEY);
      const sessionEnvId = auth.session?.activeEnvironment?.env_id || null;
      const nextId = normalized.find((env) => env.env_id === stored)
        ? stored
        : normalized.find((env) => env.env_id === sessionEnvId)
          ? sessionEnvId
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
