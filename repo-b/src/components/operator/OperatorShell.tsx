"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, Menu, X } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";

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
  if (pathname.includes("/operator/projects/")) {
    return [
      { id: "budget-vs-actual", label: "Budget vs Actual" },
      { id: "documents", label: "Documents" },
      { id: "tasks", label: "Tasks" },
      { id: "vendors", label: "Vendors" },
    ];
  }
  if (pathname.includes("/operator/projects")) {
    return [
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
  if (pathname.includes("/operator/vendors")) {
    return [
      { id: "spend-aggregation", label: "Spend Aggregation" },
      { id: "duplication", label: "Duplication" },
      { id: "consolidation", label: "Consolidation" },
    ];
  }
  if (pathname.includes("/operator/close")) {
    return [
      { id: "close-tasks", label: "Close Tasks" },
      { id: "blockers", label: "Blockers" },
    ];
  }
  return [
    { id: "overview", label: "Overview" },
    { id: "entity-performance", label: "Entity Performance" },
    { id: "project-risk", label: "Project Risk" },
    { id: "winston", label: "Winston" },
  ];
}

export default function OperatorShell({ envId, children }: OperatorShellProps) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const base = `/lab/env/${envId}/operator`;
  const tabs = useMemo<NavItem[]>(
    () => [
      { href: base, label: "Executive", exact: true },
      { href: `${base}/finance`, label: "Finance" },
      { href: `${base}/projects`, label: "Projects" },
      { href: `${base}/documents`, label: "Documents" },
      { href: `${base}/vendors`, label: "Vendors" },
      { href: `${base}/close`, label: "Close" },
    ],
    [base]
  );
  const sections = useMemo(() => anchorSections(pathname), [pathname]);

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
      <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6 space-y-3" data-testid="operator-context-error">
        <h2 className="text-lg font-semibold">Unable to load Hall Boys operator workspace</h2>
        <p className="text-sm text-red-300">{error}</p>
        {requestId ? <p className="text-xs text-bm-muted2">Request ID: {requestId}</p> : null}
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-full border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-[28px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,rgba(181,161,99,0.18),transparent_38%),linear-gradient(180deg,rgba(17,24,39,0.94),rgba(12,18,28,0.92))] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-bm-muted2">
              <Building2 size={14} />
              Hall Boys Operating System
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-bm-text sm:text-3xl">
                {environment?.client_name || "Hall Boys Operating System"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-bm-muted2 sm:text-[15px]">
                See across all companies, understand what is happening operationally, and act on it in one place.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-bm-border/70 bg-black/20 text-bm-text lg:hidden"
            aria-label="Open operator navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={18} />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href, tab.exact);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full px-4 py-2 text-sm transition ${
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

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-bm-muted2">
          <span>Business ID: {businessId || "—"}</span>
          <span>Industry: {environment?.industry_type || environment?.industry || "multi_entity_operator"}</span>
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
    </div>
  );
}
