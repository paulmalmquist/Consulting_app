function buildDashboardStorageNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  return Math.random().toString(36).slice(2, 10);
}

export function createWinstonDashboardStorageKey(): string {
  return `winston_dashboard_${Date.now()}_${buildDashboardStorageNonce()}`;
}
