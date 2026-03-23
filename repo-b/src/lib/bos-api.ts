export type BosFetchOptions = RequestInit & {
  params?: Record<string, string | undefined>;
};

function resolveBosConfig(): { origin: string; proxyPrefix: string } {
  const configuredRaw =
    process.env.NEXT_PUBLIC_BOS_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";

  if (typeof window === "undefined") {
    return {
      origin: configuredRaw.replace(/\/+$/, "") || "http://127.0.0.1:8000",
      proxyPrefix: "",
    };
  }

  const configured = configuredRaw.startsWith("/")
    ? window.location.origin
    : configuredRaw.replace(/\/+$/, "");
  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const looksLocalApi = configured.includes("localhost") || configured.includes("127.0.0.1");

  if (configured) {
    if (!isLocalHost && looksLocalApi) {
      return { origin: window.location.origin, proxyPrefix: "/bos" };
    }
    return { origin: configured, proxyPrefix: "" };
  }

  if (isLocalHost) {
    return { origin: "http://127.0.0.1:8000", proxyPrefix: "" };
  }

  return { origin: window.location.origin, proxyPrefix: "/bos" };
}

function appendParams(url: URL, params?: Record<string, string | undefined>) {
  if (!params) return;
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
}

async function parseJsonError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object") {
      const message =
        (payload as Record<string, unknown>).message ||
        (payload as Record<string, unknown>).detail;
      if (typeof message === "string") {
        return message;
      }
    }
  } catch {
    // ignored
  }
  return `Request failed (${response.status})`;
}

export async function bosFetch<T>(
  path: string,
  options: BosFetchOptions = {}
): Promise<T> {
  const config = resolveBosConfig();
  const effectivePath = config.proxyPrefix ? `${config.proxyPrefix}${path}` : path;
  const url = new URL(effectivePath, config.origin);
  appendParams(url, options.params);

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(url.toString(), {
    ...options,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response));
  }

  return response.json() as Promise<T>;
}

async function directFetch<T>(
  path: string,
  options: BosFetchOptions = {}
): Promise<T> {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
  const url = new URL(path, origin);
  appendParams(url, options.params);

  const response = await fetch(url.toString(), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseJsonError(response));
  }

  return response.json() as Promise<T>;
}

export interface RepeFund {
  fund_id: string;
  business_id: string;
  name: string;
  vintage_year: number;
  fund_type: "closed_end" | "open_end" | "sma" | "co_invest";
  strategy: "equity" | "debt";
  sub_strategy?: string | null;
  target_size?: string | null;
  term_years?: number | null;
  status: "fundraising" | "investing" | "harvesting" | "closed";
  base_currency: string;
  inception_date?: string | null;
  quarter_cadence: "monthly" | "quarterly" | "semi_annual" | "annual";
  target_sectors_json?: string[] | null;
  target_geographies_json?: string[] | null;
  target_leverage_min?: string | null;
  target_leverage_max?: string | null;
  target_hold_period_min_years?: number | null;
  target_hold_period_max_years?: number | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
}

export type ReV2FundQuarterState = {
  id: string;
  fund_id: string;
  quarter: string;
  scenario_id?: string;
  version_id?: string;
  run_id: string;
  portfolio_nav?: number;
  total_committed?: number;
  total_called?: number;
  total_distributed?: number;
  dpi?: number;
  rvpi?: number;
  tvpi?: number;
  gross_irr?: number;
  net_irr?: number;
  weighted_ltv?: number;
  weighted_dscr?: number;
  inputs_hash: string;
  created_at: string;
};

export type ResumeRole = {
  role_id: string;
  env_id: string;
  business_id: string;
  company: string;
  division: string | null;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  role_type: string;
  industry: string | null;
  summary: string | null;
  highlights: string[];
  technologies: string[];
  sort_order: number;
  created_at: string;
};

export type ResumeProject = {
  project_id: string;
  env_id: string;
  business_id: string;
  name: string;
  client: string | null;
  role_id: string | null;
  status: string;
  summary: string | null;
  impact: string | null;
  technologies: string[];
  metrics: Array<{ label: string; value: string }>;
  url: string | null;
  sort_order: number;
  created_at: string;
};

export type ResumeCareerSummary = {
  total_years: number;
  total_roles: number;
  total_companies: number;
  total_skills: number;
  total_projects: number;
  education: string;
  location: string;
  current_title: string;
  current_company: string;
};

export function listReV1Funds(params: {
  env_id?: string;
  business_id?: string;
}): Promise<RepeFund[]> {
  return directFetch("/api/re/v1/funds", {
    params: {
      env_id: params.env_id,
      business_id: params.business_id,
    },
  });
}

export function getReV2FundQuarterState(
  fundId: string,
  quarter: string,
  scenarioId?: string,
  versionId?: string
): Promise<ReV2FundQuarterState> {
  return directFetch(`/api/re/v2/funds/${fundId}/quarter-state/${quarter}`, {
    params: {
      scenario_id: scenarioId,
      version_id: versionId,
    },
  });
}

export function listResumeRoles(envId: string, businessId?: string): Promise<ResumeRole[]> {
  return bosFetch("/api/resume/v1/roles", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function listResumeProjects(envId: string, businessId?: string): Promise<ResumeProject[]> {
  return bosFetch("/api/resume/v1/projects", {
    params: { env_id: envId, business_id: businessId },
  });
}

export function getResumeCareerSummary(
  envId: string,
  businessId?: string
): Promise<ResumeCareerSummary> {
  return bosFetch("/api/resume/v1/career-summary", {
    params: { env_id: envId, business_id: businessId },
  });
}
