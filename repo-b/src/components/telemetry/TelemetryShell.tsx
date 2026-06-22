"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TelemetrySidebar from "./TelemetrySidebar";
import TelemetryBottomNav from "./TelemetryBottomNav";
import { C } from "./primitives";
import { telemetrySectionLabel } from "./telemetryNav";

// Option B "Lab Workbench" shell. Desktop: a single 224px rail (TEL ANOMALY / WORKBENCH
// identity, grouped sections, serving + auth status pinned at the bottom) and a full-bleed
// main column. Mobile: sticky top header (identity + current section + hamburger), a
// slide-over drawer reusing the rail, and a bottom tab bar with the four primary sections.
// No executive chrome (the lab shell yields full-bleed for /telemetry).
export default function TelemetryShell({ envId, children }: { envId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open (same pattern as ConsultingWorkspaceShell).
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const Brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.cyan}55`,
        background: "rgba(63,177,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 14 14">
          <path d="M1 10l3-4 2.5 2L9 4l4 6" stroke={C.cyan} strokeWidth="1.4" fill="none" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: C.text }}>TEL ANOMALY</div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em" }}>WORKBENCH</div>
      </div>
    </div>
  );

  const Rail = (
    <aside style={{ width: 224, flexShrink: 0, background: C.rail, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", padding: "20px 14px", minHeight: "100%" }}>
      <div style={{ padding: "0 6px 18px" }}>{Brand}</div>
      <TelemetrySidebar envId={envId} onNavigate={() => setDrawerOpen(false)} />
      <div style={{ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>serving · prod</span>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>reviewer access · auth</div>
      </div>
    </aside>
  );

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>
      <div className="hidden lg:flex">{Rail}</div>

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
            {Rail}
          </div>
        </div>
      )}
    </div>
  );
}
