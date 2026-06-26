import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OverviewBackdrop from "./OverviewBackdrop";
import { THEME_BACKDROPS } from "./context/BottleneckMap/data";
import type { DecoratedEvent, InnovationKey } from "./context/BottleneckMap/types";

// Only the innovation `type` drives the backdrop; build a minimal event for the unit test.
const ev = (type: InnovationKey): DecoratedEvent => ({ type } as unknown as DecoratedEvent);

describe("OverviewBackdrop (Phase 9B)", () => {
  it("renders the resolved era backdrop with its accessible label, image, and honesty caption", () => {
    render(<OverviewBackdrop event={ev("mission")} />);
    const layer = screen.getByRole("img", { name: THEME_BACKDROPS.mission.alt });
    expect(layer.style.backgroundImage).toContain("/telemetry/backdrops/mission.svg");
    expect(screen.getByText(/Backdrop: illustrative · generative asset/i)).toBeInTheDocument();
  });

  it("changes backdrop metadata when the selected event's era changes", () => {
    const { rerender } = render(<OverviewBackdrop event={ev("mission")} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(THEME_BACKDROPS.mission.alt);
    rerender(<OverviewBackdrop event={ev("dataops")} />);
    const layer = screen.getByRole("img");
    expect(layer.getAttribute("aria-label")).toBe(THEME_BACKDROPS.dataops.alt);
    expect(layer.style.backgroundImage).toContain("/telemetry/backdrops/dataops.svg");
  });

  it("falls back safely with no event — no image layer, no broken image, no caption", () => {
    const { container } = render(<OverviewBackdrop event={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/Backdrop:/)).toBeNull();
    expect(container.innerHTML).not.toContain("/telemetry/backdrops/");
    expect(container.innerHTML).not.toContain('url("")');
  });

  it("keeps the fade decorative — content renders independent of motion (reduced-motion safe)", () => {
    render(<OverviewBackdrop event={ev("reuse")} />);
    const layer = screen.getByRole("img", { name: THEME_BACKDROPS.reuse.alt });
    // The transition is a CSS class the prefers-reduced-motion media query neutralizes; the alt/content
    // do not depend on it.
    expect(layer.className).toMatch(/backdropFade/);
    expect(screen.getByText(/Backdrop: illustrative · generative asset/i)).toBeInTheDocument();
  });
});
