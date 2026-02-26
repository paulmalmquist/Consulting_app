"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  business_id?: string | null;
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
  const msg = err.message;
  if (msg.includes("CONTEXT_TIMEOUT")) {
    return "Environment resolution timed out. Please retry.";
  }
  if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
    return "Cannot reach the API. Please check that the backend is running.";
  }
  return msg.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "") || "Failed to resolve environment.";
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
  const hasRetried = useRef(false);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await withTimeout(
        apiFetch<ConsultingEnvironment>(`/v1/environments/${envId}`),
      );
      setEnvironment(env);
      const bid = env.business_id || null;
      setResolvedBusinessId(bid);
      if (bid) setBusinessId(bid);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [envId, setBusinessId]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const retry = useCallback(async () => {
    hasRetried.current = false;
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
