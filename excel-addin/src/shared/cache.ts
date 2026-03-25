import { DEFAULT_TTL_SECONDS } from "./constants";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function buildCacheKey(method: string, url: string, body?: unknown): string {
  const serializedBody = body ? JSON.stringify(body) : "";
  return `${method.toUpperCase()}|${url}|${serializedBody}`;
}

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL_SECONDS): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function clearCache(): void {
  cache.clear();
}
