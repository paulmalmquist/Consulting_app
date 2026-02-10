// Demo Lab API base URL.
//
// In production, default to same-origin so Vercel can proxy `/v1/*` via a route
// handler (`src/app/v1/[...path]/route.ts`). This avoids hardcoding `localhost`
// and also avoids frontend CORS configuration.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

type ApiOptions = RequestInit & { params?: Record<string, string | undefined> };

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  if (!API_BASE_URL) {
    throw new Error(
      "Demo Lab API is not configured. Set NEXT_PUBLIC_DEMO_API_BASE_URL (direct) or configure the /v1 proxy via DEMO_API_ORIGIN."
    );
  }

  const url = new URL(path, API_BASE_URL);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
