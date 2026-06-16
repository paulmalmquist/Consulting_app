"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "routine", label: "Routine" },
  { slug: "morning-book", label: "Morning Book" },
  { slug: "planning", label: "Planning" },
  { slug: "ml-algorithms", label: "ML Algorithm Lab" },
];

/** Minimal tab strip linking the History Rhymes sub-pages for an env. */
export function HrSubNav({ envId }: { envId: string }) {
  const pathname = usePathname() || "";
  const base = `/lab/env/${envId}/historyrhymes`;
  return (
    <nav className="flex flex-wrap gap-1 mb-4" aria-label="History Rhymes sections">
      {TABS.map((t) => {
        const href = `${base}/${t.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={t.slug}
            href={href}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              active
                ? "bg-sky-500/20 text-sky-200 border-sky-500/40"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
