"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { getLabIndustryMeta } from "@/lib/lab-industries";
import {
  type LabRole,
  getStoredLabRole,
  setStoredLabRole,
} from "@/lib/lab/rbac";
import { logLabAuditEvent } from "@/lib/lab/clientAudit";
import {
  NavIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LogOutIcon,
} from "@/components/lab/LabIcons";

const navItems = [
  { id: "dashboard", href: "/lab", label: "Dashboard" },
  { id: "environments", href: "/lab/environments", label: "Environments" },
  { id: "uploads", href: "/lab/upload", label: "Uploads" },
  { id: "chat", href: "/lab/chat", label: "Chat" },
  { id: "queue", href: "/lab/queue", label: "Queue" },
  { id: "audit", href: "/lab/audit", label: "Audit" },
  { id: "metrics", href: "/lab/metrics", label: "Metrics" },
];

const COLLAPSED_STORAGE_KEY = "lab_nav_collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedEnv } = useEnv();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  });
  const [role, setRole] = useState<LabRole>(() => getStoredLabRole());
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const aiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";
  const rawItems =
    aiMode === "local"
      ? [...navItems, { id: "ai", href: "/lab/ai", label: "AI" }]
      : navItems;
  const items = rawItems.map((item) => {
    if (!selectedEnv) return item;
    if (item.id === "dashboard") {
      return { ...item, href: `/lab/env/${selectedEnv.env_id}` };
    }
    if (item.id === "metrics") {
      return {
        ...item,
        href: `/lab/env/${selectedEnv.env_id}/executive/capability/metrics`,
      };
    }
    return item;
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const industryMeta = getLabIndustryMeta(selectedEnv?.industry);
  const activeIndustry = industryMeta?.label || "General";
  const shortEnvId = selectedEnv?.env_id ? selectedEnv.env_id.slice(0, 8) : null;

  // Build a human-readable environment name
  const envName = selectedEnv
    ? selectedEnv.client_name || `${activeIndustry} Environment`
    : null;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredLabRole());
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const drawer = mobileDrawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!mobileNavOpen) return;
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const targets = drawer?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!targets || targets.length === 0) return;

      const first = targets[0];
      const last = targets[targets.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || active === first || !drawer?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !drawer?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      {/* ── Desktop sidebar ──────────────────────────────── */}
      <aside
        data-testid="lab-main-sidebar"
        {...(collapsed ? { "data-testid-collapsed": "lab-sidebar-collapsed" } : {})}
        className={cn(
          "border-r border-bm-border/70 hidden lg:flex flex-col bg-bm-bg/40 backdrop-blur-md transition-all duration-200",
          collapsed ? "w-[60px] p-3" : "w-64 p-6"
        )}
      >
        {/* Header + toggle */}
        <div className={cn("flex items-center", collapsed ? "justify-center mb-3" : "justify-between mb-6")}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs uppercase text-bm-muted2 tracking-[0.14em]">Demo Lab</p>
              <p className="text-lg font-semibold truncate">Workflow Ops</p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            data-testid="lab-sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex items-center justify-center rounded-lg border border-bm-border/70 bg-bm-surface/40 p-1.5 text-bm-muted hover:bg-bm-surface/60 hover:text-bm-text transition"
          >
            {collapsed ? <ChevronsRightIcon size={16} /> : <ChevronsLeftIcon size={16} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1.5 flex-1" data-testid="lab-nav">
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`lab-nav-link-${item.id}`}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "rounded-lg border text-sm transition flex items-center gap-2.5",
                  collapsed ? "justify-center p-2" : "px-3 py-2",
                  isActive
                    ? "bg-bm-accent/10 text-bm-text border-bm-accent/30 shadow-bm-glow"
                    : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
                )}
              >
                <NavIcon navKey={item.id} size={16} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={cn("mt-auto pt-4", collapsed && "text-center")}>
          {!collapsed && (
            <p className="text-xs text-bm-muted2 mb-3">
              Safe, auditable AI workflow automation.
            </p>
          )}
        </div>
      </aside>

      {/* ── Main content area ────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-bm-border/70 px-6 py-4 flex flex-wrap items-center justify-between gap-4 bg-bm-bg/35 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center rounded-lg border border-bm-border/70 bg-bm-surface/40 px-2.5 py-2 text-bm-text hover:bg-bm-surface/60 transition"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open lab navigation"
              aria-controls="lab-mobile-nav-drawer"
              aria-expanded={mobileNavOpen}
              data-testid="lab-mobile-nav-toggle"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 6H20M4 12H20M4 18H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div>
              <p className="text-xs uppercase text-bm-muted2 tracking-[0.14em]">
                Current Environment
              </p>
              {envName ? (
                <>
                  <p
                    className="text-sm font-semibold text-bm-text"
                    data-testid="current-env-name"
                  >
                    {envName}
                  </p>
                  <p
                    className="text-xs text-bm-muted"
                    data-testid="current-env-subtitle"
                  >
                    <span data-testid="active-env-indicator">
                      {activeIndustry}{shortEnvId ? ` · ${shortEnvId}` : ""}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-bm-text">
                  <span data-testid="active-env-indicator">
                    No environment selected
                  </span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={logout}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Logout
          </button>
          <label className="inline-flex items-center gap-2 text-xs text-bm-muted">
            Role
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value as LabRole;
                setRole(next);
                setStoredLabRole(next);
                logLabAuditEvent("role_changed", {
                  envId: selectedEnv?.env_id,
                  details: { role: next },
                });
              }}
              className="rounded-md border border-bm-border/70 bg-bm-surface/45 px-2 py-1 text-xs text-bm-text"
            >
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>

      {/* ── Mobile drawer ────────────────────────────────── */}
      {mobileNavOpen ? (
        <div className="lg:hidden fixed inset-0 z-40" aria-hidden={!mobileNavOpen}>
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close lab navigation"
          />
          <div
            id="lab-mobile-nav-drawer"
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Lab navigation"
            className="absolute left-0 top-0 h-full w-72 max-w-[88vw] border-r border-bm-border/70 bg-bm-bg/85 p-5 backdrop-blur-md shadow-bm-card"
            data-testid="lab-mobile-nav-drawer"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase text-bm-muted2 tracking-[0.14em]">Demo Lab</p>
                <p className="text-base font-semibold">Workflow Ops</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-bm-border/70 bg-bm-surface/40 px-2 py-1.5 text-sm text-bm-text hover:bg-bm-surface/60 transition"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close lab navigation"
              >
                Close
              </button>
            </div>

            <nav className="mt-4 flex flex-col gap-2" data-testid="lab-nav">
              {items.map((item) => (
                <Link
                  key={`${item.href}-mobile`}
                  href={item.href}
                  data-testid={`lab-nav-link-${item.id}`}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm border transition flex items-center gap-2.5",
                    pathname === item.href
                      ? "bg-bm-accent/10 text-bm-text border-bm-accent/30 shadow-bm-glow"
                      : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
                  )}
                >
                  <NavIcon navKey={item.id} size={16} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
