"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Menu, X } from "lucide-react";
import { DomainSlug, useDomainEnv } from "@/components/domain/DomainEnvProvider";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavItem = { href: string; label: string };

const DOMAIN_LABELS: Record<DomainSlug, string> = {
  pds: "PDS Command",
  credit: "Credit Risk Hub",
  legal: "Legal Ops Command",
  medical: "Medical Office Backoffice",
  discovery: "Execution Discovery Lab",
  "data-studio": "Data Ingestion & Mapping Studio",
  "workflow-intel": "Workflow Intelligence Engine",
  "vendor-intel": "Vendor Intelligence Engine",
  "metric-dict": "Metric Dictionary Engine",
  "data-chaos": "Data Chaos Detector",
  blueprint: "Execution Blueprint Studio",
  pilot: "Pilot Builder",
  impact: "Economic Impact Estimator",
  "case-factory": "Case Study Factory",
  copilot: "AI Discovery Copilot",
  outputs: "Engagement Output Center",
  "pattern-intel": "Execution Pattern Intelligence",
  "opportunity-engine": "Opportunity Engine",
  resume: "Visual Resume",
};

function navItems(domain: DomainSlug, base: string): NavItem[] {
  if (domain === "pds") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/executive`, label: "Executive" },
      { href: `${base}/projects`, label: "Projects" },
      { href: `${base}/subcontractors`, label: "Subcontractors" },
      { href: `${base}/schedule`, label: "Schedule" },
      { href: `${base}/financials`, label: "Financials" },
      { href: `${base}/reports`, label: "Reports" },
    ];
  }
  if (domain === "credit") {
    return [
      { href: base, label: "Home" },
      { href: `${base}/cases`, label: "Cases" },
      { href: `${base}/doc-completion`, label: "Doc Completion" },
    ];
  }
  if (domain === "legal") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/matters`, label: "Matters" },
      { href: `${base}/contracts`, label: "Contracts" },
      { href: `${base}/outside-counsel`, label: "Outside Counsel" },
      { href: `${base}/spend`, label: "Legal Spend" },
      { href: `${base}/compliance`, label: "Compliance" },
      { href: `${base}/governance`, label: "Governance" },
      { href: `${base}/litigation`, label: "Litigation" },
      { href: `${base}/documents`, label: "Documents" },
      { href: `${base}/knowledge-base`, label: "Knowledge Base" },
      { href: `${base}/reports`, label: "Reports" },
      { href: `${base}/ai-briefing`, label: "AI Briefing" },
    ];
  }
  if (domain === "discovery") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/accounts`, label: "Accounts" },
      { href: `${base}/systems`, label: "Systems" },
      { href: `${base}/vendors`, label: "Vendors" },
      { href: `${base}/sessions`, label: "Sessions" },
      { href: `${base}/pain-points`, label: "Pain Points" },
    ];
  }
  if (domain === "data-studio") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/intake`, label: "Data Intake" },
      { href: `${base}/schema`, label: "Schema Viewer" },
      { href: `${base}/entities`, label: "Canonical Model" },
      { href: `${base}/mappings`, label: "Field Mappings" },
      { href: `${base}/lineage`, label: "Data Lineage" },
    ];
  }
  if (domain === "workflow-intel") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/workflows`, label: "Workflows" },
      { href: `${base}/steps`, label: "Steps & Handoffs" },
      { href: `${base}/bottlenecks`, label: "Bottlenecks" },
      { href: `${base}/automation`, label: "Automation Opps" },
      { href: `${base}/metrics`, label: "Metrics" },
    ];
  }
  if (domain === "vendor-intel") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/catalog`, label: "Vendor Catalog" },
      { href: `${base}/capabilities`, label: "Capabilities" },
      { href: `${base}/cost-analysis`, label: "Cost Analysis" },
      { href: `${base}/lock-in`, label: "Lock-In Risk" },
      { href: `${base}/replacement-map`, label: "Replacement Map" },
    ];
  }
  if (domain === "metric-dict") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/metrics`, label: "Metrics" },
      { href: `${base}/definitions`, label: "Definitions" },
      { href: `${base}/conflicts`, label: "Conflicts" },
      { href: `${base}/sources`, label: "Sources" },
      { href: `${base}/reports`, label: "Reports" },
    ];
  }
  if (domain === "data-chaos") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/anomalies`, label: "Anomalies" },
      { href: `${base}/duplicates`, label: "Duplicates" },
      { href: `${base}/conflicts`, label: "Conflicts" },
      { href: `${base}/drift`, label: "Drift" },
      { href: `${base}/reliability`, label: "Reliability Score" },
    ];
  }
  if (domain === "blueprint") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/architectures`, label: "Architectures" },
      { href: `${base}/modules`, label: "Modules" },
      { href: `${base}/replacements`, label: "Replacements" },
      { href: `${base}/phases`, label: "Phases" },
      { href: `${base}/governance`, label: "Governance" },
    ];
  }
  if (domain === "pilot") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/pilots`, label: "Pilots" },
      { href: `${base}/milestones`, label: "Milestones" },
      { href: `${base}/metrics`, label: "Metrics" },
      { href: `${base}/proposals`, label: "Proposals" },
    ];
  }
  if (domain === "impact") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/models`, label: "Models" },
      { href: `${base}/assumptions`, label: "Assumptions" },
      { href: `${base}/savings`, label: "Savings" },
      { href: `${base}/roi`, label: "ROI Summary" },
    ];
  }
  if (domain === "case-factory") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/case-studies`, label: "Case Studies" },
      { href: `${base}/insights`, label: "Insights" },
      { href: `${base}/patterns`, label: "Patterns" },
      { href: `${base}/generator`, label: "Draft Generator" },
    ];
  }
  if (domain === "copilot") {
    return [
      { href: base, label: "Winston Workspace" },
      { href: "/app/winston", label: "Global Winston" },
    ];
  }
  if (domain === "outputs") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/deliverables`, label: "Deliverables" },
      { href: `${base}/templates`, label: "Templates" },
      { href: `${base}/exports`, label: "Exports" },
    ];
  }
  if (domain === "pattern-intel") {
    return [
      { href: base, label: "Command Center" },
      { href: `${base}/patterns`, label: "Patterns" },
      { href: `${base}/predictions`, label: "Predictions" },
      { href: `${base}/recommendations`, label: "Recommendations" },
      { href: `${base}/graph`, label: "Graph" },
      { href: `${base}/case-feed`, label: "Case Feed" },
    ];
  }
  if (domain === "opportunity-engine") {
    return [
      { href: base, label: "Command Center" },
    ];
  }
  if (domain === "resume") {
    return [];
  }
  return [
    { href: base, label: "Home" },
    { href: `${base}/properties`, label: "Properties" },
  ];
}

export default function DomainWorkspaceShell({
  envId,
  domain,
  children,
}: {
  envId: string;
  domain: DomainSlug;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const base = `/lab/env/${envId}/${domain}`;
  const homeHref = `/lab/env/${envId}`;
  const items = navItems(domain, base);
  const envLabel = environment?.client_name || envId;
  const activeNavLabel = useMemo(
    () => items.find((item) => isActive(pathname, item.href))?.label || DOMAIN_LABELS[domain],
    [domain, items, pathname],
  );

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">
        Resolving environment context...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 space-y-3" data-testid={`${domain}-context-error`}>
        <h2 className="text-lg font-semibold">Unable to load workspace context</h2>
        <p className="text-sm text-red-300">{error}</p>
        {requestId ? <p className="text-xs text-bm-muted2">Request ID: {requestId}</p> : null}
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className={`sticky top-0 z-30 flex items-center gap-3 border-b border-bm-border/60 bg-bm-bg/95 px-4 py-3 backdrop-blur lg:hidden ${domain === "resume" && items.length === 0 ? "hidden" : ""}`}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-bm-border/70 bg-bm-surface/25 text-bm-text"
          aria-label={`Open ${DOMAIN_LABELS[domain]} navigation`}
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{DOMAIN_LABELS[domain]}</p>
          <p className="truncate text-sm font-semibold text-bm-text">{envLabel}</p>
        </div>
        <Link
          href={homeHref}
          className="inline-flex h-10 items-center rounded-xl border border-bm-border/70 bg-bm-surface/25 px-3 text-xs font-medium text-bm-text"
        >
          Home
        </Link>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" data-testid={`${domain}-mobile-drawer`}>
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[88vw] flex-col border-r border-bm-border/70 bg-bm-bg p-4">
            <div className="flex items-center justify-between border-b border-bm-border/50 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">{DOMAIN_LABELS[domain]}</p>
                <p className="text-sm font-semibold text-bm-text">{envLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bm-border/70 text-bm-text"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="mt-4 space-y-1.5 overflow-y-auto" data-testid={`${domain}-left-nav-mobile`}>
              {items.map((item) => (
                <Link
                  key={`${item.href}-mobile`}
                  href={item.href}
                  className={`block rounded-lg border px-3 py-2.5 text-sm transition ${
                    isActive(pathname, item.href)
                      ? "border-bm-accent/45 bg-bm-accent/10 text-bm-text"
                      : "border-transparent text-bm-muted hover:bg-bm-surface/30 hover:text-bm-text"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 lg:hidden">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-bm-muted2" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Current module</p>
              <h1 className="text-lg font-semibold text-bm-text">{activeNavLabel}</h1>
            </div>
          </div>
          <p className="text-sm text-bm-muted2">
            Environment: {environment?.schema_name || envId}
            {businessId ? ` · Business: ${businessId.slice(0, 8)}` : ""}
          </p>
        </div>
      </section>

      {domain !== "resume" ? (
        <section className="hidden rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 lg:block">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-bm-muted2" />
                <h1 className="text-xl font-semibold">{envLabel}</h1>
                <span className="inline-flex items-center rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
                  {DOMAIN_LABELS[domain]}
                </span>
              </div>
              <p className="text-xs text-bm-muted2">
                Environment: {environment?.schema_name || envId}
                {businessId ? ` · Business: ${businessId.slice(0, 8)}` : ""}
              </p>
            </div>
            <Link
              href={homeHref}
              className="inline-flex items-center rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
              data-testid="global-home-button"
            >
              Home
            </Link>
          </div>
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
          <aside className="hidden h-fit rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 lg:block" data-testid={`${domain}-sidebar`}>
            <p className="mb-2 px-1 text-xs uppercase tracking-[0.12em] text-bm-muted2">Navigation</p>
            <nav className="space-y-1" data-testid={`${domain}-left-nav`}>
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg border px-3 py-2 text-sm transition ${
                    isActive(pathname, item.href)
                      ? "border-bm-accent/60 bg-bm-accent/10"
                      : "border-bm-border/70 hover:bg-bm-surface/40"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div>{children}</div>
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
