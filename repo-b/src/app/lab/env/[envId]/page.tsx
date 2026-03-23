"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Button } from "@/components/ui/Button";
import {
  isRepeEnvironment,
  isWebsiteEnvironment,
  isConsultingEnvironment,
  isPdsEnvironment,
  isCreditEnvironment,
  isLegalOpsEnvironment,
  isMedicalBackofficeEnvironment,
  isVisualResumeEnvironment,
  resolveEnvironmentOpenPath,
} from "@/components/lab/environments/constants";
import {
  listReV1Funds,
  getReV2FundQuarterState,
  getResumeCareerSummary,
  listResumeProjects,
  listResumeRoles,
  type ResumeCareerSummary,
  type ResumeProject,
  type ResumeRole,
  type ReV2FundQuarterState,
} from "@/lib/bos-api";

// ── Types ─────────────────────────────────────────────────────────────

type Department = {
  department_id: string;
  key: string;
  label: string;
  icon: string;
};

type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
};

type HealthStatus = {
  business_exists: boolean;
  modules_initialized: boolean;
  repe_status: string;
  data_integrity: boolean;
  content_count: number;
  ranking_count: number;
  analytics_count: number;
  crm_count: number;
};

type WebsiteAnalyticsSummary = {
  sessions_7d: number;
  sessions_30d: number;
  top_page_7d: string | null;
  new_content_30d: number;
  revenue_mtd: number;
  conversion_events_7d: number;
  ranking_changes_30d: number;
};

type ContentStats = {
  idea: number;
  draft: number;
  review: number;
  scheduled: number;
  published: number;
  total: number;
};

type KPI = {
  label: string;
  value: string | number;
  helper?: string;
};

type RepeRollupSummary = Pick<ReV2FundQuarterState, "portfolio_nav" | "tvpi" | "dpi"> & {
  weighted_ltv: null;
};

// ── Industry-aware KPI config ─────────────────────────────────────────

