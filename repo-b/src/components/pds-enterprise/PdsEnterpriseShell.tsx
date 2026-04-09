"use client";
import React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, HardHat, Menu, X } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";
import ThemeToggle from "@/components/ThemeToggle";
import { MobileBottomNav, type MobileNavItem } from "@/components/repe/workspace/MobileBottomNav";

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
      domain: "Demo Flow",
      items: [
        { href: base, label: "Intervention Queue", exact: true },
        { href: `${base}/projects`, label: "Projects" },
        { href: `${base}/reports`, label: "Report Output" },
      ],
    },
    {
      domain: "Recovery Views",
      items: [
        { href: `${base}/accounts`, label: "Cost Breakdown" },
        { href: `${base}/ai-briefing`, label: "Operating Posture" },
        { href: `${base}/audit`, label: "Audit Log" },
      ],
    },
    {
      domain: "Tools",
      items: [
        { href: `${base}/ai-query`, label: "AI Command Layer", tone: "special" },
      ],
    },
  ];
}

export default function PdsEnterpriseShell({
  envId,
  children,
}: {
  envId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const base = `/lab/env/${envId}/pds`;
  const homeHref = `/lab/env/${envId}`;
  const groups = navGroups(base);
  const mobileNavItems = useMemo<MobileNavItem[]>(
    () => [
      { href: base, label: "Queue", icon: "home", matchPrefix: false },
      { href: `${base}/projects`, label: "Projects", icon: "pipeline", matchPrefix: true },
      { href: `${base}/reports`, label: "Reports", icon: "revenue", matchPrefix: true },
      { href: `${base}/accounts`, label: "Costs", icon: "accounts", matchPrefix: true },
      { href: `${base}/audit`, label: "Audit", icon: "risk", matchPrefix: true },
    ],
    [base],
  );
  const envLabel = environment?.client_name || "Stone PDS";
  const templateKey =
    resolveWorkspaceTemplateKey({
      workspaceTemplateKey: environment?.workspace_template_key,
      industry: environment?.industry,
      industryType: environment?.industry_type,
    }) || "pds_enterprise";
  const activeNavLabel = useMemo(
    () =>
      groups.flatMap((group) => group.items).find((item) => isActive(pathname, item.href, item.exact))?.label || "Intervention Queue",
    [groups, pathname],
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
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-bm-border/60 bg-bm-bg/95 px-4 py-3 backdrop-blur xl:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-bm-border/70 bg-bm-surface/25 text-bm-text"
          aria-label="Open PDS navigation"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-bm-muted2">PDS Enterprise OS</p>
          <p className="truncate text-sm font-semibold text-bm-text">{envLabel}</p>
        </div>
        <ThemeToggle />
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden" data-testid="pds-mobile-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close PDS navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-80 max-w-[92vw] flex-col border-r border-bm-border/70 bg-bm-bg p-4">
            <div className="flex items-center justify-between border-b border-bm-border/50 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">PDS Enterprise OS</p>
                <p className="text-sm font-semibold text-bm-text">{envLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bm-border/70 text-bm-text"
                aria-label="Close PDS navigation"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto">
              {groups.map((group) => (
                <div key={`${group.domain}-mobile`} className="mb-4">
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2/70">
                    {group.domain}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href, item.exact);
                      const inactiveClass =
                        item.tone === "special"
                          ? "border-pds-accent/15 bg-pds-accent/5 text-pds-accentText hover:bg-pds-accent/10 hover:text-pds-accentSoft"
                          : "border-transparent text-bm-muted hover:bg-pds-accent/5 hover:text-pds-accentSoft";

                      return (
                        <Link
                          key={`${item.href}-mobile`}
                          href={item.href}
                          className={`block rounded-xl border px-3 py-2.5 text-[13px] transition ${
                            active ? "border-pds-accent/50 bg-pds-accent/10 text-pds-accentText" : inactiveClass
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-[24px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_42%)] bg-bm-surface/[0.92] p-4 xl:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-pds-accent/20 bg-pds-accent/10 p-2 text-pds-accentSoft">
                <HardHat size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Current section</p>
                <h1 className="text-lg font-semibold text-bm-text">{activeNavLabel}</h1>
              </div>
            </div>
            <p className="text-sm text-bm-muted2">
              Environment {environment?.schema_name || envId}
              {businessId ? ` · ${businessId.slice(0, 8)}` : ""}
            </p>
          </div>
          <Link href={homeHref} className="rounded-full border border-bm-border/70 px-4 py-2 text-sm hover:bg-bm-surface/40">
            Home
          </Link>
        </div>
      </section>

      <section className="hidden rounded-[30px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_42%)] bg-bm-surface/[0.92] p-5 xl:block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-pds-accent/20 bg-pds-accent/10 p-2 text-pds-accentSoft">
                <HardHat size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">{envLabel}</h1>
                  <span className="inline-flex items-center rounded-full border border-pds-accent/20 px-2.5 py-1 text-xs text-pds-accentText">
                    Executive Recovery System
                  </span>
                </div>
                <p className="text-sm text-bm-muted2">Lead with the problem, open the project, and ship the recovery report while the numbers stay coherent.</p>
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
        <aside className="hidden rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-3 xl:block" data-testid="pds-sidebar">
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
                        ? "border-pds-accent/15 bg-pds-accent/5 text-pds-accentText hover:bg-pds-accent/10 hover:text-pds-accentSoft"
                        : "border-transparent hover:bg-pds-accent/5 hover:text-pds-accentSoft";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-xl border px-3 py-2 pl-5 text-[13px] transition ${
                          active
                            ? "border-pds-accent/50 bg-pds-accent/10 text-pds-accentText"
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

        <div className="pb-20 xl:pb-0">{children}</div>
      </div>
      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
