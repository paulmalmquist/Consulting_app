"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export type LeftSidebarItem = {
  key: string;
  label: string;
  href: string;
  disabled?: boolean;
  badge?: string | number;
};

export type LeftSidebarSection = {
  label?: string;
  items: LeftSidebarItem[];
};

type LeftSidebarProps = {
  brand?: ReactNode;
  sections: LeftSidebarSection[];
  activeKey?: string;
  onBack?: () => void;
  width?: number;
  footer?: ReactNode;
  /**
   * "full" (default) renders the brand block + nav + footer in one aside.
   * "brand" renders only the 52px brand header — used in grid layouts where
   * the nav is rendered separately so it can be aligned with the center
   * column's content row.
   * "nav" renders only the nav + footer (no brand header, no top border) —
   * pair with "brand" in a CSS-grid layout.
   */
  mode?: "full" | "brand" | "nav";
};

// Hard-coded palette so the sidebar renders correctly in any context —
// not just inside [data-command-desk] where CSS tokens are scoped.
const SB = {
  bg: "rgba(10, 14, 20, 0.98)",
  border: "rgba(255,255,255,0.10)",
  sectionDivider: "rgba(255,255,255,0.07)",
  sectionLabel: "rgba(220,230,240,0.42)",
  itemInactive: "rgba(220,230,240,0.68)",
  itemHover: "rgba(255,255,255,0.92)",
  itemActive: "#ffffff",
  itemActiveBg: "rgba(0,220,255,0.10)",
  itemActiveBorder: "#00DCFF",
  itemDisabled: "rgba(255,255,255,0.22)",
  badgeBorder: "rgba(255,255,255,0.14)",
  badgeText: "rgba(220,230,240,0.50)",
  badgeBg: "rgba(255,255,255,0.04)",
  backBorder: "rgba(255,255,255,0.14)",
  backColor: "rgba(220,230,240,0.60)",
  footerText: "rgba(220,230,240,0.42)",
} as const;

export function LeftSidebar({
  brand,
  sections,
  activeKey,
  onBack,
  width = 240,
  footer,
  mode = "full",
}: LeftSidebarProps) {
  const showBrand = mode === "full" || mode === "brand";
  const showNav = mode === "full" || mode === "nav";
  return (
    <aside
      style={{
        width,
        minWidth: width,
        flexShrink: 0,
        background: SB.bg,
        borderRight: `1px solid ${SB.border}`,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        height: mode === "brand" ? 52 : "100%",
      }}
    >
      {showBrand && (
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${SB.border}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 52,
            height: mode === "brand" ? 52 : undefined,
            flex: "none",
          }}
        >
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title="Back to Operator"
              style={{
                background: "transparent",
                border: `1px solid ${SB.backBorder}`,
                color: SB.backColor,
                height: 24,
                width: 24,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              <ChevronLeft size={12} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>{brand}</div>
        </div>
      )}
      {showNav && (
        <>
          <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 0" }}>
            {sections.map((sec, idx) => (
              <div
                key={idx}
                style={{
                  paddingTop: idx === 0 ? 0 : 10,
                  paddingBottom: 6,
                  borderTop: idx === 0 ? "none" : `1px solid ${SB.sectionDivider}`,
                  marginTop: idx === 0 ? 0 : 4,
                }}
              >
                {sec.label && (
                  <div
                    style={{
                      padding: "4px 16px 7px",
                      fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                      fontSize: 10,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: SB.sectionLabel,
                    }}
                  >
                    {sec.label}
                  </div>
                )}
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {sec.items.map((item) => {
                    const active = item.key === activeKey;
                    const disabled = !!item.disabled;
                    const content = (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          height: 36,
                          padding: "0 16px",
                          borderLeft: active
                            ? `2px solid ${SB.itemActiveBorder}`
                            : "2px solid transparent",
                          background: active ? SB.itemActiveBg : "transparent",
                          color: disabled
                            ? SB.itemDisabled
                            : active
                            ? SB.itemActive
                            : SB.itemInactive,
                          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                          fontSize: 12,
                          letterSpacing: ".04em",
                          cursor: disabled ? "not-allowed" : "pointer",
                          transition: "background 80ms, color 80ms",
                        }}
                      >
                        <span>{item.label}</span>
                        {item.badge != null && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                              fontSize: 9,
                              padding: "1px 5px",
                              borderRadius: 2,
                              border: `1px solid ${SB.badgeBorder}`,
                              color: SB.badgeText,
                              background: SB.badgeBg,
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </span>
                    );
                    if (disabled) {
                      return (
                        <li key={item.key} aria-disabled="true">
                          {content}
                        </li>
                      );
                    }
                    return (
                      <li key={item.key}>
                        <Link href={item.href} style={{ textDecoration: "none", border: 0, display: "block" }}>
                          {content}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          {footer && (
            <div
              style={{
                flex: "none",
                borderTop: `1px solid ${SB.border}`,
                padding: "10px 16px",
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: 10,
                color: SB.footerText,
              }}
            >
              {footer}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
