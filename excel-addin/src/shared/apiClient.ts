import { DEFAULT_SETTINGS, DEFAULT_TTL_SECONDS, STORAGE_KEYS } from "./constants";
import { buildCacheKey, getCached, setCached } from "./cache";
import { BMError, FormulaErrorCodes } from "./errors";
import { getAccessToken, getStorageItem } from "./storage";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  ttlSeconds?: number;
  forceRefresh?: boolean;
};

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 350;
const MAX_CONCURRENT_REQUESTS = 4;

let activeRequests = 0;
const requestQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    requestQueue.push(() => {
      activeRequests += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = requestQueue.shift();
  if (next) {
    next();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapHttpError(status: number, message: string): BMError {
  if (status === 401 || status === 403) {
    return new BMError(FormulaErrorCodes.auth, message || "Authentication failed");
  }
  if (status === 404) {
    return new BMError(FormulaErrorCodes.notFound, message || "Resource not found");
  }
  if (status === 429) {
    return new BMError(FormulaErrorCodes.rate, message || "Rate limited");
  }
  if (status === 400 || status === 422) {
    return new BMError(FormulaErrorCodes.validation, message || "Validation failed");
  }
  return new BMError(FormulaErrorCodes.unknown, message || "Request failed");
}

export async function getBaseApiUrl(): Promise<string> {
  const explicit = await getStorageItem(STORAGE_KEYS.apiBaseUrl);
  return (explicit || DEFAULT_SETTINGS.baseApiUrl).replace(/\/$/, "");
}

export async function setBaseApiUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/$/, "");
  if (!normalized) {
    return;
  }
  if (typeof OfficeRuntime !== "undefined" && OfficeRuntime.storage) {
    await OfficeRuntime.storage.setItem(STORAGE_KEYS.apiBaseUrl, normalized);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.apiBaseUrl, normalized);
}

export class BMApiClient {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const baseUrl = await getBaseApiUrl();
    const url = `${baseUrl}${path}`;

    const cacheKey = buildCacheKey(method, url, options.body);
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const canCache = method === "GET" || (method === "POST" && ttlSeconds > 0);

    if (canCache && !options.forceRefresh) {
      const cached = getCached<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    const token = await getAccessToken();

    await acquireSlot();
    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        try {
          const response = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
          });

          const body = await response.text();
          const payload = body ? (JSON.parse(body) as { detail?: string } & T) : ({} as T);

          if (!response.ok) {
            const message =
              typeof payload === "object" && payload !== null && "detail" in payload
                ? String(payload.detail)
                : `HTTP ${response.status}`;
            const mapped = mapHttpError(response.status, message);

            if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES - 1) {
              await sleep(BASE_BACKOFF_MS * 2 ** attempt);
              continue;
            }
            throw mapped;
          }

          if (canCache && ttlSeconds > 0) {
            setCached(cacheKey, payload, ttlSeconds);
          }

          return payload;
        } catch (err) {
          if (err instanceof BMError) {
            throw err;
          }
          if (attempt < MAX_RETRIES - 1) {
            await sleep(BASE_BACKOFF_MS * 2 ** attempt);
            continue;
          }
          throw new BMError(FormulaErrorCodes.network, "Network request failed");
        }
      }
    } finally {
      releaseSlot();
    }

    throw new BMError(FormulaErrorCodes.unknown, "Unexpected request failure");
  }

  async get<T>(path: string, ttlSeconds?: number, forceRefresh?: boolean): Promise<T> {
    return this.request<T>(path, { method: "GET", ttlSeconds, forceRefresh });
  }

  async post<T>(path: string, body: unknown, ttlSeconds?: number, forceRefresh?: boolean): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body,
      ttlSeconds,
      forceRefresh,
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body, ttlSeconds: 0 });
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "DELETE", body, ttlSeconds: 0 });
  }
}

export const bmApiClient = new BMApiClient();
