"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Clock3,
  FileText,
  X,
  type LucideIcon,
} from "lucide-react";
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
  { section: "Asset Mgmt", label: "Capital Projects", href: "/app/capital-projects" },
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

  const kindIcon = (kind: string): LucideIcon => {
    switch (kind) {
      case "document_view":
        return FileText;
      case "history":
        return Clock3;
      default:
        return ChevronRight;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="border-b border-bm-border/20 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
          {isFinance ? "Lifecycle" : "Capabilities"}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {isFinance ? (
          <>
            <div className="space-y-0.5">
              {FINANCE_LIFECYCLE_NAV.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2 border-l-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-100 ${
                      isActive
                        ? "border-l-bm-accent bg-bm-surface/20 text-bm-text"
                        : "border-l-transparent text-bm-muted hover:bg-bm-surface/15 hover:text-bm-text"
                    }`}
                  >
                    <ChevronRight className="h-4 w-4 shrink-0 text-bm-muted/60" strokeWidth={1.5} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 border-t border-bm-border/20 pt-4">
              <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">
                Embedded Modules
              </p>
              {FINANCE_MODULE_LINKS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={`${item.section}-${item.href}`}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center justify-between gap-2 border-l-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-100 ${
                      isActive
                        ? "border-l-bm-accent bg-bm-surface/20 text-bm-text"
                        : "border-l-transparent text-bm-muted hover:bg-bm-surface/15 hover:text-bm-text"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                      {item.section}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {loadingCapabilities && (
              <>
                <div className="mb-1 h-8 rounded bg-bm-surface/30" />
                <div className="mb-1 h-8 rounded bg-bm-surface/30" />
                <div className="mb-1 h-8 rounded bg-bm-surface/30" />
              </>
            )}
            {!loadingCapabilities && capabilities.length === 0 && activeDeptKey && (
              <p className="px-3 py-2 text-sm text-bm-muted2">No capabilities enabled.</p>
            )}
            {!activeDeptKey && (
              <p className="px-3 py-2 text-sm text-bm-muted2">Select a department above.</p>
            )}
            {capabilities.map((cap) => {
              const isActive = activeCapKey === cap.key;
              const Icon = kindIcon(cap.kind);
              return (
                <Link
                  key={cap.key}
                  href={`/app/${activeDeptKey}/capability/${cap.key}`}
                  onClick={onClose}
                  className={`flex items-center gap-2 border-l-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-100 ${
                    isActive
                      ? "border-l-bm-accent bg-bm-surface/20 text-bm-text"
                      : "border-l-transparent text-bm-muted hover:bg-bm-surface/15 hover:text-bm-text"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-bm-muted/60" strokeWidth={1.5} />
                  <span>{cap.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden w-56 flex-shrink-0 flex-col border-r border-bm-border/20 bg-bm-bg lg:flex">
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
        className={`fixed left-0 top-0 z-50 h-full w-60 border-r border-bm-border/20 bg-bm-bg/95 backdrop-blur-sm transition-transform duration-150 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-bm-border/20 p-3">
          <span className="font-display text-sm font-semibold text-bm-text">Winston</span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
}
