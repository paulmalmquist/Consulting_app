"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, Menu, X } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";

type OperatorShellProps = {
  envId: string;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type AnchorItem = {
  id: string;
  label: string;
};

function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function anchorSections(pathname: string): AnchorItem[] {
  if (pathname.includes("/operator/finance")) {
    return [
      { id: "overview", label: "Overview" },
      { id: "entity-performance", label: "Entity Performance" },
      { id: "consolidation", label: "Consolidation" },
      { id: "variance", label: "Variance" },
      { id: "close-tracker", label: "Close Tracker" },
    ];
  }
  if (pathname.includes("/operator/site-risk")) {
    return [
      { id: "ordinance-changes", label: "Ordinance changes" },
      { id: "sites", label: "Sites" },
      { id: "municipalities", label: "Municipalities" },
    ];
  }
  if (pathname.includes("/operator/municipalities")) {
    return [
      { id: "scorecard", label: "Scorecard" },
      { id: "linked-sites", label: "Sites" },
      { id: "linked-projects", label: "Projects" },
      { id: "recent-changes", label: "Recent changes" },
    ];
  }
  if (pathname.includes("/operator/pipeline-integrity")) {
    return [
      { id: "premature-projects", label: "Premature projects" },
      { id: "active-before-ready", label: "Active before ready" },
      { id: "assumption-drift", label: "Assumption drift" },
    ];
  }
  if (pathname.includes("/operator/projects/") || pathname.includes("/operator/delivery/")) {
    return [
      { id: "budget-vs-actual", label: "Budget vs Actual" },
      { id: "documents", label: "Documents" },
      { id: "tasks", label: "Tasks" },
      { id: "vendors", label: "Vendors" },
    ];
  }
  if (pathname.includes("/operator/projects") || pathname.includes("/operator/delivery")) {
    return [
      { id: "permit-tracker", label: "Permits" },
      { id: "drift-watchlist", label: "Drift Watchlist" },
      { id: "review-churn", label: "Review Churn" },
      { id: "inspection-rework", label: "Inspections" },
      { id: "team-capacity", label: "Team Capacity" },
      { id: "lessons", label: "Lessons" },
      { id: "accountability", label: "Accountability" },
      { id: "project-tracker", label: "Tracker" },
      { id: "red-projects", label: "Red Projects" },
    ];
  }
  if (pathname.includes("/operator/documents")) {
    return [
      { id: "intelligence", label: "Intelligence" },
      { id: "seeded-docs", label: "Seeded Docs" },
      { id: "upload", label: "Upload + Extract" },
    ];
  }
  if (pathname.includes("/operator/pipeline/")) {
    return [
      { id: "zoning-details", label: "Zoning" },
      { id: "approvals", label: "Approvals" },
      { id: "documents", label: "Documents" },
      { id: "actions", label: "Actions" },
    ];
  }
  if (pathname.includes("/operator/pipeline")) {
    return [
      { id: "pipeline-tracker", label: "Tracker" },
      { id: "high-risk-sites", label: "High Risk" },
    ];
  }
  if (pathname.includes("/operator/vendors")) {
    return [
      { id: "concentration", label: "Concentration" },
      { id: "spend-aggregation", label: "Spend Aggregation" },
      { id: "duplication", label: "Duplication" },
      { id: "consolidation", label: "Consolidation" },
    ];
  }
  if (pathname.includes("/operator/close") || pathname.includes("/operator/closeout")) {
    return [
      { id: "close-tasks", label: "Close Tasks" },
      { id: "blockers", label: "Blockers" },
    ];
  }
  return [
    { id: "overview", label: "Overview" },
    { id: "entity-performance", label: "Entity Performance" },
    { id: "project-risk", label: "Project Risk" },
    { id: "site-risk", label: "Site Risk" },
    { id: "winston", label: "Winston" },
  ];
}

function isExecutivePath(pathname: string, base: string): boolean {
  return pathname === base;
}

export default function OperatorShell({ envId, children }: OperatorShellProps) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const base = `/lab/env/${envId}/operator`;
  const tabs = useMemo<NavItem[]>(
    () => [
      { href: base, label: "Executive", exact: true },
      { href: `${base}/site-risk`, label: "Site Risk" },
      { href: `${base}/municipalities`, label: "Municipalities" },
      { href: `${base}/pipeline-integrity`, label: "Pipeline Integrity" },
      { href: `${base}/projects`, label: "Delivery" },
      { href: `${base}/documents`, label: "Documents" },
      { href: `${base}/pipeline`, label: "Pipeline" },
      { href: `${base}/vendors`, label: "Vendors" },
      { href: `${base}/close`, label: "Closeout" },
      { href: `${base}/finance`, label: "Finance" },
    ],
    [base]
  );
  const sections = useMemo(() => anchorSections(pathname), [pathname]);
  const showAnchorAside = sections.length > 0 && !isExecutivePath(pathname, base);

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
    return <WorkspaceContextLoader label="Loading Hall Boys operator workspace" />;
  }

  if (error) {
    return (
      <div data-testid="operator-context-error">
        <OperatorUnavailableState
          title="Unable to load Hall Boys operator workspace"
          detail={error}
          onRetry={() => void retry()}
          requestId={requestId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-[22px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,rgba(181,161,99,0.14),transparent_38%),linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,28,0.92))] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-bm-muted2"
              title={`Business ID: ${businessId || "—"} · Industry: ${environment?.industry_type || environment?.industry || "multi_entity_operator"}`}
            >
              <Building2 size={12} />
              Hall Boys Operating System
            </span>
            <h1 className="truncate text-lg font-semibold text-bm-text sm:text-xl">
              {environment?.client_name || "Hall Boys Holdings"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-bm-muted2 sm:inline">
              As of 2026-03-31
            </span>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-bm-border/70 bg-black/20 text-bm-text lg:hidden"
              aria-label="Open operator navigation"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={16} />
            </button>
          </div>
        </div>

        <p className="mt-1.5 max-w-3xl text-[13px] text-bm-muted2">
          Land → permits → build → close → cash. One surface, every entity.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href, tab.exact);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full px-3 py-1 text-[13px] transition ${
                  active
                    ? "bg-white text-slate-950"
                    : "border border-white/10 bg-white/5 text-bm-muted2 hover:bg-white/10 hover:text-bm-text"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close operator navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-80 max-w-[92vw] flex-col border-l border-bm-border/70 bg-bm-bg p-4">
            <div className="flex items-center justify-between border-b border-bm-border/50 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Hall Boys</p>
                <p className="text-sm font-semibold text-bm-text">Operator Navigation</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bm-border/70 text-bm-text"
                aria-label="Close operator navigation"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {tabs.map((tab) => {
                const active = isActive(pathname, tab.href, tab.exact);
                return (
                  <Link
                    key={`${tab.href}-mobile`}
                    href={tab.href}
                    className={`block rounded-xl px-3 py-2.5 text-sm ${
                      active
                        ? "bg-white text-slate-950"
                        : "border border-bm-border/60 bg-bm-surface/20 text-bm-muted2"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showAnchorAside ? (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">On This Page</p>
              <nav className="mt-3 space-y-1.5">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="block rounded-xl px-3 py-2 text-sm text-bm-muted2 transition hover:bg-bm-surface/40 hover:text-bm-text"
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      ) : (
        <main className="min-w-0">{children}</main>
      )}
    </div>
  );
}
