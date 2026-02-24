"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Button } from "@/components/ui/Button";
import {
  isRepeEnvironment,
  isWebsiteEnvironment,
} from "@/components/lab/environments/constants";
import { listReV1Funds, getReFundSummary, ReFundSummary } from "@/lib/bos-api";

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

type KPI = { label: string; value: string | number };

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

function buildRepeKpis(fundCount: number, summary: ReFundSummary | null): KPI[] {
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
      { label: "Active Funds", value: "0" },
      { label: "Portfolio NAV", value: "—" },
      { label: "TVPI", value: "—" },
      { label: "DPI", value: "—" },
      { label: "Weighted LTV", value: "—" },
    ];
  }
  return [
    { label: "Documents", value: "—" },
    { label: "Work Items", value: "—" },
    { label: "Pending Approvals", value: "—" },
    { label: "Approval Rate", value: "—" },
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

function getQuickActions(industry: string, envId: string): Array<{ label: string; href: string }> {
  if (isRepeEnvironment(industry)) {
    return [
      { label: "Create Fund", href: `/lab/env/${envId}/re/funds/new` },
      { label: "Start Underwriting", href: `/lab/env/${envId}/re/deals` },
      { label: "Run Waterfall", href: `/lab/env/${envId}/re/waterfalls` },
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
  const [repeSummary, setRepeSummary] = useState<ReFundSummary | null>(null);

  const env = environments.find((e) => e.env_id === params.envId);
  const industry = env?.industry_type || env?.industry || "";
  const businessId = env?.business_id;
  const isWebsite = isWebsiteEnvironment(industry);

  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

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
        if (funds.length > 0) {
          const s = await getReFundSummary(funds[0].fund_id, quarter).catch(() => null);
          setRepeSummary(s);
        }
      })
      .catch(() => null);
  }, [isRepe, businessId, params.envId]);

  const kpis: KPI[] =
    isWebsite && analyticsSummary
      ? buildWebsiteKpis(analyticsSummary)
      : isRepe
      ? buildRepeKpis(repeFundCount, repeSummary)
      : getStaticKpiConfig(industry);

  const quickActions = getQuickActions(industry, params.envId);

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
              {auditEvents.length === 0 ? (
                <p className="text-sm text-bm-muted py-4 text-center">No recent activity.</p>
              ) : (
                <ul className="divide-y divide-bm-border/40">
                  {auditEvents.map((event) => (
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
