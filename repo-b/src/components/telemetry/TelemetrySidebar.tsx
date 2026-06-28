"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { C } from "./primitives";
import {
  TELEMETRY_NAV, TELEMETRY_NAV_GROUPS, TELEMETRY_NAV_GROUP_META,
  isTelemetryItemActive, telemetryHref,
  type TelemetryNavGroup, type TelemetryNavItem,
} from "./telemetryNav";

// Brand fluorescent purple (shared with the Overview thesis); the active-item glow blends
// the section accent into this purple.
const NV_PURPLE = "#B040FF";

// Group containing the active route (or null). Drives default-open + active highlighting.
function activeGroupFor(pathname: string, envId: string): TelemetryNavGroup | null {
  return TELEMETRY_NAV.find((n) => isTelemetryItemActive(pathname, envId, n.slug))?.group ?? null;
}

function NavIcon({ d, color, size = 15 }: { d: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flexShrink: 0 }} aria-hidden>
      <path d={d} stroke={color} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

// A routable row (a multi-item group's child, or a single-item group's leaf). Active rows get the
// glowing pill that blends the section accent into brand purple.
function NavLinkRow({ href, label, icon, accent, active, onNavigate, indented }: {
  href: string; label: string; icon: string; accent: string; active: boolean;
  onNavigate?: () => void; indented?: boolean;
}) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
        minHeight: 40, padding: "9px 10px", borderRadius: 8,
        color: active ? C.text : C.dim,
        background: active ? `linear-gradient(90deg, ${accent}26, ${NV_PURPLE}1f)` : "transparent",
        border: `1px solid ${active ? `${accent}66` : "transparent"}`,
        boxShadow: active ? `0 0 16px ${accent}33` : "none" }}>
      <NavIcon d={icon} color={active ? accent : `${accent}b3`} size={indented ? 14 : 15} />
      <span style={{ fontFamily: C.mono, fontSize: 12 }}>{label}</span>
      {active && <span aria-hidden style={{ marginLeft: "auto", color: accent, fontSize: 13, lineHeight: 1 }}>›</span>}
    </Link>
  );
}

// Grouped, collapsible navigation rail (Phase 9B). Each group is its own icon row; multi-item groups
// are accordions (one open by default); single-item groups are direct links. When `collapsed`, only the
// group icons render as an icon rail — clicking one asks the shell to expand and opens that group
// (never an immediate navigation). Rendered in the desktop rail and the mobile drawer (always expanded).
export default function TelemetrySidebar({ envId, onNavigate, collapsed = false, onExpandRequest }: {
  envId: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onExpandRequest?: (g: TelemetryNavGroup) => void;
}) {
  const pathname = usePathname() || "";
  const activeGroup = activeGroupFor(pathname, envId);
  const itemsOf = (g: TelemetryNavGroup): TelemetryNavItem[] => TELEMETRY_NAV.filter((n) => n.group === g);

  // One group is open by default (Operations) plus the group owning the active route.
  const [expanded, setExpanded] = useState<Set<TelemetryNavGroup>>(() => {
    const s = new Set<TelemetryNavGroup>(["Operations"]);
    if (activeGroup) s.add(activeGroup);
    return s;
  });
  // Keep the active group open as the route changes.
  useEffect(() => {
    if (!activeGroup) return;
    setExpanded((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  const openGroup = (g: TelemetryNavGroup) =>
    setExpanded((prev) => (prev.has(g) ? prev : new Set(prev).add(g)));
  const toggleGroup = (g: TelemetryNavGroup) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(g)) s.delete(g); else s.add(g);
      return s;
    });

  // Collapsed icon rail: only group icons, centered. Each is a button that expands the rail and opens
  // its group — no navigation on the first click, so the user can never jump routes while just opening
  // the sidebar during a demo.
  if (collapsed) {
    return (
      <nav aria-label="Telemetry sections" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {TELEMETRY_NAV_GROUPS.map((group) => {
          if (itemsOf(group).length === 0) return null;
          const meta = TELEMETRY_NAV_GROUP_META[group];
          const active = activeGroup === group;
          return (
            <button key={group} type="button" title={group}
              aria-label={`Expand sidebar and open ${group}`}
              onClick={() => { openGroup(group); onExpandRequest?.(group); }}
              style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 9, cursor: "pointer",
                background: active ? `${meta.accent}1f` : "transparent",
                border: `1px solid ${active ? `${meta.accent}66` : "transparent"}`,
                boxShadow: active ? `0 0 12px ${meta.accent}33` : "none" }}>
              {group === "Relativity MES Sandbox" ? (
                <Image src="/telemetry/relativityspace.png" alt="Relativity Space" width={22} height={22}
                  style={{ objectFit: "contain", filter: "invert(1) brightness(0.7)", opacity: active ? 1 : 0.55 }} />
              ) : (
                <NavIcon d={meta.icon} color={active ? meta.accent : `${meta.accent}b3`} size={16} />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  // Expanded rail: group rows with labels + collapsible children.
  return (
    <nav aria-label="Telemetry sections" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TELEMETRY_NAV_GROUPS.map((group) => {
        const items = itemsOf(group);
        if (items.length === 0) return null;
        const meta = TELEMETRY_NAV_GROUP_META[group];
        const accent = meta.accent;

        // Single-item group → a direct link labeled with the group name (the row is the nav target).
        if (items.length === 1) {
          const item = items[0];
          const active = isTelemetryItemActive(pathname, envId, item.slug);
          return (
            <div key={group} style={{ marginTop: 4 }}>
              <NavLinkRow href={telemetryHref(envId, item.slug)} label={group} icon={meta.icon}
                accent={accent} active={active} onNavigate={onNavigate} />
            </div>
          );
        }

        // Multi-item group → accordion.
        const open = expanded.has(group);
        const groupActive = activeGroup === group;
        return (
          <div key={group} style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            <button type="button" aria-expanded={open} onClick={() => toggleGroup(group)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                minHeight: 40, padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                background: groupActive && !open ? `${accent}14` : "transparent",
                border: `1px solid ${groupActive ? `${accent}40` : "transparent"}`, color: C.text }}>
              <NavIcon d={meta.icon} color={accent} size={16} />
              {group === "Relativity MES Sandbox" ? (
                <Image src="/telemetry/relativityspace.png" alt="Relativity Space" width={72} height={20}
                  style={{ objectFit: "contain", objectPosition: "left", filter: "invert(1) brightness(0.7)", opacity: open ? 1 : 0.6 }} />
              ) : (
                <span style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: "0.02em", color: open ? C.text : C.dim }}>{group}</span>
              )}
              <span aria-hidden style={{ marginLeft: "auto", color: accent, fontSize: 13, lineHeight: 1,
                transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}>›</span>
            </button>
            {open && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2,
                marginLeft: 18, paddingLeft: 10, borderLeft: `1px solid ${accent}2e` }}>
                {items.map((item) => (
                  <NavLinkRow key={item.slug || "overview"} href={telemetryHref(envId, item.slug)}
                    label={item.label} icon={item.icon} accent={accent} indented
                    active={isTelemetryItemActive(pathname, envId, item.slug)} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
