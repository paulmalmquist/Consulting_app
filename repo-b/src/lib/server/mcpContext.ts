import type { ContextSnapshot } from "@/lib/commandbar/types";
import { listRecentRuns } from "@/lib/server/commandOrchestratorStore";

function normalizeBaseUrl(input: string) {
  return input.replace(/\/+$/, "");
}

function resolveBosBaseUrl(origin: string) {
  const configured = (process.env.BOS_API_ORIGIN || "").trim();
  if (configured) return normalizeBaseUrl(configured);
  return normalizeBaseUrl(origin);
}

function resolveLabBaseUrl(origin: string) {
  const configured = (process.env.BOS_API_ORIGIN || "").trim();
  if (configured && !configured.startsWith("/")) {
    return normalizeBaseUrl(configured);
  }
  return normalizeBaseUrl(origin);
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(baseOrigin: string, path: string) {
  const url = new URL(path, baseOrigin).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const payload = await safeJson(res);
    const detail =
      (payload && (payload.message || payload.detail || payload.error)) || `HTTP ${res.status}`;
    throw new Error(String(detail));
  }
  return safeJson(res);
}

type EnvironmentRow = {
  env_id: string;
  client_name: string;
  industry?: string;
  industry_type?: string;
};

function routeEnvId(route: string | null): string | null {
  if (!route) return null;
  const m = route.match(/^\/lab\/env\/([^/]+)/);
  return m?.[1] || null;
}

export async function buildContextSnapshot(params: {
  origin: string;
  route?: string | null;
  currentEnvId?: string | null;
  businessId?: string | null;
}): Promise<ContextSnapshot> {
  const route = params.route || null;
  const labBase = resolveLabBaseUrl(params.origin);
  const bosBase = resolveBosBaseUrl(params.origin);

  let environments: EnvironmentRow[] = [];
  try {
    const envPayload = await requestJson(labBase, "/api/v1/environments");
    environments = Array.isArray(envPayload?.environments) ? envPayload.environments : [];
  } catch {
    environments = [];
  }

  const envId = params.currentEnvId || routeEnvId(route);
  const selectedEnv = environments.find((env) => env.env_id === envId) || null;

  let business: ContextSnapshot["business"] = null;
  const businessId = String(params.businessId || "").trim();
  if (businessId) {
    try {
      const payload = await requestJson(bosBase, `/api/businesses/${encodeURIComponent(businessId)}`);
      if (payload?.business_id) {
        business = {
          business_id: String(payload.business_id),
          name: payload.name || undefined,
          slug: payload.slug || undefined,
        };
      }
    } catch {
      business = null;
    }
  }

  const modulesAvailable: string[] = ["environments"];
  try {
    const tasksProbe = await fetch(new URL("/api/tasks/projects", params.origin), { cache: "no-store" });
    if (tasksProbe.ok) modulesAvailable.push("tasks");
  } catch {
    // ignore
  }
  try {
    const bosProbe = await fetch(new URL("/api/templates", bosBase), { cache: "no-store" });
    if (bosProbe.ok) modulesAvailable.push("business");
  } catch {
    // ignore
  }

  return {
    route,
    environments,
    selectedEnv,
    business,
    modulesAvailable,
    recentRuns: listRecentRuns(),
  };
}

