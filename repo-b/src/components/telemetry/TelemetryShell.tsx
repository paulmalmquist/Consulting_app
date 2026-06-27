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

  // Brand mark: the Relativity Space wordmark (white-recolored SVG, reused from the node backdrops).
  // Shown alone in the collapsed icon rail. CSS background (not <img>) — no next/image lint, crisp sizing.
  const LOGO = "/telemetry/backdrops/nodes/relativity-logo.svg";
  const BrandMark = (
    <div role="img" aria-label="Relativity Space"
      style={{ width: 46, height: 10, flexShrink: 0, backgroundImage: `url('${LOGO}')`,
        backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
  );

  // "RelativitySpace" lockup: "Relativity" solid white, "Space" white-outlined with a transparent fill
  // (the backdrop shows through the letter interiors).
  const RelativitySpaceLabel = (
    <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 13.5, lineHeight: 1.05,
      letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
      <span style={{ color: "#ffffff" }}>Relativity</span>
      <span style={{ color: "transparent", WebkitTextStroke: "0.7px #ffffff" }}>Space</span>
    </div>
  );

  const Brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div aria-hidden style={{ height: 17, width: 79, flexShrink: 0, backgroundImage: `url('${LOGO}')`,
        backgroundSize: "contain", backgroundPosition: "left center", backgroundRepeat: "no-repeat" }} />
      <div>
        {RelativitySpaceLabel}
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em", marginTop: 2 }}>WORKBENCH</div>
      </div>
    </div>
  );

  // Rail body — parametrized by collapse so the desktop rail can shrink to icons while the mobile drawer
  // always renders the full expanded rail.
  const renderRail = (railCollapsed: boolean, showToggle: boolean) => (
    <aside style={{ width: railCollapsed ? 64 : 224, flexShrink: 0, background: C.rail,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      padding: railCollapsed ? "20px 8px" : "20px 14px", minHeight: "100%",
      overflow: "hidden", transition: "width 200ms ease" }}>
      <div style={{ padding: railCollapsed ? "0 0 18px" : "0 6px 18px",
        display: "flex", justifyContent: railCollapsed ? "center" : "flex-start" }}>
        {railCollapsed ? BrandMark : Brand}
      </div>
      <TelemetrySidebar envId={envId} collapsed={railCollapsed}
        onNavigate={() => setDrawerOpen(false)}
        onExpandRequest={() => setCollapsed(false)} />
      <div style={{ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        {railCollapsed ? (
          <div style={{ display: "flex", justifyContent: "center" }} title="serving · prod">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>serving · prod</span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>reviewer access · auth</div>
          </>
        )}
        {showToggle && (
          <button type="button" onClick={toggleCollapsed}
            aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={railCollapsed}
            style={{ marginTop: 14, width: railCollapsed ? 40 : "100%", marginLeft: railCollapsed ? "auto" : 0,
              marginRight: railCollapsed ? "auto" : 0, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, height: 36, borderRadius: 8, cursor: "pointer",
              background: "transparent", border: `1px solid ${C.border}`, color: C.dim, fontFamily: C.mono, fontSize: 12 }}>
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{railCollapsed ? "›" : "‹"}</span>
            {!railCollapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>
      <div className="hidden lg:flex">{renderRail(collapsed, true)}</div>

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
