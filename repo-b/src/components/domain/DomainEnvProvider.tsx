"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "@/lib/api";
import {
  BosApiError,
  DomainContext,
  getCreditContext,
  getLegalOpsContext,
  getMedOfficeContext,
  getPdsContext,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export type DomainSlug = "pds" | "credit" | "legal" | "medical";

type DomainEnvironment = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  schema_name?: string;
  business_id?: string | null;
};

type DomainEnvContextValue = {
  domain: DomainSlug;
  envId: string;
  environment: DomainEnvironment | null;
  businessId: string | null;
  loading: boolean;
  error: string | null;
  requestId: string | null;
  retry: () => Promise<void>;
};

const DomainEnvContext = createContext<DomainEnvContextValue | null>(null);

function parseRequestId(error: unknown): string | null {
  const req = (error as BosApiError | undefined)?.requestId;
  if (req) return req;
  const msg = error instanceof Error ? error.message : String(error || "");
  const match = msg.match(/req:\s*([a-zA-Z0-9_-]+)/i);
  return match?.[1] || null;
}

async function resolveDomainContext(domain: DomainSlug, envId: string): Promise<DomainContext> {
  if (domain === "pds") return getPdsContext(envId);
  if (domain === "credit") return getCreditContext(envId);
  if (domain === "legal") return getLegalOpsContext(envId);
  return getMedOfficeContext(envId);
}

export function DomainEnvProvider({
  domain,
  envId,
  children,
}: {
  domain: DomainSlug;
  envId: string;
  children: React.ReactNode;
}) {
  const { setBusinessId } = useBusinessContext();
  const [environment, setEnvironment] = useState<DomainEnvironment | null>(null);
  const [businessId, setResolvedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRequestId(null);
    try {
      const [env, context] = await Promise.all([
        apiFetch<DomainEnvironment>(`/v1/environments/${envId}`),
        resolveDomainContext(domain, envId),
      ]);
      setEnvironment(env);
      setResolvedBusinessId(context.business_id);
      setBusinessId(context.business_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve environment context.");
      setRequestId(parseRequestId(err));
    } finally {
      setLoading(false);
    }
  }, [domain, envId, setBusinessId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const retry = useCallback(async () => {
    await resolve();
  }, [resolve]);

  const value = useMemo<DomainEnvContextValue>(
    () => ({
      domain,
      envId,
      environment,
      businessId,
      loading,
      error,
      requestId,
      retry,
    }),
    [domain, envId, environment, businessId, loading, error, requestId, retry]
  );

  return <DomainEnvContext.Provider value={value}>{children}</DomainEnvContext.Provider>;
}

export function useDomainEnv() {
  const ctx = useContext(DomainEnvContext);
  if (!ctx) throw new Error("useDomainEnv must be used within DomainEnvProvider");
  return ctx;
}
