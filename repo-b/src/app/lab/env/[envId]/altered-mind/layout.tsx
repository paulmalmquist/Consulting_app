"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function AlteredMindNav({ base }: { base: string }) {
  const pathname = usePathname();
  const nav = [
    { href: base, label: "Dashboard" },
    { href: `${base}/trends`, label: "Trends" },
  ];
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {nav.map(({ href, label }) => {
        const active = href === base ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded px-2 py-1.5 transition-colors ${
              active
                ? "bg-white/8 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AlteredMindLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { envId: string };
}) {
  const base = `/lab/env/${params.envId}/altered-mind`;
  return (
    <div className="flex min-h-screen bg-[rgb(var(--nv-bg,11_14_18))] text-[rgb(var(--nv-text-primary,232_236_242))]">
      <aside className="w-56 shrink-0 border-r border-white/5 px-4 py-6">
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Altered Mind</p>
          <p className="mt-1 text-sm text-white/80">Practice tracker</p>
        </div>
        <AlteredMindNav base={base} />
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
