import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapTipBody } from "./MapPanel";
import { EVENTS } from "./data";
import type { DecoratedEvent } from "./types";

// MapTipBody is the pure tooltip body for a hovered/selected milestone — unit-tested directly so the
// launch-attempt + commercial/government rows (and their fail-closed behavior) are covered without
// driving SVG hover.
const decorate = (id: string): DecoratedEvent => {
  const e = EVENTS.find((ev) => ev.id === id)!;
  return { ...e, color: "#6CA8F0", dimLabel: "Mission achievement", sizeValue: e.scale };
};

describe("MapTipBody", () => {
  it("renders launch attempts + commercial/government share when the event's year has data", () => {
    render(<MapTipBody event={decorate("sputnik")} />);
    expect(screen.getByText(/World attempts 1957/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Commercial 0%/)).toBeInTheDocument();
    expect(screen.getByText(/Government 100%/)).toBeInTheDocument();
  });

  it("fails closed with 'Year context: not available' when the year has no cadence data", () => {
    render(<MapTipBody event={decorate("terranR")} />);
    expect(screen.getByText(/Year context: not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Commercial/)).toBeNull();
    expect(screen.queryByText(/Government/)).toBeNull();
  });
});
