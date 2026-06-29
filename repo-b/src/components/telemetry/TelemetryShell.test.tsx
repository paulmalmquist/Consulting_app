import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ envId: "env-1" }),
  usePathname: () => "/lab/env/env-1/telemetry",
}));

import TelemetryShell from "./TelemetryShell";

describe("TelemetryShell chrome", () => {
  it("drops the 'serving · prod' status + the visible 'Collapse' word, keeping an icon-only collapse control", () => {
    render(<TelemetryShell envId="env-1">content</TelemetryShell>);
    expect(screen.queryByText(/serving/i)).toBeNull();
    expect(screen.queryByText(/reviewer access/i)).toBeNull();
    expect(screen.queryByText(/^Collapse$/)).toBeNull();
    // The collapse affordance remains, icon-only, with its accessible name on aria-label.
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
