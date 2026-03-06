"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Building2, Landmark, Menu, PlusCircle, X } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    // Base "Funds" item: only highlight on exact match, /funds sub-paths, or /portfolio.
    // Must NOT match /deals, /assets, /models, /runs paths.
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/funds`)) return true;
    if (pathname.startsWith(`${href}/portfolio`)) return true;
    return false;
  }
  // Non-base items: exact match or direct sub-path only
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function RepeWorkspaceShell({ children, envId, isAdmin = false }: { children: React.ReactNode; envId?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, errorCode, requestId, retry } = useReEnv();

  const base = envId ? `/lab/env/${envId}/re` : "/app/repe";
  const homeHref = envId ? `/lab/env/${envId}` : "/lab/environments";
  const showIntelligence = process.env.NEXT_PUBLIC_SHOW_INTELLIGENCE_MODULE === "true";
  const showSustainability = process.env.NEXT_PUBLIC_SHOW_SUSTAINABILITY_MODULE === "true";
  const navItems = useMemo(
    () => [
      { href: `${base}`, label: "Funds", isBase: true },
      { href: `${base}/deals`, label: "Investments", isBase: false },
      { href: `${base}/assets`, label: "Assets", isBase: false },
      { href: `${base}/pipeline`, label: "Pipeline", isBase: false },
      ...(showIntelligence ? [{ href: `${base}/intelligence`, label: "Intelligence", isBase: false }] : []),
      { href: `${base}/models`, label: "Models", isBase: false },
      { href: `${base}/reports`, label: "Reports", isBase: false },
      { href: `${base}/runs/quarter-close`, label: "Run Center", isBase: false },
      ...(showSustainability ? [{ href: `${base}/sustainability`, label: "Sustainability", isBase: false }] : []),
    ],
    [base, showIntelligence, showSustainability]
  );

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const envLabel = environment?.client_name || envId || "Real Estate";

  if (loading) {
    return <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Resolving environment context...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 space-y-4" data-testid="re-context-error">
        <h2 className="text-lg font-semibold">Unable to load Real Estate workspace</h2>
        <p className="text-sm text-red-300">{error}</p>
        {errorCode ? (
          <p className="text-xs text-bm-muted2 font-mono">Error: {errorCode}</p>
        ) : null}
        {requestId ? (
          <p className="text-xs text-bm-muted2">Request ID: {requestId}</p>
        ) : null}
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

  const navList = (
    <nav className="space-y-1.5" data-testid="repe-left-nav">
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}
          onClick={() => setSidebarOpen(false)}
          className={`block rounded-lg border px-3 py-2.5 text-sm transition-[transform,box-shadow] duration-[120ms] ${
            isActive(pathname, item.href, item.isBase)
              ? "bg-bm-surface/30 text-bm-text border-transparent border-l-2 border-l-bm-accent font-medium"
              : "text-bm-muted border-transparent hover:bg-bm-surface/30 hover:text-bm-text"
          }`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="space-y-4">
      {/* Environment Header */}
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-md border border-bm-border/70 hover:bg-bm-surface/40"
              onClick={() => setSidebarOpen(true)}
              aria-label="Toggle navigation"
            >
              <Menu size={18} />
            </button>
            <Building2 size={18} className="text-bm-muted2" />
            <h1 className="text-xl font-display font-semibold tracking-tight">{envLabel}</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
              <Landmark size={12} /> Real Estate
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
            <Link href={homeHref} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 whitespace-nowrap" data-testid="global-home-button">Home</Link>
            <Link href={`${base}/funds/new`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 whitespace-nowrap"><PlusCircle size={14} /> Fund</Link>
            <Link href={`${base}/deals`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 whitespace-nowrap"><PlusCircle size={14} /> Investment</Link>
            <Link href={`${base}/assets?create=1`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 whitespace-nowrap"><PlusCircle size={14} /> Asset</Link>
          </div>
        </div>
      </section>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-bm-bg border-r border-bm-border/70 p-4 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold">Navigation</span>
              <button type="button" onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-bm-surface/40" aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>
            {navList}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[200px,1fr]">
        <aside className="hidden lg:block rounded-xl border border-bm-border/70 bg-bm-bg p-3 h-fit" data-testid="repe-sidebar">
          {navList}
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
