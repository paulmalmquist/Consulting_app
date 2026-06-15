// Guards the production defect: a deployed page must not silently connect to
// the visitor's own localhost. bridgeBaseUrl resolves fail-closed, and the hook
// creates no EventSource when there is no URL. (jsdom has no EventSource, so a
// mock both exercises the connect path and proves the unconfigured path never
// touches it.)

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bridgeBaseUrl, useStargateStream } from "./stargateStream";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bridgeBaseUrl", () => {
  it("returns the configured value verbatim when set", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "https://bridge.example.com");
    expect(bridgeBaseUrl()).toBe("https://bridge.example.com");
  });

  it("falls back to localhost only in development", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(bridgeBaseUrl()).toBe("http://localhost:8100");
  });

  it("returns null in production when unset (fail closed)", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(bridgeBaseUrl()).toBeNull();
  });

  it("returns null under the vitest test env when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
    expect(bridgeBaseUrl()).toBeNull();
  });
});

describe("useStargateStream", () => {
  it("does not create an EventSource when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
    const { result, unmount } = renderHook(() => useStargateStream());
    expect(result.current.configured).toBe(false);
    expect(result.current.connected).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
    unmount();
  });

  it("connects exactly once to <base>/stargate/stream when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "https://bridge.example.com");
    const { result, unmount } = renderHook(() => useStargateStream());
    expect(result.current.configured).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("https://bridge.example.com/stargate/stream");
    unmount();
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it("honors an explicit baseUrl argument over the env", () => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
    const { result } = renderHook(() => useStargateStream("https://explicit.example.com"));
    expect(result.current.configured).toBe(true);
    expect(MockEventSource.instances[0].url).toBe("https://explicit.example.com/stargate/stream");
  });
});
