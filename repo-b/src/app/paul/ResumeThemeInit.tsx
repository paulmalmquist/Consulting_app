"use client";

import { useEffect, useState } from "react";
import {
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  type ThemeMode,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * ResumeThemeInit — initializes theme on the public resume and renders
 * a visible sun/moon toggle in the top-right corner.
 *
 * Default: light mode (unless a saved preference exists).
 */
export default function ResumeThemeInit() {
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    // If user has a stored preference, use it. Otherwise default to light.
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(THEME_STORAGE_KEY)
      : null;
    const initial: ThemeMode = stored ? (stored === "dark" ? "dark" : "light") : "light";
    applyThemeMode(initial);
    setMode(initial);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyThemeMode(next);
    persistThemeMode(next);
  }

  // Don't render toggle until client-side mode is resolved
  if (mode === null) return null;

  return (
    <button
      type="button"
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "1px solid var(--ros-border-light, rgba(200,146,58,0.20))",
        background: "var(--ros-card-bg, rgba(16,12,8,0.65))",
        color: "var(--ros-text-muted, #d8c4a8)",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {mode === "dark" ? (
        // Sun icon — switch to light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon icon — switch to dark
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
