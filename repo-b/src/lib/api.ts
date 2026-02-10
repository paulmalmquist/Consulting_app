export const API_BASE_URL =
  process.env.NEXT_PUBLIC_DEMO_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8001";

type ApiOptions = RequestInit & { params?: Record<string, string | undefined> };

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
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
