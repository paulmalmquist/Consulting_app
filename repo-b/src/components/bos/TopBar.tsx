"use client";

import Link from "next/link";
import {
  Cpu,
  DollarSign,
  Folder,
  LayoutDashboard,
  Megaphone,
  Menu,
  Settings,
  Shield,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useBusinessContext } from "@/lib/business-context";
import ThemeToggle from "@/components/ThemeToggle";

const ICON_MAP: Record<string, LucideIcon> = {
  "dollar-sign": DollarSign,
  settings: Settings,
  users: Users,
  "trending-up": TrendingUp,
  shield: Shield,
  cpu: Cpu,
  megaphone: Megaphone,
  folder: Folder,
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
    <header className="sticky top-0 z-30 border-b border-bm-border/20 bg-bm-bg/95 backdrop-blur-sm">
      <div className="flex h-10 items-center px-2 sm:px-4">
        <button
          onClick={onHamburgerClick}
          className="mr-1 flex-shrink-0 rounded-md p-1.5 text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <Link
          href="/app"
          className="mr-3 hidden flex-shrink-0 font-display text-sm font-semibold text-bm-text sm:block"
        >
          Winston
        </Link>

        <nav className="flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex min-w-max items-center gap-1 px-1">
            {loadingDepartments && (
              <>
                <div className="h-7 w-20 rounded bg-bm-surface/40" />
                <div className="h-7 w-24 rounded bg-bm-surface/40" />
                <div className="h-7 w-20 rounded bg-bm-surface/40" />
              </>
            )}
            {departments.map((dept) => {
              const isActive = activeDeptKey === dept.key;
              const Icon = ICON_MAP[dept.icon] ?? LayoutDashboard;
              return (
                <Link
                  key={dept.key}
                  href={`/app/${dept.key}`}
                  data-testid={`dept-tab-${dept.key}`}
                  className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors duration-100 ${
                    isActive
                      ? "border-b-2 border-b-bm-accent bg-bm-surface/30 text-bm-text"
                      : "text-bm-muted hover:bg-bm-surface/20 hover:text-bm-text"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-bm-muted" strokeWidth={1.5} />
                  <span>{dept.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="ml-2 flex flex-shrink-0 items-center gap-1">
          <ThemeToggle />
          <Link
            href="/documents"
            className="hidden rounded px-2 py-1 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text sm:block"
          >
            Docs
          </Link>
        </div>
      </div>
    </header>
  );
}
