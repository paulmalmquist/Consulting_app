"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { id: "environments", href: "/admin", label: "Environments" },
  { id: "audit", href: "/lab/audit", label: "Audit Log" },
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      <aside className="hidden w-52 flex-col gap-4 border-r border-bm-border/20 bg-bm-bg p-4 lg:flex">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bm-muted2">Winston</p>
          <p className="font-display text-lg font-semibold text-bm-text">Admin</p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "border-l-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-100",
                  isActive
                    ? "border-l-bm-accent bg-bm-surface/20 text-bm-text"
                    : "border-l-transparent text-bm-muted hover:bg-bm-surface/15 hover:text-bm-text"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto text-xs text-bm-muted2">
          Admin view — no module access.
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-bm-border/20 bg-bm-bg/90 px-5 py-3 backdrop-blur-sm">
          <p className="font-display text-lg font-semibold text-bm-text">Control Tower</p>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-md border border-bm-border/40 px-3 py-1.5 text-sm text-bm-text transition-colors duration-100 hover:bg-bm-surface/20"
              data-testid="global-home-button"
            >
              Home
            </Link>
            <ThemeToggle />
            <button
              onClick={logout}
              className="rounded-md border border-bm-border/40 px-3 py-1.5 text-sm text-bm-text transition-colors duration-100 hover:bg-bm-surface/20"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
