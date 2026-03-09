"use client";
import React from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, HardHat } from "lucide-react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { resolveWorkspaceTemplateKey } from "@/lib/workspaceTemplates";

type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navItems(base: string): NavItem[] {
  return [
    { href: base, label: "Command Center" },
    { href: `${base}/markets`, label: "Markets" },
    { href: `${base}/accounts`, label: "Accounts" },
    { href: `${base}/projects`, label: "Projects" },
    { href: `${base}/forecast`, label: "Forecast" },
    { href: `${base}/revenue`, label: "Revenue & CI" },
    { href: `${base}/resources`, label: "Resources" },
    { href: `${base}/timecards`, label: "Timecards" },
    { href: `${base}/satisfaction`, label: "Client Satisfaction" },
    { href: `${base}/risk`, label: "Delivery Risk" },
    { href: `${base}/closeout`, label: "Closeout" },
    { href: `${base}/reports`, label: "Reports" },
    { href: `${base}/ai-briefing`, label: "AI Briefing" },
    { href: `${base}/documents`, label: "Documents" },
    { href: `${base}/audit`, label: "Audit" },
    { href: `${base}/configuration`, label: "Configuration" },
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
  const items = navItems(base);
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
        <p className="mt-2 text-sm text-red-300">{error}</p>
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
      <section className="rounded-[30px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,rgba(232,191,104,0.14),transparent_42%),linear-gradient(135deg,#0f171f,#0a0f14)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-[#e8bf68]/20 bg-[#e8bf68]/10 p-2 text-[#efcf8b]">
                <HardHat size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">{envLabel}</h1>
                  <span className="inline-flex items-center rounded-full border border-[#e8bf68]/20 px-2.5 py-1 text-xs text-[#d9ba7b]">
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
          <Link href={homeHref} className="rounded-full border border-bm-border/70 px-4 py-2 text-sm hover:bg-bm-surface/40">
            Home
          </Link>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[250px,1fr]">
        <aside className="rounded-[28px] border border-bm-border/70 bg-bm-surface/20 p-3" data-testid="pds-sidebar">
          <p className="mb-3 px-1 text-xs uppercase tracking-[0.16em] text-bm-muted2">Navigation</p>
          <nav className="space-y-1.5">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-2xl border px-3 py-2.5 text-sm transition ${
                  isActive(pathname, item.href)
                    ? "border-[#e8bf68]/50 bg-[#e8bf68]/10 text-[#f2d492]"
                    : "border-bm-border/70 hover:bg-bm-surface/35"
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
