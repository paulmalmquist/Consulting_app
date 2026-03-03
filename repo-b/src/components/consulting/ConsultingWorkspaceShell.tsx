"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";

function isActive(pathname: string, href: string, isBase: boolean): boolean {
  if (isBase) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ConsultingWorkspaceShell({
  children,
  envId,
  isAdmin = false,
}: {
  children: React.ReactNode;
  envId: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, retry } = useConsultingEnv();

  const base = `/lab/env/${envId}/consulting`;
  const homeHref = isAdmin ? "/admin" : `/lab/env/${envId}`;
  const navItems = useMemo(
    () => [
      { href: base, label: "Command Center", isBase: true },
      { href: `${base}/pipeline`, label: "Pipeline", isBase: false },
      { href: `${base}/outreach`, label: "Outreach", isBase: false },
      { href: `${base}/strategic-outreach`, label: "Strategic Outreach", isBase: false },
      { href: `${base}/proposals`, label: "Proposals", isBase: false },
      { href: `${base}/clients`, label: "Clients", isBase: false },
      { href: `${base}/loops`, label: "Loop Intelligence", isBase: false },
      { href: `${base}/authority`, label: "Authority", isBase: false },
    ],
    [base],
  );

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
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-display font-semibold tracking-tight">{envLabel}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
                Consulting Revenue Engine
              </span>
            </div>
            <p className="text-xs text-bm-muted2">
              {environment?.schema_name || environment?.client_name || "Consulting Workspace"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={homeHref}
              className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
              data-testid="global-home-button"
            >
              Home
            </Link>
            <Link
              href={`${base}/outreach/new`}
              className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              + Lead
            </Link>
            <Link
              href={`${base}/proposals/new`}
              className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
            >
              + Proposal
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[200px,1fr]">
        <aside
          className="rounded-xl border border-bm-border/70 bg-bm-bg p-3 h-fit"
          data-testid="consulting-sidebar"
        >
          <nav className="space-y-1.5" data-testid="consulting-left-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg border px-3 py-2.5 text-sm transition-[transform,box-shadow] duration-[120ms] ${
                  isActive(pathname, item.href, item.isBase)
                    ? "bg-bm-surface/30 text-bm-text border-transparent border-l-2 border-l-bm-accent font-medium"
                    : "text-bm-muted border-transparent hover:bg-bm-surface/30 hover:text-bm-text"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
