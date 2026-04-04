// Lab browser API base.
//
// All browser requests resolve through same-origin route handlers which
// forward to the canonical FastAPI backend. Single code path for local
// dev and production.
import { winstonLoader } from "@/lib/loading-state";

export const API_BASE_URL =
  typeof window !== "undefined" ? window.location.origin : "";

type ApiOptions = RequestInit & { params?: Record<string, string | undefined> };

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  if (!API_BASE_URL) {
    throw new Error(
      "Lab API is not configured. Ensure the /v1 proxy is available via BOS_API_ORIGIN."
    );
  }

  const requestId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Math.random().toString(16).slice(2)}_${Date.now()}`);

  if (typeof window !== "undefined") winstonLoader.apiStart();

  const url = new URL(path, API_BASE_URL);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-bm-request-id": requestId,
        ...(options.headers || {})
      }
    });
  } catch (err) {
    if (typeof window !== "undefined") winstonLoader.apiEnd();
    // eslint-disable-next-line no-console
    console.error("apiFetch network error", {
      requestId,
      url: url.toString(),
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err)
    });
    throw new Error(`Network error (req: ${requestId})`);
  }

  if (!response.ok) {
    if (typeof window !== "undefined") winstonLoader.apiEnd();
    let message = "Request failed";
    let debugBody: unknown = undefined;
    const contentType = response.headers.get("content-type") || "";
    const responseClone = response.clone();
    try {
      const payload = await response.json();
      debugBody = payload;
      const raw = payload.message || payload.detail || message;
      message = typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      try {
        const snippet = (await responseClone.text()).slice(0, 220);
        debugBody = { content_type: contentType || null, body_snippet: snippet };
        if (
          contentType.includes("text/html") &&
          (response.status === 404 || response.status === 405)
        ) {
          message =
            "API route is not available in this deployment. Check the canonical backend /v1 proxy or NEXT_PUBLIC_*_API_BASE_URL settings.";
        }
      } catch {
        // ignore parse errors
      }
    }
    // Client-side debugging (browser console); Vercel server logs are handled in the `/v1` proxy.
    // eslint-disable-next-line no-console
    console.error("apiFetch failed", {
      requestId,
      url: url.toString(),
      status: response.status,
      contentType,
      body: debugBody
    });
    throw new Error(`${message} (req: ${requestId})`);
  }

  const result = (await response.json()) as T;
  if (typeof window !== "undefined") winstonLoader.apiEnd();
  return result;
}
