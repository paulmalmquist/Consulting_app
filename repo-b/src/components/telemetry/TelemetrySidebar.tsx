"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";
import { TELEMETRY_NAV, TELEMETRY_NAV_GROUPS, isTelemetryItemActive, telemetryHref } from "./telemetryNav";

// Grouped navigation rail. Rendered in the desktop rail and inside the mobile
// drawer (TelemetryShell), so item height stays >=40px for touch.
export default function TelemetrySidebar({ envId, onNavigate }: { envId: string; onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TELEMETRY_NAV_GROUPS.map((group, gi) => (
        <div key={group} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.16em", color: C.faint,
            textTransform: "uppercase", padding: gi === 0 ? "2px 10px 4px" : "14px 10px 4px" }}>
            {group}
          </div>
          {TELEMETRY_NAV.filter((n) => n.group === group).map((n) => {
            const active = isTelemetryItemActive(pathname, envId, n.slug);
            return (
              <Link key={n.slug || "overview"} href={telemetryHref(envId, n.slug)} onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
                  minHeight: 40, padding: "9px 10px", borderRadius: 7,
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
        </div>
      ))}
    </nav>
  );
}
