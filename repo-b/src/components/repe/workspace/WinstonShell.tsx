"use client";

/**
 * WinstonShell — The One Layout System
 *
 * Three structural zones:
 *   Desktop (≥ 1280px):  | Sidebar 288px | Main (max 1320px, centered) | Context Rail 280px |
 *   Tablet  (768–1279px): | Compact icon rail | Main full-width | Rail as right sheet |
 *   Mobile  (< 768px):   | Main full-width | Bottom nav | Rail / Winston as bottom sheet |
 *
 * Usage:
 *   <WinstonShell
 *     sidebar={<MySidebarNav />}
 *     rail={<MyContextRail />}
 *     headerLabel="Meridian Capital"
 *     headerAction={<CreateFundButton />}
 *     mobileNavItems={navItems}
 *   >
 *     <PageContent />
 *   </WinstonShell>
 */

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { X, Menu, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { MobileBottomNav, type MobileNavItem } from "./MobileBottomNav";
import ThemeToggle from "@/components/ThemeToggle";

export interface WinstonShellProps {
  /** Nav list rendered in the left sidebar column */
  sidebar: React.ReactNode;
  /** Main workspace content */
  children: React.ReactNode;
  /** Right context rail — drives the "intelligence" column on desktop */
  rail?: React.ReactNode;
  /** Firm / environment name shown in mobile header */
  headerLabel?: string;
  /** Primary action slot in the mobile header (e.g. "+ Fund" button) */
  headerAction?: React.ReactNode;
  /** Collapsed icon-only navigation rail for tablet widths */
  tabletSidebar?: React.ReactNode;
  /** Items for the mobile bottom nav. If omitted, bottom nav is not rendered. */
  mobileNavItems?: MobileNavItem[];
  className?: string;
}

export function WinstonShell({
  sidebar,
  children,
  rail,
  headerLabel,
  headerAction,
  tabletSidebar,
  mobileNavItems,
  className,
}: WinstonShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const navDrawerId = useId();
  const railSheetId = useId();

  const hasRail = Boolean(rail);
  const hasTabletSidebar = Boolean(tabletSidebar);
  const hasMobileNav = Boolean(mobileNavItems?.length);

  useEffect(() => {
    setDrawerOpen(false);
    setRailOpen(false);
  }, [pathname]);

  return (
    <div className={cn("min-h-screen flex flex-col bg-bm-bg", className)}>

      {/* ─────────────────────────────────────────────────────────────────────
          MOBILE / TABLET HEADER  (hidden on xl+)
      ───────────────────────────────────────────────────────────────────── */}
      <header className="xl:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4
                         border-b border-bm-border/[0.08] bg-bm-bg/95 backdrop-blur-sm
                         supports-[backdrop-filter]:bg-bm-bg/80">
        {/* Hamburger — opens sidebar drawer */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls={navDrawerId}
          className="p-2 -ml-1 rounded text-bm-muted hover:text-bm-text
                     hover:bg-bm-surface/40 transition-colors duration-fast shrink-0"
        >
          <Menu size={20} />
        </button>

        {headerLabel && (
          <span className="font-display text-sm font-semibold tracking-tight truncate flex-1">
            {headerLabel}
          </span>
        )}

        {/* Right side: optional action + context rail toggle */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ThemeToggle />
          {headerAction}
          {hasRail && (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              aria-label="Open context panel"
              aria-expanded={railOpen}
              aria-controls={railSheetId}
              className="p-2 rounded text-bm-muted hover:text-bm-text
                         hover:bg-bm-surface/40 transition-colors duration-fast"
            >
              <SlidersHorizontal size={18} />
            </button>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          SIDEBAR DRAWER  (mobile / tablet overlay)
      ───────────────────────────────────────────────────────────────────── */}
      <div
        id={navDrawerId}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-0 z-50 xl:hidden",
          "transition-visibility duration-200",
          drawerOpen ? "visible" : "invisible pointer-events-none"
        )}
      >
        {/* Scrim */}
        <div
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <div
          className={cn(
            "absolute left-0 top-0 h-full w-72 max-w-[88vw] flex flex-col",
            "bg-bm-bg border-r border-bm-border/[0.08]",
            "shadow-[4px_0_32px_-8px_rgba(0,0,0,0.6)]",
            "transition-transform duration-200",
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between h-14 px-4
                          border-b border-bm-border/[0.08] shrink-0">
            {headerLabel && (
              <span className="text-sm font-semibold truncate">{headerLabel}</span>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="ml-auto p-1.5 rounded text-bm-muted hover:text-bm-text
                         hover:bg-bm-surface/40 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav content */}
          <div className="flex-1 overflow-y-auto p-3">
            {sidebar}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          CONTEXT RAIL SHEET  (mobile / tablet overlay, slides from right)
      ───────────────────────────────────────────────────────────────────── */}
      {hasRail && (
        <div
          id={railSheetId}
          role="dialog"
          aria-modal="true"
          aria-label="Context panel"
          className={cn(
            "fixed inset-0 z-50 xl:hidden",
            "transition-visibility duration-200",
            railOpen ? "visible" : "invisible pointer-events-none"
          )}
        >
          {/* Scrim */}
          <div
            className={cn(
              "absolute inset-0 bg-black/60 transition-opacity duration-200",
              railOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => setRailOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet panel */}
          <div
            className={cn(
              "absolute right-0 top-0 h-full w-80 flex flex-col",
              "bg-bm-bg border-l border-bm-border/[0.08]",
              "shadow-[-4px_0_32px_-8px_rgba(0,0,0,0.6)]",
              "transition-transform duration-200",
              railOpen ? "translate-x-0" : "translate-x-full"
            )}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between h-14 px-4
                            border-b border-bm-border/[0.08] shrink-0">
              <span className="text-sm font-semibold">Context</span>
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                aria-label="Close context panel"
                className="p-1.5 rounded text-bm-muted hover:text-bm-text
                           hover:bg-bm-surface/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Rail content */}
            <div className="flex-1 overflow-y-auto">
              {rail}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          THREE-COLUMN GRID  (desktop xl+)
          On mobile/tablet: single main column with top padding for header
      ───────────────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "mx-auto flex-1 w-full max-w-[2200px]",
          /* Tablet grid */
          "md:grid md:gap-6 md:px-6 md:py-6",
          hasTabletSidebar ? "md:grid-cols-[76px_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)]",
          /* Desktop grid */
          "xl:grid xl:gap-8 xl:px-8 xl:py-8",
          hasRail
            ? "xl:grid-cols-[288px_minmax(0,1fr)_280px]"
            : "xl:grid-cols-[288px_minmax(0,1fr)]",
          /* Mobile: padding-bottom for bottom nav */
          hasMobileNav && "pb-20 md:pb-0 xl:pb-0"
        )}
      >
        {/* ── Left compact rail — tablet only ── */}
        {hasTabletSidebar && (
          <aside className="hidden md:block xl:hidden min-w-0" aria-label="Compact sidebar navigation">
            <div className="sticky top-20">
              {tabletSidebar}
            </div>
          </aside>
        )}

        {/* ── Left sidebar — desktop only ── */}
        <aside className="hidden xl:block min-w-0" aria-label="Sidebar navigation">
          {/* Sticky within the grid column */}
          <div className="sticky top-8 space-y-6">
            <div className="flex justify-end px-1">
              <ThemeToggle />
            </div>
            {sidebar}
          </div>
        </aside>

        {/* ── Main workspace ── */}
        <main className="min-w-0 px-4 py-4 md:px-0 md:py-0 xl:px-0 xl:py-0 xl:max-w-[1320px] xl:mx-auto">
          {children}
        </main>

        {/* ── Right context rail — desktop only ── */}
        {hasRail && (
          <aside className="hidden xl:block min-w-0" aria-label="Context rail">
            <div className="sticky top-8">
              {rail}
            </div>
          </aside>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MOBILE BOTTOM NAV  (hidden xl+)
      ───────────────────────────────────────────────────────────────────── */}
      {hasMobileNav && mobileNavItems && (
        <MobileBottomNav items={mobileNavItems} />
      )}
    </div>
  );
}
