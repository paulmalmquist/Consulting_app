"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, BriefcaseBusiness, FilePlus2, Landmark, PlusCircle } from "lucide-react";
import { useRepeContext } from "@/lib/repe-context";

function buildNavItems(envId?: string) {
  const base = envId ? `/lab/env/${envId}/re` : "/app/repe";
  return [
    { href: `${base}/portfolio`, label: "Portfolio" },
    { href: `${base}/funds`, label: "Funds" },
    { href: `${base}/deals`, label: "Deals" },
    { href: `${base}/assets`, label: "Assets" },
    { href: `${base}/capital`, label: "Capital" },
    { href: `${base}/waterfalls`, label: "Waterfalls" },
    { href: `${base}/documents`, label: "Documents" },
    { href: `${base}/controls`, label: "Controls" },
  ];
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function RepeWorkspaceShell({ children, envId }: { children: React.ReactNode; envId?: string }) {
  const pathname = usePathname();
  const {
    environment,
    businessId,
    businesses,
    showBusinessSwitcher,
    setBusinessForEnvironment,
  } = useRepeContext(envId);

  const navItems = buildNavItems(envId);
  const base = envId ? `/lab/env/${envId}/re` : "/app/repe";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-bm-muted2" />
              <h1 className="text-xl font-semibold">{environment?.client_name || "REPE Workspace"}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2.5 py-1 text-xs text-bm-muted2">
                <Landmark size={12} /> Real Estate
              </span>
            </div>
            <p className="text-xs text-bm-muted2">
              Environment: {environment?.schema_name || "not selected"}
              {businessId ? ` · Business: ${businessId.slice(0, 8)}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showBusinessSwitcher ? (
              <select
                aria-label="Business switcher"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
                value={businessId || ""}
                onChange={(event) => setBusinessForEnvironment(event.target.value)}
              >
                {businesses.map((row) => (
                  <option key={row.business_id} value={row.business_id}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Link href={`${base}/funds`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <PlusCircle size={14} /> Fund
            </Link>
            <Link href={`${base}/deals`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <BriefcaseBusiness size={14} /> Deal
            </Link>
            <Link href={`${base}/assets`} className="inline-flex items-center gap-1 rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
              <FilePlus2 size={14} /> Asset
            </Link>
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" data-testid="repe-top-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                isActive(pathname, item.href)
                  ? "border-bm-accent/60 bg-bm-accent/10"
                  : "border-bm-border/70 hover:bg-bm-surface/40"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      {children}
    </div>
  );
}
