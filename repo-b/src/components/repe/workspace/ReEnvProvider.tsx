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
import {
  BosApiError,
  getReV1Context,
  bootstrapReV1Context,
  ReV1Context,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";
import { publishAssistantEnvironmentContext } from "@/lib/commandbar/appContextBridge";

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
  errorCode: string | null;
  requestId: string | null;
  isBootstrapped: boolean;
  fundsCount: number;
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

/** Extract structured error_code from backend error detail if present. */
function parseErrorCode(error: unknown): string | null {
  const detail = (error as BosApiError | undefined)?.detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (typeof d.error_code === "string") return d.error_code;
    if (typeof d.detail === "object" && d.detail) {
      const inner = d.detail as Record<string, unknown>;
      if (typeof inner.error_code === "string") return inner.error_code;
    }
  }
  return null;
}

/** Convert raw error into a user-friendly message. */
function humanizeError(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to resolve environment context.";

  const msg = err.message;

  // Timeout — must never result in a silent spinner
  if (msg.includes("CONTEXT_TIMEOUT")) {
    return "Context resolution timed out after 10 seconds. The backend may be overloaded or unreachable. Please retry.";
  }

  // Network-level failures (CORS, offline, proxy unreachable)
  if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("UPSTREAM_UNREACHABLE")) {
    return "Cannot reach the Real Estate API. Please check that the backend is running and try again.";
  }

  // Schema not migrated
  if (msg.includes("not migrated") || msg.includes("migration")) {
    return "Real Estate database tables are not yet provisioned. Contact your administrator.";
  }

  // Strip request ID suffix for cleaner display
  const cleaned = msg.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "");
  return cleaned || "Failed to resolve environment context.";
}

/**
 * Race a promise against a 10-second hard timeout.
 * Guarantees the loader never hangs indefinitely regardless of network state.
 */
const CONTEXT_TIMEOUT_MS = 10_000;
function withContextTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "CONTEXT_TIMEOUT: Context resolution timed out. The backend did not respond within 10 seconds."
            )
          ),
        CONTEXT_TIMEOUT_MS
      )
    ),
  ]);
}

export function ReEnvProvider({ envId, children }: { envId: string; children: React.ReactNode }) {
  const { setBusinessId } = useBusinessContext();
  const [environment, setEnvironment] = useState<ReEnvironment | null>(null);
  const [businessId, setResolvedBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [fundsCount, setFundsCount] = useState(0);
  const hasAutoRetried = useRef(false);

  const applyContext = useCallback(
    (env: ReEnvironment, ctx: ReV1Context) => {
      setEnvironment(env);
      setResolvedBusinessId(ctx.business_id);
      setBusinessId(ctx.business_id);
      setIsBootstrapped(ctx.is_bootstrapped);
      setFundsCount(ctx.funds_count);
    },
    [setBusinessId]
  );

  const resolve = useCallback(
    async (forceBootstrap = false) => {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      setRequestId(null);
      try {
        const envPromise = apiFetch<ReEnvironment>(`/v1/environments/${envId}`);
        const contextPromise = forceBootstrap
          ? bootstrapReV1Context(envId)
          : getReV1Context(envId);

        const [env, reCtx] = await withContextTimeout(Promise.all([envPromise, contextPromise]));
        applyContext(env, reCtx);
      } catch (err) {
        // Do not auto-retry on timeout — surface the error immediately
        const isTimeout = err instanceof Error && err.message.includes("CONTEXT_TIMEOUT");

        // On first load failure (non-timeout), auto-retry with bootstrap to trigger auto-create
        if (!isTimeout && !forceBootstrap && !hasAutoRetried.current) {
          hasAutoRetried.current = true;
          try {
            const [env, reCtx] = await withContextTimeout(
              Promise.all([
                apiFetch<ReEnvironment>(`/v1/environments/${envId}`),
                bootstrapReV1Context(envId),
              ])
            );
            applyContext(env, reCtx);
            return; // Success on auto-retry
          } catch (retryErr) {
            // Fall through to error display
            err = retryErr;
          }
        }

        setError(humanizeError(err));
        setErrorCode(parseErrorCode(err));
        setRequestId(parseRequestId(err));
      } finally {
        setLoading(false);
        setReady(true);
      }
    },
    [envId, applyContext]
  );

  useEffect(() => {
    void resolve(false);
  }, [resolve]);

  useEffect(() => {
    publishAssistantEnvironmentContext({
      active_environment_id: envId,
      active_environment_name: environment?.client_name || null,
      active_business_id: businessId,
      active_business_name: null,
      schema_name: environment?.schema_name || null,
      industry: environment?.industry || environment?.industry_type || null,
    });
  }, [
    envId,
    businessId,
    environment?.client_name,
    environment?.industry,
    environment?.industry_type,
    environment?.schema_name,
  ]);

  const retry = useCallback(async () => {
    hasAutoRetried.current = false;
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
      errorCode,
      requestId,
      isBootstrapped,
      fundsCount,
      retry,
    }),
    [envId, environment, businessId, loading, ready, error, errorCode, requestId, isBootstrapped, fundsCount, retry]
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
