"use client";

import Link from "next/link";
import { useBusinessContext } from "@/lib/business-context";
import ThemeToggle from "@/components/ThemeToggle";

const ICON_MAP: Record<string, string> = {
  "dollar-sign": "$",
  settings: "⚙",
  users: "👤",
  "trending-up": "📈",
  shield: "🛡",
  cpu: "💻",
  megaphone: "📣",
  folder: "📁",
};

export default function TopBar({
  activeDeptKey,
  onHamburgerClick,
}: {
  activeDeptKey: string | null;
  onHamburgerClick: () => void;
}) {
  const { departments, loadingDepartments } = useBusinessContext();

  return (
    <header className="sticky top-0 z-30 border-b border-bm-border/70 bg-bm-surface/95 backdrop-blur-sm shadow-[0_10px_18px_-18px_rgba(4,8,12,0.72)]">
      <div className="flex items-center h-12 px-2 sm:px-4">
        {/* Mobile hamburger */}
        <button
          onClick={onHamburgerClick}
          className="lg:hidden flex-shrink-0 p-2 mr-1 rounded-md hover:brightness-105 hover:bg-bm-surface/50"
          aria-label="Open sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Brand */}
        <Link href="/app" className="flex-shrink-0 text-sm font-medium mr-3 hidden sm:block">
          Business OS
        </Link>

        {/* Departments - horizontal scrollable */}
        <nav className="flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1 min-w-max px-1">
            {loadingDepartments && (
              <>
                <div className="h-8 w-20 bg-bm-surface/60 border border-bm-border/60 rounded-md" />
                <div className="h-8 w-24 bg-bm-surface/60 border border-bm-border/60 rounded-md" />
                <div className="h-8 w-20 bg-bm-surface/60 border border-bm-border/60 rounded-md" />
              </>
            )}
            {departments.map((dept) => {
              const isActive = activeDeptKey === dept.key;
              const icon = ICON_MAP[dept.icon] || "📁";
              return (
                <Link
                  key={dept.key}
                  href={`/app/${dept.key}`}
                  data-testid={`dept-tab-${dept.key}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-[filter,box-shadow] duration-150 flex-shrink-0 border ${
                    isActive
                      ? "bg-bm-accent/10 text-bm-text border-bm-accent/35 shadow-bm-glow font-medium"
                      : "text-bm-muted border-transparent hover:brightness-105 hover:bg-bm-surface/50 hover:border-bm-border/70"
                  }`}
                >
                  <span>{icon}</span>
                  <span>{dept.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Global links */}
        <div className="flex-shrink-0 flex items-center gap-1 ml-2">
          <ThemeToggle />
          <Link
            href="/documents"
            className="text-xs text-bm-muted hover:text-bm-text px-2 py-1.5 rounded-md hover:brightness-105 hover:bg-bm-surface/50 hidden sm:block"
          >
            Docs
          </Link>
        </div>
      </div>
    </header>
  );
}
