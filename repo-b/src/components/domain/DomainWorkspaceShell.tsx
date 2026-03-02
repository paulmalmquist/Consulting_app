"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
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
};

function navItems(domain: DomainSlug, base: string): NavItem[] {
  if (domain === "pds") {
    return [
      { href: base, label: "Command Center" },
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
    ];
  }
  if (domain === "legal") {
    return [
      { href: base, label: "Home" },
      { href: `${base}/matters`, label: "Matters" },
    ];
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
  isAdmin = false,
}: {
  envId: string;
  domain: DomainSlug;
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { environment, businessId, loading, error, requestId, retry } = useDomainEnv();

  const base = `/lab/env/${envId}/${domain}`;
  const homeHref = isAdmin ? "/admin" : `/lab/env/${envId}`;
  const items = navItems(domain, base);
  const envLabel = environment?.client_name || envId;

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
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
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

      <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
        <aside className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 h-fit" data-testid={`${domain}-sidebar`}>
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
    </div>
  );
}
