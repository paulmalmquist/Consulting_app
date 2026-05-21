import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTimeoutSignal,
  DEFAULT_FETCH_TIMEOUT_MS,
  FetchTimeoutError,
  isAbortError,
  isFetchTimeoutError,
} from "@/lib/fetchTimeout";
import { apiFetch } from "@/lib/api";

describe("createTimeoutSignal — timeoutMs contract", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undefined falls back to the helper default", () => {
    const { signal, timeoutMs, clear } = createTimeoutSignal(undefined, DEFAULT_FETCH_TIMEOUT_MS);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(timeoutMs).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    clear();
  });

  it("a positive number is used verbatim", () => {
    const { signal, timeoutMs, clear } = createTimeoutSignal(1234, DEFAULT_FETCH_TIMEOUT_MS);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(timeoutMs).toBe(1234);
    clear();
  });

  it("null disables the timeout (no signal)", () => {
    const { signal, timeoutMs } = createTimeoutSignal(null, DEFAULT_FETCH_TIMEOUT_MS);
    expect(signal).toBeUndefined();
    expect(timeoutMs).toBeNull();
  });

  it("0 disables the timeout (no signal)", () => {
    const { signal } = createTimeoutSignal(0, DEFAULT_FETCH_TIMEOUT_MS);
    expect(signal).toBeUndefined();
  });

  it("a null fallback means undefined disables the timeout", () => {
    const { signal } = createTimeoutSignal(undefined, null);
    expect(signal).toBeUndefined();
  });

  it("the signal aborts once the timeout elapses", () => {
    vi.useFakeTimers();
    const { signal } = createTimeoutSignal(1000, DEFAULT_FETCH_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal?.aborted).toBe(true);
  });

  it("clear() prevents the signal from aborting", () => {
    vi.useFakeTimers();
    const { signal, clear } = createTimeoutSignal(1000, DEFAULT_FETCH_TIMEOUT_MS);
    clear();
    vi.advanceTimersByTime(5000);
    expect(signal?.aborted).toBe(false);
  });
});

describe("FetchTimeoutError classification", () => {
  it("isFetchTimeoutError matches the class instance", () => {
    expect(isFetchTimeoutError(new FetchTimeoutError("x", 30000))).toBe(true);
  });

  it("isFetchTimeoutError matches a duck-typed timeout error", () => {
    expect(isFetchTimeoutError({ isTimeout: true })).toBe(true);
  });

  it("isFetchTimeoutError rejects a plain error", () => {
    expect(isFetchTimeoutError(new Error("network"))).toBe(false);
  });

  it("isAbortError matches an AbortError-shaped value", () => {
    expect(isAbortError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(true);
  });

  it("isAbortError rejects a plain error", () => {
    expect(isAbortError(new Error("network"))).toBe(false);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
    clone() {
      return this;
    },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A fetch that never resolves on its own but rejects with AbortError when its signal fires. */
function hangingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
        });
      }
    });
  }) as unknown as typeof fetch;
}

describe("apiFetch timeout integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves normally for a fast response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: 1 })) as unknown as typeof fetch);
    await expect(apiFetch("/v1/ping")).resolves.toEqual({ ok: 1 });
  });

  it("throws FetchTimeoutError after the default 30s timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const promise = apiFetch("/v1/hang");
    const assertion = expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS);
    await assertion;
  });

  it("throws FetchTimeoutError after an explicit short timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const promise = apiFetch("/v1/hang", { timeoutMs: 100 });
    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("does not abort when timeoutMs is null", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const promise = apiFetch("/v1/hang", { timeoutMs: null }).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS * 3);
    expect(settled).toBe(false);
    void promise.catch(() => {});
  });
});
