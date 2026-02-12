export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "bm_theme_mode";

export function resolveThemeMode(value: string | null | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  return resolveThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
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
