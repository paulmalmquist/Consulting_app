"use client";

/**
 * MobileBottomNav — Mobile-first bottom tab bar
 *
 * Five quick-access tabs:
 * Pipeline · Funds · Winston (center, elevated) · Investors · Reports
 *
 * Rendered by WinstonShell when mobileNavItems are provided.
 * Respects iOS safe-area-inset-bottom via env().
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  ClipboardCheck,
  Home,
  Landmark,
  Radar,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface MobileNavItem {
  href: string;
  label: string;
  icon:
    | "pipeline"
    | "funds"
    | "assets"
    | "investors"
    | "reports"
    | "winston"
    | "home"
    | "contacts"
    | "tasks"
    | "accounts"
    | "revenue"
    | "risk";
  /** Match sub-paths (prefix match) */
  matchPrefix?: boolean;
}

type LucideIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

const ICON_MAP: Record<MobileNavItem["icon"], LucideIcon> = {
  pipeline: Radar      as LucideIcon,
  funds:    Landmark   as LucideIcon,
  assets:   Building2  as LucideIcon,
  investors: Users     as LucideIcon,
  reports:  BarChart3  as LucideIcon,
  winston:  Landmark   as LucideIcon,
  home:     Home       as LucideIcon,
  contacts: Users      as LucideIcon,
  tasks:    ClipboardCheck as LucideIcon,
  accounts: Building2  as LucideIcon,
  revenue:  BriefcaseBusiness as LucideIcon,
  risk:     CircleAlert as LucideIcon,
};

/** Default REPE nav items — pass these from the shell consumer */
export const REPE_MOBILE_NAV_ITEMS = (base: string): MobileNavItem[] => [
  { href: `${base}/pipeline`,  label: "Pipeline",  icon: "pipeline",  matchPrefix: true },
  { href: base,                label: "Funds",     icon: "funds",     matchPrefix: false },
  { href: `${base.replace(/\/re$/, "")}/copilot`, label: "Winston", icon: "winston", matchPrefix: true },
  { href: `${base}/investors`, label: "Investors", icon: "investors", matchPrefix: true },
  { href: `${base}/reports`,   label: "Reports",   icon: "reports",   matchPrefix: true },
];

function isItemActive(pathname: string, item: MobileNavItem): boolean {
  if (item.matchPrefix === false) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileBottomNav({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 md:hidden",
        "bg-bm-bg/95 backdrop-blur-sm supports-[backdrop-filter]:bg-bm-bg/85",
        "border-t border-bm-border/[0.08]",
        /* iOS safe area */
        "pb-safe"
      )}
    >
      <ul
        className="flex items-end justify-around px-2 h-16"
        role="list"
      >
        {items.map((item) => {
          const active = isItemActive(pathname, item);
          const Icon = ICON_MAP[item.icon];

          return (
            <li key={item.href} className="flex-1 flex justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 w-full h-full",
                  "transition-colors duration-fast",
                  active
                    ? "text-bm-accent"
                    : "text-bm-muted hover:text-bm-text"
                )}
              >
                {/* Active indicator bar above icon */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-2 h-0.5 w-4 rounded-full transition-opacity duration-fast",
                    active ? "opacity-100 bg-bm-accent" : "opacity-0"
                  )}
                />
                <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                <span
                  className={cn(
                    "text-[10px] tracking-wide transition-all duration-fast",
                    active ? "font-semibold" : "font-normal opacity-70"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
