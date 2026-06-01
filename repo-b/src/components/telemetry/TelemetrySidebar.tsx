"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// 6 primary nav items (<= 7 rule). Replay first — it is the centerpiece.
const NAV = [
  { slug: "", label: "Overview" },
  { slug: "replay", label: "Replay" },
  { slug: "runs", label: "Test Runs" },
  { slug: "model-performance", label: "Model Performance" },
  { slug: "monitoring", label: "Monitoring" },
];

export default function TelemetrySidebar({
  envId,
  onNavigate,
}: {
  envId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const base = `/lab/env/${envId}/telemetry`;
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const href = item.slug ? `${base}/${item.slug}` : base;
        const active = item.slug ? pathname?.startsWith(href) : pathname === base;
        return (
          <Link
            key={item.slug || "overview"}
            href={href}
            onClick={onNavigate}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                // active = color fill + weight change, not just underline
                ? "bg-bm-accent/15 font-semibold text-bm-text"
                : "text-bm-muted hover:bg-bm-surface/50 hover:text-bm-text"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
