"use client";

// ConsultingPageFrame — the shared shell for the dark Consulting Revenue OS
// pages (Pipeline / Contacts / Tasks). Before this, each page hand-rolled its
// own LeftSidebar + 52px header + grid, which drifted: different grid rows,
// height (100% vs 100dvh), and brand-cell sticky behavior. This frame fixes
// the chrome — brand cell, nav cell, the 52px header row, background, content
// scroll region — so all three pages share one vertical rhythm.
//
// Per-page content stays the page's own: `headerContent` fills the 52px top
// bar (a label, a search box, action buttons), `children` is the body, and an
// optional `rightRail` keeps Pipeline's collapsible rail without forcing the
// other pages into a 3-column grid.
//
// Accounting is intentionally NOT wrapped here — it lives on the separate
// /operator/* route tree (OperatorShell) and is its own command-desk surface.

import type { ReactNode } from "react";
import { LeftSidebar } from "@/components/operator/command-desk/layout/LeftSidebar";
import { consultingSidebarSections } from "@/app/lab/env/[envId]/operator/_sidebar";

export const CONSULTING_FRAME_BG = "#05070B";
export const CONSULTING_HEADER_HEIGHT = 52;

// Shared WINSTON brand mark for the sidebar brand cell. Exported so pages
// that keep a bespoke shell (Pipeline — it has a collapsible right rail and
// sticky-scroll board the generic frame intentionally doesn't model) still
// use the one brand mark and can't drift.
export const winstonBrand: ReactNode = (
  <span
    className="font-command"
    style={{
      fontSize: "1rem",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#ffffff",
      textShadow: "0 0 12px rgba(255,255,255,0.07)",
    }}
  >
    WINSTON
  </span>
);

// Shared mono label style for the header zone (e.g. the page name).
export const consultingHeaderLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
  fontSize: 12,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(220,230,240,0.72)",
};

export function ConsultingPageFrame({
  envId,
  activeKey,
  headerContent,
  rightRail,
  children,
}: {
  envId: string;
  /** Which consulting nav item is active: pipeline | accounting | contacts | tasks */
  activeKey: string;
  /** Content of the 52px top bar — page label, search, action buttons. */
  headerContent: ReactNode;
  /** Optional collapsible right rail (Pipeline). Omit for a 2-column layout. */
  rightRail?: ReactNode;
  /** Page body. */
  children: ReactNode;
}) {
  const sections = consultingSidebarSections(envId);
  const columns = rightRail
    ? "240px minmax(0, 1fr) auto"
    : "240px minmax(0, 1fr)";

  return (
    <div
      data-command-desk
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: `${CONSULTING_HEADER_HEIGHT}px minmax(0, 1fr)`,
        height: "100%",
        minHeight: 0,
        background: CONSULTING_FRAME_BG,
      }}
    >
      {/* Row 1 Col 1 — WINSTON brand cell */}
      <LeftSidebar
        mode="brand"
        brand={winstonBrand}
        sections={sections}
        activeKey={activeKey}
      />

      {/* Row 1 Col 2 — shared 52px header; page supplies its own content */}
      <div
        style={{
          height: CONSULTING_HEADER_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: CONSULTING_FRAME_BG,
          minWidth: 0,
        }}
      >
        {headerContent}
      </div>

      {/* Row 1 Col 3 — optional right rail header spacer (keeps grid square) */}
      {rightRail ? (
        <div
          style={{
            height: CONSULTING_HEADER_HEIGHT,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: CONSULTING_FRAME_BG,
          }}
        />
      ) : null}

      {/* Row 2 Col 1 — nav */}
      <LeftSidebar mode="nav" sections={sections} activeKey={activeKey} />

      {/* Row 2 Col 2 — page body */}
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "#dce6f0",
        }}
      >
        {children}
      </div>

      {/* Row 2 Col 3 — optional right rail body */}
      {rightRail ? (
        <div style={{ minHeight: 0, overflow: "hidden" }}>{rightRail}</div>
      ) : null}
    </div>
  );
}
