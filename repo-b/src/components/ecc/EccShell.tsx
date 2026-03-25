"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export default function EccShell({
  envId,
  children,
}: {
  envId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = [
    { label: "Queue", href: `/lab/env/${envId}/ecc` },
    { label: "Brief", href: `/lab/env/${envId}/ecc/brief` },
    { label: "Contacts", href: `/lab/env/${envId}/ecc/vips` },
    { label: "Admin", href: `/lab/env/${envId}/ecc/admin` },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.18),transparent_34%),radial-gradient(circle_at_top_left,rgba(14,116,144,0.16),transparent_38%),linear-gradient(180deg,rgba(6,11,18,1),rgba(8,15,24,1))] text-bm-text">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-24 pt-4 sm:px-6">
        <header className="sticky top-0 z-20 mb-4 rounded-2xl border border-bm-border/60 bg-bm-bg/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Executive Command Center</p>
              <p className="text-lg font-semibold tracking-[-0.02em]">Meridian Apex Holdings</p>
            </div>
            <Link
              href={`/lab/env/${envId}`}
              className="rounded-xl border border-bm-border/70 px-3 py-2 text-sm text-bm-text"
            >
              Back
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-bm-border/60 bg-bm-bg/92 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-2">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-2xl px-3 py-3 text-center text-sm font-medium",
                  active
                    ? "bg-bm-accent text-bm-accentContrast"
                    : "border border-bm-border/60 bg-bm-surface/20 text-bm-muted"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
