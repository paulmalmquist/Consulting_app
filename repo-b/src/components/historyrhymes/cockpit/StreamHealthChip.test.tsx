import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamHealthChip } from "./StreamHealthChip";
import type { StreamHealth } from "@/lib/historyrhymes/client";

function health(overrides: Partial<StreamHealth>): StreamHealth {
  return {
    mode: "synthetic",
    provider: null,
    status: "connected",
    consumer_group: "hr-cockpit-dev",
    topic_prefix: "hr.dev",
    latest_event_at: "2026-06-12T14:30:00Z",
    lag_seconds: 4,
    degraded_reason: null,
    ...overrides,
  };
}

describe("StreamHealthChip", () => {
  it("labels every backend status explicitly", () => {
    const cases: [StreamHealth["status"], string][] = [
      ["connected", "stream: synthetic"],
      ["delayed", "stream: synthetic · delayed"],
      ["replaying", "stream: replaying"],
      ["disconnected", "stream: synthetic · disconnected"],
      ["not_configured", "stream: not configured"],
    ];
    for (const [status, label] of cases) {
      const { unmount } = render(<StreamHealthChip health={health({ status })} />);
      const chip = screen.getByTestId("hr-stream-chip");
      expect(chip.getAttribute("data-state")).toBe(status);
      expect(chip.textContent).toContain(label);
      unmount();
    }
  });

  it("renders null health as an explicit unreachable state", () => {
    render(<StreamHealthChip health={null} />);
    const chip = screen.getByTestId("hr-stream-chip");
    expect(chip.getAttribute("data-state")).toBe("unreachable");
    expect(chip.textContent).toContain("stream health: unreachable");
  });

  it("surfaces the degraded reason text", () => {
    render(
      <StreamHealthChip
        health={health({ status: "disconnected", degraded_reason: "live_kafka consumer not implemented (PR 11-13 pending)" })}
      />,
    );
    expect(screen.getByTestId("hr-stream-chip-reason").textContent).toContain("not implemented");
  });
});