function fmtNav(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMultiple(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function buildRepeKpis(fundCount: number, summary: RepeRollupSummary | null): KPI[] {
  return [
    { label: "Active Funds", value: fundCount > 0 ? fundCount : "0" },
    { label: "Portfolio NAV", value: fmtNav(summary?.portfolio_nav) },
    { label: "TVPI", value: fmtMultiple(summary?.tvpi) },
    { label: "DPI", value: fmtMultiple(summary?.dpi) },
    { label: "Weighted LTV", value: summary?.weighted_ltv != null ? `${(Number(summary.weighted_ltv) * 100).toFixed(1)}%` : "—" },
  ];
}

function getStaticKpiConfig(industry: string): KPI[] {
  if (isRepeEnvironment(industry)) {
    return [
      { label: "Active Funds", value: "0", helper: "Create your first fund to populate this workspace." },
      { label: "Portfolio NAV", value: "$0", helper: "No portfolio positions have been loaded yet." },
      { label: "TVPI", value: "N/A", helper: "Performance multiples appear after fund and asset data is loaded." },
      { label: "DPI", value: "N/A", helper: "Distribution metrics will show once quarter data is available." },
      { label: "Weighted LTV", value: "N/A", helper: "No debt metrics available for this environment yet." },
    ];
  }
  if (isPdsEnvironment(industry)) {
    return [
      { label: "Approved Budget", value: "N/A", helper: "No budget baseline has been seeded yet." },
      { label: "Committed", value: "N/A", helper: "Commitments will appear after projects are initialized." },
      { label: "Spent", value: "N/A", helper: "Cost data has not been loaded for this environment yet." },
      { label: "EAC", value: "N/A", helper: "Forecasts appear after project financials are available." },
      { label: "Variance", value: "N/A", helper: "Variance analysis is waiting on a seeded budget and spend." },
      { label: "Top Risks", value: "N/A", helper: "Risk signals show up once projects and issues are created." },
    ];
  }
  if (isCreditEnvironment(industry)) {
    return [
      { label: "Active Cases", value: "0", helper: "No credit cases have been created yet." },
      { label: "Watchlist Cases", value: "0", helper: "Watchlist activity appears once cases are triaged." },
      { label: "Breaches", value: "0", helper: "No covenant or policy breaches are recorded yet." },
      { label: "Approved Amount", value: "$0", helper: "Approvals appear after the first decision is made." },
      { label: "Workout Exposure", value: "$0", helper: "Workout exposure will populate after distressed cases exist." },
    ];
  }
  if (isLegalOpsEnvironment(industry)) {
    return [
      { label: "Open Matters", value: "0", helper: "No legal matters have been seeded yet." },
      { label: "Deadlines (30d)", value: "0", helper: "Upcoming deadlines appear once matters and contracts exist." },
      { label: "Litigation Exposure", value: "$0", helper: "Exposure is empty until litigation records are loaded." },
      { label: "Legal Spend YTD", value: "$0", helper: "Spend tracking starts when invoice and matter data exists." },
    ];
  }
  if (isMedicalBackofficeEnvironment(industry)) {
    return [
      { label: "Properties", value: "0", helper: "No properties have been added to this environment yet." },
      { label: "Tenants", value: "0", helper: "Tenant counts appear after the first lease records are loaded." },
      { label: "A/R Outstanding", value: "$0", helper: "Receivables will populate once billing data is available." },
      { label: "Compliance Alerts", value: "0", helper: "Alerts appear after inspections and compliance checks run." },
      { label: "Work Orders Open", value: "0", helper: "No work orders have been created yet." },
    ];
  }
  return [
    { label: "Documents", value: "0", helper: "No documents yet — upload resume or portfolio." },
    { label: "Work Items", value: "0", helper: "No work items yet — create your first project." },
    { label: "Pending Approvals", value: "0", helper: "No approval queue is active for this environment yet." },
    { label: "Approval Rate", value: "No metrics available", helper: "Metrics will appear once this workspace has activity." },
  ];
}

function buildWebsiteKpis(summary: WebsiteAnalyticsSummary): KPI[] {
  return [
    { label: "Sessions (7d)", value: summary.sessions_7d.toLocaleString() },
    { label: "Sessions (30d)", value: summary.sessions_30d.toLocaleString() },
    { label: "Top Page", value: summary.top_page_7d ?? "—" },
    { label: "New Content (30d)", value: summary.new_content_30d },
    { label: "Revenue MTD", value: summary.revenue_mtd > 0 ? `$${summary.revenue_mtd.toLocaleString()}` : "—" },
    { label: "Conversions (7d)", value: summary.conversion_events_7d },
    { label: "Ranking Changes", value: summary.ranking_changes_30d },
  ];
}

function getConsultingKpis(): KPI[] {
  return [
    { label: "Weighted Pipeline", value: "N/A", helper: "No pipeline has been seeded for this consulting workspace yet." },
    { label: "Forecast (90d)", value: "N/A", helper: "Forecasting unlocks once opportunities and stages are loaded." },
    { label: "Revenue MTD", value: "$0", helper: "Revenue appears after work and invoice activity is tracked." },
    { label: "Close Rate (90d)", value: "N/A", helper: "Close rate requires at least one qualified opportunity." },
    { label: "Outreach (30d)", value: "0", helper: "No outreach activity has been logged yet." },
    { label: "Meetings (30d)", value: "0", helper: "Meeting counts show up after client activity is logged." },
  ];
}

function buildResumeKpis({
  summary,
  projects,
  roles,
}: {
  summary: ResumeCareerSummary | null;
  projects: ResumeProject[];
  roles: ResumeRole[];
}): KPI[] {
  return [
    {
      label: "Experience Summary",
      value: summary ? `${summary.total_years} yrs` : "No metrics yet",
      helper: summary
        ? `${summary.total_roles} roles across ${summary.total_companies} companies`
        : "Add roles to generate an experience summary.",
    },
    {
      label: "Projects / Experience",
      value: projects.length,
      helper:
        projects.length > 0
          ? `${roles.length} experience entries and case studies are indexed.`
          : "No projects yet — create your first project or experience entry.",
    },
    {
      label: "Resume / Portfolio",
      value: "Not uploaded",
      helper: "No documents yet — upload resume or portfolio.",
    },
    {
      label: "Skills",
      value: summary?.total_skills ?? 0,
      helper:
        summary?.total_skills
          ? "Skills inventory is available to the assistant."
          : "No skills inventory yet — seed or add skills to populate this view.",
    },
    {
      label: "Current Role",
      value: summary?.current_title || "Not set",
      helper: summary?.current_company || "Add a current role to personalize this environment.",
    },
  ];
}

function buildResumeActivity({
  summary,
  roles,
  projects,
}: {
  summary: ResumeCareerSummary | null;
  roles: ResumeRole[];
  projects: ResumeProject[];
}): AuditEvent[] {
  const items: AuditEvent[] = [];
  if (summary) {
    items.push({
      id: "resume-seeded",
      at: roles[roles.length - 1]?.created_at || new Date().toISOString(),
      actor: "system",
      action: `Resume workspace ready with ${summary.total_roles} roles and ${summary.total_projects} projects`,
      entity_type: "resume_workspace",
    });
  }
  if (projects[0]) {
    items.push({
      id: `resume-project-${projects[0].project_id}`,
      at: projects[0].created_at,
      actor: "system",
      action: `Project indexed: ${projects[0].name}`,
      entity_type: "resume_project",
    });
  }
  const currentRole = [...roles].reverse().find((role) => role.end_date === null) || roles[roles.length - 1];
  if (currentRole) {
    items.push({
      id: `resume-role-${currentRole.role_id}`,
      at: currentRole.created_at,
      actor: "system",
      action: `Current role surfaced: ${currentRole.title}`,
      entity_type: "resume_role",
    });
  }
  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
}

function getQuickActions(industry: string, envId: string): Array<{ label: string; href: string }> {
  if (isVisualResumeEnvironment(industry)) {
    return [
      { label: "Open Visual Resume", href: `/lab/env/${envId}/resume` },
      { label: "Resume / Portfolio", href: `/lab/env/${envId}/documents` },
      { label: "Upload Resume", href: "/lab/upload" },
      { label: "Review Projects", href: `/lab/env/${envId}/resume` },
    ];
  }
  if (isConsultingEnvironment(industry)) {
    return [
      { label: "Opportunity Engine", href: `/lab/env/${envId}/opportunity-engine` },
      { label: "Add Lead", href: `/lab/env/${envId}/consulting/outreach` },
      { label: "Log Outreach", href: `/lab/env/${envId}/consulting/outreach` },
      { label: "Create Proposal", href: `/lab/env/${envId}/consulting/proposals` },
      { label: "View Pipeline", href: `/lab/env/${envId}/consulting/pipeline` },
      { label: "Revenue Dashboard", href: `/lab/env/${envId}/consulting/revenue` },
    ];
  }
  if (isRepeEnvironment(industry)) {
    return [
      { label: "Opportunity Engine", href: `/lab/env/${envId}/opportunity-engine` },
      { label: "Create Fund", href: `/lab/env/${envId}/re/funds/new` },
      { label: "Start Underwriting", href: `/lab/env/${envId}/re/deals` },
      { label: "Run Waterfall", href: `/lab/env/${envId}/re/waterfalls` },
    ];
  }
  if (isPdsEnvironment(industry)) {
    return [
      { label: "Opportunity Engine", href: `/lab/env/${envId}/opportunity-engine` },
      { label: "Open Command Center", href: `/lab/env/${envId}/pds` },
      { label: "Create Project", href: `/lab/env/${envId}/pds` },
      { label: "Run Snapshot", href: `/lab/env/${envId}/pds` },
    ];
  }
  if (isCreditEnvironment(industry)) {
    return [
      { label: "Open Credit Hub", href: `/lab/env/${envId}/credit` },
      { label: "New Case", href: `/lab/env/${envId}/credit` },
      { label: "Watchlist", href: `/lab/env/${envId}/credit` },
    ];
  }
  if (isLegalOpsEnvironment(industry)) {
    return [
      { label: "Open Legal Ops", href: `/lab/env/${envId}/legal` },
      { label: "New Matter", href: `/lab/env/${envId}/legal` },
      { label: "Upcoming Deadlines", href: `/lab/env/${envId}/legal` },
    ];
  }
  if (isMedicalBackofficeEnvironment(industry)) {
    return [
      { label: "Open Backoffice", href: `/lab/env/${envId}/medical` },
      { label: "Add Property", href: `/lab/env/${envId}/medical` },
      { label: "Compliance Queue", href: `/lab/env/${envId}/medical` },
    ];
  }
  if (isWebsiteEnvironment(industry)) {
    return [
      { label: "Create Content", href: `/lab/env/${envId}/content` },
      { label: "Add Entity", href: `/lab/env/${envId}/rankings` },
      { label: "Update Ranking", href: `/lab/env/${envId}/rankings` },
      { label: "Log Revenue", href: `/lab/env/${envId}/analytics` },
      { label: "Create Task", href: `/lab/env/${envId}/projects` },
    ];
  }
  return [
    { label: "Upload Document", href: `/lab/upload` },
    { label: "Create Work Item", href: `/lab/pipeline` },
  ];
}

// ── Main Component ────────────────────────────────────────────────────

export default function EnvironmentHomePage({ params }: { params: { envId: string } }) {
  const { environments, selectEnv } = useEnv();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<WebsiteAnalyticsSummary | null>(null);
  const [contentStats, setContentStats] = useState<ContentStats | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [repeFundCount, setRepeFundCount] = useState<number>(0);
  const [repeSummary, setRepeSummary] = useState<RepeRollupSummary | null>(null);
  const [resumeSummary, setResumeSummary] = useState<ResumeCareerSummary | null>(null);
  const [resumeProjects, setResumeProjects] = useState<ResumeProject[]>([]);
  const [resumeRoles, setResumeRoles] = useState<ResumeRole[]>([]);

  const router = useRouter();
  const env = environments.find((e) => e.env_id === params.envId);
  const industry = env?.industry_type || env?.industry || "";
  const businessId = env?.business_id;
  const isWebsite = isWebsiteEnvironment(industry);
  const isResume = isVisualResumeEnvironment(industry);

  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

  // Auto-redirect domain-specific environments to their workspace
  useEffect(() => {
    if (!env) return;
    const workspacePath = resolveEnvironmentOpenPath({
      envId: params.envId,
      industry: env.industry,
      industryType: env.industry_type,
      workspaceTemplateKey: env.workspace_template_key,
    });
    if (workspacePath !== `/lab/env/${params.envId}`) {
      router.replace(workspacePath);
    }
  }, [env, params.envId, router]);

  useEffect(() => {
    const raw = sessionStorage.getItem("bm_env_flash");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { envId?: string; message?: string };
      if (parsed.envId === params.envId && parsed.message) {
        setFlash(parsed.message);
        sessionStorage.removeItem("bm_env_flash");
      }
    } catch {
      sessionStorage.removeItem("bm_env_flash");
    }
  }, [params.envId]);

  useEffect(() => {
    apiFetch<HealthStatus>(`/v1/env/${params.envId}/health`)
      .then(setHealth)
      .catch(() => null);

    apiFetch<{ items: AuditEvent[] }>(`/v1/audit?env_id=${params.envId}`)
      .then((r) => setAuditEvents(r.items.slice(0, 10)))
      .catch(() => null);
  }, [params.envId]);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<Department[]>(`/api/businesses/${businessId}/departments?env_id=${params.envId}`)
      .then(setDepartments)
      .catch(() => null);
  }, [businessId, params.envId]);

  useEffect(() => {
    if (!isResume) {
      setResumeSummary(null);
      setResumeProjects([]);
      setResumeRoles([]);
      return;
    }
    const bid = businessId || undefined;
    Promise.all([
      getResumeCareerSummary(params.envId, bid),
      listResumeProjects(params.envId, bid),
      listResumeRoles(params.envId, bid),
    ])
      .then(([summary, projects, roles]) => {
        setResumeSummary(summary);
        setResumeProjects(projects);
        setResumeRoles(roles);
      })
      .catch(() => {
        setResumeSummary(null);
        setResumeProjects([]);
        setResumeRoles([]);
      });
  }, [isResume, params.envId, businessId]);

  // Load website-specific analytics
  useEffect(() => {
    if (!isWebsite) return;
    apiFetch<WebsiteAnalyticsSummary>(`/api/website/analytics/summary?env_id=${params.envId}`)
      .then(setAnalyticsSummary)
      .catch(() => null);
    apiFetch<ContentStats>(`/api/website/content/stats?env_id=${params.envId}`)
      .then(setContentStats)
      .catch(() => null);
  }, [params.envId, isWebsite]);

  // Load REPE-specific metrics
  const isRepe = isRepeEnvironment(industry);
  useEffect(() => {
    if (!isRepe || (!businessId && !params.envId)) return;
    const quarter = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    })();
    listReV1Funds({
      env_id: params.envId,
      business_id: businessId || undefined,
    })
      .then(async (funds) => {
        setRepeFundCount(funds.length);
        if (funds.length === 0) {
          setRepeSummary(null);
          return;
        }
        const states = await Promise.all(
          funds.map(async (fund) => {
            try {
              return await getReV2FundQuarterState(fund.fund_id, quarter);
            } catch {
              return null;
            }
          })
        );
        const validStates = states.filter(
          (state): state is ReV2FundQuarterState => state !== null
        );
        if (validStates.length === 0) {
          setRepeSummary(null);
          return;
        }
        const weightedAverage = (key: "tvpi" | "dpi"): number | undefined => {
          let weightedSum = 0;
          let weightedDenominator = 0;
          let fallbackSum = 0;
          let fallbackCount = 0;
          validStates.forEach((state) => {
            const value = state[key];
            if (value == null) return;
            fallbackSum += value;
            fallbackCount += 1;
            const weight = Math.max(0, state.total_committed ?? 0);
            if (weight > 0) {
              weightedSum += value * weight;
              weightedDenominator += weight;
            }
          });
          if (weightedDenominator > 0) {
            return weightedSum / weightedDenominator;
          }
          if (fallbackCount > 0) {
            return fallbackSum / fallbackCount;
          }
          return undefined;
        };
        setRepeSummary({
          portfolio_nav: validStates.reduce(
            (sum, state) => sum + (state.portfolio_nav ?? 0),
            0
          ),
          tvpi: weightedAverage("tvpi"),
          dpi: weightedAverage("dpi"),
          weighted_ltv: null,
        });
      })
      .catch(() => {
        setRepeFundCount(0);
        setRepeSummary(null);
      });
  }, [isRepe, businessId, params.envId]);

  const isConsulting = isConsultingEnvironment(industry);

  const kpis: KPI[] =
    isResume
      ? buildResumeKpis({ summary: resumeSummary, projects: resumeProjects, roles: resumeRoles })
      : isConsulting
      ? getConsultingKpis()
      : isWebsite && analyticsSummary
      ? buildWebsiteKpis(analyticsSummary)
      : isRepe
      ? buildRepeKpis(repeFundCount, repeSummary)
      : getStaticKpiConfig(industry);

  const recentActivity = (() => {
    if (!isResume) return auditEvents;
    const combined = [...auditEvents, ...buildResumeActivity({ summary: resumeSummary, roles: resumeRoles, projects: resumeProjects })];
    const deduped = new Map<string, AuditEvent>();
    combined.forEach((event) => {
      if (!deduped.has(event.id)) deduped.set(event.id, event);
    });
    return [...deduped.values()]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6);
  })();

  const quickActions = [
    { label: "Executive Command Center", href: `/lab/env/${params.envId}/ecc` },
    ...getQuickActions(industry, params.envId).filter((action) => action.href !== `/lab/env/${params.envId}/ecc`),
  ];

  const retrySetup = async () => {
    setRetrying(true);
    try {
      await apiFetch(`/v1/environments/${params.envId}/reset`, { method: "POST" });
      const h = await apiFetch<HealthStatus>(`/v1/env/${params.envId}/health`);
      setHealth(h);
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Flash message */}
      {flash ? (
        <div className="rounded-lg border border-bm-success/35 bg-bm-success/10 px-4 py-3 text-sm text-bm-text">
          {flash}
        </div>
      ) : null}

      {/* Setup required banner */}
      {health && !health.data_integrity ? (
        <div className="rounded-lg border border-bm-warning/35 bg-bm-warning/10 px-4 py-3 text-sm text-bm-text flex items-center justify-between gap-4">
          <span>This environment is still initializing. Some features may not be available yet.</span>
          <Button size="sm" onClick={retrySetup} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry Setup"}
          </Button>
        </div>
      ) : null}

      {/* KPI row */}
      <div>
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{kpi.label}</p>
                <p className="text-2xl font-semibold mt-1 truncate">{kpi.value}</p>
                {kpi.helper ? (
                  <p className="mt-2 text-xs leading-relaxed text-bm-muted min-h-[2.5rem]">{kpi.helper}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Today panel — website environments only */}
      {isWebsite && contentStats ? (
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Today</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              href={`/lab/env/${params.envId}/content`}
              className="bm-glass-interactive rounded-xl p-4 border border-bm-warning/40 hover:border-bm-warning/70 transition-colors"
            >
              <p className="text-sm font-medium">{contentStats.review} awaiting review</p>
              <p className="text-xs text-bm-muted mt-1">Content pipeline</p>
            </Link>
            <Link
              href={`/lab/env/${params.envId}/rankings`}
              className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
            >
              <p className="text-sm font-medium">{analyticsSummary?.ranking_changes_30d ?? 0} recent ranking changes</p>
              <p className="text-xs text-bm-muted mt-1">Ranking audit log</p>
            </Link>
            {health && health.ranking_count === 0 ? (
              <Link
                href={`/lab/env/${params.envId}/rankings`}
                className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
              >
                <p className="text-sm font-medium">Set up rankings</p>
                <p className="text-xs text-bm-muted mt-1">No lists yet</p>
              </Link>
            ) : null}
            {health && health.analytics_count === 0 ? (
              <Link
                href={`/lab/env/${params.envId}/analytics`}
                className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
              >
                <p className="text-sm font-medium">Log first snapshot</p>
                <p className="text-xs text-bm-muted mt-1">Analytics</p>
              </Link>
            ) : null}
            <Link
              href={`/lab/env/${params.envId}/content`}
              className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
            >
              <p className="text-sm font-medium">{contentStats.published} published</p>
              <p className="text-xs text-bm-muted mt-1">{contentStats.draft} in draft</p>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Module tiles */}
      {departments.length > 0 ? (
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Modules</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {departments.map((dept) => (
              <Link
                key={dept.key}
                href={`/lab/env/${params.envId}/${dept.key}`}
                className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35 transition-colors"
              >
                <p className="font-medium text-sm">{dept.label}</p>
                <p className="text-xs text-bm-muted mt-1">Open workspace</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Recent Activity</h2>
          <Card>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-bm-muted py-4 text-center">
                  {isResume
                    ? "No recent activity yet. Resume roles, projects, and uploads will appear here as they are added."
                    : "No recent activity yet."}
                </p>
              ) : (
                <ul className="divide-y divide-bm-border/40">
                  {recentActivity.map((event) => (
                    <li key={event.id} className="py-2.5 text-sm">
                      <span className="font-medium text-bm-text">{event.action}</span>
                      <span className="text-bm-muted"> · {event.actor}</span>
                      <div className="text-xs text-bm-muted2 mt-0.5">
                        {new Date(event.at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Quick Actions</h2>
          <Card>
            <CardContent className="flex flex-col gap-2 py-4">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {action.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
