"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TelemetrySidebar from "./TelemetrySidebar";
import TelemetryBottomNav from "./TelemetryBottomNav";
import { C } from "./primitives";
import { telemetrySectionLabel } from "./telemetryNav";

const COLLAPSE_KEY = "telemetry.sidebar.collapsed";

// Option B "Lab Workbench" shell. Desktop: a single rail (TEL ANOMALY / WORKBENCH identity, grouped
// sections, serving + auth status pinned at the bottom) that collapses to a 64px icon rail, and a
// full-bleed main column. Mobile: sticky top header (identity + current section + hamburger), a
// slide-over drawer reusing the rail (always expanded), and a bottom tab bar with the primary sections.
// No executive chrome (the lab shell yields full-bleed for /telemetry).
export default function TelemetryShell({ envId, children }: { envId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop rail collapse. Default expanded so SSR/first paint is deterministic; hydrate the stored
  // preference after mount to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    try { if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true); } catch { /* no-op */ }
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* no-op */ }
    return next;
  });

  // Lock body scroll while the drawer is open (same pattern as ConsultingWorkspaceShell).
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const LOGO = "/telemetry/backdrops/nodes/relativity-logo.svg";
  // Collapsed: icon mark (dots/bowtie symbol), not the wordmark.
  const BrandMark = (
    <div role="img" aria-label="Relativity Space"
      style={{ width: 28, height: 28, flexShrink: 0,
        backgroundImage: "url('/telemetry/relativityspace.png')",
        backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat",
        filter: "invert(1) brightness(0.85)" }} />
  );

  const Brand = (
    <div aria-label="Relativity Space" role="img"
      style={{ height: 17, width: 79, flexShrink: 0, backgroundImage: `url('${LOGO}')`,
        backgroundSize: "contain", backgroundPosition: "left center", backgroundRepeat: "no-repeat" }} />
  );

  // Rail body — parametrized by collapse so the desktop rail can shrink to icons while the mobile drawer
  // always renders the full expanded rail.
  const renderRail = (railCollapsed: boolean, showToggle: boolean) => (
    <aside style={{ width: railCollapsed ? 64 : 224, flexShrink: 0, background: C.rail,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      padding: railCollapsed ? "20px 8px" : "20px 14px", height: "100%",
      overflow: "hidden", transition: "width 200ms ease" }}>
      <div style={{ padding: railCollapsed ? "0 0 18px" : "0 6px 18px",
        display: "flex", justifyContent: railCollapsed ? "center" : "flex-start" }}>
        {railCollapsed ? BrandMark : Brand}
      </div>
      {/* Nav scrolls within the rail so the footer + collapse toggle stay docked at the bottom. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", margin: "0 -4px", padding: "0 4px" }}>
        <TelemetrySidebar envId={envId} collapsed={railCollapsed}
          onNavigate={() => setDrawerOpen(false)}
          onExpandRequest={() => setCollapsed(false)} />
      </div>
      {/* Footer = the icon-only collapse toggle, docked at the bottom. No "serving · prod" status dot
          or "Collapse" label (both removed — they nudged the toggle below the fold); the accessible
          name lives on aria-label. Only rendered for the desktop rail (the mobile drawer needs none). */}
      {showToggle && (
        <div style={{ paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={toggleCollapsed}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={railCollapsed}
            style={{ width: railCollapsed ? 40 : "100%", marginLeft: railCollapsed ? "auto" : 0,
              marginRight: railCollapsed ? "auto" : 0, display: "flex", alignItems: "center",
              justifyContent: "center", height: 36, borderRadius: 8, cursor: "pointer",
              background: "transparent", border: `1px solid ${C.border}`, color: C.dim }}>
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{railCollapsed ? "›" : "‹"}</span>
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>
      {/* Desktop rail is docked to the viewport (sticky, full height) so the footer + collapse toggle
          are always reachable at the bottom without scrolling the page. */}
      <div className="hidden lg:flex" style={{ position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
        {renderRail(collapsed, true)}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* mobile top header — display lives in classes so lg:hidden can win */}
        <header className="flex lg:hidden sticky top-0 z-30 items-center justify-between gap-2.5"
          style={{ padding: "8px 8px 8px 16px", background: C.rail, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {Brand}
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              textTransform: "uppercase", borderLeft: `1px solid ${C.border}`, paddingLeft: 12,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {telemetrySectionLabel(pathname || "", envId)}
            </span>
          </div>
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 16 16">
              <path d="M2 4h12M2 8h12M2 12h12" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <main className="px-4 pt-5 pb-24 lg:px-7 lg:pt-6 lg:pb-10" style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      <TelemetryBottomNav envId={envId} onMore={() => setDrawerOpen(true)} />

      {drawerOpen && (
        <div className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <button type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", border: "none" }} />
          <div className="max-w-[88vw]"
            style={{ position: "absolute", left: 0, top: 0, height: "100%", overflowY: "auto", overflowX: "hidden", display: "flex" }}>
            {/* drawer always shows the full expanded rail (no collapse on mobile) */}
            {renderRail(false, false)}
          </div>
        </div>
      )}
    </div>
  );
}
