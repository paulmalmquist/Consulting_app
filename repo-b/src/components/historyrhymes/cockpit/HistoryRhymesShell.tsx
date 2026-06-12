"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchStreamHealth, type StreamHealth } from "@/lib/historyrhymes/client";
import HistoryRhymesNav from "./HistoryRhymesNav";
import { StreamHealthChip } from "./StreamHealthChip";
import { C } from "./primitives";
import { hrSectionLabel } from "./hrNav";

const HEALTH_POLL_MS = 30_000;

// History Rhymes "Regime Cockpit" shell, copy-adapted from TelemetryShell.
// Desktop: a single 224px rail (HISTORY RHYMES / REGIME COCKPIT identity, nav,
// stream-health slot pinned at the bottom) and a full-bleed main column.
// Mobile: sticky top header (identity + current section + hamburger) and a
// slide-over drawer reusing the rail. The lab shell yields full-bleed for
// /historyrhymes (isDomainRoute), so no theme pinning is needed here.
export default function HistoryRhymesShell({ envId, children }: { envId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [health, setHealth] = useState<StreamHealth | null>(null);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Stream health: fetch at mount, then poll. null (fetch failed) renders as
  // an explicit "unreachable" chip — never a silently absent indicator.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const h = await fetchStreamHealth();
      if (!cancelled) setHealth(h);
    };
    poll();
    const id = setInterval(poll, HEALTH_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const Brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.accent}55`,
        background: "rgba(212,168,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 14 14">
          {/* Overlapping echo waves — history rhyming, not repeating. */}
          <path d="M1 10c2-5 4-5 6 0M7 10c2-5 4-5 6 0" stroke={C.accent} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: C.text }}>HISTORY RHYMES</div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em" }}>REGIME COCKPIT</div>
      </div>
    </div>
  );

  const Rail = (
    <aside style={{ width: 224, flexShrink: 0, background: C.rail, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", padding: "20px 14px", minHeight: "100%" }}>
      <div style={{ padding: "0 6px 18px" }}>{Brand}</div>
      <HistoryRhymesNav envId={envId} onNavigate={() => setDrawerOpen(false)} />
      <div data-testid="hr-stream-slot" style={{ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <StreamHealthChip health={health} />
      </div>
    </aside>
  );

  return (
    <div data-testid="hr-shell" style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>
      <div className="hidden lg:flex">{Rail}</div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header className="flex lg:hidden sticky top-0 z-30 items-center justify-between gap-2.5"
          style={{ padding: "8px 8px 8px 16px", background: C.rail, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {Brand}
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              textTransform: "uppercase", borderLeft: `1px solid ${C.border}`, paddingLeft: 12,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {hrSectionLabel(pathname || "", envId)}
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

        <main className="px-4 pt-5 pb-12 lg:px-7 lg:pt-6 lg:pb-10" style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

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
