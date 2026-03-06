"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Building2, Landmark, PlusCircle } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { WinstonShell } from "@/components/repe/workspace/WinstonShell";
import type { MobileNavItem } from "@/components/repe/workspace/MobileBottomNav";

function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/funds`)) return true;
    if (pathname.startsWith(`${href}/portfolio`)) return true;
    return false;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TopUtilityNav({
  pathname,
  base,
  homeHref,
  className,
  showAll = true,
  testId,
}: {
  pathname: string;
  base: string;
  homeHref: string;
  className?: string;
  showAll?: boolean;
  testId?: string;
}) {
  const links = [
    { href: homeHref, label: "Home", isActive: pathname === homeHref, testId: "global-home-button" },
    { href: base, label: "Funds", isActive: isActive(pathname, base, true) },
    { href: `${base}/deals`, label: "Investments", isActive: isActive(pathname, `${base}/deals`, false) },
    { href: `${base}/assets`, label: "Assets", isActive: isActive(pathname, `${base}/assets`, false) },
  ];

  const visibleLinks = showAll ? links : links.slice(0, 1);

  return (
    <nav className={className} aria-label="Workspace shortcuts" data-testid={testId}>
      {visibleLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-testid={link.testId}
          className={[
            "text-[11px] uppercase tracking-[0.12em] transition-colors duration-fast",
            link.isActive
              ? "text-bm-text underline underline-offset-[6px] decoration-bm-border-strong/80"
              : "text-bm-muted2 hover:text-bm-text",
          ].join(" ")}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export default function RepeWorkspaceShell({
  children,
  envId,
  isAdmin = false,
  /** Optional context rail content — passed through to the right column */
  rail,
}: {
  children: React.ReactNode;
  envId?: string;
  isAdmin?: boolean;
  rail?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { environment, loading, error, errorCode, requestId, retry } = useReEnv();

  const base     = envId ? `/lab/env/${envId}/re` : "/app/repe";
  const homeHref = envId ? `/lab/env/${envId}`    : "/lab/environments";

  const showIntelligence  = process.env.NEXT_PUBLIC_SHOW_INTELLIGENCE_MODULE  === "true";
  const showSustainability = process.env.NEXT_PUBLIC_SHOW_SUSTAINABILITY_MODULE === "true";

  const navItems = useMemo(() => [
    { href: base,                          label: "Funds",          isBase: true  },
    { href: `${base}/deals`,               label: "Investments",    isBase: false },
    { href: `${base}/assets`,              label: "Assets",         isBase: false },
    { href: `${base}/pipeline`,            label: "Pipeline",       isBase: false },
    ...(showIntelligence
      ? [{ href: `${base}/intelligence`,   label: "Intelligence",   isBase: false }]
      : []),
    { href: `${base}/models`,              label: "Models",         isBase: false },
    { href: `${base}/reports`,             label: "Reports",        isBase: false },
    { href: `${base}/runs/quarter-close`,  label: "Run Center",     isBase: false },
    ...(showSustainability
      ? [{ href: `${base}/sustainability`, label: "Sustainability",  isBase: false }]
      : []),
  ], [base, showIntelligence, showSustainability]);

  const mobileNavItems: MobileNavItem[] = useMemo(() => [
    { href: base,                label: "Funds",   icon: "funds",   matchPrefix: false },
    { href: `${base}/deals`,     label: "Deals",   icon: "deals",   matchPrefix: true  },
    { href: `${base}/winston`,   label: "Winston", icon: "winston", matchPrefix: true  },
    { href: `${base}/assets`,    label: "Assets",  icon: "assets",  matchPrefix: true  },
    { href: `${base}/models`,    label: "Models",  icon: "models",  matchPrefix: true  },
  ], [base]);

  const envLabel = environment?.client_name || envId || "Real Estate";

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-6 py-10 text-sm text-bm-muted2">
        Resolving environment context…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="m-6 border border-bm-border/30 bg-bm-surface/20 p-6 space-y-4"
        data-testid="re-context-error"
      >
        <h2 className="text-lg font-semibold">Unable to load Real Estate workspace</h2>
        <p className="text-sm text-bm-danger">{error}</p>
        {errorCode  && <p className="text-xs text-bm-muted2 font-mono">Error: {errorCode}</p>}
        {requestId  && <p className="text-xs text-bm-muted2">Request ID: {requestId}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void retry()}
            className="border border-bm-border/30 px-4 py-2 text-sm font-medium
                       hover:bg-bm-surface/40 transition-colors"
          >
            Retry
          </button>
          <a
            href={homeHref}
            className="text-sm text-bm-muted hover:text-bm-text transition-colors"
          >
            ← Back to Environment
          </a>
        </div>
      </div>
    );
  }

  // ── Sidebar nav ───────────────────────────────────────────────────────────

  const sidebarNav = (
    <div data-testid="repe-sidebar">
      <nav
        className="flex flex-col"
        data-testid="repe-left-nav"
        aria-label="REPE navigation"
      >
      {/* Firm identity */}
        <div className="mb-1 flex items-center gap-2 border-b border-bm-border/[0.08] px-3 pb-3">
          <Building2 size={13} className="shrink-0 text-bm-muted2" aria-hidden="true" />
          <span className="truncate text-[12px] font-semibold text-bm-text">{envLabel}</span>
          <Landmark size={11} className="ml-auto shrink-0 text-bm-muted2" aria-hidden="true" />
        </div>

      {/* Primary nav links */}
        <div className="mt-1 space-y-px">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, item.isBase);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center border-l-2 px-3 py-2 text-[13px] transition-colors duration-fast",
                  active
                    ? "border-bm-accent bg-bm-surface/20 font-medium text-bm-text"
                    : "border-transparent text-bm-muted hover:bg-bm-surface/10 hover:text-bm-text",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

      {/* Quick-create actions */}
        <div className="mt-6 space-y-px border-t border-bm-border/[0.08] px-2 pt-4">
          <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-bm-muted2">
            Create
          </p>
          {[
            { label: "+ Fund", href: `${base}/funds/new` },
            { label: "+ Investment", href: `${base}/deals` },
            { label: "+ Asset", href: `${base}/assets?create=1` },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-bm-muted transition-colors duration-fast hover:text-bm-text"
            >
              <PlusCircle size={10} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );

  const headerAction = (
    <TopUtilityNav
      pathname={pathname}
      base={base}
      homeHref={homeHref}
      className="flex items-center gap-3 sm:gap-4"
      showAll={false}
      testId="repe-utility-nav-mobile"
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <WinstonShell
      sidebar={sidebarNav}
      rail={rail}
      headerLabel={envLabel}
      headerAction={headerAction}
      mobileNavItems={mobileNavItems}
    >
      <div className="space-y-8 xl:space-y-10">
        <TopUtilityNav
          pathname={pathname}
          base={base}
          homeHref={homeHref}
          className="hidden items-center justify-end gap-5 xl:flex"
          testId="repe-utility-nav"
        />
        {children}
      </div>
    </WinstonShell>
  );
}
