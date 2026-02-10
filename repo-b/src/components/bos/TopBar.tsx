"use client";

import Link from "next/link";
import { useBusinessContext } from "@/lib/business-context";

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
    <header className="border-b border-bm-border/70 bg-bm-bg/35 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center h-12 px-2 sm:px-4">
        {/* Mobile hamburger */}
        <button
          onClick={onHamburgerClick}
          className="lg:hidden flex-shrink-0 p-2 mr-1 rounded-lg hover:bg-bm-surface/50 active:bg-bm-surface2/60 transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Brand */}
        <Link href="/app" className="flex-shrink-0 text-sm font-semibold font-display mr-3 hidden sm:block">
          Business OS
        </Link>

        {/* Departments - horizontal scrollable */}
        <nav className="flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1 min-w-max px-1">
            {loadingDepartments && (
              <>
                <div className="h-8 w-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
                <div className="h-8 w-24 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
                <div className="h-8 w-20 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
              </>
            )}
            {departments.map((dept) => {
              const isActive = activeDeptKey === dept.key;
              const icon = ICON_MAP[dept.icon] || "📁";
              return (
                <Link
                  key={dept.key}
                  href={`/app/${dept.key}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition flex-shrink-0 border ${
                    isActive
                      ? "bg-bm-accent/12 text-bm-text border-bm-accent/30 shadow-bm-glow"
                      : "text-bm-muted border-transparent hover:bg-bm-surface/50 hover:border-bm-border/70 active:bg-bm-surface2/60"
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
          <Link
            href="/documents"
            className="text-xs text-bm-muted hover:text-bm-text px-2 py-1.5 rounded hover:bg-bm-surface/50 transition-colors hidden sm:block"
          >
            Docs
          </Link>
        </div>
      </div>
    </header>
  );
}
