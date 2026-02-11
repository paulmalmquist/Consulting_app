"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/cn";

export type LabTheme = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

type LabThemeContextValue = {
  theme: LabTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: LabTheme) => void;
};

const STORAGE_KEY = "theme";
const LabThemeContext = createContext<LabThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function LabThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<LabTheme>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
    setSystemTheme(getSystemTheme());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;

    return () => {
      root.classList.remove("light", "dark");
      root.style.removeProperty("color-scheme");
    };
  }, [resolvedTheme]);

  const setTheme = useCallback((nextTheme: LabTheme) => {
    setThemeState(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <LabThemeContext.Provider value={value}>
      <div
        className={cn(
          "lab-theme-scope lab-readable",
          resolvedTheme === "light" ? "lab-theme-light" : "lab-theme-dark"
        )}
      >
        {children}
      </div>
    </LabThemeContext.Provider>
  );
}

export function useLabTheme() {
  const context = useContext(LabThemeContext);
  if (!context) {
    throw new Error("useLabTheme must be used within LabThemeProvider");
  }
  return context;
}

