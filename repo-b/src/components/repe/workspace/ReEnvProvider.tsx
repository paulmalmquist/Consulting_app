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
  getRepeContext,
  initRepeContext,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

type ReEnvironment = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  schema_name?: string;
  business_id?: string | null;
};

type ReEnvContextValue = {
  envId: string;
  environment: ReEnvironment | null;
  businessId: string | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  requestId: string | null;
  retry: () => Promise<void>;
};

const ReEnvContext = createContext<ReEnvContextValue | null>(null);

function parseRequestId(error: unknown): string | null {
  const req = (error as BosApiError | undefined)?.requestId;
  if (req) return req;
  const msg = error instanceof Error ? error.message : String(error || "");
  const match = msg.match(/req:\s*([a-zA-Z0-9_-]+)/i);
  return match?.[1] || null;
}

export function ReEnvProvider({ envId, children }: { envId: string; children: React.ReactNode }) {
  const { setBusinessId } = useBusinessContext();
  const [environment, setEnvironment] = useState<ReEnvironment | null>(null);
  const [businessId, setResolvedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const resolve = useCallback(
    async (forceInit = false) => {
      setLoading(true);
      setError(null);
      setRequestId(null);
      try {
        const envPromise = apiFetch<ReEnvironment>(`/v1/environments/${envId}`);
        const contextPromise = forceInit ? initRepeContext({ env_id: envId }) : getRepeContext(envId);

        const [env, repeCtx] = await Promise.all([envPromise, contextPromise]);
        setEnvironment(env);
        setResolvedBusinessId(repeCtx.business_id);
        setBusinessId(repeCtx.business_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve environment context.");
        setRequestId(parseRequestId(err));
      } finally {
        setLoading(false);
        setReady(true);
      }
    },
    [envId, setBusinessId]
  );

  useEffect(() => {
    void resolve(false);
  }, [resolve]);

  const retry = useCallback(async () => {
    await resolve(true);
  }, [resolve]);

  const value = useMemo<ReEnvContextValue>(
    () => ({
      envId,
      environment,
      businessId,
      loading,
      ready,
      error,
      requestId,
      retry,
    }),
    [envId, environment, businessId, loading, ready, error, requestId, retry]
  );

  return <ReEnvContext.Provider value={value}>{children}</ReEnvContext.Provider>;
}

export function useReEnv() {
  const ctx = useContext(ReEnvContext);
  if (!ctx) {
    throw new Error("useReEnv must be used within ReEnvProvider");
  }
  return ctx;
}

export function useMaybeReEnv() {
  return useContext(ReEnvContext);
}
