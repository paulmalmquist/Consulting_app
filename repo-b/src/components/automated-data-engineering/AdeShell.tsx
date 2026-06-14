"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";

// Portable control-room shell: a 224px left rail and a full-bleed main column,
// plus a mobile top header with a slide-over drawer reusing the rail. The lab
// shell yields full-bleed for /automated-data-engineering (isDomainRoute).
// Platform core — parameterized by envId, no environment branding.

type NavItem = { slug: string; label: string; icon: string };

const NAV: NavItem[] = [
  { slug: "", label: "Overview", icon: "M2 9h3v5H2zM7 4h3v10H7zM12 7h3v7h-3z" },
  { slug: "skills", label: "Skill Registry", icon: "M3 2h10v3H3zM3 7h10v3H3zM3 12h6v2H3z" },
  { slug: "workflows", label: "Workflow Registry", icon: "M3 3h3v3H3zM10 3h3v3h-3zM3 10h3v3H3zM10 10h3v3h-3zM6 4.5h4M11.5 6v4M6 11.5h4M4.5 6v4" },
  { slug: "connectors", label: "Connector Map", icon: "M3 3h4v4H3zM9 9h4v4H9zM7 5h2M5 7v2M11 7V5M9 11H7" },
  { slug: "runs", label: "Execution Receipts", icon: "M3 2h8l2 2v10H3zM5 6h6M5 9h6M5 12h4" },
  { slug: "playbooks", label: "Playbooks", icon: "M3 2h9v12H3zM3 2c1 1 1 11 0 12M6 5h4M6 8h4" },
];

function adeHref(envId: string, slug: string): string {
  const base = `/lab/env/${envId}/automated-data-engineering`;
  return slug ? `${base}/${slug}` : base;
}

function isActive(pathname: string, envId: string, slug: string): boolean {
  const base = `/lab/env/${envId}/automated-data-engineering`;
  if (!slug) return pathname === base;
  const href = `${base}/${slug}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionLabel(pathname: string, envId: string): string {
  const match = NAV.find((n) => n.slug && isActive(pathname, envId, n.slug));
  return match?.label ?? "Overview";
}

function NavList({ envId, pathname, onNavigate }: { envId: string; pathname: string; onNavigate?: () => void }) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV.map((n) => {
        const active = isActive(pathname, envId, n.slug);
        return (
          <Link key={n.slug || "overview"} href={adeHref(envId, n.slug)} onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
              minHeight: 40, padding: "9px 10px", borderRadius: 7,
              color: active ? C.text : C.dim,
              background: active ? "rgba(95,168,245,0.10)" : "transparent",
              boxShadow: active ? `inset 2px 0 0 ${C.accent}` : "none" }}>
            <svg width="15" height="15" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              <path d={n.icon} stroke={active ? C.accent : C.faint} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: C.mono, fontSize: 12 }}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdeShell({ envId, children }: { envId: string; children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const Brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.accent}55`,
        background: "rgba(95,168,245,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 14 14">
          <path d="M2 3h4v4H2zM8 7h4v4H8zM6 5h2M7 5v2" stroke={C.accent} strokeWidth="1.3" fill="none" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: C.text }}>AUTOMATED DATA</div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.faint, letterSpacing: "0.1em" }}>ENGINEERING</div>
      </div>
    </div>
  );

  const Rail = (
    <aside style={{ width: 224, flexShrink: 0, background: C.rail, borderRight: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", padding: "20px 14px", minHeight: "100%" }}>
      <div style={{ padding: "0 6px 18px" }}>{Brand}</div>
      <NavList envId={envId} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      <div style={{ marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>read-only surface</span>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>governed skill fabric</div>
      </div>
    </aside>
  );

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: C.sans, color: C.text }}>
      <div className="hidden lg:flex">{Rail}</div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header className="flex lg:hidden sticky top-0 z-30 items-center justify-between gap-2.5"
          style={{ padding: "8px 8px 8px 16px", background: C.rail, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {Brand}
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, letterSpacing: "0.08em",
              textTransform: "uppercase", borderLeft: `1px solid ${C.border}`, paddingLeft: 12,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {sectionLabel(pathname, envId)}
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

        <main className="px-4 pt-5 pb-10 lg:px-7 lg:pt-6" style={{ flex: 1, minWidth: 0 }}>{children}</main>
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
