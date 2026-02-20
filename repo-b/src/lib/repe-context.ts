"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { logInfo, logWarn } from "@/lib/logging/logger";
import { applyTemplate, BusinessItem, createBusiness, listBusinesses } from "@/lib/bos-api";
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
  setBusinessForEnvironment: (nextBusinessId: string) => void;
};

const ENV_STORAGE_KEY = "demo_lab_env_id";
const ENV_BIZ_MAP_KEY = "bm_env_business_map";

function normalizeKey(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function isRepeIndustry(industry?: string | null): boolean {
  const key = normalizeKey(industry);
  return key.includes("real_estate") || key.includes("repe") || key.includes("real estate");
}

function safeParseMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore malformed storage
  }
  return {};
}

function toSlug(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return base || "repe-business";
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

export function useRepeContext(): UseRepeContextResult {
  const { businessId, setBusinessId } = useBusinessContext();
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<RepeEnvironment | null>(null);
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

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
    const envId = window.localStorage.getItem(ENV_STORAGE_KEY);
    setEnvironmentId(envId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!environmentId) {
      setLoading(false);
      setReady(true);
      return;
    }
    const resolvedEnvironmentId = environmentId;

    async function resolve() {
      setLoading(true);
      try {
        const [env, businessRows] = await Promise.all([fetchEnvironment(resolvedEnvironmentId), listBusinesses().catch(() => [])]);
        if (cancelled) return;

        setEnvironment(env);
        setBusinesses(businessRows);

        const envMap = typeof window !== "undefined"
          ? safeParseMap(window.localStorage.getItem(ENV_BIZ_MAP_KEY))
          : {};

        const mappedBusinessId = envMap[resolvedEnvironmentId];
        const mappedBusiness = mappedBusinessId
          ? businessRows.find((row) => row.business_id === mappedBusinessId)
          : null;

        const envSlugToken = resolvedEnvironmentId.slice(0, 8).toLowerCase();
        const envMatchedBusiness = businessRows.find((row) =>
          (row.slug || "").toLowerCase().includes(envSlugToken)
        );

        const nextBusinessId =
          mappedBusiness?.business_id ||
          envMatchedBusiness?.business_id ||
          (businessRows.length === 1 ? businessRows[0].business_id : businessRows[0]?.business_id || null);

        if (nextBusinessId) {
          setBusinessId(nextBusinessId);
          persistEnvBusiness(resolvedEnvironmentId, nextBusinessId);
          setReady(true);
          return;
        }

        if (env && isRepeIndustry(env.industry_type || env.industry)) {
          const seedName = `${env.client_name || "REPE"} REPE`;
          const created = await createBusiness(seedName, `${toSlug(seedName)}-${env.env_id.slice(0, 8)}`, "us");
          try {
            await applyTemplate(created.business_id, "finance", ["finance"], ["repe_waterfalls", "underwriting", "scenario_lab"]);
          } catch {
            // template may not exist in all environments; business creation is enough to unblock context
          }
          if (cancelled) return;
          setBusinessId(created.business_id);
          persistEnvBusiness(resolvedEnvironmentId, created.business_id);
          setBusinesses((prev) => [
            ...prev,
            {
              business_id: created.business_id,
              tenant_id: "",
              name: seedName,
              slug: created.slug,
              region: "us",
              created_at: new Date().toISOString(),
            },
          ]);
          logInfo("repe.business.seeded", "Seeded REPE business for environment", {
            env_id: resolvedEnvironmentId,
            business_id: created.business_id,
          });
        } else {
          logWarn("repe.business.missing", "No business could be resolved for current context", {
            env_id: resolvedEnvironmentId,
          });
        }
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [environmentId, persistEnvBusiness, setBusinessId]);

  const showBusinessSwitcher = useMemo(() => businesses.length > 1, [businesses.length]);

  return {
    ready,
    loading,
    environmentId,
    environment,
    businesses,
    businessId,
    showBusinessSwitcher,
    setBusinessForEnvironment,
  };
}
