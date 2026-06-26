import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";

import TelemetrySidebar from "./TelemetrySidebar";
import { TELEMETRY_NAV, TELEMETRY_NAV_GROUPS, telemetryHref } from "./telemetryNav";

afterEach(() => { vi.mocked(usePathname).mockReturnValue("/"); });

// Expand every collapsed accordion group so all child links are in the DOM (Operations is already open).
function expandAllGroups() {
  for (const btn of screen.getAllByRole("button")) {
    if (btn.getAttribute("aria-expanded") === "false") fireEvent.click(btn);
  }
}

describe("TelemetrySidebar — grouped collapsible icon rail (Phase 9B)", () => {
  it("renders every nav group as a row", () => {
    render(<TelemetrySidebar envId="env-1" />);
    for (const group of TELEMETRY_NAV_GROUPS) {
      expect(screen.getAllByText(group).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("opens Operations by default and keeps other multi-item groups collapsed", () => {
    render(<TelemetrySidebar envId="env-1" />);
    expect(screen.getByRole("link", { name: /^Mission Control$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Model Performance$/i })).toBeNull();
  });

  it("toggles a group's children when its row is clicked", () => {
    render(<TelemetrySidebar envId="env-1" />);
    const groupBtn = screen.getByRole("button", { name: /Models & Intelligence/i });
    expect(groupBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(groupBtn);
    expect(groupBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /^Model Performance$/i })).toBeInTheDocument();
    fireEvent.click(groupBtn);
    expect(screen.queryByRole("link", { name: /^Model Performance$/i })).toBeNull();
  });

  it("renders single-item groups as direct links (Overview, Agent Operations)", () => {
    render(<TelemetrySidebar envId="env-1" />);
    expect(screen.getByRole("link", { name: /^Overview$/i }))
      .toHaveAttribute("href", telemetryHref("env-1", ""));
    expect(screen.getByRole("link", { name: /^Agent Operations$/i }))
      .toHaveAttribute("href", telemetryHref("env-1", "control-tower"));
  });

  it("keeps every nav surface routable once its group is expanded (no slug dropped)", () => {
    render(<TelemetrySidebar envId="env-1" />);
    expandAllGroups();
    const hrefs = new Set(screen.getAllByRole("link").map((l) => l.getAttribute("href")));
    for (const item of TELEMETRY_NAV) {
      expect(hrefs.has(telemetryHref("env-1", item.slug))).toBe(true);
    }
  });

  it("marks the active item with aria-current", () => {
    vi.mocked(usePathname).mockReturnValue("/lab/env/env-1/telemetry/replay");
    render(<TelemetrySidebar envId="env-1" />);
    expect(screen.getByRole("link", { name: /^Replay$/i })).toHaveAttribute("aria-current", "page");
  });

  it("collapsed mode shows only group icon buttons — no labels, no links — and asks to expand on click", () => {
    const onExpandRequest = vi.fn();
    render(<TelemetrySidebar envId="env-1" collapsed onExpandRequest={onExpandRequest} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByText(/^Mission Control$/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Expand sidebar and open Operations/i }));
    expect(onExpandRequest).toHaveBeenCalledWith("Operations");
  });

  it("no longer renders the Automated Data Engineering rail cross-link (8H — telemetry-only rail)", () => {
    render(<TelemetrySidebar envId="env-1" />);
    expect(screen.queryByRole("link", { name: /Automated Data Engineering/i })).toBeNull();
  });
});
