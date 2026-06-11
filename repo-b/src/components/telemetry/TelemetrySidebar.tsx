"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";

// 5 telemetry sections only (the sole navigation). Icons ported from the Option B reference.
const NAV: { slug: string; label: string; icon: string }[] = [
  { slug: "", label: "Overview", icon: "M2 9h3v5H2zM7 4h3v10H7zM12 7h3v7h-3z" },
  { slug: "stream", label: "Mission Control", icon: "M2 12c2-6 10-6 12 0M8 3v3M8 8l3 3" },
  { slug: "replay", label: "Replay", icon: "M4 3l9 6-9 6z" },
  { slug: "copilot", label: "Test Intelligence", icon: "M8 1l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" },
  { slug: "governance", label: "AI Governance", icon: "M8 1l6 2v4c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V3z" },
  { slug: "runs", label: "Test Runs", icon: "M2 4h13v2H2zM2 8h13v2H2zM2 12h9v2H2z" },
  { slug: "model-performance", label: "Model Performance", icon: "M2 13l4-5 3 2 5-7" },
  { slug: "registry", label: "Model Registry", icon: "M3 2h10v3H3zM3 7h10v3H3zM3 12h6v2H3z" },
  { slug: "factory", label: "Factory · NCR", icon: "M2 13V7l4 3V7l4 3V4h4v9z" },
  { slug: "monitoring", label: "Monitoring", icon: "M2 9h3l2-5 3 10 2-5h3" },
  { slug: "stargate", label: "Stargate Live", icon: "M8 1l6 3.5v7L8 15l-6-3.5v-7zM8 8l6-3.5M8 8L2 4.5M8 8v7" },
  { slug: "factory-ml", label: "Factory ML", icon: "M2 14V7l3-2 3 2 3-5 3 2v10zM5 14v-4M8 14V8M11 14V6" },
];

export default function TelemetrySidebar({ envId, onNavigate }: { envId: string; onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  const base = `/lab/env/${envId}/telemetry`;
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV.map((n) => {
        const href = n.slug ? `${base}/${n.slug}` : base;
        const active = n.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link key={n.slug || "overview"} href={href} onClick={onNavigate}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
              padding: "9px 10px", borderRadius: 7,
              color: active ? C.text : C.dim,
              background: active ? "rgba(63,177,232,0.10)" : "transparent",
              boxShadow: active ? `inset 2px 0 0 ${C.cyan}` : "none" }}>
            <svg width="15" height="15" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <path d={n.icon} stroke={active ? C.cyan : C.faint} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: C.mono, fontSize: 12 }}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
