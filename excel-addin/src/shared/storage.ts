import { STORAGE_KEYS } from "./constants";

function hasOfficeStorage(): boolean {
  return typeof OfficeRuntime !== "undefined" && !!OfficeRuntime.storage;
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (hasOfficeStorage()) {
    return OfficeRuntime.storage.getItem(key);
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return null;
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (hasOfficeStorage()) {
    await OfficeRuntime.storage.setItem(key, value);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  }
}

export async function removeStorageItem(key: string): Promise<void> {
  if (hasOfficeStorage()) {
    await OfficeRuntime.storage.removeItem(key);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
  }
}

export async function getStorageJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getStorageItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setStorageJson<T>(key: string, value: T): Promise<void> {
  await setStorageItem(key, JSON.stringify(value));
}

export async function getAccessToken(): Promise<string> {
  return (await getStorageItem(STORAGE_KEYS.accessToken)) ?? "";
}

export async function setAccessToken(token: string): Promise<void> {
  await setStorageItem(STORAGE_KEYS.accessToken, token);
}

export async function clearAccessToken(): Promise<void> {
  await removeStorageItem(STORAGE_KEYS.accessToken);
}
