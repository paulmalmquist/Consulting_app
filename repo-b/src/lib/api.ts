// Demo Lab API base URL.
//
// In production, default to same-origin so Vercel can proxy `/v1/*` via a route
// handler (`src/app/v1/[...path]/route.ts`). This avoids hardcoding `localhost`
// and also avoids frontend CORS configuration.
export const API_BASE_URL =
  (() => {
    const configured =
      process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";

    // Guardrail: if a production deploy accidentally has a localhost base URL
    // configured, ignore it and use same-origin so the `/v1/*` proxy works.
    if (typeof window !== "undefined") {
      const isLocalHost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const looksLocalApi =
        configured.includes("localhost") || configured.includes("127.0.0.1");

      if (!configured) return window.location.origin;
      if (!isLocalHost && looksLocalApi) return window.location.origin;
    }

    return configured || (typeof window !== "undefined" ? window.location.origin : "");
  })();

type ApiOptions = RequestInit & { params?: Record<string, string | undefined> };

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  if (!API_BASE_URL) {
    throw new Error(
      "Demo Lab API is not configured. Set NEXT_PUBLIC_DEMO_API_BASE_URL (direct) or configure the /v1 proxy via DEMO_API_ORIGIN."
    );
  }

  const requestId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Math.random().toString(16).slice(2)}_${Date.now()}`);

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
    // eslint-disable-next-line no-console
    console.error("apiFetch network error", {
      requestId,
      url: url.toString(),
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err)
    });
    throw new Error(`Network error (req: ${requestId})`);
  }

  if (!response.ok) {
    let message = "Request failed";
    let debugBody: unknown = undefined;
    try {
      const payload = await response.json();
      debugBody = payload;
      message = payload.message || payload.detail || message;
    } catch {
      // ignore parse errors
    }
    // Client-side debugging (browser console); Vercel server logs are handled in the `/v1` proxy.
    // eslint-disable-next-line no-console
    console.error("apiFetch failed", {
      requestId,
      url: url.toString(),
      status: response.status,
      body: debugBody
    });
    throw new Error(`${message} (req: ${requestId})`);
  }

  return (await response.json()) as T;
}
