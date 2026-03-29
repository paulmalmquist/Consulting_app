"use client";

type ClientEnvironmentSummary = {
  env_id: string;
  env_slug: string;
  business_id?: string | null;
};

const ENV_STORAGE_KEY = "demo_lab_env_id";
const BUSINESS_STORAGE_KEY = "bos_business_id";
const ENV_BUSINESS_MAP_KEY = "bm_env_business_map";

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

export function clearLegacyEnvironmentClientState() {
  window.localStorage.removeItem(ENV_STORAGE_KEY);
  window.localStorage.removeItem(BUSINESS_STORAGE_KEY);
  window.localStorage.removeItem(ENV_BUSINESS_MAP_KEY);
  clearCookie("demo_lab_env_id");
  clearCookie("bm_env_slug");
}

export function applyEnvironmentClientState(environment: ClientEnvironmentSummary | null | undefined) {
  clearLegacyEnvironmentClientState();
  if (!environment) return;

  window.localStorage.setItem(ENV_STORAGE_KEY, environment.env_id);
  setCookie("demo_lab_env_id", environment.env_id);
  setCookie("bm_env_slug", environment.env_slug);
  if (environment.business_id) {
    window.localStorage.setItem(BUSINESS_STORAGE_KEY, environment.business_id);
  }
}

export async function logoutPlatformSession() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  const payload = (await response.json().catch(() => ({}))) as { redirectTo?: string };
  clearLegacyEnvironmentClientState();
  window.location.assign(payload.redirectTo || "/");
}

export async function switchPlatformEnvironment(target: { environmentSlug?: string; envId?: string }) {
  const response = await fetch("/api/auth/switch-environment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    redirectTo?: string;
    activeEnvironment?: ClientEnvironmentSummary;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Failed to switch environment");
  }
  applyEnvironmentClientState(payload.activeEnvironment || null);
  window.location.assign(payload.redirectTo || "/");
}
