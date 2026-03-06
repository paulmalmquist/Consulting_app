"use client";

/**
 * MobileBottomNav — Mobile-first bottom tab bar
 *
 * Five tabs: Funds · Deals · Winston (center, elevated) · Assets · Models
 * Winston gets a raised pill treatment — it's the primary action, not a peer nav item.
 *
 * Rendered by WinstonShell when mobileNavItems are provided.
 * Respects iOS safe-area-inset-bottom via env().
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  TrendingUp,
  Building2,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface MobileNavItem {
  href: string;
  label: string;
  icon: "funds" | "deals" | "assets" | "models" | "winston";
  /** Match sub-paths (prefix match) */
  matchPrefix?: boolean;
}

type LucideIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

const ICON_MAP: Record<MobileNavItem["icon"], LucideIcon> = {
  funds:   Landmark   as LucideIcon,
  deals:   TrendingUp as LucideIcon,
  assets:  Building2  as LucideIcon,
  models:  Layers     as LucideIcon,
  winston: Sparkles   as LucideIcon,
};

/** Default REPE nav items — pass these from the shell consumer */
export const REPE_MOBILE_NAV_ITEMS = (base: string): MobileNavItem[] => [
  { href: base,              label: "Funds",   icon: "funds",   matchPrefix: false },
  { href: `${base}/deals`,   label: "Deals",   icon: "deals",   matchPrefix: true },
  { href: `${base}/winston`, label: "Winston", icon: "winston", matchPrefix: true },
  { href: `${base}/assets`,  label: "Assets",  icon: "assets",  matchPrefix: true },
  { href: `${base}/models`,  label: "Models",  icon: "models",  matchPrefix: true },
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
        "xl:hidden fixed bottom-0 inset-x-0 z-40",
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
          const isWinston = item.icon === "winston";

          return (
            <li key={item.href} className="flex-1 flex justify-center">
              {isWinston ? (
                /* Winston — elevated pill in the center */
                <Link
                  href={item.href}
                  aria-label="Open Winston AI"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5",
                    /* Raised pill */
                    "relative -translate-y-3",
                    "w-14 h-14 rounded-full",
                    "shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)]",
                    "transition-all duration-fast",
                    active
                      ? "bg-bm-accent text-bm-accentContrast shadow-[0_4px_20px_-4px_hsl(var(--bm-accent)/0.6)]"
                      : "bg-bm-surface border border-bm-border/20 text-bm-muted hover:text-bm-text"
                  )}
                >
                  <Icon size={20} />
                  <span className="text-[9px] font-semibold tracking-wide">
                    {item.label}
                  </span>
                </Link>
              ) : (
                /* Standard tab */
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
                  {/* Active indicator dot above icon */}
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
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
