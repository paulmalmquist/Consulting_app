"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { getLabIndustryMeta } from "@/lib/lab-industries";

const navItems = [
  { id: "dashboard", href: "/lab", label: "Dashboard" },
  { id: "environments", href: "/lab/environments", label: "Environments" },
  { id: "uploads", href: "/lab/upload", label: "Uploads" },
  { id: "chat", href: "/lab/chat", label: "Chat" },
  { id: "queue", href: "/lab/queue", label: "Queue" },
  { id: "audit", href: "/lab/audit", label: "Audit" },
  { id: "metrics", href: "/lab/metrics", label: "Metrics" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedEnv } = useEnv();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const aiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";
  const items =
    aiMode === "local"
      ? [...navItems, { id: "ai", href: "/lab/ai", label: "AI" }]
      : navItems;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const activeIndustry =
    getLabIndustryMeta(selectedEnv?.industry)?.label || "General";
  const shortEnvId = selectedEnv?.env_id ? selectedEnv.env_id.slice(0, 8) : null;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;

    // Desktop nav is hidden on small screens, so we provide a mobile drawer with
    // keyboard trapping to keep navigation usable and testable in mobile viewports.
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
      <aside className="w-64 border-r border-bm-border/70 p-6 hidden lg:flex flex-col gap-6 bg-bm-bg/40 backdrop-blur-md">
        <div>
          <p className="text-xs uppercase text-bm-muted2 tracking-[0.14em]">Demo Lab</p>
          <p className="text-lg font-semibold">Workflow Ops</p>
        </div>
        <nav className="flex flex-col gap-2" data-testid="lab-nav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`lab-nav-link-${item.id}`}
              className={cn(
                "px-3 py-2 rounded-lg text-sm border transition",
                pathname === item.href
                  ? "bg-bm-accent/10 text-bm-text border-bm-accent/30 shadow-bm-glow"
                  : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-xs text-bm-muted2">
          Safe, auditable AI workflow automation.
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
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
              <p className="text-sm font-semibold text-bm-text">
                <span data-testid="active-env-indicator">
                {selectedEnv
                  ? `${activeIndustry}${shortEnvId ? ` · ${shortEnvId}` : ""}`
                  : "No environment selected"}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Logout
          </button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>

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
                    "px-3 py-2 rounded-lg text-sm border transition",
                    pathname === item.href
                      ? "bg-bm-accent/10 text-bm-text border-bm-accent/30 shadow-bm-glow"
                      : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
