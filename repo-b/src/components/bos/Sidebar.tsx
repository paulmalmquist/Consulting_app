"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";

const FINANCE_LIFECYCLE_NAV = [
  { key: "portfolio", label: "Portfolio", href: "/app/finance/portfolio" },
  { key: "funds", label: "Funds", href: "/app/finance/funds" },
  { key: "deals", label: "Deals", href: "/app/finance/deals" },
  { key: "asset-management", label: "Asset Management", href: "/app/finance/asset-management" },
  { key: "waterfalls", label: "Waterfalls", href: "/app/finance/waterfalls" },
  { key: "controls", label: "Controls", href: "/app/finance/controls" },
];

const FINANCE_MODULE_LINKS: Array<{ section: string; label: string; href: string }> = [
  { section: "Funds", label: "REPE Waterfalls", href: "/app/finance/repe" },
  { section: "Deals", label: "Underwriting", href: "/app/finance/underwriting" },
  { section: "Deals", label: "Scenario Lab", href: "/app/finance/scenarios" },
  { section: "Deals", label: "Healthcare / MSO", href: "/app/finance/healthcare" },
  { section: "Asset Mgmt", label: "Construction Finance", href: "/app/finance/construction" },
  { section: "Controls", label: "Legal Economics", href: "/app/finance/legal" },
  { section: "Controls", label: "Security & ACL", href: "/app/finance/security" },
];

export default function Sidebar({
  open,
  onClose,
  activeDeptKey,
  activeCapKey,
}: {
  open: boolean;
  onClose: () => void;
  activeDeptKey: string | null;
  activeCapKey: string | null;
}) {
  const pathname = usePathname();
  const { capabilities, loadingCapabilities } = useBusinessContext();
  const isFinance = activeDeptKey === "finance";

  const kindIcon = (kind: string) => {
    switch (kind) {
      case "document_view":
        return "📄";
      case "history":
        return "🕐";
      default:
        return "▸";
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-bm-border/70">
        <p className="text-xs text-bm-muted2 uppercase tracking-[0.16em]">
          {isFinance ? "Lifecycle" : "Capabilities"}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isFinance ? (
          <>
            <div className="space-y-1 mb-2">
              {FINANCE_LIFECYCLE_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                      isActive
                        ? "bg-bm-accent/10 text-bm-text border-bm-accent/25 shadow-bm-glow"
                        : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70 active:bg-bm-surface2/60"
                    }`}
                  >
                    <span className="text-xs">▸</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="pt-2 mt-2 border-t border-bm-border/60">
              <p className="px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
                Embedded Modules
              </p>
              {FINANCE_MODULE_LINKS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={`${item.section}-${item.href}`}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                      isActive
                        ? "bg-bm-accent/10 text-bm-text border-bm-accent/25 shadow-bm-glow"
                        : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70 active:bg-bm-surface2/60"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">{item.section}</span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {loadingCapabilities && (
              <>
                <div className="h-8 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse mb-1" />
                <div className="h-8 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse mb-1" />
                <div className="h-8 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse mb-1" />
              </>
            )}
            {!loadingCapabilities && capabilities.length === 0 && activeDeptKey && (
              <p className="text-sm text-bm-muted2 p-2">No capabilities enabled.</p>
            )}
            {!activeDeptKey && (
              <p className="text-sm text-bm-muted2 p-2">Select a department above.</p>
            )}
            {capabilities.map((cap) => {
              const isActive = activeCapKey === cap.key;
              return (
                <Link
                  key={cap.key}
                  href={`/app/${activeDeptKey}/capability/${cap.key}`}
                  onClick={onClose}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                    isActive
                      ? "bg-bm-accent/10 text-bm-text border-bm-accent/25 shadow-bm-glow"
                      : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70 active:bg-bm-surface2/60"
                  }`}
                >
                  <span className="text-xs">{kindIcon(cap.kind)}</span>
                  <span>{cap.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-bm-border/70">
        <Link
          href="/documents"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">📁</span>
          <span>All Documents</span>
        </Link>
        <Link
          href="/app/reports"
          onClick={onClose}
          data-testid="report-nav-link"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">📊</span>
          <span>Reports</span>
        </Link>
        <Link
          href="/app/dashboards"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">🧭</span>
          <span>Dashboards</span>
        </Link>
        <Link
          href="/app/crm"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">🤝</span>
          <span>CRM</span>
        </Link>
        <Link
          href="/app/real-estate"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">🏢</span>
          <span>Real Estate</span>
        </Link>
        <Link
          href="/app/compliance"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">🛡️</span>
          <span>Compliance</span>
        </Link>
        <Link
          href="/onboarding"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text transition border border-transparent hover:border-bm-border/70"
        >
          <span className="text-xs">⚙</span>
          <span>Setup</span>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex w-56 border-r border-bm-border/70 bg-bm-bg/40 backdrop-blur-md flex-col flex-shrink-0">
        {sidebarContent}
      </aside>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-bm-bg/60 backdrop-blur-md border-r border-bm-border/70 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-bm-border/70">
          <span className="text-sm font-semibold font-display">Business OS</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bm-surface/50 transition-colors"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
}
