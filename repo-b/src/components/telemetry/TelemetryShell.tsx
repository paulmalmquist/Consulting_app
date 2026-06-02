"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TelemetrySidebar from "./TelemetrySidebar";
import { C } from "./primitives";

// Option B "Lab Workbench" shell: a single 224px rail (TEL ANOMALY / WORKBENCH identity, the five
// telemetry sections, serving + auth status pinned at the bottom) and a full-bleed main column.
// No executive chrome (the lab shell yields full-bleed for /telemetry).
export default function TelemetryShell({ envId, children }: { envId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const Rail = (
    <aside style={{ width: 224, flexShrink: 0, background: C.rail, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", padding: "20px 14px", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 18px" }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.cyan}55`,
          background: "rgba(63,177,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 14 14">
            <path d="M1 10l3-4 2.5 2L9 4l4 6" stroke={C.cyan} strokeWidth="1.4" fill="none" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: C.text }}>TEL ANOMALY</div>
          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em" }}>WORKBENCH</div>
        </div>
      </div>
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

      {/* mobile menu button */}
      <button type="button" onClick={() => setDrawerOpen(true)}
        className="lg:hidden"
        style={{ position: "fixed", top: 12, left: 12, zIndex: 30, fontFamily: C.mono, fontSize: 12,
          color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px" }}>
        Menu
      </button>

      <main style={{ flex: 1, minWidth: 0, padding: "24px 28px 40px" }}>{children}</main>

      {drawerOpen && (
        <div className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <button type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", border: "none" }} />
          <div style={{ position: "absolute", left: 0, top: 0 }}>{Rail}</div>
        </div>
      )}
    </div>
  );
}
