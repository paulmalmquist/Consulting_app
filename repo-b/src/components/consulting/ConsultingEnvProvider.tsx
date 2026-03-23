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
import { useBusinessContext } from "@/lib/business-context";

type ConsultingEnvironment = {
  env_id: string;
  client_name: string;
  industry: string;
  industry_type?: string;
  schema_name?: string;
  business_id: string;
  is_active?: boolean;
  notes?: string | null;
};

type ConsultingEnvContextValue = {
  envId: string;
  environment: ConsultingEnvironment | null;
  businessId: string | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  retry: () => Promise<void>;
};

const ConsultingEnvContext = createContext<ConsultingEnvContextValue | null>(null);

const CONTEXT_TIMEOUT_MS = 10_000;
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("CONTEXT_TIMEOUT: Environment resolution timed out.")),
        CONTEXT_TIMEOUT_MS,
      ),
    ),
  ]);
}

function humanizeError(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to resolve consulting environment.";
  const msg = err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  if (msg.includes("CONTEXT_TIMEOUT")) {
    return "Environment resolution timed out. Please retry.";
  }
  if (
    msg.includes("Network error") ||
    msg === "Failed to fetch" ||
    msg.includes("NetworkError")
  ) {
    return "API unreachable. Backend service is not available.";
  }
  if (msg.includes("Environment not found")) {
    return "Environment not found.";
  }
  if (msg.includes("not bound to a business")) {
    return "Environment not bound to a business.";
  }
  return msg || "Failed to resolve environment.";
}

export function ConsultingEnvProvider({
  envId,
  children,
}: {
  envId: string;
  children: React.ReactNode;
}) {
  const { setBusinessId } = useBusinessContext();
  const [environment, setEnvironment] = useState<ConsultingEnvironment | null>(null);
  const [businessId, setResolvedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      const env = await withTimeout(
        apiFetch<ConsultingEnvironment>(`/api/lab/env-context/${envId}`),
      );
      setEnvironment(env);
      setResolvedBusinessId(env.business_id);
      setBusinessId(env.business_id);
      setReady(true);
    } catch (err) {
      setEnvironment(null);
      setResolvedBusinessId(null);
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  }, [envId, setBusinessId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const retry = useCallback(async () => {
    await resolve();
  }, [resolve]);

  const value = useMemo<ConsultingEnvContextValue>(
    () => ({
      envId,
      environment,
      businessId,
      loading,
      ready,
      error,
      retry,
    }),
    [envId, environment, businessId, loading, ready, error, retry],
  );

  return (
    <ConsultingEnvContext.Provider value={value}>
      {children}
    </ConsultingEnvContext.Provider>
  );
}

export function useConsultingEnv() {
  const ctx = useContext(ConsultingEnvContext);
  if (!ctx) {
    throw new Error("useConsultingEnv must be used within ConsultingEnvProvider");
  }
  return ctx;
}
