"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-64 border-r border-slate-800 p-6 hidden lg:flex flex-col gap-6">
        <div>
          <p className="text-xs uppercase text-slate-500">Demo Lab</p>
          <p className="text-lg font-semibold">Workflow Ops</p>
        </div>
        <nav className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm ${
                pathname === item.href
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-xs text-slate-500">
          Safe, auditable AI workflow automation.
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Current Environment</p>
            <p className="text-sm font-semibold">
              {selectedEnv
                ? `${selectedEnv.client_name} · ${selectedEnv.industry}`
                : "No environment selected"}
            </p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-slate-300 border border-slate-700 px-3 py-1 rounded-lg hover:bg-slate-900"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 p-6 bg-slate-950">{children}</main>
      </div>
    </div>
  );
}
