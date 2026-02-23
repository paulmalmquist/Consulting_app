"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Button } from "@/components/ui/Button";
import { isRepeEnvironment, isFloyorkerEnvironment } from "@/components/lab/environments/constants";

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
};

type KPI = { label: string; value: string | number };

// ── Industry-aware KPI config ─────────────────────────────────────────

function getKpiConfig(industry: string): KPI[] {
  if (isRepeEnvironment(industry)) {
    return [
      { label: "AUM", value: "—" },
      { label: "NAV", value: "—" },
      { label: "Active Funds", value: "—" },
      { label: "IRR Snapshot", value: "—" },
      { label: "Compliance", value: "—" },
    ];
  }
  if (isFloyorkerEnvironment(industry)) {
    return [
      { label: "Total Rankings", value: "—" },
      { label: "Area Champions", value: "—" },
      { label: "Content Published", value: "—" },
      { label: "Traffic", value: "—" },
      { label: "Revenue", value: "—" },
    ];
  }
  return [
    { label: "Documents", value: "—" },
    { label: "Work Items", value: "—" },
    { label: "Pending Approvals", value: "—" },
    { label: "Approval Rate", value: "—" },
  ];
}

function getQuickActions(industry: string, envId: string): Array<{ label: string; href: string }> {
  if (isRepeEnvironment(industry)) {
    return [
      { label: "Create Fund", href: `/lab/env/${envId}/finance` },
      { label: "Start Underwriting", href: `/lab/env/${envId}/underwriting` },
      { label: "Run Waterfall", href: `/lab/env/${envId}/waterfall` },
    ];
  }
  if (isFloyorkerEnvironment(industry)) {
    return [
      { label: "Add Ranking", href: `/lab/env/${envId}/rankings` },
      { label: "Publish Content", href: `/lab/env/${envId}/content` },
      { label: "View Analytics", href: `/lab/env/${envId}/analytics` },
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
  const [flash, setFlash] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Find the environment from context
  const env = environments.find((e) => e.env_id === params.envId);
  const industry = env?.industry_type || env?.industry || "";
  const businessId = env?.business_id;

  // Select this env in the provider context
  useEffect(() => {
    selectEnv(params.envId);
  }, [params.envId, selectEnv]);

  // Read flash message
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

  // Load health, departments, audit
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

  const kpis = getKpiConfig(industry);
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="py-4">
                <p className="text-xs text-bm-muted2 uppercase tracking-[0.1em]">{kpi.label}</p>
                <p className="text-2xl font-semibold mt-1">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

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
