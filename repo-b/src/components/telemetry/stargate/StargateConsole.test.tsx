// With no bridge URL configured (the production-without-env-var case), the
// console must render the explicit diagnostic and construct no EventSource —
// not silently try localhost. next/dynamic is mocked null in the vitest config,
// so the 3D/recharts panels never mount and the early return is what renders.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("StargateConsole Start recorded capture control", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_STARGATE_BRIDGE_URL", "https://bridge.example");
  });

  it("renders the labeled control and restarts capture replay + reconnects SSE on click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<StargateConsole />);
    // One EventSource on mount.
    expect(MockEventSource.instances).toHaveLength(1);
    // The control is explicitly labeled recorded capture (never "live printer").
    const btn = screen.getByRole("button", { name: /start recorded capture/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "https://bridge.example/stargate/replay/cycle", { method: "POST" }),
    );
    // reconnect() opens a fresh EventSource so the restarted replay paints.
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(2));
  });

  it("surfaces a capture-mode-only message on 409 and does not imply a live feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<StargateConsole />);
    fireEvent.click(screen.getByRole("button", { name: /start recorded capture/i }));
    expect(await screen.findByText(/capture-mode only/i)).toBeInTheDocument();
  });
});
