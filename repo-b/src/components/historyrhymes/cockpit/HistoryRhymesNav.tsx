"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./primitives";
import { HR_NAV, hrHref, isHrItemActive } from "./hrNav";

// Rail navigation, rendered in the desktop rail and inside the mobile drawer
// (HistoryRhymesShell), so item height stays >=40px for touch.
export default function HistoryRhymesNav({ envId, onNavigate }: { envId: string; onNavigate?: () => void }) {
  const pathname = usePathname() || "";
  return (
    <nav data-testid="hr-nav" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {HR_NAV.map((n) => {
        const active = isHrItemActive(pathname, envId, n.slug);
        return (
          <Link key={n.slug || "cockpit"} href={hrHref(envId, n.slug)} onClick={onNavigate}
            data-testid={n.testId}
            aria-current={active ? "page" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none",
              minHeight: 40, padding: "9px 10px", borderRadius: 7,
              color: active ? C.text : C.dim,
              background: active ? "rgba(212,168,90,0.10)" : "transparent",
              boxShadow: active ? `inset 2px 0 0 ${C.accent}` : "none" }}>
            <span style={{ fontFamily: C.mono, fontSize: 12 }}>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
