// Demo Lab browser API base.
//
// `/v1/*` now resolves through the same-origin route handler in
// `src/app/v1/[...path]/route.ts`, which forwards to the canonical backend.
// Browser callers can still override the base URL, but the canonical runtime
// owner is `backend/`, not a separate Demo Lab service.
export const API_BASE_URL =
  (() => {
    const configuredRaw =
      process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";
    const configured =
      typeof window !== "undefined" && configuredRaw.startsWith("/")
        ? window.location.origin
        : configuredRaw.replace(/\/+$/, "");

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
      "Lab API is not configured. Set NEXT_PUBLIC_DEMO_API_BASE_URL (direct) or configure the /v1 proxy via BOS_API_ORIGIN / DEMO_API_ORIGIN."
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

  return (await response.json()) as T;
}
