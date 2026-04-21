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
};

export function LeftSidebar({
  brand,
  sections,
  activeKey,
  onBack,
  width = 240,
  footer,
}: LeftSidebarProps) {
  return (
    <aside
      style={{
        width,
        flex: "none",
        background: "var(--bg-void)",
        borderRight: "1px solid var(--line-2)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--line-2)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 52,
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
              border: "1px solid var(--line-2)",
              color: "var(--fg-2)",
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
      <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 0" }}>
        {sections.map((sec, idx) => (
          <div
            key={idx}
            style={{
              paddingTop: idx === 0 ? 0 : 10,
              paddingBottom: 6,
              borderTop: idx === 0 ? "none" : "1px solid var(--line-1)",
              marginTop: idx === 0 ? 0 : 4,
            }}
          >
            {sec.label && (
              <div
                style={{
                  padding: "4px 14px 6px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
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
                      padding: "7px 14px",
                      borderLeft: active
                        ? "2px solid var(--neon-cyan)"
                        : "2px solid transparent",
                      background: active ? "rgba(0,229,255,.06)" : "transparent",
                      color: disabled
                        ? "var(--fg-4)"
                        : active
                        ? "var(--fg-1)"
                        : "var(--fg-2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: ".04em",
                      cursor: disabled ? "not-allowed" : "pointer",
                      transition: "background 80ms, color 80ms",
                    }}
                  >
                    <span>{item.label}</span>
                    {item.badge != null && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 2,
                          border: "1px solid var(--line-2)",
                          color: "var(--fg-3)",
                          background: "var(--bg-inset)",
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
                    <Link href={item.href} style={{ textDecoration: "none", border: 0 }}>
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
            borderTop: "1px solid var(--line-2)",
            padding: "10px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
          }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}
