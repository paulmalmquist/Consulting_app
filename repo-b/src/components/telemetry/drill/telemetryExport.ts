// Same-origin URL for the server XLSX export route (Phase 8 / PR 8A). The route is
// proxied to the backend through /api/telemetry/[...path]; the backend allowlists the
// dataset, scopes by env/business, and bounds the row count. We only build the URL —
// the backend owns safety. Returns null when the tenant context is missing (the button
// then renders disabled with a reason, never a broken download).

export function exportXlsxUrl(
  dataset: string,
  params: { envId: string | null | undefined; businessId: string | null | undefined; limit?: number },
): string | null {
  if (!dataset || !params.envId || !params.businessId) return null;
  const q = new URLSearchParams({ env_id: params.envId, business_id: params.businessId });
  if (params.limit) q.set("limit", String(params.limit));
  return `/api/telemetry/export/${encodeURIComponent(dataset)}.xlsx?${q.toString()}`;
}
