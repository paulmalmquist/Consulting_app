import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// This suite renders the REAL Bottleneck Map (recharts) so the load-bearing presenter→hero wiring is
// covered end to end: the walkthrough must drive the page hero, and Back/Escape must return to overview
// without the map re-emitting the presenter event. recharts mounts in jsdom via the ResizeObserver
// polyfill in src/test/setup.ts (same as BottleneckMap.test).
vi.mock("next/navigation", () => ({
  useParams: () => ({ envId: "env-test" }),
  usePathname: () => "/lab/env/env-test/telemetry",
}));

import TelemetryOverview from "./TelemetryOverview";
import { EVENTS_CHRONO } from "./context/BottleneckMap/data";

describe("TelemetryOverview — walkthrough drives the hero", () => {
  it("starts on the overview hero with no node pre-selected", () => {
    render(<TelemetryOverview />);
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
    // Controlled selectedId=null → the map does NOT fall back to its standalone terran1 pin.
    expect(screen.queryByRole("button", { name: "Back to overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Terran 1: Good Luck, Have Fun" })).not.toBeInTheDocument();
  });

  it("steps the hero with the presenter and returns to overview on Escape", () => {
    render(<TelemetryOverview />);

    // Play → the hero becomes the first chronological event and the Big Numbers row is replaced.
    fireEvent.click(screen.getByRole("button", { name: "Play story" }));
    expect(screen.getByRole("heading", { name: EVENTS_CHRONO[0].name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Why Launch Became A Data Problem" })).not.toBeInTheDocument();
    expect(screen.queryByText("Launch attempts")).not.toBeInTheDocument();

    // Advance → the hero follows to the next event.
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByRole("heading", { name: EVENTS_CHRONO[1].name })).toBeInTheDocument();

    // Escape stops the walkthrough and returns to the overview hero (no presenter re-emit).
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
  });

  it("returns to overview when Back to overview is pressed mid-walkthrough", () => {
    render(<TelemetryOverview />);
    fireEvent.click(screen.getByRole("button", { name: "Play story" }));
    expect(screen.getByRole("heading", { name: EVENTS_CHRONO[0].name })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByRole("heading", { name: "Why Launch Became A Data Problem" })).toBeInTheDocument();
    expect(screen.getByText("Launch attempts")).toBeInTheDocument();
    // The walkthrough stopped — its step counter is gone.
    expect(screen.queryByText(/1 \/ 16/)).not.toBeInTheDocument();
  });
});
