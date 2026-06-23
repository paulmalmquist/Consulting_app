"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";
import { TELEMETRY_NAV, isTelemetryItemActive, telemetryHref } from "./telemetryNav";

// Mobile bottom tab bar: the four mobilePrimary sections plus a "More" button
// that opens the full drawer. Structure follows MobileBottomNav (fixed bottom,
// pb-safe, active indicator bar) but styled on the telemetry palette — the
// shared component is bound to bm-* tokens and a lucide icon union.
export default function TelemetryBottomNav({ envId, onMore }: { envId: string; onMore: () => void }) {
  const pathname = usePathname() || "";
  const tabs = TELEMETRY_NAV.filter((n) => n.mobilePrimary);
  const tabActive = (slug: string) => isTelemetryItemActive(pathname, envId, slug);
  const moreActive = !tabs.some((t) => tabActive(t.slug));

  const itemStyle = (active: boolean): React.CSSProperties => ({
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 4, flex: 1, minHeight: 56, textDecoration: "none",
    color: active ? C.cyan : C.dim, background: "transparent", border: "none", cursor: "pointer",
  });
  const indicator = (
    <span aria-hidden style={{ position: "absolute", top: 0, left: "25%", right: "25%", height: 2,
      borderRadius: 2, background: C.cyan }} />
  );
  const labelStyle: React.CSSProperties = { fontFamily: C.mono, fontSize: 9, letterSpacing: "0.06em" };

  return (
    // Display stays in classes (flex lg:hidden) — an inline display would override lg:hidden.
    <nav aria-label="Telemetry sections" className="flex lg:hidden pb-safe fixed bottom-0 inset-x-0 z-40"
      style={{ background: C.rail, borderTop: `1px solid ${C.border}` }}>
      {tabs.map((t) => {
        const active = tabActive(t.slug);
        const shortLabel =
          t.slug === "" ? "Overview" :
          t.slug === "stream" ? "Stream" :
          t.slug === "copilot" ? "Copilot" : t.label;
        return (
          <Link key={t.slug || "overview"} href={telemetryHref(envId, t.slug)}
            aria-current={active ? "page" : undefined} style={itemStyle(active)}>
            {active && indicator}
            <svg width="20" height="20" viewBox="0 0 16 16">
              <path d={t.icon} stroke={active ? C.cyan : C.faint} strokeWidth={active ? 1.5 : 1.3} fill="none" strokeLinejoin="round" />
            </svg>
            <span style={labelStyle}>{shortLabel}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMore} aria-label="All sections" style={itemStyle(moreActive)}>
        {moreActive && indicator}
        <svg width="20" height="20" viewBox="0 0 16 16">
          <path d="M3 8h.01M8 8h.01M13 8h.01" stroke={moreActive ? C.cyan : C.faint} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
        <span style={labelStyle}>More</span>
      </button>
    </nav>
  );
}
