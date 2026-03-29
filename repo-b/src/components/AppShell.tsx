"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
};

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { environments, selectedEnv, selectEnv, isPlatformAdmin } = useEnv();
  const environmentOptions = environments || [];
  const isDomainRoute = /^\/lab\/env\/[^/]+\/(re|pds|credit|legal|medical|consulting|opportunity-engine)(\/|$)/.test(pathname);
  const isImmersiveRoute = /^\/lab\/env\/[^/]+\/markets(\/|$)/.test(pathname);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  const homeHref = useMemo(() => {
    return selectedEnv ? `/lab/env/${selectedEnv.env_id}` : "/app";
  }, [selectedEnv]);

  const workspaceItems = useMemo<NavItem[]>(() => [
    { id: "pipeline", href: "/lab/pipeline", label: "Pipeline", navKey: "pipeline" },
    { id: "chat", href: "/lab/chat", label: "Chat", navKey: "chat" },
    { id: "metrics", href: "/lab/metrics", label: "Metrics", navKey: "metrics" },
    { id: "uploads", href: "/lab/upload", label: "Uploads", navKey: "uploads" },
    { id: "ai", href: "/lab/ai", label: "AI", navKey: "ai" },
    { id: "market-intelligence", href: "/lab/market-intelligence", label: "Trading Lab", navKey: "market-intelligence" },
  ], []);

  const systemItems = useMemo<NavItem[]>(() => [
    { id: "control-tower", href: "/lab/system/control-tower", label: "Control Tower", navKey: "environments" },
    { id: "access", href: "/lab/system/access", label: "Access", navKey: "access" },
    { id: "audit", href: "/lab/audit", label: "Audit", navKey: "audit" },
    { id: "ai-audit", href: "/lab/ai-audit", label: "AI Audit", navKey: "ai-audit" },
  ], []);

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

  const handleEnvironmentClick = (envId: string) => {
    const target = environmentOptions.find((env) => env.env_id === envId);
    if (!target) return;
    selectEnv(envId);
    router.push(`/lab/env/${envId}`);
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

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
  };

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      <aside
        className={cn(
          "border-r border-bm-border/70 hidden lg:flex flex-col gap-4 bg-bm-bg transition-[width,padding] duration-[120ms] overflow-y-auto",
          collapsed ? "w-[84px] p-4" : "w-64 p-5"
        )}
      >
        {/* Header */}
        <div className={cn("flex items-start", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed ? (
            <div>
              <p className="bm-section-label">Winston</p>
              <p className="text-sm font-medium text-bm-text truncate max-w-[160px]">
                {selectedEnv?.client_name || "Select environment"}
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
          {/* Environments Section */}
          <div className="space-y-1.5">
            {!collapsed ? (
              <p className="bm-section-label px-2">Environments</p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {environmentOptions.map((env) => {
                const isActive = selectedEnv?.env_id === env.env_id;
                return (
                  <button
                    key={env.env_id}
                    type="button"
                    onClick={() => handleEnvironmentClick(env.env_id)}
                    title={collapsed ? env.client_name : undefined}
                    data-testid={`env-nav-${env.env_id}`}
                    className={cn(
                      "rounded-md text-sm font-normal border flex items-center text-left w-full",
                      collapsed ? "justify-center p-2.5" : "px-3 py-2 gap-2",
                      isActive
                        ? "text-bm-text font-medium border-transparent bg-bm-surface/30 border-l-2 border-l-bm-accent"
                        : "text-bm-muted border-transparent hover:bg-bm-surface/30 hover:text-bm-text"
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-md bg-bm-surface/50 text-[10px] font-mono uppercase shrink-0",
                      collapsed ? "h-6 w-6" : "h-5 w-5"
                    )}>
                      {env.client_name.slice(0, 2)}
                    </span>
                    {!collapsed ? (
                      <span className="truncate">{env.client_name}</span>
                    ) : null}
                  </button>
                );
              })}
              {environmentOptions.length === 0 && !collapsed ? (
                <p className="px-3 py-2 text-xs text-bm-muted2">No environments available</p>
              ) : null}
            </div>
          </div>

          {/* Workspace Section (visible when env selected) */}
          {selectedEnv ? (
            <div className="space-y-1.5">
              {!collapsed ? (
                <p className="bm-section-label px-2">Workspace</p>
              ) : null}
              <div className="flex flex-col gap-1">
                {workspaceItems.map(renderNavItem)}
              </div>
            </div>
          ) : null}

          {/* System Section (admin only) */}
          {isPlatformAdmin ? (
            <div className="space-y-1.5" data-testid="system-nav-section">
              {!collapsed ? (
                <p className="bm-section-label px-2">System</p>
              ) : null}
              <div className="flex flex-col gap-1">
                {systemItems.map(renderNavItem)}
              </div>
            </div>
          ) : null}
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
            {environmentOptions.length > 1 && selectedEnv ? (
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
