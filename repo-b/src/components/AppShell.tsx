"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { ChevronsLeftIcon, ChevronsRightIcon, NavIcon } from "@/components/lab/LabIcons";

const SIDEBAR_COLLAPSED_KEY = "lab_sidebar_collapsed";

type NavItem = {
  id: string;
  href: string;
  label: string;
  navKey: string;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedEnv } = useEnv();
  const aiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  const navItems = useMemo(() => {
    const homeHref = selectedEnv ? `/lab/env/${selectedEnv.env_id}` : "/lab/environments";
    const base: NavItem[] = [
      { id: "dashboard", href: homeHref, label: "Dashboard", navKey: "dashboard" },
      { id: "environments", href: "/lab/environments", label: "Environments", navKey: "environments" },
      { id: "pipeline", href: "/lab/pipeline", label: "Pipeline", navKey: "pipeline" },
      { id: "uploads", href: "/lab/upload", label: "Uploads", navKey: "uploads" },
      { id: "chat", href: "/lab/chat", label: "Chat", navKey: "chat" },
      { id: "audit", href: "/lab/audit", label: "Audit", navKey: "audit" },
      { id: "metrics", href: "/lab/metrics", label: "Metrics", navKey: "metrics" },
    ];
    return aiMode === "local"
      ? [...base, { id: "ai", href: "/lab/ai", label: "AI", navKey: "ai" }]
      : base;
  }, [selectedEnv, aiMode]);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      <aside
        className={cn(
          "border-r border-bm-border/70 hidden lg:flex flex-col gap-6 bg-bm-bg/40 backdrop-blur-md transition-all duration-200",
          collapsed ? "w-[84px] p-4" : "w-64 p-6"
        )}
      >
        <div className={cn("flex items-start", collapsed ? "justify-center" : "justify-between gap-2")}>
          {!collapsed ? (
            <div>
              <p className="text-xs uppercase text-bm-muted2 tracking-[0.18em]">Demo Lab</p>
              <p className="text-lg font-semibold font-display">Workflow Ops</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex items-center justify-center rounded-lg border border-bm-border/70 bg-bm-surface/40 p-1.5 text-bm-muted hover:bg-bm-surface/60 hover:text-bm-text"
            data-testid="lab-sidebar-toggle"
          >
            {collapsed ? <ChevronsRightIcon size={16} /> : <ChevronsLeftIcon size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-2" data-testid="lab-nav">
          {navItems.map((item) => {
            const isActive =
              item.id === "dashboard"
                ? pathname.startsWith("/lab/env/")
                : pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                data-testid={`lab-nav-link-${item.id}`}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "rounded-lg text-sm border transition flex items-center",
                  collapsed ? "justify-center p-2" : "px-3 py-2 gap-2",
                  isActive
                    ? "bg-bm-accent/10 text-bm-text border-bm-accent/30 shadow-bm-glow"
                    : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
                )}
              >
                <NavIcon navKey={item.navKey} size={15} />
                {!collapsed ? item.label : null}
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-auto text-xs text-bm-muted2", collapsed && "text-center")}> 
          {!collapsed ? "Safe, auditable AI workflow automation." : "AI"}
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-bm-border/70 px-6 py-4 flex flex-wrap items-center justify-between gap-4 bg-bm-bg/35 backdrop-blur-md">
          <div>
            <p className="text-xs uppercase text-bm-muted2 tracking-[0.16em]">
              Current Environment
            </p>
            <p className="text-sm font-semibold">
              {selectedEnv
                ? `${selectedEnv.client_name} · ${selectedEnv.industry_type || selectedEnv.industry}`
                : "No environment selected"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={logout}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
