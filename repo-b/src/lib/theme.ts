export type ThemeMode = "dark" | "light";
export type ThemeAccent = "teal" | "blue";

export const THEME_STORAGE_KEY = "bm_theme_mode";
export const ACCENT_STORAGE_KEY = "bm_theme_accent";

export function resolveThemeMode(value: string | null | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return resolveThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function resolveThemeAccent(value: string | null | undefined): ThemeAccent {
  return value === "blue" ? "blue" : "teal";
}

export function getStoredThemeAccent(): ThemeAccent {
  if (typeof window === "undefined") return "teal";
  return resolveThemeAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY));
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export function persistThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function applyThemeAccent(accent: ThemeAccent) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = accent;
}

export function persistThemeAccent(accent: ThemeAccent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
}
