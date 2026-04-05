"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { logoutPlatformSession } from "@/lib/platformSessionClient";

/**
 * WINSTON umbrella menu — appears in the top shell strip on xl+ screens.
 *
 * The WINSTON wordmark is the trigger; clicking it opens a dropdown for
 * shell-level actions that apply across all environments:
 *   – Winston Hub (platform home)
 *   – Switch Environment (environment selector)
 *   – Sign out
 *
 * This is intentionally separate from page-local navigation (Funds,
 * Investments, Assets) which lives in TopUtilityNav.
 */
export function WinstonUmbrellaMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Winston menu"
        className="flex items-center gap-1 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bm-ring/50 rounded-sm"
      >
        <span className="font-command text-[10px] font-bold uppercase tracking-[0.24em] text-bm-muted2/50 hover:text-bm-muted2/80 transition-colors duration-fast">
          Winston
        </span>
        <ChevronDown
          size={9}
          strokeWidth={2.4}
          className={`text-bm-muted2/40 transition-transform duration-fast ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 min-w-[168px] rounded-md border border-bm-border/40 bg-bm-surface shadow-[0_4px_16px_rgba(0,0,0,0.35)] py-1"
        >
          <UmbrellaItem href="/app" onClick={() => setOpen(false)}>
            Winston Hub
          </UmbrellaItem>
          <UmbrellaItem href="/app" onClick={() => setOpen(false)}>
            Switch Environment
          </UmbrellaItem>
          <div className="my-1 border-t border-bm-border/30" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void logoutPlatformSession();
            }}
            className="w-full px-3 py-1.5 text-left text-[12px] text-bm-muted2 hover:bg-bm-surface/60 hover:text-bm-text transition-colors duration-fast"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function UmbrellaItem({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block px-3 py-1.5 text-[12px] text-bm-muted2 hover:bg-bm-surface/60 hover:text-bm-text transition-colors duration-fast"
    >
      {children}
    </Link>
  );
}
