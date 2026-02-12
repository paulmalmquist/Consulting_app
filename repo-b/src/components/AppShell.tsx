"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/buttonVariants";

const navItems = [
  { href: "/lab", label: "Dashboard" },
  { href: "/lab/environments", label: "Environments" },
  { href: "/lab/upload", label: "Uploads" },
  { href: "/lab/chat", label: "Chat" },
  { href: "/lab/queue", label: "Queue" },
  { href: "/lab/audit", label: "Audit" },
  { href: "/lab/metrics", label: "Metrics" }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedEnv } = useEnv();
  const aiMode = process.env.NEXT_PUBLIC_AI_MODE || "off";
  const items = aiMode === "local" ? [...navItems, { href: "/lab/ai", label: "AI" }] : navItems;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex">
      <aside className="w-64 border-r border-bm-border/70 p-6 hidden lg:flex flex-col gap-6 bg-bm-bg/40 backdrop-blur-md">
        <div>
          <p className="text-xs uppercase text-bm-muted2 tracking-[0.18em]">Demo Lab</p>
          <p className="text-lg font-semibold font-display">Workflow Ops</p>
        </div>
        <nav className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
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
          <div>
            <p className="text-xs uppercase text-bm-muted2 tracking-[0.16em]">
              Current Environment
            </p>
            <p className="text-sm font-semibold">
              {selectedEnv
                ? `${selectedEnv.client_name} · ${selectedEnv.industry}`
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
