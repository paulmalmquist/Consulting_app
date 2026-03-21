"use client";
import React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, HardHat } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";
import ThemeToggle from "@/components/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  tone?: "default" | "special";
};
type NavGroup = { domain: string; items: NavItem[] };

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navGroups(base: string): NavGroup[] {
  return [
    {
      domain: "Command",
      items: [
        { href: base, label: "Home", exact: true },
        { href: `${base}/ai-briefing`, label: "Exec Briefing" },
      ],
    },
    {
      domain: "Portfolio",
      items: [
        { href: `${base}/markets`, label: "Markets" },
        { href: `${base}/accounts`, label: "Accounts" },
        { href: `${base}/projects`, label: "Projects" },
        { href: `${base}/pipeline`, label: "Pipeline" },
      ],
    },
    {
      domain: "Financials",
      items: [
        { href: `${base}/revenue`, label: "Revenue & CI" },
        { href: `${base}/forecast`, label: "Forecast" },
        { href: `${base}/backlog`, label: "Backlog" },
        { href: `${base}/fee-variance`, label: "Fee Variance" },
      ],
    },
    {
      domain: "Delivery",
      items: [
        { href: `${base}/risk`, label: "Delivery Risk" },
        { href: `${base}/closeout`, label: "Closeout" },
        { href: `${base}/schedule`, label: "Schedule Health" },
        { href: `${base}/project-status`, label: "Project Status" },
      ],
    },
    {
      domain: "Resources",
      items: [
        { href: `${base}/resources`, label: "Resources" },
        { href: `${base}/timecards`, label: "Timecards" },
        { href: `${base}/utilization`, label: "Utilization" },
        { href: `${base}/capacity`, label: "Capacity Planning" },
      ],
    },
    {
      domain: "Client",
      items: [
        { href: `${base}/satisfaction`, label: "Client Satisfaction" },
        { href: `${base}/strategic-accounts`, label: "Strategic Accounts" },
        { href: `${base}/relationship-health`, label: "Relationship Health" },
      ],
    },
    {
      domain: "Operations",
      items: [
        { href: `${base}/adoption`, label: "Tech Adoption" },
        { href: `${base}/process-compliance`, label: "Process Compliance" },
        { href: `${base}/operational-signals`, label: "Operational Signals" },
      ],
    },
    {
      domain: "Governance",
      items: [
        { href: `${base}/reports`, label: "Reports" },
        { href: `${base}/documents`, label: "Documents" },
        { href: `${base}/audit`, label: "Audit" },
        { href: `${base}/configuration`, label: "Configuration" },
      ],
    },
    {
      domain: "Special Tools",
      items: [
        { href: `${base}/ai-query`, label: "Custom Query", tone: "special" },
      ],
    },
  ];
}

export default function PdsEnterpriseShell({
  envId,
  children,
  isAdmin = false,
}: {
  envId: string;
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();
  const base = `/lab/env/${envId}/pds`;
  const homeHref = isAdmin ? "/admin" : `/lab/env/${envId}`;
  const groups = navGroups(base);
  const envLabel = environment?.client_name || "Stone PDS";
  const templateKey =
    resolveWorkspaceTemplateKey({
      workspaceTemplateKey: environment?.workspace_template_key,
      industry: environment?.industry,
      industryType: environment?.industry_type,
    }) || "pds_enterprise";

  if (loading) {
    return <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">Resolving PDS enterprise workspace...</div>;
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6" data-testid="pds-context-error">
        <h2 className="text-lg font-semibold">Unable to load PDS enterprise workspace</h2>
        <p className="mt-2 text-sm text-pds-signalRed">{error}</p>
        {requestId ? <p className="mt-2 text-xs text-bm-muted2">Request ID: {requestId}</p> : null}
        <button
          type="button"
          onClick={() => void retry()}
          className="mt-4 rounded-full border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[30px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-gold)/0.10),transparent_42%)] bg-bm-surface/[0.92] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-pds-gold/20 bg-pds-gold/10 p-2 text-pds-goldSoft">
                <HardHat size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">{envLabel}</h1>
                  <span className="inline-flex items-center rounded-full border border-pds-gold/20 px-2.5 py-1 text-xs text-pds-goldText">
                    PDS Enterprise OS
                  </span>
                </div>
                <p className="text-sm text-bm-muted2">Fee revenue, forecast, staffing, client health, and closeout on one operating surface.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-bm-muted2">
              <span className="inline-flex items-center gap-1">
                <Building2 size={12} />
                Environment {environment?.schema_name || envId}
              </span>
              {businessId ? <span>Business {businessId.slice(0, 8)}</span> : null}
              <span>Template {templateKey}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href={homeHref} className="rounded-full border border-bm-border/70 px-4 py-2 text-sm hover:bg-bm-surface/40">
              Home
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[250px,1fr]">
        <aside className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-3" data-testid="pds-sidebar">
          <nav className="max-h-[calc(100vh-200px)] space-y-0.5 overflow-y-auto scrollbar-hide">
            {groups.map((group) => (
              <div key={group.domain} className="mb-3">
                <p className="mb-1.5 px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2/70">
                  {group.domain}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href, item.exact);
                    const inactiveClass =
                      item.tone === "special"
                        ? "border-pds-gold/15 bg-pds-gold/5 text-pds-goldText hover:bg-pds-gold/10 hover:text-pds-goldSoft"
                        : "border-transparent hover:bg-pds-gold/5 hover:text-pds-goldSoft";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-xl border px-3 py-2 pl-5 text-[13px] transition ${
                          active
                            ? "border-pds-gold/50 bg-pds-gold/10 text-pds-goldText"
                            : inactiveClass
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
