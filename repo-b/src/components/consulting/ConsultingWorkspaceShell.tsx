"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { MobileBottomNav, type MobileNavItem } from "@/components/repe/workspace/MobileBottomNav";

function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ConsultingWorkspaceShell({
  children,
  envId,
}: {
  children: React.ReactNode;
  envId: string;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, retry } = useConsultingEnv();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const base = `/lab/env/${envId}/consulting`;
  const homeHref = `/lab/env/${envId}`;
  const navItems = useMemo(
    () => [
      { href: base, label: "Command Center", isBase: true },
      { href: `${base}/pipeline`, label: "Pipeline", isBase: false },
      { href: `${base}/accounts`, label: "Accounts", isBase: false },
      { href: `${base}/contacts`, label: "Contacts", isBase: false },
      { href: `${base}/strategic-outreach`, label: "Outreach", isBase: false },
      { href: `${base}/proposals`, label: "Proposals", isBase: false },
      { href: `${base}/clients`, label: "Clients", isBase: false },
      { href: `${base}/proof-assets`, label: "Proof Assets", isBase: false },
      { href: `${base}/tasks`, label: "Tasks", isBase: false },
      { href: `${base}/revenue`, label: "Revenue", isBase: false },
    ],
    [base],
  );
  const mobileNavItems = useMemo<MobileNavItem[]>(
    () => [
      { href: base, label: "Home", icon: "home", matchPrefix: false },
      { href: `${base}/pipeline`, label: "Pipeline", icon: "pipeline", matchPrefix: true },
      { href: `${base}/accounts`, label: "Accounts", icon: "contacts", matchPrefix: true },
      { href: `${base}/strategic-outreach`, label: "Outreach", icon: "tasks", matchPrefix: true },
      { href: `${base}/tasks`, label: "Tasks", icon: "reports", matchPrefix: true },
    ],
    [base],
  );
  const activeNavLabel = useMemo(
    () => navItems.find((item) => isActive(pathname, item.href, item.isBase))?.label || "Command Center",
    [navItems, pathname],
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

  const envLabel = environment?.client_name || envId || "Consulting";

  if (loading) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">
        Resolving consulting environment...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 space-y-4"
        data-testid="consulting-context-error"
      >
        <h2 className="text-lg font-semibold">
          Unable to load Consulting workspace
        </h2>
        <p className="text-sm text-red-300">{error}</p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
          >
            Retry
          </button>
          <a
            href={homeHref}
            className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40"
          >
            Back to Environment
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-bm-border/60 bg-bm-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-bm-border/70 bg-bm-surface/25 text-bm-text"
          aria-label="Open consulting navigation"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Consulting Revenue Engine</p>
          <p className="truncate text-sm font-semibold text-bm-text">{envLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/strategic-outreach`}
            className="inline-flex h-10 items-center rounded-xl border border-bm-accent/40 bg-bm-accent/10 px-3 text-xs font-semibold text-bm-accent"
          >
            Outreach
          </Link>
          <Link
            href={`${base}/contacts`}
            className="inline-flex h-10 items-center rounded-xl border border-bm-border/70 bg-bm-surface/25 px-3 text-xs font-medium text-bm-text"
          >
            + Contact
          </Link>
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" data-testid="consulting-mobile-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close consulting navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[88vw] flex-col border-r border-bm-border/70 bg-bm-bg p-4">
            <div className="flex items-center justify-between border-b border-bm-border/50 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">Environment</p>
                <p className="text-sm font-semibold text-bm-text">{envLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bm-border/70 text-bm-text"
                aria-label="Close consulting navigation"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="mt-4 space-y-0.5 overflow-y-auto" data-testid="consulting-left-nav-mobile">
              {navItems.map((item) => (
                <Link
                  key={`${item.href}-mobile`}
                  href={item.href}
                  className={`block border-l-2 px-3 py-2 text-sm transition-colors ${
                    isActive(pathname, item.href, item.isBase)
                      ? "border-l-bm-accent bg-bm-surface/15 font-semibold text-bm-text"
                      : "border-l-transparent text-bm-muted hover:bg-bm-surface/10 hover:text-bm-text"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      {/* Desktop header — flat separator, no card */}
      <header className="hidden items-center justify-between border-b border-bm-border/40 px-2 py-3 lg:flex">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-bm-text">{envLabel}</h1>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-bm-muted2">
            Consulting Revenue Engine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={homeHref}
            className="rounded border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:text-bm-text"
            data-testid="global-home-button"
          >
            ← Env
          </Link>
          <Link
            href={`${base}/contacts`}
            className="rounded border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:text-bm-text"
          >
            + Contact
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[196px,1fr]">
        <aside
          className="hidden h-fit border-r border-bm-border/30 py-2 pr-2 lg:block"
          data-testid="consulting-sidebar"
        >
          <nav className="space-y-0.5" data-testid="consulting-left-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block border-l-2 px-3 py-2 text-xs transition-colors ${
                  isActive(pathname, item.href, item.isBase)
                    ? "border-l-bm-accent bg-bm-surface/15 font-semibold text-bm-text"
                    : "border-l-transparent text-bm-muted hover:bg-bm-surface/10 hover:text-bm-text"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="pb-20 md:pb-0">{children}</div>
      </div>
      <MobileBottomNav items={mobileNavItems} />
    </div>
  );
}
