"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getRepeContext, initRepeContext, listBusinesses, type BusinessItem } from "@/lib/bos-api";
import { logInfo, logWarn } from "@/lib/logging/logger";
import { useBusinessContext } from "@/lib/business-context";

export type RepeEnvironment = {
  env_id: string;
  client_name: string;
  industry?: string;
  industry_type?: string;
  schema_name?: string;
  created_at?: string;
};

type UseRepeContextResult = {
  ready: boolean;
  loading: boolean;
  environmentId: string | null;
  environment: RepeEnvironment | null;
  businesses: BusinessItem[];
  businessId: string | null;
  showBusinessSwitcher: boolean;
  contextError: string | null;
  initializeWorkspace: () => Promise<void>;
  setBusinessForEnvironment: (nextBusinessId: string) => void;
};

const ENV_STORAGE_KEY = "demo_lab_env_id";
const ENV_BIZ_MAP_KEY = "bm_env_business_map";

function safeParseMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    // ignore malformed storage
  }
  return {};
}

async function fetchEnvironment(envId: string): Promise<RepeEnvironment | null> {
  try {
    const response = await fetch(`/api/v1/environments/${envId}`);
    if (!response.ok) return null;
    return (await response.json()) as RepeEnvironment;
  } catch {
    return null;
  }
}

function toUserFacingContextError(input: unknown): string {
  const raw = input instanceof Error ? input.message : String(input || "");
  const lowered = raw.toLowerCase();
  if (lowered.includes("schema not migrated") || (lowered.includes("missing") && lowered.includes("repe"))) {
    return "REPE schema not installed. Run migration 265/266 on this database.";
  }
  if (lowered.includes("no environment context")) {
    return "No environment selected. Choose an environment, then retry.";
  }
  return "Unable to initialize REPE workspace. Please retry.";
}

export function useRepeBasePath(): string {
  if (typeof window === "undefined") return "/app/repe";
  const match = window.location.pathname.match(/^\/lab\/env\/([^/]+)\/re/);
  return match ? `/lab/env/${match[1]}/re` : "/app/repe";
}

export function useRepeContext(envIdOverride?: string | null): UseRepeContextResult {
  const { businessId, setBusinessId } = useBusinessContext();
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<RepeEnvironment | null>(null);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const persistEnvBusiness = useCallback((envId: string, nextBusinessId: string) => {
    if (typeof window === "undefined") return;
    const current = safeParseMap(window.localStorage.getItem(ENV_BIZ_MAP_KEY));
    current[envId] = nextBusinessId;
    window.localStorage.setItem(ENV_BIZ_MAP_KEY, JSON.stringify(current));
  }, []);

  const setBusinessForEnvironment = useCallback(
    (nextBusinessId: string) => {
      if (!environmentId) return;
      setBusinessId(nextBusinessId);
      persistEnvBusiness(environmentId, nextBusinessId);
    },
    [environmentId, persistEnvBusiness, setBusinessId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const envId = envIdOverride || window.localStorage.getItem(ENV_STORAGE_KEY);
    setEnvironmentId(envId);
    if (envId) {
      window.localStorage.setItem(ENV_STORAGE_KEY, envId);
      document.cookie = `demo_lab_env_id=${envId}; Path=/; SameSite=Lax`;
    }
  }, [envIdOverride]);

  const initializeWorkspace = useCallback(async () => {
    if (!environmentId) {
      setContextError("No environment selected.");
      return;
    }
    setLoading(true);
    setContextError(null);
    try {
      const [env, context, businessRows] = await Promise.all([
        fetchEnvironment(environmentId),
        initRepeContext({ env_id: environmentId }),
        listBusinesses().catch(() => []),
      ]);
      setEnvironment(env);
      setBusinesses(businessRows);
      setBusinessForEnvironment(context.business_id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("bos_business_id", context.business_id);
      }
      if (context.created) {
        logWarn("repe.context.initialized", "Workspace initialized automatically", {
          env_id: context.env_id,
          business_id: context.business_id,
          source: context.source,
        });
      }
    } catch (err) {
      setContextError(toUserFacingContextError(err));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [environmentId, setBusinessForEnvironment]);

  useEffect(() => {
    let cancelled = false;
    if (!environmentId) {
      setLoading(false);
      setReady(true);
      return;
    }
    const envId = environmentId;

    async function resolve() {
      setLoading(true);
      setContextError(null);
      try {
        const [env, context, businessRows] = await Promise.all([
          fetchEnvironment(envId),
          getRepeContext(envId),
          listBusinesses().catch(() => []),
        ]);
        if (cancelled) return;

        setEnvironment(env);
        setBusinesses(businessRows);
        setBusinessForEnvironment(context.business_id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("bos_business_id", context.business_id);
        }
        if (context.created) {
          logInfo("repe.context.auto_created", "Auto-created REPE workspace business", {
            env_id: context.env_id,
            business_id: context.business_id,
            source: context.source,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = toUserFacingContextError(err);
        setContextError(msg);
        logWarn("repe.context.resolve_failed", "REPE context resolution failed", {
          env_id: envId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [environmentId, setBusinessForEnvironment]);

  const showBusinessSwitcher = useMemo(() => false, []);

  return {
    ready,
    loading,
    environmentId,
    environment,
    businesses,
    businessId,
    showBusinessSwitcher,
    contextError,
    initializeWorkspace,
    setBusinessForEnvironment,
  };
}
