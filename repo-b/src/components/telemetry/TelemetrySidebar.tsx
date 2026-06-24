"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";
import {
  TELEMETRY_NAV, TELEMETRY_NAV_GROUPS, isTelemetryItemActive, telemetryHref,
  type TelemetryNavGroup,
} from "./telemetryNav";

// Brand fluorescent purple (shared with the Overview thesis); the active-item glow blends
// the section accent into this purple.
const NV_PURPLE = "#B040FF";

// Per-section accent — section labels and item icons take their group's color so the rail
// reads as a color-coded map. Purple/pink are from the cyberpunk accent token range.
const GROUP_ACCENT: Record<TelemetryNavGroup, string> = {
  Overview: C.cyan,
  Operations: C.cyan,
  "Models & Intelligence": "#a855f7",
  "Factory & Quality": C.amber,
  "Evidence & Lineage": C.green,
  "Agent Operations": "#f472b6",
};

// Grouped navigation rail. Rendered in the desktop rail and inside the mobile
// drawer (TelemetryShell), so item height stays >=40px for touch.
export default function TelemetrySidebar({ envId, onNavigate }: { envId: string; onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TELEMETRY_NAV_GROUPS.map((group, gi) => {
        const accent = GROUP_ACCENT[group];
        return (
        <div key={group} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.16em", color: accent,
            textTransform: "uppercase", padding: gi === 0 ? "2px 10px 4px" : "14px 10px 4px" }}>
            {group}
          </div>
          {TELEMETRY_NAV.filter((n) => n.group === group).map((n) => {
            const active = isTelemetryItemActive(pathname, envId, n.slug);
            return (
              <Link key={n.slug || "overview"} href={telemetryHref(envId, n.slug)} onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
                  minHeight: 40, padding: "9px 10px", borderRadius: 8,
                  color: active ? C.text : C.dim,
                  // Active item: a glowing pill that blends the section accent into brand purple,
                  // with a soft outer glow. Inactive items stay flat.
                  background: active ? `linear-gradient(90deg, ${accent}26, ${NV_PURPLE}1f)` : "transparent",
                  border: `1px solid ${active ? `${accent}66` : "transparent"}`,
                  boxShadow: active ? `0 0 16px ${accent}33` : "none" }}>
                <svg width="15" height="15" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                  <path d={n.icon} stroke={active ? accent : `${accent}b3`} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
                </svg>
                <span style={{ fontFamily: C.mono, fontSize: 12 }}>{n.label}</span>
                {active && (
                  <span aria-hidden style={{ marginLeft: "auto", color: accent, fontSize: 13, lineHeight: 1 }}>›</span>
                )}
              </Link>
            );
          })}
        </div>
        );
      })}
      {/* Cross-surface link: the ADE control room is its own portable package mounted in this env. */}
      <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: "0.16em", color: C.faint,
        textTransform: "uppercase", padding: "14px 10px 4px" }}>
        Platform
      </div>
      <Link href={`/lab/env/${envId}/automated-data-engineering`} onClick={onNavigate}
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
          minHeight: 40, padding: "9px 10px", borderRadius: 7, color: C.dim }}>
        <svg width="15" height="15" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
          <path d="M2 3h4v4H2zM10 9h4v4h-4zM6 5h4M8 5v4M8 11H6" stroke={C.faint} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
        </svg>
        <span style={{ fontFamily: C.mono, fontSize: 12 }}>Automated Data Engineering</span>
      </Link>
    </nav>
  );
}
