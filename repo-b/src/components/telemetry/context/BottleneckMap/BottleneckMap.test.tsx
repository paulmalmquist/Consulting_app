import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import BottleneckMap from "./BottleneckMap";
import { EVENTS, EVENTS_CHRONO, FULL_WINDOW, YEAR_SERIES, shareAt } from "./data";

describe("static narrative data", () => {
  it("covers 1957-2026 with one row per year and a 16-event chronology", () => {
    expect(YEAR_SERIES).toHaveLength(2026 - 1957 + 1);
    expect(YEAR_SERIES[0].year).toBe(FULL_WINDOW[0]);
    expect(YEAR_SERIES[YEAR_SERIES.length - 1].year).toBe(FULL_WINDOW[1]);
    expect(EVENTS_CHRONO).toHaveLength(16);
    const years = EVENTS_CHRONO.map((e) => e.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it("interpolates commercial share between anchors and clamps outside them", () => {
    expect(shareAt(1950)).toBe(0);
    expect(shareAt(2030)).toBe(70);
    expect(shareAt(2022)).toBe(55);
    const mid = shareAt(2010.5);
    expect(mid).toBeGreaterThan(25);
    expect(mid).toBeLessThan(35);
  });

  it("keeps the Relativity figures labeled company-stated", () => {
    const terranR = EVENTS.find((e) => e.id === "terranR")!;
    expect(JSON.stringify(terranR.metrics)).toContain("company-stated");
  });
});

describe("BottleneckMap rendering", () => {
  it("renders the verbatim methodology footer", () => {
    // The Big Numbers band moved out of this module to the Overview thesis header; see
    // TelemetryOverview.test for the inline stats.
    render(<BottleneckMap />);
    expect(screen.getByText(/makes no\s+domain-expertise claims/)).toBeInTheDocument();
  });

  it("no longer renders an orientation strip or EventRecord cells — the node story lives in the page hero", () => {
    // The Play/Stop control and the selected-node story moved to the page hero; standalone the map keeps
    // its terran1 pin (a ring on the chart) but renders no "Selected: …" strip or explanation cards.
    render(<BottleneckMap />);
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.queryByText("What changed · bottleneck solved")).not.toBeInTheDocument();
    expect(screen.getByText(/makes no\s+domain-expertise claims/)).toBeInTheDocument();
  });

  it("enters presenter mode (keyboard P), steps with the on-screen controls, exits on Escape", () => {
    // The Play/Stop button now lives in the page hero (TelemetryOverview); the map's keyboard P still
    // starts the walkthrough, and the PresenterBanner carries the on-screen step controls.
    render(<BottleneckMap />);
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByText(/1 \/ 16/)).toBeInTheDocument();
    expect(screen.getByText(EVENTS_CHRONO[0].caption)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText(/2 \/ 16/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/2 \/ 16/)).not.toBeInTheDocument();
  });

  it("enters presenter mode on P but not while focus is in a form field", () => {
    const { container } = render(
      <div>
        <input aria-label="host field" />
        <BottleneckMap />
      </div>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "p" });
    expect(screen.queryByText(/1 \/ 16/)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByText(/1 \/ 16/)).toBeInTheDocument();
  });

  it("re-derives the legend chips when the color dimension toggles", () => {
    render(<BottleneckMap />);
    expect(screen.getByText("Mission achievement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Funding model" }));
    expect(screen.queryByText("Mission achievement")).not.toBeInTheDocument();
    expect(screen.getByText("Fixed-price commercial")).toBeInTheDocument();
  });
});
