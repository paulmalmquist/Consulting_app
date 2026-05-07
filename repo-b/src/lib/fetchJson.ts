/**
 * fetchJson — small wrapper around fetch that raises on non-2xx responses
 * instead of silently returning the error JSON body.
 *
 * Why this exists:
 * Many lab dashboards used `fetch(url).then(r => r.json())` with no `r.ok`
 * check. When the API returned a 5xx, `r.json()` succeeded on the error
 * payload, and the dashboard's render path mistook it for data and routed
 * to the empty-state branch. Result: every backend failure looked like a
 * missing-data problem.
 *
 * See: docs/LAB_DASHBOARD_FETCH_AUDIT.md
 *
 * Usage:
 *   try {
 *     const data = await fetchJson<DashboardData>(`/api/.../dashboard?env_id=${envId}`);
 *     setData(data);
 *   } catch (err) {
 *     if (err instanceof ApiError) {
 *       setError(`API ${err.status}: ${describeBody(err.body)}`);
 *     } else {
 *       setError(String(err));
 *     }
 *   }
 */

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON or empty body — leave body null
  }

  if (!response.ok) {
    throw new ApiError(response.status, body, `${response.status} ${url}`);
  }

  return body as T;
}
