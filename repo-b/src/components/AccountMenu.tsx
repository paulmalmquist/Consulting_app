"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { logoutPlatformSession } from "@/lib/platformSessionClient";
import {
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  type ThemeMode,
} from "@/lib/theme";

export default function AccountMenu({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("dark");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMode(getStoredThemeMode());
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function toggleTheme() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyThemeMode(next);
    persistThemeMode(next);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-white/[0.07] text-white/72 transition-[background-color,border-color,color] duration-150 hover:border-white/22 hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <User size={18} strokeWidth={1.75} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[188px] overflow-hidden rounded-2xl border border-white/12 bg-[rgba(8,10,15,0.96)] shadow-2xl backdrop-blur-xl"
        >
          {/* Theme toggle */}
          <button
            type="button"
            role="menuitem"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white/80 transition-colors duration-100 hover:bg-white/[0.07] hover:text-white"
          >
            {mode === "dark" ? (
              <Sun size={15} strokeWidth={1.75} className="shrink-0 text-white/52" />
            ) : (
              <Moon size={15} strokeWidth={1.75} className="shrink-0 text-white/52" />
            )}
            <span>{mode === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>

          {/* Settings — placeholder */}
          <button
            type="button"
            role="menuitem"
            disabled
            className="flex w-full cursor-not-allowed items-center gap-3 px-4 py-3 text-sm text-white/32"
          >
            <Settings size={15} strokeWidth={1.75} className="shrink-0" />
            <span>Settings</span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-white/26">Soon</span>
          </button>

          <div className="mx-3 my-1 border-t border-white/10" />

          {/* Sign out */}
          <button
            type="button"
            role="menuitem"
            onClick={() => void logoutPlatformSession()}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white/80 transition-colors duration-100 hover:bg-white/[0.07] hover:text-white"
          >
            <LogOut size={15} strokeWidth={1.75} className="shrink-0 text-white/52" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
