"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { ChevronsLeftIcon, ChevronsRightIcon, NavIcon } from "@/components/lab/LabIcons";
import { logoutPlatformSession, switchPlatformEnvironment } from "@/lib/platformSessionClient";

const SIDEBAR_COLLAPSED_KEY = "lab_sidebar_collapsed";

type NavItem = {
  id: string;
  href: string;
  label: string;
  navKey: string;
  group: "operations" | "intelligence" | "system";
};

export default function AppShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { environments, selectedEnv } = useEnv();
  const environmentOptions = environments || [];
  const isDomainRoute = /^\/lab\/env\/[^/]+\/(re|pds|credit|legal|medical|consulting|opportunity-engine)(\/|$)/.test(pathname);
  const isImmersiveRoute = /^\/lab\/env\/[^/]+\/markets(\/|$)/.test(pathname);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  const homeHref = useMemo(() => {
    if (isAdmin) return "/admin";
    return selectedEnv ? `/lab/env/${selectedEnv.env_id}` : "/lab/environments";
  }, [isAdmin, selectedEnv]);

  const navItems = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { id: "environments", href: "/lab/environments", label: "Environments", navKey: "environments", group: "operations" },
      { id: "pipeline", href: "/lab/pipeline", label: "Pipeline", navKey: "pipeline", group: "operations" },
      { id: "uploads", href: "/lab/upload", label: "Uploads", navKey: "uploads", group: "operations" },
      { id: "chat", href: "/lab/chat", label: "Chat", navKey: "chat", group: "intelligence" },
      { id: "metrics", href: "/lab/metrics", label: "Metrics", navKey: "metrics", group: "intelligence" },
      { id: "market-intelligence", href: "/lab/market-intelligence", label: "Trading Lab", navKey: "market-intelligence", group: "intelligence" },
      { id: "audit", href: "/lab/audit", label: "Audit", navKey: "audit", group: "system" },
      { id: "ai", href: "/lab/ai", label: "AI", navKey: "ai", group: "intelligence" },
      { id: "ai-audit", href: "/lab/ai-audit", label: "AI Audit", navKey: "ai-audit", group: "system" },
    ];
    return base;
  }, []);

  const groupedItems = useMemo(() => {
    const groups: Record<NavItem["group"], NavItem[]> = {
      operations: [],
      intelligence: [],
      system: [],
    };
    for (const item of navItems) groups[item.group].push(item);
    return groups;
  }, [navItems]);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const logout = async () => {
    await logoutPlatformSession();
  };

  const handleEnvironmentSwitch = async (nextEnvId: string) => {
    const target = environmentOptions.find((environment) => environment.env_id === nextEnvId);
    if (!target || target.env_id === selectedEnv?.env_id) return;
    await switchPlatformEnvironment({
      environmentSlug: target.slug || undefined,
      envId: target.slug ? undefined : target.env_id,
    });
  };

  if (isDomainRoute) {
    return (
      <div className="min-h-screen bg-bm-bg text-bm-text">
        <main className="p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      <aside
        className={cn(
          "border-r border-bm-border/70 hidden lg:flex flex-col gap-6 bg-bm-bg transition-[width,padding] duration-[120ms]",
          collapsed ? "w-[84px] p-4" : "w-64 p-6"
        )}
      >
        <div className={cn("flex items-start", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed ? (
            <div>
              <p className="bm-section-label">Winston</p>
              <p className="text-lg font-semibold tracking-[-0.01em]">
                {isAdmin ? "Admin" : selectedEnv?.client_name || "Environments"}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex items-center justify-center rounded-md border border-bm-border/70 bg-bm-surface/35 p-1.5 text-bm-muted hover:bg-bm-surface/60 hover:text-bm-text"
            data-testid="lab-sidebar-toggle"
          >
            {collapsed ? <ChevronsRightIcon size={16} /> : <ChevronsLeftIcon size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-4" data-testid="lab-nav">
          {([
            ["operations", "Operations"],
            ["intelligence", "Intelligence"],
            ["system", "System"],
          ] as const).map(([groupKey, groupLabel]) => (
            <div key={groupKey} className="space-y-2">
              {!collapsed ? (
                <p className="bm-section-label px-2">
                  {groupLabel}
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                {groupedItems[groupKey].map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      data-testid={`lab-nav-link-${item.id}`}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "rounded-md text-sm font-normal border flex items-center relative",
                        collapsed ? "justify-center p-2.5" : "px-3 py-2.5 gap-2",
                        isActive
                          ? "text-bm-text font-medium border-transparent bg-bm-surface/30 border-l-2 border-l-bm-accent"
                          : "text-bm-muted border-transparent hover:bg-bm-surface/30 hover:text-bm-text"
                      )}
                    >
                      <NavIcon navKey={item.navKey} size={15} />
                      {!collapsed ? item.label : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto text-xs text-bm-muted2", collapsed && "text-center")}> 
          {!collapsed ? "Winston" : "W"}
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="bm-command-bar border-b border-bm-border/70 px-6 py-4 flex flex-wrap items-center justify-between gap-4 bg-bm-surface/96 backdrop-blur-sm">
          <div className="space-y-1">
            <p className="bm-section-label">
              Current Environment
            </p>
            {isAdmin ? (
              <span className="inline-flex items-center rounded-md border border-bm-border/70 bg-bm-surface/90 px-2.5 py-1 text-[11px] font-mono tracking-[0.08em] text-bm-text">
                Admin session
              </span>
            ) : environmentOptions.length > 1 && selectedEnv ? (
              <select
                value={selectedEnv.env_id}
                onChange={(event) => void handleEnvironmentSwitch(event.target.value)}
                className="h-9 rounded-md border border-bm-border/70 bg-bm-surface/90 px-3 text-sm text-bm-text"
              >
                {environmentOptions.map((environment) => (
                  <option key={environment.env_id} value={environment.env_id}>
                    {environment.client_name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="inline-flex items-center rounded-md border border-bm-border/70 bg-bm-surface/90 px-2.5 py-1 text-[11px] font-mono tracking-[0.08em] text-bm-text">
                {selectedEnv
                  ? `${selectedEnv.client_name} · ${selectedEnv.industry_type}`
                  : "No environment selected"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={homeHref}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              data-testid="global-home-button"
            >
              Home
            </Link>
            <ThemeToggle />
            <button
              onClick={logout}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Logout
            </button>
          </div>
        </header>
        <main className={cn("flex-1", isImmersiveRoute ? "overflow-y-auto" : "p-6")}>{children}</main>
      </div>
    </div>
  );
}
