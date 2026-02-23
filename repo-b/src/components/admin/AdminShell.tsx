"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";

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
      <aside className="hidden lg:flex flex-col gap-6 w-64 p-6 border-r border-bm-border/70 bg-bm-bg/40 backdrop-blur-md">
        <div>
          <p className="text-xs uppercase text-bm-muted2 tracking-[0.18em]">Business OS</p>
          <p className="text-lg font-semibold font-display">Admin</p>
        </div>

        <nav className="flex flex-col gap-1.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "rounded-lg text-sm border px-3 py-2.5 transition",
                  isActive
                    ? "bg-bm-accent/18 text-bm-text border-bm-accent/70 shadow-bm-glow ring-1 ring-bm-accent/45"
                    : "text-bm-muted border-transparent hover:bg-bm-surface/40 hover:border-bm-border/70"
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
        <header className="border-b border-bm-border/70 px-6 py-4 flex items-center justify-between gap-4 bg-bm-bg/35 backdrop-blur-md">
          <p className="text-sm font-semibold">Environment Management</p>
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
