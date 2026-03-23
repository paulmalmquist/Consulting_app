type ApiFetchOptions = RequestInit & {
  params?: Record<string, string | undefined>;
};

function resolveApiBase(): string {
  const configuredRaw = process.env.NEXT_PUBLIC_DEMO_API_BASE_URL || "http://127.0.0.1:8001";
  if (typeof window === "undefined") {
    return configuredRaw.replace(/\/+$/, "");
  }

  const configured = configuredRaw.startsWith("/")
    ? window.location.origin
    : configuredRaw.replace(/\/+$/, "");
  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const looksLocalApi = configured.includes("localhost") || configured.includes("127.0.0.1");

  if (!configured || (!isLocalHost && looksLocalApi)) {
    return window.location.origin;
  }

  return configured;
}

export const API_BASE = resolveApiBase();

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  if (!API_BASE) {
    throw new Error(
      "Demo Lab API is not configured. Set NEXT_PUBLIC_DEMO_API_BASE_URL or configure the /v1 proxy."
    );
  }

  const requestId = makeRequestId();
  const url = new URL(path, API_BASE);

  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...options,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        "x-bm-request-id": requestId,
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(`Network error (req: ${requestId})`);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let message = "Request failed";

    try {
      const payload = await response.json();
      if (payload && typeof payload === "object") {
        const payloadMessage =
          (payload as Record<string, unknown>).message ||
          (payload as Record<string, unknown>).detail;
        if (typeof payloadMessage === "string") {
          message = payloadMessage;
        }
      }
    } catch {
      if (contentType.includes("text/html") && (response.status === 404 || response.status === 405)) {
        message =
          "API route is not available in this deployment. Check /v1 and /bos route handlers or NEXT_PUBLIC_*_API_BASE_URL settings.";
      }
    }

    throw new Error(`${message} (req: ${requestId})`);
  }

  return response.json() as Promise<T>;
}
