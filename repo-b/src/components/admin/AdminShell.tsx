"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, FileText, Settings, type LucideIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";

const NAV_ITEMS: ReadonlyArray<{ id: string; href: string; label: string; icon: LucideIcon }> = [
  { id: "environments", href: "/admin", label: "Environments", icon: Globe },
  { id: "audit", href: "/lab/audit", label: "Audit Log", icon: FileText },
];

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
          <p className="flex items-center gap-1.5 font-display text-lg font-semibold text-bm-text">
            <Settings className="h-4 w-4 text-bm-muted" strokeWidth={1.5} />
            Admin
          </p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 border-l-2 px-3 py-1.5 text-[13px] font-medium transition-colors duration-100",
                  isActive
                    ? "border-l-bm-accent bg-bm-surface/20 text-bm-text"
                    : "border-l-transparent text-bm-muted hover:bg-bm-surface/15 hover:text-bm-text"
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
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
        <main className="flex-1 bg-[radial-gradient(circle,hsl(var(--bm-border)/0.06)_1px,transparent_1px)] bg-[size:20px_20px] p-4 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
