// With no bridge URL configured (the production-without-env-var case), the
// console must render the explicit diagnostic and construct no EventSource —
// not silently try localhost. next/dynamic is mocked null in the vitest config,
// so the 3D/recharts panels never mount and the early return is what renders.

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StargateConsole from "./StargateConsole";

class MockEventSource {
  static instances: MockEventSource[] = [];
  close = vi.fn();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("StargateConsole without a configured bridge", () => {
  it("renders the not-configured diagnostic and connects to nothing", () => {
    render(<StargateConsole />);
    expect(
      screen.getByText("Stargate bridge URL is not configured for this deployment."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Set NEXT_PUBLIC_STARGATE_BRIDGE_URL to the Railway bridge endpoint."),
    ).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
