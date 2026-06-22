import { render, screen } from "@testing-library/react";
import TelemetrySidebar from "./TelemetrySidebar";
import { TELEMETRY_NAV, TELEMETRY_NAV_GROUPS, telemetryHref } from "./telemetryNav";

// Render receipt for the 6-section restructure (ADO #692): the rail consumes the nav
// list, so this proves all six section headers and every item link render without error.
describe("TelemetrySidebar — 6-section rail", () => {
  it("renders all six section headers", () => {
    render(<TelemetrySidebar envId="env-1" />);
    for (const group of TELEMETRY_NAV_GROUPS) {
      // "Mission Summary" is both a section header and an item label, so allow >=1.
      expect(screen.getAllByText(group).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders a routable link for every nav item with the relabels applied", () => {
    render(<TelemetrySidebar envId="env-1" />);
    for (const item of TELEMETRY_NAV) {
      const links = screen.getAllByRole("link", { name: new RegExp(`^${item.label}$`, "i") });
      expect(links.some((l) => l.getAttribute("href") === telemetryHref("env-1", item.slug))).toBe(true);
    }
    // The four redesign relabels are present as links.
    for (const label of ["Mission Summary", "Agent Control Tower", "Trust Center", "Flight Readiness"]) {
      expect(screen.getAllByRole("link", { name: new RegExp(`^${label}$`, "i") }).length).toBeGreaterThanOrEqual(1);
    }
  });
});
